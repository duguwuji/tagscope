'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Minimal LLRP 1.0.1 codec + Impinj extensions (vendor 25882)
const VENDOR_IMPINJ = 25882;
const MSG = {
  GET_READER_CAPABILITIES: 1, GET_READER_CONFIG: 2, SET_READER_CONFIG: 3, CLOSE_CONNECTION_RESPONSE: 4,
  GET_READER_CAPABILITIES_RESPONSE: 11, GET_READER_CONFIG_RESPONSE: 12, SET_READER_CONFIG_RESPONSE: 13, CLOSE_CONNECTION: 14,
  ADD_ROSPEC: 20, DELETE_ROSPEC: 21, START_ROSPEC: 22, STOP_ROSPEC: 23, ENABLE_ROSPEC: 24, DISABLE_ROSPEC: 25,
  ADD_ROSPEC_RESPONSE: 30, DELETE_ROSPEC_RESPONSE: 31, START_ROSPEC_RESPONSE: 32, STOP_ROSPEC_RESPONSE: 33,
  ENABLE_ROSPEC_RESPONSE: 34, DISABLE_ROSPEC_RESPONSE: 35,
  ADD_ACCESSSPEC: 40, DELETE_ACCESSSPEC: 41, ENABLE_ACCESSSPEC: 42, DISABLE_ACCESSSPEC: 43,
  ADD_ACCESSSPEC_RESPONSE: 50, DELETE_ACCESSSPEC_RESPONSE: 51, ENABLE_ACCESSSPEC_RESPONSE: 52, DISABLE_ACCESSSPEC_RESPONSE: 53,
  GET_REPORT: 60, RO_ACCESS_REPORT: 61, KEEPALIVE: 62, READER_EVENT_NOTIFICATION: 63, ENABLE_EVENTS_AND_REPORTS: 64,
  KEEPALIVE_ACK: 72, ERROR_MESSAGE: 100, CUSTOM_MESSAGE: 1023,
};
const P = {
  UTCTimestamp: 128, Uptime: 129, GeneralDeviceCapabilities: 137, ReceiveSensitivityTableEntry: 139,
  PerAntennaAirProtocol: 140, GPIOCapabilities: 141, LLRPCapabilities: 142, RegulatoryCapabilities: 143,
  UHFBandCapabilities: 144, TransmitPowerLevelTableEntry: 145, FrequencyInformation: 146, FrequencyHopTable: 147,
  FixedFrequencyTable: 148, PerAntennaReceiveSensitivityRange: 149,
  ROSpec: 177, ROBoundarySpec: 178, ROSpecStartTrigger: 179, ROSpecStopTrigger: 182, AISpec: 183,
  AISpecStopTrigger: 184, InventoryParameterSpec: 186,
  AccessSpec: 207, AccessSpecStopTrigger: 208, AccessCommand: 209,
  Identification: 218, KeepaliveSpec: 220, AntennaProperties: 221, AntennaConfiguration: 222, RFReceiver: 223, RFTransmitter: 224,
  ROReportSpec: 237, TagReportContentSelector: 238, AccessReportSpec: 239, TagReportData: 240, EPCData: 241,
  ReaderEventNotificationSpec: 244, EventNotificationState: 245, ReaderEventNotificationData: 246,
  ROSpecEvent: 249, ReaderExceptionEvent: 252, AntennaEvent: 255, ConnectionAttemptEvent: 256, ConnectionCloseEvent: 257,
  LLRPStatus: 287, FieldError: 288, ParameterError: 289,
  C1G2UHFRFModeTable: 328, C1G2UHFRFModeTableEntry: 329, C1G2InventoryCommand: 330, C1G2Filter: 331,
  C1G2TagInventoryMask: 332, C1G2TagInventoryStateUnawareFilterAction: 334, C1G2RFControl: 335, C1G2SingulationControl: 336,
  C1G2TagSpec: 338, C1G2TargetTag: 339, C1G2Read: 341, C1G2Write: 342, C1G2Kill: 343, C1G2Lock: 344, C1G2LockPayload: 345,
  C1G2EPCMemorySelector: 348, C1G2ReadOpSpecResult: 349, C1G2WriteOpSpecResult: 350, C1G2KillOpSpecResult: 351,
  C1G2LockOpSpecResult: 352, C1G2BlockWrite: 347, C1G2BlockWriteOpSpecResult: 354, Custom: 1023,
  GPITriggerValue: 181, GPOWriteData: 219, GPIPortCurrentState: 225, GPIEvent: 248,
};
const IMP = { // Impinj custom parameter / message subtypes
  ENABLE_EXTENSIONS: 21, ENABLE_EXTENSIONS_RESPONSE: 22, InventorySearchMode: 23, DetailedVersion: 29,
  TagReportContentSelector: 50, EnableSerializedTID: 51, EnableRFPhaseAngle: 52, EnablePeakRSSI: 53,
  SerializedTID: 55, RFPhaseAngle: 56, PeakRSSI: 57, EnableRFDopplerFrequency: 67, RFDopplerFrequency: 68, LowDutyCycle: 28,
};
// TV parameter value lengths (bytes)
const TV_LEN = { 1: 2, 2: 8, 3: 8, 4: 8, 5: 8, 6: 1, 7: 2, 8: 2, 9: 4, 10: 2, 11: 2, 12: 2, 13: 12, 14: 2, 15: 2, 16: 4, 17: 2, 18: 4, 19: 2, 20: 2 };

