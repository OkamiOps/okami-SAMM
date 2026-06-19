'use strict';
// Runtime feature flags exposed to the frontend via GET /api/config.
function publicConfig() {
  return {
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
    version: require('../package.json').version,
  };
}
module.exports = { publicConfig };
