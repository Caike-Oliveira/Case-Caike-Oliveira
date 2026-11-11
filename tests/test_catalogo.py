import unittest
from unittest.mock import patch

import httpx

from catalogo import buscar_produtos, detalhar_produto

PRODUTO = {
    "id": 42,
    "title": "Notebook",
    "description": "Notebook de 14 polegadas",
    "category": "laptops",
    "price": 1099.99,
    "stock": 5,
}


class TestCatalogo(unittest.IsolatedAsyncioTestCase):
    async def test_buscar_produtos(self):
        def responder(request):
            self.assertEqual(request.url.path, "/products/search")
            self.assertEqual(request.url.params["q"], "laptop 14")
            return httpx.Response(200, json={"products": [PRODUTO]})

        client = httpx.AsyncClient(base_url="https://catalogo.test", transport=httpx.MockTransport(responder))
        with patch("catalogo.httpx.AsyncClient", return_value=client):
            produtos = await buscar_produtos("laptop 14")
        self.assertEqual([produto.id for produto in produtos], [42])

    async def test_detalhar_produto(self):
        def responder(request):
            self.assertEqual(request.url.path, "/products/42")
            return httpx.Response(200, json=PRODUTO)

        client = httpx.AsyncClient(base_url="https://catalogo.test", transport=httpx.MockTransport(responder))
        with patch("catalogo.httpx.AsyncClient", return_value=client):
            produto = await detalhar_produto(42)
        self.assertEqual(produto.stock, 5)
        self.assertEqual(str(produto.price), "1099.99")

    async def test_timeout_do_catalogo(self):
        def responder(request):
            raise httpx.ReadTimeout("timeout", request=request)

        client = httpx.AsyncClient(base_url="https://catalogo.test", transport=httpx.MockTransport(responder))
        with patch("catalogo.httpx.AsyncClient", return_value=client):
            with self.assertRaisesRegex(ValueError, "demorou"):
                await buscar_produtos("laptop")
