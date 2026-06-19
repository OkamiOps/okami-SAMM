'use strict';
const fs = require('fs');
const path = require('path');
const { summarize, SAMM } = require('../score');

const FONTS = (() => {
  try { return fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8'); } catch (_) { return ''; }
})();
const LOGO = (() => {
  for (const f of ['okami-logo-icon.png', 'okami-logo-outline.png']) {
    try {
      const b = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', f));
      return 'data:image/png;base64,' + b.toString('base64');
    } catch (_) {}
  }
  return '';
})();

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n, d = 2) => Number(n).toFixed(d);

// code -> SAMM practice (for guidance / activities lookups)
const PRACTICE = {};
for (const f of SAMM.functions) for (const p of f.practices) PRACTICE[p.code] = { ...p, fn: f };

const FN_COLOR = { G: 'var(--doc-orange)', D: 'var(--doc-cyan)', I: 'var(--doc-magenta)', V: 'var(--doc-warning)', O: 'var(--doc-success)' };
const FN_TAG = { G: 't-org', D: 't-cyan', I: 't-mag', V: 't-org', O: 't-ok' };

const STR = {
  pt: {
    classification: 'Confidencial', report: 'Relatório de Maturidade',
    eyebrow: '// owasp samm v2 · relatório de maturidade', subtitle: 'Maturidade do ciclo de desenvolvimento seguro nas 15 práticas do OWASP SAMM.',
    org: 'Organização', team: 'Equipe / Aplicação', date: 'Data', lead: 'Líder', contrib: 'Participantes', overall: 'Maturidade geral', generated: 'Gerado em',
    s1: 'Resumo executivo', s1lede: 'Visão consolidada da maturidade atual, cobertura da avaliação e práticas na meta.',
    coverage: 'Cobertura', onTarget: 'Práticas na meta', avgGap: 'Lacuna média', level3: 'Práticas Nível 3',
    byFunction: 'Maturidade por função de negócio', radarTitle: 'Radar de maturidade', byPractice: 'Maturidade por prática',
    s2: 'Metodologia', s2lede: 'Como a maturidade é medida e o que cada função, stream e nível representam no OWASP SAMM.',
    funcs: 'As cinco funções de negócio', scoring: 'Como o score é calculado', bandsTitle: 'Níveis de maturidade',
    scoringText: 'Cada prática tem dois <strong>streams</strong> (A e B), avaliados nos níveis 1 a 3. O score de uma prática (0–3) é a média dos seus dois streams; a maturidade geral é a média das 15 práticas. A <strong>meta</strong> sugerida de cada prática é o próximo nível ainda não concluído; a <strong>lacuna</strong> é a distância até a meta.',
    s3: 'Maturidade por função', s3lede: 'Score 0–3 por prática (média dos streams A e B). A barra mostra o atual; a coluna Meta, o próximo nível a conquistar.',
    strong: 'Destaque', weak: 'Atenção', fnAvg: 'Média da função',
    s4: 'Roadmap — Próximos passos', s4lede: 'Práticas com maior lacuna até a meta, com as ações recomendadas para alcançar o próximo nível. Comece por aqui.',
    toReach: 'Para alcançar o Nível', recActions: 'Ações recomendadas', done: 'Já atende', pending: 'Pendente',
    noGaps: 'Todas as práticas atingiram a meta definida. Mantenha a melhoria contínua e reavalie periodicamente.',
    current: 'Atual', target: 'Meta', gap: 'Lacuna', practice: 'Prática', function: 'Função', focus: 'Foco',
    streamA: 'A', streamB: 'B', level: 'Nível',
    bands: ['Inicial / Ad-hoc', 'Em desenvolvimento', 'Maduro', 'Otimizado'],
    bandDesc: ['Práticas ausentes ou informais, executadas caso a caso.', 'Práticas iniciais, aplicadas de forma inconsistente.', 'Práticas definidas e adotadas de forma ampla e consistente.', 'Práticas medidas por métricas e melhoradas continuamente.'],
    fnDesc: {
      G: 'Gestão das atividades de segurança em toda a organização — estratégia e métricas, política e conformidade, educação e orientação.',
      D: 'Como objetivos são definidos e o software é projetado — avaliação de ameaças, requisitos de segurança e arquitetura segura.',
      I: 'Construção e implantação de software seguro — build, deploy e gestão de defeitos.',
      V: 'Validação e teste dos artefatos — avaliação de arquitetura, testes orientados a requisitos e testes de segurança.',
      O: 'Operação e manutenção seguras em produção — gestão de incidentes, gestão de ambiente e gestão operacional.',
    },
    howto: 'Maturidade 0–3 por prática · Meta sugerida = próximo nível · Lacuna = distância até a meta',
  },
  en: {
    classification: 'Confidential', report: 'Maturity Report',
    eyebrow: '// owasp samm v2 · maturity report', subtitle: 'Maturity of the secure development lifecycle across the 15 OWASP SAMM practices.',
    org: 'Organization', team: 'Team / Application', date: 'Date', lead: 'Team lead', contrib: 'Contributors', overall: 'Overall maturity', generated: 'Generated on',
    s1: 'Executive summary', s1lede: 'Consolidated view of current maturity, assessment coverage and practices on target.',
    coverage: 'Coverage', onTarget: 'Practices on target', avgGap: 'Average gap', level3: 'Level 3 practices',
    byFunction: 'Maturity by business function', radarTitle: 'Maturity radar', byPractice: 'Maturity by practice',
    s2: 'Methodology', s2lede: 'How maturity is measured and what each function, stream and level represents in OWASP SAMM.',
    funcs: 'The five business functions', scoring: 'How the score is computed', bandsTitle: 'Maturity levels',
    scoringText: 'Each practice has two <strong>streams</strong> (A and B), scored across levels 1 to 3. A practice score (0–3) is the average of its two streams; overall maturity is the average of the 15 practices. The suggested <strong>target</strong> for each practice is the next unachieved level; the <strong>gap</strong> is the distance to that target.',
    s3: 'Maturity by function', s3lede: 'Score 0–3 per practice (average of streams A and B). The bar shows current; the Target column shows the next level to reach.',
    strong: 'Strength', weak: 'Attention', fnAvg: 'Function average',
    s4: 'Roadmap — Next steps', s4lede: 'Practices with the largest gap to target, with recommended actions to reach the next level. Start here.',
    toReach: 'To reach Level', recActions: 'Recommended actions', done: 'Met', pending: 'Pending',
    noGaps: 'All practices reached their target. Keep improving and re-assess periodically.',
    current: 'Current', target: 'Target', gap: 'Gap', practice: 'Practice', function: 'Function', focus: 'Focus',
    streamA: 'A', streamB: 'B', level: 'Level',
    bands: ['Initial / Ad-hoc', 'Developing', 'Mature', 'Optimized'],
    bandDesc: ['Practices absent or informal, performed ad hoc.', 'Initial practices, applied inconsistently.', 'Practices defined and adopted broadly and consistently.', 'Practices measured by metrics and continuously improved.'],
    fnDesc: {
      G: 'Managing security activities across the organization — strategy & metrics, policy & compliance, education & guidance.',
      D: 'How goals are set and software is designed — threat assessment, security requirements and secure architecture.',
      I: 'Building and deploying secure software — secure build, secure deployment and defect management.',
      V: 'Validating and testing artifacts — architecture assessment, requirements-driven testing and security testing.',
      O: 'Operating and maintaining securely in production — incident, environment and operational management.',
    },
    howto: 'Maturity 0–3 per practice · Suggested target = next level · Gap = distance to target',
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
function sheet(L, headHtml, bodyHtml) {
  return `<section class="sheet wm-on">${runHead(L)}<div class="pad">${headHtml}${bodyHtml}</div>${runFoot(L)}</section>`;
}

// ---- radar SVG (15 practices) -------------------------------------------
function radarSVG(functions) {
  const pts = [];
  functions.forEach((f) => f.practices.forEach((p) => pts.push({ ...p, fnCode: f.code })));
  const N = pts.length, cx = 260, cy = 250, R = 185;
  const ang = (i) => (-Math.PI / 2) + (i / N) * Math.PI * 2;
  const pos = (i, r) => [cx + Math.cos(ang(i)) * r * (R / 3), cy + Math.sin(ang(i)) * r * (R / 3)];
  let g = '';
  for (let lv = 1; lv <= 3; lv++) g += `<polygon points="${pts.map((_, i) => pos(i, lv).join(',')).join(' ')}" fill="none" stroke="var(--doc-line)" stroke-width="1"/>`;
  for (let i = 0; i < N; i++) { const [x, y] = pos(i, 3); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--doc-line-soft)" stroke-width="1"/>`; }
  g += `<polygon points="${pts.map((p, i) => pos(i, p.target).join(',')).join(' ')}" fill="none" stroke="var(--doc-cyan)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  g += `<polygon points="${pts.map((p, i) => pos(i, p.score).join(',')).join(' ')}" fill="color-mix(in oklch, var(--doc-magenta) 24%, transparent)" stroke="var(--doc-magenta)" stroke-width="2.2"/>`;
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
  const title = meta.org || meta.team || L.subtitle;
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
      <div class="org">OWASP SAMM v2 · 5 functions · 15 practices · 90 questions</div>
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
    <div style="display:grid;grid-template-columns:150px 1fr 46px;align-items:center;gap:12px;margin:8px 0;">
      <span class="bl"><span style="display:inline-block;width:8px;height:8px;background:${FN_COLOR[f.code]};margin-right:8px;border-radius:1px;"></span>${esc(f.name)}</span>
      ${bar(f.avg, 3, FN_COLOR[f.code])}
      <span class="bv" style="font-family:var(--ok-mono);font-size:11px;">${num(f.avg)}</span>
    </div>`).join('');
  const head = `<div class="doc-eyebrow">// 01 · ${esc(L.s1)}</div><h1 class="doc-h1"><span class="num">01</span>${esc(L.s1)}</h1><p class="doc-lede">${esc(L.s1lede)}</p>`;
  const body = `${metricRow}
    <h2 class="doc-h2"><span class="num">1.1</span>${esc(L.byFunction)}</h2>${fnBars}
    <h2 class="doc-h2"><span class="num">1.2</span>${esc(L.radarTitle)}</h2>${radarSVG(S.functions)}
    <div class="callout"><span class="co-label">${esc(L.howto)}</span></div>`;
  return sheet(L, head, body);
}

function methodologyPage(S, L) {
  const funcRows = SAMM.functions.map((f, i) => {
    const name = L === STR.pt ? f.pt : f.name;
    return `<tr><td class="num" style="color:${FN_COLOR[f.code]};font-weight:600;">${f.code}</td><td><strong>${esc(name)}</strong></td><td>${esc(L.fnDesc[f.code])}</td></tr>`;
  }).join('');
  const bands = L.bands.map((b, i) => `
    <div style="display:grid;grid-template-columns:54px 1fr;gap:12px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--doc-line-soft);">
      <span style="font-family:var(--ok-mono);font-size:11px;color:var(--doc-struct);">${L.level} ${i}</span>
      <span style="font-size:12px;color:var(--doc-ink-soft);"><strong style="color:var(--doc-ink);">${esc(b)}</strong> — ${esc(L.bandDesc[i])}</span>
    </div>`).join('');
  const head = `<div class="doc-eyebrow">// 02 · ${esc(L.s2)}</div><h1 class="doc-h1"><span class="num">02</span>${esc(L.s2)}</h1><p class="doc-lede">${esc(L.s2lede)}</p>`;
  const body = `
    <h2 class="doc-h2"><span class="num">2.1</span>${esc(L.funcs)}</h2>
    <table class="doc-table"><tbody>${funcRows}</tbody></table>
    <h2 class="doc-h2"><span class="num">2.2</span>${esc(L.scoring)}</h2>
    <p>${L.scoringText}</p>
    <h2 class="doc-h2"><span class="num">2.3</span>${esc(L.bandsTitle)}</h2>
    ${bands}`;
  return sheet(L, head, body);
}

function fnNarrative(f, L) {
  const sorted = [...f.practices].sort((a, b) => b.score - a.score);
  const top = sorted[0], low = sorted[sorted.length - 1];
  return `<div style="display:flex;gap:18px;margin:2px 0 10px;font-size:11px;font-family:var(--ok-mono);">
    <span style="color:var(--doc-success);">▲ ${esc(L.strong)}: ${esc(top.name)} (${num(top.score)})</span>
    <span style="color:var(--doc-danger);">▼ ${esc(L.weak)}: ${esc(low.name)} (${num(low.score)})</span>
  </div>`;
}

function functionPages(S, L) {
  // one A4 page per two functions
  const groups = [];
  for (let i = 0; i < S.functions.length; i += 2) groups.push(S.functions.slice(i, i + 2));
  return groups.map((group, gi) => {
    const blocks = group.map((f) => {
      const rows = f.practices.map((p) => `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td class="num">${num(p.streamA, 2)}</td><td class="num">${num(p.streamB, 2)}</td>
        <td class="num">${num(p.score)}</td><td class="num">${p.target}</td>
        <td style="width:120px;">${bar(p.score, 3, FN_COLOR[f.code])}</td>
      </tr>`).join('');
      return `<h2 class="doc-h2"><span class="num">${f.code}</span>${esc(f.name)} · <span style="color:${FN_COLOR[f.code]};">${num(f.avg)}/3</span></h2>
        ${fnNarrative(f, L)}
        <table class="doc-table">
          <thead><tr><th>${L.practice}</th><th class="num">${L.streamA}</th><th class="num">${L.streamB}</th><th class="num">${L.current}</th><th class="num">${L.target}</th><th>${L.byPractice}</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
    }).join('');
    const head = gi === 0
      ? `<div class="doc-eyebrow">// 03 · ${esc(L.s3)}</div><h1 class="doc-h1"><span class="num">03</span>${esc(L.s3)}</h1><p class="doc-lede">${esc(L.s3lede)}</p>`
      : `<div class="doc-eyebrow">// 03 · ${esc(L.s3)} (cont.)</div>`;
    return sheet(L, head, blocks);
  }).join('');
}

// recommended actions = the focus-level questions (streams A/B) + their guidance criteria
function practiceActions(code, focusLevel, answers, isPT) {
  const p = PRACTICE[code]; if (!p) return [];
  return p.questions.filter((q) => q.level === focusLevel).sort((a, b) => a.stream.localeCompare(b.stream)).map((q) => {
    const a = answers[q.id];
    const guide = (isPT ? (q.guidancePt || q.guidance) : q.guidance) || [];
    return {
      stream: q.stream,
      streamLabel: (p.activities[q.stream] ? (isPT ? p.activities[q.stream].pt : p.activities[q.stream].en) : q.stream),
      text: isPT ? q.pt : q.en,
      guidance: guide.slice(0, 2),
      done: a != null && a >= 2,
    };
  });
}

function roadmapBlock(p, L, isPT) {
  const focus = p.gap > 0 ? p.focus : 0;
  const actions = focus ? practiceActions(p.code, focus, p._answers, isPT) : [];
  const acts = actions.map((a) => `
    <div style="margin:8px 0;">
      <div style="display:flex;gap:8px;align-items:baseline;">
        <span style="font-family:var(--ok-mono);font-size:9px;color:${a.done ? 'var(--doc-success)' : 'var(--doc-magenta)'};border:1px solid currentColor;padding:1px 6px;flex:none;">${a.done ? '✓ ' + L.done : L.pending}</span>
        <span style="font-size:12px;color:var(--doc-ink);font-weight:500;">${esc(a.streamLabel)}</span>
      </div>
      <div style="font-size:12px;color:var(--doc-ink-soft);line-height:1.5;margin:3px 0 0 0;">${esc(a.text)}</div>
      ${a.guidance.length ? `<ul style="margin:4px 0 0;padding:0;list-style:none;">${a.guidance.map((gg) => `<li style="position:relative;padding:2px 0 2px 16px;font-size:11px;color:var(--doc-ink-mute);line-height:1.45;"><span style="position:absolute;left:0;color:var(--doc-cyan);">→</span>${esc(gg)}</li>`).join('')}</ul>` : ''}
    </div>`).join('');
  return `<div style="border:1px solid var(--doc-line);border-left:3px solid ${FN_COLOR[p.fnCode]};padding:12px 14px;margin:12px 0;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;">
      <div><span class="tag ${FN_TAG[p.fnCode]}" style="margin-right:8px;">${esc(p.fnName)}</span><strong style="font-family:var(--ok-display);font-size:15px;color:var(--doc-ink);">${esc(p.name)}</strong></div>
      <div style="font-family:var(--ok-mono);font-size:10px;color:var(--doc-ink-mute);white-space:nowrap;">${L.current} ${num(p.score)} · ${L.target} ${p.target} · ${L.gap} ${num(p.gap)}</div>
    </div>
    ${focus ? `<div style="font-family:var(--ok-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${FN_COLOR[p.fnCode]};margin:10px 0 2px;">${L.toReach} ${focus} · ${L.recActions}</div>${acts}` : ''}
  </div>`;
}

function roadmapPages(S, L, isPT) {
  const head0 = `<div class="doc-eyebrow">// 04 · ${esc(L.s4)}</div><h1 class="doc-h1"><span class="num">04</span>${esc(L.s4)}</h1><p class="doc-lede">${esc(L.s4lede)}</p>`;
  if (!S.priority.length) {
    return sheet(L, head0, `<div class="callout hero"><span class="co-label">${esc(L.s4)}</span><p>${esc(L.noGaps)}</p></div>`);
  }
  // attach answers for action lookup
  S.priority.forEach((p) => { p._answers = S._answers; });
  const perPage = 2;
  const pages = [];
  for (let i = 0; i < S.priority.length; i += perPage) pages.push(S.priority.slice(i, i + perPage));
  return pages.map((grp, gi) => {
    const head = gi === 0 ? head0 : `<div class="doc-eyebrow">// 04 · ${esc(L.s4)} (cont.)</div>`;
    return sheet(L, head, grp.map((p) => roadmapBlock(p, L, isPT)).join(''));
  }).join('');
}

function renderReportHTML(assessment) {
  const state = assessment.state || assessment;
  const meta = Object.assign({ org: '', team: '', date: '', lead: '', contrib: '' }, state.meta || {});
  const isPT = state.lang !== 'en';
  const L = isPT ? STR.pt : STR.en;
  const S = summarize(state);
  S._answers = state.answers || {};
  const gen = (assessment.created_at || new Date().toISOString()).slice(0, 10);

  return `<!doctype html><html lang="${isPT ? 'pt' : 'en'}"><head><meta charset="utf-8">
<title>OKAMI · ${esc(L.report)}</title>
<style>${FONTS}</style>
<style>${require('./styles')}</style>
</head><body>
${coverPage(meta, S, L, gen)}
${execPage(S, L)}
${methodologyPage(S, L)}
${functionPages(S, L)}
${roadmapPages(S, L, isPT)}
</body></html>`;
}

module.exports = { renderReportHTML };
