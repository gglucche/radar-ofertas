// Exporta docs/dados.json para a página estática (GitHub Pages) em docs/index.html.
// Um registro por linha, ordenado por id: diffs pequenos no git.
import fs from 'node:fs';
import path from 'node:path';
import { alertasRecentes, estatisticas } from './db.js';
import { listarTodasVigias } from './comandos.js';
import { chaveVigia } from './normalize.js';

export function exportarSite(db, config) {
  const ofertas = db
    .prepare(`SELECT id, fonte, titulo, preco, preco_antigo, desconto_pct, loja, url, imagem, temperatura, visto_em, atualizado_em
      FROM ofertas ORDER BY id DESC LIMIT 300`)
    .all();
  const alertas = alertasRecentes(db, 7, 200);
  const vigias = listarTodasVigias(db).map((v) => ({ id: v.id ?? null, chave: chaveVigia(v), preco_max: v.preco_max }));
  const linhas = (arr) => arr.map((x) => '  ' + JSON.stringify(x)).join(',\n');
  const texto =
    `{\n"gerado_em": ${JSON.stringify(new Date().toISOString())},\n` +
    `"estatisticas": ${JSON.stringify(estatisticas(db))},\n` +
    `"vigias": ${JSON.stringify(vigias)},\n` +
    `"alertas": [\n${linhas(alertas)}\n],\n` +
    `"ofertas": [\n${linhas(ofertas)}\n]\n}\n`;
  fs.mkdirSync(config.docs, { recursive: true });
  fs.writeFileSync(path.join(config.docs, 'dados.json'), texto);
  return { ofertas, alertas, vigias };
}
