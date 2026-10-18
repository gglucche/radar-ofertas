// Uma execução completa: comandos do Telegram -> varrer fontes -> busca ativa das vigias
// -> salvar -> detectar anomalias -> notificar -> podar -> exportar site.
import { carregarWatchlist } from './config.js';
import { varrerTodas, buscarTodas } from './sources/index.js';
import {
  salvarOfertas,
  ofertasJanela,
  precosAnteriores,
  criarAlerta,
  alertasPendentes,
  marcarEnviados,
  descartarPendentesAntigos,
  listarVigias,
  podar,
} from './db.js';
import { detectar } from './detector.js';
import { enviarAlertas } from './notify/index.js';
import { processarComandos } from './comandos.js';
import { exportarSite } from './site.js';
import { unicas, log } from './util.js';

export async function executarVarredura({ config, db, tg, notificar = true }) {
  const inicio = Date.now();
  const resumo = { comandos: 0, porFonte: {}, buscas: 0, ofertas: 0, novas: 0, mudancas: 0, alertasNovos: 0, enviados: 0, erros: [] };

  try {
    resumo.comandos = await processarComandos({ db, config, tg });
  } catch (e) {
    resumo.erros.push(`telegram: ${e.message}`);
    log('⚠️ telegram:', e.message);
  }

  const { ofertas, erros, porFonte } = await varrerTodas(config);
  resumo.porFonte = porFonte;
  resumo.erros.push(...erros.map((e) => `${e.fonte}: ${e.erro}`));

  const vigias = [...carregarWatchlist(), ...listarVigias(db)];
  if (config.busca_ativa !== false && vigias.length) {
    const max = config.busca_ativa_max ?? 15;
    for (const v of vigias.slice(0, max)) {
      const r = await buscarTodas(v.termos.join(' '), config);
      ofertas.push(...r.ofertas); // inativas/encerradas são ignoradas ao salvar
      resumo.buscas++;
    }
  }

  const itens = salvarOfertas(db, unicas(ofertas));
  resumo.ofertas = itens.length;
  resumo.novas = itens.filter((i) => i.nova).length;
  resumo.mudancas = itens.filter((i) => i.precoMudou).length;

  const janela = ofertasJanela(db, config.regras.janela_dias);
  const alertas = detectar({ itens, vigias, regras: config.regras, janela, precosAnterioresDe: (id) => precosAnteriores(db, id) });
  for (const a of alertas) if (criarAlerta(db, a)) resumo.alertasNovos++;

  descartarPendentesAntigos(db, 48);
  const pendentes = alertasPendentes(db, config.notificacoes.max_por_execucao ?? 15);
  if (notificar && pendentes.length) {
    try {
      const ids = await enviarAlertas(config, pendentes, tg);
      marcarEnviados(db, ids);
      resumo.enviados = ids.length;
    } catch (e) {
      resumo.erros.push(`notificação: ${e.message}`);
      log('⚠️ notificação:', e.message);
    }
  }

  resumo.podadas = podar(db, config.retencao_dias);
  if (config.exportar) exportarSite(db, config);
  resumo.segundos = Math.round((Date.now() - inicio) / 1000);
  log(`varredura: ${JSON.stringify(resumo)}`);
  return resumo;
}
