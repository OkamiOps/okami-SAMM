<!-- Idioma: **Português** · [English](README.md) -->

# Okami SAMM

> 🌐 [English](README.md) · **Português (Brasil)**

**Avaliação de maturidade de segurança OWASP SAMM v2** da Okami — meça a
maturidade do ciclo de desenvolvimento seguro em **5 funções de negócio · 15
práticas · 90 perguntas** (inglês/português), visualize o scorecard, planeje o
roadmap e exporte um relatório PDF com a identidade visual da Okami.

<p align="center">
  <img src="docs/images/app-scorecard.png" alt="Okami SAMM — scorecard com radar de maturidade" width="860">
</p>

---

## ✨ Funcionalidades

- **Avaliação guiada** — 90 perguntas do OWASP SAMM v2 em dois streams (A/B), níveis 1–3, com notas de entrevista por pergunta.
- **Scorecard ao vivo** — maturidade geral, scores por função e por prática, radar de maturidade e KPIs de práticas na meta.
- **Roadmap** — nível atual, lacuna até a meta e próximo nível a conquistar para cada prática, com sugestões opcionais personalizadas por IA.
- **Histórico & comparativo** — salve snapshots e acompanhe a evolução da maturidade ao longo do tempo.
- **Persistência em SQLite** — salve avaliações de clientes no servidor, liste, recarregue e re-emita relatórios.
- **PDF Okami** — relatório multipágina: capa, sumário, resumo executivo, metodologia, achados por função, roadmap priorizado com ações concretas, evolução da maturidade (quando há snapshots), conclusão e apêndice de notas da avaliação.
- **Bilíngue** — UI e relatórios completos em inglês/português.
- **Operável por IA (MCP + ACP)** — agentes de IA leem **e operam** o sistema via **MCP** (HTTP + stdio) e os dois protocolos **ACP** (Agent Communication + Agent Client): criam avaliações, respondem perguntas, calculam, planejam e geram relatório.
- **Self-contained** — o React é embutido localmente; o app renderiza mesmo offline / atrás de CSP.

---

## 📸 Capturas de tela

|  |  |
|---|---|
| ![Início & escopo](docs/images/app-setup.png) | ![Roadmap & próximos passos](docs/images/app-roadmap.png) |
| **Início & escopo** — defina o cliente/equipe e leia o modelo SAMM. | **Roadmap** — lacunas, próximo nível e ações por prática. |

---

## 📄 O relatório PDF

Documento de 9 páginas seguindo a identidade visual "OKAMI · Security Assessment
Report" (Space Grotesk, papel branco-frio, acentos de marca por função):

| | |
|---|---|
| ![Capa](docs/images/pdf-cover.png) | ![Resumo executivo](docs/images/pdf-exec.png) |
| **Capa** — dark, gradientes de marca, metadados do escopo. | **01 Resumo executivo** — métricas, barras por função, radar. |
| ![Metodologia](docs/images/pdf-methodology.png) | ![Roadmap](docs/images/pdf-roadmap.png) |
| **02 Metodologia** — as 5 funções, scoring, níveis 0–3. | **04 Roadmap** — práticas prioritárias com ações recomendadas. |

Estrutura completa (as seções se adaptam aos dados — evolução e apêndice aparecem só quando fazem sentido):

- **Capa** (dark, gradientes de marca) + **Sumário** (com números de página)
- **01 Resumo executivo** — métricas, barras por função, radar de maturidade
- **02 Metodologia** — as 5 funções, como o score é calculado, níveis 0–3
- **03 Maturidade por função** — tabelas por prática com análise de destaque/atenção
- **04 Roadmap — Próximos passos** — práticas prioritárias com **ações recomendadas** derivadas dos critérios/guidance do SAMM (sem precisar de IA)
- **05 Evolução da maturidade** — tendência geral entre snapshots (quando há ≥1 snapshot)
- **06 Conclusão** — interpretação, prioridades imediatas e recomendação
- **Apêndice** — notas de entrevista por prática (quando há notas)

---

## 🚀 Início rápido

```bash
npm install
npx playwright install chromium      # baixa o Chromium (uma vez), p/ o PDF
cp .env.example .env                 # ajuste a porta / chave de IA se quiser
npm start                            # http://localhost:3000
```

