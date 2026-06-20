'use strict';
// Agent Client Protocol (Zed) test: drive the stdio JSON-RPC agent through
// initialize → session/new → session/prompt (command mode).
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DB = '/tmp/okami-samm-acp-client.db';
let failed = false;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }

function makeClient() {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'acp-client-stdio.js')], { env: { ...process.env, DB_PATH: DB }, stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  let nextId = 1;
  const pending = new Map();
  let notes = [];
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk; let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (_) { continue; }
      if (m.id != null && (m.result !== undefined || m.error !== undefined)) { const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); } }
      else if (m.method) notes.push(m);
    }
  });
  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve) => { pending.set(id, resolve); proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  }
  async function prompt(sessionId, text) {
    notes = [];
    const res = await request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] });
    const chunks = notes.filter((n) => n.method === 'session/update' && n.params.update.sessionUpdate === 'agent_message_chunk').map((n) => n.params.update.content.text).join('');
    return { res, chunks };
  }
  return { request, prompt, kill: () => proc.kill() };
}

(async () => {
  fs.rmSync(DB, { force: true });
  const c = makeClient();
  try {
    const init = await c.request('initialize', { protocolVersion: 1, clientCapabilities: {} });
    check('initialize → protocolVersion 1', init.result && init.result.protocolVersion === 1);

    const sess = await c.request('session/new', { cwd: '/tmp' });
    check('session/new → sessionId', sess.result && !!sess.result.sessionId);
    const sid = sess.result.sessionId;

    const create = await c.prompt(sid, '/create_assessment {"org":"Zed Co","lang":"en"}');
    check('prompt /create → end_turn', create.res.result && create.res.result.stopReason === 'end_turn');
    let createdId = null; try { createdId = JSON.parse(create.chunks.replace(/```json|```/g, '')).id; } catch (_) {}
    check('command created an assessment (id in chunk)', !!createdId);

    const list = await c.prompt(sid, '/list_assessments');
    check('prompt /list shows the org', /Zed Co/.test(list.chunks));

    const help = await c.prompt(sid, '/help');
    check('prompt /help lists commands', /create_assessment/.test(help.chunks) && /generate_report/.test(help.chunks));

    const nl = await c.prompt(sid, 'assess our governance maturity');
    check('NL without AI key → guidance message', /AI provider|\/help|command/i.test(nl.chunks));
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    c.kill();
    fs.rmSync(DB, { force: true });
  }
  console.log(failed ? 'ACP-CLIENT TEST FAILED' : 'acp-client ok');
  process.exit(failed ? 1 : 0);
})();
