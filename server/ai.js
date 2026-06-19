'use strict';
// Multi-provider AI layer for the Roadmap suggestions.
// Supports OpenAI-compatible APIs (OpenAI, Minimax, any OpenAI-compatible gateway)
// and Anthropic-compatible APIs — each with a configurable custom base URL.
//
// Configure via env (see .env.example):
//   AI_PROVIDER   = openai | anthropic        (default: inferred from keys)
//   AI_BASE_URL   = custom endpoint base       (optional; provider default otherwise)
//   AI_API_KEY    = the API key                (falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY)
//   AI_MODEL      = model id                   (provider default otherwise)
//
// The frontend's window.claude.complete({messages}) is mapped to whichever
// provider is configured, so the app code stays untouched.

function resolveConfig() {
  let provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const anthropicKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!provider) {
    if (process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
    else if (process.env.OPENAI_API_KEY) provider = 'openai';
  }
  if (provider === 'anthropic') {
    return {
      provider, key: anthropicKey,
      baseUrl: (process.env.AI_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, ''),
      model: process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    };
  }
  if (provider === 'openai') {
    return {
      provider, key: openaiKey,
      baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  return { provider: null, key: null };
}

function isEnabled() {
  const c = resolveConfig();
  return !!(c.provider && c.key);
}

function providerName() {
  return resolveConfig().provider;
}

function splitMessages(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  let turns = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content) }));
  if (turns.length === 0) turns = [{ role: 'user', content: String(messages.map((m) => m.content).join('\n')) }];
  return { system, turns };
}

async function callOpenAI(cfg, messages) {
  const { system, turns } = splitMessages(messages);
  const msgs = system ? [{ role: 'system', content: system }, ...turns] : turns;
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, messages: msgs, max_tokens: 1500 }),
  });
  if (!res.ok) throw upstream(res.status, await res.text().catch(() => ''));
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

async function callAnthropic(cfg, messages) {
  const { system, turns } = splitMessages(messages);
  const body = { model: cfg.model, max_tokens: 1500, messages: turns };
  if (system) body.system = system;
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw upstream(res.status, await res.text().catch(() => ''));
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function upstream(status, detail) {
  const e = new Error(`AI upstream ${status}: ${String(detail).slice(0, 500)}`);
  e.code = 'AI_UPSTREAM';
  return e;
}

async function complete(messages) {
  const cfg = resolveConfig();
  if (!cfg.provider || !cfg.key) { const e = new Error('AI disabled'); e.code = 'AI_DISABLED'; throw e; }
  return cfg.provider === 'anthropic' ? callAnthropic(cfg, messages) : callOpenAI(cfg, messages);
}

module.exports = { complete, isEnabled, providerName };
