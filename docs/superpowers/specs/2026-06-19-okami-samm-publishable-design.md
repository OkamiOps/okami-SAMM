# Okami SAMM — App Publicável (design)

**Data:** 2026-06-19
**Origem:** projeto exportado do Claude Design (`Projeto Avaliação OWASP SAMM.zip`)

## Objetivo

Transformar o app de avaliação OWASP SAMM (hoje um componente Design Canvas que
roda só dentro do Claude Design, persistindo em `localStorage`) num app web
**publicável** com:

1. Persistência real em **SQLite** (salvar avaliações de clientes, snapshots, listar histórico).
2. **Relatório PDF** com a identidade visual Okami (próximo do template `OKAMI Relatorio v2.html`).
3. Sugestões de **IA opcionais** (o `window.claude.complete()` original não existe fora do Claude Design).

## Restrições / fatos do código existente

- Frontend = `public/index.html` (componente `class Component extends DCLogic`) + `support.js` (dc-runtime React).
- `support.js` carrega React (UMD) sozinho e dá auto-boot no `DOMContentLoaded` → **roda standalone**.
- Estado do app: `meta{org,team,date,lead,contrib}`, `answers`, `notes`, `targets`, `snapshots`, `ai`.
- Scoring: peso `[0,0.25,0.5,1]`; `ps(prática)=média(streamA,streamB)`; `achievedLevel=floor(ps)`; `effTarget=target||min(3,achieved+1)`.
- Dados SAMM: 5 funções · 15 práticas · 90 perguntas (PT/EN) — extraídos para `server/data/samm.json`.

## Arquitetura

```
okami-samm/
├── server/
│   ├── index.js          Express: estáticos + API + /healthz
│   ├── db.js             better-sqlite3, schema, queries
│   ├── score.js          port do scoring (espelha o frontend)
│   ├── ai.js             proxy p/ API Anthropic (só se ANTHROPIC_API_KEY)
│   ├── config.js         flags expostas ao frontend (aiEnabled)
│   ├── data/samm.json    modelo SAMM (fonte do relatório)
│   └── report/
│       ├── render.js     monta HTML do relatório (tokens Okami)
│       └── pdf.js        Playwright (Chromium headless) HTML→PDF
├── public/               app SAMM standalone + app-bridge.js
├── data/okami-samm.db    SQLite (gitignored)
├── Dockerfile            inclui Chromium
├── .env.example
└── README.md
```

### SQLite (schema)

```sql
CREATE TABLE assessments (
  id            TEXT PRIMARY KEY,        -- uuid
  org           TEXT, team TEXT, assess_date TEXT, lead TEXT, contributors TEXT,
  lang          TEXT DEFAULT 'pt',
  overall_score REAL,                    -- denormalizado p/ listagem
  state_json    TEXT NOT NULL,           -- estado completo do app
  created_at    TEXT, updated_at TEXT
);
CREATE TABLE snapshots (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT REFERENCES assessments(id) ON DELETE CASCADE,
  label         TEXT, overall_score REAL,
  state_json    TEXT NOT NULL, created_at TEXT
);
```

### API

| Método | Rota | Função |
|---|---|---|
| GET  | `/api/config` | `{ aiEnabled }` |
| GET  | `/api/assessments` | lista (id, org, team, score, datas) |
| POST | `/api/assessments` | cria (recebe state) → id |
| GET  | `/api/assessments/:id` | estado completo |
| PUT  | `/api/assessments/:id` | atualiza |
| DELETE | `/api/assessments/:id` | remove |
| POST | `/api/assessments/:id/snapshots` | grava snapshot |
| GET  | `/api/assessments/:id/snapshots` | lista snapshots |
| GET  | `/api/assessments/:id/report.pdf` | PDF Okami |
| POST | `/api/report/preview.pdf` | PDF a partir de um state cru (sem salvar) |
| POST | `/api/ai/suggest` | proxy IA (503 se desabilitado) |

### Frontend (ponte, sem reescrever o app)

`public/app-bridge.js` (carregado após o app):
- Define `window.claude.complete(...)` → `POST /api/ai/suggest`.
- Lê `GET /api/config`; se `aiEnabled=false`, esconde o botão de IA (CSS/observador).
- Adiciona ações "Salvar no servidor" / "Carregar" / "Relatório PDF" que conversam com a API, reusando o `state` do componente via `window.__dcRegistry`/instância.
- `localStorage` continua como rascunho local; o servidor é a fonte persistente.

### PDF Okami

`server/report/render.js` gera um HTML multi-seção (capa, resumo executivo + KPIs,
maturidade por função, radar/barras em SVG, próximos passos priorizados,
detalhamento por prática) usando os tokens do tema "documento" do template Okami
(papel `#fcfcfe`, tinta ônix, Space Grotesk, acentos de marca por função).
`server/report/pdf.js` abre o HTML no Chromium (Playwright) e imprime A4 com
margens do template. O scoring vem de `server/score.js` (espelha o frontend).

## Fora de escopo (v1)

- Autenticação / multiusuário (deploy single-tenant; auth pode vir depois).
- Migração de Postgres (decidido: SQLite).
- Edição do relatório pelo cliente.

## Critérios de aceite

- `npm start` sobe o app em `:3000`, app SAMM funciona igual ao Design Canvas.
- Salvar avaliação → linha no SQLite; recarregar lista e abrir restaura o estado.
- `GET /api/assessments/:id/report.pdf` baixa um PDF com cara Okami.
- Sem `ANTHROPIC_API_KEY`: botão de IA some, resto funciona. Com chave: IA volta.
- `docker build` + `docker run` sobe tudo (incl. Chromium) e gera PDF.
