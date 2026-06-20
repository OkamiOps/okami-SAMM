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

## 🔌 API

| Método | Rota | Função |
|---|---|---|
| GET | `/healthz` | health check |
| GET | `/api/config` | `{ aiEnabled, aiProvider, version }` |
| GET | `/api/assessments` | lista avaliações salvas |
| POST | `/api/assessments` | cria (`{ state }`) → avaliação |
| GET | `/api/assessments/:id` | estado completo |
| PUT | `/api/assessments/:id` | atualiza (`{ state }`) |
| DELETE | `/api/assessments/:id` | remove |
| GET | `/api/assessments/:id/snapshots` | lista snapshots |
| POST | `/api/assessments/:id/snapshots` | grava snapshot (`{ state, label }`) |
| GET | `/api/assessments/:id/report.pdf` | PDF Okami da avaliação |
| POST | `/api/report/preview.pdf` | PDF a partir de um `state` cru (sem salvar) |
| GET | `/api/backup` | baixa um backup JSON de **todas** as avaliações |
| POST | `/api/restore` | restaura um backup (`{ assessments, mode: merge\|replace }`) |
| POST | `/api/ai/suggest` | proxy IA (`{ messages }`); 503 se desabilitado |

O `state` é o estado completo do app (`meta`, `answers`, `notes`, `targets`,
`snapshots`, `lang`).

### Barra de ações no app

A barra flutuante (canto inferior direito) tem **☁ Salvar** (cria/atualiza no
servidor), **📂 Carregar** (lista e restaura) e **📄 Relatório PDF** (PDF Okami da
avaliação atual). O botão **PDF** do topo também produz o relatório Okami. O
diálogo Carregar também tem **⤓ Backup** / **⤒ Restaurar** para exportar/importar
todos os seus dados.

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
