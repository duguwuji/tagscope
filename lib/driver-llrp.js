'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
const net = require('net');
const { EventEmitter } = require('events');
const C = require('./llrp-codec');
const { MSG, P, IMP, u8, u16, u32, tlv, custom, message } = C;

const ROSPEC_ID = 1001;
const BANK = { reserved: 0, epc: 1, tid: 2, user: 3 };
const LOCK_FIELD = { kill: 0, access: 1, epc: 2, tid: 3, user: 4 };
const LOCK_PRIV = { lock: 0, permalock: 1, permaunlock: 2, unlock: 3 };

class LlrpDriver extends EventEmitter {
  constructor() { super(); this.kind = 'llrp'; this.sock = null; this.buf = Buffer.alloc(0); this.msgId = 1; this.pending = new Map(); this.running = false; this.access = new Map(); this.accessId = 100; this.pcCache = new Map(); }

  // ---------- transport ----------
  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 10) {
      const h = C.parseHeader(this.buf);
      if (h.length < 10 || h.length > 16 * 1024 * 1024) { this.emit('log', 'error', 'LLRP 帧长度异常，断开连接'); this.sock.destroy(); return; }
      if (this.buf.length < h.length) break;
      const frame = this.buf.subarray(0, h.length); this.buf = this.buf.subarray(h.length);
      try { this._onMessage(h, frame.subarray(10)); } catch (e) { this.emit('log', 'error', `解析 LLRP 消息 ${h.type} 失败：${e.message}`); }
    }
  }
  _onMessage(h, body) {
    if (h.type === MSG.KEEPALIVE) { this._write(message(MSG.KEEPALIVE_ACK, h.id)); this.emit('keepalive'); return; }
    if (h.type === MSG.RO_ACCESS_REPORT) { for (const p of C.findAll(C.parseParams(body), P.TagReportData)) this._onTag(C.decodeTagReport(p.body)); return; }
    if (h.type === MSG.READER_EVENT_NOTIFICATION) { this._onEvent(body); return; }
    const w = this.pending.get(h.id);
    if (w) { this.pending.delete(h.id); clearTimeout(w.timer); w.resolve({ h, body }); }
    else if (h.type === MSG.ERROR_MESSAGE) this.emit('log', 'error', 'ERROR_MESSAGE: ' + JSON.stringify(C.decodeStatus(C.find(C.parseParams(body), P.LLRPStatus))));
  }
  _onEvent(body) {
    const d = C.find(C.parseParams(body), P.ReaderEventNotificationData); if (!d) return;
    for (const e of C.parseParams(d.body)) {
      if (e.type === P.ConnectionAttemptEvent) { this._connStatus = e.body.readUInt16BE(0); this.emit('_conn', this._connStatus); }
      else if (e.type === P.AntennaEvent) this.emit('log', e.body[0] ? 'info' : 'warn', `天线 ${e.body.readUInt16BE(1)} ${e.body[0] ? '已连接' : '已断开'}`);
      else if (e.type === P.ROSpecEvent) this.emit('log', 'debug', `ROSpec ${e.body.readUInt32BE(1)} ${['开始', '结束', '被抢占'][e.body[0]] || e.body[0]}`);
      else if (e.type === P.ReaderExceptionEvent) this.emit('log', 'error', '读写器异常：' + C.readUtf8v(e.body, 0).s);
      else if (e.type === P.ConnectionCloseEvent) this.emit('log', 'warn', '读写器关闭了连接');
    }
  }
  _write(b) { if (!this.sock || this.sock.destroyed) throw new Error('未连接'); this.sock.write(b); }
  request(type, parts = [], timeout = 8000) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`LLRP 消息 ${type} 超时`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this._write(message(type, id, parts)); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  async call(type, parts, name, { allowFail = false, custom: isCustom = false } = {}) {
    const { h, body } = await this.request(type, parts);
    let params;
    params = C.parseParams(body, isCustom && h.type === MSG.CUSTOM_MESSAGE ? 5 : 0);
    const st = C.decodeStatus(C.find(params, P.LLRPStatus));
    if (h.type === MSG.ERROR_MESSAGE || (st && st.code !== 0)) {
      const err = new Error(`${name} 失败：${st ? `[${st.code}] ${st.description} ${st.details.join('；')}` : 'ERROR_MESSAGE'}`);
      if (allowFail) { this.emit('log', 'debug', err.message); return null; }
      throw err;
    }
    this.emit('log', 'debug', `${name} OK`);
    return params;
  }

  // ---------- lifecycle ----------
  async connect({ host, port = 5084, timeout = 8000 }) {
    this.host = host; this._connStatus = undefined;
    await new Promise((resolve, reject) => {
      const s = net.connect({ host, port: +port || 5084 });
      const t = setTimeout(() => { s.destroy(); reject(new Error(`连接 ${host}:${port} 超时`)); }, timeout);
      s.once('connect', () => { clearTimeout(t); resolve(); });
      s.once('error', e => { clearTimeout(t); reject(e); });
      s.setNoDelay(true); s.setKeepAlive(true, 5000);
      s.on('data', d => this._onData(d));
      s.on('close', () => { const was = this.sock; this.sock = null; this.running = false; for (const w of this.pending.values()) { clearTimeout(w.timer); w.reject(new Error('连接已断开')); } this.pending.clear(); if (was) this.emit('disconnected'); });
      this.sock = s;
    });
    const status = this._connStatus !== undefined ? this._connStatus : await new Promise(res => { const t = setTimeout(() => res(null), 4000); this.once('_conn', st => { clearTimeout(t); res(st); }); });
    if (status !== null && status !== 0) { this.sock.destroy(); throw new Error(['', '读写器已有主动发起的连接', '已有其他客户端连接到该读写器（请关闭 ItemTest 等其他软件）', '连接失败', '读写器正在处理其他连接'][status] || `连接被拒绝（${status}）`); }

    this.impinj = !!(await this.call(MSG.CUSTOM_MESSAGE, [u32(C.VENDOR_IMPINJ), u8(IMP.ENABLE_EXTENSIONS), u32(0)], 'IMPINJ_ENABLE_EXTENSIONS', { allowFail: true, custom: true }).catch(() => null));
    await this.call(MSG.SET_READER_CONFIG, [u8(0x80),
      tlv(P.ReaderEventNotificationSpec, [2, 4, 8].map(t => tlv(P.EventNotificationState, u16(t), u8(0x80)))),
      tlv(P.AccessReportSpec, u8(1)),
      tlv(P.KeepaliveSpec, u8(1), u32(10000))], 'SET_READER_CONFIG（恢复默认）');
    const caps = C.decodeCapabilities(await this.call(MSG.GET_READER_CAPABILITIES, [u8(0)], 'GET_READER_CAPABILITIES'));
    const rc = C.decodeReaderConfig(await this.call(MSG.GET_READER_CONFIG, [u16(0), u8(0), u16(0), u16(0)], 'GET_READER_CONFIG'));
    await this.call(MSG.DELETE_ACCESSSPEC, [u32(0)], 'DELETE_ACCESSSPEC', { allowFail: true });
    await this.call(MSG.DELETE_ROSPEC, [u32(0)], 'DELETE_ROSPEC', { allowFail: true });
    this.caps = caps;
    const freqs = caps.hopTables[0] ? caps.hopTables[0].freqs : caps.fixedFreqs;
    this.freqs = freqs;
    this.info = {
      driver: 'LLRP', host, impinjExtensions: this.impinj,
      manufacturer: caps.manufacturer === C.VENDOR_IMPINJ ? 'Impinj' : String(caps.manufacturer),
      model: caps.detail?.modelName || modelName(caps.model), modelCode: caps.model, serial: caps.detail?.serial || rc.readerId,
      firmware: caps.detail?.software || caps.firmware, antennaCount: caps.maxAntennas, gpi: caps.gpi, gpo: caps.gpo,
      antennas: rc.antennas, txPower: caps.txPower.map(t => t.dbm), txPowerMin: Math.min(...caps.txPower.map(t => t.dbm)), txPowerMax: Math.max(...caps.txPower.map(t => t.dbm)),
      rxSensitivity: caps.rxSensitivity.map(r => ({ index: r.index, dbm: rxDbm(r) })),
      modes: caps.modes.map(m => ({ id: m.id, label: modeLabel(m) })), channels: freqs.length,
      supportsAccess: true, supportsDoppler: this.impinj,
    };
    return this.info;
  }
  async disconnect() {
    if (!this.sock) return;
    try { if (this.running) await this.stop(); await this.request(MSG.CLOSE_CONNECTION, [], 3000); } catch (_) { }
    if (this.sock) this.sock.destroy();
  }

  // ---------- inventory ----------
  _txIndex(dbm) { const t = this.caps.txPower; if (!t.length) return 1; let best = t[0]; for (const e of t) if (Math.abs(e.dbm - dbm) < Math.abs(best.dbm - dbm)) best = e; return best.index; }
  _rxIndex(dbm) { const t = this.caps.rxSensitivity; if (!t.length || dbm == null || dbm === '') return 1; let best = t[0]; for (const e of t) if (Math.abs(rxDbm(e) - dbm) < Math.abs(rxDbm(best) - dbm)) best = e; return best.index; }
  buildROSpec(cfg) {
    const ants = (cfg.antennas || []).filter(a => a.enabled);
    if (!ants.length) throw new Error('请至少启用一个天线');
    const hopId = this.caps.hopTables[0]?.id || 1;
    const filters = [];
    if (cfg.filter && cfg.filter.enabled && C.cleanHex(cfg.filter.mask)) {
      const bits = cfg.filter.maskBits ? +cfg.filter.maskBits : C.cleanHex(cfg.filter.mask).length * 4;
      filters.push(tlv(P.C1G2Filter, u8(0),
        tlv(P.C1G2TagInventoryMask, u8(BANK[cfg.filter.bank || 'epc'] << 6), u16(+cfg.filter.pointer || 0), C.bitsField(cfg.filter.mask, bits)),
        tlv(P.C1G2TagInventoryStateUnawareFilterAction, u8(cfg.filter.action === 'exclude' ? 4 : 0))));
    }
    const antCfg = ants.map(a => tlv(P.AntennaConfiguration, u16(a.id),
      tlv(P.RFReceiver, u16(this._rxIndex(a.rxDbm))),
      tlv(P.RFTransmitter, u16(hopId), u16(1), u16(this._txIndex(+a.txDbm))),
      tlv(P.C1G2InventoryCommand, u8(0), filters,
        tlv(P.C1G2RFControl, u16(+cfg.mode || 0), u16(0)),
        tlv(P.C1G2SingulationControl, u8((+cfg.session & 3) << 6), u16(+cfg.tagPopulation || 32), u32(0)),
        this.impinj && +cfg.searchMode ? custom(IMP.InventorySearchMode, u16(+cfg.searchMode)) : null)));
    const sel = tlv(P.TagReportContentSelector, u16(0x1FC0), tlv(P.C1G2EPCMemorySelector, u8(0x40)));
    const imp = this.impinj ? custom(IMP.TagReportContentSelector,
      custom(IMP.EnableSerializedTID, u16(cfg.fastId ? 1 : 0)), custom(IMP.EnableRFPhaseAngle, u16(1)), custom(IMP.EnablePeakRSSI, u16(1)),
      cfg.doppler ? custom(IMP.EnableRFDopplerFrequency, u16(1)) : null) : null;
    return tlv(P.ROSpec, u32(ROSPEC_ID), u8(0), u8(0),
      tlv(P.ROBoundarySpec, tlv(P.ROSpecStartTrigger, u8(0)), tlv(P.ROSpecStopTrigger, u8(0), u32(0))),
      tlv(P.AISpec, u16(ants.length), ants.map(a => u16(a.id)), tlv(P.AISpecStopTrigger, u8(0), u32(0)), tlv(P.InventoryParameterSpec, u16(1), u8(1), antCfg)),
      tlv(P.ROReportSpec, u8(2), u16(1), sel, imp));
  }
  async start(cfg) {
    this.cfg = cfg;
    await this.call(MSG.DELETE_ROSPEC, [u32(ROSPEC_ID)], 'DELETE_ROSPEC', { allowFail: true });
    await this.call(MSG.ADD_ROSPEC, [this.buildROSpec(cfg)], 'ADD_ROSPEC');
    await this.call(MSG.ENABLE_ROSPEC, [u32(ROSPEC_ID)], 'ENABLE_ROSPEC');
    await this.call(MSG.START_ROSPEC, [u32(ROSPEC_ID)], 'START_ROSPEC');
    this.running = true;
  }
  async stop() {
    this.running = false;
    await this.call(MSG.STOP_ROSPEC, [u32(ROSPEC_ID)], 'STOP_ROSPEC', { allowFail: true });
    await this.call(MSG.DELETE_ROSPEC, [u32(ROSPEC_ID)], 'DELETE_ROSPEC', { allowFail: true });
  }
  _onTag(t) {
    if (!t.epc && !t.ops.length) return;
    if (t.epc && t.pc) this.pcCache.set(t.epc, t.pc);
    if (t.accessSpecId && this.access.has(t.accessSpecId) && t.ops.length) {
      const a = this.access.get(t.accessSpecId); this.access.delete(t.accessSpecId); clearTimeout(a.timer);
      const op = t.ops[0], text = (C.RESULT_TEXT[op.kind] || [])[op.result] || `代码 ${op.result}`;
      a.resolve({ ok: op.result === 0, epc: t.epc, antenna: t.antenna, op: op.kind, result: op.result, message: text, data: op.data, words: op.words });
    }
    if (!t.epc) return;
    this.emit('tag', { epc: t.epc, tid: t.tid, antenna: t.antenna, rssi: t.rssi, phase: t.phase, doppler: t.doppler, channel: t.channel,
      freq: t.channel && this.freqs[t.channel - 1] ? this.freqs[t.channel - 1] / 1000 : undefined, pc: t.pc, count: t.count || 1, ts: Date.now() });
  }

  // ---------- tag access ----------
  async accessOp(req) {
    const id = ++this.accessId, opId = 1, pwd = parseInt(C.cleanHex(req.password) || '0', 16) >>> 0;
    let op;
    switch (req.op) {
      case 'read': op = tlv(P.C1G2Read, u16(opId), u32(pwd), u8(BANK[req.bank] << 6), u16(+req.wordPointer || 0), u16(+req.wordCount || 0)); break;
      case 'write': op = tlv(P.C1G2Write, u16(opId), u32(pwd), u8(BANK[req.bank] << 6), u16(+req.wordPointer || 0), C.wordsField(req.data)); break;
      case 'writeEpc': {
        let h = C.cleanHex(req.data); while (h.length % 4) h += '0';
        const newWords = h.length / 4, oldEpc = C.cleanHex(req.targetEpc);
        if (oldEpc && oldEpc.length === h.length) op = tlv(P.C1G2Write, u16(opId), u32(pwd), u8(1 << 6), u16(2), C.wordsField(h));
        else { const oldPc = parseInt(this.pcCache.get(oldEpc.toUpperCase()) || '3000', 16); const pc = ((newWords & 0x1f) << 11) | (oldPc & 0x07ff); op = tlv(P.C1G2Write, u16(opId), u32(pwd), u8(1 << 6), u16(1), C.wordsField(pc.toString(16).padStart(4, '0') + h)); }
        break;
      }
      case 'lock': op = tlv(P.C1G2Lock, u16(opId), u32(pwd), tlv(P.C1G2LockPayload, u8(LOCK_PRIV[req.privilege]), u8(LOCK_FIELD[req.field]))); break;
      case 'kill': if (!pwd) throw new Error('灭活密码不能为 0'); op = tlv(P.C1G2Kill, u16(opId), u32(pwd)); break;
      default: throw new Error('未知操作');
    }
    const epc = C.cleanHex(req.targetEpc);
    const target = epc
      ? tlv(P.C1G2TargetTag, u8((1 << 6) | 0x20), u16(32), C.bitsField('F'.repeat(epc.length), epc.length * 4), C.bitsField(epc, epc.length * 4))
      : tlv(P.C1G2TargetTag, u8((1 << 6) | 0x20), u16(0), u16(0), u16(0));
    const spec = tlv(P.AccessSpec, u32(id), u16(+req.antenna || 0), u8(1), u8(0), u32(0),
      tlv(P.AccessSpecStopTrigger, u8(1), u16(1)),
      tlv(P.AccessCommand, tlv(P.C1G2TagSpec, target), op),
      tlv(P.AccessReportSpec, u8(1)));
    const autoStart = !this.running;
    if (autoStart && !this.cfg) throw new Error('请先保存盘点设置或启动一次盘点');
    const timeoutMs = (+req.timeout || 5) * 1000;
    const result = new Promise(resolve => {
      const timer = setTimeout(() => { this.access.delete(id); resolve({ ok: false, op: req.op, message: `超时（${timeoutMs / 1000}s 内未找到目标标签或无结果）` }); }, timeoutMs);
      this.access.set(id, { resolve, timer });
    });
    try {
      await this.call(MSG.ADD_ACCESSSPEC, [spec], 'ADD_ACCESSSPEC');
      await this.call(MSG.ENABLE_ACCESSSPEC, [u32(id)], 'ENABLE_ACCESSSPEC');
      if (autoStart) await this.start(this.cfg);
    } catch (e) { const a = this.access.get(id); if (a) { clearTimeout(a.timer); this.access.delete(id); } throw e; }
    const r = await result;
    await this.call(MSG.DELETE_ACCESSSPEC, [u32(id)], 'DELETE_ACCESSSPEC', { allowFail: true }).catch(() => { });
    if (autoStart) await this.stop().catch(() => { });
    return r;
  }
}

function rxDbm(r) { return r.index === 1 && r.value === 0 ? -80 : (r.value >= 0 && r.value <= 60 ? -80 + r.value : r.value); }
const IMPINJ_MODES = { 0: 'Max Throughput', 1: 'Hybrid', 2: 'Dense Reader M4', 3: 'Dense Reader M8', 4: 'MaxMiller', 5: 'Dense Reader M4 Two', 1000: 'AutoSet Dense Reader', 1002: 'AutoSet Static', 1003: 'AutoSet Static Fast', 1004: 'AutoSet Static DRM' };
function modeLabel(m) { const fl = ['FM0', 'Miller2', 'Miller4', 'Miller8'][m.m] || `M${m.m}`; return `${m.id} · ${IMPINJ_MODES[m.id] || 'Mode'} (${fl}, BLF ${Math.round(m.bdr / 1000)} kHz)`; }
function modelName(code) { return ({ 2001001: 'Speedway R220', 2001002: 'Speedway R420', 2001003: 'Speedway xPortal', 2001007: 'Speedway R120' })[code] || `型号代码 ${code}`; }

module.exports = { LlrpDriver, IMPINJ_MODES };
