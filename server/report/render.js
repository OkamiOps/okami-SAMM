'use strict';
const fs = require('fs');
const path = require('path');
const { summarize } = require('../score');

const FONTS = (() => {
  try { return fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8'); } catch (_) { return ''; }
})();
const LOGO = (() => {
  try {
    const b = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'okami-logo-outline.png'));
    return 'data:image/png;base64,' + b.toString('base64');
  } catch (_) { return ''; }
})();

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n, d = 2) => Number(n).toFixed(d);

// Per-function brand colors (document/print-safe hues, mapped to the doc tokens).
const FN_COLOR = { G: 'var(--doc-orange)', D: 'var(--doc-cyan)', I: 'var(--doc-magenta)', V: 'var(--doc-warning)', O: 'var(--doc-success)' };
const FN_TAG = { G: 't-org', D: 't-cyan', I: 't-mag', V: 't-org', O: 't-ok' };

const STR = {
  pt: {
    classification: 'Confidencial', report: 'Relatório de Maturidade', eyebrow: '// owasp samm v2 · relatório de maturidade',
    titleLead: 'Avaliação de Maturidade em Segurança', subtitle: 'Maturidade do ciclo de desenvolvimento seguro nas 15 práticas do OWASP SAMM.',
    org: 'Organização', team: 'Equipe / Aplicação', date: 'Data', lead: 'Líder', contrib: 'Participantes', overall: 'Maturidade geral', generated: 'Gerado em',
    execSummary: 'Resumo executivo', execLede: 'Visão consolidada da maturidade atual, cobertura da avaliação e práticas na meta.',
    coverage: 'Cobertura', onTarget: 'Práticas na meta', avgGap: 'Lacuna média', level3: 'Práticas Nível 3',
    byFunction: 'Maturidade por função de negócio', radarTitle: 'Radar de maturidade', byPractice: 'Maturidade por prática',
    nextSteps: 'Próximos passos prioritários', nextLede: 'Práticas com maior lacuna até a meta — comece por aqui.',
    practice: 'Prática', function: 'Função', current: 'Atual', target: 'Meta', gap: 'Lacuna', focus: 'Foco', noGaps: 'Todas as práticas atingiram a meta definida. Mantenha a melhoria contínua e reavalie periodicamente.',
    detail: 'Detalhamento por prática', detailLede: 'Score 0–3 por prática (média dos dois streams A e B). Meta = próximo nível a conquistar.',
    streamA: 'Criar / Stream A', streamB: 'Medir / Stream B', bands: ['Inicial / Ad-hoc', 'Em desenvolvimento', 'Maduro', 'Otimizado'],
    page: 'Página', howto: 'Maturidade 0–3 por prática · Meta sugerida = próximo nível · Lacuna = distância até a meta',
  },
  en: {
    classification: 'Confidential', report: 'Maturity Report', eyebrow: '// owasp samm v2 · maturity report',
    titleLead: 'Software Security Maturity Assessment', subtitle: 'Maturity of the secure development lifecycle across the 15 OWASP SAMM practices.',
    org: 'Organization', team: 'Team / Application', date: 'Date', lead: 'Team lead', contrib: 'Contributors', overall: 'Overall maturity', generated: 'Generated on',
    execSummary: 'Executive summary', execLede: 'Consolidated view of current maturity, assessment coverage and practices on target.',
    coverage: 'Coverage', onTarget: 'Practices on target', avgGap: 'Average gap', level3: 'Level 3 practices',
    byFunction: 'Maturity by business function', radarTitle: 'Maturity radar', byPractice: 'Maturity by practice',
    nextSteps: 'Priority next steps', nextLede: 'Practices with the largest gap to target — start here.',
    practice: 'Practice', function: 'Function', current: 'Current', target: 'Target', gap: 'Gap', focus: 'Focus', noGaps: 'All practices reached their target. Keep improving and re-assess periodically.',
    detail: 'Per-practice detail', detailLede: 'Score 0–3 per practice (average of streams A and B). Target = next level to reach.',
    streamA: 'Create / Stream A', streamB: 'Measure / Stream B', bands: ['Initial / Ad-hoc', 'Developing', 'Mature', 'Optimized'],
    page: 'Page', howto: 'Maturity 0–3 per practice · Suggested target = next level · Gap = distance to target',
  },
};

