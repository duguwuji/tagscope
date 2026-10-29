'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Impinj R700 / R660 IoT Device Interface (REST) driver
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');

const SEARCH = { 1: 'single-target', 2: 'dual-target', 3: 'single-target-with-tagfocus', 5: 'single-target-reset', 6: 'dual-target-with-reset' };
const PRESET = 'tagscope';

class RestDriver extends EventEmitter {
  constructor() { super(); this.kind = 'rest'; this.running = false; this.stream = null; }
  _req(method, path, body, { stream = false, timeout = 10000 } = {}) {
    const o = this.opt, lib = o.tls ? https : http;
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const r = lib.request({ host: o.host, port: o.port, method, path: '/api/v1' + path, rejectUnauthorized: !o.insecure, timeout: stream ? 0 : timeout,
        auth: `${o.user}:${o.pass}`, headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, res => {
        if (stream && res.statusCode < 300) return resolve({ res, req: r });
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => {
          const txt = Buffer.concat(chunks).toString(); let json = null; try { json = txt ? JSON.parse(txt) : null; } catch (_) { }
          if (res.statusCode >= 300) { const m = json ? (Array.isArray(json) ? json.map(x => x.message || JSON.stringify(x)).join('；') : json.message || JSON.stringify(json)) : txt; return reject(new Error(`${method} ${path} → HTTP ${res.statusCode} ${m}`)); }
          this.emit('log', 'debug', `${method} ${path} → ${res.statusCode}`); resolve(json);
        });
      });
      r.on('timeout', () => r.destroy(new Error(`${method} ${path} 超时`)));
      r.on('error', reject); if (data) r.write(data); r.end();
    });
  }
  async connect({ host, port, user = 'root', pass = 'impinj', insecure = true, tls = true }) {
    this.opt = { host, port: +port || (tls ? 443 : 80), user, pass, insecure, tls };
    const status = await this._req('GET', '/status');
    let iface = null; try { iface = (await this._req('GET', '/system/rfid/interface')).rfidInterface; } catch (_) { }
    if (iface && iface !== 'rest') throw new Error(`读写器当前 RFID 接口为 "${iface}"，请在读写器网页中切换为 REST（或改用 LLRP 驱动）`);
    let sys = {}; try { sys = await this._req('GET', '/system/image') || {}; } catch (_) { }
    let region = {}; try { region = await this._req('GET', '/system/region') || {}; } catch (_) { }
    if (status && status.status === 'running') { try { await this._req('POST', '/profiles/stop'); } catch (_) { } }
    const tx = []; for (let d = 10; d <= 33; d += 0.25) tx.push(d);
    this.info = {
      driver: 'R700 REST', host, model: 'Impinj R700 系列（IoT Device Interface）', serial: status?.serialNumber || '',
      firmware: sys.primaryFirmware || sys.firmware || '', region: region.operatingRegion || '', antennaCount: 4,
      txPower: tx, txPowerMin: 10, txPowerMax: 33, rxSensitivity: [-92, -90, -85, -80, -75, -70, -65, -60, -55, -50].map(d => ({ index: d, dbm: d })),
      modes: [], supportsAccess: false, supportsDoppler: false, antennas: [1, 2, 3, 4].map(id => ({ id, connected: true })),
    };
    return this.info;
  }
  buildPreset(cfg) {
    const ants = (cfg.antennas || []).filter(a => a.enabled);
    if (!ants.length) throw new Error('请至少启用一个天线');
    const f = cfg.filter && cfg.filter.enabled && cfg.filter.mask ? { filters: [{ action: cfg.filter.action === 'exclude' ? 'exclude' : 'include', tagMemoryBank: cfg.filter.bank || 'epc', bitOffset: +cfg.filter.pointer || 0, mask: cfg.filter.mask.replace(/\s/g, ''), ...(cfg.filter.maskBits ? { maskLength: +cfg.filter.maskBits } : {}) }] } : undefined;
    return {
      eventConfig: { common: { hostname: 'disabled' }, tagInventory: { tagReporting: { reportingIntervalSeconds: 0, tagCacheSize: 2048, antennaIdentifier: 'antennaPort', tagIdentifier: 'epc' },
        epcHex: 'enabled', epc: 'disabled', tidHex: cfg.fastId ? 'enabled' : 'disabled', tid: 'disabled', antennaPort: 'enabled', transmitPowerCdbm: 'enabled', peakRssiCdbm: 'enabled', frequency: 'enabled', pc: 'enabled', lastSeenTime: 'enabled', phaseAngle: 'enabled' } },
      antennaConfigs: ants.map(a => ({ antennaPort: a.id, transmitPowerCdbm: Math.round(+a.txDbm * 100), rfMode: +cfg.mode || 0, inventorySession: +cfg.session || 0,
        ...(SEARCH[+cfg.searchMode] ? { inventorySearchMode: SEARCH[+cfg.searchMode] } : {}), estimatedTagPopulation: +cfg.tagPopulation || 16,
        fastId: cfg.fastId ? 'enabled' : 'disabled', ...(a.rxDbm !== '' && a.rxDbm != null && +a.rxDbm > -92 ? { receiveSensitivityDbm: +a.rxDbm } : {}), ...(f ? { filtering: f } : {}) })),
    };
  }
  async start(cfg) {
    await this._req('PUT', `/profiles/inventory/presets/${PRESET}`, this.buildPreset(cfg));
    await this._openStream();
    await this._req('POST', `/profiles/inventory/presets/${PRESET}/start`);
    this.running = true;
  }
  async _openStream() {
    this._closeStream();
    const { res, req } = await this._req('GET', '/data/stream', undefined, { stream: true });
    this.stream = req; let buf = '';
    res.setEncoding('utf8');
    res.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this._onLine(line); } });
    res.on('end', () => { if (this.running) this.emit('log', 'warn', '数据流已结束'); });
    res.on('error', () => { });
  }
  _closeStream() { if (this.stream) { try { this.stream.destroy(); } catch (_) { } this.stream = null; } }
  _onLine(line) {
    let e; try { e = JSON.parse(line); } catch (_) { return; }
    const t = e.tagInventoryEvent; if (!t) { if (e.eventType && e.eventType !== 'tagInventory') this.emit('log', 'debug', `事件 ${e.eventType}`); return; }
    const epc = (t.epcHex || (t.epc ? Buffer.from(t.epc, 'base64').toString('hex') : '')).toUpperCase(); if (!epc) return;
    const tid = (t.tidHex || (t.tid ? Buffer.from(t.tid, 'base64').toString('hex') : '')).toUpperCase() || undefined;
    this.emit('tag', { epc, tid, antenna: t.antennaPort, rssi: t.peakRssiCdbm != null ? t.peakRssiCdbm / 100 : undefined, phase: t.phaseAngle, freq: t.frequency ? t.frequency / 1000 : undefined, pc: t.pc, count: 1, ts: Date.now() });
  }
  async stop() { this.running = false; try { await this._req('POST', '/profiles/stop'); } finally { setTimeout(() => this._closeStream(), 500); } }
  async accessOp() { throw new Error('R700 REST 接口不支持标签读写/锁定/灭活。请在读写器网页将 RFID 接口切换为 LLRP，并使用 LLRP 驱动'); }
  async disconnect() { if (this.running) await this.stop().catch(() => { }); this._closeStream(); this.emit('disconnected'); }
}
module.exports = { RestDriver };
