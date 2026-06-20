'use strict';
// Settings: AI config (BYOK) save/read with key masking, retention, admin-only.
const { startServer, waitForServer, createAdminSession } = require('./helpers');

const PORT = 3094;
const base = `http://localhost:${PORT}`;
const DB = '/tmp/okami-samm-settings.db';
let failed = false;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }

(async () => {
  require('fs').rmSync(DB, { force: true });
  const server = startServer(PORT, { DB_PATH: DB });
  try {
    await waitForServer(`${base}/healthz`);
    const sess = await createAdminSession(base);
    const H = { cookie: sess.cookie, 'content-type': 'application/json' };
    const get = () => fetch(`${base}/api/settings`, { headers: H }).then((r) => r.json());
    const put = (b) => fetch(`${base}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify(b) });

    let s = await get();
    check('defaults: AI off, retention 0', s.ai_enabled === false && s.retention_days === 0);

    await put({ ai_preset: 'grok', ai_provider: 'openai', ai_base_url: 'https://api.x.ai/v1', ai_model: 'grok-2-latest', ai_api_key: 'sk-secret-abcd1234' });
    s = await get();
    check('AI saved (provider/baseUrl/model)', s.ai_provider === 'openai' && s.ai_base_url === 'https://api.x.ai/v1' && s.ai_model === 'grok-2-latest' && s.ai_preset === 'grok');
    check('AI enabled after key set', s.ai_enabled === true);
    check('API key is masked, not returned raw', s.ai_api_key_set === true && /•+1234$/.test(s.ai_api_key_hint) && JSON.stringify(s).indexOf('sk-secret') === -1);

    await put({ retention_days: 45 });
    check('retention saved', (await get()).retention_days === 45);

    await put({ clear_api_key: true });
    s = await get();
    check('key cleared → AI off', s.ai_api_key_set === false && s.ai_enabled === false);

    // non-admin blocked
    await fetch(`${base}/api/users`, { method: 'POST', headers: H, body: JSON.stringify({ username: 'bob', password: 'bob123', role: 'user' }) });
    const bobLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'bob', password: 'bob123' }) });
    const bobCookie = (bobLogin.headers.getSetCookie ? bobLogin.headers.getSetCookie() : [bobLogin.headers.get('set-cookie')]).map((c) => /okami_session=([^;]+)/.exec(c || '')).filter(Boolean).map((m) => 'okami_session=' + m[1])[0];
    check('non-admin blocked from settings (403)', (await fetch(`${base}/api/settings`, { headers: { cookie: bobCookie } })).status === 403);
  } catch (e) { console.error('ERROR', e.message); failed = true; }
  finally { server.kill(); require('fs').rmSync(DB, { force: true }); }
  console.log(failed ? 'SETTINGS TEST FAILED' : 'settings ok');
  process.exit(failed ? 1 : 0);
})();