function bar(value, max, color) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<span class="bt"><span class="bf" style="width:${pct.toFixed(1)}%;background:${color};"></span></span>`;
}

function runHead(L, scope) {
  return `<div class="run-head">
    <div class="brand"><span class="chip">${LOGO ? `<img src="${LOGO}" alt="">` : ''}</span><b>OKAMI</b></div>
    <div class="doc-ref">${esc(scope || L.report)} · OWASP SAMM v2</div>
  </div><div class="head-rule"></div>`;
}
function runFoot(L) {
  return `<div class="run-foot"><span class="conf">${L.classification}</span><span class="page-no"></span></div>`;
}

// ---- radar SVG (15 practices) -------------------------------------------
function radarSVG(functions) {
  const pts = [];
  functions.forEach((f) => f.practices.forEach((p) => pts.push({ ...p, fnCode: f.code })));
  const N = pts.length, cx = 260, cy = 250, R = 185;
  const ang = (i) => (-Math.PI / 2) + (i / N) * Math.PI * 2;
  const pos = (i, r) => [cx + Math.cos(ang(i)) * r * (R / 3), cy + Math.sin(ang(i)) * r * (R / 3)];
  let g = '';
  for (let lv = 1; lv <= 3; lv++) {
    const ring = pts.map((_, i) => pos(i, lv).join(',')).join(' ');
    g += `<polygon points="${ring}" fill="none" stroke="var(--doc-line)" stroke-width="1"/>`;
  }
  for (let i = 0; i < N; i++) { const [x, y] = pos(i, 3); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--doc-line-soft)" stroke-width="1"/>`; }
  const scorePoly = pts.map((p, i) => pos(i, p.score).join(',')).join(' ');
  const targetPoly = pts.map((p, i) => pos(i, p.target).join(',')).join(' ');
  g += `<polygon points="${targetPoly}" fill="none" stroke="var(--doc-cyan)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  g += `<polygon points="${scorePoly}" fill="color-mix(in oklch, var(--doc-magenta) 24%, transparent)" stroke="var(--doc-magenta)" stroke-width="2.2"/>`;
  for (let i = 0; i < N; i++) {
    const p = pts[i]; const [x, y] = pos(i, p.score);
    g += `<circle cx="${x}" cy="${y}" r="2.6" fill="${FN_COLOR[p.fnCode]}"/>`;
    const [lx, ly] = pos(i, 3.32);
    const anchor = Math.abs(lx - cx) < 14 ? 'middle' : (lx < cx ? 'end' : 'start');
    g += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-family="var(--ok-mono)" font-size="9" fill="var(--doc-ink-mute)">${esc(p.code)}</text>`;
  }
  return `<svg viewBox="0 0 520 500" width="100%" style="max-width:300px;display:block;margin:4px auto 0;">${g}</svg>`;
}

function coverPage(meta, S, L, gen) {
  const row = (k, v, cyan) => v ? `<div class="row"><span class="k">${k}</span><span class="v${cyan ? ' cyan' : ''}">${esc(v)}</span></div>` : '';
  const title = meta.org || meta.team || L.titleLead;
  return `<section class="sheet cover"><div class="pad">
    <div class="cover-top">
      <div class="cover-logo">${LOGO ? `<img src="${LOGO}" alt="OKAMI">` : ''}<div class="wm">OKAMI<small>SECURITY MATURITY</small></div></div>
      <div class="cover-class">${L.classification}</div>
    </div>
    <div class="cover-mid">
      <div class="cover-eyebrow">${esc(L.eyebrow)}</div>
      <h1>${esc(title)} <em>·</em> ${esc(L.report)}</h1>
      <div class="cover-sub">${esc(L.subtitle)}</div>
      <div class="cover-meta">
        ${row(L.org, meta.org)}${row(L.team, meta.team)}
        ${row(L.date, meta.date)}${row(L.lead, meta.lead)}
        ${row(L.contrib, meta.contrib)}
        <div class="row"><span class="k">${L.overall}</span><span class="v cyan">${num(S.overall)} / 3 · ${esc(L.bands[S.band])}</span></div>
      </div>
    </div>
    <div class="cover-foot">
      <div class="org"><b>OKAMI</b> · Application Security<br>${L.generated} ${esc(gen)}</div>
      <div class="org">OWASP SAMM v2 · 5 ${'functions'} · 15 practices · 90 questions</div>
    </div>
  </div></section>`;
}

