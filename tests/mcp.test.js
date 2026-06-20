'use strict';
// MCP test: a real MCP client drives the stdio server through a full
// "operate" flow — discover the model, create, answer, score, roadmap, report.
const path = require('path');
const fs = require('fs');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const DB = '/tmp/okami-samm-mcp-test.db';
let failed = false;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failed = true; }
const parse = (r) => { try { return JSON.parse(r.content[0].text); } catch (_) { return r.content[0].text; } };

(async () => {
  fs.rmSync(DB, { force: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'server', 'mcp-stdio.js')],
    env: { ...process.env, DB_PATH: DB },
  });
  const client = new Client({ name: 'okami-samm-test', version: '1.0.0' });
  try {
    await client.connect(transport);

    const tools = (await client.listTools()).tools.map((t) => t.name);
    check('exposes core tools', ['get_samm_model', 'create_assessment', 'set_answers', 'get_scorecard', 'get_roadmap', 'generate_report'].every((t) => tools.includes(t)));

    const model = parse(await client.callTool({ name: 'get_samm_model', arguments: { lang: 'en' } }));
    const qCount = model.functions.reduce((a, f) => a + f.practices.reduce((b, p) => b + p.questions.length, 0), 0);
    check('model has 90 questions', qCount === 90);

    const created = parse(await client.callTool({ name: 'create_assessment', arguments: { org: 'MCP Org', team: 'Platform', lang: 'en' } }));
    check('create returns id + zero overall', !!created.id && created.overall === 0);
    const id = created.id;

    // answer the first question of each practice with value 3
    const answers = {};
    for (const f of model.functions) for (const p of f.practices) answers[p.questions[0].id] = 3;
    const scored = parse(await client.callTool({ name: 'set_answers', arguments: { id, answers } }));
    check('set_answers raises coverage', scored.coverage > 0 && scored.answered === Object.keys(answers).length);
    check('set_answers reports no invalid ids', Array.isArray(scored.ignoredInvalidIds) && scored.ignoredInvalidIds.length === 0);

    const bad = parse(await client.callTool({ name: 'set_answers', arguments: { id, answers: { 'NOPE-1': 3 } } }));
    check('invalid id ignored', bad.ignoredInvalidIds.includes('NOPE-1'));

    const card = parse(await client.callTool({ name: 'get_scorecard', arguments: { id } }));
    check('scorecard has 5 functions', card.functions.length === 5 && typeof card.overall === 'number');

    const rm = parse(await client.callTool({ name: 'get_roadmap', arguments: { id } }));
    check('roadmap has priorities with actions', rm.priorities.length > 0 && Array.isArray(rm.priorities[0].actions));

    const snap = parse(await client.callTool({ name: 'add_snapshot', arguments: { id, label: 'baseline' } }));
    check('snapshot saved', snap.saved === true && snap.totalSnapshots === 1);

    const out = '/tmp/okami-samm-mcp-report.pdf';
    const rep = parse(await client.callTool({ name: 'generate_report', arguments: { id, outputPath: out } }));
    const isPdf = fs.existsSync(out) && fs.readFileSync(out).subarray(0, 4).toString('latin1') === '%PDF';
    check('generate_report writes a PDF', rep.path === out && isPdf);

    const list = parse(await client.callTool({ name: 'list_assessments', arguments: {} }));
    check('list contains the assessment', Array.isArray(list) && list.some((a) => a.id === id));

    const del = parse(await client.callTool({ name: 'delete_assessment', arguments: { id } }));
    check('delete works', del.deleted === true);

    await client.close();
  } catch (e) {
    console.error('ERROR', e.message); failed = true;
  } finally {
    fs.rmSync(DB, { force: true });
    try { fs.rmSync('/tmp/okami-samm-mcp-report.pdf', { force: true }); } catch (_) {}
  }
  console.log(failed ? 'MCP TEST FAILED' : 'mcp ok');
  process.exit(failed ? 1 : 0);
})();
