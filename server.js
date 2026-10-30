'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// TagScope bridge: serves the UI and bridges browser <-> reader (LLRP TCP / R700 REST).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { LlrpDriver } = require('./lib/driver-llrp');
const { RestDriver } = require('./lib/driver-rest');
const { SimDriver } = require('./lib/driver-sim');

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const PORT = +(args.port || process.env.PORT || 8080);
const HOST = args.host || process.env.HOST || '127.0.0.1';
const INDEX = path.join(__dirname, 'public', 'index.html');
const STATIC = { '/app.js': 'app.js', '/sim.js': 'sim.js', '/tagdb.js': 'tagdb.js', '/views.js': 'views.js', '/i18n.js': 'i18n.js' };
// Web pages allowed to use this bridge from another origin (the hosted TagScope page + local pages).
const ALLOW = new Set(['https://tagscope.iotrfid.top', ...String(args['allow-origin'] || process.env.TAGSCOPE_ALLOW_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)]);
function originOk(req) {
  const o = req.headers.origin; if (!o) return true;
  if (o === `http://${req.headers.host}` || ALLOW.has(o)) return true;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(o).hostname); } catch (_) { return false; }
}
function cors(req, res) {
  const o = req.headers.origin; if (!o || !originOk(req)) return;
  res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.setHeader('Access-Control-Max-Age', '600');
}

const VERSION = require('./package.json').version;
const sources = new Map(); // id -> { id, driver, info, connected, running, startedAt, cfg, busy, batch, batchReads }
const clients = new Set();

function send(event, data) { const s = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(s); }
function log(level, msg, id) { if (level !== 'debug' || args.verbose) console.log(`[${level}]${id ? ' [' + id + ']' : ''} ${msg}`); send('log', { level, msg, ts: Date.now(), id }); }
function srcState(x) { return { id: x.id, connected: x.connected, running: x.running, info: x.info, startedAt: x.startedAt, driver: x.driver?.kind || x.kind || null }; }
function state() { return { version: VERSION, sources: Object.fromEntries([...sources.values()].map(x => [x.id, srcState(x)])) }; }
function pushState(x) { send('state', srcState(x)); }
function get(id) { const x = sources.get(String(id || '')); if (!x) throw new Error('数据源未连接'); return x; }

setInterval(() => {
  for (const x of sources.values()) {
    if (!x.batch.size) continue;
    const reads = [...x.batch.values()]; x.batch = new Map();
    send('tags', { id: x.id, reads, total: x.batchReads, ts: Date.now() }); x.batchReads = 0;
  }
}, 200);

function onTag(x, t) {
  x.batchReads += t.count || 1;
  const k = t.epc + '|' + t.antenna, b = x.batch.get(k), hasR = typeof t.rssi === 'number';
  if (!b) x.batch.set(k, { ...t, count: t.count || 1, maxRssi: t.rssi, minRssi: t.rssi, rssiSum: hasR ? t.rssi : 0, rssiN: hasR ? 1 : 0, firstTs: t.ts });
  else {
    b.count += t.count || 1; b.rssi = t.rssi ?? b.rssi; if (hasR) { b.rssiSum += t.rssi; b.rssiN++; }
    b.maxRssi = Math.max(b.maxRssi ?? -999, t.rssi ?? -999); b.minRssi = Math.min(b.minRssi ?? 999, t.rssi ?? 999);
    for (const f of ['phase', 'doppler', 'channel', 'freq', 'tid', 'pc', 'xpc', 'rts', 'power']) if (t[f] != null) b[f] = t[f];
    b.ts = t.ts;
  }
}

async function doConnect(o) {
  const id = String(o.id || 'default');
  if (sources.has(id)) await doDisconnect(id);
  const d = o.driver === 'rest' ? new RestDriver() : o.driver === 'sim' ? new SimDriver() : new LlrpDriver();
  const x = { id, kind: d.kind, driver: d, info: null, connected: false, running: false, startedAt: 0, cfg: null, busy: false, batch: new Map(), batchReads: 0 };
  d.on('log', (lv, m) => log(lv, m, id)); d.on('tag', t => onTag(x, t));
  d.on('rospec', ev => { send('rospec', { id, ev, ts: Date.now() }); });
  d.on('gpi', g => send('gpi', { id, ...g, ts: Date.now() }));
  d.on('disconnected', () => { if (sources.get(id) === x) { sources.delete(id); x.connected = false; x.running = false; log('warn', '与读写器的连接已断开', id); pushState(x); } });
  log('info', `正在连接 ${o.driver === 'sim' ? '模拟器' : o.host}（${d.kind.toUpperCase()}）…`, id);
  sources.set(id, x);
  try { x.info = await d.connect(o); } catch (e) { sources.delete(id); try { d.sock?.destroy(); } catch (_) { } throw e; }
  x.connected = true; log('info', `已连接：${x.info.model} · 固件 ${x.info.firmware || '未知'}`, id); pushState(x);
  return srcState(x);
}
async function doDisconnect(id) {
  const x = sources.get(String(id)); if (!x) return { id, connected: false };
  sources.delete(x.id);
  try { await x.driver.disconnect(); } catch (e) { log('warn', e.message, x.id); }
  x.connected = false; x.running = false; log('info', '已断开连接', x.id); pushState(x);
  return srcState(x);
}
async function doStart(id, cfg) {
  const x = get(id); x.cfg = cfg;
  if (x.running) await x.driver.stop();
  await x.driver.start(cfg); x.running = true; x.startedAt = Date.now();
  log(cfg.quiet ? 'debug' : 'info', `开始盘点：RF 模式 ${cfg.mode}，Session ${cfg.session}，搜索模式 ${cfg.searchMode}，天线 ${cfg.antennas.filter(a => a.enabled).map(a => a.id).join(',')}`, id);
  pushState(x); return srcState(x);
}
async function doStop(id) { const x = get(id); if (x.running) { x.running = false; await x.driver.stop(); log('debug', '盘点已停止', id); } x.running = false; pushState(x); return srcState(x); }

