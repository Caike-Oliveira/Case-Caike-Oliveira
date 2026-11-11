CREATE TABLE IF NOT EXISTS requisicoes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido text NOT NULL,
    moeda text NOT NULL CHECK (moeda = 'USD'),
    total numeric(20, 2) NOT NULL CHECK (total >= 0),
    criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requisicao_itens (
    requisicao_id bigint NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    produto_id integer NOT NULL CHECK (produto_id > 0),
    nome text NOT NULL,
    quantidade integer NOT NULL CHECK (quantidade > 0),
    preco_unitario numeric(12, 2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal numeric(20, 2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    PRIMARY KEY (requisicao_id, produto_id)
);
