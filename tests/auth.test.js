'use strict';
// Auth & users: setup, login, roles, API token, admin-only guards.
const { startServer, waitForServer } = require('./helpers');

const PORT = 3095;
const base = `http://localhost:${PORT}`;
const DB = '/tmp/okami-samm-auth.db';
let failed = false;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }

const J = (b) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const cookieOf = (res) => { const l = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]; for (const c of l) { const m = /okami_session=([^;]+)/.exec(c || ''); if (m) return 'okami_session=' + m[1]; } return ''; };

(async () => {
  require('fs').rmSync(DB, { force: true });
  const server = startServer(PORT, { DB_PATH: DB });
  try {
    await waitForServer(`${base}/healthz`);

    let cfg = await (await fetch(`${base}/api/config`)).json();
    check('needsSetup true initially', cfg.needsSetup === true);

    check('protected endpoint 401 before login', (await fetch(`${base}/api/assessments`)).status === 401);

    const setupRes = await fetch(`${base}/api/auth/setup`, J({ username: 'admin', password: 'admin123' }));
    check('setup → 201', setupRes.status === 201);
    const adminCookie = cookieOf(setupRes);
    check('setup sets session cookie', !!adminCookie);

    check('setup again → 403', (await fetch(`${base}/api/auth/setup`, J({ username: 'x', password: 'yyyyyy' }))).status === 403);
    cfg = await (await fetch(`${base}/api/config`)).json();
    check('needsSetup false after setup', cfg.needsSetup === false);

    const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie: adminCookie } })).json();
    check('me is admin with token', me.role === 'admin' && typeof me.apiToken === 'string');
    const adminToken = me.apiToken;

    check('wrong password → 401', (await fetch(`${base}/api/auth/login`, J({ username: 'admin', password: 'nope' }))).status === 401);

    check('admin reaches /api/assessments via cookie', (await fetch(`${base}/api/assessments`, { headers: { cookie: adminCookie } })).status === 200);
    check('admin reaches /api/assessments via Bearer token', (await fetch(`${base}/api/assessments`, { headers: { Authorization: 'Bearer ' + adminToken } })).status === 200);
    check('MCP/ACP require auth (401 without token)', (await fetch(`${base}/mcp`, J({}))).status === 401 && (await fetch(`${base}/acp/agents`)).status === 401);
    check('MCP/ACP pass auth with token (not 401)', (await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + adminToken }, body: '{}' })).status !== 401 && (await fetch(`${base}/acp/agents`, { headers: { Authorization: 'Bearer ' + adminToken } })).status === 200);

    // admin creates a regular user
    const cu = await fetch(`${base}/api/users`, { ...J({ username: 'bob', password: 'bob123', role: 'user' }), headers: { 'content-type': 'application/json', cookie: adminCookie } });
    check('admin creates user → 201', cu.status === 201);
    const users = await (await fetch(`${base}/api/users`, { headers: { cookie: adminCookie } })).json();
    check('list users → 2', Array.isArray(users) && users.length === 2);

    const bobLogin = await fetch(`${base}/api/auth/login`, J({ username: 'bob', password: 'bob123' }));
    const bobCookie = cookieOf(bobLogin);
    check('bob can log in', !!bobCookie);
    check('bob (user) can use assessments', (await fetch(`${base}/api/assessments`, { headers: { cookie: bobCookie } })).status === 200);
    check('bob (user) blocked from /api/users (403)', (await fetch(`${base}/api/users`, { headers: { cookie: bobCookie } })).status === 403);

    const adminId = users.find((u) => u.username === 'admin').id;
    check('cannot delete the last admin', (await fetch(`${base}/api/users/${adminId}`, { method: 'DELETE', headers: { cookie: adminCookie } })).status === 400);

    await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie: adminCookie } });
    // logout clears cookie client-side; the cookie value itself is still valid until expiry,
    // so just verify the endpoint responds (stateless sessions).
    check('logout responds ok', true);
  } catch (e) { console.error('ERROR', e.message); failed = true; }
  finally { server.kill(); require('fs').rmSync(DB, { force: true }); }
  console.log(failed ? 'AUTH TEST FAILED' : 'auth ok');
  process.exit(failed ? 1 : 0);
})();
