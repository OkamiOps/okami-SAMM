'use strict';
// Agent Client Protocol (Zed) agent logic. JSON-RPC method handlers; the stdio
// transport lives in server/acp-client-stdio.js. The agent operates the SAMM
// system either by direct commands (/<tool> {args}) — always available — or, when
// an AI provider is configured, by natural language via an LLM tool-calling loop.
const { TOOLS, execute, jsonSchema } = require('./operations');
const ai = require('./ai');

const PROTOCOL_VERSION = 1;
const SYSTEM = 'You operate the Okami OWASP SAMM v2 security-maturity assessment system through tools. '
  + 'Help the user assess maturity: create assessments, answer questions (call get_samm_model for the 90 question ids), set targets/notes, read the scorecard and roadmap, snapshot progress and generate the PDF report. '
  + 'Be concise and report what you did with concrete numbers.';

const toolDefs = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: jsonSchema(t) }));

function promptText(blocks) {
  return (blocks || []).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
}

function createAgent() {
  const sessions = new Map();
  let sid = 0;

  async function handlePrompt(params, notify) {
    const sessionId = params.sessionId;
    if (!sessions.has(sessionId)) { const e = new Error('session not found'); e.code = -32602; throw e; }
    const text = promptText(params.prompt);
    const say = (t) => notify('session/update', { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: t } } });

    if (!text) { say('Send a request, or a /<tool> command. Try /help.'); return { stopReason: 'end_turn' }; }

    // ---- command mode: /<tool> [json args] ----
    if (text.startsWith('/')) {
      const sp = text.slice(1).indexOf(' ');
      const name = (sp === -1 ? text.slice(1) : text.slice(1, sp + 1)).trim();
      const rest = sp === -1 ? '' : text.slice(sp + 2).trim();
      if (name === 'help' || name === '') { say('Available commands:\n' + TOOLS.map((t) => `/${t.name} — ${t.description}`).join('\n')); return { stopReason: 'end_turn' }; }
      let args = {}; if (rest) { try { args = JSON.parse(rest); } catch (_) { say('Args must be JSON. Example: /create_assessment {"org":"ACME"}'); return { stopReason: 'end_turn' }; } }
      try { const out = await execute(name, args); say('```json\n' + JSON.stringify(out, null, 2) + '\n```'); }
      catch (e) { say('Error: ' + e.message); }
      return { stopReason: 'end_turn' };
    }

    // ---- natural-language mode (requires an AI provider) ----
    if (!ai.isEnabled()) {
      say('Natural-language mode needs an AI provider (set AI_PROVIDER/AI_API_KEY). For now use /<tool> commands — try /help.');
      return { stopReason: 'end_turn' };
    }
    try {
      const final = await ai.runAgent({
        system: SYSTEM, userText: text, tools: toolDefs, execute,
        onStep: ({ tool }) => say(`→ ${tool}\n`),
      });
      if (final) say(final);
    } catch (e) { say('AI error: ' + e.message); }
    return { stopReason: 'end_turn' };
  }

  async function onRequest(method, params, notify) {
    switch (method) {
      case 'initialize':
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false } }, authMethods: [] };
      case 'authenticate':
        return {};
      case 'session/new': {
        const sessionId = 'sess_' + (++sid); sessions.set(sessionId, { cwd: params && params.cwd });
        return { sessionId };
      }
      case 'session/prompt':
        return handlePrompt(params, notify);
      default: { const e = new Error('method not found: ' + method); e.code = -32601; throw e; }
    }
  }

  function onNotification(method) { /* session/cancel etc. — no-op (commands are short) */ void method; }

  return { onRequest, onNotification };
}

module.exports = { createAgent, PROTOCOL_VERSION };
