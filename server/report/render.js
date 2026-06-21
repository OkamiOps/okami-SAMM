'use strict';
const fs = require('fs');
const path = require('path');
const { summarize, SAMM, practiceActions } = require('../score');

const FONTS = (() => { try { return fs.readFileSync(path.join(__dirname, 'fonts.css'), 'utf8'); } catch (_) { return ''; } })();
const asset = (...names) => {
  for (const f of names) {
    try { return 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', f)).toString('base64'); } catch (_) {}
  }
  return '';
};
const LOGO = asset('okami-logo-icon.png');                                 // icon (fallback)
const LOGO_DARK = asset('okami-maturity-on-dark.png');                     // full wordmark, white text → dark bg
const LOGO_LIGHT = asset('okami-maturity-on-light.png');                   // full wordmark, dark text → light bg

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n, d = 2) => Number(n).toFixed(d);

const FN_COLOR = { G: 'var(--doc-orange)', D: 'var(--doc-cyan)', I: 'var(--doc-magenta)', V: 'var(--doc-warning)', O: 'var(--doc-success)' };
const FN_TAG = { G: 't-org', D: 't-cyan', I: 't-mag', V: 't-org', O: 't-ok' };

const STR = {
  pt: {
    classification: 'Confidencial', report: 'Relatório de Maturidade', contents: 'Sumário',
    eyebrow: '// owasp samm v2 · relatório de maturidade', subtitle: 'Maturidade do ciclo de desenvolvimento seguro nas 15 práticas do OWASP SAMM.',
    org: 'Organização', team: 'Equipe / Aplicação', date: 'Data', lead: 'Líder', contrib: 'Participantes', overall: 'Maturidade geral', generated: 'Gerado em',
    s1: 'Resumo executivo', s1lede: 'Visão consolidada da maturidade atual, cobertura da avaliação e práticas na meta.',
    coverage: 'Cobertura', onTarget: 'Práticas na meta', avgGap: 'Lacuna média',
    byFunction: 'Maturidade por função de negócio', radarTitle: 'Radar de maturidade', byPractice: 'Maturidade por prática',
    s2: 'Metodologia', s2lede: 'Como a maturidade é medida e o que cada função, stream e nível representam no OWASP SAMM.',
    funcs: 'As cinco funções de negócio', scoring: 'Como o score é calculado', bandsTitle: 'Níveis de maturidade',
    scoringText: 'Cada prática tem dois <strong>streams</strong> (A e B), avaliados nos níveis 1 a 3. O score de uma prática (0–3) é a média dos seus dois streams; a maturidade geral é a média das 15 práticas. A <strong>meta</strong> sugerida de cada prática é o próximo nível ainda não concluído; a <strong>lacuna</strong> é a distância até a meta.',
    s3: 'Maturidade por função', s3lede: 'Score 0–3 por prática (média dos streams A e B). A barra mostra o atual; a coluna Meta, o próximo nível a conquistar.',
    strong: 'Destaque', weak: 'Atenção',
    s4: 'Roadmap — Próximos passos', s4lede: 'Práticas com maior lacuna até a meta, com as ações recomendadas para alcançar o próximo nível. Comece por aqui.',
    toReach: 'Para alcançar o Nível', recActions: 'Ações recomendadas', done: 'Já atende', pending: 'Pendente',
    noGaps: 'Todas as práticas atingiram a meta definida. Mantenha a melhoria contínua e reavalie periodicamente.',
    sEvo: 'Evolução da maturidade', sEvoLede: 'Maturidade geral ao longo dos snapshots salvos.', snapshot: 'Snapshot', delta: 'Variação',
    sConc: 'Conclusão e recomendações', concLede: 'Síntese do diagnóstico e o caminho recomendado.',
    concOverall: (org, sc, band) => `A maturidade geral de <strong>${esc(org)}</strong> está em <strong>${sc}/3</strong> (${esc(band)}).`,
    bandInterp: ['As práticas de segurança ainda são informais ou ausentes — há grande espaço para ganhos rápidos estabelecendo o básico.', 'Existem práticas iniciais, mas aplicadas de forma inconsistente — o foco agora é padronizar e ampliar a adoção.', 'As práticas estão bem estabelecidas — o foco passa a ser medir resultados e tratar as lacunas remanescentes.', 'As práticas estão maduras e medidas — mantenha a melhoria contínua e a consistência entre equipes.'],
    concPri: 'Prioridades imediatas', concPriLede: 'As práticas com maior lacuna até a meta — detalhadas no Roadmap (seção 04):',
    concRec: 'Recomendação', concRecText: 'Concentre os esforços nas ações do Roadmap, priorizando ganhos rápidos, e reavalie a maturidade a cada 6 meses para acompanhar a evolução. A função com menor maturidade hoje é <strong>{fn}</strong> ({sc}/3) — um bom ponto de partida.',
    sNotes: 'Apêndice — Notas da avaliação', notesLede: 'Observações registradas durante a avaliação, por prática.',
    sAI: 'Apêndice — Recomendações assistidas por IA', sAILede: 'Planos de ação personalizados gerados por IA por prática, a partir das respostas da avaliação e dos critérios do OWASP SAMM. Complemento ao Roadmap.', aiNote: 'Gerado por IA — revise antes de usar.',
    current: 'Atual', target: 'Meta', gap: 'Lacuna', practice: 'Prática', streamA: 'A', streamB: 'B', level: 'Nível', page: 'Pág.',
    bands: ['Inicial / Ad-hoc', 'Em desenvolvimento', 'Maduro', 'Otimizado'],
    bandDesc: ['Práticas ausentes ou informais, executadas caso a caso.', 'Práticas iniciais, aplicadas de forma inconsistente.', 'Práticas definidas e adotadas de forma ampla e consistente.', 'Práticas medidas por métricas e melhoradas continuamente.'],
    fnDesc: { G: 'Gestão das atividades de segurança em toda a organização — estratégia e métricas, política e conformidade, educação e orientação.', D: 'Como objetivos são definidos e o software é projetado — avaliação de ameaças, requisitos de segurança e arquitetura segura.', I: 'Construção e implantação de software seguro — build, deploy e gestão de defeitos.', V: 'Validação e teste dos artefatos — avaliação de arquitetura, testes orientados a requisitos e testes de segurança.', O: 'Operação e manutenção seguras em produção — gestão de incidentes, gestão de ambiente e gestão operacional.' },
    howto: 'Maturidade 0–3 por prática · Meta sugerida = próximo nível · Lacuna = distância até a meta',
  },
  en: {
    classification: 'Confidential', report: 'Maturity Report', contents: 'Contents',
    eyebrow: '// owasp samm v2 · maturity report', subtitle: 'Maturity of the secure development lifecycle across the 15 OWASP SAMM practices.',
    org: 'Organization', team: 'Team / Application', date: 'Date', lead: 'Team lead', contrib: 'Contributors', overall: 'Overall maturity', generated: 'Generated on',
    s1: 'Executive summary', s1lede: 'Consolidated view of current maturity, assessment coverage and practices on target.',
    coverage: 'Coverage', onTarget: 'Practices on target', avgGap: 'Average gap',
    byFunction: 'Maturity by business function', radarTitle: 'Maturity radar', byPractice: 'Maturity by practice',
    s2: 'Methodology', s2lede: 'How maturity is measured and what each function, stream and level represents in OWASP SAMM.',
    funcs: 'The five business functions', scoring: 'How the score is computed', bandsTitle: 'Maturity levels',
    scoringText: 'Each practice has two <strong>streams</strong> (A and B), scored across levels 1 to 3. A practice score (0–3) is the average of its two streams; overall maturity is the average of the 15 practices. The suggested <strong>target</strong> for each practice is the next unachieved level; the <strong>gap</strong> is the distance to that target.',
    s3: 'Maturity by function', s3lede: 'Score 0–3 per practice (average of streams A and B). The bar shows current; the Target column shows the next level to reach.',
    strong: 'Strength', weak: 'Attention',
    s4: 'Roadmap — Next steps', s4lede: 'Practices with the largest gap to target, with recommended actions to reach the next level. Start here.',
    toReach: 'To reach Level', recActions: 'Recommended actions', done: 'Met', pending: 'Pending',
    noGaps: 'All practices reached their target. Keep improving and re-assess periodically.',
    sEvo: 'Maturity evolution', sEvoLede: 'Overall maturity across saved snapshots.', snapshot: 'Snapshot', delta: 'Change',
    sConc: 'Conclusion and recommendations', concLede: 'Diagnosis summary and the recommended path forward.',
    concOverall: (org, sc, band) => `The overall maturity of <strong>${esc(org)}</strong> is <strong>${sc}/3</strong> (${esc(band)}).`,
    bandInterp: ['Security practices are still informal or absent — there is large room for quick wins by establishing the basics.', 'Initial practices exist but are applied inconsistently — the focus now is to standardize and broaden adoption.', 'Practices are well established — the focus shifts to measuring outcomes and closing remaining gaps.', 'Practices are mature and measured — keep improving continuously and stay consistent across teams.'],
    concPri: 'Immediate priorities', concPriLede: 'The practices with the largest gap to target — detailed in the Roadmap (section 04):',
    concRec: 'Recommendation', concRecText: 'Focus on the Roadmap actions, prioritizing quick wins, and re-assess maturity every 6 months to track progress. The lowest-maturity function today is <strong>{fn}</strong> ({sc}/3) — a good starting point.',
    sNotes: 'Appendix — Assessment notes', notesLede: 'Observations recorded during the assessment, by practice.',
    sAI: 'Appendix — AI-assisted recommendations', sAILede: 'AI-generated tailored action plans per practice, from the assessment answers and the OWASP SAMM criteria. A complement to the Roadmap.', aiNote: 'AI-generated — review before acting.',
    current: 'Current', target: 'Target', gap: 'Gap', practice: 'Practice', streamA: 'A', streamB: 'B', level: 'Level', page: 'Pg.',
    bands: ['Initial / Ad-hoc', 'Developing', 'Mature', 'Optimized'],
    bandDesc: ['Practices absent or informal, performed ad hoc.', 'Initial practices, applied inconsistently.', 'Practices defined and adopted broadly and consistently.', 'Practices measured by metrics and continuously improved.'],
    fnDesc: { G: 'Managing security activities across the organization — strategy & metrics, policy & compliance, education & guidance.', D: 'How goals are set and software is designed — threat assessment, security requirements and secure architecture.', I: 'Building and deploying secure software — secure build, secure deployment and defect management.', V: 'Validating and testing artifacts — architecture assessment, requirements-driven testing and security testing.', O: 'Operating and maintaining securely in production — incident, environment and operational management.' },
    howto: 'Maturity 0–3 per practice · Suggested target = next level · Gap = distance to target',
  },
};

