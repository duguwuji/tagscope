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

let driver = null, info = null, connected = false, running = false, runTimer = null, startedAt = 0, lastCfg = null, busy = false;
const clients = new Set();
let batch = new Map(), batchReads = 0;

function send(event, data) { const s = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(s); }
function log(level, msg) { if (level === 'debug' && !args.verbose) { send('log', { level, msg, ts: Date.now() }); return; } console.log(`[${level}] ${msg}`); send('log', { level, msg, ts: Date.now() }); }
function state() { return { connected, running, info, startedAt, driver: driver?.kind || null, cfg: lastCfg }; }
function pushState() { send('state', state()); }

setInterval(() => {
  if (!batch.size) return;
  const reads = [...batch.values()]; batch = new Map();
  send('tags', { reads, total: batchReads, ts: Date.now() }); batchReads = 0;
}, 200);

function onTag(t) {
  batchReads += t.count || 1;
  const k = t.epc + '|' + t.antenna, b = batch.get(k);
  const hasR = typeof t.rssi === 'number';
  if (!b) batch.set(k, { ...t, count: t.count || 1, maxRssi: t.rssi, minRssi: t.rssi, rssiSum: hasR ? t.rssi : 0, rssiN: hasR ? 1 : 0, firstTs: t.ts });
  else { b.count += t.count || 1; b.rssi = t.rssi ?? b.rssi; if (hasR) { b.rssiSum += t.rssi; b.rssiN++; } b.maxRssi = Math.max(b.maxRssi ?? -999, t.rssi ?? -999); b.minRssi = Math.min(b.minRssi ?? 999, t.rssi ?? 999); b.phase = t.phase ?? b.phase; b.doppler = t.doppler ?? b.doppler; b.channel = t.channel ?? b.channel; b.freq = t.freq ?? b.freq; b.tid = t.tid || b.tid; b.pc = t.pc || b.pc; b.ts = t.ts; }
}

async function doConnect(o) {
  if (connected) await doDisconnect();
  const d = o.driver === 'rest' ? new RestDriver() : o.driver === 'sim' ? new SimDriver() : new LlrpDriver();
  d.on('log', log); d.on('tag', onTag);
  d.on('disconnected', () => { if (driver === d) { driver = null; info = null; connected = false; running = false; clearTimeout(runTimer); log('warn', '与读写器的连接已断开'); pushState(); } });
  log('info', `正在连接 ${o.driver === 'sim' ? '模拟器' : `${o.host}`}（${d.kind.toUpperCase()}）…`);
  driver = d;
  try { info = await d.connect(o); } catch (e) { driver = null; try { d.sock?.destroy(); } catch (_) { } throw e; }
  connected = true; log('info', `已连接：${info.model} · 固件 ${info.firmware || '未知'}`); pushState();
}
async function doDisconnect() {
  if (!driver) return; const d = driver; clearTimeout(runTimer);
  try { await d.disconnect(); } catch (e) { log('warn', e.message); }
  driver = null; info = null; connected = false; running = false; log('info', '已断开连接'); pushState();
}
async function doStart(cfg) {
  if (!connected) throw new Error('未连接读写器');
  lastCfg = cfg; if (running) await driver.stop();
  await driver.start(cfg); running = true; startedAt = Date.now();
  log('info', `开始盘点：模式 ${cfg.mode}，Session ${cfg.session}，天线 ${cfg.antennas.filter(a => a.enabled).map(a => a.id).join(',')}`);
  clearTimeout(runTimer);
  if (+cfg.duration > 0) runTimer = setTimeout(() => doStop().catch(e => log('error', e.message)), +cfg.duration * 1000);
  pushState();
}
async function doStop() { clearTimeout(runTimer); if (driver && running) { running = false; await driver.stop(); log('info', '盘点已停止'); } running = false; pushState(); }

const routes = {
  'GET /api/state': async () => state(),
  'POST /api/connect': async b => { await doConnect(b); return state(); },
  'POST /api/disconnect': async () => { await doDisconnect(); return state(); },
  'POST /api/start': async b => { await doStart(b); return state(); },
  'POST /api/stop': async () => { await doStop(); return state(); },
  'POST /api/config': async b => { lastCfg = b; if (driver) driver.cfg = b; if (running) await doStart(b); return state(); },
  'POST /api/access': async b => {
    if (!connected) throw new Error('未连接读写器');
    if (!info.supportsAccess) throw new Error('当前驱动不支持标签操作');
    if (busy) throw new Error('上一个标签操作尚未完成');
    if (!driver.cfg && lastCfg) driver.cfg = lastCfg;
    busy = true; log('info', `标签操作 ${b.op} → ${b.targetEpc || '任意标签'}`);
    try { const r = await driver.accessOp(b); log(r.ok ? 'info' : 'warn', `标签操作 ${b.op}：${r.message}${r.data ? ' 数据 ' + r.data : ''}`); return r; } finally { busy = false; }
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return fs.createReadStream(INDEX).pipe(res); }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`); clients.add(res);
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
server.listen(PORT, HOST, () => { console.log('TagScope 1.1.0  © 2026 Hill · Hill@iotrfid.top'); console.log(`TagScope 已启动： http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`); });
process.on('SIGINT', async () => { await doDisconnect().catch(() => { }); process.exit(0); });
