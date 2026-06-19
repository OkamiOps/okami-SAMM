# Okami SAMM

Aplicação de **avaliação de maturidade OWASP SAMM v2** da Okami — 5 funções, 15
práticas, 90 perguntas (PT/EN). Importada do Claude Design e empacotada como app
web publicável, com **persistência em SQLite**, **relatório PDF com a identidade
visual Okami** e **sugestões de IA opcionais**.

## Stack

- **Frontend** — app standalone (`public/`), runtime React (dc-runtime) que boota sozinho. Mantém um rascunho em `localStorage` e fala com a API via `public/app-bridge.js`. O React/ReactDOM são **embutidos** em `public/vendor/` (sem CDN em runtime) — o app renderiza mesmo offline / atrás de CSP / em preview restrito.
- **Backend** — Node + Express + `better-sqlite3`.
- **PDF** — Playwright (Chromium headless) renderiza um HTML que reproduz o template "OKAMI · Security Assessment Report".
- **IA (opcional)** — proxy para a API Anthropic; o botão de IA só aparece se houver `ANTHROPIC_API_KEY`.

## Rodar local

```bash
npm install
npx playwright install chromium      # baixa o Chromium (uma vez), p/ o PDF
cp .env.example .env                 # ajuste a porta / chave de IA se quiser
npm start                            # http://localhost:3000
```

Sem `ANTHROPIC_API_KEY` o app funciona normalmente — apenas as sugestões de IA do
Roadmap ficam ocultas.

## API

| Método | Rota | Função |
|---|---|---|
| GET | `/healthz` | health check |
| GET | `/api/config` | `{ aiEnabled, version }` |
| GET | `/api/assessments` | lista avaliações salvas |
| POST | `/api/assessments` | cria (`{ state }`) → avaliação |
| GET | `/api/assessments/:id` | estado completo |
| PUT | `/api/assessments/:id` | atualiza (`{ state }`) |
| DELETE | `/api/assessments/:id` | remove |
| GET | `/api/assessments/:id/snapshots` | lista snapshots |
| POST | `/api/assessments/:id/snapshots` | grava snapshot (`{ state, label }`) |
| GET | `/api/assessments/:id/report.pdf` | PDF Okami da avaliação |
| POST | `/api/report/preview.pdf` | PDF de um `state` cru (sem salvar) |
| POST | `/api/ai/suggest` | proxy IA (`{ messages }`); 503 se desabilitado |

O `state` é o estado completo do app (`meta`, `answers`, `notes`, `targets`,
`snapshots`, `lang`). O servidor recalcula o scoring (`server/score.js`) para
denormalizar `overall_score` e montar o relatório.

## Uso no app

A barra flutuante (canto inferior direito) tem:

- **☁ Salvar** — grava/atualiza a avaliação atual no servidor (SQLite).
- **📂 Carregar** — lista as avaliações salvas; abrir restaura o estado.
- **📄 Relatório PDF** — gera o PDF Okami da avaliação atual.

O botão **PDF** do topo também produz o relatório Okami (não mais o jsPDF antigo).

## Banco de dados

SQLite em `DB_PATH` (default `./data/okami-samm.db`, criado automaticamente,
modo WAL). Tabelas: `assessments` e `snapshots` (ver `server/db.js`).

## IA (multi-provider, opcional)

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

## Publicar — Cloudflare Pages (frontend) + container (backend)

Arquitetura escolhida: **frontend estático na Cloudflare Pages** + **backend Node
(API + PDF) num container** atrás do CDN da Cloudflare. O Pages serve `public/` e
um Pages Function (`functions/api/[[path]].js`) faz proxy de `/api/*` para o
backend — mesma origem, sem CORS.

### 1. Backend (container)

Qualquer host com Docker (Render / Railway / Fly.io / VPS). A imagem já inclui o
Chromium do Playwright; o volume `/data` persiste o SQLite.

```bash
docker build -t okami-samm .
docker run -p 3000:3000 -v okami_samm_data:/data \
  -e AI_PROVIDER=openai -e AI_API_KEY=...   # opcional
  okami-samm
```

No Render há um blueprint pronto (`render.yaml`) — basta apontar para o repo. Ao
final você terá uma URL, ex.: `https://okami-samm.onrender.com`.

### 2. Frontend (Cloudflare Pages)

```bash
npx wrangler pages deploy            # usa wrangler.toml (output dir = public/)
```

Depois aponte o proxy para o backend (variável do projeto Pages):

```bash
npx wrangler pages secret put BACKEND_URL   # = https://okami-samm.onrender.com
```

Ou pelo dashboard do Pages: **Settings → Variables → BACKEND_URL**. Pronto — o
site na Pages serve o app e encaminha `/api/*` (incl. o PDF) para o container.

> Alternativa sem Cloudflare: o próprio container já serve o frontend em `/`
> (Express + `public/`), então `docker run` sozinho é um deploy completo.

## Estrutura

```
server/    Express, SQLite, scoring, proxy de IA e geração de PDF
  data/samm.json     modelo OWASP SAMM (extraído do app)
  report/            render.js (HTML Okami) + pdf.js (Playwright) + styles.js + fonts.css
public/    app SAMM standalone + app-bridge.js
data/      banco SQLite (gitignored)
docs/      spec de design
```

## Origem

Importado de `Projeto Avaliação OWASP SAMM.zip` (Claude Design, projeto
`d202c418-...`). O código React/dc-runtime do app não foi reescrito — apenas
empacotado e estendido pela ponte (`app-bridge.js`) e pelo backend.
