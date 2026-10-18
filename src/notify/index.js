// Formata e envia alertas pelos canais configurados (Telegram, ntfy, console).
import { escaparHtml as esc, log } from '../util.js';
import { formataPreco as fmt } from '../normalize.js';
import { enviarNtfy } from './ntfy.js';

export function rotuloMotivo(motivo) {
  if (motivo.startsWith('vigia:')) return { icone: '🎯', rotulo: `Vigia “${motivo.slice(6)}”` };
  return (
    {
      historico: { icone: '📉', rotulo: 'Queda de preço' },
      desconto: { icone: '💸', rotulo: 'Desconto alto' },
      quente: { icone: '🔥', rotulo: 'Em alta' },
    }[motivo] || { icone: '🔔', rotulo: motivo }
  );
}

export function linhaPreco(o) {
  let s = fmt(o.preco);
  if (o.preco_antigo && o.preco_antigo > o.preco) s += ` (de ${fmt(o.preco_antigo)}${o.desconto_pct ? `, -${Math.round(o.desconto_pct)}%` : ''})`;
  return s;
}

export function formatarAlertaHtml(a) {
  const { icone, rotulo } = rotuloMotivo(a.motivo);
  return [
    `${icone} <b>${esc(a.titulo)}</b>`,
    `<b>${esc(linhaPreco(a))}</b> · ${esc(a.loja || '')} · <i>${a.fonte}</i>`,
    `${esc(rotulo)}: ${esc(a.detalhe || '')}`,
    `<a href="${esc(a.url)}">ver oferta</a>`,
  ].join('\n');
}

export function formatarAlertaTexto(a) {
  const { icone, rotulo } = rotuloMotivo(a.motivo);
  return `${icone} ${a.titulo}\n${linhaPreco(a)} · ${a.loja || ''} · ${a.fonte}\n${rotulo}: ${a.detalhe || ''}\n${a.url}`;
}

/**
 * Envia os alertas. Devolve os ids efetivamente entregues em pelo menos um canal
 * (ou todos, quando nenhum canal está configurado: imprime no console).
 */
export async function enviarAlertas(config, alertas, tg) {
  if (!alertas.length) return [];
  const canais = [];
  const n = config.notificacoes || {};
  if (n.telegram?.ativo !== false && tg?.ativo) canais.push('telegram');
  if (n.ntfy?.ativo && n.ntfy?.topico) canais.push('ntfy');

  if (!canais.length) {
    log('ℹ️ nenhum canal de notificação configurado; alertas abaixo:');
    for (const a of alertas) console.log('\n' + formatarAlertaTexto(a));
    return alertas.map((a) => a.id);
  }

  const entregues = new Set();
  if (canais.includes('telegram')) {
    for (let i = 0; i < alertas.length; i += 5) {
      const lote = alertas.slice(i, i + 5);
      const cab = i === 0 ? `📡 <b>Radar de Ofertas</b> — ${alertas.length} alerta${alertas.length > 1 ? 's' : ''}\n\n` : '';
      await tg.enviar(cab + lote.map(formatarAlertaHtml).join('\n\n'));
      lote.forEach((a) => entregues.add(a.id));
    }
  }
  if (canais.includes('ntfy')) {
    for (const a of alertas) {
      try {
        const { icone, rotulo } = rotuloMotivo(a.motivo);
        await enviarNtfy(n.ntfy.topico, {
          titulo: `${icone} ${rotulo}: ${linhaPreco(a)}`,
          texto: `${a.titulo}\n${a.loja || ''} · ${a.fonte}\n${a.detalhe || ''}`,
          url: a.url,
        });
        entregues.add(a.id);
      } catch (e) {
        log('⚠️ ntfy:', e.message);
      }
    }
  }
  return [...entregues];
}
