'use strict';
// Agent Communication Protocol (REST) test: discover the agent and run commands.
const { startServer, waitForServer, createAdminSession } = require('./helpers');

const PORT = 3096;
const base = `http://localhost:${PORT}`;
let failed = false;
let H = {};
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }
const get = (p) => fetch(`${base}${p}`, { headers: H });

async function run(tool, args) {
  const body = { agent_name: 'samm-operator', input: [{ parts: [{ content_type: 'application/json', content: JSON.stringify({ tool, args }) }] }] };
  const r = await fetch(`${base}/acp/runs`, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, H), body: JSON.stringify(body) });
  const run = await r.json();
  let out = null; try { out = JSON.parse(run.output[0].parts[0].content); } catch (_) {}
  return { run, out };
}

(async () => {
  const server = startServer(PORT, { DB_PATH: '/tmp/okami-samm-acp-comm.db' });
  try {
    require('fs').rmSync('/tmp/okami-samm-acp-comm.db', { force: true });
    await waitForServer(`${base}/healthz`);

    // ACP requires auth — agents use a Bearer API token
    check('ACP requires auth (401)', (await fetch(`${base}/acp/agents`)).status === 401);
    const sess = await createAdminSession(base);
    H = { Authorization: 'Bearer ' + sess.token };

    const ping = await (await get('/acp/ping')).json();
    check('ping ok', ping.status === 'ok');

    const agents = await (await get('/acp/agents')).json();
    check('agents lists samm-operator', Array.isArray(agents.agents) && agents.agents[0].name === 'samm-operator');
    check('manifest advertises tools', agents.agents[0].metadata.tools.some((t) => t.name === 'create_assessment'));

    const manifest = await (await get('/acp/agents/samm-operator')).json();
    check('GET agent manifest', manifest.name === 'samm-operator');

    const created = await run('create_assessment', { org: 'ACP Comm', lang: 'en' });
    check('run create → completed', created.run.status === 'completed');
    check('run output has assessment id', created.out && !!created.out.id);
    const id = created.out.id;

    const fetched = await get(`/acp/runs/${created.run.run_id}`);
    check('GET run by id', fetched.status === 200);

    const scored = await run('set_answers', { id, answers: { 'G-SM-A-1-1': 3, 'G-SM-B-1-1': 3 } });
    check('run set_answers raises coverage', scored.out && scored.out.coverage > 0);

    const bad = await run('nope', {});
    check('unknown tool → failed run', bad.run.status === 'failed' && bad.run.error);

    const help = await run('help', {});
    check('help lists tools', help.out && Array.isArray(help.out.tools) && help.out.tools.length > 5);
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    server.kill();
    require('fs').rmSync('/tmp/okami-samm-acp-comm.db', { force: true });
  }
  console.log(failed ? 'ACP-COMM TEST FAILED' : 'acp-comm ok');
  process.exit(failed ? 1 : 0);
})();
