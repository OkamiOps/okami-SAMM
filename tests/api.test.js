'use strict';
// API smoke test: full assessment lifecycle + PDF + AI-disabled, end to end.
const { startServer, waitForServer, buildState, createAdminSession } = require('./helpers');

const PORT = 3098;
const base = `http://localhost:${PORT}`;
let failed = false;
let COOKIE = '';
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }

async function json(path, opts) { opts = opts || {}; opts.headers = Object.assign({ cookie: COOKIE }, opts.headers); const r = await fetch(base + path, opts); return { status: r.status, body: await r.json().catch(() => null) }; }
const authed = (opts) => { opts = opts || {}; opts.headers = Object.assign({ cookie: COOKIE }, opts.headers); return opts; };
const POST = (p, b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const PUT = (p, b) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

(async () => {
  const server = startServer(PORT, { DB_PATH: '/tmp/okami-samm-test.db' });
  try {
    require('fs').rmSync('/tmp/okami-samm-test.db', { force: true });
    await waitForServer(`${base}/healthz`);

    const state = buildState('en', 5, (i) => [0, 1, 2, 3][i % 4]);

    // protected without auth
    const noauth = await fetch(`${base}/api/assessments`);
    check('API requires auth (401)', noauth.status === 401);

    const sess = await createAdminSession(base);
    COOKIE = sess.cookie;
    check('admin session + API token created', !!sess.value && !!sess.token);

    const cfg = await json('/api/config');
    check('config has aiEnabled', typeof cfg.body.aiEnabled === 'boolean');
    check('config needsSetup false after setup', cfg.body.needsSetup === false);

    const created = await json('/api/assessments', POST('', { state }));
    check('POST create → 201', created.status === 201);
    check('created has id', !!created.body.id);
    check('created computed overall_score', typeof created.body.overall_score === 'number');
    const id = created.body.id;

    const list = await json('/api/assessments');
    check('GET list contains it', Array.isArray(list.body) && list.body.some((a) => a.id === id));

    const got = await json(`/api/assessments/${id}`);
    check('GET one restores answers', got.body && got.body.state && Object.keys(got.body.state.answers).length > 0);

    const upd = await json(`/api/assessments/${id}`, PUT('', { state: { ...state, meta: { ...state.meta, org: 'Updated' } } }));
    check('PUT update → org changed', upd.status === 200 && upd.body.org === 'Updated');

    const backup = await json('/api/backup');
    check('GET backup has our assessment', backup.body && Array.isArray(backup.body.assessments) && backup.body.assessments.some((a) => a.id === id));
    const restore = await json('/api/restore', POST('', { assessments: backup.body.assessments, mode: 'merge' }));
    check('POST restore merges', restore.status === 200 && restore.body.imported >= 1);

    const pdf = await fetch(`${base}/api/assessments/${id}/report.pdf`, authed());
    const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString('latin1');
    check('GET report.pdf → 200 %PDF', pdf.status === 200 && head.startsWith('%PDF'));

    const prev = await fetch(`${base}/api/report/preview.pdf`, authed(POST('', { state })));
    const phead = Buffer.from(await prev.arrayBuffer()).subarray(0, 5).toString('latin1');
    check('POST preview.pdf → 200 %PDF', prev.status === 200 && phead.startsWith('%PDF'));

    const ai = await json('/api/ai/suggest', POST('', { messages: [{ role: 'user', content: 'hi' }] }));
    check('AI disabled → 503', ai.status === 503);

    const del = await json(`/api/assessments/${id}`, { method: 'DELETE' });
    check('DELETE → deleted', del.body && del.body.deleted === true);
    const after = await json(`/api/assessments/${id}`);
    check('GET deleted → 404', after.status === 404);
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    server.kill();
    require('fs').rmSync('/tmp/okami-samm-test.db', { force: true });
  }
  console.log(failed ? 'API TEST FAILED' : 'api ok');
  process.exit(failed ? 1 : 0);
})();
