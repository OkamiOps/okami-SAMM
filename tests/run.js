'use strict';
// Runs every test file sequentially and aggregates the result.
const { spawnSync } = require('child_process');
const path = require('path');

const TESTS = ['offline-render.js', 'scoring.test.js', 'api.test.js', 'mcp.test.js', 'acp-comm.test.js', 'acp-client.test.js'];
let failed = 0;

for (const t of TESTS) {
  console.log(`\n=== ${t} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, t)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log(`\n${failed ? `✗ ${failed} test file(s) failed` : '✓ all tests passed'}`);
process.exit(failed ? 1 : 0);
