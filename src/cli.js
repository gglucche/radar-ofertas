#!/usr/bin/env node
// CLI: node src/cli.js <comando> [args] [--flags]
import { carregarConfig } from './config.js';
import { abrirBanco, adicionarVigia, removerVigia, estatisticas, importarSeVazio, exportarDados } from './db.js';
import { Telegram } from './notify/telegram.js';
import { executarVarredura } from './varredura.js';
import { buscarProduto, formatarBuscaTexto, formatarBuscaHtml, interpretarVigia } from './busca.js';
import { listarTodasVigias } from './comandos.js';
import { exportarSite } from './site.js';
import { chaveVigia, formataPreco as fmt } from './normalize.js';
import { dormir, log } from './util.js';

const AJUDA = `radar-ofertas — varre sites de ofertas e avisa quando algo está anormalmente barato

  varrer [--sem-notificar]       uma varredura completa (padrão)
  buscar <produto> [--notificar] busca agora nas fontes + histórico
  vigiar <produto> [-excluir] [preço máx]   ex.: vigiar rtx 4070 -notebook 3000
  parar <id>                     remove vigia criada por CLI/Telegram
  lista                          vigias ativas (watchlist.yml + banco)
  loop [minutos]                 varre continuamente (padrão 15 min) — para VPS/Docker
  site                           regera docs/dados.json
  status                         estatísticas do banco
  testar-telegram                envia mensagem de teste
`;

const [cmd = 'varrer', ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const posic = args.filter((a) => !a.startsWith('--'));
const config = carregarConfig();
const db = abrirBanco(config.banco);
const importados = importarSeVazio(db, config.dados);
if (importados) log(`banco recarregado de ${config.dados} (${importados} registros)`);
const tg = new Telegram(config.telegram.token, config.telegram.chat_id);

try {
  switch (cmd) {
    case 'varrer': {
      await executarVarredura({ config, db, tg, notificar: !flags.has('--sem-notificar') });
      break;
    }
    case 'buscar': {
      const termo = posic.join(' ');
      if (!termo) throw new Error('informe o produto: buscar rtx 4070');
      const { resultados, erros } = await buscarProduto(termo, { config, db });
      console.log(formatarBuscaTexto(termo, resultados, erros));
      if (flags.has('--notificar') && tg.ativo) await tg.enviar(formatarBuscaHtml(termo, resultados, erros));
      break;
    }
    case 'vigiar': {
      const v = interpretarVigia(posic.join(' '));
      if (!v.termos.length) throw new Error('informe o produto: vigiar rtx 4070 -notebook 3000');
      const id = adicionarVigia(db, v);
      console.log(`vigia #${id} criada: ${chaveVigia(v)}${v.preco_max != null ? ` até ${fmt(v.preco_max)}` : ''}`);
      break;
    }
    case 'parar': {
      const id = parseInt(posic[0], 10);
      console.log(removerVigia(db, id) ? `vigia #${id} removida` : `vigia #${id} não existe`);
      break;
    }
    case 'lista': {
      for (const v of listarTodasVigias(db)) {
        console.log(`${v.id != null ? '#' + v.id : 'yml'}\t${chaveVigia(v)}${v.preco_max != null ? `\taté ${fmt(v.preco_max)}` : ''}`);
      }
      break;
    }
    case 'loop': {
      const minutos = Number(posic[0]) || 15;
      log(`modo contínuo: a cada ${minutos} min`);
      for (;;) {
        try {
          await executarVarredura({ config, db, tg });
          exportarDados(db, config.dados);
        } catch (e) {
          log('⚠️ varredura falhou:', e.message);
        }
        await dormir(minutos * 60e3);
      }
    }
    case 'site': {
      const d = exportarSite(db, config);
      console.log(`docs/dados.json: ${d.ofertas.length} ofertas, ${d.alertas.length} alertas`);
      break;
    }
    case 'status':
      console.log(estatisticas(db));
      break;
    case 'testar-telegram': {
      if (!tg.ativo) throw new Error('defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID');
      await tg.enviar('✅ <b>Radar de Ofertas</b> conectado. Mande /ajuda.');
      console.log('mensagem enviada');
      break;
    }
    default:
      console.log(AJUDA);
  }
} catch (e) {
  console.error('erro:', e.message);
  process.exitCode = 1;
} finally {
  exportarDados(db, config.dados);
  db.close();
}