const SYSMSG = { hostname: b => `主机名 → ${b.value}`, region: b => `工作区域 → ${b.value}`, iface: b => `RFID 接口 → ${b.value}`, reboot: () => '重启读写器', factory: () => '恢复出厂设置' };
async function doSystem(b) {
  const x = get(b.id), op = b.op || 'info'; let r;
  if (op !== 'info' && !SYSMSG[op]) throw new Error('未知操作 ' + op);
  if (op !== 'info' && x.running) throw new Error('请先停止盘点');
  if (x.driver.system) r = await x.driver.system(op, b);
  else { // LLRP: Impinj R700 still exposes the IoT Device Interface /system endpoints over HTTPS
    x.rest ||= RestDriver.client({ host: x.driver.host, port: b.restPort, user: b.user, pass: b.pass });
    try { r = await x.rest.system(op, b); }
    catch (e) {
      if (op !== 'info') throw new Error(`无法通过 Impinj IoT 接口执行：${e.message}`); const i = x.info || {};
      r = { via: 'llrp', note: `${e.message}。仅显示 LLRP 信息；主机名、区域、RFID 接口与重启需要读写器支持 Impinj IoT 接口（R700 系列）。`, caps: {},
        info: { productModel: i.model, manufacturer: i.manufacturer, serialNumber: i.serial, firmwareVersion: i.firmware, region: i.region, antennaPortCount: i.antennaCount, gpiCount: i.gpi, gpoCount: i.gpo, rfidInterface: 'llrp' } };
    }
    if (op === 'info') { r.caps.gpo = (x.info?.gpo || 0) > 0; r.gpo = Array.from({ length: x.info?.gpo || 0 }, (_, k) => ({ port: k + 1, state: !!(x.gpoState || {})[k + 1] })); }
  }
  if (op !== 'info') log('info', SYSMSG[op](b), x.id);
  return r;
}

const routes = {
  'GET /api/state': async () => state(),
  'POST /api/connect': async b => doConnect(b),
  'POST /api/disconnect': async b => doDisconnect(b.id),
  'POST /api/start': async b => doStart(b.id, b.cfg),
  'POST /api/stop': async b => doStop(b.id),
  'POST /api/gpo': async b => { const x = get(b.id); if (!x.driver.gpo) throw new Error('该数据源不支持 GPO 控制'); const r = await x.driver.gpo(b.port, b.state); (x.gpoState ||= {})[b.port] = !!b.state; return r; },
  'POST /api/system': async b => doSystem(b),
  'POST /api/gpi': async b => { const x = get(b.id); if (!x.driver.gpi) throw new Error('仅模拟器支持模拟 GPI 输入'); return x.driver.gpi(b.port, b.level); },
  'POST /api/access': async b => {
    const x = get(b.id);
    if (!x.info.supportsAccess) throw new Error('当前驱动不支持标签操作');
    if (x.busy) throw new Error('上一个标签操作尚未完成');
    if (!x.driver.cfg && b.cfg) x.driver.cfg = b.cfg;
    x.busy = true; log('info', `标签操作 ${b.op} → ${b.targetTid ? 'TID ' + b.targetTid : b.targetEpc || '任意标签'}`, x.id);
    try { const r = await x.driver.accessOp(b); log(r.ok ? 'info' : 'warn', `标签操作 ${b.op}：${r.message}${r.data ? ' 数据 ' + r.data : ''}`, x.id); return r; } finally { x.busy = false; }
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    if (!originOk(req)) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: `来源 ${req.headers.origin} 未被允许，可用 --allow-origin 添加` })); }
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return fs.createReadStream(INDEX).pipe(res); }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && STATIC[url.pathname]) { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return fs.createReadStream(path.join(__dirname, 'public', STATIC[url.pathname])).pipe(res); }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify(state())}\n\n`); clients.add(res);
    const ka = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); }); return;
  }
  const h = routes[`${req.method} ${url.pathname}`];
  if (!h) { res.writeHead(404); return res.end('Not found'); }
  let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try { const out = await h(body ? JSON.parse(body) : {}); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }
    catch (e) { log('error', e.message); res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
});
server.listen(PORT, HOST, () => { console.log(`TagScope ${VERSION}  © 2026 Hill · Hill@iotrfid.top`); console.log(`TagScope 已启动： http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`); console.log('网页版：https://tagscope.iotrfid.top （连接真实读写器时保持本窗口运行）'); });
process.on('SIGINT', async () => { await Promise.all([...sources.keys()].map(id => doDisconnect(id).catch(() => { }))); process.exit(0); });