function bar(value, max, color) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<span class="bt"><span class="bf" style="width:${pct.toFixed(1)}%;background:${color};"></span></span>`;
}
function runHead(L) {
  const brand = LOGO_LIGHT
    ? `<img src="${LOGO_LIGHT}" alt="OKAMI Maturity" style="height:15px;width:auto;display:block;">`
    : `<div class="brand"><span class="chip">${LOGO ? `<img src="${LOGO}" alt="">` : ''}</span><b>OKAMI</b></div>`;
  return `<div class="run-head">${brand}<div class="doc-ref">${esc(L.report)} · OWASP SAMM v2</div></div><div class="head-rule"></div>`;
}
function runFoot(L) { return `<div class="run-foot"><span class="conf">${L.classification}</span><span class="page-no"></span></div>`; }
function sheet(L, headHtml, bodyHtml) { return `<section class="sheet wm-on">${runHead(L)}<div class="pad">${headHtml}${bodyHtml}</div>${runFoot(L)}</section>`; }
function secHead(num, title, lede) {
  return `<div class="doc-eyebrow">// ${num} · ${esc(title)}</div><h1 class="doc-h1"><span class="num">${num}</span>${esc(title)}</h1>${lede ? `<p class="doc-lede">${esc(lede)}</p>` : ''}`;
}

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
    <div class="cover-top">${LOGO_DARK ? `<img src="${LOGO_DARK}" alt="OKAMI Maturity" style="height:48px;width:auto;display:block;">` : `<div class="cover-logo">${LOGO ? `<img src="${LOGO}" alt="OKAMI">` : ''}<div class="wm">OKAMI<small>SECURITY MATURITY</small></div></div>`}<div class="cover-class">${L.classification}</div></div>
    <div class="cover-mid"><div class="cover-eyebrow">${esc(L.eyebrow)}</div>
      <h1>${esc(title)} <em>·</em> ${esc(L.report)}</h1><div class="cover-sub">${esc(L.subtitle)}</div>
      <div class="cover-meta">${row(L.org, meta.org)}${row(L.team, meta.team)}${row(L.date, meta.date)}${row(L.lead, meta.lead)}${row(L.contrib, meta.contrib)}
        <div class="row"><span class="k">${L.overall}</span><span class="v cyan">${num(S.overall)} / 3 · ${esc(L.bands[S.band])}</span></div></div></div>
    <div class="cover-foot"><div class="org"><b>OKAMI</b> · Application Security<br>${L.generated} ${esc(gen)}</div><div class="org">OWASP SAMM v2 · 5 functions · 15 practices · 90 questions</div></div>
  </div></section>`;
}

function tocPage(L, entries) {
  const rows = entries.map((e) => `<div class="toc-item">
    <span class="tn">${e.num}</span>
    <span class="tt">${esc(e.title)}${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span>
    <span class="tp">${e.page}</span></div>`).join('');
  return `<section class="sheet wm-on">${runHead(L)}<div class="pad">
    <div class="doc-eyebrow">// ${esc(L.contents)}</div><h1 class="doc-h1">${esc(L.contents)}</h1>
    <div class="toc">${rows}</div></div>${runFoot(L)}</section>`;
}

function execPage(numS, S, L) {
  const metricRow = `<div class="metric-row">
    <div class="metric"><div class="mv org">${num(S.overall)}</div><div class="ml">${L.overall} · ${esc(L.bands[S.band])}</div></div>
    <div class="metric"><div class="mv cyan">${S.coverage}%</div><div class="ml">${L.coverage} · ${S.answered}/${S.totalQuestions}</div></div>
    <div class="metric"><div class="mv mag">${S.onTarget}/15</div><div class="ml">${L.onTarget} · ${L.avgGap} ${num(S.avgGap)}</div></div></div>`;
  const fnBars = S.functions.map((f) => `<div style="display:grid;grid-template-columns:150px 1fr 46px;align-items:center;gap:12px;margin:8px 0;">
    <span class="bl"><span style="display:inline-block;width:8px;height:8px;background:${FN_COLOR[f.code]};margin-right:8px;border-radius:1px;"></span>${esc(f.name)}</span>
    ${bar(f.avg, 3, FN_COLOR[f.code])}<span class="bv" style="font-family:var(--ok-mono);font-size:11px;">${num(f.avg)}</span></div>`).join('');
  return sheet(L, secHead(numS, L.s1, L.s1lede), `${metricRow}
    <h2 class="doc-h2"><span class="num">${numS}.1</span>${esc(L.byFunction)}</h2>${fnBars}
    <h2 class="doc-h2"><span class="num">${numS}.2</span>${esc(L.radarTitle)}</h2>${radarSVG(S.functions)}
    <div class="callout"><span class="co-label">${esc(L.howto)}</span></div>`);
}

function methodologyPage(numS, S, L) {
  const funcRows = SAMM.functions.map((f) => `<tr><td class="num" style="color:${FN_COLOR[f.code]};font-weight:600;">${f.code}</td><td><strong>${esc(L === STR.pt ? f.pt : f.name)}</strong></td><td>${esc(L.fnDesc[f.code])}</td></tr>`).join('');
  const bands = L.bands.map((b, i) => `<div style="display:grid;grid-template-columns:54px 1fr;gap:12px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--doc-line-soft);">
    <span style="font-family:var(--ok-mono);font-size:11px;color:var(--doc-struct);">${L.level} ${i}</span>
    <span style="font-size:12px;color:var(--doc-ink-soft);"><strong style="color:var(--doc-ink);">${esc(b)}</strong> — ${esc(L.bandDesc[i])}</span></div>`).join('');
  return sheet(L, secHead(numS, L.s2, L.s2lede), `
    <h2 class="doc-h2"><span class="num">${numS}.1</span>${esc(L.funcs)}</h2><table class="doc-table"><tbody>${funcRows}</tbody></table>
    <h2 class="doc-h2"><span class="num">${numS}.2</span>${esc(L.scoring)}</h2><p>${L.scoringText}</p>
    <h2 class="doc-h2"><span class="num">${numS}.3</span>${esc(L.bandsTitle)}</h2>${bands}`);
}

function fnNarrative(f, L) {
  const sorted = [...f.practices].sort((a, b) => b.score - a.score);
  const top = sorted[0], low = sorted[sorted.length - 1];
  return `<div style="display:flex;gap:18px;margin:2px 0 10px;font-size:11px;font-family:var(--ok-mono);">
    <span style="color:var(--doc-success);">▲ ${esc(L.strong)}: ${esc(top.name)} (${num(top.score)})</span>
    <span style="color:var(--doc-danger);">▼ ${esc(L.weak)}: ${esc(low.name)} (${num(low.score)})</span></div>`;
}

function functionPages(numS, S, L) {
  const groups = [];
  for (let i = 0; i < S.functions.length; i += 2) groups.push(S.functions.slice(i, i + 2));
  return groups.map((group, gi) => {
    const blocks = group.map((f) => {
      const rows = f.practices.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td>
        <td class="num">${num(p.streamA, 2)}</td><td class="num">${num(p.streamB, 2)}</td>
        <td class="num">${num(p.score)}</td><td class="num">${p.target}</td><td style="width:120px;">${bar(p.score, 3, FN_COLOR[f.code])}</td></tr>`).join('');
      return `<h2 class="doc-h2"><span class="num">${f.code}</span>${esc(f.name)} · <span style="color:${FN_COLOR[f.code]};">${num(f.avg)}/3</span></h2>${fnNarrative(f, L)}
        <table class="doc-table"><thead><tr><th>${L.practice}</th><th class="num">${L.streamA}</th><th class="num">${L.streamB}</th><th class="num">${L.current}</th><th class="num">${L.target}</th><th>${L.byPractice}</th></tr></thead><tbody>${rows}</tbody></table>`;
    }).join('');
    const head = gi === 0 ? secHead(numS, L.s3, L.s3lede) : `<div class="doc-eyebrow">// ${numS} · ${esc(L.s3)} (cont.)</div>`;
    return sheet(L, head, blocks);
  });
}

