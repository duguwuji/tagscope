// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Views: inventory / settings / TOI / tag memory / logging / navigation (loaded after app.js)
'use strict';

/* =====================================================================
   Inventory showcase
   ===================================================================== */
const OPT0 = { view: 'list', flip: false, toiSum: true, scen: 'continuous', gpiReset: true, delay: 0, on: 10, off: 0, beep: false, runs: 1, p0: 29, p1: 30, ps: 0.25, plot: false, hexman: false, reset: false, resetWhen: 'initial', rdur: 5, rwin: 0 };
let O = { ...OPT0, ...store.get('inv', {}) };
const COLS = [
  { k: 'idx', l: '#', d: 1, n: 1 }, { k: 'epc', l: 'EPC', d: 1, fmt: 'epc' }, { k: 'tid', l: 'TID', d: 1, fmt: 'tid' }, { k: 'xpc', l: 'XPC Words', fmt: 'other' },
  { k: 'count', l: '读取次数', d: 1, n: 1 }, { k: 'from', l: '最后读取自', d: 1 }, { k: 'first', l: '首次读取', d: 1, n: 1 }, { k: 'last', l: '最后读取', d: 1, n: 1 },
  { k: 'since', l: '距上次读取', d: 1, n: 1 }, { k: 'rts', l: '读写器最后读取时间' }, { k: 'model', l: '标签型号信息', d: 1 },
  { k: 'rssi', l: '最近 RSSI', d: 1, n: 1 }, { k: 'avg', l: 'RSSI 平均', d: 1, n: 1 }, { k: 'max', l: 'RSSI 最大', d: 1, n: 1 }, { k: 'min', l: 'RSSI 最小', d: 1, n: 1 },
  { k: 'ant', l: '天线', d: 1, n: 1 }, { k: 'power', l: '功率', n: 1 }, { k: 'phase', l: '相位角', n: 1 }, { k: 'doppler', l: '多普勒频率', n: 1 }, { k: 'freq', l: '频率 (MHz)', n: 1 },
  { k: 'pc', l: 'PC 字', fmt: 'other' }, { k: 'crh', l: 'CR Handle Hex', fmt: 'other' },
];
const CK = Object.fromEntries(COLS.map(c => [c.k, c]));
let colOn = { ...Object.fromEntries(COLS.map(c => [c.k, !!c.d])), ...store.get('cols2', {}) };
let colOrder = store.get('colOrder', COLS.map(c => c.k)); for (const c of COLS) if (!colOrder.includes(c.k)) colOrder.push(c.k); colOrder = colOrder.filter(k => CK[k]);
let fmtMode = { epc: 'hex', tid: 'hex', other: 'hex', ...store.get('fmt', {}) };
let sort = { key: 'idx', dir: 1 }, selected = null;
let tags = new Map(), srcStats = {}, totalReads = 0, order = 0, plotPts = [], readLog = [], rateBuf = [];
let run = null, lastRun = null, clockMs = 0;

function participants() { return sources.filter(s => s.enabled && rt(s.id).connected); }
function refreshParticipants() { $('#inv-play').disabled = !run && !participants().length; renderBlank(); }
function scenText() {
  const r = run;
  if (O.scen === 'timed') return `定时 - 共 ${O.runs} 次，每次 ${O.on} s` + (r ? `（第 ${r.i}/${r.n} 次${r.phase === 'off' ? '，间歇' : r.phase === 'delay' ? '，延迟中' : r.phase === 'reset' ? '，重置为 A 状态' : ''}）` : '');
  if (O.scen === 'margin') return `余量测试 - ${(+O.p0).toFixed(2)} → ${(+O.p1).toFixed(2)} dBm，步进 ${O.ps} dBm` + (r ? `（${r.power != null ? r.power.toFixed(2) + ' dBm，' : ''}第 ${r.i}/${r.n} 次${r.phase === 'off' ? '，间歇' : r.phase === 'reset' ? '，重置为 A 状态' : ''}）` : '');
  if (O.scen === 'gpi') return 'GPI 触发 - ' + (r ? (r.gpiOn ? '读取中' : '等待 GPI 启动信号') : '由 GPI 启动');
  return '连续 - 永久运行' + (r && r.phase === 'reset' ? '（重置为 A 状态）' : '');
}
function clearData() { tags = new Map(); srcStats = {}; totalReads = 0; order = 0; plotPts = []; readLog = []; rateBuf = []; selected = null; }
const marginLevels = () => { const a = [], p0 = +O.p0, p1 = +O.p1, st = +O.ps || 0.25; for (let p = p0; p <= p1 + 1e-9; p += st) a.push(+p.toFixed(2)); return a; };