Sem chave de IA o app funciona normalmente — apenas as sugestões de IA do Roadmap ficam ocultas.

```bash
npm test    # tests/offline-render.js — o app deve renderizar com o CDN bloqueado
```

---

## 🧩 Como funciona

```
            Cloudflare Pages                         Container (Render/Railway/Fly/VPS)
┌─────────────────────────────────┐        ┌──────────────────────────────────────────┐
│  public/  (app SAMM estático)    │        │  Express                                   │
│  • React embutido (sem CDN)      │        │  • /api/assessments  → better-sqlite3      │
│  • app-bridge.js  ──────────────────┐     │  • /api/report.pdf   → Playwright/Chromium │
│  functions/api/[[path]].js  ──proxy─┼────▶│  • /api/ai/suggest   → OpenAI/Anthropic    │
└─────────────────────────────────┘   /api/*└──────────────────────────────────────────┘
```

- **Frontend** — o app standalone do Design Canvas (`public/`); o React (dc-runtime) boota sozinho. Mantém um rascunho em `localStorage` e fala com a API via `public/app-bridge.js`. O React/ReactDOM são **embutidos** em `public/vendor/` (sem CDN em runtime).
- **Backend** — Node + Express + `better-sqlite3`. O scoring (`server/score.js`) espelha o frontend para o servidor montar relatórios a partir do estado salvo.
- **PDF** — Playwright (Chromium headless) renderiza `server/report/render.js` num PDF A4.
- **IA (opcional)** — proxy multi-provider; o botão de IA só aparece se houver chave configurada.

---

## 🔐 Contas & acesso

Usuários locais (sem nuvem). No primeiro run o app te leva para uma tela de
**Criar admin**; depois, todos entram com usuário + senha. Dois papéis:

- **admin** — tudo, mais gestão de usuários e (em breve) configurações.
- **user** — fazer avaliações e relatórios.

Os dados são um **workspace compartilhado** (todos veem todas as avaliações). Os
agentes (MCP/ACP) autenticam com um **token de API por usuário** (visível em
`/api/auth/me`, rotacione via `POST /api/auth/token`). Sem contas em nuvem
pública — fica tudo no seu SQLite.

**Trancado pra fora / recuperação** — gerencie usuários pelo terminal (sem login):

```bash
npm run admin -- list
npm run admin -- create-admin <usuario> <senha>   # cria ou reseta um admin
npm run admin -- set-password <usuario> <senha>
npm run admin -- reset                             # apaga usuários → próximo start mostra "Create admin"
```

## 🔌 API

Todas as rotas exceto `/healthz`, `/api/config` e `/api/auth/*` exigem
autenticação — **cookie de sessão** (web) ou **token de API** por usuário (agentes):
`Authorization: Bearer <token>` ou `X-API-Key: <token>`.

| Método | Rota | Função |
|---|---|---|
| GET | `/healthz` | health check (público) |
| GET | `/api/config` | `{ authEnabled, needsSetup, aiEnabled, … }` (público) |
| POST | `/api/auth/setup` | cria o primeiro admin (só no primeiro run) |
| POST | `/api/auth/login` · `/api/auth/logout` | login / logout de sessão |
| GET | `/api/auth/me` | usuário atual + token de API |
| POST | `/api/auth/token` | rotaciona seu token de API |
| GET/POST/PUT/DELETE | `/api/users` | gestão de usuários (**admin**) |
| GET | `/api/assessments` | lista avaliações salvas |
| POST | `/api/assessments` | cria (`{ state }`) → avaliação |
| GET | `/api/assessments/:id` | estado completo |
| PUT | `/api/assessments/:id` | atualiza (`{ state }`) |
| DELETE | `/api/assessments/:id` | remove |
| GET | `/api/assessments/:id/report.pdf` | PDF Okami da avaliação |
| POST | `/api/report/preview.pdf` | PDF a partir de um `state` cru (sem salvar) |
| GET | `/api/backup` | baixa um backup JSON de **todas** as avaliações |
| POST | `/api/restore` | restaura um backup (`{ assessments, mode: merge\|replace }`) |
| POST | `/api/ai/suggest` | proxy IA (`{ messages }`); 503 se desabilitado |

