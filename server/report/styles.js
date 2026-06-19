'use strict';
// Okami document theme — distilled from the OKAMI Relatorio v2 template.
// Dark cover sheet + light interior sheets, A4, brand accents per business function.
module.exports = `
:root{
  /* screen/dark tokens (used by the cover) */
  --ok-bg-0:#060609; --ok-bg-1:#0b0b12; --ok-bg-2:#11111b; --ok-line:#1f1f2e; --ok-line-soft:#15151f;
  --ok-fg:#f4f4f8; --ok-fg-soft:#b9bac8; --ok-fg-mute:#6c6d80;
  --ok-orange:oklch(72% 0.19 45); --ok-magenta:oklch(70% 0.27 340); --ok-cyan:oklch(82% 0.14 200);
  /* document/light tokens (interior) */
  --doc-paper:#fcfcfe; --doc-paper-2:#f3f4f8; --doc-paper-3:#eceef3;
  --doc-ink:#0b0b12; --doc-ink-soft:#3b3c4a; --doc-ink-mute:#74758a; --doc-ink-dim:#aeb0c0;
  --doc-line:#dddee8; --doc-line-soft:#ebecf2;
  --doc-cyan:oklch(55% 0.11 220); --doc-magenta:oklch(52% 0.20 350); --doc-orange:oklch(60% 0.17 45);
  --doc-success:oklch(52% 0.15 150); --doc-danger:oklch(55% 0.21 25); --doc-warning:oklch(60% 0.14 85);
  --doc-struct:var(--doc-cyan); --doc-emph:var(--doc-magenta); --doc-hero:var(--doc-orange);
  --doc-pad-x:22mm; --doc-pad-y:14mm;
  --ok-display:'Space Grotesk',system-ui,sans-serif;
  --ok-mono:ui-monospace,'SF Mono',Menlo,'JetBrains Mono',monospace;
}
*{ box-sizing:border-box; }
@page{ size:A4; margin:0; }
html,body{ margin:0; padding:0; background:#0a0a0f; }
body{ counter-reset:pg; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-family:var(--ok-display); }

.sheet{
  position:relative; width:210mm; height:297mm; background:var(--doc-paper); color:var(--doc-ink);
  overflow:hidden; counter-increment:pg; display:flex; flex-direction:column;
  break-after:page; page-break-after:always; margin:0 auto;
}
.sheet:last-child{ break-after:auto; page-break-after:auto; }
.pad{ padding:var(--doc-pad-y) var(--doc-pad-x); flex:1; display:flex; flex-direction:column; position:relative; z-index:2; }

/* running header / footer */
.run-head{ display:flex; align-items:center; justify-content:space-between; padding:10mm var(--doc-pad-x) 0;
  font-family:var(--ok-mono); font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--doc-ink-mute); }
.run-head .brand{ display:flex; align-items:center; gap:8px; }
.run-head .brand .chip{ width:22px; height:22px; background:var(--ok-bg-0); display:grid; place-items:center; border-radius:3px; flex-shrink:0; }
.run-head .brand .chip img{ width:18px; height:18px; object-fit:contain; }
.run-head .brand b{ font-family:var(--ok-display); font-weight:600; font-size:12px; letter-spacing:.12em; color:var(--doc-ink); }
.head-rule{ height:2px; margin:8px var(--doc-pad-x) 0;
  background:linear-gradient(90deg,var(--doc-cyan),color-mix(in oklch,var(--doc-magenta) 70%,transparent) 55%,transparent); }
.run-foot{ display:flex; align-items:center; justify-content:space-between; padding:8px var(--doc-pad-x) 10mm; margin-top:auto;
  font-family:var(--ok-mono); font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:var(--doc-ink-mute);
  border-top:1px solid var(--doc-line); }
.run-foot .page-no::after{ content:"PAGE " counter(pg, decimal-leading-zero); }
.run-foot .conf{ color:var(--doc-magenta); }

/* cover (dark) */
.sheet.cover{
  background:
    radial-gradient(900px 540px at 88% -5%, color-mix(in oklch,var(--ok-magenta) 16%,transparent), transparent 60%),
    radial-gradient(760px 460px at -8% 28%, color-mix(in oklch,var(--ok-cyan) 13%,transparent), transparent 60%),
    radial-gradient(640px 460px at 50% 108%, color-mix(in oklch,var(--ok-orange) 10%,transparent), transparent 65%),
    var(--ok-bg-0);
  color:var(--ok-fg);
}
.sheet.cover::before{ content:""; position:absolute; inset:0; pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:48px 48px; mask-image:radial-gradient(ellipse at 50% 35%,black 35%,transparent 88%); }
.sheet.cover .pad{ padding:24mm 22mm; }
.cover-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
.cover-logo{ display:flex; align-items:center; gap:14px; }
.cover-logo img{ width:64px; height:64px; object-fit:contain; }
.cover-logo .wm{ font-family:var(--ok-display); font-weight:600; font-size:26px; letter-spacing:.14em; color:var(--ok-fg); }
.cover-logo .wm small{ display:block; font-family:var(--ok-mono); font-weight:400; font-size:8.5px; letter-spacing:.26em; color:var(--ok-fg-mute); margin-top:4px; }
.cover-class{ font-family:var(--ok-mono); font-size:10px; letter-spacing:.2em; text-transform:uppercase; color:var(--ok-magenta);
  border:1px solid color-mix(in oklch,var(--ok-magenta) 45%,var(--ok-line)); padding:6px 12px; display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }
.cover-class::before{ content:""; width:6px; height:6px; background:var(--ok-magenta); border-radius:50%; box-shadow:0 0 8px var(--ok-magenta); }
.cover-mid{ margin-top:78px; }
.cover-eyebrow{ font-family:var(--ok-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ok-cyan);
  display:inline-flex; align-items:center; gap:12px; margin-bottom:22px; }
.cover-eyebrow::before{ content:""; width:28px; height:1px; background:currentColor; }
.sheet.cover h1{ font-family:var(--ok-display); font-weight:500; font-size:44px; line-height:1.04; letter-spacing:-.03em; margin:0; max-width:18ch; color:var(--ok-fg); }
.sheet.cover h1 em{ font-style:normal; color:var(--ok-cyan); }
.cover-sub{ margin-top:18px; font-size:16px; color:var(--ok-fg-soft); max-width:46ch; line-height:1.6; }
.cover-meta{ margin-top:40px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0; border-top:1px solid var(--ok-line); }
.cover-meta .row{ display:flex; flex-direction:column; gap:5px; padding:16px 18px 16px 0; border-bottom:1px solid var(--ok-line-soft); }
.cover-meta .k{ font-family:var(--ok-mono); font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--ok-fg-mute); }
.cover-meta .v{ font-family:var(--ok-display); font-size:15px; color:var(--ok-fg); font-weight:500; }
.cover-meta .v.cyan{ color:var(--ok-cyan); }
.cover-foot{ display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-top:auto; padding-top:34px; }
.cover-foot .org{ font-family:var(--ok-mono); font-size:10px; letter-spacing:.12em; color:var(--ok-fg-mute); line-height:1.7; }
.cover-foot .org b{ color:var(--ok-fg-soft); font-weight:500; }

/* document typography */
.doc-eyebrow{ font-family:var(--ok-mono); font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--doc-struct);
  display:inline-flex; align-items:center; gap:10px; margin:0 0 14px; }
.doc-eyebrow::before{ content:""; width:22px; height:1px; background:currentColor; }
.sheet h1.doc-h1{ font-family:var(--ok-display); font-weight:500; font-size:30px; line-height:1.08; letter-spacing:-.025em; margin:0 0 6px; color:var(--doc-ink); }
.sheet .doc-h1 .num{ color:var(--doc-struct); font-weight:600; margin-right:10px; }
.doc-lede{ font-size:14px; line-height:1.6; color:var(--doc-ink-soft); margin:0 0 18px; max-width:64ch; }
.sheet h2.doc-h2{ font-family:var(--ok-display); font-weight:500; font-size:18px; letter-spacing:-.01em; margin:22px 0 9px; color:var(--doc-ink); display:flex; align-items:baseline; gap:10px; }
.sheet h2.doc-h2 .num{ font-family:var(--ok-mono); font-size:12px; color:var(--doc-struct); letter-spacing:.08em; }

/* metric row */
.metric-row{ display:grid; grid-template-columns:repeat(3,1fr); gap:0; border:1px solid var(--doc-line); margin:16px 0 6px; }
.metric{ padding:14px 16px; border-right:1px solid var(--doc-line); }
.metric:last-child{ border-right:none; }
.metric .mv{ font-family:var(--ok-display); font-weight:600; font-size:30px; letter-spacing:-.03em; line-height:1; color:var(--doc-ink); }
.metric .mv.cyan{ color:var(--doc-cyan); } .metric .mv.mag{ color:var(--doc-magenta); } .metric .mv.org{ color:var(--doc-orange); }
.metric .ml{ font-family:var(--ok-mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--doc-ink-mute); margin-top:8px; line-height:1.5; }

/* bars */
.bl{ color:var(--doc-ink-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
.bt{ display:block; height:7px; background:var(--doc-paper-3); border-radius:2px; overflow:hidden; }
.bf{ display:block; height:100%; border-radius:2px; }
.bv{ text-align:right; color:var(--doc-ink); }

/* callouts */
.callout{ border:1px solid var(--doc-line); border-left:3px solid var(--doc-cyan); background:var(--doc-paper-2); padding:14px 16px; margin:16px 0; }
.callout .co-label{ font-family:var(--ok-mono); font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--doc-cyan); margin-bottom:6px; display:block; }
.callout p{ margin:0; font-size:12px; line-height:1.6; color:var(--doc-ink-soft); }
.callout.hero{ border-left-color:var(--doc-orange); background:color-mix(in oklch,var(--doc-orange) 7%,var(--doc-paper)); }
.callout.hero .co-label{ color:var(--doc-orange); }

/* tables */
.doc-table{ width:100%; border-collapse:collapse; margin:14px 0 18px; font-size:11.5px; }
.doc-table caption{ text-align:left; font-family:var(--ok-mono); font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--doc-ink-mute); margin-bottom:8px; }
.doc-table th{ text-align:left; font-family:var(--ok-mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--doc-ink-mute);
  padding:8px 12px; border-bottom:1.5px solid var(--doc-cyan); }
.doc-table th.num{ text-align:right; }
.doc-table td{ padding:9px 12px; border-bottom:1px solid var(--doc-line-soft); color:var(--doc-ink-soft); vertical-align:middle; line-height:1.5; }
.doc-table td strong{ color:var(--doc-ink); font-weight:600; }
.doc-table td.num{ font-family:var(--ok-mono); text-align:right; font-variant-numeric:tabular-nums; color:var(--doc-ink); }
.tag{ font-family:var(--ok-mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; padding:2px 7px; border:1px solid currentColor; border-radius:2px; display:inline-block; }
.tag.t-cyan{ color:var(--doc-cyan); } .tag.t-mag{ color:var(--doc-magenta); } .tag.t-ok{ color:var(--doc-success); } .tag.t-org{ color:var(--doc-orange); }

/* table of contents */
.toc{ margin:6px 0; }
.toc-item{ display:grid; grid-template-columns:34px 1fr auto; align-items:baseline; gap:12px; padding:12px 0; border-bottom:1px solid var(--doc-line-soft); }
.toc-item .tn{ font-family:var(--ok-mono); font-size:12px; color:var(--doc-struct); letter-spacing:.06em; }
.toc-item .tt{ font-family:var(--ok-display); font-size:15px; color:var(--doc-ink); font-weight:500; }
.toc-item .tt small{ display:block; font-family:var(--ok-mono); font-weight:400; font-size:9.5px; letter-spacing:.08em; color:var(--doc-ink-mute); text-transform:uppercase; margin-top:3px; }
.toc-item .tp{ font-family:var(--ok-mono); font-size:12px; color:var(--doc-ink-mute); }

/* ordered list */
ol.doc-ol{ margin:4px 0 16px; padding-left:0; list-style:none; counter-reset:ol; }
ol.doc-ol li{ position:relative; padding:6px 0 6px 30px; font-size:13px; line-height:1.55; color:var(--doc-ink-soft); counter-increment:ol; }
ol.doc-ol li::before{ content:counter(ol, decimal-leading-zero); position:absolute; left:0; top:6px; font-family:var(--ok-mono); font-size:11px; color:var(--doc-struct); }
.sheet p{ font-size:13px; line-height:1.7; color:var(--doc-ink-soft); margin:0 0 12px; max-width:72ch; }
.sheet p strong{ color:var(--doc-ink); font-weight:600; }
`;
