import os
from decimal import Decimal

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field, ValidationError

DUMMYJSON = os.getenv("DUMMYJSON_URL", "https://dummyjson.com")
mcp = FastMCP(
    "Catálogo de compras",
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=["mcp:8001", "localhost:*", "127.0.0.1:*"],
    ),
)
app = mcp.streamable_http_app()


class Produto(BaseModel):
    id: int = Field(gt=0)
    title: str = Field(min_length=1)
    category: str
    description: str
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0)


async def consultar(caminho: str, **params):
    try:
        async with httpx.AsyncClient(base_url=DUMMYJSON, timeout=5) as client:
            response = await client.get(caminho, params=params)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException:
        raise ValueError("A DummyJSON demorou a responder.") from None
    except (httpx.HTTPError, ValueError):
        raise ValueError("A DummyJSON está indisponível ou retornou dados inválidos.") from None


@mcp.tool()
async def buscar_produtos(termo: str) -> list[Produto]:
    """Busca produtos por termo no catálogo. Prefira palavras em inglês."""
    if not termo.strip() or len(termo) > 120:
        raise ValueError("Informe um termo de busca de até 120 caracteres.")
    dados = await consultar("/products/search", q=termo.strip(), limit=0)
    try:
        return [Produto.model_validate(item) for item in dados["products"]]
    except (KeyError, TypeError, ValidationError):
        raise ValueError("A DummyJSON retornou resultados inválidos.") from None


@mcp.tool()
async def detalhar_produto(id: int) -> Produto:
    """Consulta descrição, preço em USD e estoque atual de um produto pelo ID."""
    if id < 1:
        raise ValueError("O ID precisa ser positivo.")
    try:
        produto = Produto.model_validate(await consultar(f"/products/{id}"))
    except ValidationError:
        raise ValueError("A DummyJSON retornou um produto inválido.") from None
    if produto.id != id:
        raise ValueError("A DummyJSON retornou um produto com ID diferente do solicitado.")
    return produto
