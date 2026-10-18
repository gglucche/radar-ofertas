# 📡 radar-ofertas

Varre os principais sites de ofertas do Brasil, guarda o histórico de preços e avisa no Telegram quando um produto aparece **anormalmente barato**. Roda de graça no GitHub Actions (sem servidor), com busca de produto específico pela linha de comando, pelo bot do Telegram ou por uma página estática no GitHub Pages.

## Como funciona

```
GitHub Actions (cron a cada 30 min)
  └─ node src/cli.js varrer
       1. lê comandos novos do bot do Telegram (/buscar, /vigiar...)
       2. varre as fontes: Pelando, Promobit, Gatry, KaBuM!
       3. procura cada vigia diretamente nas fontes (busca ativa)
       4. grava tudo num SQLite local com histórico de preços
       5. aplica as regras de "anormalmente barato" e cria alertas
       6. envia os alertas (Telegram e/ou ntfy)
       7. exporta data/*.jsonl e docs/dados.json e faz commit no repositório
```

O histórico vive dentro do repositório (padrão *git scraping*): cada varredura no Actions faz commit de `data/*.jsonl` (um arquivo por tabela, um registro por linha) e de `docs/dados.json`. O SQLite é só um cache local, reconstruído a partir dos JSONL quando o runner começa vazio. Nada de servidor, nada de banco externo, custo zero, e como é texto os diffs no git ficam pequenos.

Rodando local ou em Docker o estado fica só no SQLite (`data/ofertas.db`, ignorado pelo git); os JSONL não são reescritos, para não sobrescrever o histórico mais novo do bot quando você fizer commit. Para forçar, use `--exportar`.

### Fontes

