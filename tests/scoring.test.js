'use strict';
// Anti-drift test: the maturity the FRONTEND displays must equal what the
// SERVER computes for the same state. Scoring lives in two places
// (public/index.html and server/score.js); this catches them drifting apart.
const { chromium } = require('playwright');
const { startServer, waitForServer, buildState, createAdminSession } = require('./helpers');
const { summarize } = require('../server/score');

const PORT = 3097;

const CASES = [
  { name: 'all "yes"', state: buildState('en', 1, () => 3) },
  { name: 'partial mixed', state: buildState('en', 7, (i) => [0, 1, 2, 3][i % 4]) },
  { name: 'mostly low', state: buildState('en', 3, (i) => (i % 5 === 0 ? 2 : 0)) },
  { name: 'empty', state: buildState('en', 1, () => null) },
];

async function readDisplayedOverall(page) {
  return page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')];
    const slash = spans.find((s) => s.textContent.trim() === '/ 3.0');
    return slash && slash.previousElementSibling ? slash.previousElementSibling.textContent.trim() : null;
  });
}

(async () => {
  const server = startServer(PORT);
  let failed = false;
  try {
    await waitForServer(`http://localhost:${PORT}/healthz`);
    const sess = await createAdminSession(`http://localhost:${PORT}`);
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await ctx.addCookies([{ name: 'okami_session', value: sess.value, url: `http://localhost:${PORT}` }]);
    const page = await ctx.newPage();
    for (const c of CASES) {
      const expected = summarize(c.state).overall.toFixed(2);
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((s) => localStorage.setItem('okami_maturity_state_v1', s), JSON.stringify(c.state));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const displayed = await readDisplayedOverall(page);
      const ok = displayed === expected;
      console.log(`${ok ? 'PASS' : 'FAIL'} [${c.name}] server=${expected} frontend=${displayed}`);
      if (!ok) failed = true;
    }
    await browser.close();
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    server.kill();
  }
  console.log(failed ? 'SCORING DRIFT DETECTED' : 'scoring matches frontend/server');
  process.exit(failed ? 1 : 0);
})();
