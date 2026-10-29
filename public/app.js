// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
'use strict';
const VERSION = '2.0.0';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = s => String(s || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const fix = (v, d = 3) => v == null || v === '' || isNaN(v) ? '' : Number(v).toFixed(d);
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 5000); }
const store = { get(k, d) { try { const v = localStorage.getItem('tagscope.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem('tagscope.' + k, JSON.stringify(v)); } catch (_) { } } };
const CLOUD = !!window.TAGSCOPE_CLOUD || location.protocol === 'file:';
const normUrl = u => { u = String(u || '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u; return u; };
let bridgeUrl = normUrl(store.get('bridge', '')) || 'http://localhost:8080';
const hex2b64 = h => { h = clean(h); if (!h) return ''; let s = ''; for (let i = 0; i + 1 < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16)); return btoa(s); };
function dl(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([type === 'text/csv' ? '\ufeff' + text : text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const stamp = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const clockStr = ms => { ms = Math.max(0, Math.floor(ms)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1760; g.gain.value = .08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close(); }, 160); } catch (_) { } }

/* =====================================================================
   Backends: bridge (node server.js, multi-source) and in-browser simulator
   ===================================================================== */
const handlers = {};
function addrSpace(base) { try { const h = new URL(base).hostname.replace(/^\[|\]$/g, ''); if (!base || h === 'localhost' || /^127\./.test(h) || h === '::1') return null;
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|f[cd]|fe80:)/i.test(h) || /\.local$/i.test(h) ? 'local' : null; } catch (_) { return null; } }
async function xfetch(url, opt, space) { if (space && location.protocol === 'https:') { try { return await fetch(url, { ...opt, targetAddressSpace: space }); } catch (e) { if (!/targetAddressSpace|enum/i.test(e.message)) throw e; } } return fetch(url, opt); }
const backends = new Map();
function makeBridge(base) {
  const me = { kind: 'bridge', base, online: null, version: null, closed: false, ctl: null }, space = CLOUD ? addrSpace(base) : null;
  me.api = async (p, b) => { let r;
    try { r = await xfetch(base + '/api/' + p, { method: b === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }, space); }
    catch (e) { setOnline(me, false); throw new Error(`无法连接桥接服务 ${base || location.origin}，请确认已运行 node server.js`); }
    const j = await r.json().catch(() => ({ error: r.status + ' ' + r.statusText })); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
  me.open = async () => { while (!me.closed) { me.ctl = new AbortController();
    try { const r = await xfetch(base + '/api/events', { headers: { Accept: 'text/event-stream' }, cache: 'no-store', signal: me.ctl.signal }, space); if (!r.ok || !r.body) throw new Error(r.status);
      const rd = r.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += value; let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = '';
          for (const ln of blk.split('\n')) { if (ln.startsWith('event:')) ev = ln.slice(6).trim(); else if (ln.startsWith('data:')) data += ln.slice(5).trim(); }
          if (!data || !handlers[ev]) continue; const d = JSON.parse(data); if (ev === 'hello') { me.version = d.version || '1.x'; setOnline(me, true); } handlers[ev](d, me); } } }
    catch (e) { if (me.closed) return; }
    setOnline(me, false); await sleep(3000); } };
  me.close = () => { me.closed = true; me.ctl && me.ctl.abort(); };
  me.open();
  return me;
}
function makeLocal() {
  const me = { kind: 'local', online: true, version: VERSION, sims: new Map(), batches: new Map() };
  const flush = () => { for (const [id, b] of me.batches) { if (!b.map.size) continue; const reads = [...b.map.values()]; b.map = new Map(); handlers.tags({ id, reads, total: b.n, ts: Date.now() }, me); b.n = 0; } };
  setInterval(flush, 200);
  const onTag = (id, t) => { let b = me.batches.get(id); if (!b) me.batches.set(id, b = { map: new Map(), n: 0 }); b.n += t.count || 1; const k = t.epc + '|' + t.antenna, e = b.map.get(k);
    if (!e) b.map.set(k, { ...t, maxRssi: t.rssi, minRssi: t.rssi, rssiSum: t.rssi ?? 0, rssiN: t.rssi != null ? 1 : 0 });
    else { e.count += t.count || 1; e.rssi = t.rssi; e.rssiSum += t.rssi; e.rssiN++; e.maxRssi = Math.max(e.maxRssi, t.rssi); e.minRssi = Math.min(e.minRssi, t.rssi); for (const f of ['phase', 'doppler', 'channel', 'freq', 'tid', 'pc', 'rts', 'power']) if (t[f] != null) e[f] = t[f]; e.ts = t.ts; } };
  const st = (id, s) => ({ id, connected: !!s, running: !!(s && s.running), info: s ? s.info : null, driver: 'sim' });
  me.api = async (p, b = {}) => {
    const s = me.sims.get(b.id);
    switch (p) {
      case 'state': return { version: VERSION, sources: Object.fromEntries([...me.sims.keys()].map(id => [id, st(id, me.sims.get(id))])) };
      case 'connect': { if (s) s.disconnect(); const sim = new TagScopeSim((ev, ...a) => {
          if (ev === 'tag') onTag(b.id, a[0]); else if (ev === 'log') handlers.log({ id: b.id, level: a[0], msg: a[1], ts: Date.now() });
          else if (ev === 'rospec') handlers.rospec({ id: b.id, ev: a[0], ts: Date.now() }); else if (ev === 'gpi') handlers.gpi({ id: b.id, ...a[0], ts: Date.now() }); });
        await sleep(250); sim.connect({ simTags: b.simTags, host: 'browser-sim' }); me.sims.set(b.id, sim); handlers.log({ id: b.id, level: 'info', msg: `已连接：${sim.info.model}`, ts: Date.now() }); return st(b.id, sim); }
      case 'disconnect': if (s) { s.stop(); me.sims.delete(b.id); } return st(b.id, null);
      case 'start': if (!s) throw new Error('数据源未连接'); s.start(b.cfg); return st(b.id, s);
      case 'stop': if (s) s.stop(); return st(b.id, s);
      case 'access': if (!s) throw new Error('数据源未连接'); return s.accessOp(b);
      case 'gpo': if (!s) throw new Error('数据源未连接'); return s.setGpo(b.port, b.state);
      case 'gpi': if (!s) throw new Error('数据源未连接'); s.setGpi(b.port, b.level); return { port: b.port, level: b.level };
    }
    throw new Error('未知操作 ' + p);
  };
  return me;
}
function backendOf(src) {
  const key = CLOUD && src.iface === 'sim' ? 'local' : CLOUD ? normUrl(src.bridge || bridgeUrl) : '';
  if (!backends.has(key)) backends.set(key, key === 'local' ? makeLocal() : makeBridge(key));
  return backends.get(key);
}
function setOnline(be, on) {
  if (be.online === on) return; be.online = on;
  for (const s of sources) if (backendOf(s) === be) { if (!on) { const r = rt(s.id); if (r.connected) { r.connected = false; r.running = false; } r.err = '桥接服务不可达'; } }
  if (on) for (const s of sources) if (backendOf(s) === be && s.enabled) { const r = rt(s.id); r.err = ''; }
  renderSources(); renderOffline(); renderBridgeTxt();
}
function renderOffline() {
  const bad = [...backends.values()].filter(b => b.kind === 'bridge' && b.online === false && sources.some(s => s.enabled && backendOf(s) === b));
  const o = $('#offline'); if (!bad.length) { o.hidden = true; return; }
  o.innerHTML = CLOUD ? `无法连接 TagScope 桥接服务（<span class="mono">${esc(bad.map(b => b.base).join('、'))}</span>）。请在可访问读写器的电脑上运行 <b>node server.js</b> 并保持窗口打开；如浏览器询问是否允许访问本地网络 / 本设备上的应用，请选择“允许”。仅体验界面可添加“模拟读写器”数据源。`
    : '与 TagScope 桥接服务的连接已断开，正在重试…'; o.hidden = false;
}
function renderBridgeTxt() { const b = [...backends.values()].find(x => x.kind === 'bridge'); $('#bridgeTxt').textContent = b ? (b.online ? '桥接 ' + (b.version || '') : '桥接离线') : (CLOUD ? '网页版' : ''); }

/* =====================================================================
   Data sources
   ===================================================================== */
let sources = store.get('sources', null);
if (!sources) { // migrate v1 single source
  const old = store.get('source', null); sources = [];
  if (old && old.host !== undefined) sources.push({ id: uid(), host: old.host || (old.driver === 'sim' ? 'simulator' : ''), nick: old.nick || '', iface: old.driver || 'llrp', port: old.port || '', tls: !!old.tls, ins: old.insecure !== false, cred: !!old.user, user: old.user || '', pass: old.pass || '', simTags: old.simTags || 40, enabled: false, presets: {}, active: 'default' });
}
const runtime = {};
const rt = id => runtime[id] || (runtime[id] = { connected: false, running: false, info: null, err: '', connecting: false });
const srcById = id => sources.find(s => s.id === id);
const nameOf = s => s ? (s.nick || s.host || '模拟读写器') : '';
const infoOf = s => rt(s.id).info || s.lastInfo || null;
function saveSources() { store.set('sources', sources); }
let view = 'inventory', cfgSrc = null;

function renderSources() {
  const el = $('#dsList');
  if (!sources.length) { el.innerHTML = '<div class="empty-s">点击 ⊕ 添加读写器</div>'; return; }
  el.innerHTML = sources.map(s => { const r = rt(s.id), i = infoOf(s);
    const tip = [`主机名: ${s.iface === 'sim' ? '模拟器' : s.host}`, `接口: ${IFN[s.iface]}`, i ? `型号: ${i.model}` : '', i && i.region ? `区域: ${i.region}` : '', r.err ? `错误: ${r.err}` : r.connecting ? '正在连接…' : r.running ? '正在盘点' : r.connected ? '已连接' : '未连接'].filter(Boolean).join('\n');
    return `<div class="ds${r.err && s.enabled ? ' bad' : ''}" data-id="${s.id}" title="${esc(tip)}" ${view === 'dscfg' && cfgSrc === s.id ? 'aria-current="page"' : ''}>
      <span class="sw"><input type="checkbox" ${s.enabled ? 'checked' : ''} ${r.connecting ? 'disabled' : ''} aria-label="启用 ${esc(nameOf(s))}"><span></span></span>
      <span class="nm">${esc(nameOf(s))}${r.connecting ? ' …' : ''}</span>
      ${r.err && s.enabled && !r.connecting ? '<button class="retry" title="重新连接">重试</button>' : ''}
      <button class="x" title="删除数据源" aria-label="删除 ${esc(nameOf(s))}">×</button></div>`; }).join('');
}
const IFN = { llrp: 'LLRP', rest: 'IoT（REST）', sim: '模拟器' };
$('#dsList').addEventListener('click', e => {
  const row = e.target.closest('.ds'); if (!row) return; const s = srcById(row.dataset.id);
  if (e.target.matches('input')) { toggleSource(s, e.target.checked); return; }
  if (e.target.closest('.sw')) return;
  if (e.target.matches('.x')) { deleteSource(s); return; }
  if (e.target.matches('.retry')) { connectSource(s); return; }
  openCfg(s.id);
});
$('#dsList').addEventListener('contextmenu', e => {
  const row = e.target.closest('.ds'); if (!row) return; e.preventDefault(); const s = srcById(row.dataset.id);
  showMenu(e.clientX, e.clientY, [{ l: '编辑数据源', f: () => openAdd(s) }, { l: '设备信息', f: () => deviceInfo(s), dis: !infoOf(s) }, '-', { l: rt(s.id).connected ? '断开连接' : '连接', f: () => rt(s.id).connected ? toggleSource(s, false) : toggleSource(s, true) }, { l: '删除数据源', f: () => deleteSource(s) }]);
});
async function toggleSource(s, on) {
  s.enabled = on; saveSources();
  if (on) await connectSource(s); else { await disconnectSource(s); rt(s.id).err = ''; }
  renderSources(); renderOffline(); refreshParticipants();
}
function connArgs(s) {
  let host = s.host.trim(), port = s.port; const m = host.match(/^\[(.+)\]:(\d+)$/) || host.match(/^([^:\[\]]+):(\d+)$/); if (m) { host = m[1]; port = port || m[2]; } host = host.replace(/^\[|\]$/g, '');
  return { id: s.id, driver: s.iface, host, port: +port || undefined, tls: s.tls, insecure: s.ins, user: s.cred ? s.user : undefined, pass: s.cred ? s.pass : undefined, simTags: s.simTags };
}
async function connectSource(s) {
  const r = rt(s.id); if (r.connecting) return; r.connecting = true; r.err = ''; renderSources();
  try { const st = await backendOf(s).api('connect', connArgs(s)); applySrcState(st); }
  catch (e) { r.err = e.message; r.connected = false; addLog({ id: s.id, level: 'error', msg: e.message, ts: Date.now() }); toast(`${nameOf(s)}：${e.message}`); }
  finally { r.connecting = false; renderSources(); renderOffline(); if (view === 'dscfg' && cfgSrc === s.id) renderCfgHead(); }
}
async function disconnectSource(s) {
  const r = rt(s.id); if (!r.connected) return;
  try { applySrcState(await backendOf(s).api('disconnect', { id: s.id })); } catch (e) { r.connected = false; }
}
function applySrcState(st) {
  const s = srcById(st.id); if (!s) return; const r = rt(st.id), was = r.connected;
  r.connected = !!st.connected; r.running = !!st.running;
  if (st.info) { r.info = st.info; s.lastInfo = st.info; saveSources(); }
  if (was && !r.connected && s.enabled) { r.err = r.err || '连接已断开'; if (run && run.parts.includes(s.id)) addLog({ id: s.id, level: 'warn', msg: '数据源在运行中断开', ts: Date.now() }); }
  if (r.connected) r.err = '';
  renderSources();
}
handlers.state = (st) => applySrcState(st);
handlers.hello = (d, be) => {
  for (const s of sources) if (backendOf(s) === be) {
    const st = d.sources && d.sources[s.id];
    if (st) applySrcState(st); else { const r = rt(s.id); r.connected = false; r.running = false; if (s.enabled && !r.connecting) connectSource(s); }
  }
  renderUpdates();
};
async function deleteSource(s) {
  if (!confirm(`删除数据源“${nameOf(s)}”？其预设也会一并删除。`)) return;
  await disconnectSource(s).catch(() => { });
  sources = sources.filter(x => x !== s); delete runtime[s.id]; saveSources();
  if (cfgSrc === s.id) show('inventory'); renderSources(); renderOffline(); refreshParticipants();
}

/* ---------- add / edit page ---------- */
let editSrc = null;
function daUI() {
  const d = $('#da-if').value;
  $$('.da-rest').forEach(e => e.hidden = d !== 'rest'); $$('.da-sim').forEach(e => e.hidden = d !== 'sim'); $$('.da-nsim').forEach(e => e.hidden = d === 'sim');
  $$('.da-bridge').forEach(e => e.hidden = !CLOUD || d === 'sim'); $$('.da-cr').forEach(e => e.hidden = d !== 'rest' || !$('#da-cred').checked);
  $('#da-port').placeholder = d === 'rest' ? ($('#da-tls').checked ? '443' : '80') : '5084';
  $('#da-host').disabled = d === 'sim'; if (d === 'sim' && !$('#da-host').value) $('#da-host').value = 'simulator'; else if (d !== 'sim' && $('#da-host').value === 'simulator') $('#da-host').value = '';
}
['#da-if', '#da-tls', '#da-cred'].forEach(s => $(s).addEventListener('change', daUI));
$('#da-advT').onclick = () => { const p = $('#da-adv'); p.hidden = !p.hidden; $('#da-advT .car').textContent = p.hidden ? '▼' : '▲'; };
function openAdd(s) {
  editSrc = s || null;
  $('#da-title').textContent = s ? '编辑数据源' : '添加数据源'; $('#da-ok').textContent = s ? '保存' : '添加数据源';
  const v = s || { host: '', nick: '', iface: CLOUD ? 'sim' : 'llrp', port: '', tls: true, ins: true, cred: false, user: '', pass: '', simTags: 40 };
  $('#da-host').value = v.host; $('#da-nick').value = v.nick; $('#da-if').value = v.iface; $('#da-port').value = v.port || ''; $('#da-tls').checked = !!v.tls; $('#da-ins').checked = v.ins !== false;
  $('#da-cred').checked = !!v.cred; $('#da-user').value = v.user || ''; $('#da-pass').value = v.pass || ''; $('#da-simn').value = v.simTags || 40; $('#da-bridge').value = v.bridge || bridgeUrl;
  $('#da-herr').hidden = $('#da-nerr').hidden = true; $('#da-if').disabled = !!s;
  daUI(); show('dsadd'); setTimeout(() => $('#da-host').focus(), 0);
}
$('#ds-add').onclick = () => openAdd(null);
$('#da-cancel').onclick = () => show('inventory');
$('#da-ok').onclick = async () => {
  const iface = $('#da-if').value, host = $('#da-host').value.trim(), nick = $('#da-nick').value.trim();
  $('#da-herr').hidden = !!host || iface === 'sim'; $('#da-host').classList.toggle('inv', !host && iface !== 'sim');
  const dup = nick && sources.some(x => x !== editSrc && nameOf(x).toLowerCase() === nick.toLowerCase()); $('#da-nerr').hidden = !dup;
  if ((!host && iface !== 'sim') || dup) return;
  const v = { host: host || 'simulator', nick: nick || (iface === 'sim' ? uniqueNick('模拟读写器') : ''), iface, port: $('#da-port').value, tls: $('#da-tls').checked, ins: $('#da-ins').checked, cred: $('#da-cred').checked, user: $('#da-user').value, pass: $('#da-pass').value, simTags: +$('#da-simn').value || 40 };
  if (CLOUD && iface !== 'sim') { v.bridge = normUrl($('#da-bridge').value) || 'http://localhost:8080'; bridgeUrl = v.bridge; store.set('bridge', bridgeUrl); }
  let s = editSrc;
  if (s) { const reconnect = rt(s.id).connected; if (reconnect) await disconnectSource(s); Object.assign(s, v); saveSources(); renderSources(); if (s.enabled) await connectSource(s); }
  else { s = { id: uid(), ...v, enabled: true, presets: {}, active: 'default' }; sources.push(s); saveSources(); renderSources(); show('inventory'); await connectSource(s); if (rt(s.id).err) s.enabled = true; saveSources(); refreshParticipants(); return; }
  show('inventory'); refreshParticipants();
};
function uniqueNick(b) { let n = b, i = 2; while (sources.some(s => nameOf(s) === n)) n = `${b} ${i++}`; return n; }

/* ---------- device information ---------- */
function infoKv(s) {
  const i = infoOf(s) || {}, r = rt(s.id), ants = (i.antennas || []).map(a => `${a.id}${a.connected === false ? '✗' : ''}`).join(', ');
  const kv = [['昵称', nameOf(s)], ['主机名', s.iface === 'sim' ? '（模拟器）' : s.host], ['接口', IFN[s.iface] + (i.impinjExtensions ? '（Impinj 扩展）' : '')], ['状态', r.connected ? (r.running ? '盘点中' : '已连接') : (r.err || '未连接')],
    ['制造商', i.manufacturer], ['型号', i.model], ['序列号', i.serial], ['固件版本', i.firmware], ['区域', i.region], ['天线端口', i.antennaCount ? `${i.antennaCount}（${ants}）` : ''],
    ['发射功率范围', i.txPowerMin != null ? `${i.txPowerMin} – ${i.txPowerMax} dBm` : ''], ['RF 模式数', i.modes ? i.modes.length : ''], ['GPI / GPO', i.gpi != null ? `${i.gpi} / ${i.gpo}` : ''], ['频道数', i.channels]];
  return kv.filter(x => x[1] !== undefined && x[1] !== '' && x[1] !== null).map(([k, v]) => `<span>${esc(k)}:</span><span>${esc(v)}</span>`).join('');
}
function deviceInfo(s) { dialog(`<h3>设备信息</h3><div class="kv">${infoKv(s)}</div><div class="acts"><button class="btn pri" data-close>关闭</button></div>`); }

/* ---------- menus & dialogs ---------- */
function menuHtml(items) { return items.map((it, i) => it === '-' ? '<hr>' : it.sub ? `<div class="has"><button type="button">${esc(it.l)}</button><div class="menu">${menuHtml(it.sub)}</div></div>` : `<button type="button" data-i="${it._i}" ${it.dis ? 'disabled' : ''}><span class="ck">${it.ck ? '✓' : ''}</span>${esc(it.l)}</button>`).join(''); }
function showMenu(x, y, items, keep) {
  const flat = []; const walk = a => a.forEach(it => { if (it && it !== '-') { if (it.sub) walk(it.sub); else { it._i = flat.length; flat.push(it); } } }); walk(items);
  const m = $('#menu'); m.innerHTML = menuHtml(items); m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.min(x, innerWidth - w - 8) + 'px'; m.style.top = Math.min(y, innerHeight - h - 8) + 'px';
  m.onclick = e => { const b = e.target.closest('button[data-i]'); if (!b || b.disabled) return; const it = flat[+b.dataset.i]; if (!keep) hideMenu(); it.f && it.f(); if (keep) { it.ck = !it.ck; b.querySelector('.ck').textContent = it.ck ? '✓' : ''; } };
}
function hideMenu() { $('#menu').hidden = true; }
document.addEventListener('mousedown', e => { if (!e.target.closest('#menu')) hideMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideMenu(); if (!$('#dlg').hidden) closeDialog(); } });
let dlgResolve = null;
function dialog(html, onOpen) { $('#dlgBox').innerHTML = html; $('#dlg').hidden = false; $$('#dlgBox [data-close]').forEach(b => b.onclick = closeDialog); onOpen && onOpen($('#dlgBox')); const f = $('#dlgBox input:not([readonly]),#dlgBox button.pri'); f && f.focus(); return new Promise(r => dlgResolve = r); }
function closeDialog(v) { $('#dlg').hidden = true; if (dlgResolve) { const r = dlgResolve; dlgResolve = null; r(v instanceof Event ? undefined : v); } }
function ask(title, label, value, check) {
  return dialog(`<h3>${esc(title)}</h3><label class="row"><span>${esc(label)}</span><input type="text" id="ask-v" value="${esc(value || '')}" spellcheck="false"></label><div class="err note" id="ask-e" style="color:var(--err)"></div><div class="acts"><button class="btn pri" id="ask-ok">确定</button><button class="btn" data-close>取消</button></div>`, box => {
    const ok = () => { const v = $('#ask-v').value.trim(), e = check ? check(v) : ''; if (e) { $('#ask-e').textContent = e; return; } closeDialog(v); };
    $('#ask-ok').onclick = ok; $('#ask-v').onkeydown = e => { if (e.key === 'Enter') ok(); }; setTimeout(() => $('#ask-v').select(), 0);
  });
}

/* =====================================================================
   Presets & data source configuration
   ===================================================================== */
const FALLBACK_MODES = [[0, 'Max Throughput'], [1, 'Hybrid Mode'], [2, 'Dense Reader (M=4)'], [3, 'Dense Reader (M=8)'], [4, 'Max Miller'], [1000, 'Auto Set Dense Reader'], [1002, 'Auto Set Dense Reader Deep Scan'], [1003, 'Auto Set Static Fast'], [1004, 'Auto Set Static Dense Reader'],
  [100, 'Max Throughput (R700 FCC)'], [120, 'Hybrid (R700 FCC)'], [142, 'Dense Reader M4 (R700 FCC)'], [185, 'Dense Reader M8 (R700 FCC)'], [140, 'Max Miller (R700 FCC)'], [1110, 'Deep Scan (R700 FCC)'], [1111, 'Static Fast (R700 FCC)'], [1112, 'Static DRM (R700 FCC)']].map(([id, l]) => ({ id, label: `${id} - ${l}` }));
const range = (a, b, st = 1) => { const r = []; for (let v = a; v <= b + 1e-9; v += st) r.push(+v.toFixed(2)); return r; };
const modesOf = i => i && i.modes && i.modes.length ? i.modes : FALLBACK_MODES;
const txList = i => i && i.txPower && i.txPower.length ? [...new Set(i.txPower.map(Number))].sort((a, b) => a - b) : range(10, 33, 0.25);
const rxList = i => i && i.rxSensitivity && i.rxSensitivity.length ? [...new Set(i.rxSensitivity.map(r => Number(r.dbm)))].sort((a, b) => a - b) : range(-80, -30, 1);
function defaultPreset(i) {
  i = i || {}; const n = i.antennaCount || 4, ids = modesOf(i).map(m => m.id), tx = txList(i), rx = rxList(i);
  const mode = ids.includes(1002) ? 1002 : ids.includes(1110) ? 1110 : ids[0];
  return { ants: range(1, n).join(', '), mode, search: 2, fastId: false, pop: 32, session: 2, phase: true, doppler: false,
    power: tx.includes(30) ? 30 : tx[tx.length - 1], rx: rx[0], maxSens: true, per: {}, gpi: {}, filters: [], ldc: { enabled: false, emptyTimeout: 500, pingInterval: 200 } };
}
const clone = o => JSON.parse(JSON.stringify(o));
function presetCfg(s, name) { const d = defaultPreset(infoOf(s)); if (!name || name === 'default' || !s.presets[name]) return d; return { ...d, ...clone(s.presets[name]) }; }
const activeCfg = s => presetCfg(s, s.presets[s.active] ? s.active : 'default');
function antList(txt, max = 64) { return [...new Set(String(txt).split(/[\s,，;]+/).map(Number).filter(n => n > 0 && n <= max))].sort((a, b) => a - b); }
function gpiTriggers(c) { const g = c.gpi || {}; let start = null, stop = null; for (const [p, v] of Object.entries(g)) { if (v.start) start = { port: +p, level: v.startLvl || 'high' }; if (v.stop) stop = { port: +p, level: v.stopLvl || 'low' }; } return { start, stop }; }
function wire(s, ov = {}) {
  const c = activeCfg(s), i = infoOf(s) || {}, max = Math.max(i.antennaCount || 4, 4), on = antList(c.ants, 64);
  const ids = [...new Set([...range(1, max), ...on])];
  const rxv = r => r === '' || r == null ? '' : +r;
  return {
    antennas: ids.map(id => { const p = c.per[id] || {}; return { id, enabled: on.includes(id), txDbm: ov.power != null ? +ov.power : +(p.tx ?? c.power), rxDbm: c.maxSens && p.rx == null ? rxv(rxList(i)[0]) : rxv(p.rx ?? c.rx) }; }),
    mode: +c.mode, session: +c.session, searchMode: ov.searchMode != null ? ov.searchMode : +c.search, tagPopulation: +c.pop || 32, fastId: !!c.fastId, phase: !!c.phase, doppler: !!c.doppler,
    filters: (c.filters || []).filter(f => clean(f.mask)).map(f => ({ bank: f.bank, pointer: +f.pointer || 0, mask: clean(f.mask), bits: f.bits === '' || f.bits == null ? '' : +f.bits, match: f.match, miss: f.miss })),
    gpi: ov.gpi ? gpiTriggers(c) : null, ldc: c.ldc && c.ldc.enabled ? c.ldc : null, quiet: !!ov.quiet,
  };
}

let viewP = 'default', draft = null, dirty = false;
function openCfg(id) { cfgSrc = id; const s = srcById(id); viewP = s.presets[s.active] ? s.active : 'default'; loadDraft(); show('dscfg'); tab('inv'); }
function loadDraft() { const s = srcById(cfgSrc); draft = presetCfg(s, viewP); dirty = false; fillCfg(); }
function renderCfgHead() {
  const s = srcById(cfgSrc); if (!s) return; const i = infoOf(s) || {}, r = rt(s.id);
  $('#dc-head').innerHTML = [['主机名', s.iface === 'sim' ? '模拟器' : s.host], ['接口', IFN[s.iface]], ['型号', i.model || '—'], ['昵称', nameOf(s)], ['区域', i.region || '—'], ['状态', r.connected ? (r.running ? '盘点中' : '已连接') : r.err ? '不可达' : '未连接']].map(([k, v]) => `<span>${k}: <b>${esc(v)}</b></span>`).join('');
  $('#dc-info').innerHTML = infoKv(s);
}
function opts(list, val, fmt = v => v) { return list.map(v => `<option value="${v}" ${+v === +val ? 'selected' : ''}>${fmt(v)}</option>`).join(''); }
function fillCfg() {
  const s = srcById(cfgSrc), i = infoOf(s) || {}, c = draft, tx = txList(i), rx = rxList(i);
  renderCfgHead();
  const names = ['default', ...Object.keys(s.presets)], act = s.presets[s.active] ? s.active : 'default';
  $('#dc-preset').innerHTML = names.map(n => `<option value="${esc(n)}" ${n === viewP ? 'selected' : ''} ${n === act ? 'class="act" style="font-weight:700"' : ''}>${esc(n)}${n === act ? '（当前）' : ''}</option>`).join('');
  $('#dc-del').disabled = viewP === 'default';
  $('#dc-ants').value = c.ants; $('#dc-hub').textContent = (i.antennaCount || 0) > 4 && /R[47]\d0|R700|R420/.test(i.model || '') ? 'Antenna Hub' : '';
  const ml = modesOf(i); if (!ml.some(m => +m.id === +c.mode)) ml.push({ id: c.mode, label: `${c.mode} - 自定义` });
  $('#dc-mode').innerHTML = ml.map(m => `<option value="${m.id}" ${+m.id === +c.mode ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  $('#dc-search').value = c.search; $('#dc-search').disabled = s.iface === 'llrp' && i.impinjExtensions === false;
  $('#dc-fastid').checked = !!c.fastId; $('#dc-pop').value = c.pop; $('#dc-ses').value = c.session; $('#dc-phase').checked = !!c.phase; $('#dc-dop').checked = !!c.doppler;
  $('#dc-dop').disabled = i.supportsDoppler === false;
  $('#dc-pwr').innerHTML = opts(tx, c.power, v => v.toFixed(2)); $('#dc-rx').innerHTML = opts(rx, c.rx); $('#dc-maxs').checked = !!c.maxSens; $('#dc-rx').disabled = !!c.maxSens;
  const n = Math.max(i.antennaCount || 4, ...antList(c.ants));
  $('#dc-antTbl').innerHTML = '<b>天线</b><b>发射功率 (dBm)</b><b>接收灵敏度 (dBm)</b>' + range(1, n).map(a => { const p = c.per[a] || {}; return `<span>天线 ${a}</span><select data-a="${a}" data-k="tx">${opts(tx, p.tx ?? c.power, v => v.toFixed(2))}</select><select data-a="${a}" data-k="rx" ${c.maxSens && p.rx == null ? 'disabled' : ''}>${opts(rx, p.rx ?? (c.maxSens ? rx[0] : c.rx))}</select>`; }).join('');
  const gp = i.gpi || 0;
  $('#dc-gpi').innerHTML = gp ? '<tr><th>GPI 端口</th><th>启动</th><th>电平</th><th>停止</th><th>电平</th></tr>' + range(1, gp).map(p => { const g = (c.gpi || {})[p] || {}; return `<tr data-p="${p}"><td>${p}</td><td><input type="checkbox" data-k="start" ${g.start ? 'checked' : ''} aria-label="GPI ${p} 启动"></td><td><select data-k="startLvl"><option value="low">低</option><option value="high" ${g.startLvl !== 'low' ? 'selected' : ''}>高</option></select></td><td><input type="checkbox" data-k="stop" ${g.stop ? 'checked' : ''} aria-label="GPI ${p} 停止"></td><td><select data-k="stopLvl"><option value="low" ${g.stopLvl !== 'high' ? 'selected' : ''}>低</option><option value="high" ${g.stopLvl === 'high' ? 'selected' : ''}>高</option></select></td></tr>`; }).join('') : '';
  $('#dc-gpinote').textContent = gp ? 'GPI 触发仅在盘点展示的“GPI 触发”运行场景中生效。' : (s.iface === 'rest' ? 'IoT 接口暂不支持 GPI 触发。' : '该设备未报告 GPI 端口。');
  renderFilters();
  $('#dc-ldc').checked = !!(c.ldc && c.ldc.enabled); $('#dc-ldcE').value = c.ldc ? c.ldc.emptyTimeout : 500; $('#dc-ldcP').value = c.ldc ? c.ldc.pingInterval : 200;
  [...$$('#dc-ldc,#dc-ldcE,#dc-ldcP')].forEach(e => e.disabled = s.iface === 'rest');
  // diagnostics
  const go = i.gpo || 0;
  $('#dc-gpo').innerHTML = go && rt(s.id).connected ? range(1, go).map(p => `<label><span class="sw"><input type="checkbox" data-gpo="${p}"><span></span></span>GPO ${p}</label>`).join('') : `<span class="hint">${rt(s.id).connected ? '该设备没有可控制的 GPO 端口' : '连接数据源后可控制 GPO'}</span>`;
  $('#dc-simgpiP').hidden = s.iface !== 'sim';
  $('#dc-simgpi').innerHTML = range(1, gp || 4).map(p => `<label><span class="sw"><input type="checkbox" data-gpi="${p}"><span></span></span>GPI ${p}</label>`).join('');
  validateGpi();
}
const ACTS = [['select', '选择 (Select)'], ['nothing', '无动作 (Do Nothing)'], ['unselect', '取消选择 (Unselect)']];
function renderFilters() {
  const fs = draft.filters || [];
  $('#dc-flts').innerHTML = fs.map((f, k) => { const bad = f.match === f.miss; const auto = clean(f.mask).length * 4;
    return `<div class="flt" data-f="${k}"><h5>过滤器 ${k + 1}<span class="sp"></span><button class="btn sm" data-rm="${k}">移除</button></h5>
      <label class="row"><span>掩码（十六进制）:</span><input type="text" class="mono" data-k="mask" value="${esc(f.mask)}" spellcheck="false" placeholder="例如 E280"></label>
      <label class="row"><span>位长度:</span><input type="number" data-k="bits" min="0" max="${auto}" value="${f.bits === '' || f.bits == null ? auto : f.bits}"></label>
      <label class="row"><span>偏移（位）:</span><input type="number" data-k="pointer" min="0" value="${f.pointer}"></label>
      <label class="row"><span>存储区:</span><select data-k="bank">${[['epc', 'EPC'], ['tid', 'TID'], ['user', 'User'], ['reserved', 'Reserved']].map(([v, l]) => `<option value="${v}" ${f.bank === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="row"><span>匹配动作:</span><select data-k="match" class="${bad ? 'inv' : ''}">${ACTS.map(([v, l]) => `<option value="${v}" ${f.match === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="row"><span>不匹配动作:</span><select data-k="miss" class="${bad ? 'inv' : ''}">${ACTS.map(([v, l]) => `<option value="${v}" ${f.miss === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${bad ? '<div class="note" style="color:var(--err)">匹配与不匹配动作不能相同</div>' : ''}</div>`; }).join('') || '<div class="hint" style="margin-bottom:6px">未配置过滤器：盘点所有标签。</div>';
  $('#dc-fadd').disabled = fs.length >= 5;
}
function readCfgForm() {
  const c = draft;
  c.ants = $('#dc-ants').value; c.mode = +$('#dc-mode').value; c.search = +$('#dc-search').value; c.fastId = $('#dc-fastid').checked; c.pop = +$('#dc-pop').value || 32; c.session = +$('#dc-ses').value;
  c.phase = $('#dc-phase').checked; c.doppler = $('#dc-dop').checked; c.power = +$('#dc-pwr').value; c.rx = +$('#dc-rx').value; c.maxSens = $('#dc-maxs').checked;
  c.ldc = { enabled: $('#dc-ldc').checked, emptyTimeout: +$('#dc-ldcE').value || 500, pingInterval: +$('#dc-ldcP').value || 200 };
}
function validateGpi() { let bad = false; for (const tr of $$('#dc-gpi tr[data-p]')) { const g = draft.gpi[tr.dataset.p] || {}; const b = g.start && g.stop && (g.startLvl || 'high') === (g.stopLvl || 'low'); tr.classList.toggle('bad', !!b); bad = bad || b; } $('#dc-gpi').classList.toggle('bad', !!bad); return !bad; }
$('#dc-inv').addEventListener('change', e => {
  const t = e.target; dirty = true;
  if (t.closest('#dc-antTbl')) { const a = t.dataset.a; draft.per[a] = { ...(draft.per[a] || {}), [t.dataset.k]: +t.value }; return; }
  if (t.closest('#dc-gpi')) { const p = t.closest('tr').dataset.p, k = t.dataset.k; draft.gpi = draft.gpi || {};
    if ((k === 'start' || k === 'stop') && t.checked) for (const q of Object.keys(draft.gpi)) if (q !== p && draft.gpi[q]) draft.gpi[q][k] = false;
    draft.gpi[p] = { startLvl: 'high', stopLvl: 'low', ...(draft.gpi[p] || {}), [k]: t.type === 'checkbox' ? t.checked : t.value }; fillCfg(); return; }
  if (t.closest('.flt')) { const f = draft.filters[+t.closest('.flt').dataset.f], k = t.dataset.k; f[k] = t.value;
    if (k === 'mask') { f.mask = clean(t.value); f.bits = ''; } if (k === 'bits') f.bits = Math.min(+t.value, clean(f.mask).length * 4); if (k === 'pointer') f.pointer = +t.value || 0; renderFilters(); return; }
  if (t.id === 'dc-preset') return;
  readCfgForm();
  if (t.id === 'dc-pwr' || t.id === 'dc-rx' || t.id === 'dc-maxs') { draft.per = {}; fillCfg(); }
});
$('#dc-flts').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; draft.filters.splice(+b.dataset.rm, 1); dirty = true; renderFilters(); });
$('#dc-fadd').onclick = () => { draft.filters = draft.filters || []; if (draft.filters.length >= 5) return; draft.filters.push({ mask: '', bits: '', pointer: 32, bank: 'epc', match: 'select', miss: 'unselect' }); dirty = true; renderFilters(); };
$('#dc-aall').onclick = () => { const i = infoOf(srcById(cfgSrc)) || {}; $('#dc-ants').value = range(1, i.antennaCount || 4).join(', '); readCfgForm(); dirty = true; fillCfg(); };
$('#dc-aclr').onclick = () => { $('#dc-ants').value = ''; readCfgForm(); dirty = true; };
$('#dc-indT').onclick = () => { const p = $('#dc-ind'); p.hidden = !p.hidden; $('#dc-indT .car').textContent = p.hidden ? '▼' : '▲'; };
$('#dc-preset').onchange = async e => { if (dirty && !confirm('放弃未保存的修改？')) { e.target.value = viewP; return; } viewP = e.target.value; loadDraft(); };
function validName(s) { return v => !v ? '请输入名称' : v === 'default' || s.presets[v] ? '该名称已存在' : ''; }
async function savePreset() {
  const s = srcById(cfgSrc); readCfgForm();
  if (!antList(draft.ants).length) return toast('请至少填写一个天线');
  if (!validateGpi()) return toast('GPI 配置错误：同一端口的启动与停止电平不能相同');
  if ((draft.filters || []).some(f => f.match === f.miss)) return toast('过滤器的匹配与不匹配动作不能相同');
  if ((draft.filters || []).some(f => !clean(f.mask))) return toast('请填写过滤器掩码，或移除空过滤器');
  let name = viewP;
  if (viewP === 'default' && dirty) { name = await ask('保存为新预设', '预设名称:', uniqueP(s, 'copy_of_default'), validName(s)); if (!name) return; }
  if (name !== 'default') s.presets[name] = clone(draft);
  s.active = name; viewP = name; saveSources(); dirty = false; loadDraft();
  toast(`已保存，“${name}”为当前预设` + (run && run.parts.includes(s.id) ? '，将在下次运行时生效' : ''));
}
const uniqueP = (s, b) => { let n = b, i = 2; while (s.presets[n]) n = `${b}_${i++}`; return n; };
$('#dc-save').onclick = savePreset;
$('#dc-cancel').onclick = () => { dirty = false; show('inventory'); };
$('#dc-reset').onclick = () => { loadDraft(); toast('已恢复为上次保存的设置'); };
$('#dc-del').onclick = () => { const s = srcById(cfgSrc); if (viewP === 'default' || !confirm(`删除预设“${viewP}”？`)) return; delete s.presets[viewP]; if (s.active === viewP) s.active = 'default'; viewP = s.active; saveSources(); loadDraft(); };
$('#dc-copy').onclick = async () => { const s = srcById(cfgSrc); readCfgForm(); const n = await ask('复制预设', '新预设名称:', uniqueP(s, 'copy_of_' + viewP), validName(s)); if (!n) return; s.presets[n] = clone(draft); viewP = n; saveSources(); loadDraft(); };
$('#dc-export').onclick = () => { const s = srcById(cfgSrc); readCfgForm(); dl(`${nameOf(s)}_${viewP}.json`.replace(/[\\/:*?"<>|\s]+/g, '_'), JSON.stringify({ app: 'TagScope', version: VERSION, name: viewP, preset: draft }, null, 2), 'application/json'); };
$('#dc-import').onclick = () => $('#dc-file').click();
$('#dc-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const s = srcById(cfgSrc);
  try { const j = JSON.parse(await f.text()), p = j.preset || j; if (!p || typeof p !== 'object' || !('ants' in p)) throw new Error('不是 TagScope 预设文件');
    const n = await ask('导入预设', '预设名称:', uniqueP(s, j.name && j.name !== 'default' ? j.name : f.name.replace(/\.json$/i, '')), validName(s)); if (!n) return;
    s.presets[n] = { ...defaultPreset(infoOf(s)), ...p }; viewP = n; saveSources(); loadDraft(); toast('已导入预设 ' + n); } catch (err) { toast('导入失败：' + err.message); } };
$('#dc-refresh').onclick = async () => { const s = srcById(cfgSrc); if (!s.enabled) return toast('请先启用该数据源'); await disconnectSource(s); await connectSource(s); readCfgForm(); fillCfg(); if (!rt(s.id).err) toast('已刷新设备能力'); };
function tab(t) { $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); $('#dc-inv').hidden = t !== 'inv'; $('#dc-diag').hidden = t !== 'diag'; $('#dc-foot').hidden = t !== 'inv'; if (t === 'diag') fillCfg(); }
$$('.tabs [data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
$('#dc-gpo').addEventListener('change', async e => { const p = e.target.dataset.gpo; if (!p) return; const s = srcById(cfgSrc);
  try { await backendOf(s).api('gpo', { id: s.id, port: +p, state: e.target.checked }); addLog({ id: s.id, level: 'info', msg: `GPO ${p} → ${e.target.checked ? '高' : '低'}`, ts: Date.now() }); } catch (err) { e.target.checked = !e.target.checked; toast(err.message); } });
$('#dc-simgpi').addEventListener('change', async e => { const p = e.target.dataset.gpi; if (!p) return; const s = srcById(cfgSrc);
  try { await backendOf(s).api('gpi', { id: s.id, port: +p, level: e.target.checked }); } catch (err) { e.target.checked = !e.target.checked; toast(err.message); } });

