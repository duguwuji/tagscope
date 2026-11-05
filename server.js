'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// TagScope bridge: serves the UI and bridges browser <-> reader (LLRP TCP / R700 REST).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const V = require('./public/validation');
const { RunBuffer } = require('./public/run-buffer');
const { createSecurity } = require('./lib/bridge-security');
const { LlrpDriver } = require('./lib/driver-llrp');
const { RestDriver } = require('./lib/driver-rest');
const { SimDriver } = require('./lib/driver-sim');

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const PORT = Number(args.port ?? process.env.PORT ?? 8080);
const HOST = args.host || process.env.HOST || '127.0.0.1';
const INDEX = path.join(__dirname, 'public', 'index.html');
const STATIC = { '/app.js': 'app.js', '/sim.js': 'sim.js', '/tagdb.js': 'tagdb.js', '/views.js': 'views.js', '/i18n.js': 'i18n.js', '/validation.js': 'validation.js', '/run-buffer.js': 'run-buffer.js' };
const split = s => String(s || '').split(',').map(v => v.trim()).filter(Boolean);
const security = createSecurity({ host: HOST, port: () => server.address()?.port || PORT, token: process.env.TAGSCOPE_TOKEN,
  allowOrigins: split(args['allow-origin'] || process.env.TAGSCOPE_ALLOW_ORIGIN), allowHosts: split(args['allow-host'] || process.env.TAGSCOPE_ALLOW_HOST) });
const originOk = req => security.originOk(req);
function cors(req, res) {
  const o = req.headers.origin; if (!o || !originOk(req)) return;
  res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true'); res.setHeader('Access-Control-Max-Age', '600');
}

const VERSION = require('./package.json').version;
const sources = new Map(); // id -> { id, driver, info, connected, running, startedAt, cfg, busy, batch, batchReads }
const clients = new Set();

function send(event, data) {
  const s = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.destroyed || c.writableLength > 1024 * 1024) { clients.delete(c); c.destroy(); continue; }
    try { c.write(s); } catch (_) { clients.delete(c); c.destroy(); }
  }
}
function log(level, msg, id) { if (level !== 'debug' || args.verbose) console.log(`[${level}]${id ? ' [' + id + ']' : ''} ${msg}`); send('log', { level, msg, ts: Date.now(), id }); }
function srcState(x) { return { id: x.id, connected: x.connected, running: x.running, status: x.status, error: x.error || '', runId: x.buffer?.runId, info: x.info, startedAt: x.startedAt, driver: x.driver?.kind || x.kind || null }; }
function state() { return { version: VERSION, features: ['auth', 'sequenced-batches'], sources: Object.fromEntries([...sources.values()].map(x => [x.id, srcState(x)])) }; }
function pushState(x) { send('state', srcState(x)); }
function get(id) { const x = sources.get(String(id || '')); if (!x) throw new Error('数据源未连接'); return x; }

function flush(x) { const b = x.buffer?.flush(); if (b) send('tags', b); }
const ticker = setInterval(() => { for (const x of sources.values()) flush(x); }, 200); ticker.unref();

function onTag(x, t) {
  if (x.accepting && t.epc) x.buffer.add(t);
}

