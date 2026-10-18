import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, precoBR, combina, chaveVigia, mediana, dataBR } from '../src/normalize.js';
import { interpretarVigia } from '../src/busca.js';

test('precoBR entende formatos brasileiros', () => {
  assert.equal(precoBR('R$ 1.234,56'), 1234.56);
  assert.equal(precoBR('R$81,00'), 81);
  assert.equal(precoBR(' R$ 37,70 '), 37.7);
  assert.equal(precoBR('R$ 1.299'), 1299);
  assert.equal(precoBR(399.9), 399.9);
  assert.equal(precoBR('Grátis'), null);
  assert.equal(precoBR(0), null);
  assert.equal(precoBR(null), null);
});

test('normalizar remove acento, caixa e pontuação', () => {
  assert.equal(normalizar('Placa de Vídeo RTX-4070 Ti (12GB)'), 'placa de video rtx 4070 ti 12gb');
});

test('combina exige todos os termos e nenhum excluído', () => {
  const v = { termos: ['rtx 4070'], excluir: ['notebook'] };
  assert.ok(combina(v, normalizar('Placa RTX 4070 Super 12GB')));
  assert.ok(!combina(v, normalizar('Notebook Gamer RTX 4070')));
  assert.ok(!combina(v, normalizar('RTX 40700')));
  assert.ok(!combina({ termos: ['ssd', '2tb'] }, normalizar('SSD 1TB NVMe')));
  assert.ok(combina({ termos: ['ssd', '2tb'] }, normalizar('SSD Kingston 2TB NVMe')));
});

test('chaveVigia é estável', () => {
  assert.equal(chaveVigia({ termos: ['RTX 4070'], excluir: ['Notebook'] }), 'rtx 4070 -notebook');
});

test('interpretarVigia separa termos, exclusões e teto', () => {
  assert.deepEqual(interpretarVigia('rtx 4070 -notebook -ti 3.000'), { termos: ['rtx', '4070'], excluir: ['notebook', 'ti'], preco_max: 3000 });
  assert.deepEqual(interpretarVigia('air fryer'), { termos: ['air', 'fryer'], excluir: [], preco_max: null });
  assert.deepEqual(interpretarVigia('iphone 15'), { termos: ['iphone'], excluir: [], preco_max: 15 });
});

test('mediana', () => {
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([4, 1, 2, 3]), 2.5);
  assert.equal(mediana([]), null);
});

test('dataBR', () => {
  assert.equal(dataBR('18/10/2026 às 15:09'), '2026-10-18T15:09:00-03:00');
  assert.equal(dataBR('xx'), null);
});
