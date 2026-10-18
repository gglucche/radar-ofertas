// Carrega config.yml, watchlist.yml e variáveis de ambiente (.env ou secrets).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(RAIZ, '.env'));
} catch {
  /* sem .env: usa variáveis já definidas (secrets do GitHub Actions) */
}

const PADRAO = {
  fontes: {
    pelando: { ativo: true, paginas: 2 },
    promobit: { ativo: true, paginas: 2 },
    gatry: { ativo: true, paginas: 2 },
    kabum: { ativo: true, paginas: 1 },
  },
  busca_ativa: true,
  regras: {
    desconto_minimo_pct: 60,
    temperatura_quente: 500,
    curtidas_quente: 30,
    queda_historica: 0.75,
    amostras_minimas: 3,
    janela_dias: 60,
    preco_minimo: 20,
    alertas_globais: true,
  },
  retencao_dias: 90,
  notificacoes: {
    telegram: { ativo: true },
    ntfy: { ativo: false, topico: '' },
    max_por_execucao: 15,
  },
};

function mesclar(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? mesclar(base[k], v) : v;
  }
  return out;
}

function lerYaml(nome) {
  const p = path.join(RAIZ, nome);
  if (!fs.existsSync(p)) return {};
  return YAML.parse(fs.readFileSync(p, 'utf8')) || {};
}

export function carregarConfig() {
  const cfg = mesclar(PADRAO, lerYaml('config.yml'));
  cfg.telegram = {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chat_id: process.env.TELEGRAM_CHAT_ID || '',
  };
  if (process.env.NTFY_TOPICO) cfg.notificacoes.ntfy = { ativo: true, topico: process.env.NTFY_TOPICO };
  cfg.dados = process.env.RADAR_DADOS || path.join(RAIZ, 'data'); // JSONL versionados no git
  cfg.banco = process.env.RADAR_DB || path.join(cfg.dados, 'ofertas.db'); // cache SQLite (ignorado pelo git)
  cfg.docs = path.join(RAIZ, 'docs');
  // Só o runner (efêmero) precisa exportar JSONL/dados.json a cada execução. Local e Docker
  // guardam estado no próprio SQLite; exportar ali sobrescreveria o histórico mais novo do bot.
  cfg.exportar = process.env.GITHUB_ACTIONS === 'true' || process.env.RADAR_EXPORTAR === '1';
  return cfg;
}

const lista = (v) => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

/** Vigias do watchlist.yml -> [{termos, excluir, preco_max, origem:'arquivo'}] */
export function carregarWatchlist() {
  const y = lerYaml('watchlist.yml');
  return (y.vigias || [])
    .map((v) => (typeof v === 'string' ? { termos: v } : v))
    .map((v) => ({
      termos: lista(v.termos),
      excluir: lista(v.excluir),
      preco_max: v.preco_max != null ? Number(v.preco_max) : null,
      origem: 'arquivo',
    }))
    .filter((v) => v.termos.length);
}