// ---------- encoding ----------
const u8 = v => Buffer.from([v & 0xff]);
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xffff); return b; };
const s16 = v => { const b = Buffer.alloc(2); b.writeInt16BE(v); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v)); return b; };
const utf8v = s => { const d = Buffer.from(String(s || ''), 'utf8'); return Buffer.concat([u16(d.length), d]); };
const cleanHex = h => String(h || '').replace(/[^0-9a-f]/gi, '');
function hexBuf(h) { h = cleanHex(h); if (h.length % 2) h += '0'; return Buffer.from(h, 'hex'); }
function bitsField(hex, bits) { const b = hexBuf(hex); if (bits == null) bits = b.length * 8; return Buffer.concat([u16(bits), b.subarray(0, Math.ceil(bits / 8))]); }
function wordsField(hex) { let h = cleanHex(hex); while (h.length % 4) h += '0'; return Buffer.concat([u16(h.length / 4), Buffer.from(h, 'hex')]); }
function tlv(type, ...parts) {
  const body = Buffer.concat(parts.flat(Infinity).filter(Boolean));
  const h = Buffer.alloc(4); h.writeUInt16BE(type & 0x3ff); h.writeUInt16BE(4 + body.length, 2);
  return Buffer.concat([h, body]);
}
const tv = (type, value) => Buffer.concat([u8(0x80 | type), value]);
const custom = (subtype, ...parts) => tlv(P.Custom, u32(VENDOR_IMPINJ), u32(subtype), ...parts);
function message(type, id, ...parts) {
  const body = Buffer.concat(parts.flat(Infinity).filter(Boolean));
  const h = Buffer.alloc(10); h.writeUInt16BE((1 << 10) | (type & 0x3ff)); h.writeUInt32BE(10 + body.length, 2); h.writeUInt32BE(id >>> 0, 6);
  return Buffer.concat([h, body]);
}

// ---------- decoding ----------
function parseHeader(buf) {
  if (buf.length < 10) return null;
  const w = buf.readUInt16BE(0);
  return { version: (w >> 10) & 7, type: w & 0x3ff, length: buf.readUInt32BE(2), id: buf.readUInt32BE(6) };
}
function parseParams(buf, off = 0, end = buf.length) {
  const out = [];
  while (off < end) {
    const b = buf[off];
    if (b & 0x80) {
      const t = b & 0x7f, l = TV_LEN[t];
      if (l === undefined) throw new Error('Unknown TV parameter ' + t);
      out.push({ tv: true, type: t, value: buf.subarray(off + 1, off + 1 + l) });
      off += 1 + l;
    } else {
      if (off + 4 > end) break;
      const t = buf.readUInt16BE(off) & 0x3ff, len = buf.readUInt16BE(off + 2);
      if (len < 4 || off + len > end) throw new Error(`Bad TLV type=${t} len=${len}`);
      const body = buf.subarray(off + 4, off + len), p = { type: t, body };
      if (t === P.Custom && body.length >= 8) { p.vendor = body.readUInt32BE(0); p.subtype = body.readUInt32BE(4); p.data = body.subarray(8); }
      out.push(p); off += len;
    }
  }
  return out;
}
const readUtf8v = (b, o) => { const n = b.readUInt16BE(o); return { s: b.toString('utf8', o + 2, o + 2 + n), next: o + 2 + n }; };
const find = (ps, type) => ps.find(p => !p.tv && p.type === type);
const findAll = (ps, type) => ps.filter(p => !p.tv && p.type === type);
const findCustom = (ps, sub) => ps.find(p => p.type === P.Custom && p.vendor === VENDOR_IMPINJ && p.subtype === sub);

