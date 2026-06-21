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

  // ---- responsive styles for the floating controls (mobile dock) ----
  function mountBridgeStyle() {
    if (document.getElementById('okm-bridge-style')) return;
    var st = document.createElement('style');
    st.id = 'okm-bridge-style';
    // On mobile the dock is hidden (the hamburger drawer replaces it — see index.html
    // head @media). Just keep the scroll-to-top button comfortably placed.
    st.textContent = '@media (max-width:640px){'
      + '#okm-scrolltop{left:14px!important;right:auto!important;bottom:78px!important;width:40px!important;height:40px!important;}' // above the prev/next dock
      + '}';
    document.head.appendChild(st);
  }

  // ---- floating toolbar ----
  function mountToolbar() {
    if (document.getElementById('okm-bridge-bar')) return;
    mountBridgeStyle();
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
      if (USER.role === 'admin') bar.appendChild(btn('⚙ ' + t('settings'), '#2a2b3a', function () { location.href = '/settings.html'; }));
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

  // ---- mobile hamburger drawer (consolidates nav + language + actions) ----
  // Right-side slide-in sheet. Visibility is gated by static CSS (#okm-burger shown,
  // #okm-stepper/#okm-topactions/#okm-bridge-bar hidden) in the index.html head
  // @media block, so there is no desktop-chrome flash. The drawer drives the REAL
  // dc-runtime controls (#okm-stepper / #okm-lang / #okm-topactions buttons) by
  // re-querying and .click()-ing them at click time, so labels & state stay correct.
  function mountDrawer() {
    if (document.getElementById('okm-drawer')) return;
    var STEPC = ['#e4782a', '#57C7D8', '#cf3d8a', '#e4782a', '#57C7D8', '#cf3d8a']; // orange/cyan/magenta cycle
    var SCREENS = ['setup', 'assess', 'scorecard', 'roadmap', 'history', 'compare'];
    var lastFocus = null, prevOverflow = '';

    var burger = document.createElement('button');
    burger.id = 'okm-burger';
    burger.setAttribute('aria-label', 'Menu');
    burger.setAttribute('aria-haspopup', 'dialog');
    burger.setAttribute('aria-controls', 'okm-drawer');
    burger.setAttribute('aria-expanded', 'false');
    burger.style.cssText = 'display:none;position:fixed;top:10px;right:12px;z-index:99993;width:44px;height:44px;flex-direction:column;align-items:center;justify-content:center;gap:5px;background:#0b0b12;border:1px solid #1f1f2e;color:#f4f4f8;cursor:pointer;';
    for (var i = 0; i < 3; i++) { var s = document.createElement('span'); s.style.cssText = 'display:block;width:18px;height:2px;background:#f4f4f8;'; burger.appendChild(s); }
    burger.addEventListener('click', openDrawer);
    document.body.appendChild(burger);

    var scrim = document.createElement('div');
    scrim.id = 'okm-scrim';
    scrim.style.cssText = 'position:fixed;inset:0;z-index:99995;background:rgba(4,4,8,.72);backdrop-filter:blur(4px);opacity:0;visibility:hidden;transition:opacity .28s,visibility .28s;';
    scrim.addEventListener('click', closeDrawer);
    document.body.appendChild(scrim);

    var drawer = document.createElement('aside');
    drawer.id = 'okm-drawer';
    drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-label', 'Menu');
    drawer.style.cssText = 'position:fixed;top:0;right:0;width:min(86vw,360px);z-index:99996;background:#0b0b12;border-left:1px solid #1f1f2e;box-shadow:-24px 0 60px -20px rgba(0,0,0,.8);overflow-y:auto;-webkit-overflow-scrolling:touch;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);font-family:ui-monospace,Menlo,monospace;padding-bottom:max(24px,env(safe-area-inset-bottom));';
    drawer.style.height = '100vh'; drawer.style.height = '100dvh';
    document.body.appendChild(drawer);

    function kicker(txt) { var d = document.createElement('div'); d.textContent = txt; d.style.cssText = 'font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6c6d80;border-bottom:1px solid #15151f;padding:18px 18px 8px;'; return d; }
    function row() { var b = document.createElement('button'); b.style.cssText = 'display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid #15151f;border-left:3px solid transparent;padding:0 18px;min-height:54px;color:#b9bac8;cursor:pointer;font-family:inherit;font-size:14px;'; return b; }
    function pt() { return lang() === 'pt'; }

    function build() {
      drawer.innerHTML = '';
      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 12px 14px 18px;border-bottom:1px solid #1f1f2e;position:sticky;top:0;background:#0b0b12;z-index:1;';
      var logo = document.createElement('img'); logo.src = 'assets/okami-maturity-on-dark.png'; logo.alt = 'OKAMI'; logo.style.cssText = 'height:22px;width:auto;max-width:200px;';
      var x = document.createElement('button'); x.setAttribute('aria-label', 'Close'); x.innerHTML = '&#10005;'; x.style.cssText = 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:transparent;border:1px solid #1f1f2e;color:#6c6d80;font-size:15px;cursor:pointer;'; x.addEventListener('click', closeDrawer);
      head.appendChild(logo); head.appendChild(x); drawer.appendChild(head);

      var cur = (getState().screen) || 'setup';
      // NAV
      drawer.appendChild(kicker(pt() ? '// Navegar' : '// Navigate'));
      var stepBtns = document.querySelectorAll('#okm-stepper button');
      if (stepBtns.length === 6) {
        for (var i = 0; i < 6; i++) (function (i, sb) {
          var active = SCREENS[i] === cur, col = STEPC[i], r = row();
          var num = document.createElement('span'); num.textContent = ('0' + (i + 1)).slice(-2); num.style.cssText = 'font-family:ui-monospace,Menlo,monospace;font-size:11px;color:' + col + ';opacity:' + (active ? '1' : '.78') + ';';
          var lab = document.createElement('span'); lab.textContent = (sb.textContent || '').replace(/^\s*\d+\s*/, '').trim(); lab.style.fontFamily = "'Space Grotesk',system-ui,sans-serif";
          r.appendChild(num); r.appendChild(lab);
          if (active) { r.style.borderLeftColor = col; r.style.color = '#f4f4f8'; r.style.background = '#11111b'; r.setAttribute('aria-current', 'page'); }
          r.addEventListener('click', function () { var b = document.querySelectorAll('#okm-stepper button'); if (b[i]) b[i].click(); closeDrawer(); });
          drawer.appendChild(r);
        })(i, stepBtns[i]);
      } else { var st = document.getElementById('okm-stepper'); if (st) st.style.display = 'flex'; } // fallback: never strand nav

      // LANGUAGE
      drawer.appendChild(kicker(pt() ? '// Idioma' : '// Language'));
      var lw = document.createElement('div'); lw.style.cssText = 'display:flex;margin:10px 18px 4px;border:1px solid #1f1f2e;';
      var langBtns = document.querySelectorAll('#okm-lang button');
      ['PT', 'EN'].forEach(function (code, i) {
        var on = lang() === code.toLowerCase(), seg = document.createElement('button'); seg.textContent = code;
        seg.style.cssText = 'flex:1;height:38px;border:0;cursor:pointer;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.1em;' + (on ? 'background:#e4782a;color:#0a0a0f;' : 'background:transparent;color:#b9bac8;');
        seg.addEventListener('click', function () { if (langBtns[i]) langBtns[i].click(); setTimeout(build, 70); });
        lw.appendChild(seg);
      });
      drawer.appendChild(lw);

      // ACTIONS
      drawer.appendChild(kicker(pt() ? '// Ações' : '// Actions'));
      function action(label, col, fn, danger) {
        var r = row(); if (col) r.style.borderLeftColor = col; r.style.textTransform = 'uppercase'; r.style.letterSpacing = '.06em'; r.style.fontSize = '12px';
        if (danger) { r.style.color = '#ff5b6e'; r.style.marginTop = '8px'; }
        r.textContent = label;
        r.addEventListener('click', function () { closeDrawer(); setTimeout(fn, 40); });
        drawer.appendChild(r);
      }
      action(t('newA'), '#cf3d8a', newAssessment); // t('newA') already includes the ＋
      action('☁ ' + t('save'), '#57C7D8', saveServer);
      action('📂 ' + t('load'), '#2a2b3a', openLoad);
      action('📄 ' + t('pdf'), '#e4782a', makePDF);
      action('↓ ' + (pt() ? 'Exportar JSON' : 'Export JSON'), '#2a2b3a', function () { var ex = document.querySelector('#okm-topactions > button'); if (ex) ex.click(); });
      action('↑ ' + (pt() ? 'Importar JSON' : 'Import JSON'), '#2a2b3a', function () { var lb = document.querySelector('#okm-topactions label'); if (lb) lb.click(); });
      if (USER && USER.role === 'admin') action('⚙ ' + t('settings'), '#2a2b3a', function () { location.href = '/settings.html'; });
      if (USER) {
        action('⎋ ' + t('logout'), '', logout, true);
        var who = document.createElement('div'); who.textContent = USER.username + (USER.role === 'admin' ? ' · admin' : ''); who.style.cssText = 'padding:16px 18px 4px;color:#6c6d80;font-size:10px;letter-spacing:.06em;'; drawer.appendChild(who);
      }
      var idx = SCREENS.indexOf(cur); if (burger.firstChild) burger.firstChild.style.background = idx >= 0 ? STEPC[idx] : '#f4f4f8';
    }

    function onKey(e) {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key === 'Tab') { // focus trap
        var f = drawer.querySelectorAll('button,a,input,[tabindex]'); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function openDrawer() {
      lastFocus = document.activeElement; build();
      scrim.style.visibility = 'visible'; scrim.style.opacity = '1';
      drawer.style.transform = 'translateX(0)';
      prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      burger.setAttribute('aria-expanded', 'true');
      document.addEventListener('keydown', onKey);
      var f = drawer.querySelector('button'); if (f) f.focus();
    }
    function closeDrawer() {
      scrim.style.opacity = '0'; scrim.style.visibility = 'hidden';
      drawer.style.transform = 'translateX(100%)';
      document.body.style.overflow = prevOverflow || '';
      burger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    }
  }

  // ---- mobile: fixed Prev/Next dock for the assessment (drives the real buttons) ----
  function mountPNDock() {
    if (document.getElementById('okm-pndock')) return;
    var dock = document.createElement('div');
    dock.id = 'okm-pndock';
    dock.style.cssText = 'display:none;position:fixed;left:0;right:0;bottom:0;z-index:99992;gap:10px;padding:10px 12px max(10px,env(safe-area-inset-bottom));background:rgba(6,6,9,.94);border-top:1px solid #1f1f2e;backdrop-filter:blur(10px);';
    var prev = document.createElement('button');
    prev.style.cssText = "flex:0 0 auto;min-width:104px;height:48px;padding:0 16px;background:transparent;border:1px solid #1f1f2e;color:#b9bac8;font-family:'Space Grotesk',system-ui,sans-serif;font-weight:500;font-size:14px;cursor:pointer;white-space:nowrap;";
    prev.addEventListener('click', function () { var b = document.querySelector('[data-pn=prev]'); if (b) b.click(); });
    var next = document.createElement('button');
    next.style.cssText = "flex:1 1 auto;height:48px;padding:0 16px;background:#e4782a;border:1px solid #e4782a;color:#0a0a0f;font-family:'Space Grotesk',system-ui,sans-serif;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;";
    next.addEventListener('click', function () { var b = document.querySelector('[data-pn=next]'); if (b) b.click(); });
    dock.appendChild(prev); dock.appendChild(next);
    document.body.appendChild(dock);
    updatePNDock.prev = prev; updatePNDock.next = next; updatePNDock.dock = dock;
    updatePNDock();
    window.addEventListener('resize', updatePNDock);
  }
  // show the dock only on a phone AND while the assessment is visible (#okm-pn present);
  // mirror the real buttons' labels so PT/EN and "Próxima/Concluir" stay correct.
  function updatePNDock() {
    var dock = updatePNDock.dock; if (!dock) return;
    var pn = document.getElementById('okm-pn');
    var mobile = window.matchMedia('(max-width:640px)').matches;
    var disp = (pn && mobile) ? 'flex' : 'none';
    if (dock.style.display !== disp) dock.style.display = disp;
    if (disp === 'none') return;
    // IMPORTANT: only write textContent when it actually changed. The dock lives in the
    // body that the MutationObserver watches, so an unconditional write would re-trigger
    // the observer -> updatePNDock -> write -> ... an infinite loop that froze the app.
    var rp = document.querySelector('[data-pn=prev]'), rn = document.querySelector('[data-pn=next]');
    if (rp) { var tp = (rp.textContent || '').trim(); if (updatePNDock.prev.textContent !== tp) updatePNDock.prev.textContent = tp; }
    if (rn) { var tn = (rn.textContent || '').trim(); if (updatePNDock.next.textContent !== tn) updatePNDock.next.textContent = tn; }
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
    mountDrawer();
    mountPNDock();
    applyConfigUI();
    new MutationObserver(function () { applyConfigUI(); updatePNDock(); }).observe(document.body, { childList: true, subtree: true });
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
