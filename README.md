<!-- Language: **English** · [Português](README.pt-BR.md) -->

# Okami SAMM

> 🌐 **English** · [Português (Brasil)](README.pt-BR.md)

Okami's **OWASP SAMM v2 maturity assessment** app — 5 business functions, 15
practices, 90 questions (PT/EN). Imported from Claude Design and packaged as a
publishable web app, with **SQLite persistence**, **Okami-branded PDF reports**
and **optional AI suggestions**.

## Stack

- **Frontend** — standalone app (`public/`), React (dc-runtime) that boots on its own. Keeps a draft in `localStorage` and talks to the API through `public/app-bridge.js`. React/ReactDOM are **vendored** in `public/vendor/` (no runtime CDN) — the app renders even offline / behind CSP / in a restricted preview.
- **Backend** — Node + Express + `better-sqlite3`.
- **PDF** — Playwright (headless Chromium) renders an HTML that reproduces the "OKAMI · Security Assessment Report" template.
- **AI (optional)** — multi-provider proxy; the AI button only shows when a key is configured.

## Run locally

```bash
npm install
npx playwright install chromium      # downloads Chromium once, for the PDF
cp .env.example .env                 # adjust port / AI key if you want
npm start                            # http://localhost:3000
```

Without an AI key the app works normally — only the Roadmap's AI suggestions stay hidden.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/healthz` | health check |
| GET | `/api/config` | `{ aiEnabled, aiProvider, version }` |
| GET | `/api/assessments` | list saved assessments |
| POST | `/api/assessments` | create (`{ state }`) → assessment |
| GET | `/api/assessments/:id` | full state |
| PUT | `/api/assessments/:id` | update (`{ state }`) |
| DELETE | `/api/assessments/:id` | delete |
| GET | `/api/assessments/:id/snapshots` | list snapshots |
| POST | `/api/assessments/:id/snapshots` | save snapshot (`{ state, label }`) |
| GET | `/api/assessments/:id/report.pdf` | Okami PDF of the assessment |
| POST | `/api/report/preview.pdf` | PDF from a raw `state` (without saving) |
| POST | `/api/ai/suggest` | AI proxy (`{ messages }`); 503 when disabled |

`state` is the app's full state (`meta`, `answers`, `notes`, `targets`,
`snapshots`, `lang`). The server recomputes scoring (`server/score.js`) to
denormalize `overall_score` and build the report.

## In-app usage

The floating toolbar (bottom-right) has:

- **☁ Save** — creates/updates the current assessment on the server (SQLite).
- **📂 Load** — lists saved assessments; opening one restores the state.
- **📄 PDF report** — generates the Okami PDF of the current assessment.

The top **PDF** button also produces the Okami report (no longer the old jsPDF one).

## The PDF report

A 9-page document following the Okami visual identity:

1. **Cover** (dark, brand gradients)
2. **01 Executive summary** — metrics, by-function bars, maturity radar
3. **02 Methodology** — the 5 functions, how the score is computed, levels 0–3
4. **03 Maturity by function** — per-practice tables with strength/attention analysis
5. **04 Roadmap — Next steps** — priority practices with **recommended actions** derived from the SAMM criteria/guidance (no AI required)

## AI (multi-provider, optional)

The Roadmap suggestions work with any provider configured via env
(`server/ai.js`). The AI button only appears when a key is present.

| Provider | Variables |
|---|---|
| OpenAI | `AI_PROVIDER=openai` · `AI_MODEL=gpt-4o-mini` |
| Minimax / OpenAI-compatible | `AI_PROVIDER=openai` · `AI_BASE_URL=https://.../v1` · `AI_MODEL=...` |
| Anthropic | `AI_PROVIDER=anthropic` · `AI_MODEL=claude-sonnet-4-6` |
| Anthropic with custom URL | `AI_PROVIDER=anthropic` · `AI_BASE_URL=https://your-proxy/anthropic` |

`AI_API_KEY` is the chosen provider's key. (User-delegated OAuth — OpenAI/Minimax
— is a future item; today the config is key + custom URL.)

## Database

SQLite at `DB_PATH` (default `./data/okami-samm.db`, created automatically, WAL
mode). Tables: `assessments` and `snapshots` (see `server/db.js`).

## Publish — Cloudflare Pages (frontend) + container (backend)

Chosen architecture: **static frontend on Cloudflare Pages** + **Node backend
(API + PDF) in a container** behind Cloudflare's CDN. Pages serves `public/` and
a Pages Function (`functions/api/[[path]].js`) proxies `/api/*` to the backend —
same-origin, no CORS.

### 1. Backend (container)

Any Docker host (Render / Railway / Fly.io / VPS). The image already bundles
Playwright's Chromium; the `/data` volume persists SQLite.

```bash
docker build -t okami-samm .
docker run -p 3000:3000 -v okami_samm_data:/data \
  -e AI_PROVIDER=openai -e AI_API_KEY=...   # optional
  okami-samm
```

Render has a ready blueprint (`render.yaml`) — just point it at the repo. You end
up with a URL, e.g. `https://okami-samm.onrender.com`.

### 2. Frontend (Cloudflare Pages)

```bash
npx wrangler pages deploy            # uses wrangler.toml (output dir = public/)
```

Then point the proxy at the backend (a Pages project variable):

```bash
npx wrangler pages secret put BACKEND_URL   # = https://okami-samm.onrender.com
```

Or via the Pages dashboard: **Settings → Variables → BACKEND_URL**. Done — the
Pages site serves the app and forwards `/api/*` (PDF included) to the container.

> No-Cloudflare alternative: the container itself already serves the frontend at
> `/` (Express + `public/`), so `docker run` alone is a complete deploy.

## Tests

```bash
npm test    # tests/offline-render.js — the app must render with the CDN blocked
```

## Structure

```
server/    Express, SQLite, scoring, AI proxy and PDF generation
  data/samm.json     OWASP SAMM model (extracted from the app)
  report/            render.js (Okami HTML) + pdf.js (Playwright) + styles.js + fonts.css
public/    standalone SAMM app + app-bridge.js + vendor/ (React)
data/      SQLite database (gitignored)
docs/      design spec
```

## Origin

Imported from `Projeto Avaliação OWASP SAMM.zip` (Claude Design, project
`d202c418-...`). The app's React/dc-runtime code was not rewritten — only
packaged and extended through the bridge (`app-bridge.js`) and the backend.
