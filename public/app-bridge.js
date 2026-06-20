/* Okami SAMM — server bridge.
 * Connects the standalone Design Canvas app to the Node/SQLite backend without
 * touching the React component: it reads/writes the app's own localStorage
 * state (okami_maturity_state_v1) and talks to the REST API.
 *  - window.claude.complete  -> POST /api/ai/suggest  (optional AI)
 *  - floating Okami toolbar   -> save / load / Okami PDF
 *  - hides the AI button when the server has no API key configured
 */
(function () {
  'use strict';
  var KEY = 'okami_maturity_state_v1';
  var IDKEY = 'okami_samm_server_id';
  var CONFIG = { aiEnabled: false };
  var USER = null;

  // ---- AI shim (must exist before the user clicks "AI suggestions") ----
  window.claude = window.claude || {};
  window.claude.complete = async function (arg) {
    var messages = Array.isArray(arg) ? arg : (arg && arg.messages) || [];
    var res = await fetch('/api/ai/suggest', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages }),
    });
    if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
    var data = await res.json();
    return data.text;
  };

  function getState() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function setState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function lang() { return (getState().lang === 'pt') ? 'pt' : 'en'; }
  var T = {
    pt: { settings: 'Config', logout: 'Sair', newA: '＋ Nova', newConfirm: 'Iniciar uma nova avaliação? Alterações não salvas no servidor serão perdidas.', save: 'Salvar', load: 'Carregar', pdf: 'Relatório PDF', saved: 'Avaliação salva no servidor', updated: 'Avaliação atualizada', loaded: 'Avaliação carregada', err: 'Erro ao falar com o servidor', none: 'Nenhuma avaliação salva ainda.', pick: 'Carregar avaliação', close: 'Fechar', untitled: 'Sem nome', overall: 'Maturidade', gen: 'Gerando PDF…', exportAll: '⤓ Backup', importAll: '⤒ Restaurar', restored: function (n) { return n + ' avaliação(ões) restaurada(s)'; } },
    en: { settings: 'Settings', logout: 'Log out', newA: '＋ New', newConfirm: 'Start a new assessment? Unsaved server changes will be lost.', save: 'Save', load: 'Load', pdf: 'PDF report', saved: 'Assessment saved to server', updated: 'Assessment updated', loaded: 'Assessment loaded', err: 'Could not reach the server', none: 'No saved assessment yet.', pick: 'Load assessment', close: 'Close', untitled: 'Untitled', overall: 'Maturity', gen: 'Generating PDF…', exportAll: '⤓ Backup', importAll: '⤒ Restore', restored: function (n) { return n + ' assessment(s) restored'; } },
  };
  function t(k) { return (T[lang()] || T.pt)[k]; }

  // ---- toast ----
  function toast(msg, bad) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:99999;'
      + 'font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.04em;padding:11px 18px;'
      + 'background:#11111b;color:#f4f4f8;border:1px solid ' + (bad ? '#cf4d54' : '#2a2b3a')
      + ';border-left:3px solid ' + (bad ? '#cf4d54' : '#57C7D8') + ';box-shadow:0 10px 40px -12px rgba(0,0,0,.8);';
    document.body.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 420); }, 2600);
  }

  // ---- save / update ----
  async function saveServer() {
    var state = getState();
    if (!state || !Object.keys(state).length) { toast(t('err'), true); return; }
    var id = localStorage.getItem(IDKEY);
    try {
      var res = await fetch(id ? '/api/assessments/' + id : '/api/assessments', {
        method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: state }),
      });
      if (res.status === 404) { localStorage.removeItem(IDKEY); return saveServer(); }
      if (!res.ok) throw new Error(res.status);
      var a = await res.json();
      localStorage.setItem(IDKEY, a.id);
      toast(id ? t('updated') : t('saved'));
    } catch (e) { toast(t('err'), true); }
  }

  // ---- load list modal ----
  async function openLoad() {
    var list;
    try { list = await (await fetch('/api/assessments')).json(); } catch (e) { toast(t('err'), true); return; }
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(4,4,8,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'width:min(560px,92vw);max-height:80vh;overflow:auto;background:#0b0b12;border:1px solid #1f1f2e;color:#f4f4f8;font-family:ui-monospace,Menlo,monospace;';
    var rows = (list || []).map(function (a) {
      var title = (a.org || a.team || t('untitled'));
      var score = (a.overall_score != null) ? Number(a.overall_score).toFixed(2) : '–';
      var when = (a.updated_at || a.created_at || '').slice(0, 10);
      return '<button data-id="' + a.id + '" style="display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;width:100%;text-align:left;'
        + 'background:transparent;border:0;border-bottom:1px solid #15151f;color:#f4f4f8;padding:14px 18px;cursor:pointer;font:inherit;">'
        + '<span style="font-size:13px;">' + esc(title) + '</span>'
        + '<span style="font-size:11px;color:#e4782a;">' + score + ' / 3</span>'
        + '<span style="font-size:10px;color:#6c6d80;letter-spacing:.08em;">' + esc((a.team && a.org ? a.team + ' · ' : '')) + when + '</span>'
        + '<span data-del="' + a.id + '" title="delete" style="font-size:11px;color:#74758a;justify-self:end;">✕</span>'
        + '</button>';
    }).join('') || '<div style="padding:24px 18px;color:#6c6d80;font-size:12px;">' + t('none') + '</div>';
    var actBtn = 'cursor:pointer;background:transparent;border:1px solid #2a2b3a;color:#b9bac8;font:inherit;font-size:11px;padding:7px 12px;';
    box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #1f1f2e;">'
      + '<b style="font-family:\'Space Grotesk\',sans-serif;letter-spacing:.1em;font-size:12px;">// ' + esc(t('pick')) + '</b>'
      + '<span id="okmClose" style="cursor:pointer;color:#6c6d80;">✕</span></div>'
      + '<div style="display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid #15151f;">'
      + '<button id="okmExport" style="' + actBtn + '">' + esc(t('exportAll')) + '</button>'
      + '<button id="okmImport" style="' + actBtn + '">' + esc(t('importAll')) + '</button>'
      + '<input id="okmImportFile" type="file" accept="application/json" style="display:none;"></div>' + rows;
    ov.appendChild(box); document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.querySelector('#okmClose').addEventListener('click', close);
    // ---- backup (download all) ----
    box.querySelector('#okmExport').addEventListener('click', function () {
      var a = document.createElement('a'); a.href = '/api/backup'; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
    });
    // ---- restore (upload JSON) ----
    var fileEl = box.querySelector('#okmImportFile');
    box.querySelector('#okmImport').addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', async function () {
      var f = fileEl.files && fileEl.files[0]; if (!f) return;
      try {
        var data = JSON.parse(await f.text());
        var res = await fetch('/api/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assessments: data.assessments, mode: 'merge' }) });
        if (!res.ok) throw new Error(res.status);
        var r = await res.json();
        toast(t('restored')(r.imported));
        close(); openLoad();
      } catch (e) { toast(t('err'), true); }
    });
    box.querySelectorAll('button[data-id]').forEach(function (b) {
      b.addEventListener('click', async function (e) {
        var del = e.target.closest('[data-del]');
        var id = b.getAttribute('data-id');
        if (del) {
          e.stopPropagation();
          await fetch('/api/assessments/' + id, { method: 'DELETE' }).catch(function () {});
          if (localStorage.getItem(IDKEY) === id) localStorage.removeItem(IDKEY);
          close(); openLoad(); return;
        }
        try {
          var a = await (await fetch('/api/assessments/' + id)).json();
          setState(a.state); localStorage.setItem(IDKEY, id);
          close(); toast(t('loaded'));
          setTimeout(function () { location.reload(); }, 350);
        } catch (err) { toast(t('err'), true); }
      });
    });
  }

  // ---- Okami PDF from current state ----
  async function makePDF() {
    var state = getState();
    toast(t('gen'));
    try {
      var res = await fetch('/api/report/preview.pdf', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: state }),
      });
      if (!res.ok) throw new Error(res.status);
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { toast(t('err'), true); }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- floating toolbar ----
  function mountToolbar() {
    if (document.getElementById('okm-bridge-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'okm-bridge-bar';
    bar.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99990;display:flex;gap:8px;'
      + 'font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;';
    function btn(label, accent, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'height:38px;padding:0 16px;cursor:pointer;background:#0b0b12;color:#f4f4f8;'
        + 'border:1px solid ' + accent + ';box-shadow:0 8px 30px -12px rgba(0,0,0,.7);';
      b.onmouseenter = function () { b.style.background = '#11111b'; };
      b.onmouseleave = function () { b.style.background = '#0b0b12'; };
      b.addEventListener('click', fn);
      return b;
    }
    if (USER) {
      var who = document.createElement('span');
      who.textContent = USER.username + (USER.role === 'admin' ? ' · admin' : '');
      who.style.cssText = 'display:flex;align-items:center;padding:0 12px;color:#6c6d80;font-size:10px;letter-spacing:.06em;';
      bar.appendChild(who);
    }
    bar.appendChild(btn(t('newA'), '#cf3d8a', newAssessment));
    bar.appendChild(btn('☁ ' + t('save'), '#57C7D8', saveServer));
    bar.appendChild(btn('📂 ' + t('load'), '#2a2b3a', openLoad));
    bar.appendChild(btn('📄 ' + t('pdf'), '#e4782a', makePDF));
    if (USER) bar.appendChild(btn('⎋ ' + t('logout'), '#2a2b3a', logout));
    document.body.appendChild(bar);
  }

  // ---- start a fresh assessment (clears local draft + server link) ----
  function newAssessment() {
    if (!window.confirm(t('newConfirm'))) return;
    localStorage.removeItem(KEY);
    localStorage.removeItem(IDKEY);
    location.reload();
  }

  // ---- scroll-to-top floating button (bottom-left, appears after scrolling) ----
  function mountScrollTop() {
    if (document.getElementById('okm-scrolltop')) return;
    var b = document.createElement('button');
    b.id = 'okm-scrolltop';
    b.setAttribute('aria-label', 'Scroll to top');
    b.innerHTML = '↑';
    b.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:99990;width:42px;height:42px;'
      + 'display:flex;align-items:center;justify-content:center;cursor:pointer;'
      + 'background:#0b0b12;color:#57C7D8;border:1px solid #57C7D8;border-radius:50%;'
      + 'font-size:20px;line-height:1;box-shadow:0 8px 30px -12px rgba(0,0,0,.7);'
      + 'opacity:0;visibility:hidden;transform:translateY(8px);transition:opacity .25s,transform .25s,visibility .25s;';
    b.onmouseenter = function () { b.style.background = '#11111b'; };
    b.onmouseleave = function () { b.style.background = '#0b0b12'; };
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.body.appendChild(b);
    var toggle = function () {
      var show = (window.scrollY || document.documentElement.scrollTop) > 300;
      b.style.opacity = show ? '1' : '0';
      b.style.visibility = show ? 'visible' : 'hidden';
      b.style.transform = show ? 'translateY(0)' : 'translateY(8px)';
    };
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();
  }

  // ---- hide built-in AI + reroute built-in "↓ PDF" to the Okami report ----
  function applyConfigUI() {
    document.querySelectorAll('button').forEach(function (b) {
      var txt = (b.textContent || '').trim();
      if (!CONFIG.aiEnabled && txt.charAt(0) === '✦') b.style.display = 'none';
    });
  }
  // capture-phase: intercept the built-in jsPDF button so it produces the Okami PDF
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    var txt = (b.textContent || '').trim();
    if (txt === '↓ PDF' || txt === 'PDF') { e.preventDefault(); e.stopImmediatePropagation(); makePDF(); }
  }, true);

  function init() {
    mountToolbar();
    mountScrollTop();
    applyConfigUI();
    new MutationObserver(function () { applyConfigUI(); }).observe(document.body, { childList: true, subtree: true });
  }

  // ---- auth gate: require login before showing the app ----
  fetch('/api/auth/me').then(function (r) {
    if (r.status === 401) { location.replace('/login.html'); throw 'noauth'; }
    return r.json();
  }).then(function (u) {
    USER = u;
    return fetch('/api/config').then(function (r) { return r.json(); });
  }).then(function (c) {
    CONFIG = c || CONFIG;
    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
  }).catch(function (e) { if (e !== 'noauth') { /* network error — leave app as-is */ } });

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.replace('/login.html');
  }
})();
