# Agente de compras

O chat transforma um pedido em linguagem natural em uma requisição de compra com itens do catálogo DummyJSON.

## Rodar

1. Tenha Docker com Compose v2 em execução.
2. Copie `.env.example` para `.env` e preencha `OPENROUTER_API_KEY` com uma chave válida. `OPENROUTER_MODEL` permite escolher um modelo com suporte a ferramentas e permitido pelas regras da sua chave. O exemplo usa o Claude Haiku 5.5, com o qual o pedido dos laptops foi testado.
3. Rode `docker compose up --build` e abra [http://localhost:8080](http://localhost:8080).
4. Envie: **Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.**

A API está acessível na mesma origem do chat. `POST /requisicoes` recebe `{"pedido":"..."}`. Responde 201 ao criar, 200 com a lista de categorias ao consultar o catálogo geral, 200 com `status: pendente` quando faltar algo e 5xx quando um serviço falhar. `GET /requisicoes` lista as requisições gravadas. `docker compose down` preserva os dados no volume `compras`.

## Simular uma compra

Depois de receber o orçamento, confirme se deseja prosseguir, escolha Pix, débito, crédito ou boleto e clique em **Simular pagamento**. O Pix e o boleto exibem códigos fictícios. No crédito, escolha à vista ou de 2 a 5 parcelas sem juros. A simulação dispensa dados de cartão e não gera cobrança. Depois da confirmação, o chat oferece iniciar outro pedido na mesma conversa ou encerrar o atendimento. A abertura e cada nova oferta incluem laptops e duas categorias sorteadas do catálogo. Ao pedir a lista geral, o chat mostra todas as categorias retornadas pela DummyJSON.

A API registra a simulação via PUT /requisicoes/{id}/pagamento com os campos forma (pix, debito, credito ou boleto) e parcelas (1 por padrão, até 5 no crédito). Repetir a mesma confirmação retorna o registro existente. GET /requisicoes inclui o pagamento, quando houver.

## Testar o catálogo

```sh
docker compose run --build --rm --no-deps mcp python -m unittest discover -s tests -v
```

Os testes simulam respostas e timeout da DummyJSON. Não exigem internet durante a execução nem chave da OpenRouter.

## Decisões

- O backend descobre o esquema das ferramentas pelo MCP Streamable HTTP e oferece as ferramentas à OpenRouter. O modelo decide quais chamar e em que ordem.
- O backend usa o preço retornado por `detalhar_produto`, confere estoque e os limites em USD interpretados pelo modelo e calcula os totais com `Decimal`. A correspondência semântica e a interpretação do pedido dependem do modelo. Pedidos sem atendimento integral não são gravados.
- O backend cria o esquema na inicialização e grava a requisição e seus itens na mesma transação. O estoque reflete a consulta ao catálogo e não é reservado pela requisição.
- Para pedidos amplos, o backend resume os tipos e a faixa de preços dos itens em estoque encontrados no catálogo. O chat mantém até quatro mensagens anteriores enquanto o pedido aguarda esclarecimentos.
- O Nginx encaminha a API na mesma origem e somente o chat é publicado, na interface local.
- Usei o Codex para ler o case, estruturar e implementar a solução, criar os testes e preparar a documentação.

Referências: [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/tree/v1.26.0), [OpenRouter Tool Calling](https://openrouter.ai/docs/guides/features/tool-calling) e [DummyJSON Products](https://dummyjson.com/docs/products).
