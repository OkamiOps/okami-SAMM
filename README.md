# Okami SAMM

Aplicação de **avaliação de maturidade OWASP SAMM v2** da Okami — 5 funções, 15
práticas, 90 perguntas (PT/EN). Importada do Claude Design e empacotada como app
web publicável, com **persistência em SQLite**, **relatório PDF com a identidade
visual Okami** e **sugestões de IA opcionais**.

## Stack

- **Frontend** — app standalone (`public/`), runtime React (dc-runtime) que boota sozinho. Mantém um rascunho em `localStorage` e fala com a API via `public/app-bridge.js`.
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

## Publicar (Docker)

```bash
docker build -t okami-samm .
docker run -p 3000:3000 -v okami_samm_data:/data \
  -e ANTHROPIC_API_KEY=sk-ant-...   # opcional
  okami-samm
```

A imagem já inclui o Chromium do Playwright. O volume `/data` persiste o SQLite.
Funciona em qualquer host com Docker (Render, Railway, Fly.io, VPS).

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