function decodeStatus(p) {
  if (!p) return null;
  const b = p.body, code = b.readUInt16BE(0), d = readUtf8v(b, 2);
  const st = { code, description: d.s, details: [] };
  for (const sp of parseParams(b, d.next)) {
    if (sp.type === P.FieldError) st.details.push(`字段 #${sp.body.readUInt16BE(0)} 错误码 ${sp.body.readUInt16BE(2)}`);
    if (sp.type === P.ParameterError) st.details.push(`参数类型 ${sp.body.readUInt16BE(0)} 错误码 ${sp.body.readUInt16BE(2)}`);
  }
  return st;
}

function decodeCapabilities(params) {
  const caps = { maxAntennas: 0, manufacturer: 0, model: 0, firmware: '', rxSensitivity: [], txPower: [], modes: [], hopTables: [], fixedFreqs: [], gpi: 0, gpo: 0, region: null };
  const g = find(params, P.GeneralDeviceCapabilities);
  if (g) {
    const b = g.body; caps.maxAntennas = b.readUInt16BE(0); caps.manufacturer = b.readUInt32BE(4); caps.model = b.readUInt32BE(8);
    const fw = readUtf8v(b, 12); caps.firmware = fw.s;
    for (const sp of parseParams(b, fw.next)) {
      if (sp.type === P.ReceiveSensitivityTableEntry) caps.rxSensitivity.push({ index: sp.body.readUInt16BE(0), value: sp.body.readInt16BE(2) });
      if (sp.type === P.GPIOCapabilities) { caps.gpi = sp.body.readUInt16BE(0); caps.gpo = sp.body.readUInt16BE(2); }
    }
  }
  const r = find(params, P.RegulatoryCapabilities);
  if (r) {
    caps.region = { country: r.body.readUInt16BE(0), standard: r.body.readUInt16BE(2) };
    const uhf = find(parseParams(r.body, 4), P.UHFBandCapabilities);
    if (uhf) for (const sp of parseParams(uhf.body)) {
      if (sp.type === P.TransmitPowerLevelTableEntry) caps.txPower.push({ index: sp.body.readUInt16BE(0), dbm: sp.body.readInt16BE(2) / 100 });
      if (sp.type === P.FrequencyInformation) for (const f of parseParams(sp.body, 1)) {
        if (f.type === P.FrequencyHopTable) { const n = f.body.readUInt16BE(2), fr = []; for (let i = 0; i < n; i++) fr.push(f.body.readUInt32BE(4 + i * 4)); caps.hopTables.push({ id: f.body[0], freqs: fr }); }
        if (f.type === P.FixedFrequencyTable) { const n = f.body.readUInt16BE(0); for (let i = 0; i < n; i++) caps.fixedFreqs.push(f.body.readUInt32BE(2 + i * 4)); }
      }
      if (sp.type === P.C1G2UHFRFModeTable) for (const e of findAll(parseParams(sp.body), P.C1G2UHFRFModeTableEntry)) {
        const b = e.body;
        caps.modes.push({ id: b.readUInt32BE(0), m: b[5], flm: b[6], bdr: b.readUInt32BE(8), pie: b.readUInt32BE(12), minTari: b.readUInt32BE(16), maxTari: b.readUInt32BE(20) });
      }
    }
  }
  const dv = findCustom(params, IMP.DetailedVersion);
  if (dv) { try { let o = 0; const f = []; for (let i = 0; i < 3; i++) { const x = readUtf8v(dv.data, o); f.push(x.s); o = x.next; } caps.detail = { modelName: f[0], serial: f[1], software: f[2] }; } catch (_) { } }
  return caps;
}

function decodeReaderConfig(params) {
  const cfg = { antennas: [], readerId: '' };
  const id = find(params, P.Identification);
  if (id) { const n = id.body.readUInt16BE(1); cfg.readerId = id.body.subarray(3, 3 + n).toString('hex').toUpperCase(); }
  for (const a of findAll(params, P.AntennaProperties)) cfg.antennas.push({ id: a.body.readUInt16BE(1), connected: !!(a.body[0] & 0x80), gain: a.body.readInt16BE(3) });
  return cfg;
}

