'use strict';
// Regression test: the app must render even when the unpkg CDN is unreachable
// (offline, CSP, restricted preview, corporate network). React/ReactDOM must be
// served locally — not fetched from unpkg at runtime.
//
// Usage: node tests/offline-render.js   (starts the server on a test port)
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const PORT = 3099;

function startServer() {
  const proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  return proc;
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
}

(async () => {
  const server = startServer();
  let failed = false;
  try {
    await waitForServer(`http://localhost:${PORT}/healthz`);
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    // Simulate the CDN being unreachable.
    await ctx.route('**unpkg.com**', (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const r = await page.evaluate(() => ({
      hasReact: !!window.React,
      hasReactDOM: !!window.ReactDOM,
      dcRoot: !!document.querySelector('#dc-root'),
      rawBindings: (document.body.innerHTML.match(/\{\{/g) || []).length,
    }));

    const ok = r.hasReact && r.hasReactDOM && r.dcRoot && r.rawBindings === 0;
    console.log('offline render result:', JSON.stringify(r));
    if (ok) {
      console.log('PASS — app renders with unpkg blocked');
    } else {
      console.log('FAIL — app did not render without the CDN');
      failed = true;
    }
    await browser.close();
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    server.kill();
  }
  process.exit(failed ? 1 : 0);
})();