function validateScenario(parts) {
  if (!parts.length) return '没有已启用且已连接的数据源';
  if (O.scen === 'gpi') {
    if (parts.length > 1) return 'GPI 触发时只能启用一个数据源';
    const s = parts[0], i = infoOf(s) || {};
    if (!i.gpi || s.iface === 'rest') return `数据源“${nameOf(s)}”不支持 GPI 触发`;
    if (!gpiTriggers(activeCfg(s)).start) return `请在数据源“${nameOf(s)}”的当前预设中勾选一个 GPI 启动端口`;
  }
  if (O.scen === 'margin' && +O.p1 < +O.p0) return '结束功率必须不小于起始功率';
  return '';
}
async function startAll(parts, ov) { const res = await Promise.allSettled(parts.map(s => backendOf(s).api('start', { id: s.id, cfg: wire(s, ov) }).then(applySrcState))); const bad = res.map((r, k) => r.status === 'rejected' ? `${nameOf(parts[k])}：${r.reason.message}` : null).filter(Boolean); if (bad.length) { bad.forEach(m => addLog({ level: 'error', msg: m, ts: Date.now() })); toast(bad[0]); } return bad.length < parts.length; }
async function stopAll(parts) { await Promise.allSettled(parts.map(s => backendOf(s).api('stop', { id: s.id }).then(applySrcState))); }
async function wait(ms, tok) { const end = Date.now() + ms; while (Date.now() < end) { if (tok.stop) return false; await sleep(Math.min(100, end - Date.now())); } return !tok.stop; }
async function doReset(parts, tok) {
  run.phase = 'reset'; addLog({ level: 'info', msg: `将标签重置为 A 状态（Single Target Reset，${O.rdur} s）`, ts: Date.now() });
  await startAll(parts, { searchMode: 5, quiet: true }); await wait((+O.rdur || 5) * 1000, tok); await stopAll(parts); run.phase = 'gap'; await sleep(500);
}
async function startShowcase() {
  const parts = participants(), err = validateScenario(parts); if (err) { toast(err); return; }
  clearData(); const tok = { stop: false };
  run = { tok, parts: parts.map(s => s.id), t0: Date.now(), phase: 'delay', i: 0, n: 1, activeMs: 0, onSince: 0, power: null, startedAt: new Date(), gpiOn: false, names: Object.fromEntries(parts.map(s => [s.id, nameOf(s)])) };
  lastRun = run; setPlay(true); render(true);
  try {
    const levels = O.scen === 'margin' ? marginLevels() : null;
    run.n = O.scen === 'timed' ? Math.max(1, +O.runs || 1) : levels ? levels.length : 1;
    if (O.scen === 'timed' || O.scen === 'margin') { if (+O.delay > 0 && !(await wait(O.delay * 1000, tok))) return; }
    for (let k = 0; k < run.n && !tok.stop; k++) {
      run.i = k + 1; run.power = levels ? levels[k] : null;
      if (O.reset && (k === 0 || O.resetWhen === 'each')) { await doReset(parts, tok); if (tok.stop) break; }
      if (O.beep && (O.scen === 'timed' || O.scen === 'margin')) beep();
      run.phase = 'on'; run.onSince = Date.now(); run.runStart = Date.now(); run.runRows = [];
      if (!(await startAll(parts, { power: run.power, gpi: O.scen === 'gpi' }))) { tok.stop = true; break; }
      if (O.scen === 'continuous' || O.scen === 'gpi') { while (!tok.stop) await sleep(100); }
      else { await wait(O.on * 1000, tok); }
      await stopAll(parts); endPhase(); flushRunLog(k + 1);
      if (!tok.stop && k < run.n - 1 && +O.off > 0) { run.phase = 'off'; if (!(await wait(O.off * 1000, tok))) break; }
    }
  } catch (e) { toast(e.message); addLog({ level: 'error', msg: e.message, ts: Date.now() }); }
  finally {
    if (run && run.phase === 'on') { await stopAll(parts); endPhase(); flushRunLog(run.i); } else if (run && (run.phase === 'reset' || run.phase === 'gap')) await stopAll(parts);
    if (run) { clockMs = Date.now() - run.t0; run.done = true; } run = null; setPlay(false); render(true);
  }
}
function endPhase() { if (run && run.phase === 'on') { run.activeMs += Date.now() - run.onSince; run.phase = 'idle'; } }
function stopShowcase() { if (run) run.tok.stop = true; }
function setPlay(on) { $('#playIco').hidden = on; $('#stopIco').hidden = !on; $('#inv-play').title = on ? '停止' : '开始'; $('#inv-play').setAttribute('aria-label', on ? '停止盘点' : '开始盘点'); $('#inv-gear').disabled = on; refreshParticipants(); }
$('#inv-play').onclick = () => run ? stopShowcase() : startShowcase();
handlers.rospec = d => { if (!run || !run.parts.includes(d.id) || O.scen !== 'gpi' || run.phase !== 'on') return; run.gotRospec = true; run.gpiOn = d.ev === 'start'; addLog({ id: d.id, level: 'info', msg: d.ev === 'start' ? 'GPI 启动：开始读取' : 'GPI 停止：停止读取', ts: d.ts });
  if (d.ev === 'start') { if (O.gpiReset) { run.t0 = Date.now(); } run.onSince = Date.now(); } else { run.activeMs += Date.now() - run.onSince; }
  if (run.runRows) run.runRows.push(`# GPI ${d.ev === 'start' ? 'START' : 'STOP'} ${new Date(d.ts).toISOString()} ${run.names[d.id]}`); };
handlers.gpi = d => addLog({ id: d.id, level: 'info', msg: `GPI ${d.port} → ${d.level ? '高' : '低'}`, ts: d.ts });

handlers.tags = b => {
  if (!run || run.phase !== 'on' || !run.parts.includes(b.id)) return;
  if (O.scen === 'gpi' && !run.gpiOn && !run.gotRospec) run.gpiOn = true;
  const now = Date.now(), rel = now - run.t0, st = srcStats[b.id] || (srcStats[b.id] = { reads: 0, epcs: new Map() });
  st.reads += b.total; totalReads += b.total; rateBuf.push([now, b.total]);
  const s = srcById(b.id), logOn = store.get('logOn', false);
  for (const r of b.reads) {
    const epc = clean(r.epc); if (!epc) continue;
    let t = tags.get(epc);
    if (!t) { t = { epc, idx: ++order, count: 0, first: rel, sum: 0, n: 0, max: -999, min: 999, power: run.power ?? r.power }; tags.set(epc, t); }
    t.count += r.count; t.last = rel; t.lastAbs = now; t.from = b.id; t.rssi = r.rssi; t.ant = r.antenna;
    if (r.rssiN) { t.sum += r.rssiSum; t.n += r.rssiN; } if (r.maxRssi != null) t.max = Math.max(t.max, r.maxRssi); if (r.minRssi != null) t.min = Math.min(t.min, r.minRssi);
    if (r.tid) t.tid = clean(r.tid); if (r.pc) t.pc = r.pc; if (r.xpc) t.xpc = r.xpc; if (r.crh) t.crh = r.crh; if (r.phase != null) t.phase = r.phase; if (r.doppler != null) t.doppler = r.doppler; if (r.freq != null) t.freq = r.freq; if (r.rts) t.rts = r.rts;
    st.epcs.set(epc, (st.epcs.get(epc) || 0) + r.count);
    if (logOn && run.runRows && run.runRows.length < 500000) run.runRows.push([new Date(r.ts || now).toISOString(), epc, r.tid || '', r.antenna ?? '', r.rssi ?? '', r.freq ?? '', s ? (s.iface === 'sim' ? nameOf(s) : s.host) : '', r.phase ?? '', r.doppler ?? '', run.power ?? r.power ?? '', r.count].join(','));
    if (readLog.length < 200000) readLog.push([new Date(r.ts || now).toISOString(), epc, r.tid || '', r.antenna ?? '', r.rssi ?? '', r.freq ?? '', s ? nameOf(s) : '', r.phase ?? '', r.doppler ?? '', run.power ?? r.power ?? '', r.count].join(','));
  }
};
function readRate() {
  const now = Date.now(); if (!lastRun) return 0;
  const active = (lastRun.activeMs + (run && run.phase === 'on' ? now - run.onSince : 0)) / 1000;
  const W = +O.rwin || 0;
  if (W > 0 && active > W) { while (rateBuf.length && rateBuf[0][0] < now - W * 1000) rateBuf.shift(); return rateBuf.reduce((a, b) => a + b[1], 0) / W; }
  return active > 0 ? totalReads / active : 0;
}