function roadmapBlock(p, L, isPT, answers) {
  const focus = p.gap > 0 ? p.focus : 0;
  const actions = focus ? practiceActions(p.code, focus, answers, isPT).map((a) => ({ ...a, guidance: a.guidance.slice(0, 2) })) : [];
  const acts = actions.map((a) => `<div style="margin:8px 0;">
    <div style="display:flex;gap:8px;align-items:baseline;"><span style="font-family:var(--ok-mono);font-size:9px;color:${a.done ? 'var(--doc-success)' : 'var(--doc-magenta)'};border:1px solid currentColor;padding:1px 6px;flex:none;">${a.done ? '✓ ' + L.done : L.pending}</span><span style="font-size:12px;color:var(--doc-ink);font-weight:500;">${esc(a.streamLabel)}</span></div>
    <div style="font-size:12px;color:var(--doc-ink-soft);line-height:1.5;margin:3px 0 0 0;">${esc(a.question)}</div>
    ${a.guidance.length ? `<ul style="margin:4px 0 0;padding:0;list-style:none;">${a.guidance.map((gg) => `<li style="position:relative;padding:2px 0 2px 16px;font-size:11px;color:var(--doc-ink-mute);line-height:1.45;"><span style="position:absolute;left:0;color:var(--doc-cyan);">→</span>${esc(gg)}</li>`).join('')}</ul>` : ''}</div>`).join('');
  return `<div style="border:1px solid var(--doc-line);border-left:3px solid ${FN_COLOR[p.fnCode]};padding:12px 14px;margin:12px 0;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;"><div><span class="tag ${FN_TAG[p.fnCode]}" style="margin-right:8px;">${esc(p.fnName)}</span><strong style="font-family:var(--ok-display);font-size:15px;color:var(--doc-ink);">${esc(p.name)}</strong></div>
      <div style="font-family:var(--ok-mono);font-size:10px;color:var(--doc-ink-mute);white-space:nowrap;">${L.current} ${num(p.score)} · ${L.target} ${p.target} · ${L.gap} ${num(p.gap)}</div></div>
    ${focus ? `<div style="font-family:var(--ok-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${FN_COLOR[p.fnCode]};margin:10px 0 2px;">${L.toReach} ${focus} · ${L.recActions}</div>${acts}` : ''}</div>`;
}

