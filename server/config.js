'use strict';
const ai = require('./ai');
// Runtime feature flags exposed to the frontend via GET /api/config.
function publicConfig() {
  return {
    aiEnabled: ai.isEnabled(),
    aiProvider: ai.isEnabled() ? ai.providerName() : null,
    version: require('../package.json').version,
  };
}
module.exports = { publicConfig };
