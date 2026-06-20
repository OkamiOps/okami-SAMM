'use strict';
// OpenAPI 3 description of the Okami SAMM REST API. Served at /api/openapi.json
// and rendered by Swagger UI at /docs.
const VERSION = require('../package.json').version;

const bearer = [{ bearerAuth: [] }, { apiKeyHeader: [] }, { cookieAuth: [] }];
const PUBLIC = []; // no auth

const ref = (n) => ({ $ref: '#/components/schemas/' + n });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ok = (desc, schema) => ({ description: desc, ...(schema ? json(schema) : {}) });
const body = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

function spec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Okami SAMM API',
      version: VERSION,
      description: [
        'OWASP SAMM v2 maturity assessment — REST API.',
        '',
        '**Auth:** every route except `/healthz`, `/api/config` and `/api/auth/*` requires a',
        'session cookie (web) or a per-user **API token** (`Authorization: Bearer <token>`',
        'or `X-API-Key`). Get your token from `GET /api/auth/me`. Click **Authorize** and',
        'paste it to try the protected endpoints below.',
        '',
        '**Agents:** the system is also reachable over **MCP** (`POST /mcp`, Streamable HTTP)',
        'and **ACP** — Agent Communication Protocol (`/acp/*`, REST) and Agent Client Protocol',
        '(stdio). Those use the same API token. See the project README for details.',
      ].join('\n'),
    },
    servers: [{ url: '/', description: 'this instance' }],
    tags: [
      { name: 'Auth' }, { name: 'Users' }, { name: 'Settings' },
      { name: 'Assessments' }, { name: 'Reports' }, { name: 'Backup' }, { name: 'AI' },
    ],
    security: bearer,
    paths: {
      '/healthz': { get: { tags: ['Auth'], summary: 'Health check', security: PUBLIC, responses: { 200: ok('ok', { type: 'object' }) } } },
      '/api/config': { get: { tags: ['Auth'], summary: 'Public config', security: PUBLIC, responses: { 200: ok('config', ref('Config')) } } },

      '/api/auth/setup': { post: { tags: ['Auth'], summary: 'Create the first admin (first run only)', security: PUBLIC, requestBody: body(ref('Credentials')), responses: { 201: ok('admin created', ref('User')), 403: ok('already set up') } } },
      '/api/auth/login': { post: { tags: ['Auth'], summary: 'Log in (sets session cookie)', security: PUBLIC, requestBody: body(ref('Credentials')), responses: { 200: ok('logged in', ref('User')), 401: ok('invalid credentials') } } },
      '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Log out', responses: { 200: ok('ok') } } },
      '/api/auth/me': { get: { tags: ['Auth'], summary: 'Current user + API token', responses: { 200: ok('user', ref('UserWithToken')), 401: ok('not authenticated') } } },
      '/api/auth/token': { post: { tags: ['Auth'], summary: 'Rotate your API token', responses: { 200: ok('new token', { type: 'object', properties: { apiToken: { type: 'string' } } }) } } },

      '/api/users': {
        get: { tags: ['Users'], summary: 'List users (admin)', responses: { 200: ok('users', { type: 'array', items: ref('User') }), 403: ok('admin only') } },
        post: { tags: ['Users'], summary: 'Create user (admin)', requestBody: body(ref('NewUser')), responses: { 201: ok('created', ref('User')), 409: ok('username exists') } },
      },
      '/api/users/{id}': {
        put: { tags: ['Users'], summary: 'Update role/password (admin)', parameters: [idParam], requestBody: body({ type: 'object', properties: { role: { type: 'string', enum: ['admin', 'user'] }, password: { type: 'string' } } }), responses: { 200: ok('updated', ref('User')) } },
        delete: { tags: ['Users'], summary: 'Delete user (admin)', parameters: [idParam], responses: { 200: ok('deleted'), 400: ok('cannot delete the last admin') } },
      },

      '/api/settings': {
        get: { tags: ['Settings'], summary: 'Get settings (admin)', responses: { 200: ok('settings', ref('Settings')) } },
        put: { tags: ['Settings'], summary: 'Update AI config / retention (admin)', requestBody: body(ref('SettingsUpdate')), responses: { 200: ok('saved') } },
      },
      '/api/settings/test-ai': { post: { tags: ['Settings'], summary: 'Test the configured AI provider (admin)', responses: { 200: ok('reply', { type: 'object' }), 400: ok('not configured'), 502: ok('upstream error') } } },

      '/api/assessments': {
        get: { tags: ['Assessments'], summary: 'List assessments', responses: { 200: ok('list', { type: 'array', items: ref('AssessmentRow') }) } },
        post: { tags: ['Assessments'], summary: 'Create an assessment', requestBody: body({ type: 'object', required: ['state'], properties: { state: ref('State') } }), responses: { 201: ok('created', ref('AssessmentRow')) } },
      },
      '/api/assessments/{id}': {
        get: { tags: ['Assessments'], summary: 'Get an assessment (with full state)', parameters: [idParam], responses: { 200: ok('assessment', ref('Assessment')), 404: ok('not found') } },
        put: { tags: ['Assessments'], summary: 'Update an assessment', parameters: [idParam], requestBody: body({ type: 'object', required: ['state'], properties: { state: ref('State') } }), responses: { 200: ok('updated', ref('AssessmentRow')) } },
        delete: { tags: ['Assessments'], summary: 'Delete an assessment', parameters: [idParam], responses: { 200: ok('deleted') } },
      },

      '/api/assessments/{id}/report.pdf': { get: { tags: ['Reports'], summary: 'Okami PDF report for an assessment', parameters: [idParam], responses: { 200: { description: 'PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, 404: ok('not found') } } },
      '/api/report/preview.pdf': { post: { tags: ['Reports'], summary: 'PDF from a raw state (without saving)', requestBody: body({ type: 'object', required: ['state'], properties: { state: ref('State') } }), responses: { 200: { description: 'PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } } } } },

      '/api/backup': { get: { tags: ['Backup'], summary: 'Export all assessments (JSON)', responses: { 200: ok('backup', ref('Backup')) } } },
      '/api/restore': { post: { tags: ['Backup'], summary: 'Restore a backup', requestBody: body({ type: 'object', properties: { assessments: { type: 'array', items: { type: 'object' } }, mode: { type: 'string', enum: ['merge', 'replace'] } } }), responses: { 200: ok('restored', { type: 'object', properties: { imported: { type: 'integer' } } }) } } },

      '/api/ai/suggest': { post: { tags: ['AI'], summary: 'AI proxy (Roadmap suggestions)', requestBody: body({ type: 'object', required: ['messages'], properties: { messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } } } }), responses: { 200: ok('text', { type: 'object', properties: { text: { type: 'string' } } }), 503: ok('AI disabled') } } },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Per-user API token from /api/auth/me' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'okami_session' },
      },
      schemas: {
        Config: { type: 'object', properties: { authEnabled: { type: 'boolean' }, needsSetup: { type: 'boolean' }, aiEnabled: { type: 'boolean' }, version: { type: 'string' } } },
        Credentials: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string', minLength: 6 } } },
        NewUser: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' }, role: { type: 'string', enum: ['admin', 'user'] } } },
        User: { type: 'object', properties: { id: { type: 'string' }, username: { type: 'string' }, role: { type: 'string' }, created_at: { type: 'string' } } },
        UserWithToken: { allOf: [ref('User'), { type: 'object', properties: { apiToken: { type: 'string' } } }] },
        Settings: { type: 'object', properties: { ai_provider: { type: 'string' }, ai_base_url: { type: 'string' }, ai_model: { type: 'string' }, ai_preset: { type: 'string' }, ai_api_key_set: { type: 'boolean' }, ai_api_key_hint: { type: 'string' }, ai_enabled: { type: 'boolean' }, retention_days: { type: 'integer' } } },
        SettingsUpdate: { type: 'object', properties: { ai_provider: { type: 'string', enum: ['openai', 'anthropic'] }, ai_base_url: { type: 'string' }, ai_model: { type: 'string' }, ai_preset: { type: 'string' }, ai_api_key: { type: 'string' }, clear_api_key: { type: 'boolean' }, retention_days: { type: 'integer' } } },
        State: { type: 'object', description: 'Full app state', properties: { lang: { type: 'string', enum: ['pt', 'en'] }, meta: { type: 'object', properties: { org: { type: 'string' }, team: { type: 'string' }, date: { type: 'string' }, lead: { type: 'string' }, contrib: { type: 'string' } } }, answers: { type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 3 } }, notes: { type: 'object' }, targets: { type: 'object' }, snapshots: { type: 'array', items: { type: 'object' } } } },
        AssessmentRow: { type: 'object', properties: { id: { type: 'string' }, org: { type: 'string' }, team: { type: 'string' }, overall_score: { type: 'number' }, created_at: { type: 'string' }, updated_at: { type: 'string' } } },
        Assessment: { allOf: [ref('AssessmentRow'), { type: 'object', properties: { state: ref('State') } }] },
        Backup: { type: 'object', properties: { app: { type: 'string' }, schema: { type: 'integer' }, exportedAt: { type: 'string' }, count: { type: 'integer' }, assessments: { type: 'array', items: { type: 'object' } } } },
      },
    },
  };
}

module.exports = { spec };
