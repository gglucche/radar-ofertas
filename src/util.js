// Utilidades compartilhadas: download com retry, log, tempo.
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const agora = () => new Date().toISOString();
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/**
 * Baixa uma URL com user-agent de navegador, timeout e retry simples.
 * @param {string} url
 * @param {{tipo?: 'text'|'json', tentativas?: number, timeoutMs?: number, headers?: Record<string,string>}} [opts]
 */
export async function baixar(url, { tipo = 'text', tentativas = 2, timeoutMs = 25000, headers = {} } = {}) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'user-agent': UA,
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5',
          accept: tipo === 'json' ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8',
          ...headers,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return tipo === 'json' ? await res.json() : await res.text();
    } catch (e) {
      erro = e;
      if (i + 1 < tentativas) await dormir(800 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw erro;
}

/** Remove duplicatas por (fonte, fonte_id), mantendo a primeira ocorrência. */
export function unicas(ofertas) {
  const vistos = new Set();
  return ofertas.filter((o) => {
    const k = `${o.fonte}:${o.fonte_id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export function escaparHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