const tvVal = p => p.value.length === 1 ? p.value.readInt8(0) : p.value.length === 2 ? p.value.readUInt16BE(0) : p.value.length === 4 ? p.value.readUInt32BE(0) : p.value.length === 8 ? Number(p.value.readBigUInt64BE(0)) : p.value;
function decodeTagReport(body) {
  const t = { ops: [] };
  for (const p of parseParams(body)) {
    if (p.tv) {
      switch (p.type) {
        case 13: t.epc = p.value.toString('hex').toUpperCase(); break;
        case 1: t.antenna = tvVal(p); break;
        case 6: t.rssi = tvVal(p); break;
        case 7: t.channel = tvVal(p); break;
        case 2: t.firstSeen = tvVal(p); break;
        case 4: t.lastSeen = tvVal(p); break;
        case 8: t.count = tvVal(p); break;
        case 12: t.pc = p.value.toString('hex').toUpperCase(); break;
        case 16: t.accessSpecId = tvVal(p); break;
        case 9: t.roSpecId = tvVal(p); break;
      }
      continue;
    }
    const b = p.body;
    if (p.type === P.EPCData) { const bits = b.readUInt16BE(0); t.epc = b.subarray(2, 2 + Math.ceil(bits / 8)).toString('hex').toUpperCase(); }
    else if (p.type === P.C1G2ReadOpSpecResult) { const n = b.readUInt16BE(3); t.ops.push({ kind: 'read', result: b[0], opSpecId: b.readUInt16BE(1), data: b.subarray(5, 5 + n * 2).toString('hex').toUpperCase() }); }
    else if (p.type === P.C1G2WriteOpSpecResult) t.ops.push({ kind: 'write', result: b[0], opSpecId: b.readUInt16BE(1), words: b.readUInt16BE(3) });
    else if (p.type === P.C1G2KillOpSpecResult) t.ops.push({ kind: 'kill', result: b[0], opSpecId: b.readUInt16BE(1) });
    else if (p.type === P.C1G2BlockWriteOpSpecResult) t.ops.push({ kind: 'write', result: b[0], opSpecId: b.readUInt16BE(1), words: b.readUInt16BE(3) });
    else if (p.type === P.C1G2LockOpSpecResult) t.ops.push({ kind: 'lock', result: b[0], opSpecId: b.readUInt16BE(1) });
    else if (p.type === P.Custom && p.vendor === VENDOR_IMPINJ) {
      const d = p.data;
      if (p.subtype === IMP.SerializedTID) { const n = d.readUInt16BE(0); t.tid = d.subarray(2, 2 + n * 2).toString('hex').toUpperCase(); }
      else if (p.subtype === IMP.RFPhaseAngle) t.phase = +(d.readUInt16BE(0) * 360 / 4096).toFixed(1);
      else if (p.subtype === IMP.PeakRSSI) t.rssi = d.readInt16BE(0) / 100;
      else if (p.subtype === IMP.RFDopplerFrequency) t.doppler = +(d.readInt16BE(0) / 16).toFixed(2);
    }
  }
  return t;
}

const RESULT_TEXT = {
  read: ['成功', '标签错误', '标签无响应', '读写器错误', '存储区越界', '存储区已锁定', '访问密码错误'],
  write: ['成功', '存储区越界', '存储区已锁定', '功率不足', '标签错误', '标签无响应', '读写器错误', '访问密码错误'],
  kill: ['成功', '灭活密码为 0', '功率不足', '标签错误', '标签无响应', '读写器错误', '灭活密码错误'],
  lock: ['成功', '功率不足', '标签错误', '标签无响应', '读写器错误', '访问密码错误', '存储区越界', '存储区已锁定'],
};

module.exports = { VENDOR_IMPINJ, MSG, P, IMP, TV_LEN, u8, u16, s16, u32, u64, utf8v, hexBuf, cleanHex, bitsField, wordsField, tlv, tv, custom, message,
  parseHeader, parseParams, find, findAll, findCustom, decodeStatus, decodeCapabilities, decodeReaderConfig, decodeTagReport, readUtf8v, RESULT_TEXT };