async function doConnect(o) {
  V.object(o, '数据源');
  if (!['llrp', 'rest', 'sim'].includes(o.driver)) throw new Error('未知驱动');
  if (o.driver !== 'sim' && (typeof o.host !== 'string' || !/^[a-z0-9.:%_-]+$/i.test(o.host) || o.host.length > 253)) throw new Error('读写器地址无效');
  if (o.port != null) V.integer(o.port, 1, 65535, '端口');
  const id = String(o.id || 'default');
  if (sources.has(id)) await doDisconnect(id);
  const d = o.driver === 'rest' ? new RestDriver() : o.driver === 'sim' ? new SimDriver() : new LlrpDriver();
  const x = { id, kind: d.kind, driver: d, info: null, connected: false, running: false, status: 'idle', error: '', accepting: false, startedAt: 0, cfg: null, busy: false, buffer: null };
  d.on('log', (lv, m) => log(lv, m, id)); d.on('tag', t => onTag(x, t));
  d.on('rospec', ev => { send('rospec', { id, ev, ts: Date.now() }); });
  d.on('gpi', g => send('gpi', { id, ...g, ts: Date.now() }));
  d.on('fault', e => { if (sources.get(id) !== x) return; x.status = 'unknown'; x.error = e.message; log('error', e.message, id); pushState(x); });
  d.on('disconnected', () => { if (sources.get(id) === x && !x.disconnecting) { flush(x); x.accepting = false; x.connected = false; x.status = 'unknown'; x.error = '连接已断开，设备运行状态未确认'; log('warn', x.error, id); pushState(x); } });
  log('info', `正在连接 ${o.driver === 'sim' ? '模拟器' : o.host}（${d.kind.toUpperCase()}）…`, id);
  sources.set(id, x);
  try { x.info = await d.connect(o); x.connection = o; } catch (e) { sources.delete(id); try { await d.disconnect(); } catch (_) { d.sock?.destroy(); } throw e; }
  x.connected = true; log('info', `已连接：${x.info.model} · 固件 ${x.info.firmware || '未知'}`, id); pushState(x);
  return srcState(x);
}
async function doDisconnect(id) {
  const x = sources.get(String(id)); if (!x) return { id, connected: false };
  if (x.connected && (x.running || x.status === 'unknown')) await doStop(id);
  x.disconnecting = true;
  try { await x.driver.disconnect(); } finally { x.disconnecting = false; }
  flush(x); x.accepting = false; sources.delete(x.id);
  x.connected = false; x.running = false; x.status = 'idle'; x.error = ''; log('info', '已断开连接', x.id); pushState(x);
  return srcState(x);
}
async function doStart(id, cfg, runId = crypto.randomUUID()) {
  cfg = V.inventory(cfg); const x = get(id);
  if (!x.connected) throw new Error('数据源已断开，请重新连接');
  if (typeof runId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(runId)) throw new Error('运行编号无效');
  if (x.running || x.status === 'unknown') await doStop(id);
  x.cfg = cfg; x.buffer = new RunBuffer(x.id, runId); x.accepting = true; x.status = 'starting'; x.error = '';
  try { await x.driver.start(cfg); x.running = true; x.status = 'running'; x.startedAt = Date.now(); }
  catch (e) { x.running = true; x.status = 'unknown'; x.error = e.message; pushState(x); throw e; }
  log(cfg.quiet ? 'debug' : 'info', `开始盘点：RF 模式 ${cfg.mode}，Session ${cfg.session}，搜索模式 ${cfg.searchMode}，天线 ${cfg.antennas.filter(a => a.enabled).map(a => a.id).join(',')}`, id);
  pushState(x); return srcState(x);
}
async function doStop(id, afterSeq = 0, runId) {
  const x = get(id); V.integer(afterSeq, 0, Number.MAX_SAFE_INTEGER, '批次序号');
  if (runId && x.buffer?.runId !== runId) throw new Error('运行已改变，请刷新状态后再停止');
  if (x.running || x.status === 'unknown') {
    x.status = 'stopping';
    try { await x.driver.stop(); } catch (e) { x.status = 'unknown'; x.error = '停止未确认：' + e.message; pushState(x); throw new Error(x.error); }
  }
  x.accepting = false; flush(x); x.running = false; x.status = 'idle'; x.error = '';
  pushState(x); return { ...srcState(x), ...(x.buffer ? x.buffer.since(afterSeq) : {}) };
}

