// Banco SQLite (node:sqlite, sem dependência nativa). Um arquivo em data/ofertas.db,
// versionado no repositório pela própria varredura (padrão "git scraping").
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { agora } from './util.js';
import { normalizar, combina } from './normalize.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ofertas (
  id INTEGER PRIMARY KEY,
  fonte TEXT NOT NULL,
  fonte_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  titulo_norm TEXT NOT NULL,
  preco REAL,
  preco_antigo REAL,
  desconto_pct REAL,
  loja TEXT,
  url TEXT NOT NULL,
  imagem TEXT,
  temperatura REAL DEFAULT 0,
  publicado_em TEXT,
  visto_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE(fonte, fonte_id)
);
CREATE INDEX IF NOT EXISTS idx_ofertas_atualizado ON ofertas(atualizado_em);
CREATE INDEX IF NOT EXISTS idx_ofertas_visto ON ofertas(visto_em);
CREATE TABLE IF NOT EXISTS precos (
  id INTEGER PRIMARY KEY,
  oferta_id INTEGER NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
  preco REAL NOT NULL,
  visto_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_precos_oferta ON precos(oferta_id);
CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY,
  oferta_id INTEGER NOT NULL REFERENCES ofertas(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  detalhe TEXT,
  prioridade INTEGER DEFAULT 1,
  preco REAL,
  criado_em TEXT NOT NULL,
  enviado_em TEXT,
  UNIQUE(oferta_id, motivo)
);
CREATE TABLE IF NOT EXISTS vigias (
  id INTEGER PRIMARY KEY,
  termos TEXT NOT NULL,
  excluir TEXT NOT NULL DEFAULT '[]',
  preco_max REAL,
  chat_id TEXT,
  criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS estado (chave TEXT PRIMARY KEY, valor TEXT);
`;

const limite = (dias) => new Date(Date.now() - dias * 86400e3).toISOString();

export function abrirBanco(caminho) {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

/**
 * Insere ou atualiza ofertas. Registra mudança de preço em `precos`.
 * @returns {Array} itens com {id, nova, precoMudou, precoAnterior, titulo_norm, ...oferta}
 */
export function salvarOfertas(db, ofertas) {
  const sel = db.prepare('SELECT id, preco, temperatura, url, atualizado_em FROM ofertas WHERE fonte = ? AND fonte_id = ?');
  const ins = db.prepare(`INSERT INTO ofertas
    (fonte, fonte_id, titulo, titulo_norm, preco, preco_antigo, desconto_pct, loja, url, imagem, temperatura, publicado_em, visto_em, atualizado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const upd = db.prepare(`UPDATE ofertas SET titulo=?, titulo_norm=?, preco=COALESCE(?, preco), preco_antigo=COALESCE(?, preco_antigo),
    desconto_pct=COALESCE(?, desconto_pct), loja=COALESCE(?, loja), url=?, imagem=COALESCE(?, imagem), temperatura=?,
    publicado_em=COALESCE(?, publicado_em), atualizado_em=? WHERE id=?`);
  const insPreco = db.prepare('INSERT INTO precos (oferta_id, preco, visto_em) VALUES (?,?,?)');
  const t = agora();
  const itens = [];
  db.exec('BEGIN');
  try {
    for (const o of ofertas) {
      if (!o || !o.titulo || !o.url || o.fonte_id == null || o.ativa === false) continue;
      const norm = normalizar(o.titulo);
      const fonteId = String(o.fonte_id);
      const atual = sel.get(o.fonte, fonteId);
      const preco = o.preco ?? null;
      if (!atual) {
        const r = ins.run(o.fonte, fonteId, o.titulo, norm, preco, o.preco_antigo ?? null, o.desconto_pct ?? null,
          o.loja ?? null, o.url, o.imagem ?? null, o.temperatura ?? 0, o.publicado_em ?? null, t, t);
        const id = Number(r.lastInsertRowid);
        if (preco != null) insPreco.run(id, preco, t);
        itens.push({ ...o, id, titulo_norm: norm, nova: true, precoMudou: false, precoAnterior: null });
      } else {
        const mudou = preco != null && (atual.preco == null || Math.abs(preco - atual.preco) > 0.009);
        // Só reescreve a linha quando algo relevante mudou ou a cada 6h ("visto por último"):
        // menos churn nos arquivos versionados no git.
        const tocar = mudou || (o.temperatura ?? 0) !== (atual.temperatura ?? 0) || o.url !== atual.url
          || Date.parse(atual.atualizado_em) < Date.now() - 6 * 3600e3;
        if (tocar) {
          upd.run(o.titulo, norm, preco, o.preco_antigo ?? null, o.desconto_pct ?? null, o.loja ?? null, o.url,
            o.imagem ?? null, o.temperatura ?? 0, o.publicado_em ?? null, t, atual.id);
        }
        if (mudou) insPreco.run(atual.id, preco, t);
        itens.push({ ...o, id: atual.id, preco: preco ?? atual.preco, titulo_norm: norm, nova: false, precoMudou: mudou, precoAnterior: atual.preco });
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return itens;
}

/** Ofertas com preço vistas dentro da janela (para comparação histórica). */
export function ofertasJanela(db, dias) {
  return db
    .prepare('SELECT id, fonte, fonte_id, titulo, titulo_norm, preco, loja, url, visto_em, atualizado_em FROM ofertas WHERE preco IS NOT NULL AND atualizado_em >= ?')
    .all(limite(dias));
}

/** Preços anteriores de uma oferta (exclui o registro mais recente). */
export function precosAnteriores(db, ofertaId) {
  const rows = db.prepare('SELECT preco FROM precos WHERE oferta_id = ? ORDER BY visto_em ASC, id ASC').all(ofertaId);
  return rows.slice(0, -1).map((r) => r.preco);
}

export function historicoPrecos(db, ofertaId) {
  return db.prepare('SELECT preco, visto_em FROM precos WHERE oferta_id = ? ORDER BY visto_em ASC, id ASC').all(ofertaId);
}

/** @returns {boolean} true se criou (false = já existia) */
export function criarAlerta(db, a) {
  const r = db
    .prepare('INSERT OR IGNORE INTO alertas (oferta_id, motivo, detalhe, prioridade, preco, criado_em) VALUES (?,?,?,?,?,?)')
    .run(a.oferta_id, a.motivo, a.detalhe ?? null, a.prioridade ?? 1, a.preco ?? null, agora());
  return Number(r.changes) > 0;
}

export function alertasPendentes(db, max = 15) {
  return db
    .prepare(`SELECT a.id, a.oferta_id, a.motivo, a.detalhe, a.prioridade, a.preco AS preco_alerta, a.criado_em,
        o.fonte, o.titulo, o.preco, o.preco_antigo, o.desconto_pct, o.loja, o.url, o.imagem, o.temperatura
      FROM alertas a JOIN ofertas o ON o.id = a.oferta_id
      WHERE a.enviado_em IS NULL ORDER BY a.prioridade DESC, a.criado_em ASC LIMIT ?`)
    .all(max);
}

export function marcarEnviados(db, ids) {
  if (!ids.length) return;
  const st = db.prepare('UPDATE alertas SET enviado_em = ? WHERE id = ?');
  const t = agora();
  for (const id of ids) st.run(t, id);
}

/** Alertas que ficaram pendentes por muito tempo deixam de valer (oferta já passou). */
export function descartarPendentesAntigos(db, horas = 48) {
  db.prepare("UPDATE alertas SET enviado_em = 'descartado' WHERE enviado_em IS NULL AND criado_em < ?").run(limite(horas / 24));
}

export function alertasRecentes(db, dias = 7, max = 200) {
  return db
    .prepare(`SELECT a.id, a.motivo, a.detalhe, a.prioridade, a.criado_em, a.enviado_em,
        o.fonte, o.titulo, o.preco, o.preco_antigo, o.desconto_pct, o.loja, o.url, o.imagem
      FROM alertas a JOIN ofertas o ON o.id = a.oferta_id WHERE a.criado_em >= ? ORDER BY a.criado_em DESC LIMIT ?`)
    .all(limite(dias), max);
}

// ---- vigias dinâmicas (criadas pelo Telegram/CLI) ----
export function listarVigias(db) {
  return db.prepare('SELECT * FROM vigias ORDER BY id').all().map((v) => ({
    id: v.id,
    termos: JSON.parse(v.termos),
    excluir: JSON.parse(v.excluir || '[]'),
    preco_max: v.preco_max,
    chat_id: v.chat_id,
    origem: 'banco',
  }));
}

export function adicionarVigia(db, { termos, excluir = [], preco_max = null, chat_id = null }) {
  const r = db
    .prepare('INSERT INTO vigias (termos, excluir, preco_max, chat_id, criado_em) VALUES (?,?,?,?,?)')
    .run(JSON.stringify(termos), JSON.stringify(excluir), preco_max, chat_id, agora());
  return Number(r.lastInsertRowid);
}

export function removerVigia(db, id) {
  return Number(db.prepare('DELETE FROM vigias WHERE id = ?').run(id).changes) > 0;
}

// ---- estado (ex.: offset do Telegram) ----
export function obterEstado(db, chave) {
  return db.prepare('SELECT valor FROM estado WHERE chave = ?').get(chave)?.valor ?? null;
}
export function definirEstado(db, chave, valor) {
  db.prepare('INSERT INTO estado (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, String(valor));
}

/** Busca no histórico local: todas as palavras do termo presentes no título. */
export function buscarLocal(db, vigia, dias = 60, max = 50) {
  return ofertasJanela(db, dias)
    .filter((o) => combina(vigia, o.titulo_norm))
    .sort((a, b) => a.preco - b.preco)
    .slice(0, max);
}

export function podar(db, retencaoDias = 90) {
  const r = db.prepare('DELETE FROM ofertas WHERE atualizado_em < ?').run(limite(retencaoDias));
  if (Number(r.changes) > 0) db.exec('VACUUM');
  return Number(r.changes);
}

// ---- persistência em texto (JSONL) para versionar no git ----
// O SQLite é só o motor local; o que vai para o repositório são estes arquivos,
// um por tabela, uma linha por registro, ordenados por id (diffs pequenos).
const TABELAS = ['ofertas', 'precos', 'alertas', 'vigias', 'estado'];

export function exportarDados(db, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const t of TABELAS) {
    const rows = db.prepare(`SELECT * FROM ${t} ORDER BY ${t === 'estado' ? 'chave' : 'id'}`).all();
    const texto = rows.map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(path.join(dir, `${t}.jsonl`), texto ? texto + '\n' : '');
  }
}

/** Se o banco está vazio (runner novo do GitHub Actions), recarrega dos JSONL. @returns linhas importadas */
export function importarSeVazio(db, dir) {
  if (Number(db.prepare('SELECT COUNT(*) AS n FROM ofertas').get().n) > 0) return 0;
  let importados = 0;
  db.exec('BEGIN');
  try {
    for (const t of TABELAS) {
      const p = path.join(dir, `${t}.jsonl`);
      if (!fs.existsSync(p)) continue;
      const linhas = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
      if (!linhas.length) continue;
      const cols = Object.keys(JSON.parse(linhas[0]));
      const st = db.prepare(`INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const l of linhas) {
        const r = JSON.parse(l);
        st.run(...cols.map((c) => r[c] ?? null));
        importados++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return importados;
}

export function estatisticas(db) {
  const n = (sql) => Number(db.prepare(sql).get().n);
  return {
    ofertas: n('SELECT COUNT(*) AS n FROM ofertas'),
    precos: n('SELECT COUNT(*) AS n FROM precos'),
    alertas: n('SELECT COUNT(*) AS n FROM alertas'),
    pendentes: n('SELECT COUNT(*) AS n FROM alertas WHERE enviado_em IS NULL'),
    vigias: n('SELECT COUNT(*) AS n FROM vigias'),
    ultima_atualizacao: db.prepare('SELECT MAX(atualizado_em) AS v FROM ofertas').get().v,
  };
}
