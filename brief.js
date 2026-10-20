/* Build the daily email brief from stocks.csv.

Run:  node brief.js stocks.csv state.json out/

Reads the previous state (if any), computes today's signals with engine.js (the same code the website runs),
writes out/brief.html, out/brief.txt, out/subject.txt and an updated state.json, and prints send=true|false
for GitHub Actions. Exits with code 2 when the newest price is too old, so a broken feed fails the workflow
instead of quietly publishing stale numbers.

Environment:
  BRIEF_RUN=true   this run should send the brief (scheduled run or manual "send brief")
  BRIEF_FORCE=true send even if today's brief already went out (manual runs)
  WATCHLIST        optional, comma separated symbols to report on
  SITE_URL         link in the email footer */
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

const [csvPath, statePath, outDir] = process.argv.slice(2);
const CFG = { N: 20, vol: 1.5 };            // the website's defaults
const STALE_DAYS = 4;                         // a long weekend is fine; more than this is a broken feed
const KEEP_SNAPS = 10, KEEP_SIGNALS_DAYS = 400;
const SEG = [['Large', 'Blue chip'], ['Mid', 'Midcap'], ['Small', 'Smallcap']];
const SITE = process.env.SITE_URL || 'https://pain-in-the-bhat.github.io/alpha-search/';

/* ---------- load ---------- */
const parsed = E.parseCSV(fs.readFileSync(csvPath, 'utf8'), '');
if (parsed.err) { console.error(parsed.err); process.exit(1); }
const DATA = {};
Object.keys(parsed.data).forEach(k => { DATA[k] = E.prep(parsed.data[k]); });
const M = E.computeAll(DATA, CFG);
const latest = M.reduce((d, m) => { const x = DATA[m.sym].d.at(-1); return x > d ? x : d; }, '');
let state = { snaps: [], signals: [], briefed: [] };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(statePath, 'utf8'))); } catch (e) { /* first run */ }

/* ---------- freshness guard ---------- */
const todayIST = process.env.BRIEF_TODAY || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const ageDays = Math.round((Date.parse(todayIST) - Date.parse(latest)) / 864e5);
if (ageDays > STALE_DAYS) {
  console.error(`Newest close is ${latest}, ${ageDays} days old. The price feed looks broken, so nothing is published.`);
  process.exit(2);
}

/* ---------- today's snapshot ---------- */
const pc = (a, f) => a.length ? a.filter(f).length / a.length : 0;
function regimeOf(arr) {
  if (arr.length < 5) return null;
  const a50 = pc(arr, m => m.above50), a200 = pc(arr, m => m.above200);
  const lab = a50 >= .6 && a200 >= .5 ? 'Risk-on' : a50 < .4 ? 'Risk-off' : 'Neutral';
  return { a50, a200, lab };
}
const lastClose = m => DATA[m.sym].d.at(-1);
const live = M.filter(m => lastClose(m) === latest);   // ignore symbols that did not trade today
const snap = {
  date: latest,
  brk: live.filter(m => m.T.brk).map(m => m.sym),
  hi: live.filter(m => m.hiNew).map(m => m.sym),
  top: M.filter(m => m.mom >= .9).map(m => m.sym),
  reg: regimeOf(M),
  seg: Object.fromEntries(SEG.map(([k]) => [k, regimeOf(M.filter(m => m.cap === k))])),
};
const prev = state.snaps.filter(s => s.date < latest).at(-1) || null;
const was = k => new Set(prev ? prev[k] : []);
const newBrk = live.filter(m => m.T.brk && !was('brk').has(m.sym));
const newHi = live.filter(m => m.hiNew && !was('hi').has(m.sym));
const entered = prev ? M.filter(m => m.mom >= .9 && !was('top').has(m.sym)) : [];
const exited = prev ? prev.top.filter(s => !snap.top.includes(s)).map(s => M.find(m => m.sym === s)).filter(Boolean) : [];

