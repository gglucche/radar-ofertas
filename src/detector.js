// Regras que decidem o que é "anormalmente barato".
//  vigia     : item casa com uma vigia e está abaixo do teto (preco_max); sem teto,
//              bem abaixo da mediana histórica das ofertas daquela vigia, ou novo mínimo.
//  historico : a MESMA oferta/produto já foi vista mais cara (ex.: produto da KaBuM caiu).
//  desconto  : desconto declarado >= desconto_minimo_pct.
//  quente    : comunidade validou (temperatura Pelando / curtidas Promobit).
import { combina, chaveVigia, mediana, formataPreco as fmt } from './normalize.js';

const pct = (x) => Math.round(x * 100);

/**
 * @param {object} p
 * @param {Array} p.itens  saída de salvarOfertas (com id, nova, precoMudou, titulo_norm...)
 * @param {Array} p.vigias [{termos, excluir, preco_max}]
 * @param {object} p.regras config.regras
 * @param {Array} p.janela ofertas com preço na janela histórica [{id, titulo_norm, preco}]
 * @param {(id:number)=>number[]} p.precosAnterioresDe
 */
export function detectar({ itens, vigias, regras, janela, precosAnterioresDe }) {
  const alertas = [];
  const preparadas = vigias.map((v) => ({ v, chave: chaveVigia(v), hist: janela.filter((o) => combina(v, o.titulo_norm)) }));

  for (const it of itens) {
    if (it.preco == null || it.ativa === false) continue;
    const mudou = it.nova || it.precoMudou;

    if (mudou) {
      for (const { v, chave, hist } of preparadas) {
        if (!combina(v, it.titulo_norm)) continue;
        const outros = hist.filter((o) => o.id !== it.id).map((o) => o.preco);
        let detalhe = null;
        if (v.preco_max != null) {
          // o usuário disse o que é barato: só o teto conta
          if (it.preco <= v.preco_max) detalhe = `abaixo do teto de ${fmt(v.preco_max)}`;
        } else if (outros.length >= regras.amostras_minimas) {
          const med = mediana(outros);
          const min = Math.min(...outros);
          if (it.preco <= med * regras.queda_historica) detalhe = `${pct(1 - it.preco / med)}% abaixo da mediana (${fmt(med)}) de ${outros.length} ofertas`;
          else if (it.preco < min) detalhe = `novo mínimo (anterior ${fmt(min)})`;
        }
        if (detalhe) alertas.push({ oferta_id: it.id, motivo: `vigia:${chave}`, detalhe, prioridade: 3, preco: it.preco });
      }
    }

    if (regras.alertas_globais === false || it.preco < regras.preco_minimo) continue;

    if (it.precoMudou) {
      const anteriores = precosAnterioresDe(it.id);
      if (anteriores.length) {
        const ref = mediana(anteriores);
        if (it.preco <= ref * regras.queda_historica) {
          alertas.push({ oferta_id: it.id, motivo: 'historico', detalhe: `caiu ${pct(1 - it.preco / ref)}% (antes ${fmt(ref)})`, prioridade: 2, preco: it.preco });
        }
      }
    }

    if (mudou && it.desconto_pct >= regras.desconto_minimo_pct && it.preco_antigo > it.preco) {
      alertas.push({ oferta_id: it.id, motivo: 'desconto', detalhe: `${Math.round(it.desconto_pct)}% de desconto (de ${fmt(it.preco_antigo)})`, prioridade: 2, preco: it.preco });
    }

    const limiar = it.fonte === 'pelando' ? regras.temperatura_quente : it.fonte === 'promobit' ? regras.curtidas_quente : Infinity;
    if ((it.temperatura ?? 0) >= limiar) {
      const detalhe = it.fonte === 'pelando' ? `${Math.round(it.temperatura)}° no Pelando` : `${Math.round(it.temperatura)} curtidas no Promobit`;
      alertas.push({ oferta_id: it.id, motivo: 'quente', detalhe, prioridade: 1, preco: it.preco });
    }
  }
  return alertas;
}