function roadmapPages(numS, S, L, isPT, answers) {
  if (!S.priority.length) return [sheet(L, secHead(numS, L.s4, L.s4lede), `<div class="callout hero"><span class="co-label">${esc(L.s4)}</span><p>${esc(L.noGaps)}</p></div>`)];
  const pages = [];
  for (let i = 0; i < S.priority.length; i += 2) pages.push(S.priority.slice(i, i + 2));
  return pages.map((grp, gi) => {
    const head = gi === 0 ? secHead(numS, L.s4, L.s4lede) : `<div class="doc-eyebrow">// ${numS} · ${esc(L.s4)} (cont.)</div>`;
    return sheet(L, head, grp.map((p) => roadmapBlock(p, L, isPT, answers)).join(''));
  });
}

function evolutionPage(numS, snaps, S, L) {
  // snaps: [{name,date,score}] oldest→newest ; plus the current (unsaved) assessment
  const series = snaps.map((s) => ({ label: s.date || s.name || '', score: Number(s.score) }));
  series.push({ label: L.current, score: S.overall });
  const W = 620, H = 240, padL = 36, padB = 28, padT = 12, padR = 12;
  const n = series.length;
  const x = (i) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v) => padT + (1 - v / 3) * (H - padT - padB);
  let g = '';
  for (let lv = 0; lv <= 3; lv++) { const yy = y(lv); g += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--doc-line-soft)" stroke-width="1"/><text x="${padL - 6}" y="${yy + 3}" text-anchor="end" font-family="var(--ok-mono)" font-size="9" fill="var(--doc-ink-mute)">${lv}</text>`; }
  const line = series.map((s, i) => `${x(i)},${y(s.score)}`).join(' ');
  g += `<polyline points="${line}" fill="none" stroke="var(--doc-magenta)" stroke-width="2.2"/>`;
  series.forEach((s, i) => {
    g += `<circle cx="${x(i)}" cy="${y(s.score)}" r="3.2" fill="var(--doc-magenta)"/>`;
    g += `<text x="${x(i)}" y="${y(s.score) - 8}" text-anchor="middle" font-family="var(--ok-mono)" font-size="9" fill="var(--doc-ink)">${num(s.score)}</text>`;
    g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-family="var(--ok-mono)" font-size="8.5" fill="var(--doc-ink-mute)">${esc(String(s.label).slice(0, 12))}</text>`;
  });
  const first = series[0].score, last = series[series.length - 1].score, d = last - first;
  const deltaTxt = `${d >= 0 ? '+' : ''}${num(d)}`;
  const rows = series.map((s, i) => `<tr><td><strong>${esc(s.label)}</strong></td><td class="num">${num(s.score)}</td><td class="num" style="color:${i === 0 ? 'var(--doc-ink-mute)' : (s.score - series[i - 1].score >= 0 ? 'var(--doc-success)' : 'var(--doc-danger)')};">${i === 0 ? '—' : (s.score - series[i - 1].score >= 0 ? '+' : '') + num(s.score - series[i - 1].score)}</td></tr>`).join('');
  const body = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:560px;display:block;margin:6px 0 14px;">${g}</svg>
    <div class="callout${d >= 0 ? ' hero' : ''}"><span class="co-label">${esc(L.delta)}</span><p>${esc(L.overall)}: ${num(first)} → ${num(last)} (${deltaTxt})</p></div>
    <table class="doc-table"><thead><tr><th>${L.snapshot}</th><th class="num">${L.overall}</th><th class="num">${L.delta}</th></tr></thead><tbody>${rows}</tbody></table>`;
  return sheet(L, secHead(numS, L.sEvo, L.sEvoLede), body);
}

function conclusionPage(numS, S, L, meta, isPT) {
  const org = meta.org || meta.team || (isPT ? 'a organização' : 'the organization');
  const lowFn = [...S.functions].sort((a, b) => a.avg - b.avg)[0];
  const pri = S.priority.slice(0, 3).map((p) => `<li><strong>${esc(p.name)}</strong> <span style="color:var(--doc-ink-mute);">(${esc(p.fnName)} · ${L.current} ${num(p.score)} → ${L.target} ${p.target})</span></li>`).join('');
  const rec = L.concRecText.replace('{fn}', esc(lowFn.name)).replace('{sc}', num(lowFn.avg));
  const body = `
    <p>${L.concOverall(org, num(S.overall), L.bands[S.band])} ${esc(L.bandInterp[S.band])}</p>
    <h2 class="doc-h2"><span class="num">${numS}.1</span>${esc(L.concPri)}</h2>
    ${S.priority.length ? `<p class="doc-lede" style="margin-bottom:8px;">${esc(L.concPriLede)}</p><ol class="doc-ol">${pri}</ol>` : `<div class="callout hero"><p>${esc(L.noGaps)}</p></div>`}
    <h2 class="doc-h2"><span class="num">${numS}.2</span>${esc(L.concRec)}</h2>
    <div class="callout hero"><span class="co-label">${esc(L.concRec)}</span><p>${rec}</p></div>`;
  return sheet(L, secHead(numS, L.sConc, L.concLede), body);
}

function collectNotes(state, isPT) {
  const notes = state.notes || {};
  const out = [];
  for (const f of SAMM.functions) for (const p of f.practices) {
    const items = [];
    for (const q of p.questions) {
      const nt = (notes[q.id] || '').trim();
      if (nt) items.push({ q: isPT ? q.pt : q.en, note: nt });
    }
    if (items.length) out.push({ practice: isPT ? p.pt : p.name, code: p.code, fnCode: f.code, items });
  }
  return out;
}

function notesPages(numS, groups, L) {
  // flow practice-note groups across pages, ~6 groups per page
  const pages = [];
  for (let i = 0; i < groups.length; i += 5) pages.push(groups.slice(i, i + 5));
  return pages.map((grp, gi) => {
    const body = grp.map((g) => `<div style="margin:0 0 14px;">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;"><span class="tag ${FN_TAG[g.fnCode]}">${g.code}</span><strong style="font-family:var(--ok-display);font-size:14px;color:var(--doc-ink);">${esc(g.practice)}</strong></div>
      ${g.items.map((it) => `<div style="margin:0 0 7px 4px;"><div style="font-size:11px;color:var(--doc-ink-mute);line-height:1.4;">${esc(it.q)}</div><div style="font-size:12px;color:var(--doc-ink-soft);line-height:1.5;border-left:2px solid var(--doc-line);padding-left:10px;margin-top:2px;">${esc(it.note)}</div></div>`).join('')}</div>`).join('');
    const head = gi === 0 ? secHead(numS, L.sNotes, L.notesLede) : `<div class="doc-eyebrow">// ${numS} · ${esc(L.sNotes)} (cont.)</div>`;
    return sheet(L, head, body);
  });
}

// ---- AI suggestions appendix: action-level pagination -----------------------
// Fixed-height sheets clip overflow, so we measure each unit (estimated mm) and
// pack pages, splitting a practice's actions across pages (repeating its header
// with "(cont.)") so nothing is ever cut off.
const inlDoc = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--doc-ink);font-weight:600;">$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const estMm = (text, cpl = 82, lh = 4.4) => Math.max(1, Math.ceil((String(text || '').length || 1) / cpl)) * lh;
function parseSuggestion(md) {
  const out = { preamble: [], actions: [] }; let cur = null;
  for (const raw of String(md || '').split(/\n/)) {
    const t = raw.trim(); if (!t || /^[-*_]{3,}$/.test(t)) continue;
    const mAct = t.match(/^(\d+)[.)]\s*\*\*(.+?)\*\*:?\s*(.*)$/);
    const mLbl = t.match(/^\*\*(.+?):\*\*\s*(.*)$/);
    if (mAct) { cur = { title: mAct[2].replace(/\*\*/g, '').replace(/:$/, ''), lead: mAct[3] || '', fields: [] }; out.actions.push(cur); }
    else if (mLbl && cur) cur.fields.push({ label: mLbl[1], body: mLbl[2] });
    else if (cur) cur.fields.push({ label: '', body: t });
    else out.preamble.push(t);
  }
  return out;
}
function actionMm(a) { let mm = 6 + 3; if (a.lead) mm += estMm(a.lead); for (const f of a.fields) mm += estMm((f.label ? f.label + ' ' : '') + f.body, 80) + 1; return mm; }
function actionHtml(a, n) {
  let h = `<div style="margin:9px 0 0;padding:9px 0 0;border-top:1px solid var(--doc-line-soft);"><div style="display:flex;gap:8px;align-items:baseline;"><span style="flex:none;width:17px;height:17px;border-radius:50%;background:var(--doc-magenta);color:#fff;font-family:var(--ok-mono);font-weight:700;font-size:9px;display:inline-flex;align-items:center;justify-content:center;">${n}</span><strong style="font-family:var(--ok-display);font-size:12.5px;color:var(--doc-ink);">${inlDoc(a.title)}</strong></div>`;
  if (a.lead) h += `<div style="font-size:11px;color:var(--doc-ink-soft);line-height:1.5;margin:3px 0 0;">${inlDoc(a.lead)}</div>`;
  for (const f of a.fields) h += f.label
    ? `<div style="margin:2px 0 0 25px;font-size:11px;line-height:1.5;"><span style="font-family:var(--ok-mono);font-size:8px;letter-spacing:.07em;text-transform:uppercase;color:var(--doc-magenta);">${esc(f.label)}</span> <span style="color:var(--doc-ink-soft);">${inlDoc(f.body)}</span></div>`
    : `<div style="font-size:11px;color:var(--doc-ink-soft);line-height:1.5;margin:3px 0 0 25px;">${inlDoc(f.body)}</div>`;
  return h + '</div>';
}
function aiBlockOpen(it, cont, L) {
  const badge = it.target > 0 ? `<span style="font-family:var(--ok-mono);font-size:9px;color:${FN_COLOR[it.fnCode]};border:1px solid currentColor;padding:1px 6px;white-space:nowrap;">${esc(L.toReach)} ${it.target}</span>` : '';
  return `<div style="border:1px solid var(--doc-line);border-left:3px solid ${FN_COLOR[it.fnCode]};padding:12px 14px;margin:12px 0;">
    <div style="display:flex;align-items:baseline;gap:8px;justify-content:space-between;margin-bottom:2px;"><div style="display:flex;align-items:baseline;gap:8px;"><span class="tag ${FN_TAG[it.fnCode]}">${esc(it.fnName)}</span><strong style="font-family:var(--ok-display);font-size:15px;color:var(--doc-ink);">${esc(it.name)}${cont ? ' <span style="font-weight:400;color:var(--doc-ink-mute);font-size:12px;">(cont.)</span>' : ''}</strong></div>${badge}</div>`;
}
function aiSuggestionsPages(numS, state, L, isPT) {
  const ai = state.ai || {}; const targets = state.targets || {};
  const items = [];
  for (const f of SAMM.functions) for (const p of f.practices) {
    const e = ai[p.code]; if (!(e && e.text)) continue;
    items.push({ name: isPT ? (p.pt || p.name) : p.name, fnName: isPT ? (f.pt || f.name) : f.name, fnCode: f.code, target: Number(targets[p.code]) || 0, parsed: parseSuggestion(e.text) });
  }
  if (!items.length) return null;
  const FIRST = 194, CONT = 230, HEADERMM = 15; // usable mm (calibrated to ~237mm; small safety margin)
  const pages = []; let cur = []; let used = 0; let budget = FIRST; let open = false;
  const flush = () => { if (open) { cur.push('</div>'); open = false; } if (cur.length) pages.push(cur.join('')); cur = []; used = 0; budget = CONT; };
  for (const it of items) {
    const units = [];
    if (it.parsed.preamble.length) { const html = it.parsed.preamble.map((l) => `<div style="font-size:11px;color:var(--doc-ink-soft);line-height:1.5;margin:3px 0 0;">${inlDoc(l)}</div>`).join(''); units.push({ mm: it.parsed.preamble.reduce((s, l) => s + estMm(l), 0) + 2, html }); }
    it.parsed.actions.forEach((a, i) => units.push({ mm: actionMm(a), html: actionHtml(a, i + 1) }));
    let firstFrag = true;
    for (const u of units) {
      const need = (open ? 0 : HEADERMM) + u.mm;
      if (used + need > budget && used > 0) { if (open) { cur.push('</div>'); open = false; } flush(); }
      if (!open) { cur.push(aiBlockOpen(it, !firstFrag, L)); used += HEADERMM; open = true; firstFrag = false; }
      cur.push(u.html); used += u.mm;
    }
    if (open) { cur.push('</div>'); open = false; }
  }
  flush();
  return pages.map((body, gi) => {
    const head = gi === 0
      ? secHead(numS, L.sAI, L.sAILede) + `<div style="font-family:var(--ok-mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--doc-ink-mute);margin:-6px 0 10px;">⚠ ${esc(L.aiNote)}</div>`
      : `<div class="doc-eyebrow">// ${numS} · ${esc(L.sAI)} (cont.)</div>`;
    return sheet(L, head, body);
  });
}

