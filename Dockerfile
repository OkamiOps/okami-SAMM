# Okami SAMM — Node + SQLite + Playwright (Chromium for PDF reports)
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/okami-samm.db \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Build tools for better-sqlite3 (native addon)
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
# Install deps (skip the postinstall browser probe; we install Chromium explicitly below)
RUN npm install --omit=dev --no-audit --no-fund

# Chromium + its OS dependencies for Playwright
RUN npx playwright install --with-deps chromium

COPY . .

# Persist the SQLite DB outside the image layer
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
