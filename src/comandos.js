// Comandos recebidos pelo bot do Telegram (long polling a cada varredura).
// Só responde ao chat configurado em TELEGRAM_CHAT_ID.
import { obterEstado, definirEstado, listarVigias, adicionarVigia, removerVigia, estatisticas } from './db.js';
import { carregarWatchlist } from './config.js';
import { buscarProduto, formatarBuscaHtml, interpretarVigia } from './busca.js';
import { chaveVigia, formataPreco as fmt } from './normalize.js';
import { escaparHtml as esc, log } from './util.js';

export const AJUDA = [
  '📡 <b>Radar de Ofertas</b>',
  '',
  '/buscar <i>produto</i> — procura agora nas fontes e no histórico',
  '/vigiar <i>produto</i> [-excluir] [preço máx] — avisa quando aparecer barato',
  '   ex.: /vigiar rtx 4070 -notebook -ti 3000',
  '/lista — vigias ativas',
  '/parar <i>id</i> — remove uma vigia criada pelo bot',
  '/status — estado do banco',
  '',
  'Texto sem barra = /buscar.',
].join('\n');

export function listarTodasVigias(db) {
  return [...carregarWatchlist(), ...listarVigias(db)];
}

export function formatarVigias(vigias) {
  if (!vigias.length) return 'Nenhuma vigia. Crie com /vigiar ou edite watchlist.yml.';
  return vigias
    .map((v) => `${v.id != null ? `#${v.id}` : '📄'} <b>${esc(chaveVigia(v))}</b>${v.preco_max != null ? ` até ${fmt(v.preco_max)}` : ''}`)
    .join('\n');
}

export async function responder(texto, { db, config }) {
  const [cmd, ...resto] = texto.trim().split(/\s+/);
  const arg = resto.join(' ').trim();
  const c = cmd.toLowerCase().replace(/@\w+$/, '');

  async function buscar(termo) {
    if (!termo) return 'Uso: /buscar nome do produto';
    const { resultados, erros } = await buscarProduto(termo, { config, db });
    return formatarBuscaHtml(termo, resultados, erros);
  }

  if (!c.startsWith('/')) return buscar(texto.trim());

  switch (c) {
    case '/start':
    case '/ajuda':
    case '/help':
      return AJUDA;
    case '/buscar':
    case '/busca':
      return buscar(arg);
    case '/vigiar': {
      const v = interpretarVigia(arg);
      if (!v.termos.length) return 'Uso: /vigiar rtx 4070 -notebook 3000';
      const id = adicionarVigia(db, { ...v, chat_id: config.telegram.chat_id });
      const teto = v.preco_max != null ? ` até ${fmt(v.preco_max)}` : ' (aviso quando ficar abaixo do histórico)';
      return `👁️ Vigia #${id} criada: <b>${esc(chaveVigia(v))}</b>${teto}`;
    }
    case '/parar': {
      const id = parseInt(arg, 10);
      if (!id) return 'Uso: /parar <id> (veja /lista)';
      return removerVigia(db, id) ? `🗑️ Vigia #${id} removida.` : `Vigia #${id} não existe.`;
    }
    case '/lista':
      return formatarVigias(listarTodasVigias(db));
    case '/status': {
      const s = estatisticas(db);
      return `📊 ${s.ofertas} ofertas, ${s.precos} preços, ${s.alertas} alertas (${s.pendentes} pendentes), ${s.vigias} vigias do bot\nÚltima atualização: ${s.ultima_atualizacao || '-'}`;
    }
    default:
      return 'Comando desconhecido. /ajuda';
  }
}

/** Lê mensagens novas e responde. @returns {Promise<number>} quantidade processada */
export async function processarComandos({ db, config, tg }) {
  if (!tg?.ativo) return 0;
  const offset = Number(obterEstado(db, 'tg_offset') || 0);
  const updates = await tg.atualizacoes(offset);
  let n = 0;
  for (const u of updates) {
    definirEstado(db, 'tg_offset', u.update_id + 1);
    const msg = u.message;
    if (!msg?.text) continue;
    if (String(msg.chat?.id) !== String(config.telegram.chat_id)) {
      log(`ignorando mensagem de chat desconhecido ${msg.chat?.id}`);
      continue;
    }
    n++;
    try {
      const r = await responder(msg.text, { db, config });
      if (r) await tg.enviar(r, { chatId: msg.chat.id });
    } catch (e) {
      log('⚠️ comando:', e.message);
      await tg.enviar(`⚠️ Erro: ${esc(e.message)}`, { chatId: msg.chat.id }).catch(() => {});
    }
  }
  if (!obterEstado(db, 'tg_comandos_definidos')) {
    await tg.definirComandos().catch(() => {});
    definirEstado(db, 'tg_comandos_definidos', 'sim');
  }
  return n;
}
