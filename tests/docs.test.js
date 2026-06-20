'use strict';
// API docs: OpenAPI spec is valid and public; Swagger UI renders self-hosted.
const { startServer, waitForServer } = require('./helpers');

const PORT = 3093;
const base = `http://localhost:${PORT}`;
let failed = false;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }

(async () => {
  const server = startServer(PORT, { DB_PATH: '/tmp/okami-samm-docs.db' });
  try {
    require('fs').rmSync('/tmp/okami-samm-docs.db', { force: true });
    await waitForServer(`${base}/healthz`);

    // spec builds without error and is structurally valid
    const { spec } = require('../server/openapi');
    const s = spec();
    check('spec is OpenAPI 3', /^3\./.test(s.openapi));
    check('spec has paths + schemas', Object.keys(s.paths).length > 10 && !!s.components.schemas.State);
    check('spec declares bearer + cookie auth', !!s.components.securitySchemes.bearerAuth && !!s.components.securitySchemes.cookieAuth);
    // every $ref resolves to a defined schema
    const refs = JSON.stringify(s).match(/#\/components\/schemas\/(\w+)/g) || [];
    const missing = [...new Set(refs.map((r) => r.split('/').pop()))].filter((n) => !s.components.schemas[n]);
    check('all $refs resolve', missing.length === 0);

    // public endpoints (no auth)
    const oa = await fetch(`${base}/api/openapi.json`);
    check('GET /api/openapi.json → 200 (public)', oa.status === 200 && (await oa.json()).openapi.startsWith('3.'));
    const docs = await fetch(`${base}/docs`);
    const html = await docs.text();
    check('GET /docs → 200 HTML', docs.status === 200 && /SwaggerUIBundle/.test(html));
    check('Swagger UI bundle served locally (no CDN)', (await fetch(`${base}/docs/static/swagger-ui-bundle.js`)).status === 200 && !/unpkg|cdn/.test(html));
  } catch (e) { console.error('ERROR', e.message); failed = true; }
  finally { server.kill(); require('fs').rmSync('/tmp/okami-samm-docs.db', { force: true }); }
  console.log(failed ? 'DOCS TEST FAILED' : 'docs ok');
  process.exit(failed ? 1 : 0);
})();
