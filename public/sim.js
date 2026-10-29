// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Reader simulator core, shared by the browser (offline / cloud demo) and the Node bridge (driver-sim).
// All data is synthetic. Models Gen2 Select (SL), session flags A/B, power thresholds, GPI/GPO and tag memory.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TagScopeSim = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hex = n => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  const clean = s => String(s || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  // [TID prefix (8 hex), weight]
  const CHIPS = [['E2801191', 4], ['E2801170', 3], ['E2806915', 2], ['E2003412', 1], ['E2801150', 1], ['E28011A0', 1]];
  const pickChip = () => { const tot = CHIPS.reduce((s, c) => s + c[1], 0); let r = Math.random() * tot; for (const c of CHIPS) { if ((r -= c[1]) < 0) return c[0]; } return CHIPS[0][0]; };
  const toBits = h => [...clean(h)].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  // Gen2 Select actions: [match, miss] → LLRP StateUnaware action code
  const ACT = { 'select,unselect': 0, 'select,nothing': 1, 'nothing,unselect': 2, 'unselect,nothing': 3, 'unselect,select': 4, 'nothing,select': 5 };

  class Sim {
    constructor(emit) { this.emit = emit || (() => { }); this.running = false; this.armed = false; this.timer = null; this.gpiState = {}; this.gpoState = {}; }
    connect({ simTags = 40, host = 'simulator' } = {}) {
      const n = Math.max(1, Math.min(2000, +simTags || 40));
      this.tags = Array.from({ length: n }, (_, i) => {
        const tid = pickChip() + '2000' + hex(12), epc = 'E28011700000' + hex(12);
        return { epc, tid, pc: '3000', user: '0'.repeat(128), reserved: '0'.repeat(16), base: rnd(-70, -40), thr: rnd(12, 27), angle: rnd(0, 360), ant: 1 + (i % 4), killed: false, flag: [0, 0, 0, 0], decay: [0, 0, 0, 0], locks: {} };
      });
      this.info = {
        driver: 'SIM', host, model: '模拟读写器（非真实设备）', modelCode: 0, serial: 'SIM-' + hex(6), firmware: 'sim-2.0', region: 'FCC Part 15.247（模拟）', manufacturer: 'TagScope',
        antennaCount: 4, gpi: 4, gpo: 4, impinjExtensions: true,
        txPower: Array.from({ length: 81 }, (_, i) => 10 + i * 0.25), txPowerMin: 10, txPowerMax: 30,
        rxSensitivity: [-80, -75, -70, -65, -60, -55, -50, -45, -40].map((d, i) => ({ index: i + 1, dbm: d })),
        modes: [[0, 'Max Throughput'], [1, 'Hybrid'], [2, 'Dense Reader M4'], [3, 'Dense Reader M8'], [4, 'MaxMiller'], [1000, 'AutoSet Dense Reader'], [1002, 'AutoSet Dense Reader Deep Scan'], [1003, 'AutoSet Static Fast'], [1004, 'AutoSet Static DRM']].map(([id, l]) => ({ id, label: `${id} - ${l}` })),
        supportsAccess: true, supportsDoppler: true, supportsGpi: true, supportsBlockWrite: true, antennas: [1, 2, 3, 4].map(id => ({ id, connected: true })),
      };
      return this.info;
    }
    _selected(t, filters) {
      if (!filters || !filters.length) return true;
      let sl = false;
      for (const f of filters) {
        const bank = f.bank || 'epc', mem = bank === 'epc' ? '0000' + t.pc + t.epc : bank === 'tid' ? t.tid : bank === 'user' ? t.user : t.reserved;
        const bits = toBits(mem), mask = toBits(f.mask).slice(0, f.bits === '' || f.bits == null ? undefined : +f.bits), p = +f.pointer || 0;
        const hit = bits.substr(p, mask.length) === mask;
        const a = hit ? f.match : f.miss;
        if (a === 'select') sl = true; else if (a === 'unselect') sl = false;
      }
      return sl;
    }
    start(cfg) {
      this.cfg = cfg;
      const ants = (cfg.antennas || []).filter(a => a.enabled);
      if (!ants.length) throw new Error('请至少启用一个天线');
      clearInterval(this.timer); this.running = true;
      if (cfg.gpi && cfg.gpi.start) { this.armed = false; this.emit('log', 'info', `已就绪，等待 GPI ${cfg.gpi.start.port} ${cfg.gpi.start.level === 'high' ? '高' : '低'}电平启动`); return; }
      this._arm(cfg);
    }
    _arm(cfg) {
      const ants = cfg.antennas.filter(a => a.enabled);
      this.armed = true; this.emit('rospec', 'start');
      const rate = { 0: 1100, 1: 800, 2: 450, 3: 300, 4: 600, 1000: 700, 1002: 650, 1003: 750, 1004: 400 }[+cfg.mode] || 600;
      const S = +cfg.session || 0, mode = +cfg.searchMode || 2;
      const sel = new Map(this.tags.map(t => [t, this._selected(t, cfg.filters)]));
      this.timer = setInterval(() => {
        const now = Date.now();
        const n = Math.round(rate / 20 * rnd(0.7, 1.3));
        for (let i = 0; i < n; i++) {
          const a = ants[Math.floor(Math.random() * ants.length)], t = this.tags[Math.floor(Math.random() * this.tags.length)];
          if (t.killed || !sel.get(t)) continue;
          if (+a.txDbm < t.thr - (t.ant === a.id ? 0 : -4)) continue; // tag not energised
          // session flags: S1 decays in 0.5–5 s, S2/S3 persist while simulator runs
          if (t.flag[S] === 1 && S === 1 && now > t.decay[S]) t.flag[S] = 0;
          if (mode === 5) { t.flag[S] = 0; continue; } // Single Target Reset: B → A, no reports
          if (S > 0 && (mode === 1 || mode === 3) && t.flag[S] === 1) continue; // single target: B tags stay silent
          if (S > 0 && (mode === 1 || mode === 3)) { t.flag[S] = 1; t.decay[S] = now + rnd(500, 5000); }
          const rssi = t.base + (+a.txDbm - 30) * 0.9 - (t.ant === a.id ? 0 : rnd(4, 14)) + rnd(-2, 2);
          if (rssi < (a.rxDbm === '' || a.rxDbm == null ? -80 : +a.rxDbm)) continue;
          t.angle = (t.angle + rnd(-6, 6) + 360) % 360;
          const ch = 1 + Math.floor(Math.random() * 50);
          this.emit('tag', { epc: t.epc, tid: cfg.fastId ? t.tid : undefined, antenna: a.id, rssi: Math.round(rssi * 2) / 2, phase: cfg.phase === false ? undefined : +t.angle.toFixed(1),
            doppler: cfg.doppler ? +rnd(-3, 3).toFixed(2) : undefined, channel: ch, freq: 902.75 + (ch - 1) * 0.5, pc: t.pc, power: +a.txDbm, count: 1, ts: now, rts: now * 1000 });
        }
      }, 50);
    }
    _disarm() { clearInterval(this.timer); if (this.armed) { this.armed = false; this.emit('rospec', 'end'); } }
    stop() { this.running = false; this._disarm(); for (const t of this.tags || []) { t.flag[1] = 0; } }
    setGpi(port, level) {
      this.gpiState[port] = level; this.emit('gpi', { port, level });
      const g = this.running && this.cfg && this.cfg.gpi; if (!g) return;
      const lv = level ? 'high' : 'low';
      if (!this.armed && g.start && +g.start.port === +port && g.start.level === lv) this._arm(this.cfg);
      else if (this.armed && g.stop && +g.stop.port === +port && g.stop.level === lv) this._disarm();
    }
    setGpo(port, state) { this.gpoState[port] = !!state; return { port, state: !!state }; }
    async accessOp(r) {
      const tEpc = clean(r.targetEpc), tTid = clean(r.targetTid);
      const t = this.tags.find(x => !x.killed && (tTid ? x.tid === tTid : tEpc ? x.epc === tEpc : true));
      await new Promise(res => setTimeout(res, 150 + Math.random() * 150));
      if (!t) return { ok: false, op: r.op, message: `超时（${+r.timeout || 5}s 内未找到目标标签）` };
      const pwd = clean(r.password).padStart(8, '0').slice(-8), apwd = t.reserved.substr(8, 8);
      const locked = f => t.locks[f] && t.locks[f] !== 'unlock' && apwd !== '00000000' && pwd !== apwd;
      const get = b => b === 'epc' ? '0000' + t.pc + t.epc : b === 'tid' ? t.tid : b === 'user' ? t.user : t.reserved;
      const put = (b, p, d) => { if (b === 'epc') { const m = get('epc'); const n = (m.slice(0, p) + d + m.slice(p + d.length)); t.pc = n.substr(4, 4); t.epc = n.slice(8, 8 + ((parseInt(t.pc, 16) >> 11) & 31) * 4); } else if (b === 'user') t.user = (t.user.slice(0, p) + d + t.user.slice(p + d.length)).slice(0, 128); else if (b === 'reserved') t.reserved = (t.reserved.slice(0, p) + d + t.reserved.slice(p + d.length)).slice(0, 16); };
      const field = b => b === 'reserved' ? 'access' : b;
      if (r.op === 'read') {
        if (r.bank === 'reserved' && locked('access')) return { ok: false, op: 'read', result: 5, message: '存储区已锁定' };
        const m = get(r.bank), p = (+r.wordPointer || 0) * 4, c = (+r.wordCount || (m.length / 4 - (+r.wordPointer || 0))) * 4;
        if (p + c > m.length) return { ok: false, op: 'read', result: 4, message: '存储区越界' };
        return { ok: true, op: 'read', epc: t.epc, message: '成功', data: m.substr(p, c), words: c / 4 };
      }
      if (r.op === 'write' || r.op === 'blockWrite') {
        const d = clean(r.data), p = (+r.wordPointer || 0) * 4;
        if (!d || d.length % 4) return { ok: false, op: 'write', message: '写入数据必须为整字（4 位十六进制的倍数）' };
        if (r.bank === 'tid') return { ok: false, op: 'write', result: 2, message: '存储区已锁定' };
        if (locked(field(r.bank))) return { ok: false, op: 'write', result: 2, message: '存储区已锁定' };
        if (p + d.length > get(r.bank).length + (r.bank === 'epc' ? 64 : 0)) return { ok: false, op: 'write', result: 1, message: '存储区越界' };
        put(r.bank, p, d); return { ok: true, op: 'write', epc: t.epc, message: '成功', words: d.length / 4 };
      }
      if (r.op === 'writeEpc') {
        if (locked('epc')) return { ok: false, op: 'write', result: 2, message: '存储区已锁定' };
        let d = clean(r.data); while (d.length % 4) d += '0';
        t.epc = d; t.pc = ((((d.length / 4) & 31) << 11) | (parseInt(t.pc, 16) & 0x7ff)).toString(16).padStart(4, '0').toUpperCase();
        return { ok: true, op: 'write', epc: d, message: '成功', words: d.length / 4 + 1 };
      }
      if (r.op === 'lock') { if (apwd !== '00000000' && pwd !== apwd) return { ok: false, op: 'lock', result: 5, message: '访问密码错误' }; t.locks[r.field] = r.privilege; return { ok: true, op: 'lock', epc: t.epc, message: '成功' }; }
      if (r.op === 'kill') { if (pwd === '00000000') return { ok: false, op: 'kill', result: 1, message: '灭活密码为 0' }; if (pwd !== t.reserved.substr(0, 8)) return { ok: false, op: 'kill', result: 6, message: '灭活密码错误' }; t.killed = true; return { ok: true, op: 'kill', epc: t.epc, message: '成功' }; }
      throw new Error('未知操作');
    }
    disconnect() { this.stop(); this.emit('disconnected'); }
  }
  Sim.ACT = ACT;
  return Sim;
});
