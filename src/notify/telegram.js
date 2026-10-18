// Cliente mínimo da Bot API do Telegram (sem dependências).
export class Telegram {
  constructor(token, chatId) {
    this.token = token || '';
    this.chatId = chatId || '';
  }

  get ativo() {
    return Boolean(this.token && this.chatId);
  }

  async api(metodo, corpo = {}) {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description || 'HTTP ' + res.status}`);
    return j.result;
  }

  /** Envia HTML (max 4096 chars; quebra em partes se precisar). */
  async enviar(texto, { chatId = this.chatId, preview = false } = {}) {
    const partes = [];
    let atual = '';
    for (const linha of String(texto).split('\n')) {
      if ((atual + '\n' + linha).length > 4000) {
        partes.push(atual);
        atual = linha;
      } else atual = atual ? atual + '\n' + linha : linha;
    }
    if (atual) partes.push(atual);
    let ultimo;
    for (const p of partes) {
      ultimo = await this.api('sendMessage', { chat_id: chatId, text: p, parse_mode: 'HTML', disable_web_page_preview: !preview });
    }
    return ultimo;
  }

  async atualizacoes(offset = 0) {
    return this.api('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
  }

  async definirComandos() {
    return this.api('setMyCommands', {
      commands: [
        { command: 'buscar', description: 'Buscar um produto agora: /buscar rtx 4070' },
        { command: 'vigiar', description: 'Vigiar: /vigiar rtx 4070 -notebook 3000' },
        { command: 'lista', description: 'Listar vigias' },
        { command: 'parar', description: 'Remover vigia: /parar 3' },
        { command: 'status', description: 'Estado do radar' },
        { command: 'ajuda', description: 'Ajuda' },
      ],
    });
  }
}
