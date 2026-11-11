import os
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Literal

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, Field, model_validator

from agente import FalhaAgente, executar
from catalogo import listar_categorias


async def conectar():
    return await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with await conectar() as conn:
        await conn.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))
    yield


app = FastAPI(title="Agente de compras", lifespan=lifespan)


class Pedido(BaseModel):
    pedido: str = Field(min_length=1, max_length=3000)
    contexto: list[str] = Field(default_factory=list, max_length=4)


class Pagamento(BaseModel):
    forma: Literal["pix", "debito", "credito", "boleto"]
    parcelas: int = Field(default=1, strict=True, ge=1, le=5)

    @model_validator(mode="after")
    def validar_parcelas(self):
        if self.forma != "credito" and self.parcelas > 1:
            raise ValueError("O parcelamento está disponível apenas no cartão de crédito.")
        return self


@app.exception_handler(psycopg.Error)
async def erro_banco(request: Request, exc: psycopg.Error):
    return JSONResponse({"detail": "O banco de dados está indisponível. Tente novamente."}, status_code=503)


@app.get("/saude")
async def saude():
    return {"status": "ok"}


@app.get("/catalogo/categorias")
async def categorias_catalogo():
    try:
        return await listar_categorias()
    except ValueError as erro:
        raise HTTPException(502, str(erro)) from None


@app.post("/requisicoes", status_code=201)
async def criar(body: Pedido):
    pedido = body.pedido.strip()
    if not pedido:
        raise HTTPException(422, "Digite seu pedido para continuar.")
    anteriores = [texto[:3000].strip() for texto in body.contexto if texto.strip()]
    if anteriores:
        historico = "\n".join(f"- {texto}" for texto in anteriores)
        pedido = f"Mensagens anteriores do usuário:\n{historico}\n\nMensagem atual do usuário:\n{pedido}"
    try:
        resultado, chamadas = await executar(pedido)
    except FalhaAgente as erro:
        raise HTTPException(erro.status, erro.mensagem) from None

    resultado["ferramentas"] = chamadas
    if resultado["status"] == "catalogo":
        resultado["categorias"] = await categorias_catalogo()
        return JSONResponse(resultado, status_code=200)
    if resultado["status"] == "pendente":
        return JSONResponse(resultado, status_code=200)

    async with await conectar() as conn:
        cursor = await conn.execute(
            "INSERT INTO requisicoes (pedido, moeda, total) VALUES (%s, %s, %s) RETURNING id, criada_em",
            (pedido, resultado["moeda"], resultado["total"]),
        )
        resultado.update(await cursor.fetchone())
        async with conn.cursor() as cursor:
            await cursor.executemany(
                """
                INSERT INTO requisicao_itens (requisicao_id, produto_id, nome, quantidade, preco_unitario)
                VALUES (%(requisicao_id)s, %(produto_id)s, %(nome)s, %(quantidade)s, %(preco_unitario)s)
                """,
                [dict(item, requisicao_id=resultado["id"]) for item in resultado["itens"]],
            )
    return jsonable_encoder(resultado, custom_encoder={Decimal: str})


@app.get("/requisicoes")
async def listar():
    async with await conectar() as conn:
        cursor = await conn.execute(
            """
            SELECT r.id, r.pedido, r.moeda, r.total, r.criada_em,
                   CASE WHEN p.requisicao_id IS NOT NULL THEN jsonb_build_object(
                       'status', 'simulado', 'forma', p.forma, 'parcelas', p.parcelas,
                       'registrado_em', p.registrado_em
                   ) END AS pagamento,
                   jsonb_agg(jsonb_build_object(
                       'produto_id', i.produto_id, 'nome', i.nome, 'quantidade', i.quantidade,
                       'preco_unitario', i.preco_unitario::text, 'subtotal', i.subtotal::text
                   ) ORDER BY i.produto_id) AS itens
            FROM requisicoes r
            JOIN requisicao_itens i ON i.requisicao_id = r.id
            LEFT JOIN pagamentos_simulados p ON p.requisicao_id = r.id
            GROUP BY r.id, p.requisicao_id
            ORDER BY r.id DESC
            """
        )
        linhas = await cursor.fetchall()
    return jsonable_encoder(linhas, custom_encoder={Decimal: str})


@app.put("/requisicoes/{requisicao_id}/pagamento")
async def simular_pagamento(requisicao_id: int, body: Pagamento):
    async with await conectar() as conn:
        cursor = await conn.execute(
            """
            INSERT INTO pagamentos_simulados (requisicao_id, forma, parcelas)
            SELECT id, %s, %s FROM requisicoes WHERE id = %s
            ON CONFLICT (requisicao_id) DO NOTHING
            RETURNING forma, parcelas, registrado_em
            """,
            (body.forma, body.parcelas, requisicao_id),
        )
        registro = await cursor.fetchone()
        if registro is None:
            cursor = await conn.execute(
                "SELECT forma, parcelas, registrado_em FROM pagamentos_simulados WHERE requisicao_id = %s",
                (requisicao_id,),
            )
            registro = await cursor.fetchone()
        if registro is None:
            raise HTTPException(404, "Requisição não encontrada.")
        if (registro["forma"], registro["parcelas"]) != (body.forma, body.parcelas):
            raise HTTPException(409, "A requisição já tem um pagamento simulado com outras condições.")
    return {"status": "simulado", "requisicao_id": requisicao_id, **registro}
