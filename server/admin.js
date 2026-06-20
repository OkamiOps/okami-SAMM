#!/usr/bin/env node
'use strict';
// Admin recovery CLI — manage local users from the terminal (no login needed).
//   node server/admin.js list
//   node server/admin.js create-admin <username> <password>
//   node server/admin.js set-password <username> <password>
//   node server/admin.js set-role <username> <admin|user>
//   node server/admin.js delete <username>
//   node server/admin.js reset            (remove ALL users → next start shows "Create admin")
// Honors DB_PATH (same DB as the server).
const db = require('./db');
const auth = require('./auth');

const [cmd, a, b] = process.argv.slice(2);
const out = (o) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));

function main() {
  switch (cmd) {
    case 'list':
      return out(db.listUsers());

    case 'create-admin': {
      if (!a || !b) return fail('usage: create-admin <username> <password>');
      if (String(b).length < 6) return fail('password must be at least 6 chars');
      const existing = db.getUserByUsername(a);
      if (existing) {
        db.updateUser(existing.id, { password_hash: auth.hashPassword(b), role: 'admin' });
        return out(`updated existing user "${a}" → admin, password set`);
      }
      const u = db.createUser({ username: a, password_hash: auth.hashPassword(b), role: 'admin', api_token: auth.newApiToken() });
      return out({ created: db.userPublic(u), apiToken: u.api_token });
    }

    case 'set-password': {
      if (!a || !b) return fail('usage: set-password <username> <password>');
      if (String(b).length < 6) return fail('password must be at least 6 chars');
      const u = db.getUserByUsername(a); if (!u) return fail('no such user: ' + a);
      db.updateUser(u.id, { password_hash: auth.hashPassword(b) });
      return out(`password updated for "${a}"`);
    }

    case 'set-role': {
      if (!a || (b !== 'admin' && b !== 'user')) return fail('usage: set-role <username> <admin|user>');
      const u = db.getUserByUsername(a); if (!u) return fail('no such user: ' + a);
      db.updateUser(u.id, { role: b });
      return out(`role of "${a}" set to ${b}`);
    }

    case 'delete': {
      if (!a) return fail('usage: delete <username>');
      const u = db.getUserByUsername(a); if (!u) return fail('no such user: ' + a);
      db.deleteUser(u.id);
      return out(`deleted "${a}"`);
    }

    case 'reset': {
      const n = db.listUsers().length;
      db.db.prepare('DELETE FROM users').run();
      return out(`removed ${n} user(s) — next app start will show "Create admin"`);
    }

    default:
      return fail('commands: list | create-admin | set-password | set-role | delete | reset');
  }
}
function fail(msg) { console.error('Error: ' + msg); process.exit(1); }
main();
