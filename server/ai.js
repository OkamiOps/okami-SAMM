'use strict';
// Optional proxy to the Anthropic API. Mirrors the shape the frontend expects
// from window.claude.complete({ messages }) -> returns plain text.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

async function complete(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { const e = new Error('AI disabled'); e.code = 'AI_DISABLED'; throw e; }

  // Anthropic Messages API: system goes top-level; only user/assistant in messages.
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const turns = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content) }));
  if (turns.length === 0) turns.push({ role: 'user', content: String(messages.map((m) => m.content).join('\n')) });

  const body = { model: MODEL, max_tokens: 1500, messages: turns };
  if (sys) body.system = sys;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const e = new Error(`Anthropic API ${res.status}: ${detail.slice(0, 500)}`);
    e.code = 'AI_UPSTREAM';
    throw e;
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

module.exports = { complete };