function execPage(S, L) {
  const metricRow = `<div class="metric-row">
    <div class="metric"><div class="mv org">${num(S.overall)}</div><div class="ml">${L.overall} · ${esc(L.bands[S.band])}</div></div>
    <div class="metric"><div class="mv cyan">${S.coverage}%</div><div class="ml">${L.coverage} · ${S.answered}/${S.totalQuestions}</div></div>
    <div class="metric"><div class="mv mag">${S.onTarget}/15</div><div class="ml">${L.onTarget} · ${L.avgGap} ${num(S.avgGap)}</div></div>
  </div>`;
  const fnBars = S.functions.map((f) => `
    <div style="display:grid;grid-template-columns:150px 1fr 46px;align-items:center;gap:12px;margin:9px 0;">
      <span class="bl"><span style="display:inline-block;width:8px;height:8px;background:${FN_COLOR[f.code]};margin-right:8px;border-radius:1px;"></span>${esc(f.name)}</span>
      ${bar(f.avg, 3, FN_COLOR[f.code])}
      <span class="bv" style="font-family:var(--ok-mono);font-size:11px;">${num(f.avg)}</span>
    </div>`).join('');
  return `<section class="sheet wm-on">${runHead(L)}<div class="pad">
    <div class="doc-eyebrow">// 01 · ${esc(L.execSummary)}</div>
    <h1 class="doc-h1"><span class="num">01</span>${esc(L.execSummary)}</h1>
    <p class="doc-lede">${esc(L.execLede)}</p>
    ${metricRow}
    <h2 class="doc-h2"><span class="num">1.1</span>${esc(L.byFunction)}</h2>
    ${fnBars}
    <h2 class="doc-h2"><span class="num">1.2</span>${esc(L.radarTitle)}</h2>
    ${radarSVG(S.functions)}
    <div class="callout"><span class="co-label">${esc(L.howto)}</span></div>
  </div>${runFoot(L)}</section>`;
}

function nextStepsPage(S, L) {
  let table;
  if (!S.priority.length) {
    table = `<div class="callout hero"><span class="co-label">${L.nextSteps}</span><p>${esc(L.noGaps)}</p></div>`;
  } else {
    const rows = S.priority.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td><span class="tag ${FN_TAG[p.fnCode]}">${esc(p.fnName)}</span></td>
      <td class="num">${num(p.score)}</td>
      <td class="num">${p.target}</td>
      <td class="num">${num(p.gap)}</td>
      <td class="num">L${p.focus}</td>
    </tr>`).join('');
    table = `<table class="doc-table"><caption>${esc(L.nextSteps)}</caption>
      <thead><tr><th>${L.practice}</th><th>${L.function}</th><th class="num">${L.current}</th><th class="num">${L.target}</th><th class="num">${L.gap}</th><th class="num">${L.focus}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }
  return `<section class="sheet wm-on">${runHead(L)}<div class="pad">
    <div class="doc-eyebrow">// 02 · ${esc(L.nextSteps)}</div>
    <h1 class="doc-h1"><span class="num">02</span>${esc(L.nextSteps)}</h1>
    <p class="doc-lede">${esc(L.nextLede)}</p>
    ${table}
  </div>${runFoot(L)}</section>`;
}

function detailPages(S, L) {
  // Group functions into pages (2 functions per A4 page keeps it readable).
  const pages = [];
  for (let i = 0; i < S.functions.length; i += 2) pages.push(S.functions.slice(i, i + 2));
  return pages.map((group, gi) => {
    const blocks = group.map((f) => {
      const rows = f.practices.map((p) => `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td class="num">${num(p.streamA, 2)}</td>
        <td class="num">${num(p.streamB, 2)}</td>
        <td class="num">${num(p.score)}</td>
        <td class="num">${p.target}</td>
        <td>${bar(p.score, 3, FN_COLOR[f.code])}</td>
      </tr>`).join('');
      return `<h2 class="doc-h2"><span class="num">${f.code}</span>${esc(f.name)} · ${num(f.avg)}/3</h2>
      <table class="doc-table">
        <thead><tr><th>${L.practice}</th><th class="num">A</th><th class="num">B</th><th class="num">${L.current}</th><th class="num">${L.target}</th><th>${L.byPractice}</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }).join('');
    const head = gi === 0
      ? `<div class="doc-eyebrow">// 03 · ${esc(L.detail)}</div><h1 class="doc-h1"><span class="num">03</span>${esc(L.detail)}</h1><p class="doc-lede">${esc(L.detailLede)}</p>`
      : `<div class="doc-eyebrow">// 03 · ${esc(L.detail)} (cont.)</div>`;
    return `<section class="sheet wm-on">${runHead(L)}<div class="pad">${head}${blocks}</div>${runFoot(L)}</section>`;
  }).join('');
}

function renderReportHTML(assessment) {
  const state = assessment.state || assessment;
  const meta = Object.assign({ org: '', team: '', date: '', lead: '', contrib: '' }, state.meta || {});
  const lang = state.lang === 'en' ? 'en' : 'pt';
  const L = STR[lang];
  const S = summarize(state);
  const gen = (assessment.created_at || new Date().toISOString()).slice(0, 10);

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>OKAMI · ${esc(L.report)}</title>
<style>${FONTS}</style>
<style>${require('./styles')}</style>
</head><body>
${coverPage(meta, S, L, gen)}
${execPage(S, L)}
${nextStepsPage(S, L)}
${detailPages(S, L)}
</body></html>`;
}

module.exports = { renderReportHTML };
