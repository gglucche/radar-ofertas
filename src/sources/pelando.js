// Pelando (pelando.com.br): página /recentes renderizada no servidor; cada card tem
// h3 > a[data-deal-id]. Classes são hasheadas (_deal-card-stamp_xxx), então usamos [class*=].
import * as cheerio from 'cheerio';
import { baixar, unicas } from '../util.js';
import { precoBR } from '../normalize.js';

export const nome = 'pelando';
const BASE = 'https://www.pelando.com.br';

export function parse(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('h3 a[data-deal-id]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    if (!href.includes('/d/')) return;
    let card = $a.closest('[class*="deal-card_"]');
    if (!card.length) card = $a.closest('li');
    if (!card.length) return;
    const titulo = $a.text().replace(/\s+/g, ' ').trim();
    if (!titulo) return;
    // em cupons o "selo" mostra o valor do desconto, não o preço do produto
    const pareceCupom = /\b(cupom|off)\b/i.test(titulo);
    const precoTxt = card.find('[class*="deal-card-stamp"]').first().text();
    const lojaEl = card.find('[class*="deal-card-store"]').first();
    const loja = (lojaEl.find('strong, a').first().text() || lojaEl.text().replace(/\|?\s*vendido por/i, '')).trim() || null;
    const temperatura = parseInt(card.find('[class*="deal-card-temperature"] span').first().text(), 10);
    const imagem = card.find('img').first().attr('src') || null;
    out.push({
      fonte: nome,
      fonte_id: $a.attr('data-deal-id'),
      titulo,
      preco: pareceCupom ? null : precoBR(precoTxt),
      preco_antigo: null,
      desconto_pct: null,
      loja,
      url: href.startsWith('http') ? href : BASE + href,
      imagem,
      temperatura: Number.isFinite(temperatura) ? temperatura : 0,
      publicado_em: null,
      ativa: $a.attr('data-inactive') !== 'true',
    });
  });
  return unicas(out);
}

export async function varrer({ paginas = 2 } = {}) {
  const out = [];
  for (let p = 1; p <= paginas; p++) {
    const html = await baixar(`${BASE}/recentes${p > 1 ? `?page=${p}` : ''}`);
    out.push(...parse(html));
  }
  return unicas(out);
}

export async function buscar(termo) {
  const html = await baixar(`${BASE}/busca/${encodeURIComponent(termo)}`);
  return parse(html);
}
