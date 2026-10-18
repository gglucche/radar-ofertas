import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, salvarOfertas, ofertasJanela, precosAnteriores, criarAlerta, alertasPendentes } from '../src/db.js';
import { detectar } from '../src/detector.js';

const regras = {
  desconto_minimo_pct: 60,
  temperatura_quente: 500,
  curtidas_quente: 30,
  queda_historica: 0.75,
  amostras_minimas: 3,
  janela_dias: 60,
  preco_minimo: 20,
  alertas_globais: true,
};

const oferta = (over) => ({
  fonte: 'promobit',
  fonte_id: '1',
  titulo: 'Placa de Vídeo RTX 4070 12GB',
  preco: 3000,
  url: 'https://exemplo/1',
  loja: 'Loja',
  temperatura: 0,
  ...over,
});

function rodar(db, itens, vigias = []) {
  return detectar({ itens, vigias, regras, janela: ofertasJanela(db, 60), precosAnterioresDe: (id) => precosAnteriores(db, id) });
}

test('vigia com teto de preço', () => {
  const db = abrirBanco(':memory:');
  const itens = salvarOfertas(db, [oferta({ fonte_id: 'a', preco: 2900 }), oferta({ fonte_id: 'b', preco: 3500 })]);
  const al = rodar(db, itens, [{ termos: ['rtx 4070'], preco_max: 3000 }]);
  assert.equal(al.length, 1);
  assert.equal(al[0].motivo, 'vigia:rtx 4070');
  assert.equal(al[0].preco, 2900);
});

test('vigia sem teto: abaixo da mediana histórica', () => {
  const db = abrirBanco(':memory:');
  salvarOfertas(db, [oferta({ fonte_id: 'h1', preco: 3000 }), oferta({ fonte_id: 'h2', preco: 3100 }), oferta({ fonte_id: 'h3', preco: 3200 })]);
  const itens = salvarOfertas(db, [oferta({ fonte_id: 'nova', preco: 2000 })]);
  const al = rodar(db, itens, [{ termos: ['rtx 4070'] }]);
  assert.equal(al.length, 1);
  assert.match(al[0].detalhe, /abaixo da mediana/);
});

test('desconto declarado alto', () => {
  const db = abrirBanco(':memory:');
  const itens = salvarOfertas(db, [oferta({ fonte_id: 'd', titulo: 'Fone Bluetooth', preco: 100, preco_antigo: 400, desconto_pct: 75 })]);
  const al = rodar(db, itens);
  assert.deepEqual(al.map((a) => a.motivo), ['desconto']);
});

test('quente no Pelando', () => {
  const db = abrirBanco(':memory:');
  const itens = salvarOfertas(db, [oferta({ fonte: 'pelando', fonte_id: 'q', titulo: 'Monitor 27', preco: 800, temperatura: 800 })]);
  assert.deepEqual(rodar(db, itens).map((a) => a.motivo), ['quente']);
});

test('historico: a mesma oferta caiu de preço', () => {
  const db = abrirBanco(':memory:');
  salvarOfertas(db, [oferta({ fonte: 'kabum', fonte_id: 'k', titulo: 'SSD 2TB', preco: 1000 })]);
  const itens = salvarOfertas(db, [oferta({ fonte: 'kabum', fonte_id: 'k', titulo: 'SSD 2TB', preco: 600 })]);
  assert.equal(itens[0].precoMudou, true);
  assert.equal(itens[0].precoAnterior, 1000);
  const al = rodar(db, itens);
  assert.deepEqual(al.map((a) => a.motivo), ['historico']);
});

test('sem alerta para bugiganga nem para item sem preço', () => {
  const db = abrirBanco(':memory:');
  const itens = salvarOfertas(db, [
    oferta({ fonte_id: 'x', titulo: 'Cabo', preco: 5, preco_antigo: 50, desconto_pct: 90 }),
    oferta({ fonte_id: 'y', titulo: 'Cupom', preco: null, temperatura: 999 }),
  ]);
  assert.equal(rodar(db, itens).length, 0);
});

test('criarAlerta não duplica e alertasPendentes prioriza vigia', () => {
  const db = abrirBanco(':memory:');
  const [it] = salvarOfertas(db, [oferta({ fonte_id: 'p' })]);
  assert.equal(criarAlerta(db, { oferta_id: it.id, motivo: 'quente', prioridade: 1 }), true);
  assert.equal(criarAlerta(db, { oferta_id: it.id, motivo: 'quente', prioridade: 1 }), false);
  assert.equal(criarAlerta(db, { oferta_id: it.id, motivo: 'vigia:rtx 4070', prioridade: 3 }), true);
  const p = alertasPendentes(db, 10);
  assert.equal(p.length, 2);
  assert.equal(p[0].motivo, 'vigia:rtx 4070');
});
