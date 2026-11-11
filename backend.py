import os
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from agente import FalhaAgente, executar


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


@app.exception_handler(psycopg.Error)
async def erro_banco(request: Request, exc: psycopg.Error):
    return JSONResponse({"detail": "O banco de dados está indisponível. Tente novamente."}, status_code=503)


@app.get("/saude")
async def saude():
    return {"status": "ok"}


@app.post("/requisicoes", status_code=201)
async def criar(body: Pedido):
    pedido = body.pedido.strip()
    if not pedido:
        raise HTTPException(422, "Digite seu pedido para continuar.")
    try:
        resultado, chamadas = await executar(pedido)
    except FalhaAgente as erro:
        raise HTTPException(erro.status, erro.mensagem) from None

    resultado["ferramentas"] = chamadas
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
                   jsonb_agg(jsonb_build_object(
                       'produto_id', i.produto_id, 'nome', i.nome, 'quantidade', i.quantidade,
                       'preco_unitario', i.preco_unitario::text, 'subtotal', i.subtotal::text
                   ) ORDER BY i.produto_id) AS itens
            FROM requisicoes r
            JOIN requisicao_itens i ON i.requisicao_id = r.id
            GROUP BY r.id
            ORDER BY r.id DESC
            """
        )
        linhas = await cursor.fetchall()
    return jsonable_encoder(linhas, custom_encoder={Decimal: str})
