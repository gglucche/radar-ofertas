// Normalização de texto e preço, comparação com vigias.

/** minúsculas, sem acento, só letras/números separados por espaço */
export function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "R$ 1.234,56" -> 1234.56 ; número -> número ; inválido/zero -> null */
export function precoBR(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null;
  const s = String(valor).replace(/\s/g, '');
  const m = s.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] ?? '0').padEnd(2, '0'));
  return v > 0 ? v : null;
}

/** regex de termo com fronteira de palavra sobre texto já normalizado */
export function termoRegex(termo) {
  const n = normalizar(termo);
  if (!n) return null;
  return new RegExp('(^|\\s)' + n.replace(/\s+/g, '\\s+') + '(?=\\s|$)');
}

/** Vigia = { termos: string[], excluir?: string[] }. Todos os termos presentes e nenhum excluído. */
export function combina(vigia, tituloNorm) {
  const termos = (vigia.termos || []).map(termoRegex).filter(Boolean);
  if (!termos.length) return false;
  if (!termos.every((r) => r.test(tituloNorm))) return false;
  const excl = (vigia.excluir || []).map(termoRegex).filter(Boolean);
  return !excl.some((r) => r.test(tituloNorm));
}

export function chaveVigia(vigia) {
  const t = (vigia.termos || []).map(normalizar).join(' ');
  const e = (vigia.excluir || []).map(normalizar).filter(Boolean);
  return e.length ? `${t} -${e.join(' -')}` : t;
}

export function formataPreco(v) {
  if (v == null) return 'sem preço';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function mediana(valores) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** "18/10/2026 às 15:09" -> ISO (horário de Brasília) ; falha -> null */
export function dataBR(texto = '') {
  const m = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = '00', mi = '00'] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

/** true se a data ISO é mais antiga que `dias` */
export function maisAntigoQue(iso, dias) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t > dias * 86400e3;
}
