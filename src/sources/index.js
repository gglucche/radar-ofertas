// Registro das fontes. Cada fonte exporta: nome, varrer({paginas}), buscar(termo).
import * as pelando from './pelando.js';
import * as promobit from './promobit.js';
import * as gatry from './gatry.js';
import * as kabum from './kabum.js';
import { log } from '../util.js';

export const FONTES = { pelando, promobit, gatry, kabum };

function ativas(config) {
  return Object.entries(FONTES).filter(([n]) => config.fontes?.[n]?.ativo !== false);
}

/** Varre todas as fontes ativas em paralelo. Erro em uma fonte não derruba as outras. */
export async function varrerTodas(config) {
  const ofertas = [];
  const erros = [];
  const porFonte = {};
  await Promise.all(
    ativas(config).map(async ([n, f]) => {
      try {
        const lista = await f.varrer({ paginas: config.fontes?.[n]?.paginas ?? 1 });
        porFonte[n] = lista.length;
        ofertas.push(...lista);
      } catch (e) {
        porFonte[n] = 0;
        erros.push({ fonte: n, erro: e.message });
        log(`⚠️ ${n}: ${e.message}`);
      }
    }),
  );
  return { ofertas, erros, porFonte };
}

/** Busca um termo em todas as fontes ativas (em paralelo). */
export async function buscarTodas(termo, config) {
  const ofertas = [];
  const erros = [];
  await Promise.all(
    ativas(config).map(async ([n, f]) => {
      try {
        ofertas.push(...(await f.buscar(termo)));
      } catch (e) {
        erros.push({ fonte: n, erro: e.message });
      }
    }),
  );
  return { ofertas, erros };
}
