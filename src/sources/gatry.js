// Gatry (gatry.com): /promocoes?page=N e /promocoes?q=termo, HTML server-side com <article>.
import * as cheerio from 'cheerio';
import { baixar, unicas } from '../util.js';
import { precoBR, dataBR, maisAntigoQue } from '../normalize.js';

export const nome = 'gatry';
const BASE = 'https://gatry.com';

export function parse(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('article').each((_, el) => {
    const $el = $(el);
    const a = $el.find('.description h3 a').first();
    const titulo = a.text().replace(/\s+/g, ' ').trim();
    if (!titulo) return;
    const interno = $el
      .find('.option-more a, .option-comment a')
      .map((_, x) => $(x).attr('href') || '')
      .get()
      .find((h) => /\/promocoes\/\d+/.test(h)) || '';
    const m = interno.match(/\/promocoes\/(\d+)/);
    if (!m) return;
    const loja = $el.find('.option-store a').first().text().replace(/ir para/i, '').replace(/\s+/g, ' ').trim() || null;
    const datas = $el
      .find('p.date[title]')
      .map((_, x) => dataBR($(x).attr('title')))
      .get()
      .filter(Boolean)
      .sort();
    const comentarios = parseInt($el.find('.option-comment a').first().text(), 10);
    const publicado_em = datas.at(-1) || null;
    out.push({
      fonte: nome,
      fonte_id: m[1],
      titulo,
      preco: precoBR($el.find('p.price').first().text()),
      preco_antigo: null,
      desconto_pct: null,
      loja,
      url: BASE + interno.replace(/\?.*$/, ''),
      imagem: $el.find('.image img').first().attr('src') || null,
      temperatura: Number.isFinite(comentarios) ? comentarios : 0,
      publicado_em,
      // a busca devolve promoções antigas por relevância; só as recentes contam como ativas
      ativa: !maisAntigoQue(publicado_em, 14),
    });
  });
  return unicas(out);
}

export async function varrer({ paginas = 2 } = {}) {
  const out = [];
  for (let p = 1; p <= paginas; p++) {
    out.push(...parse(await baixar(`${BASE}/promocoes${p > 1 ? `?page=${p}` : ''}`)));
  }
  return unicas(out);
}

export async function buscar(termo) {
  return parse(await baixar(`${BASE}/promocoes?q=${encodeURIComponent(termo)}`));
}
