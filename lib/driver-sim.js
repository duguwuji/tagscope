'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Simulator driver: no hardware; all data is synthetic and flagged as SIM in the UI.
const { EventEmitter } = require('events');
const rnd = (a, b) => a + Math.random() * (b - a);
const hex = n => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const RES = { read: '成功', write: '成功' };

class SimDriver extends EventEmitter {
  constructor() { super(); this.kind = 'sim'; this.running = false; this.timer = null; }
  async connect({ simTags = 40 }) {
    this.tags = Array.from({ length: Math.max(1, Math.min(2000, +simTags || 40)) }, (_, i) => {
      const epc = 'E28011700000' + hex(12);
      return { epc, tid: 'E2801170' + '2000' + hex(12), user: '0'.repeat(128), reserved: '0000000000000000', base: rnd(-72, -38), angle: rnd(0, 360), ant: 1 + (i % 4), killed: false, pc: '3000' };
    });
    this.info = { driver: '模拟器', host: 'simulator', model: '模拟读写器（非真实设备）', serial: 'SIM-0001', firmware: 'sim-1.0', antennaCount: 4,
      txPower: Array.from({ length: 81 }, (_, i) => 10 + i * 0.25), txPowerMin: 10, txPowerMax: 30,
      rxSensitivity: [-80, -75, -70, -65, -60, -55, -50].map((d, i) => ({ index: i + 1, dbm: d })),
      modes: [[0, 'Max Throughput'], [1, 'Hybrid'], [2, 'Dense Reader M4'], [3, 'Dense Reader M8'], [4, 'MaxMiller'], [1000, 'AutoSet Dense Reader'], [1002, 'AutoSet Static']].map(([id, n]) => ({ id, label: `${id} · ${n}` })),
      supportsAccess: true, supportsDoppler: true, antennas: [1, 2, 3, 4].map(id => ({ id, connected: id <= 4 })) };
    return this.info;
  }
  async start(cfg) {
    this.cfg = cfg; this.running = true;
    const ants = cfg.antennas.filter(a => a.enabled);
    if (!ants.length) throw new Error('请至少启用一个天线');
    const rate = { 0: 1100, 1: 800, 2: 450, 3: 300, 4: 600, 1000: 700, 1002: 900 }[+cfg.mode] || 600;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const n = Math.round(rate / 20 * rnd(0.7, 1.3));
      for (let i = 0; i < n; i++) {
        const a = ants[Math.floor(Math.random() * ants.length)], t = this.tags[Math.floor(Math.random() * this.tags.length)];
        if (t.killed) continue;
        const rssi = t.base + (a.txDbm - 30) * 0.9 - (t.ant === a.id ? 0 : rnd(4, 14)) + rnd(-2, 2);
        if (rssi < (+a.rxDbm || -80)) continue;
        if (cfg.filter?.enabled && cfg.filter.mask && cfg.filter.bank === 'epc') {
          const m = cfg.filter.mask.replace(/\s/g, '').toUpperCase(), off = Math.max(0, (+cfg.filter.pointer - 32) / 4), hit = t.epc.substr(off, m.length) === m;
          if (hit === (cfg.filter.action === 'exclude')) continue;
        }
        t.angle = (t.angle + rnd(-6, 6) + 360) % 360;
        const ch = 1 + Math.floor(Math.random() * 50);
        this.emit('tag', { epc: t.epc, tid: cfg.fastId ? t.tid : undefined, antenna: a.id, rssi: Math.round(rssi * 2) / 2, phase: +t.angle.toFixed(1), doppler: cfg.doppler ? +rnd(-3, 3).toFixed(2) : undefined, channel: ch, freq: 902.75 + (ch - 1) * 0.5, pc: t.pc, count: 1, ts: Date.now() });
      }
    }, 50);
  }
  async stop() { this.running = false; clearInterval(this.timer); }
  async accessOp(r) {
    const target = (r.targetEpc || '').replace(/\s/g, '').toUpperCase();
    const t = target ? this.tags.find(x => x.epc === target && !x.killed) : this.tags[0];
    await new Promise(res => setTimeout(res, 150));
    if (!t) return { ok: false, op: r.op, message: '超时（未找到目标标签）' };
    const mem = b => b === 'epc' ? t.pc + t.epc : b === 'tid' ? t.tid : b === 'user' ? t.user : t.reserved;
    if (r.op === 'read') { const m = r.bank === 'epc' ? '0000' + mem('epc') : mem(r.bank), p = (+r.wordPointer || 0) * 4, c = (+r.wordCount || (m.length / 4 - (+r.wordPointer || 0))) * 4; if (p + c > m.length) return { ok: false, op: 'read', result: 4, message: '存储区越界' }; return { ok: true, op: 'read', epc: t.epc, message: RES.read, data: m.substr(p, c) }; }
    if (r.op === 'write') { const d = (r.data || '').replace(/\s/g, '').toUpperCase(); if (r.bank === 'user') { const p = (+r.wordPointer || 0) * 4; t.user = (t.user.slice(0, p) + d + t.user.slice(p + d.length)).slice(0, 128); } else if (r.bank === 'reserved') { const p = (+r.wordPointer || 0) * 4; t.reserved = (t.reserved.slice(0, p) + d + t.reserved.slice(p + d.length)).slice(0, 16); } else if (r.bank === 'tid') return { ok: false, op: 'write', result: 2, message: '存储区已锁定' }; return { ok: true, op: 'write', epc: t.epc, message: '成功', words: d.length / 4 }; }
    if (r.op === 'writeEpc') { const d = (r.data || '').replace(/\s/g, '').toUpperCase(); t.epc = d; t.pc = (((d.length / 4) << 11) | 0).toString(16).padStart(4, '0').toUpperCase(); return { ok: true, op: 'write', epc: d, message: '成功', words: d.length / 4 }; }
    if (r.op === 'lock') return { ok: true, op: 'lock', epc: t.epc, message: '成功' };
    if (r.op === 'kill') { if (!parseInt(r.password || '0', 16)) return { ok: false, op: 'kill', result: 1, message: '灭活密码为 0' }; t.killed = true; return { ok: true, op: 'kill', epc: t.epc, message: '成功' }; }
    throw new Error('未知操作');
  }
  async disconnect() { await this.stop(); this.emit('disconnected'); }
}
module.exports = { SimDriver };
