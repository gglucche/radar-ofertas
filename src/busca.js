// Busca de um produto específico: fontes ao vivo + histórico local, unificados.
import { buscarTodas } from './sources/index.js';
import { salvarOfertas, buscarLocal } from './db.js';
import { normalizar, combina, formataPreco as fmt } from './normalize.js';
import { escaparHtml as esc } from './util.js';

/** "rtx 4070 -notebook -ti 3000" -> {termos:['rtx','4070'], excluir:['notebook','ti'], preco_max:3000} */
export function interpretarVigia(texto) {
  const tokens = String(texto).trim().split(/\s+/).filter(Boolean);
  let preco_max = null;
  if (tokens.length > 1 && /^\d+([.,]\d+)?$/.test(tokens.at(-1))) {
    preco_max = parseFloat(tokens.pop().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  }
  const excluir = tokens.filter((t) => t.startsWith('-') && t.length > 1).map((t) => t.slice(1));
  const termos = tokens.filter((t) => !t.startsWith('-'));
  return { termos, excluir, preco_max };
}

/**
 * @returns {Promise<{resultados: Array, erros: Array}>} ordenado: ativas primeiro, preço crescente
 */
export async function buscarProduto(termo, { config, db, salvar = true }) {
  const vigia = { termos: normalizar(termo).split(' ').filter(Boolean) };
  const { ofertas, erros } = await buscarTodas(termo, config);
  const vivas = ofertas.filter((o) => combina(vigia, normalizar(o.titulo)));
  if (salvar && db) salvarOfertas(db, vivas);
  const locais = db ? buscarLocal(db, vigia, config.regras.janela_dias, 60) : [];
  const mapa = new Map();
  for (const o of [...vivas, ...locais]) {
    const k = `${o.fonte}:${o.fonte_id}`;
    if (!mapa.has(k)) mapa.set(k, o);
  }
  const resultados = [...mapa.values()].sort((a, b) => {
    const ea = a.ativa === false ? 1 : 0;
    const eb = b.ativa === false ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return (a.preco ?? Infinity) - (b.preco ?? Infinity);
  });
  return { resultados, erros };
}

export function formatarBuscaHtml(termo, resultados, erros = [], max = 12) {
  if (!resultados.length) return `🔎 Nada encontrado para <b>${esc(termo)}</b>.`;
  const linhas = resultados.slice(0, max).map((o, i) => {
    const fim = o.ativa === false ? ' <i>(encerrada)</i>' : '';
    return `${i + 1}. <b>${esc(fmt(o.preco))}</b> · ${esc(o.loja || '')} · ${o.fonte}${fim}\n<a href="${esc(o.url)}">${esc(o.titulo.slice(0, 90))}</a>`;
  });
  const rodape = erros.length ? `\n\n⚠️ sem resposta de: ${erros.map((e) => e.fonte).join(', ')}` : '';
  return `🔎 <b>${esc(termo)}</b> — ${resultados.length} resultado${resultados.length > 1 ? 's' : ''}\n\n${linhas.join('\n\n')}${rodape}`;
}

export function formatarBuscaTexto(termo, resultados, erros = [], max = 20) {
  if (!resultados.length) return `Nada encontrado para "${termo}".`;
  const linhas = resultados.slice(0, max).map((o) => {
    const cab = `${fmt(o.preco).padStart(14)}  ${(o.loja || '').padEnd(18).slice(0, 18)}  ${o.fonte.padEnd(8)}  ${o.ativa === false ? '[encerrada] ' : ''}${o.titulo.slice(0, 70)}`;
    return `${cab}\n${' '.repeat(16)}${o.url}`;
  });
  const rodape = erros.length ? `\nsem resposta de: ${erros.map((e) => `${e.fonte} (${e.erro})`).join(', ')}` : '';
  return `"${termo}": ${resultados.length} resultado(s)\n\n${linhas.join('\n')}${rodape}`;
}