| Fonte | Como é lida | Busca de produto |
|---|---|---|
| [Pelando](https://www.pelando.com.br) | HTML de `/recentes` (server-side) | `/busca/<termo>` |
| [Promobit](https://www.promobit.com.br) | API JSON do próprio site (`api.promobit.com.br/offers`) | `api.promobit.com.br/search?q=` |
| [Gatry](https://gatry.com) | HTML de `/promocoes` | `/promocoes?q=` |
| [KaBuM!](https://www.kabum.com.br) | API de catálogo do próprio site | `catalog/v2/products?query=` |

Pelando, Promobit e Gatry já agregam ofertas de Amazon, Mercado Livre, Magalu, Casas Bahia, AliExpress etc., então a cobertura de lojas é ampla sem precisar raspar cada loja. A KaBuM! entra como loja direta porque o id de produto é estável, o que dá histórico de preço exato por produto.

### O que conta como "anormalmente barato"

| Motivo | Regra (valores em `config.yml`) |
|---|---|
| 🎯 **vigia** | O título casa com uma vigia e: com `preco_max`, preço ≤ `preco_max`; sem `preco_max`, preço ≤ 75% da mediana das ofertas já vistas para essa vigia (mínimo 3) **ou** novo mínimo histórico. |
| 📉 **historico** | A mesma oferta/produto já foi vista mais cara e caiu para ≤ 75% da mediana anterior (típico da KaBuM!). |
| 💸 **desconto** | Desconto declarado pela fonte ≥ 60%. |
| 🔥 **quente** | Pelando ≥ 500° ou Promobit ≥ 30 curtidas (a comunidade validou). |

Cada oferta gera no máximo um alerta por motivo. Alertas globais ignoram itens abaixo de R$ 20 e podem ser desligados (`alertas_globais: false`) para receber só as vigias.

## Colocar para rodar (grátis, no GitHub Actions)

1. **Crie o bot no Telegram**: fale com [@BotFather](https://t.me/BotFather), `/newbot`, guarde o token.
2. **Descubra seu chat id**: mande qualquer mensagem para o bot e abra `https://api.telegram.org/bot<TOKEN>/getUpdates`; o número em `message.chat.id` é o seu chat id.
3. No repositório: **Settings → Secrets and variables → Actions → New repository secret**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `NTFY_TOPICO` (opcional, se preferir o app [ntfy](https://ntfy.sh))
4. **Settings → Actions → General**: permita que workflows rodem e, em *Workflow permissions*, marque **Read and write permissions** (o workflow faz commit do banco).
5. Aba **Actions → varrer → Run workflow** para a primeira execução. Depois disso roda sozinho a cada 30 minutos.
6. (Opcional) **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`** para ter a página de alertas e busca.
7. Deu algo errado com alguma fonte? Aba **Actions → diagnostico → Run workflow** mostra o que cada site responde a partir do runner.

Repositório público = minutos de Actions ilimitados. Em repositório privado, 48 execuções/dia de ~1 min cabem nos 2.000 min/mês grátis, mas fique de olho.

> O GitHub desativa crons de repositórios sem atividade por 60 dias. Como cada varredura faz commit, isso não acontece aqui.

### Vigiar um produto específico

Edite `watchlist.yml` (faz commit, a próxima varredura já usa):

```yaml
vigias:
  - termos: [rtx 4070]
    excluir: [notebook, pc gamer]
    preco_max: 3000
  - termos: [ssd, 2tb, nvme]
    preco_max: 600
  - termos: [air fryer]   # sem teto: avisa quando ficar bem abaixo do histórico
```

Ou pelo Telegram, sem mexer em arquivo:

```
/vigiar rtx 4070 -notebook -ti 3000    cria vigia (último número = preço máximo)
/buscar rtx 4070                       busca agora nas fontes + histórico
/lista                                 vigias ativas
/parar 3                               remove a vigia #3
/status
```

Qualquer texto sem barra vira `/buscar`. Como o bot é lido a cada varredura, a resposta pode levar até 30 minutos no GitHub Actions. Para resposta imediata use a CLI ou o modo contínuo (abaixo).

Também dá para disparar uma busca pela aba Actions: **varrer → Run workflow → campo "buscar"**; o resultado chega no Telegram.

## Rodar local

Precisa de Node 22.13+ (usa o `node:sqlite` embutido, sem dependência nativa).

```bash
npm install
cp .env.example .env     # preencha o token e o chat id
node src/cli.js testar-telegram
node src/cli.js varrer --sem-notificar
node src/cli.js buscar rtx 4070
node src/cli.js vigiar "air fryer" -forno 400
node src/cli.js lista
npm test
```

## Rodar contínuo (VPS, Oracle Cloud Always Free, Raspberry Pi)

Para intervalo menor que 30 min e respostas instantâneas no Telegram:

```bash
docker build -t radar-ofertas .
docker run -d --restart unless-stopped --env-file .env -v radar-dados:/dados radar-ofertas
```

Ou sem Docker: `node src/cli.js loop 10` (varre a cada 10 minutos).

## Estrutura

```
src/cli.js            comandos (varrer, buscar, vigiar, loop...)
src/varredura.js      orquestra uma execução
src/sources/*.js      um arquivo por fonte: varrer({paginas}) e buscar(termo)
src/detector.js       regras de "anormalmente barato"
src/db.js             SQLite: ofertas, precos, alertas, vigias
src/notify/           telegram.js, ntfy.js
src/comandos.js       bot do Telegram
src/site.js           exporta docs/dados.json
docs/index.html       página estática (GitHub Pages) com filtro por produto
config.yml            fontes, regras e notificações
watchlist.yml         produtos vigiados
data/*.jsonl          histórico versionado (ofertas, precos, alertas, vigias, estado)
data/ofertas.db       cache SQLite local (ignorado pelo git)
```

Para adicionar uma fonte: crie `src/sources/nome.js` exportando `nome`, `varrer` e `buscar` devolvendo objetos `{fonte, fonte_id, titulo, preco, preco_antigo, desconto_pct, loja, url, imagem, temperatura, publicado_em}` e registre em `src/sources/index.js`.

## Projetos de código aberto pesquisados antes de escrever este

| Projeto | Estrelas | O que faz | Por que não serviu direto |
|---|---|---|---|
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | ~35k | Monitor genérico de mudanças em páginas, com detecção de preço | Precisa de servidor 24/7; monitora URLs fixas, não "varre" sites de ofertas |
| [PriceBuddy](https://github.com/jez500/pricebuddy) | ~1.4k | Rastreia preço de produtos em qualquer loja, alertas por Telegram/e-mail | Docker + PHP; por URL de produto, sem agregadores brasileiros |
| [Discount Bandit](https://github.com/Cyb3rGhoul/Discount-Bandit) | ~650 | Rastreador multiusuário (Amazon, eBay, Walmart...) | Lojas internacionais; precisa de servidor |
| [gafanhoto](https://github.com/robsonbittencourt/gafanhoto) | 52 | Monitora o fórum Hardmob e avisa no Telegram | Java/Spring; só Hardmob (hoje atrás do Cloudflare) |
| [hardmob_promo](https://github.com/leandrotoledo/hardmob_promo) | 11 | Canal @hardmob_promo no Telegram | Só Hardmob |
| [Sieve](https://github.com/koobzaar/Sieve) | 3 | Pelando + canais do Telegram, filtro BM25 e Gemini | Foco em filtro por linguagem natural; precisa de servidor |
| [PelandoBot](https://github.com/GustavoJST/PelandoBot) | 1 | Pelando → Telegram por tags | Usa endpoint GraphQL do Pelando que já saiu do ar |

A ideia aqui foi combinar o que esses fazem de bom (agregadores brasileiros, Telegram, histórico) num projeto pequeno, sem servidor e com detecção de anomalia de preço.

## Limitações conhecidas

- **Pelando bloqueia o GitHub Actions**: o site inteiro (inclusive a API e o sitemap) fica atrás do desafio do Cloudflare para IPs de datacenter fora do Brasil, então no Actions a fonte falha com `HTTP 403 (cloudflare challenge)` e as outras seguem normalmente. Rodando local ou numa VPS brasileira o Pelando funciona. Para silenciar o aviso no Actions, ponha `pelando: { ativo: false }` em `config.yml`.
- **Gatry e DNS**: os servidores DNS do gatry.com (UOL) não respondem a resolvedores fora do Brasil. O workflow contorna isso resolvendo o load balancer da AWS e escrevendo em `/etc/hosts` (passo "DNS alternativo"). Se o Gatry mudar de infraestrutura, ajuste `GATRY_CNAME` no workflow.
- Mercado Livre e Amazon não são lidos diretamente (a API do ML exige token e a Amazon bloqueia robôs), mas as ofertas deles aparecem via Pelando/Promobit/Gatry.
- Hardmob está atrás de desafio do Cloudflare; não foi incluído.
- Os sites podem mudar o HTML/API a qualquer momento. Cada fonte falha de forma isolada e o resto da varredura continua; os erros aparecem no log do workflow.
- Use com moderação: a varredura padrão faz ~10 requisições por execução, o que é bem leve para os sites.

## Licença

MIT