function renderReportHTML(assessment) {
  const state = assessment.state || assessment;
  const meta = Object.assign({ org: '', team: '', date: '', lead: '', contrib: '' }, state.meta || {});
  const isPT = state.lang !== 'en';
  const L = isPT ? STR.pt : STR.en;
  const S = summarize(state);
  const answers = state.answers || {};
  const gen = (assessment.created_at || new Date().toISOString()).slice(0, 10);

  // ---- assemble numbered sections ----
  const snaps = (state.snapshots || []).filter((s) => s && s.score != null);
  const notes = collectNotes(state, isPT);
  let n = 0;
  const nn = () => String(++n).padStart(2, '0');
  const sections = [];
  let e = nn(); sections.push({ num: e, title: L.s1, sheets: [execPage(e, S, L)] });
  e = nn(); sections.push({ num: e, title: L.s2, sheets: [methodologyPage(e, S, L)] });
  e = nn(); sections.push({ num: e, title: L.s3, sheets: functionPages(e, S, L) });
  e = nn(); sections.push({ num: e, title: L.s4, sheets: roadmapPages(e, S, L, isPT, answers) });
  if (snaps.length >= 1) { e = nn(); sections.push({ num: e, title: L.sEvo, sheets: [evolutionPage(e, snaps, S, L)] }); }
  e = nn(); sections.push({ num: e, title: L.sConc, sheets: [conclusionPage(e, S, L, meta, isPT)] });
  // ---- appendices (lettered, at the end) ----
  let ax = 0; const ann = () => String.fromCharCode(65 + ax++); // A, B, …
  const aiPages = aiSuggestionsPages('A', state, L, isPT); // AI is always the first appendix → 'A'
  if (aiPages) { ann(); sections.push({ num: 'A', title: L.sAI, sheets: aiPages }); }
  if (notes.length) { const a = ann(); sections.push({ num: a, title: L.sNotes, sheets: notesPages(a, notes, L) }); }

  // ---- page numbers: cover=1, TOC=2, sections start at 3 ----
  let pageCursor = 3;
  const tocEntries = sections.map((s) => { const page = pageCursor; pageCursor += s.sheets.length; return { num: s.num, title: s.title, page }; });

  const bodySheets = sections.flatMap((s) => s.sheets).join('');
  return `<!doctype html><html lang="${isPT ? 'pt' : 'en'}"><head><meta charset="utf-8">
<title>OKAMI · ${esc(L.report)}</title>
<style>${FONTS}</style>
<style>${require('./styles')}</style>
</head><body>
${coverPage(meta, S, L, gen)}
${tocPage(L, tocEntries)}
${bodySheets}
</body></html>`;
}

module.exports = { renderReportHTML };
