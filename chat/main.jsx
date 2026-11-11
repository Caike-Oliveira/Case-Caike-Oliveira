import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const exemplo = 'Preciso de 3 laptops para o time de vendas, até US$ 2.000 cada.';
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

function Resposta({ resposta }) {
  if (resposta.status !== 'criada') {
    return <p>{resposta.mensagem}</p>;
  }

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
    </>
  );
}

function App() {
  const [pedido, setPedido] = useState('');
  const [mensagens, setMensagens] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    if (mensagens.length) fim.current?.scrollIntoView({ block: 'nearest' });
  }, [mensagens, enviando]);

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
        body: JSON.stringify({ pedido: texto }),
        signal: AbortSignal.timeout(120000),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok || !dados) {
        throw new Error(typeof dados?.detail === 'string'
          ? dados.detail
          : 'O serviço de compras está indisponível. Tente novamente.');
      }
      setMensagens(anteriores => [...anteriores, { resposta: dados }]);
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
            <h2>O que você precisa comprar?</h2>
            <p>Informe o item, a quantidade e o orçamento em dólares.</p>
            <button className="exemplo" type="button" onClick={() => {
              setPedido(exemplo);
              campo.current?.focus();
            }}>{exemplo}</button>
          </div>
        )}
        {mensagens.map((item, i) => item.pedido
          ? <p className="pedido" key={i}>{item.pedido}</p>
          : <article className="resposta" key={i}><Resposta resposta={item.resposta} /></article>
        )}
        {enviando && <p className="status" role="status">Consultando o catálogo…</p>}
        <div ref={fim} />
      </section>
      <form onSubmit={enviar}>
        <label htmlFor="pedido">Seu pedido</label>
        <div className="entrada">
          <textarea id="pedido" ref={campo} rows={2} maxLength={3000} value={pedido}
            onChange={event => setPedido(event.target.value)}
            placeholder="Ex.: 3 laptops para o time de vendas" />
          <button disabled={!pedido.trim() || enviando}>Enviar</button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