O `state` é o estado completo do app (`meta`, `answers`, `notes`, `targets`,
`snapshots`, `lang`).

### Barra de ações no app

A barra flutuante (canto inferior direito) tem **＋ Nova** (inicia uma avaliação
do zero), **☁ Salvar** (cria/atualiza no servidor), **📂 Carregar** (lista e
restaura) e **📄 Relatório PDF** (PDF Okami da avaliação atual). O botão **PDF** do
topo também produz o relatório Okami. O diálogo Carregar também tem **⤓ Backup** /
**⤒ Restaurar** para exportar/importar todos os seus dados.

Durante a avaliação dá pra responder pelo **teclado**: `0–3` responde a pergunta
em foco e avança, `↑/↓` navegam, `←/→` mudam de prática, `⌫` limpa.

---

## 🤖 IA (multi-provider, opcional)

As sugestões do Roadmap funcionam com qualquer provider configurável por env
(`server/ai.js`). O botão de IA só aparece quando há chave.

| Provider | Variáveis |
|---|---|
| OpenAI | `AI_PROVIDER=openai` · `AI_MODEL=gpt-4o-mini` |
| Minimax / OpenAI-compatível | `AI_PROVIDER=openai` · `AI_BASE_URL=https://.../v1` · `AI_MODEL=...` |
| Anthropic | `AI_PROVIDER=anthropic` · `AI_MODEL=claude-sonnet-4-6` |
| Anthropic com URL custom | `AI_PROVIDER=anthropic` · `AI_BASE_URL=https://seu-proxy/anthropic` |

`AI_API_KEY` é a chave do provider escolhido. (OAuth delegado por usuário —
OpenAI/Minimax — é um item futuro; hoje a config é por chave + URL custom.)

---

## 🔌 MCP — agentes de IA operam o sistema

O sistema inteiro é exposto via **MCP** (Model Context Protocol), então um cliente
de IA (Claude e afins) pode ler **e operar** tudo: descobrir o modelo SAMM, criar
avaliação, responder perguntas (ex.: a partir de uma transcrição de entrevista),
definir metas, ler scorecard/roadmap, registrar progresso e gerar o relatório PDF.

Dois transportes, os mesmos tools:

- **HTTP** (remoto) — em `POST /mcp` (Streamable HTTP). Aponte qualquer cliente MCP para `https://sua-instancia/mcp`.
- **stdio** (local) — `node server/mcp-stdio.js`, operando o mesmo SQLite (`DB_PATH`).

**Claude Code:**

```bash
claude mcp add --transport http okami-samm https://sua-instancia/mcp          # remoto
claude mcp add okami-samm -- node /caminho/abs/okami-samm/server/mcp-stdio.js  # local
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "okami-samm": {
      "command": "node",
      "args": ["/caminho/abs/okami-samm/server/mcp-stdio.js"],
      "env": { "DB_PATH": "/caminho/abs/okami-samm/data/okami-samm.db" }
    }
  }
}
```

**Tools:** `get_samm_model`, `list_assessments`, `get_assessment`,
`create_assessment`, `set_answers`, `set_targets`, `set_notes`, `get_scorecard`,
`get_roadmap`, `add_snapshot`, `generate_report`, `delete_assessment`,
`export_backup`, `import_backup` (+ um resource `samm://model`).

> `/mcp` exige autenticação — envie seu **token de API** como
> `Authorization: Bearer <token>` (pegue em `/api/auth/me`). A maioria dos clientes
> MCP permite configurar um header custom no transporte HTTP.

## 🤝 ACP — interoperabilidade entre agentes

Além do MCP, o sistema fala os dois protocolos chamados **ACP** (mesmas operações
por baixo, em `server/operations.js`):

**Agent *Communication* Protocol** (REST, agente-a-agente) — montado em `/acp`:

```bash
curl http://localhost:3000/acp/agents                    # descobre o agente samm-operator
curl -X POST http://localhost:3000/acp/runs -H 'content-type: application/json' -d '{
  "agent_name": "samm-operator",
  "input": [{ "parts": [{ "content_type": "application/json",
              "content": "{\"tool\":\"create_assessment\",\"args\":{\"org\":\"ACME\"}}" }] }] }'
```

