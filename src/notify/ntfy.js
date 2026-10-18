// ntfy.sh: push grátis sem cadastro. Instale o app, assine um tópico secreto e pronto.
export async function enviarNtfy(topico, { titulo, texto, url, tags = ['moneybag'] }) {
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topico)}`, {
    method: 'POST',
    headers: {
      // cabeçalhos HTTP só aceitam latin1; o corpo vai em UTF-8 normalmente
      Title: String(titulo || 'Radar de Ofertas').replace(/[^\x20-\xff]/g, ''),
      Tags: tags.join(','),
      ...(url ? { Click: url } : {}),
    },
    body: texto,
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
}