const SYSMSG = { hostname: b => `主机名 → ${b.value}`, region: b => `工作区域 → ${b.value}`, iface: b => `RFID 接口 → ${b.value}`, reboot: () => '重启读写器', factory: () => '恢复出厂设置' };
async function doSystem(b) {
  const x = get(b.id), op = b.op || 'info'; let r;
  if (op !== 'info' && !SYSMSG[op]) throw new Error('未知操作 ' + op);
  if (op !== 'info' && (x.running || x.status === 'unknown')) throw new Error('请先确认盘点已停止');
  if (x.driver.system) r = await x.driver.system(op, b);
  else { // LLRP: Impinj R700 still exposes the IoT Device Interface /system endpoints over HTTPS
    x.rest ||= RestDriver.client({ host: x.driver.host, port: b.restPort, user: b.user ?? x.connection?.user, pass: b.pass ?? x.connection?.pass, insecure: x.connection?.insecure });
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
  'POST /api/start': async b => doStart(b.id, b.cfg, b.runId),
  'POST /api/stop': async b => doStop(b.id, b.afterSeq, b.runId),
  'POST /api/gpo': async b => { V.integer(b.port, 1, 64, 'GPO'); if (typeof b.state !== 'boolean') throw new Error('GPO 电平无效'); const x = get(b.id); if (!x.driver.gpo) throw new Error('该数据源不支持 GPO 控制'); const r = await x.driver.gpo(b.port, b.state); (x.gpoState ||= {})[b.port] = b.state; return r; },
  'POST /api/system': async b => doSystem(b),
  'POST /api/gpi': async b => { V.integer(b.port, 1, 64, 'GPI'); if (typeof b.level !== 'boolean') throw new Error('GPI 电平无效'); const x = get(b.id); if (!x.driver.gpi) throw new Error('仅模拟器支持模拟 GPI 输入'); return x.driver.gpi(b.port, b.level); },
  'POST /api/access': async b => {
    const x = get(b.id);
    if (!x.info.supportsAccess) throw new Error(x.info.accessNote || '当前驱动不支持标签操作');
    if (x.busy) throw new Error('上一个标签操作尚未完成');
    const request = V.access(b);
    if (x.status === 'unknown') throw new Error('设备状态未确认，请先停止盘点');
    if (!x.running && b.cfg) x.driver.cfg = V.inventory(b.cfg);
    x.busy = true; log('info', `标签操作 ${b.op} → ${b.targetTid ? 'TID ' + b.targetTid : b.targetEpc || '任意标签'}`, x.id);
    try { const r = await x.driver.accessOp(request); log(r.ok ? 'info' : 'warn', `标签操作 ${b.op}：${r.message}${r.data ? ' 数据 ' + r.data : ''}`, x.id); return r; } finally { x.busy = false; }
  },
};

const queues = new Map();
function enqueue(id, task) {
  const key = String(id || 'default'), previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task); queues.set(key, next);
  const clean = () => { if (queues.get(key) === next) queues.delete(key); }; next.then(clean, clean); return next;
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (!security.hostOk(req)) return json(res, 403, { error: '桥接主机名未被允许，可用 --allow-host 添加' });
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    if (!originOk(req)) { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: `来源 ${req.headers.origin} 未被允许，可用 --allow-origin 添加` })); }
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (!security.authorized(req)) return json(res, 401, { error: '请填写启动窗口中的桥接配对码' });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    let html;
    try { html = fs.readFileSync(INDEX, 'utf8'); }
    catch (e) { return json(res, 500, { error: '无法读取界面文件：' + e.message }); }
    const nonce = crypto.randomBytes(16).toString('base64');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': `script-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'` });
    const bootstrap = security.localPage(req) ? `<script nonce="${nonce}">window.TAGSCOPE_BRIDGE_TOKEN=${JSON.stringify(security.token).replace(/</g, '\\u003c')};</script>` : '';
    html = html.replace('content="__TAGSCOPE_VERSION__"', `content="${VERSION}"`);
    return res.end(html.replace('<script src="tagdb.js', bootstrap + '\n<script src="tagdb.js'));
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && STATIC[url.pathname]) {
    const s = fs.createReadStream(path.join(__dirname, 'public', STATIC[url.pathname]));
    s.once('open', () => { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); s.pipe(res); });
    s.once('error', () => { if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(); });
    res.once('close', () => s.destroy());
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify(state())}\n\n`); clients.add(res);
    const ka = setInterval(() => res.write(': ping\n\n'), 15000);
    res.on('close', () => { clearInterval(ka); clients.delete(res); }); return;
  }
  const h = routes[`${req.method} ${url.pathname}`];
  if (!h) { res.writeHead(404); return res.end('Not found'); }
  if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: '请求必须使用 application/json' });
  let body = ''; req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let b;
    try { b = body ? JSON.parse(body) : {}; V.object(b, '请求'); if (b.id != null && (typeof b.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(b.id))) throw new Error('数据源编号无效'); const out = await (req.method === 'POST' ? enqueue(b.id, () => h(b)) : h(b)); json(res, 200, out); }
    catch (e) { log('error', e.message); const x = typeof b?.id === 'string' && sources.get(b.id); json(res, 400, { error: e.message, ...(x ? { state: srcState(x) } : {}) }); }
  });
});
if (require.main === module) {
  server.listen(PORT, HOST, () => { console.log(`TagScope ${VERSION}  © 2026 Hill · Hill@iotrfid.top`); console.log(`TagScope 已启动： http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`); console.log(`桥接配对码（在线页或其他电脑连接时填写）：${security.token}`); console.log('网页版：https://tagscope.iotrfid.top （连接真实读写器时保持本窗口运行）'); });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return; shuttingDown = true;
    clearInterval(ticker);
    await Promise.all([...sources.keys()].map(id => enqueue(id, () => doDisconnect(id)).catch(() => {})));
    process.exit(0);
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
module.exports = { server, sources, clients, routes, enqueue, security, doConnect, doStart, doStop, doDisconnect, state, onTag, flush, ticker };
