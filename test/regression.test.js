'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const V = require('../public/validation');
const { RunBuffer, Receiver } = require('../public/run-buffer');
const { LlrpDriver } = require('../lib/driver-llrp');
const { RestDriver } = require('../lib/driver-rest');
const { createSecurity } = require('../lib/bridge-security');
const { MSG, P, tlv, u16 } = require('../lib/llrp-codec');
const bridge = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cfg = { antennas: [{ id: 1, enabled: true, txDbm: 30 }], mode: 0, session: 1, searchMode: 2 };
const filter = { mask: 'E280', bank: 'epc', pointer: 32, bits: '', match: 'select', miss: 'unselect' };
const defaults = { ants: '1,2', mode: 0, search: 2, session: 1, pop: 32, power: 30, rx: -80, fastId: false, phase: true, doppler: false, maxSens: true, per: {}, gpi: {}, filters: [], ldc: { enabled: false, emptyTimeout: 500, pingInterval: 200 } };
const write = { op: 'write', targetEpc: 'AAAA', bank: 'user', wordPointer: 0, data: '1234', timeout: 0.05 };
after(() => { clearInterval(bridge.ticker); bridge.sources.clear(); for (const c of bridge.clients) c.emit('close'); bridge.clients.clear(); });

function accessDriver() { const d = new LlrpDriver(); d.running = true; d.cfg = cfg; d.commands = []; d.call = async type => { d.commands.push(type); }; return d; }
function replyAccess(d) { const id = [...d.access.keys()][0]; d._onTag({ epc: 'AAAA', accessSpecId: id, ops: [{ kind: 'write', result: 0 }], count: 1 }); }
test('F01: expired ADD cannot enable the AccessSpec and is deleted', async () => {
  const d = accessDriver(); d.call = async type => { d.commands.push(type); if (type === MSG.ADD_ACCESSSPEC) await delay(25); };
  const r = await d.accessOp({ ...write, timeout: 0.005 });
  assert.equal(r.ok, false); assert(!d.commands.includes(MSG.ENABLE_ACCESSSPEC)); assert(d.commands.includes(MSG.DELETE_ACCESSSPEC)); assert.equal(d.access.size, 0);
});
test('F01: ENABLE failure is disabled/deleted and reports an unknown write outcome', async () => {
  const d = accessDriver(); d.call = async type => { d.commands.push(type); if (type === MSG.ENABLE_ACCESSSPEC) throw Error('ack lost'); };
  const r = await d.accessOp(write); assert.equal(r.outcome, 'unknown'); assert.deepEqual(d.commands, [MSG.ADD_ACCESSSPEC, MSG.ENABLE_ACCESSSPEC, MSG.DISABLE_ACCESSSPEC, MSG.DELETE_ACCESSSPEC]);
});
test('F01: automatic inventory failure still cleans access and retries stop', async () => {
  const d = accessDriver(); d.running = false;
  d.start = async () => { d.running = true; throw Error('START failed'); }; let stops = 0; d.stop = async () => { stops++; d.running = false; };
  const r = await d.accessOp(write); assert.equal(r.outcome, 'unknown'); assert(d.commands.includes(MSG.DELETE_ACCESSSPEC)); assert.equal(stops, 1);
});
test('F01: cleanup failure surfaces a fault even when tag write succeeded', async () => {
  const d = accessDriver(); let fault;
  d.on('fault', f => fault = f);
  d.call = async type => { d.commands.push(type); if (type === MSG.ENABLE_ACCESSSPEC) replyAccess(d); if ([MSG.DISABLE_ACCESSSPEC, MSG.DELETE_ACCESSSPEC].includes(type)) throw Error('cleanup failed'); };
  const r = await d.accessOp(write); assert.equal(r.ok, true); assert.equal(r.cleanupOk, false); assert.match(fault.message, /清理未确认/);
});
test('F01: deadline propagates through automatic inventory setup', async () => {
  const d = accessDriver(); d.running = false; d.buildROSpec = () => Buffer.alloc(0);
  d.call = async type => { d.commands.push(type); if (type === MSG.ADD_ROSPEC) await delay(25); };
  const r = await d.accessOp({ ...write, timeout: 0.01 }); assert.equal(r.ok, false); assert(!d.commands.includes(MSG.ENABLE_ROSPEC)); assert(!d.commands.includes(MSG.START_ROSPEC)); assert(d.commands.includes(MSG.DELETE_ACCESSSPEC));
});
test('F02: LLRP failed delete preserves running and retry sends device commands', async () => {
  const d = accessDriver(); let deletes = 0;
  d.call = async type => { if (type === MSG.DELETE_ROSPEC && ++deletes === 1) throw Error('delete failed'); };
  await assert.rejects(d.stop()); assert.equal(d.running, true); await d.stop(); assert.equal(deletes, 2); assert.equal(d.running, false);
});
test('F02/F06: bridge stop failure retains state; retry includes final reports', async () => {
  let stops = 0;
  const x = { id: 'retry', connected: true, running: true, status: 'running', accepting: true, buffer: new RunBuffer('retry', 'round1'), driver: { kind: 'test', async stop() { if (++stops === 1) throw Error('no ack'); bridge.onTag(x, { epc: 'BBBB', antenna: 1, ts: 2 }); } } };
  bridge.sources.set(x.id, x); bridge.onTag(x, { epc: 'AAAA', antenna: 1, ts: 1 });
  await assert.rejects(bridge.doStop(x.id), /停止未确认/); assert.equal(x.running, true); assert.equal(x.status, 'unknown'); assert.equal(x.accepting, true);
  const r = await bridge.doStop(x.id); assert.equal(stops, 2); assert.equal(r.running, false); assert.equal(r.finalSeq, 1); assert.equal(r.batches[0].total, 2); assert.equal(x.buffer.map.size, 0); bridge.sources.delete(x.id);
});
test('source operations serialize through failures without blocking other readers', async () => {
  const calls = []; let release; const blocked = new Promise(r => release = r);
  const a = bridge.enqueue('a', async () => { calls.push('a1'); await blocked; throw Error('fail'); }); a.catch(() => {});
  const b = bridge.enqueue('a', async () => calls.push('a2'));
  await bridge.enqueue('b', async () => calls.push('b')); assert(!calls.includes('a2')); release(); await assert.rejects(a); await b; assert.deepEqual(calls, ['a1', 'b', 'a2']);
});
test('F03: malformed imported preset fields are rejected; valid preset round-trips', () => {
  assert.deepEqual(V.preset(defaults, defaults), { ...defaults, ants: '1, 2' });
  for (const patch of [{ mode: '"><img src=x onerror=alert(1)>' }, { power: Infinity }, { filters: [{ ...filter, pointer: '"><img src=x>' }] }, { filters: [{ ...filter, bits: {} }] }, { gpi: { 1: { start: true, stop: true, startLvl: 'high', stopLvl: 'high' } } }, { per: { '<img>': { tx: 30 } } }]) assert.throws(() => V.preset({ ...defaults, ...patch }, defaults));
  assert.throws(() => V.inventory({ ...cfg, session: '1' })); assert.throws(() => V.access({ ...write, targetEpc: '' })); assert.throws(() => V.access({ op: 'kill', targetEpc: 'AAAA', password: '00000000' }));
});
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const views = fs.readFileSync(require.resolve('../public/views.js'), 'utf8');
const cut = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
test('F03: renderer escapes numeric attribute fields even before validation', () => {
  const els = {}; const c = vm.createContext({ draft: { filters: [{ ...filter, pointer: '"><img src=x onerror=alert(1)>', bits: '\" onfocus=alert(1)' }] }, $: s => els[s] ||= {}, clean: s => s.replace(/[^0-9a-f]/gi, ''), esc: s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`) });
  vm.runInContext(cut(app, 'const ACTS =', 'function readCfgForm()') + '\nrenderFilters();', c);
  assert(!els['#dc-flts'].innerHTML.includes('<img')); assert(els['#dc-flts'].innerHTML.includes('&#34;'));
});
function restStream() { const res = new EventEmitter(); res.setEncoding = () => {}; res.destroyed = false; const req = new EventEmitter(); req.destroy = () => { req.destroyed = true; res.destroyed = true; res.emit('close'); }; return { req, res }; }
test('F04: rapid REST restart cannot be closed by old stop work', async () => {
  const d = new RestDriver(); let current = restStream(); d._req = async (method, path) => path === '/data/stream' ? current : {};
  await d.start(cfg); const old = current; await d.stop(); assert.equal(old.req.destroyed, true);
  current = restStream(); await d.start(cfg); await delay(550); assert.equal(current.req.destroyed, undefined); assert.equal(d.health, 'healthy'); await d.stop();
});
for (const ev of ['end', 'error', 'aborted', 'close', 'request-error']) test('F05: REST stream ' + ev + ' emits exactly one fault and can restart', async () => {
  const d = new RestDriver(); let current = restStream(), faults = 0; d.on('fault', () => faults++); d._req = async (method, path) => path === '/data/stream' ? current : {};
  await d.start(cfg); if (ev === 'request-error') current.req.emit('error', Error('lost')); else current.res.emit(ev, Error('lost'));
  assert.equal(d.health, 'error'); assert.equal(faults, 1); assert.equal(d.running, true, 'RF remains unconfirmed until stop');
  const old = current; await d.stop(); current = restStream(); await d.start(cfg); old.res.emit('close'); assert.equal(d.health, 'healthy'); assert.equal(faults, 1); await d.stop();
});
test('F02: failed REST stop preserves stream and can be retried', async () => {
  const d = new RestDriver(), current = restStream(); let stops = 0;
  d._req = async (method, path) => { if (path === '/data/stream') return current; if (path === '/profiles/stop' && ++stops === 1) throw Error('network'); return {}; };
  await d.start(cfg); await assert.rejects(d.stop()); assert.equal(d.running, true); assert.equal(current.req.destroyed, undefined); await d.stop(); assert.equal(stops, 2); assert.equal(d.running, false);
});
test('F06: HTTP replay repairs delayed/out-of-order SSE once and rejects old runs', () => {
  const buffer = new RunBuffer('s', 'one'), received = [], receiver = new Receiver(b => received.push(b)); receiver.begin('s', 'one');
  for (let i = 0; i < 3; i++) { buffer.add({ epc: 'AAAA', antenna: 1, ts: i }); buffer.flush(); }
  receiver.accept(buffer.history[1].batch); assert.equal(received.length, 0); receiver.finish('s', buffer.since(0)); assert.equal(received.length, 3);
  receiver.accept(buffer.history[0].batch); assert.equal(received.length, 3); receiver.begin('s', 'two'); receiver.accept(buffer.history[2].batch); assert.equal(receiver.seq('s'), 0);
});
test('F06: missing replay fails explicitly; already received batches tolerate trimmed replay', () => {
  const b = new RunBuffer('s', 'run'), seen = [], r = new Receiver(x => seen.push(x)); r.begin('s', 'run');
  for (let i = 0; i < 70; i++) { b.add({ epc: 'AAAA', antenna: 1 }); r.accept(b.flush()); }
  const result = b.since(0); assert.equal(result.complete, false); r.finish('s', result); assert.equal(seen.length, 70);
  const missing = new Receiver(() => {}); missing.begin('s', 'run'); assert.throws(() => missing.finish('s', result), { code: 'INCOMPLETE_DATA' });
});
test('F06: an unrecoverable gap fails once and stops buffering instead of poisoning the run', () => {
  const seen = [], r = new Receiver(b => seen.push(b)); r.begin('s', 'run');
  r.accept({ id: 's', runId: 'run', seq: 1, reads: [], total: 0 });
  assert.throws(() => { for (let i = 3; i <= 68; i++) r.accept({ id: 's', runId: 'run', seq: i, reads: [], total: 0 }); }, { code: 'INCOMPLETE_DATA' });
  assert.doesNotThrow(() => r.accept({ id: 's', runId: 'run', seq: 69, reads: [], total: 0 }));
  assert.equal(seen.length, 1);
  assert.throws(() => r.finish('s', { runId: 'run', finalSeq: 69, batches: [] }), { code: 'INCOMPLETE_DATA' });
  r.begin('s', 'next'); assert.equal(r.seq('s'), 0);
});
test('F07: memory UI submits kill password and access password independently', async () => {
  const elements = { '#tm-src': { value: 's' }, '#tm-epc': { value: 'AAAA' }, '#tm-tid': { value: '' }, '#tm-rtid': { checked: false }, '#tm-pwd': { value: '00000000' }, '#tm-clock': {} }, sent = [];
  const c = vm.createContext({ $: s => elements[s], srcById: () => ({ id: 's' }), clean: s => s, tmStatus() {}, tmLock() {}, tmWords() {}, clockStr: String, nameOf: () => 'sim', performance, setInterval, clearInterval, TagScopeValidation: V, wire: () => cfg, toast() {}, backendOf: () => ({ api: async (p, b) => { sent.push(b); return { ok: true }; } }) });
  vm.runInContext(cut(views, 'async function tmOp(', "$('#tm-read').onclick"), c);
  await c.tmOp({ op: 'kill', password: '12345678' }, 'kill'); await c.tmOp({ op: 'read', bank: 'tid', wordCount: 2 }, 'read');
  assert.equal(sent[0].password, '12345678'); assert.equal(sent[1].password, '00000000');
});
test('F08: token, Host and Origin are independent requirements; LAN pages never get token', () => {
  const sec = createSecurity({ host: '127.0.0.1', port: 8080, token: 'a'.repeat(32), allowOrigins: ['https://trusted.example'] });
  const req = { headers: { host: 'localhost:8080', origin: 'https://trusted.example' }, socket: { remoteAddress: '192.168.1.2' } };
  assert(sec.hostOk(req)); assert(sec.originOk(req)); assert(!sec.authorized(req)); assert(!sec.localPage(req));
  req.headers.authorization = 'Bearer ' + 'a'.repeat(32); assert(sec.authorized(req)); req.headers.authorization += 'x'; assert(!sec.authorized(req));
  req.headers.host = 'evil.example:8080'; req.headers.origin = 'http://evil.example:8080'; assert(!sec.hostOk(req)); assert(!sec.originOk(req));
  req.headers.host = 'localhost:8080'; req.headers.origin = 'http://localhost:8080'; req.socket.remoteAddress = '127.0.0.1'; assert(sec.localPage(req));
  req.headers['sec-fetch-site'] = 'cross-site'; assert(!sec.localPage(req));
});
// Exercise the actual HTTP router without a TCP listener, including authenticated SSE.
function request(url, { method = 'GET', headers = {}, body, remoteAddress = '192.168.1.2' } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter(); req.url = url; req.method = method; req.headers = { host: 'localhost:8080', ...headers }; req.socket = { remoteAddress }; req.destroy = () => reject(Error('destroyed'));
    const res = new EventEmitter(); res.headers = {}; res.parts = []; res.setHeader = (k, v) => res.headers[k.toLowerCase()] = v;
    res.writeHead = (code, hs = {}) => { res.status = code; for (const [k, v] of Object.entries(hs)) res.setHeader(k, v); };
    res.write = s => { res.parts.push(s); if (res.headers['content-type'] === 'text/event-stream') resolve(res); return true; };
    res.end = s => { if (s) res.parts.push(s); res.text = res.parts.join(''); resolve(res); }; res.destroy = () => { res.destroyed = true; res.emit('close'); };
    bridge.server.emit('request', req, res); queueMicrotask(() => { if (body) req.emit('data', typeof body === 'string' ? body : JSON.stringify(body)); req.emit('end'); });
  });
}
test('F08: HTTP and SSE reject missing auth; authenticated operations and CORS work', async () => {
  for (const url of ['/api/state', '/api/events', '/api/stop']) { const res = await request(url, url.endsWith('stop') ? { method: 'POST' } : {}); assert.equal(res.status, 401); }
  const auth = { authorization: 'Bearer ' + bridge.security.token };
  assert.equal((await request('/api/state', { headers: auth })).status, 200);
  assert.equal((await request('/api/state', { headers: { ...auth, host: 'evil.example:8080', origin: 'http://evil.example:8080' } })).status, 403);
  assert.equal((await request('/api/state', { headers: { ...auth, origin: 'https://evil.example' } })).status, 403);
  const preflight = await request('/api/stop', { method: 'OPTIONS', headers: { origin: 'https://tagscope.iotrfid.top' } }); assert.equal(preflight.status, 204); assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  assert.equal((await request('/api/stop', { method: 'POST', headers: auth })).status, 415);
  const sse = await request('/api/events', { headers: auth }); assert.equal(sse.status, 200); assert.match(sse.parts[0], /sequenced-batches/); sse.emit('close');
  const lan = await request('/'); assert(!lan.text.includes('window.TAGSCOPE_BRIDGE_TOKEN=')); assert.match(lan.headers['content-security-policy'], /script-src 'self' 'nonce-/);
  const local = await request('/', { remoteAddress: '127.0.0.1' }); assert(local.text.includes('window.TAGSCOPE_BRIDGE_TOKEN='));
  const nonce = local.headers['content-security-policy'].match(/'nonce-([^']+)'/)[1];
  assert(local.text.includes(`<script nonce="${nonce}">window.TAGSCOPE_BRIDGE_TOKEN=`));
});
test('bridge simulator HTTP start/stop seals final batch with matching run ID', async () => {
  const headers = { authorization: 'Bearer ' + bridge.security.token, 'content-type': 'application/json' };
  const post = async (op, body) => { const res = await request('/api/' + op, { method: 'POST', headers, body }); assert.equal(res.status, 200, res.text); return JSON.parse(res.text); };
  await post('connect', { id: 'simtest', driver: 'sim', simTags: 2 }); await post('start', { id: 'simtest', cfg, runId: 'test-round' });
  bridge.onTag(bridge.sources.get('simtest'), { epc: 'AAAA', antenna: 1, ts: Date.now() });
  const stopped = await post('stop', { id: 'simtest', runId: 'test-round', afterSeq: 0 }); assert.equal(stopped.runId, 'test-round'); assert.equal(stopped.finalSeq, 1); assert(stopped.batches[0].reads.some(r => r.epc === 'AAAA')); await post('disconnect', { id: 'simtest' });
});
test('mock validator rejects malformed nested containers instead of swallowing errors', () => {
  const { validate } = require('./mock-llrp-reader'); assert.throws(() => validate(tlv(P.ROBoundarySpec, Buffer.from([0, 1, 0, 0])))); assert.throws(() => validate(tlv(P.AISpec, u16(3))));
});
test('LLRP ignores a report for the wrong operation rather than falsely confirming a write', async () => {
  const d = accessDriver();
  d.call = async type => { if (type === MSG.ENABLE_ACCESSSPEC) d._onTag({ epc: 'AAAA', accessSpecId: [...d.access.keys()][0], ops: [{ kind: 'read', opSpecId: 1, result: 0 }] }); };
  const r = await d.accessOp({ ...write, timeout: 0.005 }); assert.equal(r.ok, false); assert.equal(r.outcome, 'unknown');
});
test('REST stop drains delayed reports and a complete final record without newline', async () => {
  const d = new RestDriver(), stream = restStream(), tags = []; d.on('tag', t => tags.push(t));
  const report = epc => JSON.stringify({ tagInventoryEvent: { epcHex: epc, antennaPort: 1 } });
  d._req = async (method, path) => { if (path === '/data/stream') return stream; if (path === '/profiles/stop') setTimeout(() => stream.res.emit('data', report('AAAA') + '\n' + report('BBBB')), 10); return {}; };
  await d.start(cfg); await d.stop(); assert.deepEqual(tags.map(t => t.epc), ['AAAA', 'BBBB']);
});
test('browser simulator stop delivers its last pending batch before sealing the run', async () => {
  const delivered = [], c = vm.createContext({ VERSION: 'test', TagScopeRunBuffer: { RunBuffer, Receiver }, handlers: { tags: b => delivered.push(b) }, setInterval: () => 1, TagScopeValidation: V });
  vm.runInContext(cut(app, 'function makeLocal()', 'function backendOf(') + '\nvar local = makeLocal();', c);
  c.local.sims.set('s', { running: true, stop() { this.running = false; }, info: {} }); c.local.receiver.begin('s', 'local-round');
  const buffer = new RunBuffer('s', 'local-round'); buffer.add({ epc: 'AAAA', antenna: 1, ts: 1 }); c.local.batches.set('s', buffer);
  const result = await c.local.api('stop', { id: 's', runId: 'local-round' }); assert.equal(result.finalSeq, 1); assert.equal(delivered.length, 1); assert.equal(delivered[0].total, 1);
});
test('frontend disconnect failure retains connected/unknown state for retry', async () => {
  const r = { connected: true, running: true }, c = vm.createContext({ rt: () => r, backendOf: () => ({ api: async () => { throw Error('stop lost'); } }), applySrcState() {} });
  vm.runInContext(cut(app, 'async function disconnectSource(', 'function applySrcState('), c);
  await assert.rejects(c.disconnectSource({ id: 's' })); assert.equal(r.connected, true); assert.equal(r.status, 'unknown'); assert.equal(r.running, true);
});
test('fixed token containing HTML cannot terminate local bootstrap script', async () => {
  const original = bridge.security.token; bridge.security.token = '</script><script>alert(1)</script>';
  try { const res = await request('/', { remoteAddress: '127.0.0.1' }); assert(!res.text.includes(bridge.security.token)); assert(res.text.includes('\\u003c/script>')); } finally { bridge.security.token = original; }
});
test('Worker text assets and HTML reference all new scripts with content hashes', async () => {
  const path = require('node:path'); let worker = fs.readFileSync(require.resolve('../worker.js'), 'utf8');
  worker = worker.replace(/^import (\w+) from '([^']+)';.*$/gm, (_, name, file) => {
    const text = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    return `const ${name} = ${file.endsWith('.json') ? `JSON.parse(${JSON.stringify(text)})` : JSON.stringify(text)};`;
  }).replace('export default {', 'globalThis.worker = {');
  const c = vm.createContext({ URL, Response }); vm.runInContext(worker, c);
  const pageRes = await c.worker.fetch({ url: 'https://example.com/', method: 'GET' });
  const page = await pageRes.text(); assert(page.includes('window.TAGSCOPE_CLOUD=1')); assert.match(pageRes.headers.get('content-security-policy'), /sha256-/);
  assert(page.includes(`name="tagscope-version" content="${require('../package.json').version}"`), 'Worker must inject the package version');
  const inline = page.match(/<script>([^<]+)<\/script>/)[1];
  const digest = require('node:crypto').createHash('sha256').update(inline).digest('base64');
  assert(pageRes.headers.get('content-security-policy').includes(`'sha256-${digest}'`), 'CSP hash must match the inline cloud flag');
  for (const match of page.matchAll(/src="([\w-]+\.js)\?v=([^"<]+)"/g)) { assert.notEqual(match[2], require('../package.json').version); const res = await c.worker.fetch({ url: 'https://example.com/' + match[1], method: 'GET' }); assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /javascript/); assert((await res.text()).length > 100); }
  assert.equal((await c.worker.fetch({ url: 'https://example.com/api/start', method: 'POST' })).status, 405);
});
test('lost ADD acknowledgement plus failed deletion reports cleanup as unconfirmed', async () => {
  const d = accessDriver(); let fault; d.on('fault', f => fault = f);
  d.call = async type => { d.commands.push(type); throw Error('connection lost'); };
  const r = await d.accessOp(write); assert.equal(r.ok, false); assert.equal(r.cleanupOk, false); assert(fault); assert(!d.commands.includes(MSG.ENABLE_ACCESSSPEC));
});
test('REST driver is explicitly inventory-only', async () => {
  const d = new RestDriver();
  d._req = async (method, path) => path === '/status' ? { serialNumber: 'R700-TEST' } : {};
  const info = await d.connect({ host: 'reader.local' });
  assert.equal(info.supportsAccess, false);
  assert.equal(info.supportsGpi, false);
  assert.match(info.accessNote, /仅支持盘点/);
  await assert.rejects(d.accessOp({ op: 'read', targetEpc: 'AAAA', bank: 'epc', wordPointer: 0, wordCount: 1 }), /仅支持盘点/);
});
test('version comes from package.json and is injected into the page', async () => {
  const pkg = require('../package.json');
  assert.equal(bridge.state().version, pkg.version);
  const res = await request('/');
  assert(res.text.includes(`name="tagscope-version" content="${pkg.version}"`));
  assert(!/\?v=\d+\.\d+\.\d+/.test(res.text), 'index.html must not hardcode a version query');
});
test('version bump helper follows semver and rejects bad input', () => {
  const { bump } = require('../scripts/bump-version');
  assert.equal(bump('2.0.1'), '2.0.2');
  assert.equal(bump('2.0.1', 'patch'), '2.0.2');
  assert.equal(bump('2.0.1', 'minor'), '2.1.0');
  assert.equal(bump('2.0.1', 'major'), '3.0.0');
  assert.equal(bump('2.0.1-rc.1', 'patch'), '2.0.2');
  assert.throws(() => bump('2.0', 'patch'), /无法解析版本号/);
  assert.throws(() => bump('2.0.1', 'huge'), /未知的版本级别/);
});
test('version bump helper updates the declared version in README and guides', () => {
  const { bumpDocText } = require('../scripts/bump-version');
  assert.equal(bumpDocText('当前版本：**2.0.2**', '2.0.3'), '当前版本：**2.0.3**');
  assert.equal(bumpDocText('Current version: **2.0.2**', '2.0.3'), 'Current version: **2.0.3**');
  assert.equal(bumpDocText('适用版本：TagScope 2.0.2（网页版与桥接服务）', '2.0.3'), '适用版本：TagScope 2.0.3（网页版与桥接服务）');
  assert.equal(bumpDocText('Version: TagScope 2.0.2 (web app and bridge)', '2.0.3'), 'Version: TagScope 2.0.3 (web app and bridge)');
  // 历史兼容说明不是版本声明，不能被改写。
  assert.equal(bumpDocText('2.0.1 网页版需要 2.0.1 及以上的桥接服务', '2.0.3'), '2.0.1 网页版需要 2.0.1 及以上的桥接服务');
});
test('unique tag cap stops new EPCs but keeps existing statistics', () => {
  const ctx = vm.createContext({
    MAX_TAGS: 2, tags: new Map(), tagList: [], srcStats: {}, totalReads: 0, rateBuf: [], readLog: [], order: 0,
    run: { parts: ['s'], t0: Date.now() - 1000, phase: 'on', activeRuns: { s: 'r' }, power: null, runRows: [] },
    O: { scen: 'continuous', rwin: 0 }, handlers: {}, store: { get: () => false }, srcById: () => ({ iface: 'sim' }), nameOf: () => 'sim',
    clean: s => s, addLog() {}, toast() {}, logTruncated: false, runLogTruncated: false, hasTid: false, tagsTruncated: false, droppedTags: 0,
  });
  vm.runInContext(cut(views, 'handlers.tags = b =>', 'function readRate('), ctx);
  const batch = epc => ({ id: 's', runId: 'r', total: 1, reads: [{ epc, antenna: 1, count: 1, rssi: -50, ts: Date.now() }] });
  for (const epc of ['AAAA', 'BBBB', 'CCCC']) ctx.handlers.tags(batch(epc));
  assert.equal(ctx.tags.size, 2);
  assert.equal(ctx.tagList.length, 2);
  assert.equal(ctx.tagsTruncated, true);
  assert.equal(ctx.droppedTags, 1);
  assert.equal(ctx.totalReads, 3);
  ctx.handlers.tags(batch('AAAA'));
  assert.equal(ctx.tags.get('AAAA').count, 2);
});
test('unique CSV export carries the tag-cap warning', () => {
  const ctx = vm.createContext({
    VERSION: '2.0.1', MAX_TAGS: 200000, tagsTruncated: true, droppedTags: 7, lastRun: { incomplete: false },
    visCols: () => ['epc'], rowsSorted: () => [{ epc: 'AAAA' }], csvCell: v => String(v), _T: s => s,
    CK: { epc: { l: 'EPC' } }, cellStr: (t, k) => t[k],
  });
  vm.runInContext(cut(views, 'function uniqueHeader(', "$('#lg-on')"), ctx);
  const csv = ctx.uniqueCsv();
  assert.match(csv, /# WARNING: unique tag limit 200000 reached; 7 reads of new EPCs were not counted/);
  assert.match(csv, /# Data completeness: complete/);
  assert(csv.split('\n').includes('EPC'));
  assert(csv.trim().endsWith('AAAA'));
  ctx.tagsTruncated = false;
  assert.doesNotMatch(ctx.uniqueCsv(), /WARNING/);
});
test('opening tag memory for a tag whose source was deleted does not throw', () => {
  const els = {};
  for (const id of ['#tm-epc', '#tm-tid', '#tm-repc', '#tm-bank', '#tm-off', '#tm-cnt']) els[id] = { value: '', checked: false };
  const status = [];
  const ctx = vm.createContext({
    $: s => els[s], show() {}, tmRenderSrc() {}, tmModel() {}, tmWords() {},
    srcById: () => undefined,
    infoOf: s => { if (!s) throw Error('infoOf called without a source'); return {}; },
    tmStatus: (c, m) => status.push([c, m]),
  });
  vm.runInContext(cut(views, 'function openMemory(', 'function tmStatus('), ctx);
  assert.doesNotThrow(() => ctx.openMemory({ epc: 'AAAA', from: 'gone' }));
  assert.equal(status.length, 1);
  assert.equal(status[0][0], 'bad');
  assert.match(status[0][1], /已被删除/);
});
test('REST filters map both match and miss actions to include/exclude', () => {
  const d = new RestDriver();
  const base = { antennas: [{ id: 1, enabled: true, txDbm: 30 }], mode: 2, session: 1, searchMode: 2, tagPopulation: 32 };
  const action = (match, miss) => d.buildPreset({ ...base, filters: [{ mask: 'E280', bank: 'epc', pointer: 32, bits: 16, match, miss }] }).antennaConfigs[0].filtering.filters[0].action;
  assert.equal(action('select', 'unselect'), 'include');
  assert.equal(action('unselect', 'nothing'), 'exclude');
  assert.equal(action('nothing', 'select'), 'exclude');
  assert.equal(action('nothing', 'unselect'), 'include');
  assert.equal(d.buildPreset({ ...base, filters: [{ mask: 'E280', bank: 'epc', pointer: 32, bits: 16, match: 'nothing', miss: 'nothing' }] }).antennaConfigs[0].filtering, undefined);
});
test('simulator treats permaunlock as writable and lock as protected', async () => {
  const Sim = require('../public/sim'); const sim = new Sim(); sim.connect({ simTags: 1 });
  const t = sim.tags[0]; t.reserved = '00000000' + '12345678'; t.locks.user = 'permaunlock';
  const ok = await sim.accessOp({ op: 'write', targetEpc: t.epc, bank: 'user', wordPointer: 0, data: '1234', password: '00000000', timeout: 1 });
  assert.equal(ok.ok, true);
  t.locks.user = 'lock';
  const blocked = await sim.accessOp({ op: 'write', targetEpc: t.epc, bank: 'user', wordPointer: 0, data: '5678', password: '00000000', timeout: 1 });
  assert.equal(blocked.ok, false);
});
test('REST connect cannot silently ignore failure to stop an already running reader', async () => {
  const d = new RestDriver(); d._req = async (method, path) => { if (path === '/status') return { status: 'running' }; if (path === '/profiles/stop') throw Error('stop refused'); return {}; };
  await assert.rejects(d.connect({ host: 'mock' }), /stop refused/);
});
test('stopAll reports a changed run even when another source is merely incomplete', async () => {
  const run = { activeRuns: { a: 'ra', b: 'rb' }, incomplete: false };
  const c = vm.createContext({ run, backendOf: s => ({ api: async () => { const e = Error(s.id === 'a' ? '运行已改变，请刷新状态后再停止' : '标签数据流缺失'); e.code = s.id === 'a' ? 'RUN_CHANGED' : 'INCOMPLETE_DATA'; throw e; } }), applySrcState() {}, addLog() {}, toast() {} });
  vm.runInContext(cut(views, 'async function stopAll(', 'async function wait('), c);
  await assert.rejects(c.stopAll([{ id: 'a' }, { id: 'b' }]), e => e.runChanged === true);
  assert.equal(run.incomplete, true);
  const onlyIncomplete = vm.createContext({ run: { activeRuns: {}, incomplete: false }, backendOf: () => ({ api: async () => { const e = Error('标签数据流缺失'); e.code = 'INCOMPLETE_DATA'; throw e; } }), applySrcState() {}, addLog() {}, toast() {} });
  vm.runInContext(cut(views, 'async function stopAll(', 'async function wait('), onlyIncomplete);
  await assert.doesNotReject(onlyIncomplete.stopAll([{ id: 'a' }]));
});
test('plaintext reader credentials migrate to sessionStorage and the v1 record is removed', () => {
  const load = (stored, legacy) => {
    const ls = new Map(), ss = new Map();
    if (stored) ls.set('tagscope.sources', JSON.stringify(stored));
    if (legacy) ls.set('tagscope.source', JSON.stringify(legacy));
    const localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
    const sessionStorage = { getItem: k => ss.has(k) ? ss.get(k) : null, setItem: (k, v) => ss.set(k, String(v)), removeItem: k => ss.delete(k) };
    const c = vm.createContext({ window: {}, location: { protocol: 'http:' }, localStorage, sessionStorage, uid: () => 'id1', setTimeout, clearTimeout });
    vm.runInContext(cut(app, 'const store =', 'let view ='), c);
    return { ls, ss };
  };
  const v1 = load(null, { host: '10.0.0.9', driver: 'llrp', user: 'root', pass: 'impinj' });
  assert.equal(v1.ls.has('tagscope.source'), false);
  const persisted = JSON.parse(v1.ls.get('tagscope.sources'))[0];
  assert.equal(persisted.user, undefined); assert.equal(persisted.pass, undefined);
  assert.deepEqual(JSON.parse(v1.ss.get('tagscope.cred.id1')), { user: 'root', pass: 'impinj' });
  const v2 = load([{ id: 's1', host: 'r', iface: 'rest', cred: true, user: 'root', pass: 'impinj', presets: {}, active: 'default' }], null);
  assert.equal(JSON.parse(v2.ls.get('tagscope.sources'))[0].pass, undefined);
  assert.deepEqual(JSON.parse(v2.ss.get('tagscope.cred.s1')), { user: 'root', pass: 'impinj' });
});
