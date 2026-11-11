import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const formasPagamento = {
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
};

function descricaoCredito(total, parcelas, moeda) {
  const [inteiro, fracao = ''] = String(total).split('.');
  const centavos = BigInt(inteiro) * 100n + BigInt(fracao.padEnd(2, '0'));
  const base = centavos / BigInt(parcelas);
  const resto = centavos % BigInt(parcelas);
  const formatar = valor => moeda.format(
    String(valor / 100n) + '.' + String(valor % 100n).padStart(2, '0')
  );
  if (parcelas === 1) return 'À vista: ' + formatar(centavos);
  if (resto === 0n) return parcelas + '× de ' + formatar(base);
  return parcelas + '× (' + (parcelas - 1) + ' de ' + formatar(base)
    + ' + última de ' + formatar(base + resto) + ')';
}

function Checkout({ id, total, moeda, iniciarPedido }) {
  const [prosseguir, setProsseguir] = useState(null);
  const [forma, setForma] = useState(null);
  const [parcelas, setParcelas] = useState(null);
  const [escolhendoParcelas, setEscolhendoParcelas] = useState(false);
  const [pagamento, setPagamento] = useState(null);
  const [continuar, setContinuar] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function simular() {
    setEnviando(true);
    setErro('');
    try {
      const resposta = await fetch("/requisicoes/" + id + "/pagamento", {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forma, parcelas: parcelas ?? 1 }),
        signal: AbortSignal.timeout(15000),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok || dados?.status !== 'simulado') {
        setErro(typeof dados?.detail === 'string'
          ? dados.detail
          : 'Não foi possível registrar a simulação. Tente novamente.');
        return;
      }
      setPagamento(dados);
    } catch {
      setErro('Não foi possível registrar a simulação. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="checkout" aria-label="Finalização da compra" aria-live="polite">
      {pagamento ? (
        <>
          <p><strong>Compra simulada concluída.</strong> Forma de pagamento: {formasPagamento[pagamento.forma]}.</p>
          {pagamento.forma === 'credito' && <p>{descricaoCredito(total, pagamento.parcelas, moeda)}</p>}
          {continuar === null ? (
            <>
              <h3>Obrigado pela compra! Gostaria de mais algum produto?</h3>
              <div className="acoes-compra">
                <button type="button" onClick={() => {
                  setContinuar(true);
                  iniciarPedido('');
                }}>Sim, quero outro produto</button>
                <button type="button" className="secundario" onClick={() => setContinuar(false)}>
                  Não, obrigado
                </button>
              </div>
            </>
          ) : continuar ? (
            <>
              <p>Temos laptops, perfumes e relógios. Qual produto você procura?</p>
              <div className="acoes-compra">
                {['Laptops', 'Perfumes', 'Relógios'].map(produto => (
                  <button type="button" className="secundario" key={produto}
                    onClick={() => iniciarPedido('O que tem de ' + produto.toLowerCase() + '?')}>
                    {produto}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p>Obrigado por comprar com a gente! Tenha um bom dia. Espero que volte em breve!</p>
          )}
        </>
      ) : prosseguir === false ? (
        <p>Tudo bem. Sinto muito por não poder ajudar com a compra desta vez. Se precisar de outro orçamento, estou à disposição.</p>
      ) : prosseguir === null ? (
        <>
          <h3>Deseja prosseguir com a compra?</h3>
          <div className="acoes-compra">
            <button type="button" onClick={() => setProsseguir(true)}>Sim, prosseguir</button>
            <button type="button" className="secundario" onClick={() => setProsseguir(false)}>Agora não</button>
          </div>
        </>
      ) : forma === null ? (
        <>
          <h3>Como você quer pagar?</h3>
          <p>Escolha uma forma de pagamento para a simulação.</p>
          <div className="acoes-compra">
            {Object.entries(formasPagamento).map(([valor, rotulo]) => (
              <button type="button" key={valor} onClick={() => setForma(valor)}>{rotulo}</button>
            ))}
            <button type="button" className="secundario" onClick={() => setProsseguir(null)}>Voltar</button>
          </div>
        </>
      ) : forma === 'credito' && parcelas === null ? (
        <>
          <h3>{escolhendoParcelas ? 'Em quantas vezes você quer pagar?' : 'Crédito à vista ou parcelado?'}</h3>
          <p>Você pode dividir em até 5 vezes sem juros.</p>
          <div className="acoes-compra">
            {escolhendoParcelas ? [2, 3, 4, 5].map(n => (
              <button type="button" key={n} onClick={() => setParcelas(n)}>
                {descricaoCredito(total, n, moeda)}
              </button>
            )) : (
              <>
                <button type="button" onClick={() => setParcelas(1)}>{descricaoCredito(total, 1, moeda)}</button>
                <button type="button" onClick={() => setEscolhendoParcelas(true)}>Parcelado</button>
              </>
            )}
            <button type="button" className="secundario" onClick={() => {
              if (escolhendoParcelas) setEscolhendoParcelas(false);
              else setForma(null);
            }}>Voltar</button>
          </div>
        </>
      ) : (
        <>
          <h3>{formasPagamento[forma]}</h3>
          {forma === 'credito' && <p>{descricaoCredito(total, parcelas, moeda)}</p>}
          {forma === 'pix' && <p>Chave Pix fictícia: <code>PIX-DEMO-{id}</code></p>}
          {forma === 'boleto' && <p>Código de barras fictício: <code>00000000000000000000000000000000000000000000</code></p>}
          <p>{forma === 'pix' || forma === 'boleto'
            ? 'Código inválido para pagamento real.'
            : 'O cartão é simulado e não requer dados.'}</p>
          <div className="acoes-compra">
            <button type="button" disabled={enviando} onClick={simular}>
              {enviando ? 'Registrando…' : 'Simular pagamento'}
            </button>
            <button type="button" className="secundario" disabled={enviando} onClick={() => {
              setForma(null);
              setParcelas(null);
              setEscolhendoParcelas(false);
              setErro('');
            }}>Trocar forma</button>
          </div>
          {erro && <p className="erro-pagamento" role="alert">{erro}</p>}
        </>
      )}
    </section>
  );
}

function formatarMensagem(mensagem) {
  if (/\(1\)[ \t]+/.test(mensagem) && /\(2\)[ \t]+/.test(mensagem)) {
    return mensagem.replace(/[ \t]+(?=\(\d+\)[ \t]+)/g, '\n');
  }
  return mensagem;
}

function Resposta({ resposta, iniciarPedido }) {
  if (resposta.status !== 'criada') {
    return <p className="texto-resposta">{formatarMensagem(resposta.mensagem)}</p>;
  }

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: resposta.moeda });
  return (
    <>
      <h2>Requisição #{resposta.id}</h2>
      <div className="tabela" tabIndex={0} role="region" aria-label="Itens da requisição">
        <table>
          <thead>
            <tr><th>Item</th><th>Qtd.</th><th>Preço unitário</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            {resposta.itens.map(item => (
              <tr key={item.produto_id}>
                <th scope="row">{item.nome}</th>
                <td>{item.quantidade}</td>
                <td>{moeda.format(item.preco_unitario)}</td>
                <td>{moeda.format(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row" colSpan={3}>Total</th><td>{moeda.format(resposta.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      {resposta.ferramentas?.length > 0 && (
        <details>
          <summary>Consultas ao catálogo</summary>
          <ul>{resposta.ferramentas.map((nome, i) => <li key={i}><code>{nome}</code></li>)}</ul>
        </details>
      )}
      <Checkout id={resposta.id} total={resposta.total} moeda={moeda} iniciarPedido={iniciarPedido} />
    </>
  );
}

function App() {
  const [pedido, setPedido] = useState('');
  const [mensagens, setMensagens] = useState([]);
  const [contexto, setContexto] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    if (mensagens.length) fim.current?.scrollIntoView({ block: 'nearest' });
  }, [mensagens, enviando]);

  function iniciarPedido(texto) {
    setContexto([]);
    if (texto) setPedido(texto);
    campo.current?.focus();
  }

  async function enviar(event) {
    event.preventDefault();
    const texto = pedido.trim();
    if (!texto || enviando) return;

    setEnviando(true);
    setPedido('');
    setMensagens(anteriores => [...anteriores, { pedido: texto }]);
    try {
      const resposta = await fetch('/requisicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedido: texto, contexto }),
        signal: AbortSignal.timeout(120000),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok || !dados) {
        throw new Error(typeof dados?.detail === 'string'
          ? dados.detail
          : 'O serviço de compras está indisponível. Tente novamente.');
      }
      setMensagens(anteriores => [...anteriores, { resposta: dados }]);
      setContexto(dados.status === 'pendente' ? [...contexto, texto].slice(-4) : []);
    } catch (erro) {
      const mensagem = erro.name === 'TimeoutError'
        ? 'O serviço de compras demorou a responder.'
        : erro instanceof TypeError
          ? 'Não foi possível conectar ao serviço de compras.'
          : erro.message;
      setMensagens(anteriores => [...anteriores, { resposta: { status: 'erro', mensagem } }]);
      setPedido(atual => atual || texto);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main>
      <header>
        <span className="marca" aria-hidden="true">↓</span>
        <h1>Agente de compras</h1>
      </header>
      <section className="historico" aria-label="Conversa" role="log">
        {mensagens.length === 0 && (
          <div className="inicio">
            <h2>Olá! O que você está procurando?</h2>
            <p>No catálogo temos laptops, perfumes, relógios e outros produtos.</p>
          </div>
        )}
        {mensagens.map((item, i) => item.pedido
          ? <p className="pedido" key={i}>{item.pedido}</p>
          : <article className="resposta" key={i}><Resposta resposta={item.resposta} iniciarPedido={iniciarPedido} /></article>
        )}
        {enviando && <p className="status" role="status">Consultando o catálogo…</p>}
        <div ref={fim} />
      </section>
      <form onSubmit={enviar}>
        <label htmlFor="pedido">Seu pedido</label>
        <div className="entrada">
          <textarea id="pedido" ref={campo} rows={2} maxLength={3000} value={pedido}
            onChange={event => setPedido(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
              event.preventDefault();
              if (pedido.trim() && !enviando && !event.repeat) event.currentTarget.form.requestSubmit();
            }}
            placeholder="Informe o produto, a quantidade e o orçamento em US$" />
          <button disabled={!pedido.trim() || enviando}>Enviar</button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
