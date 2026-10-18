import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parsePelando } from '../src/sources/pelando.js';
import { parse as parseGatry } from '../src/sources/gatry.js';
import { mapear as mapearPromobit } from '../src/sources/promobit.js';
import { mapear as mapearKabum } from '../src/sources/kabum.js';

// Trechos reduzidos da estrutura real observada em out/2026.
const HTML_PELANDO = `<ul><li><div data-show-author="false" class="_deal-card_1jdb6_25 _default-deal-card_8rdza_31">
<div class="_deal-card-image-container_4d9he_35"><a href="https://www.pelando.com.br/d/tech-t-shirt-93f1"><img src="https://media.pelando.com.br/a.jpg" class="_deal-card-image_4d9he_31"/></a></div>
<h3 class="_title_1p24x_31"><a href="https://www.pelando.com.br/d/tech-t-shirt-93f1" data-deal-id="ba20c917-cf4d" data-inactive="false">Tech T-Shirt Noliquid - BASICAMENTE</a></h3>
<div class="_container_13qz9_31 _default-deal-card-store_8rdza_84"><span>| Vendido por </span><strong>Malwee</strong></div>
<span data-inactive="false" class="_deal-card-stamp_15l5n_25 "><small>R$</small>81,00</span>
<div class="_deal-card-temperature_10yb6_29"><button>-</button><span>6°</span><button>+</button></div>
</div></li>
<li><div class="_deal-card_1jdb6_25"><h3><a href="https://www.pelando.com.br/d/cupom-x" data-deal-id="zzz">Cupom 10% off</a></h3></div></li></ul>`;

test('pelando.parse extrai cards', () => {
  const [a, b] = parsePelando(HTML_PELANDO);
  assert.equal(a.fonte_id, 'ba20c917-cf4d');
  assert.equal(a.titulo, 'Tech T-Shirt Noliquid - BASICAMENTE');
  assert.equal(a.preco, 81);
  assert.equal(a.loja, 'Malwee');
  assert.equal(a.temperatura, 6);
  assert.equal(a.url, 'https://www.pelando.com.br/d/tech-t-shirt-93f1');
  assert.equal(b.preco, null);
});

const HTML_GATRY = `<div class="promotions row"><article><div class="image"><a href="https://link.amazon/B0a" target="_blank"><img src="https://cdn.gatry.com/x.jpg"></a>
<div class="option-other"><p class="date" title="28/10/2019 às 17:35"> 1 hora <span>atrás</span></p></div></div>
<div class="description"><h3><a href="https://link.amazon/B0a" target="_blank">Norpro, Faca De Alface Verde, Pacote Com 1</a></h3>
<p class="price"> R$ 37,70 </p><p class="comment">Da para levar na cabine.</p>
<div class="options d-flex"><div class="option-comment"><a href="/promocoes/285412/norpro-faca?comentarios">1 Comentário</a></div>
<div class="option-store"><a href="https://link.amazon/B0a" target="_blank"><span>Ir para</span> Amazon</a></div>
<div class="option-more"><a href="/promocoes/285412/norpro-faca">...</a></div>
<div class="option-other"><p class="date" title="18/10/2026 às 15:09 "> 1 hora <span>atrás</span></p></div></div></div></article></div>`;

test('gatry.parse extrai artigos', () => {
  const [o] = parseGatry(HTML_GATRY);
  assert.equal(o.fonte_id, '285412');
  assert.equal(o.titulo, 'Norpro, Faca De Alface Verde, Pacote Com 1');
  assert.equal(o.preco, 37.7);
  assert.equal(o.loja, 'Amazon');
  assert.equal(o.url, 'https://gatry.com/promocoes/285412/norpro-faca');
  assert.equal(o.publicado_em, '2026-10-18T15:09:00-03:00');
  assert.equal(o.temperatura, 1);
});

test('promobit.mapear normaliza a oferta da API', () => {
  const o = mapearPromobit({
    offer_id: 2972945,
    offer_title: 'Notebook Gamer Acer Predator',
    offer_price: 8632,
    offer_old_price: 19999,
    offer_discont_percentage: 56.84,
    offer_likes: 3,
    store_name: 'Amazon',
    offer_slug: 'notebook-gamer-acer-2972945',
    offer_photo: '/x.png',
    offer_published: '2026-08-10T09:14:08-0300',
  });
  assert.equal(o.fonte_id, '2972945');
  assert.equal(o.preco, 8632);
  assert.equal(o.preco_antigo, 19999);
  assert.equal(o.desconto_pct, 57);
  assert.equal(o.url, 'https://www.promobit.com.br/oferta/notebook-gamer-acer-2972945/');
  assert.equal(o.imagem, 'https://www.promobit.com.br/x.png');
});

test('kabum.mapear usa preço da campanha quando existe', () => {
  const o = mapearKabum({
    id: 208371,
    attributes: {
      title: 'Carregador USB-C 20W Apple',
      price: 166.56,
      old_price: 0,
      price_with_discount: 149.9,
      discount_percentage: 10,
      offer: { price: 144.43, price_with_discount: 129.99, discount_percentage: 13, starts_at: 1791897555 },
      available: true,
      product_link: 'carregador-usb-c-20w-apple',
      images: ['https://images.kabum.com.br/a.jpg'],
    },
  });
  assert.equal(o.preco, 129.99);
  assert.equal(o.preco_antigo, 166.56);
  assert.equal(o.desconto_pct, 22);
  assert.equal(o.url, 'https://www.kabum.com.br/produto/208371/carregador-usb-c-20w-apple');
  assert.equal(o.em_campanha, true);
});