/* ---------- state for tomorrow (and for forward tracking of signals later) ---------- */
state.snaps = state.snaps.filter(s => s.date !== latest).concat([snap]).slice(-KEEP_SNAPS);
const logged = new Set(state.signals.filter(x => x.d === latest).map(x => x.t + x.s));
[['brk', newBrk], ['hi', newHi], ['top', entered]].forEach(([t, arr]) => arr.forEach(m => {
  if (!logged.has(t + m.sym)) state.signals.push({ d: latest, s: m.sym, t, c: m.last });
}));
const cutoff = new Date(Date.parse(latest) - KEEP_SIGNALS_DAYS * 864e5).toISOString().slice(0, 10);
state.signals = state.signals.filter(x => x.d >= cutoff);
const wantBrief = process.env.BRIEF_RUN === 'true';
const send = wantBrief && (process.env.BRIEF_FORCE === 'true' || !state.briefed.includes(latest));
if (send) state.briefed = state.briefed.concat([latest]).slice(-30);
fs.writeFileSync(statePath, JSON.stringify(state));

/* ---------- formatting ---------- */
const fmt = (x, d = 2) => x == null || !isFinite(x) ? '–' : x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => x == null || !isFinite(x) ? '–' : (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const pts = x => (x > 0 ? '+' : '') + Math.round(x * 100) + ' pts';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nice = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const capName = c => (SEG.find(q => q[0] === c) || [, c])[1];
const SETUP_TAGS = { brk: 'BRK', hi52: 'HI', pull: 'PB', base: 'BASE', gap: 'GAP', rs: 'RS' };
const tags = m => Object.keys(SETUP_TAGS).filter(k => m.T[k]).map(k => SETUP_TAGS[k]).join(' ');
const C = { ink: '#16161a', muted: '#6b6b76', line: '#e6e6ea', amber: '#c46a00', up: '#0b8148', down: '#c42f3c', soft: '#fafafa' };
const MONO = "Consolas,'SF Mono',Menlo,monospace";
const SANS = "'Segoe UI',-apple-system,Helvetica,Arial,sans-serif";
const col = x => x > 0 ? C.up : x < 0 ? C.down : C.ink;

const reg = snap.reg;
const d50 = prev && prev.reg ? reg.a50 - prev.reg.a50 : null;
const sectors = Object.entries(M.reduce((o, m) => { (o[m.sector] = o[m.sector] || []).push(m.r['1W']); return o; }, {}))
  .map(([s, v]) => { const a = v.filter(x => x != null); return [s, a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, a.length]; })
  .filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
const by1D = live.filter(m => m.r['1D'] != null).sort((a, b) => b.r['1D'] - a.r['1D']);
const watch = (process.env.WATCHLIST || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const watchRows = watch.map(s => M.find(m => m.sym === s)).filter(Boolean);
const missingWatch = watch.filter(s => !M.some(m => m.sym === s));

/* ---------- html ---------- */
const th = (t, right) => `<th align="${right ? 'right' : 'left'}" style="padding:6px 8px;border-bottom:1px solid ${C.line};font:600 10px ${MONO};letter-spacing:1px;text-transform:uppercase;color:${C.muted}">${t}</th>`;
const td = (t, o = {}) => `<td align="${o.r ? 'right' : 'left'}" style="padding:7px 8px;border-bottom:1px solid ${C.line};font:${o.b ? 600 : 400} 13px ${o.mono ? MONO : SANS};color:${o.c || C.ink};white-space:nowrap">${t}</td>`;
const table = (head, rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${'<tr>' + head + '</tr>' + rows}</table>`;
const section = (title, note, body) => `<tr><td style="padding:22px 24px 0">
  <div style="font:600 11px ${MONO};letter-spacing:1.5px;text-transform:uppercase;color:${C.amber}">${title}</div>
  ${note ? `<div style="font:13px ${SANS};color:${C.muted};margin-top:4px">${note}</div>` : ''}
  <div style="margin-top:10px">${body}</div></td></tr>`;
const stockRows = list => list.map(m => '<tr>' +
  td(`<a href="${SITE}" style="color:${C.ink};text-decoration:none"><b>${esc(m.sym)}</b></a><br><span style="font:12px ${SANS};color:${C.muted}">${esc(m.name || '')} · ${esc(capName(m.cap))}</span>`) +
  td(fmt(m.last), { r: 1, mono: 1 }) + td(pct(m.r['1D']), { r: 1, mono: 1, c: col(m.r['1D']) }) +
  td(m.volX ? m.volX.toFixed(1) + 'x' : '–', { r: 1, mono: 1 }) + td(pct(m.pctHigh), { r: 1, mono: 1, c: col(m.pctHigh) }) +
  td(Math.round(m.score), { r: 1, mono: 1, b: 1 }) + td(tags(m) || '–', { mono: 1, c: C.amber }) + '</tr>').join('');
const stockTable = list => table(th('Stock') + th('Close', 1) + th('1D', 1) + th('Vol x', 1) + th('vs 52w hi', 1) + th('Score', 1) + th('Setups'), stockRows(list));
const none = t => `<div style="font:13px ${SANS};color:${C.muted}">${t}</div>`;
const chips = list => list.map(m => `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;border:1px solid ${C.line};border-radius:4px;font:12px ${MONO};color:${C.ink}">${esc(m.sym)} <span style="color:${col(m.r['3M'])}">${pct(m.r['3M'], 0)}</span></span>`).join('');

const breadth = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${[
  ['Regime', reg.lab, reg.lab === 'Risk-on' ? C.up : reg.lab === 'Risk-off' ? C.down : C.amber],
  ['Above 50 DMA', Math.round(reg.a50 * 100) + '%', C.ink, d50 != null ? pts(d50) + ' vs prior day' : ''],
  ['Above 200 DMA', Math.round(reg.a200 * 100) + '%', C.ink],
  ['New breakouts', String(newBrk.length), C.ink],
].map(([l, v, c, sub]) => `<td valign="top" style="padding:12px 14px;border:1px solid ${C.line}"><div style="font:600 10px ${MONO};letter-spacing:1px;text-transform:uppercase;color:${C.muted}">${l}</div><div style="font:600 22px ${MONO};color:${c};margin-top:4px">${v}</div>${sub ? `<div style="font:11px ${SANS};color:${C.muted}">${sub}</div>` : ''}</td>`).join('')}</tr></table>`;

const segTable = table(th('Segment') + th('Stocks', 1) + th('1D avg', 1) + th('Above 50 DMA', 1) + th('Regime'), SEG.map(([k, l]) => {
  const a = M.filter(m => m.cap === k), r = snap.seg[k]; if (!a.length || !r) return '';
  const avg = a.map(m => m.r['1D']).filter(x => x != null).reduce((x, y, _, z) => x + y / z.length, 0);
  return '<tr>' + td(l, { b: 1 }) + td(a.length, { r: 1, mono: 1 }) + td(pct(avg, 2), { r: 1, mono: 1, c: col(avg) }) + td(Math.round(r.a50 * 100) + '%', { r: 1, mono: 1 }) + td(r.lab, { c: r.lab === 'Risk-on' ? C.up : r.lab === 'Risk-off' ? C.down : C.amber }) + '</tr>';
}).join(''));

const moveList = list => list.map(m => `<tr>${td(`<b>${esc(m.sym)}</b>`)}${td(fmt(m.last), { r: 1, mono: 1 })}${td(pct(m.r['1D'], 2), { r: 1, mono: 1, c: col(m.r['1D']) })}</tr>`).join('');
const movers = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td valign="top" width="50%" style="padding-right:8px">${table(th('Gainers') + th('Close', 1) + th('1D', 1), moveList(by1D.slice(0, 5)))}</td>
  <td valign="top" width="50%" style="padding-left:8px">${table(th('Losers') + th('Close', 1) + th('1D', 1), moveList(by1D.slice(-5).reverse()))}</td></tr></table>`;
const secList = arr => arr.map(([s, v, n]) => `<tr>${td(esc(s))}${td(n, { r: 1, mono: 1, c: C.muted })}${td(pct(v), { r: 1, mono: 1, c: col(v) })}</tr>`).join('');
const sectorBlock = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td valign="top" width="50%" style="padding-right:8px">${table(th('Leading') + th('Stocks', 1) + th('1W', 1), secList(sectors.slice(0, 3)))}</td>
  <td valign="top" width="50%" style="padding-left:8px">${table(th('Lagging') + th('Stocks', 1) + th('1W', 1), secList(sectors.slice(-3).reverse()))}</td></tr></table>`;

const firstRun = !prev;
const sections = [
  section('Market breadth', `Close of ${nice(latest)}.`, breadth + '<div style="height:10px"></div>' + segTable),
  section(firstRun ? 'Confirmed breakouts' : 'New breakouts', `Close above the prior ${CFG.N}-day high on at least ${CFG.vol}x average volume${firstRun ? '' : ', not in yesterday\'s list'}.`, newBrk.length ? stockTable(newBrk.sort((a, b) => b.score - a.score)) : none('None today.')),
  section(firstRun ? '52-week highs' : 'New 52-week highs', '', newHi.length ? stockTable(newHi.sort((a, b) => b.score - a.score)) : none('None today.')),
  ...(firstRun ? [] : [section('Momentum leaders', 'Top 10% of their market-cap group on blended 1, 3 and 6 month returns. Figure shown is the 3 month return.',
    `<div style="font:600 12px ${SANS};color:${C.up};margin-bottom:6px">Entered (${entered.length})</div>${entered.length ? chips(entered) : none('No changes.')}
     <div style="font:600 12px ${SANS};color:${C.down};margin:10px 0 6px">Dropped out (${exited.length})</div>${exited.length ? chips(exited) : none('No changes.')}`)]),
  ...(watchRows.length || missingWatch.length ? [section('Your watchlist', missingWatch.length ? `Not in the data: ${esc(missingWatch.join(', '))}.` : '', watchRows.length ? stockTable(watchRows) : '')] : []),
  section('Biggest moves today', '', movers),
  section('Sector rotation', 'Average 1 week return of each sector\'s stocks.', sectorBlock),
];
const subject = `α ${new Date(latest + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${reg.lab} · ${newBrk.length} new breakout${newBrk.length === 1 ? '' : 's'} · ${Math.round(reg.a50 * 100)}% above 50 DMA`;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid ${C.line};border-radius:8px">
<tr><td style="padding:16px 24px;background:#0b0b0d;border-radius:8px 8px 0 0">
  <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:5px;background:#ffa028;color:#140b00;font:700 14px ${MONO}">α</span>
  <span style="font:600 12px ${MONO};letter-spacing:3px;color:#ececef;margin-left:8px;vertical-align:2px">ALPHA SEARCH</span>
  <span style="font:11px ${MONO};color:#ffa028;margin-left:10px;vertical-align:2px">DAILY BRIEF · ${esc(nice(latest).toUpperCase())}</span>
</td></tr>
${sections.join('\n')}
<tr><td style="padding:24px">
  <a href="${SITE}" style="display:inline-block;padding:10px 16px;background:#ffa028;color:#140b00;border-radius:6px;font:600 13px ${SANS};text-decoration:none">Open Alpha Search</a>
  <div style="font:12px ${SANS};color:${C.muted};margin-top:16px;line-height:1.6">Prices from Yahoo Finance, daily close of ${nice(latest)}. ${M.length} NSE stocks.
  Signals use the same rules as the website: ${CFG.N}-day breakout, ${CFG.vol}x volume. This is an analysis tool, not investment advice.</div>
</td></tr></table></td></tr></table></body></html>`;

const line = m => `  ${m.sym.padEnd(12)} ${fmt(m.last).padStart(11)}  ${pct(m.r['1D']).padStart(7)}  score ${Math.round(m.score)}  ${tags(m)}`;
const text = [
  `ALPHA SEARCH · DAILY BRIEF · ${nice(latest)}`, '',
  `${reg.lab}. ${Math.round(reg.a50 * 100)}% above 50 DMA${d50 != null ? ` (${pts(d50)})` : ''}, ${Math.round(reg.a200 * 100)}% above 200 DMA.`, '',
  `${firstRun ? 'Confirmed' : 'New'} breakouts (${newBrk.length}):`, ...(newBrk.length ? newBrk.map(line) : ['  None today.']), '',
  `${firstRun ? '' : 'New '}52-week highs (${newHi.length}):`, ...(newHi.length ? newHi.map(line) : ['  None today.']), '',
  ...(firstRun ? [] : [`Entered momentum leaders: ${entered.map(m => m.sym).join(', ') || 'none'}`, `Dropped out: ${exited.map(m => m.sym).join(', ') || 'none'}`, '']),
  ...(watchRows.length ? ['Watchlist:', ...watchRows.map(line), ''] : []),
  'Gainers: ' + by1D.slice(0, 5).map(m => `${m.sym} ${pct(m.r['1D'])}`).join(', '),
  'Losers: ' + by1D.slice(-5).reverse().map(m => `${m.sym} ${pct(m.r['1D'])}`).join(', '), '',
  SITE, 'Not investment advice.',
].join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'brief.html'), html);
fs.writeFileSync(path.join(outDir, 'brief.txt'), text);
fs.writeFileSync(path.join(outDir, 'subject.txt'), subject);
console.log(`latest=${latest}`);
console.log(`send=${send}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest=${latest}\nsend=${send}\n`);
console.error(`${subject} | prev=${prev ? prev.date : 'none'} entered=${entered.length} exited=${exited.length}`);
