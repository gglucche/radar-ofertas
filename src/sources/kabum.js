// KaBuM!: API de catálogo usada pelo site (servicespub.prod.api.aws.grupokabum.com.br).
// Loja direta: o id do produto é estável, então o histórico de preço por produto é exato.
//   GET /catalog/v2/products?query=termo&page_number=1&page_size=20
import { baixar, unicas } from '../util.js';
import { precoBR } from '../normalize.js';

export const nome = 'kabum';
const API = 'https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products';

export function mapear(p) {
  const a = p.attributes || {};
  const of = a.offer || null;
  const preco = precoBR(of?.price_with_discount ?? a.price_with_discount ?? a.price);
  const cheio = precoBR(a.price);
  const velho = precoBR(a.old_price);
  const antigo = cheio && preco && cheio > preco + 0.01 ? cheio : velho && preco && velho > preco + 0.01 ? velho : null;
  return {
    fonte: nome,
    fonte_id: String(p.id),
    titulo: String(a.title || '').trim(),
    preco,
    preco_antigo: antigo,
    desconto_pct: antigo && preco ? Math.round((1 - preco / antigo) * 100) : null,
    loja: a.is_marketplace ? `KaBuM! (marketplace${a.marketplace?.name ? ': ' + a.marketplace.name : ''})` : 'KaBuM!',
    url: `https://www.kabum.com.br/produto/${p.id}/${a.product_link || ''}`,
    imagem: (a.images || [])[0] || null,
    temperatura: 0,
    publicado_em: of?.starts_at ? new Date(of.starts_at * 1000).toISOString() : null,
    disponivel: a.available !== false,
    em_campanha: Boolean(of),
  };
}

async function pagina(params) {
  const q = new URLSearchParams({ page_number: '1', page_size: '20', sort: 'most_searched', include: 'gift', ...params });
  const d = await baixar(`${API}?${q}`, { tipo: 'json' });
  return (d.data || []).map(mapear).filter((o) => o.titulo && o.disponivel && o.preco);
}

/** Varredura: produtos mais procurados que estão em campanha/desconto no momento. */
export async function varrer({ paginas = 1 } = {}) {
  const out = [];
  for (let p = 1; p <= paginas; p++) {
    const lote = await pagina({ page_number: String(p), page_size: '100' });
    out.push(...lote.filter((o) => o.em_campanha || (o.desconto_pct ?? 0) >= 10));
  }
  return unicas(out);
}

export async function buscar(termo) {
  return pagina({ query: termo, page_size: '20' });
}