/* ---------- list view ---------- */
const fmtOf = k => { const g = CK[k].fmt; if (!g) return null; return run && !O.hexman ? 'hex' : fmtMode[g]; };
function toiOf(epc) { for (const f of toiFiles) if (f.on && f.map.has(epc)) return f; return null; }
function cellVal(t, k) {
  switch (k) {
    case 'since': return t.lastAbs ? (Date.now() - t.lastAbs) / 1000 : undefined;
    case 'first': return t.first / 1000; case 'last': return t.last / 1000;
    case 'avg': return t.n ? t.sum / t.n : undefined; case 'max': return t.max > -999 ? t.max : undefined; case 'min': return t.min < 999 ? t.min : undefined;
    case 'from': return nameOf(srcById(t.from)) || (lastRun && lastRun.names[t.from]) || '';
    case 'model': return t.tid ? TagDB.tagModel(t.tid) : '';
    case 'rts': return t.rts ? new Date(Math.floor(t.rts / 1000)).toISOString().replace('T', ' ').slice(0, 23) : '';
    default: return t[k];
  }
}
function cellStr(t, k) {
  const v = cellVal(t, k); if (v == null || v === '') return '';
  const f = fmtOf(k); if (f === 'b64') return hex2b64(v);
  if (k === 'first' || k === 'last' || k === 'since' || k === 'avg' || k === 'rssi' || k === 'max' || k === 'min') return fix(v, 3);
  if (k === 'power') return fix(v, 2); if (k === 'phase' || k === 'doppler') return fix(v, 2); if (k === 'freq') return fix(v, 2);
  return String(v);
}
const anyTid = () => [...tags.values()].some(t => t.tid) || (lastRun ? lastRun.parts : participants().map(s => s.id)).some(id => { const s = srcById(id); return s && activeCfg(s).fastId; });
const visCols = () => { const tid = anyTid(); return colOrder.filter(k => colOn[k] && ((k !== 'tid' && k !== 'model') || tid)); };
function rowsSorted() {
  const r = [...tags.values()], k = sort.key, d = sort.dir;
  if (k === 'idx') return d > 0 ? r : r.reverse();
  return r.sort((a, b) => { const x = cellVal(a, k), y = cellVal(b, k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * d; });
}
function shade(t) { if (!t.lastAbs) return ''; const age = Date.now() - t.lastAbs; if (age < 1000) return ''; const k = Math.min(1, (age - 1000) / 14000), v = Math.round(255 - k * 92); return `background:rgb(${v},${v},${v})`; }
function renderList() {
  const cols = visCols();
  $('#thead').innerHTML = '<tr>' + cols.map(k => `<th data-k="${k}" draggable="true" scope="col" ${sort.key === k ? `aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(CK[k].l)}${fmtOf(k) === 'b64' ? ' (B64)' : ''}${sort.key === k && k !== 'idx' ? `<span class="ar">${sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('') + '</tr>';
  const rows = rowsSorted(), lim = 3000, html = [];
  for (const t of rows.slice(0, lim)) {
    const f = toiOf(t.epc);
    html.push(`<tr data-epc="${t.epc}" class="${selected === t.epc ? 'sel' : ''}" style="${shade(t)}">` + cols.map(k => k === 'epc' && f ? `<td class="toi" style="background:${esc(f.colorOf(t.epc))}" title="${esc(f.name)}">${esc(cellStr(t, k))}</td>` : `<td${CK[k].n ? ' class="n"' : ''}>${esc(cellStr(t, k))}</td>`).join('') + '</tr>');
  }
  if (rows.length > lim) html.push(`<tr><td colspan="${cols.length}" style="color:#888">… 仅显示前 ${lim} 行（共 ${rows.length} 个唯一标签，导出 CSV 可查看全部）</td></tr>`);
  $('#tbody').innerHTML = html.join('');
}
/* ---------- table view ---------- */
function tvData() {
  const files = toiFiles.filter(f => f.on), ids = lastRun ? lastRun.parts : participants().map(s => s.id);
  const nm = id => nameOf(srcById(id)) || (lastRun && lastRun.names[id]) || id;
  const inAny = e => files.some(f => f.map.has(e));
  const cnt = (epcs, f) => { let n = 0, reads = 0; for (const [e, c] of epcs) if (f ? f.map.has(e) : !inAny(e)) { n++; reads += c; } return { n, reads }; };
  const all = new Map(); for (const id of ids) for (const [e, c] of (srcStats[id]?.epcs || [])) all.set(e, (all.get(e) || 0) + c);
  return { files, ids, nm, cnt, all };
}
function renderTable() {
  const { files, ids, nm, cnt, all } = tvData(), pct = (n, f) => `${n} (${f.map.size ? (n * 100 / f.map.size).toFixed(1) : '0.0'}%)`;
  let h = '', b = '';
  if (!O.flip) {
    h = `<tr><th>名称</th>${files.map(f => `<th>${esc(f.name)}</th>`).join('')}<th>Strays（游离）</th></tr>`;
    const line = (name, ep, tot) => `<tr class="${tot ? 'tot' : ''}"><td>${esc(name)}</td>${files.map(f => `<td>${pct(cnt(ep, f).n, f)}</td>`).join('')}<td>${cnt(ep, null).n}</td></tr>`;
    b = ids.map(id => line(nm(id), srcStats[id]?.epcs || new Map())).join('') + line('合计', all, true);
  } else {
    h = `<tr class="tv-grp"><th></th>${ids.map(id => `<th colspan="2">${esc(nm(id))}</th>`).join('')}<th colspan="2">合并</th></tr><tr><th>名称</th>${ids.map(() => '<th>唯一标签</th><th>总读取</th>').join('')}<th>唯一标签</th><th>总读取</th></tr>`;
    const line = (name, f) => `<tr><td>${esc(name)}</td>${ids.map(id => { const c = cnt(srcStats[id]?.epcs || new Map(), f); return `<td>${f ? pct(c.n, f) : c.n}</td><td>${c.reads}</td>`; }).join('')}${(() => { const c = cnt(all, f); return `<td>${f ? pct(c.n, f) : c.n}</td><td>${c.reads}</td>`; })()}</tr>`;
    b = files.map(f => line(f.name, f)).join('') + line('Strays（游离）', null);
  }
  $('#thead').innerHTML = h; $('#tbody').innerHTML = b;
}
function renderToiSum() {
  const files = toiFiles.filter(f => f.on), el = $('#toiSum');
  if (!O.toiSum || !files.length) { el.hidden = true; return; }
  const set = new Set(); for (const f of files) for (const e of f.map.keys()) set.add(e);
  const found = [...set].filter(e => tags.has(e)).length;
  el.hidden = false; el.innerHTML = `<table><tr><th>全部文件</th><th>全部文件 %</th><th>总计</th></tr><tr><td>${found} / ${set.size}</td><td>${set.size ? (found * 100 / set.size).toFixed(1) : '0.0'}%</td><td>${tags.size}</td></tr></table>`;
}
function renderBlank() {
  const b = $('#blank'); if (tags.size || run) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = !sources.length ? '尚未添加数据源。点击左侧 <b>数据源 ⊕</b> 添加读写器（无硬件可选“模拟读写器”）。'
    : !participants().length ? '没有已启用且已连接的数据源。请在左侧打开数据源开关。' : '点击 <b>▶</b> 开始盘点。右键列标题可选择显示的列，拖动列标题可调整顺序，右键标签行可访问标签存储或修改 EPC。';
}
let lastFull = 0;
function render(force) {
  const now = Date.now();
  if (run) clockMs = now - run.t0;
  if (view === 'inventory') $('#inv-clock').textContent = clockStr(clockMs);
  if (!force && now - lastFull < 250) return; lastFull = now;
  if (view !== 'inventory') return;
  $('#grid').classList.toggle('tv', O.view === 'table');
  if (O.view === 'table') renderTable(); else renderList();
  renderToiSum(); renderBlank();
  $('#f-uniq').textContent = tags.size; $('#f-rate').textContent = readRate().toFixed(3); $('#scenTxt').textContent = scenText();
  if (run && run.phase === 'on') { const t = (now - lastRun.t0) / 1000; const p = plotPts[plotPts.length - 1]; if (!p || p[1] !== tags.size || t - p[0] > 1) plotPts.push([t, tags.size]); }
  $('#plot').hidden = !O.plot; if (O.plot) drawPlot();
}
function drawPlot() {
  const cv = $('#plotCv'), w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1; if (!w) return;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const L = 40, B = 22, R = 10, T = 6, pw = w - L - R, ph = h - T - B;
  const tmax = Math.max(10, Math.ceil((plotPts.length ? plotPts[plotPts.length - 1][0] : 0) / 10) * 10), ymax = Math.max(10, Math.ceil(tags.size * 1.1 / 10) * 10);
  g.strokeStyle = '#999'; g.lineWidth = 1; g.font = '10px Segoe UI, sans-serif'; g.fillStyle = '#444';
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(L + pw, T + ph); g.stroke();
  for (let i = 0; i <= 10; i++) { const x = L + pw * i / 10; g.fillText(String(Math.round(tmax * i / 10)), x - 4, T + ph + 12); }
  for (let i = 0; i <= 4; i++) { const y = T + ph - ph * i / 4; g.fillText(String(Math.round(ymax * i / 4)), 4, y + 3); g.strokeStyle = '#EEE'; g.beginPath(); g.moveTo(L + 1, y); g.lineTo(L + pw, y); g.stroke(); }
  g.fillText('时间（秒）', L + pw / 2 - 20, h - 1);
  g.save(); g.translate(10, T + ph / 2 + 30); g.rotate(-Math.PI / 2); g.restore();
  g.strokeStyle = '#1E88C8'; g.lineWidth = 1.6; g.beginPath(); let py = T + ph;
  g.moveTo(L, py); for (const [t, n] of plotPts) { const x = L + pw * t / tmax, y = T + ph - ph * n / ymax; g.lineTo(x, py); g.lineTo(x, y); py = y; } g.stroke();
}

/* ---------- grid interactions ---------- */
$('#thead').addEventListener('click', e => { const th = e.target.closest('th[data-k]'); if (!th || O.view === 'table') return; const k = th.dataset.k; sort = sort.key === k ? { key: k, dir: -sort.dir } : { key: k, dir: 1 }; render(true); });
$('#thead').addEventListener('contextmenu', e => { if (O.view === 'table') return; e.preventDefault();
  showMenu(e.clientX, e.clientY, COLS.map(c => ({ l: c.l, ck: !!colOn[c.k], f: () => { colOn[c.k] = !colOn[c.k]; if (!visCols().length) colOn.epc = true; store.set('cols2', colOn); render(true); } })), true); });
let dragK = null;
$('#thead').addEventListener('dragstart', e => { const th = e.target.closest('th[data-k]'); if (!th) return; dragK = th.dataset.k; th.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragK); });
$('#thead').addEventListener('dragover', e => { const th = e.target.closest('th[data-k]'); if (!th || !dragK) return; e.preventDefault(); $$('#thead th').forEach(x => x.classList.toggle('over', x === th)); });
$('#thead').addEventListener('drop', e => { const th = e.target.closest('th[data-k]'); if (!th || !dragK) return; e.preventDefault(); const to = th.dataset.k; if (to !== dragK) { colOrder = colOrder.filter(k => k !== dragK); colOrder.splice(colOrder.indexOf(to), 0, dragK); store.set('colOrder', colOrder); } dragK = null; render(true); });
$('#thead').addEventListener('dragend', () => { dragK = null; $$('#thead th').forEach(x => x.classList.remove('over', 'drag')); });
$('#tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-epc]'); if (!tr) return; selected = tr.dataset.epc; render(true); });
$('#tbody').addEventListener('dblclick', e => { const tr = e.target.closest('tr[data-epc]'); if (tr) openMemory(tags.get(tr.dataset.epc)); });
$('#tbody').addEventListener('contextmenu', e => {
  const tr = e.target.closest('tr[data-epc]'); if (!tr) return; e.preventDefault(); selected = tr.dataset.epc; render(true); const t = tags.get(selected);
  const fm = g => [{ l: '显示为十六进制', ck: fmtMode[g] === 'hex', f: () => setFmt(g, 'hex') }, { l: '显示为 Base64', ck: fmtMode[g] === 'b64', f: () => setFmt(g, 'b64') }];
  showMenu(e.clientX, e.clientY, [{ l: '标签存储访问', f: () => openMemory(t) }, { l: '修改 EPC', f: () => changeEpc(t) }, '-', { l: '复制 EPC', f: () => copyText(t.epc) }, { l: '复制 TID', f: () => copyText(t.tid), dis: !t.tid }, '-', { l: 'EPC', sub: fm('epc') }, { l: 'TID', sub: fm('tid') }, { l: '其他列', sub: fm('other') }]);
});
function setFmt(g, v) { fmtMode[g] = v; store.set('fmt', fmtMode); if (run && !O.hexman) toast('运行中按读写器格式显示；如需立即生效请在设置中启用“手动十六进制 / Base64 格式”'); render(true); }
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('已复制'); } catch (_) { toast('复制失败，请手动选择文本'); } }
async function changeEpc(t) {
  const s = srcById(t.from); if (!s || !rt(s.id).connected) return toast('读取该标签的数据源未连接');
  const v = await dialog(`<h3>修改 EPC</h3><label class="row"><span>当前 EPC:</span><input type="text" class="mono" value="${esc(t.epc)}" readonly></label><label class="row"><span>新 EPC:</span><input type="text" class="mono" id="ce-new" value="${esc(t.epc)}" spellcheck="false"></label><div class="note" id="ce-e"></div><div class="acts"><button class="btn pri" id="ce-ok">确认</button><button class="btn" data-close>取消</button></div>`, () => {
    $('#ce-ok').onclick = () => { const n = clean($('#ce-new').value); if (!n || n.length % 4) { $('#ce-e').textContent = 'EPC 必须为整字（4 位十六进制的倍数）'; return; } if (n.length > 124) { $('#ce-e').textContent = 'EPC 最长 496 位'; return; } closeDialog(n); }; });
  if (!v || v === t.epc) return;
  try { const r = await backendOf(s).api('access', { id: s.id, op: 'writeEpc', targetEpc: t.epc, data: v, password: '', timeout: 5, cfg: wire(s) });
    if (r.ok) toast(`EPC 已修改为 ${v}，重新运行盘点即可看到新 EPC`); else toast('修改失败：' + r.message); } catch (e) { toast(e.message); }
}

/* =====================================================================
   Inventory showcase settings page
   ===================================================================== */
function fillInvSet() {
  $$('[name=iv]').forEach(r => r.checked = r.value === O.view); $('#is-flip').checked = O.flip; $('#is-toisum').checked = O.toiSum;
  $$('[name=rs]').forEach(r => r.checked = r.value === O.scen); $('#is-gpireset').checked = O.gpiReset;
  $('#is-delay').value = O.delay; $('#is-on').value = O.on; $('#is-off').value = O.off; $('#is-beep').checked = O.beep; $('#is-runs').value = O.runs;
  const pl = participants().length ? [...new Set(participants().flatMap(s => txList(infoOf(s))))].sort((a, b) => a - b) : range(10, 33, 0.25);
  $('#is-p0').innerHTML = opts(pl, O.p0, v => v.toFixed(2)); $('#is-p1').innerHTML = opts(pl, O.p1, v => v.toFixed(2)); $('#is-ps').innerHTML = opts(range(0.25, 5, 0.25), O.ps, v => v.toFixed(2));
  $('#is-plot').checked = O.plot; $('#is-hexman').checked = O.hexman; $('#is-reset').checked = O.reset; $$('[name=rst]').forEach(r => r.checked = r.value === O.resetWhen); $('#is-rdur').value = O.rdur; $('#is-rwin').value = O.rwin;
  invSetUI();
}
function invSetUI() {
  const sc = $('[name=rs]:checked')?.value, tl = $('[name=iv]:checked')?.value === 'table';
  $('#is-flip').disabled = !tl;
  ['#is-delay', '#is-on', '#is-off', '#is-beep'].forEach(s => $(s).disabled = !(sc === 'timed' || sc === 'margin'));
  $('#is-runs').disabled = sc !== 'timed'; ['#is-p0', '#is-p1', '#is-ps'].forEach(s => $(s).disabled = sc !== 'margin'); $('#is-gpireset').disabled = sc !== 'gpi';
  $$('[name=rst]').forEach(r => r.disabled = !$('#is-reset').checked); $('#is-rdur').disabled = !$('#is-reset').checked;
  if (sc === 'margin') { const n = Math.max(0, Math.floor((+$('#is-p1').value - +$('#is-p0').value) / +$('#is-ps').value + 1e-9) + 1); $('#is-pinfo').textContent = `共 ${n} 次运行（运行次数由功率范围与步进自动计算）`; } else $('#is-pinfo').textContent = '';
}
$('#v-invset').addEventListener('change', invSetUI);
$('#inv-gear').onclick = () => { fillInvSet(); show('invset'); };
$('#is-cancel').onclick = () => show('inventory');
$('#is-save').onclick = () => {
  const n = {
    view: $('[name=iv]:checked').value, flip: $('#is-flip').checked, toiSum: $('#is-toisum').checked, scen: $('[name=rs]:checked').value, gpiReset: $('#is-gpireset').checked,
    delay: Math.max(0, Math.floor(+$('#is-delay').value || 0)), on: Math.max(1, Math.floor(+$('#is-on').value || 10)), off: Math.max(0, Math.floor(+$('#is-off').value || 0)), beep: $('#is-beep').checked, runs: Math.max(1, Math.floor(+$('#is-runs').value || 1)),
    p0: +$('#is-p0').value, p1: +$('#is-p1').value, ps: +$('#is-ps').value, plot: $('#is-plot').checked, hexman: $('#is-hexman').checked,
    reset: $('#is-reset').checked, resetWhen: $('[name=rst]:checked')?.value || 'initial', rdur: Math.min(999, Math.max(1, Math.floor(+$('#is-rdur').value || 5))), rwin: Math.max(0, Math.floor(+$('#is-rwin').value || 0)),
  };
  const old = O; O = n; const err = n.scen === 'gpi' || n.scen === 'margin' ? validateScenario(participants()) : '';
  if (err) { O = old; dialog(`<h3>无法保存</h3><p>${esc(err)}</p><div class="acts"><button class="btn pri" data-close>确定</button></div>`); return; }
  store.set('inv', O); show('inventory');
};

/* =====================================================================
   Tags of interest
   ===================================================================== */
const PALETTE = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#CDDC39', '#795548'];
let toiFiles = (store.get('toi', []) || []).map(hydrateToi);
let toiView = null;
function hydrateToi(f) { const map = new Map(f.tags); return { ...f, map, colorOf: e => tint(map.get(e) || f.color) }; }
const tint = c => `color-mix(in srgb, ${c} 45%, white)`;
function cssColor(c) { if (!c) return null; c = String(c).trim(); if (/^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) { c = c.replace('#', ''); return '#' + (c.length === 8 ? c.slice(2) : c); } const o = new Option().style; o.color = c; return o.color ? c.toLowerCase() : null; }
function saveToi() { store.set('toi', toiFiles.map(({ id, name, on, color, tags: t }) => ({ id, name, on, color, tags: t }))); }
function renderToi() {
  const cnt = toiFiles.filter(f => f.on).reduce((a, f) => a + f.map.size, 0);
  $('#toiBadge').hidden = !cnt; $('#toiBadge').textContent = cnt;
  $('#toiList').innerHTML = toiFiles.length ? toiFiles.map(f => `<div class="ds" data-t="${f.id}" ${view === 'toi' && toiView === f.id ? 'aria-current="page"' : ''} title="${f.map.size} 个标签"><span class="sw"><input type="checkbox" ${f.on ? 'checked' : ''} aria-label="启用 ${esc(f.name)}"><span></span></span><span class="nm">${esc(f.name)}</span><button class="x" title="移除" aria-label="移除 ${esc(f.name)}">×</button></div>`).join('') : '<div class="empty-s">未载入文件</div>';
}
$('#toiList').addEventListener('click', e => {
  const row = e.target.closest('[data-t]'); if (!row) return; const f = toiFiles.find(x => x.id === row.dataset.t);
  if (e.target.matches('input')) { if (e.target.checked) { const dup = dupEpc(f); if (dup) { e.target.checked = false; return toast(`EPC ${dup.epc} 已存在于已启用的文件“${dup.name}”中，请先停用该文件`); } } f.on = e.target.checked; saveToi(); renderToi(); render(true); return; }
  if (e.target.closest('.sw')) return;
  if (e.target.matches('.x')) { removeToi(f); return; }
  toiView = f.id; show('toi');
});
function dupEpc(f) { for (const o of toiFiles) if (o !== f && o.on) for (const e of f.map.keys()) if (o.map.has(e)) return { epc: e, name: o.name }; return null; }
function removeToi(f) { toiFiles = toiFiles.filter(x => x !== f); saveToi(); renderToi(); if (view === 'toi' && toiView === f.id) show('inventory'); render(true); }
$('#toi-add').onclick = () => $('#toi-file').click();
$('#toi-file').onchange = async e => {
  for (const file of e.target.files) {
    try {
      const txt = await file.text(); let name, list = [], bad = 0;
      const color = PALETTE[toiFiles.length % PALETTE.length];
      if (/\.json$/i.test(file.name) || /^\s*\{/.test(txt)) {
        const j = JSON.parse(txt); if (!Array.isArray(j.Tags)) throw new Error('缺少 Tags 数组'); if (j.Version && j.Version !== '1.0.0') throw new Error(`不支持的 Version：${j.Version}（应为 1.0.0）`);
        name = String(j.Name || file.name.replace(/\.json$/i, ''));
        for (const t of j.Tags) { const epc = clean(t.Epc ?? t.EPC ?? t.epc); if (!epc || !/^[0-9a-f\s]+$/i.test(String(t.Epc ?? t.EPC ?? t.epc))) { bad++; continue; } list.push([epc, cssColor(t.Color ?? t.color) || color]); }
      } else {
        name = file.name.replace(/\.(csv|txt)$/i, '');
        for (const ln of txt.split(/\r?\n/)) { const l = ln.trim(); if (!l || l.startsWith('#')) continue; const [a, ...rest] = l.split(/[,;\t]/); if (/^epc$/i.test(a.trim())) continue;
          if (!/^[0-9a-f\s]+$/i.test(a.trim())) { bad++; continue; } const cm = rest.join(',').match(/color\s*=\s*([^,;]+)/i); list.push([clean(a), (cm && cssColor(cm[1])) || color]); }
      }
      if (!list.length) throw new Error('文件中没有有效的 EPC');
      if (toiFiles.some(f => f.name === name)) throw new Error(`已载入同名关注标签文件“${name}”`);
      const f = hydrateToi({ id: uid(), name, on: true, color, tags: list }); const dup = dupEpc(f); if (dup) { f.on = false; toast(`“${name}”与已启用文件“${dup.name}”有重复 EPC，已载入但未启用`); }
      toiFiles.push(f); saveToi(); if (bad) toast(`“${name}”：跳过 ${bad} 行无效 EPC`);
    } catch (err) { toast(`${file.name}：${err.message}`); }
  }
  e.target.value = ''; renderToi(); render(true);
};
function renderToiView() {
  const f = toiFiles.find(x => x.id === toiView); if (!f) return show('inventory');
  const seen = [...f.map.keys()].filter(e => tags.has(e)).length;
  $('#toi-head').innerHTML = `<span>名称: <b>${esc(f.name)}</b></span><span>标签数: <b>${f.map.size}</b></span><span>本次已读到: <b>${seen}</b></span><span>状态: <b>${f.on ? '已启用' : '未启用'}</b></span>`;
  $('#toi-tbl').innerHTML = '<thead><tr><th>#</th><th>EPC</th><th>颜色</th><th>已读到</th><th>读取次数</th></tr></thead><tbody>' + [...f.map].map(([e, c], i) => { const t = tags.get(e); return `<tr><td class="n">${i + 1}</td><td style="background:${esc(tint(c))}">${e}</td><td>${esc(c)}</td><td>${t ? '✓' : ''}</td><td class="n">${t ? t.count : ''}</td></tr>`; }).join('') + '</tbody>';
}
$('#toi-exp').onclick = () => { const f = toiFiles.find(x => x.id === toiView); if (f) dl(f.name.replace(/[\\/:*?"<>|]+/g, '_') + '.json', JSON.stringify({ Name: f.name, Version: '1.0.0', Tags: [...f.map].map(([Epc, Color]) => ({ Epc, Color })) }, null, 2), 'application/json'); };
$('#toi-rm').onclick = () => { const f = toiFiles.find(x => x.id === toiView); if (f) removeToi(f); };

/* =====================================================================
   Tag memory showcase
   ===================================================================== */
const TM_DEF = { reserved: [0, 4], epc: [2, 6], tid: [0, 6], user: [0, 8] };
let tmBusy = false;
function tmInit() {
  $('#tm-cnt').innerHTML = range(1, 32).map(n => `<option value="${n}">${n}</option>`).join('');
  $('#tm-off').innerHTML = range(0, 255).map(n => `<option value="${n}">${n}</option>`).join('');
  $('#tm-words').innerHTML = range(0, 31).map(i => `<input type="text" maxlength="4" data-w="${i}" placeholder="...." spellcheck="false" aria-label="字 ${i}">`).join('');
  tmBank(true);
}
function tmBank(init) { const [o, c] = TM_DEF[$('#tm-bank').value]; $('#tm-off').value = o; $('#tm-cnt').value = c; tmWords(); }
function tmWords() { const n = +$('#tm-cnt').value; $$('#tm-words input').forEach((w, i) => { w.disabled = i >= n; if (i >= n) w.value = ''; }); tmAsciiFromWords(); }
const b2c = b => (b >= 0x20 && b < 0x7f) || b >= 0xa0 ? String.fromCharCode(b) : '.';
function tmAsciiFromWords() { let s = ''; for (const w of $$('#tm-words input:not(:disabled)')) { const h = clean(w.value); if (h.length !== 4) { s += h ? '..' : ''; continue; } s += b2c(parseInt(h.slice(0, 2), 16)) + b2c(parseInt(h.slice(2), 16)); } $('#tm-ascii').value = s; }
function tmWordsFromAscii() { const s = $('#tm-ascii').value, ws = $$('#tm-words input:not(:disabled)'); ws.forEach((w, i) => { const a = s.charCodeAt(i * 2), b = s.charCodeAt(i * 2 + 1); if (isNaN(a)) { w.value = ''; return; } w.value = ((a & 0xff).toString(16).padStart(2, '0') + (isNaN(b) ? '00' : (b & 0xff).toString(16).padStart(2, '0'))).toUpperCase(); }); }
$('#tm-bank').onchange = () => tmBank(); $('#tm-cnt').onchange = tmWords;
$('#tm-words').addEventListener('input', e => { const w = e.target; w.value = clean(w.value).slice(0, 4); w.classList.remove('x'); tmAsciiFromWords(); });
$('#tm-words').addEventListener('keydown', e => { const w = e.target; if (!w.dataset.w) return; const i = +w.dataset.w, ws = $$('#tm-words input');
  if (e.key === 'ArrowRight' && w.selectionStart === w.value.length && ws[i + 1] && !ws[i + 1].disabled) { ws[i + 1].focus(); e.preventDefault(); }
  if (e.key === 'ArrowLeft' && w.selectionStart === 0 && ws[i - 1]) { ws[i - 1].focus(); e.preventDefault(); } });
$('#tm-words').addEventListener('paste', e => { const t = clean(e.clipboardData.getData('text')); if (t.length <= 4) return; e.preventDefault(); const ws = $$('#tm-words input:not(:disabled)'); let i = +e.target.dataset.w; for (let k = 0; k < t.length && ws[i]; k += 4, i++) ws[i].value = t.substr(k, 4); tmAsciiFromWords(); });
$('#tm-ascii').addEventListener('input', tmWordsFromAscii);
$('#tm-copy').onclick = () => copyText($$('#tm-words input:not(:disabled)').map(w => w.value || '....').join(' '));
function tmSources() { return participants().filter(s => (infoOf(s) || {}).supportsAccess !== false); }
function tmRenderSrc(pref) {
  const list = tmSources(), cur = pref || $('#tm-src').value;
  $('#tm-src').innerHTML = list.length ? list.map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(nameOf(s))}</option>`).join('') : '<option value="">（没有支持标签读写的已连接数据源）</option>';
  $('#tm-srcRow').hidden = list.length === 1;
}
function tmModel() {
  const tid = clean($('#tm-tid').value) || (tags.get(clean($('#tm-epc').value)) || {}).tid;
  $('#tm-model').textContent = tid ? TagDB.tagModel(tid) : '未知标签型号：启用 FAST ID 以识别';
}
$('#tm-tid').addEventListener('input', () => { tmModel(); $('#tm-rtid').checked = !!clean($('#tm-tid').value) && !$('#tm-epc').value; });
$('#tm-epc').addEventListener('input', tmModel);
function openMemory(t) {
  show('memory'); if (!t) return;
  $('#tm-epc').value = t.epc; $('#tm-tid').value = t.tid || ''; $('#tm-repc').checked = true; tmRenderSrc(t.from); tmModel();
  $('#tm-bank').value = 'epc'; $('#tm-off').value = 2; $('#tm-cnt').value = Math.min(32, Math.max(1, t.epc.length / 4)); tmWords();
  tmStatus('', '就绪');
}
function tmStatus(cls, msg) { const s = $('#tm-status'); s.className = 'status' + (cls ? ' ' + cls : ''); s.textContent = msg; }
function tmLock(on) { tmBusy = on; $$('#v-memory input, #v-memory select, #v-memory button, #v-memory textarea').forEach(e => { if (on) { e.dataset.was = e.disabled ? '1' : ''; e.disabled = true; } else e.disabled = e.dataset.was === '1'; }); }
async function tmOp(req, label) {
  const s = srcById($('#tm-src').value); if (!s) { tmStatus('bad', '错误：没有可用的数据源（需要已启用、已连接且支持标签读写）'); return null; }
  const byTid = $('#tm-rtid').checked, epc = clean($('#tm-epc').value), tid = clean($('#tm-tid').value);
  if (byTid ? !tid : !epc) { tmStatus('bad', `错误：请填写完整的${byTid ? ' TID' : ' EPC'}`); return null; }
  const pw = clean($('#tm-pwd').value); if (pw.length > 8) { tmStatus('bad', '错误：访问密码最多 8 位十六进制'); return null; }
  const t0 = performance.now(); tmLock(true); tmStatus('', `${label}中…（${nameOf(s)}，超时 5 秒）`);
  const tick = setInterval(() => $('#tm-clock').textContent = clockStr(performance.now() - t0), 31);
  try { const r = await backendOf(s).api('access', { id: s.id, ...req, targetEpc: byTid ? '' : epc, targetTid: byTid ? tid : '', password: pw, timeout: 5, cfg: wire(s) }); return r; }
  catch (e) { tmStatus('bad', '错误：' + e.message); return null; }
  finally { clearInterval(tick); $('#tm-clock').textContent = clockStr(performance.now() - t0); tmLock(false); tmWords(); }
}
$('#tm-read').onclick = async () => {
  const bank = $('#tm-bank').value, n = +$('#tm-cnt').value, off = +$('#tm-off').value;
  const r = await tmOp({ op: 'read', bank, wordPointer: off, wordCount: n }, '读取'); if (!r) return;
  const ws = $$('#tm-words input');
  if (!r.ok) { ws.slice(0, n).forEach(w => { w.value = 'XXXX'; w.classList.add('x'); }); tmAsciiFromWords(); tmStatus('bad', `读取失败：${r.message}`); return; }
  ws.forEach((w, i) => { w.classList.remove('x'); if (i < n) w.value = (r.data || '').substr(i * 4, 4); }); tmAsciiFromWords();
  if (bank === 'tid' && off === 0 && r.data) { $('#tm-tid').value = $('#tm-tid').value || r.data; tmModel(); }
  tmStatus('ok', `读取成功：已读取 ${n} 个字`);
};
$('#tm-write').onclick = async () => {
  const bank = $('#tm-bank').value, n = +$('#tm-cnt').value, off = +$('#tm-off').value, ws = $$('#tm-words input').slice(0, n);
  if (ws.some(w => clean(w.value).length !== 4)) { tmStatus('bad', `错误：请在全部 ${n} 个字框中填写 4 位十六进制`); ws.forEach(w => w.classList.toggle('x', clean(w.value).length !== 4)); return; }
  if (bank === 'tid' && !confirm('TID 存储区通常为只读，仍要尝试写入？')) return;
  if (bank === 'epc' && off < 2 && !confirm('将覆盖 EPC 存储区的 CRC / PC 字，确定继续？')) return;
  const data = ws.map(w => clean(w.value)).join('');
  const r = await tmOp({ op: $('#tm-block').checked ? 'blockWrite' : 'write', bank, wordPointer: off, data }, '写入'); if (!r) return;
  if (!r.ok) { tmStatus('bad', `写入失败：${r.message}`); return; }
  tmStatus('ok', `写入成功：已写入 ${r.words ?? n} 个字`);
  if (bank === 'epc' && $('#tm-repc').checked && off <= 2 && off + n > 2) { const m = clean($('#tm-epc').value), st = (2 - off) * 4, nh = data.slice(Math.max(0, st)); $('#tm-epc').value = (nh + m.slice(nh.length)).slice(0, m.length); }
};
$('#tm-setpwd').onclick = async () => {
  const v = await ask('设置访问密码', '新访问密码:', '', v => /^[0-9a-f]{8}$/i.test(v) ? '' : '请输入 8 位十六进制'); if (!v) return;
  const r = await tmOp({ op: 'write', bank: 'reserved', wordPointer: 2, data: clean(v) }, '设置访问密码'); if (!r) return;
  if (r.ok) { tmStatus('ok', `访问密码已设置为 ${clean(v)}（保留区字 2–3）`); $('#tm-pwd').value = clean(v); } else tmStatus('bad', `设置访问密码失败：${r.message}`);
};
$('#tm-lock').onclick = async () => { const f = $('#tm-lfield').value, p = $('#tm-lpriv').value; if (/perma/.test(p) && !confirm('永久锁定 / 永久解锁不可撤销，确定继续？')) return;
  const r = await tmOp({ op: 'lock', field: f, privilege: p }, '锁定'); if (r) tmStatus(r.ok ? 'ok' : 'bad', r.ok ? `锁定成功：${f.toUpperCase()} → ${$('#tm-lpriv').selectedOptions[0].text}` : `锁定失败：${r.message}`); };
$('#tm-kill').onclick = async () => { const k = clean($('#tm-kpwd').value); if (!/^[0-9A-F]{1,8}$/.test(k) || !parseInt(k, 16)) return tmStatus('bad', '错误：灭活密码必须为非 0 的 8 位十六进制'); if (!confirm('灭活后标签将永久失效，确定继续？')) return;
  const r = await tmOp({ op: 'kill', password: k }, '灭活'); if (r) tmStatus(r.ok ? 'ok' : 'bad', r.ok ? '灭活成功' : `灭活失败：${r.message}`); };

/* =====================================================================
   Tag logging, updates, about, log drawer
   ===================================================================== */
const LOG_HDR = 'Timestamp,EPC,TID,Antenna,RSSI,Frequency,Hostname,PhaseAngle,DopplerFrequency,Power,ReadCount';
function logHeader(r, extra) {
  const lines = [`# TagScope ${VERSION} inventory log`, `# Run started: ${r.startedAt.toISOString()}  (${r.startedAt.toString()})`, `# Scenario: ${scenText()}${extra ? '  ' + extra : ''}`];
  for (const id of r.parts) { const s = srcById(id); if (!s) continue; const i = infoOf(s) || {}, c = activeCfg(s);
    lines.push(`# Reader: ${nameOf(s)} | host=${s.iface === 'sim' ? 'simulator' : s.host} | interface=${IFN[s.iface]} | model=${i.model || ''} | firmware=${i.firmware || ''} | preset=${s.presets[s.active] ? s.active : 'default'} | antennas=${c.ants} | mode=${c.mode} | session=${c.session} | search=${c.search} | power=${r.power ?? c.power} | fastId=${c.fastId}`); }
  return lines;
}
function flushRunLog(i) {
  if (!run || !store.get('logOn', false)) return;
  const pre = (store.get('logPrefix', 'TagScope') || 'TagScope').replace(/[\\/:*?"<>|]+/g, '_'), st = stamp(run.startedAt), suf = run.n > 1 ? `_run${i}${run.power != null ? '_' + run.power.toFixed(2) + 'dBm' : ''}` : '';
  dl(`${pre}_${st}${suf}.csv`, [...logHeader(run, run.n > 1 ? `run ${i}/${run.n}` : ''), LOG_HDR, ...(run.runRows || [])].join('\n'));
  if (store.get('logUniq', false)) dl(`${pre}_${st}${suf}_unique.csv`, uniqueCsv());
  run.runRows = [];
}
function uniqueCsv() { const cols = visCols().filter(k => k !== 'since'); return [cols.map(k => CK[k].l).join(','), ...rowsSorted().map(t => cols.map(k => { const v = cellStr(t, k); return /[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','))].join('\n'); }
$('#lg-on').onchange = e => store.set('logOn', e.target.checked);
$('#lg-uniq').onchange = e => store.set('logUniq', e.target.checked);
$('#lg-prefix').oninput = e => store.set('logPrefix', e.target.value);
$('#lg-dl').onclick = () => { if (!readLog.length) return toast('暂无读取记录'); dl(`${store.get('logPrefix', 'TagScope') || 'TagScope'}_${stamp()}.csv`, [...(lastRun ? logHeader(lastRun) : []), LOG_HDR, ...readLog].join('\n')); };
$('#lg-dlu').onclick = () => { if (!tags.size) return toast('暂无标签'); dl(`${store.get('logPrefix', 'TagScope') || 'TagScope'}_${stamp()}_unique.csv`, uniqueCsv()); };
function fillLogging() { $('#lg-on').checked = store.get('logOn', false); $('#lg-uniq').checked = store.get('logUniq', false); $('#lg-prefix').value = store.get('logPrefix', 'TagScope'); $('#lg-info').textContent = `当前缓存 ${readLog.length} 条读取记录，${tags.size} 个唯一标签`; }

const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
function bridgeVer() { const b = [...backends.values()].find(x => x.kind === 'bridge' && x.online); return b ? b.version : null; }
function renderUpdates() { $('#up-web').textContent = VERSION; $('#up-br').textContent = bridgeVer() || '未连接'; $('#ab-ver').textContent = VERSION; $('#ab-br').textContent = bridgeVer() || '未连接'; $('#up-auto').checked = store.get('autoUpd', true);
  const bv = bridgeVer(); if (bv && cmpVer(bv, '2.0.0') < 0) { $('#up-msg').textContent = `桥接服务版本 ${bv} 过旧，TagScope ${VERSION} 需要 2.0.0 或更高版本，请下载最新桥接服务。`; } }
async function checkUpdates(manual) {
  try { const r = await fetch('https://raw.githubusercontent.com/duguwuji/tagscope/main/package.json', { cache: 'no-store' }); const j = await r.json(); $('#up-latest').textContent = j.version;
    const old = [VERSION, bridgeVer()].filter(Boolean).some(v => cmpVer(v, j.version) < 0);
    $('#up-msg').textContent = old ? `发现新版本 ${j.version}：网页版刷新即可更新；本地桥接服务请下载最新版本并重新运行 node server.js（预设与设置保存在浏览器中，不受影响）。` : '已是最新版本。';
    if (old && !manual) toast(`TagScope 有新版本 ${j.version}，可在“设置 › 更新”中查看`);
  } catch (e) { if (manual) $('#up-msg').textContent = '检查更新失败：' + e.message; }
}
$('#up-check').onclick = () => checkUpdates(true);
$('#up-auto').onchange = e => store.set('autoUpd', e.target.checked);

const logEl = $('#log'); let logs = [];
function addLog(l) { logs.push(l); if (logs.length > 1000) logs.shift(); if (l.level === 'debug' && !$('#lgDebug').checked) return; appendLog(l); }
function appendLog(l) { const at = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 20; const d = document.createElement('div'); d.className = l.level; const s = l.id && srcById(l.id);
  d.innerHTML = `<span class="t">${new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span> ${s ? '[' + esc(nameOf(s)) + '] ' : ''}${esc(l.msg)}`; logEl.appendChild(d); while (logEl.childElementCount > 1000) logEl.firstChild.remove(); if (at) logEl.scrollTop = logEl.scrollHeight; }
handlers.log = l => { addLog(l); if (l.level === 'error') toast(l.msg); };
$('#logBtn').onclick = () => { $('#drawer').hidden = !$('#drawer').hidden; };
$('#lgClose').onclick = () => $('#drawer').hidden = true;
$('#lgClear').onclick = () => { logs = []; logEl.innerHTML = ''; };
$('#lgDebug').onchange = () => { logEl.innerHTML = ''; logs.filter(l => l.level !== 'debug' || $('#lgDebug').checked).forEach(appendLog); };

/* =====================================================================
   Navigation & init
   ===================================================================== */
function show(v) {
  if (view === 'dscfg' && v !== 'dscfg' && dirty && !confirm('放弃对数据源设置的未保存修改？')) return;
  if (v !== 'dscfg') dirty = false;
  view = v; $$('main > .view').forEach(x => x.hidden = x.id !== 'v-' + v);
  const navV = v === 'invset' ? 'inventory' : v;
  $$('.ni[data-nav]').forEach(b => b.toggleAttribute('aria-current', b.dataset.nav === navV)); $$('.ni[aria-current]').forEach(b => b.setAttribute('aria-current', 'page'));
  renderSources(); renderToi();
  if (v === 'inventory') render(true); if (v === 'memory') { tmRenderSrc(); tmModel(); } if (v === 'logging') fillLogging(); if (v === 'updates' || v === 'about') renderUpdates(); if (v === 'toi') renderToiView();
}
$$('.ni[data-nav]').forEach(b => b.onclick = () => show(b.dataset.nav));
window.addEventListener('beforeunload', e => { if (run) { e.preventDefault(); e.returnValue = ''; } });
tmInit(); renderSources(); renderToi(); renderBridgeTxt(); show('inventory'); setPlay(false);
for (const s of sources) { backendOf(s); if (s.enabled && backendOf(s).kind === 'local') connectSource(s); }
(function loop() { try { render(); } catch (e) { console.error(e); } requestAnimationFrame(loop); })();
if (!CLOUD) backendOf({ iface: 'llrp' }); // local page: always watch the bridge (version / offline banner)
if (store.get('autoUpd', true)) setTimeout(() => checkUpdates(false), 3000);