O run completa de forma síncrona; a mensagem de saída traz o resultado JSON.
`{"tool":"help"}` lista os tools disponíveis.

**Agent *Client* Protocol** (Zed, JSON-RPC sobre stdio) — `node server/acp-client-stdio.js`.
No `settings.json` do Zed:

```json
{
  "agent_servers": {
    "Okami SAMM": {
      "command": "node",
      "args": ["/caminho/abs/okami-samm/server/acp-client-stdio.js"],
      "env": { "DB_PATH": "/caminho/abs/okami-samm/data/okami-samm.db" }
    }
  }
}
```

Opere com comandos `/<tool> {args}` (ex.: `/create_assessment {"org":"ACME"}`,
`/help`) ou, quando há provider de IA configurado, com linguagem natural — o
agente roda um loop de tool-calling LLM sobre as operações do SAMM.

## 🗄️ Banco de dados

SQLite em `DB_PATH` (default `./data/okami-samm.db`, criado automaticamente, modo
WAL). Tabelas: `assessments` e `snapshots` (ver `server/db.js`).

---

## 🏠 Self-host (1 comando)

O app inteiro (frontend + API + PDF + SQLite) roda de um único container:

```bash
docker compose up -d        # → http://localhost:3000
```

Seus dados ficam em **`./data/okami-samm.db`**. Faça backup copiando essa pasta,
ou pelo botão **⤓ Backup** no app (diálogo Carregar) / `GET /api/backup`; restaure
com **⤒ Restaurar** / `POST /api/restore`. Se expuser a instância na internet,
coloque atrás de um proxy reverso com auth / VPN (dá pra adicionar um gate de
senha única sob demanda).

## ☁️ Deploy — Cloudflare Pages (frontend) + container (backend)

Frontend estático na **Cloudflare Pages** + backend Node (API + PDF) num
**container** atrás do CDN da Cloudflare. O Pages serve `public/` e um Pages
Function (`functions/api/[[path]].js`) faz proxy de `/api/*` para o backend —
mesma origem, sem CORS.

**1. Backend (container).** Qualquer host com Docker (Render / Railway / Fly.io /
VPS). A imagem já inclui o Chromium do Playwright; o volume `/data` persiste o SQLite.

```bash
docker build -t okami-samm .
docker run -p 3000:3000 -v okami_samm_data:/data \
  -e AI_PROVIDER=openai -e AI_API_KEY=...   # opcional
  okami-samm
```

No Render há um blueprint pronto (`render.yaml`). Ao final você terá uma URL, ex.:
`https://okami-samm.onrender.com`.

**2. Frontend (Cloudflare Pages).**

```bash
npx wrangler pages deploy                    # usa wrangler.toml (output dir = public/)
npx wrangler pages secret put BACKEND_URL    # = https://okami-samm.onrender.com
```

Ou defina `BACKEND_URL` em **Pages → Settings → Variables**.

> Alternativa sem Cloudflare: o próprio container serve o frontend em `/`, então
> `docker run` sozinho é um deploy completo.

---

## 📁 Estrutura

```
server/    Express, SQLite, scoring, proxy de IA e geração de PDF
  operations.js      fonte única de todas as operações (MCP + ACP compartilham)
  mcp.js + mcp-stdio.js          MCP server (tools/resources) + entry stdio
  acp-comm.js                    Agent Communication Protocol (REST, /acp)
  acp-client.js + acp-client-stdio.js   Agent Client Protocol (Zed, stdio)
  data/samm.json     modelo OWASP SAMM (extraído do app)
  report/            render.js (HTML Okami) + pdf.js (Playwright) + styles.js + fonts.css
public/    app SAMM standalone + app-bridge.js + vendor/ (React)
functions/ Cloudflare Pages Function (proxy /api/*)
tests/     teste de regressão offline-render
docs/      spec de design + screenshots
data/      banco SQLite (gitignored)
```

---

## 📦 Origem

Importado de `Projeto Avaliação OWASP SAMM.zip` (Claude Design, projeto
`d202c418-...`). O código React/dc-runtime do app não foi reescrito — apenas
empacotado e estendido pela ponte (`app-bridge.js`) e pelo backend.

## Licença

Proprietário — © Okami. Todos os direitos reservados.
