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

// Settings come from the DB (set in the Settings UI) with env vars as fallback.
function resolveConfig() {
  let db; try { db = require('./db'); } catch (_) { db = null; }
  const s = (k) => (db && db.getSetting ? db.getSetting(k) : null);
  const provGet = () => (s('ai_provider') || process.env.AI_PROVIDER || '').toLowerCase();
  const key = s('ai_api_key') || process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
  let provider = provGet();
  if (!provider) {
    if (s('ai_api_key')) provider = 'openai';
    else if (process.env.ANTHROPIC_API_KEY) provider = 'anthropic';
    else if (process.env.OPENAI_API_KEY) provider = 'openai';
  }
  const baseUrl = s('ai_base_url') || process.env.AI_BASE_URL || '';
  const model = s('ai_model') || process.env.AI_MODEL || '';
  if (provider === 'anthropic') {
    return { provider, key, baseUrl: (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, ''), model: model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6' };
  }
  if (provider === 'openai') {
    return { provider, key, baseUrl: (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''), model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini' };
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

// ---- agent loop: let the model call SAMM tools to fulfill a natural-language task ----
// tools: [{ name, description, input_schema(JSONSchema) }]; execute: (name,args)=>Promise(result)
// onStep(optional): ({ tool, args, result }) for progress. Returns the final assistant text.
async function runAgent({ system, userText, tools, execute, onStep, maxSteps = 8 }) {
  const cfg = resolveConfig();
  if (!cfg.provider || !cfg.key) { const e = new Error('AI disabled'); e.code = 'AI_DISABLED'; throw e; }
  return cfg.provider === 'anthropic'
    ? agentAnthropic(cfg, { system, userText, tools, execute, onStep, maxSteps })
    : agentOpenAI(cfg, { system, userText, tools, execute, onStep, maxSteps });
}

async function agentAnthropic(cfg, { system, userText, tools, execute, onStep, maxSteps }) {
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema || { type: 'object' } }));
  const messages = [{ role: 'user', content: userText }];
  let text = '';
  for (let step = 0; step < maxSteps; step++) {
    const body = { model: cfg.model, max_tokens: 2000, messages, tools: toolDefs };
    if (system) body.system = system;
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
    if (!res.ok) throw upstream(res.status, await res.text().catch(() => ''));
    const data = await res.json();
    text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const toolUses = (data.content || []).filter((b) => b.type === 'tool_use');
    if (!toolUses.length || data.stop_reason !== 'tool_use') return text;
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const tu of toolUses) {
      let out; try { out = await execute(tu.name, tu.input || {}); } catch (e) { out = { error: e.message }; }
      if (onStep) onStep({ tool: tu.name, args: tu.input, result: out });
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  return text;
}

async function agentOpenAI(cfg, { system, userText, tools, execute, onStep, maxSteps }) {
  const toolDefs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object' } } }));
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: userText });
  let text = '';
  for (let step = 0; step < maxSteps; step++) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages, tools: toolDefs }) });
    if (!res.ok) throw upstream(res.status, await res.text().catch(() => ''));
    const data = await res.json();
    const m = data.choices && data.choices[0] && data.choices[0].message;
    text = (m && m.content) || text;
    const calls = (m && m.tool_calls) || [];
    if (!calls.length) return text;
    messages.push(m);
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch (_) {}
      let out; try { out = await execute(c.function.name, args); } catch (e) { out = { error: e.message }; }
      if (onStep) onStep({ tool: c.function.name, args, result: out });
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return text;
}

module.exports = { complete, isEnabled, providerName, runAgent };
