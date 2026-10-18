// Promobit: API JSON pública usada pelo próprio site (api.promobit.com.br).
//   GET /offers            -> {offers:[...], after: cursor}
//   GET /search?q=termo    -> {active_offers:[...], finished_offers:[...]}
import { baixar, unicas } from '../util.js';
import { precoBR } from '../normalize.js';

export const nome = 'promobit';
const API = 'https://api.promobit.com.br';
const SITE = 'https://www.promobit.com.br';

function ignorar(o) {
  // posts institucionais do próprio Promobit ("TOP OFERTAS DE DOMINGO") e ofertas encerradas
  return o.store_param === 'promobit' || /FINISHED|EXPIRED|CLOSED|DISABLED/i.test(o.offer_status_name || '');
}

export function mapear(o, ativa = true) {
  const preco = o.offer_price > 0.5 ? precoBR(o.offer_price) : null; // 0.01 = "sem preço" no Promobit
  const antigo = o.offer_old_price > 0.5 && preco && o.offer_old_price > preco ? o.offer_old_price : null;
  const pct = o.offer_discont_percentage > 0 ? Math.round(o.offer_discont_percentage) : antigo ? Math.round((1 - preco / antigo) * 100) : null;
  const foto = o.offer_photo ? (o.offer_photo.startsWith('http') ? o.offer_photo : SITE + o.offer_photo) : null;
  return {
    fonte: nome,
    fonte_id: String(o.offer_id),
    titulo: String(o.offer_title || '').trim(),
    preco,
    preco_antigo: antigo,
    desconto_pct: pct,
    loja: o.store_name || null,
    url: `${SITE}/oferta/${o.offer_slug}/`,
    imagem: foto,
    temperatura: Number(o.offer_likes) || 0,
    publicado_em: o.offer_published || null,
    ativa,
  };
}

export async function varrer({ paginas = 2 } = {}) {
  const out = [];
  let after = '';
  for (let p = 1; p <= paginas; p++) {
    const d = await baixar(`${API}/offers${after ? `?after=${encodeURIComponent(after)}` : ''}`, { tipo: 'json' });
    out.push(...(d.offers || []).filter((o) => !ignorar(o)).map((o) => mapear(o)));
    after = d.after;
    if (!after || !(d.offers || []).length) break;
  }
  return unicas(out);
}

export async function buscar(termo) {
  const d = await baixar(`${API}/search?q=${encodeURIComponent(termo)}`, { tipo: 'json' });
  const ativas = (d.active_offers || []).filter((o) => !ignorar(o)).map((o) => mapear(o, true));
  const encerradas = (d.finished_offers || []).slice(0, 10).map((o) => mapear(o, false));
  return unicas([...ativas, ...encerradas]);
}
