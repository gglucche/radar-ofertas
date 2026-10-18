// Utilidades compartilhadas: download com retry, log, tempo.
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Cabeçalhos parecidos com os de um navegador real (alguns sites filtram por eles).
const CABECALHOS_NAVEGADOR = {
  'user-agent': UA,
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

export const agora = () => new Date().toISOString();
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/** Mensagem de erro útil (undici esconde a causa em e.cause). */
export function descreverErro(e) {
  const causa = e?.cause?.code || e?.cause?.message;
  return causa ? `${e.message} (${causa})` : e?.message || String(e);
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
          ...CABECALHOS_NAVEGADOR,
          accept: tipo === 'json' ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          ...(tipo === 'json' ? { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site' } : {}),
          ...headers,
        },
      });
      if (!res.ok) {
        const mit = res.headers.get('cf-mitigated');
        throw new Error(`HTTP ${res.status}${mit ? ` (cloudflare ${mit})` : ''} em ${url}`);
      }
      return tipo === 'json' ? await res.json() : await res.text();
    } catch (e) {
      erro = e.name === 'AbortError' ? new Error(`timeout de ${timeoutMs}ms em ${url}`) : new Error(descreverErro(e).includes(url) ? descreverErro(e) : `${descreverErro(e)} em ${url}`);
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
