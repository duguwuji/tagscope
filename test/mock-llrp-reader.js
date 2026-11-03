'use strict';
// A tiny fake LLRP reader used to exercise the driver's encoder/decoder end-to-end (not a spec validator).
const net = require('net');
const C = require('../lib/llrp-codec');
const { MSG, P, IMP, u8, u16, s16, u32, u64, utf8v, tlv, tv, custom, message } = C;
const ok = () => tlv(P.LLRPStatus, u16(0), utf8v(''));
const RESP = { 1: 11, 2: 12, 3: 13, 14: 4, 20: 30, 21: 31, 22: 32, 23: 33, 24: 34, 25: 35, 40: 50, 41: 51, 42: 52, 43: 53 };
const seen = [];
function startMock(port = 0, transport = net) {
  const srv = transport.createServer(s => {
    let buf = Buffer.alloc(0), timer = null, access = null, rospec = null;
    const tags = ['01', '02', '03'].map((n, i) => ({ epc: 'E28011700000020A1B2C3D' + n, tid: 'E2801170200012345678' + String(i).padStart(4, '0'), mem: [Buffer.alloc(64), Buffer.alloc(64), Buffer.from('E2801170' + '00'.repeat(60), 'hex'), Buffer.alloc(64)] }));
    s.write(message(MSG.READER_EVENT_NOTIFICATION, 0, tlv(P.ReaderEventNotificationData, tlv(P.UTCTimestamp, u64(Date.now() * 1000)), tlv(P.ConnectionAttemptEvent, u16(0)))));
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 10) {
        const h = C.parseHeader(buf); if (buf.length < h.length) break;
        const body = buf.subarray(10, h.length); buf = buf.subarray(h.length); seen.push(h.type);
        if (h.type === MSG.CUSTOM_MESSAGE) { s.write(message(MSG.CUSTOM_MESSAGE, h.id, u32(C.VENDOR_IMPINJ), u8(IMP.ENABLE_EXTENSIONS_RESPONSE), ok())); continue; }
        if (h.type === MSG.KEEPALIVE_ACK) continue;
        if (h.type === MSG.GET_READER_CAPABILITIES) {
          const gen = tlv(P.GeneralDeviceCapabilities, u16(4), u16(0xC000), u32(25882), u32(2001002), utf8v('5.12.0.240'),
            [0, 10, 20, 30].map((v, i) => tlv(P.ReceiveSensitivityTableEntry, u16(i + 1), s16(v))), tlv(P.GPIOCapabilities, u16(4), u16(4)));
          const tx = []; for (let i = 0; i < 81; i++) tx.push(tlv(P.TransmitPowerLevelTableEntry, u16(i + 1), s16(1000 + i * 25)));
          const hop = tlv(P.FrequencyInformation, u8(0x80), tlv(P.FrequencyHopTable, u8(1), u8(0), u16(3), u32(902750), u32(903250), u32(903750)));
          const modes = tlv(P.C1G2UHFRFModeTable, [0, 2, 1002].map(id => tlv(P.C1G2UHFRFModeTableEntry, u32(id), u8(0x80), u8(id === 0 ? 0 : 2), u8(2), u8(2), u32(id === 0 ? 640000 : 250000), u32(1500), u32(6250), u32(6250), u32(0))));
          const reg = tlv(P.RegulatoryCapabilities, u16(840), u16(1), tlv(P.UHFBandCapabilities, tx, hop, modes));
          s.write(message(11, h.id, ok(), gen, tlv(P.LLRPCapabilities, u8(0), u8(1), u16(1), u16(1), u32(0), u32(0), u32(0)), reg)); continue;
        }
        if (h.type === MSG.GET_READER_CONFIG) { s.write(message(12, h.id, ok(), tlv(P.Identification, u8(0), u16(6), Buffer.from('001625123456', 'hex')), [1, 2, 3, 4].map(i => tlv(P.AntennaProperties, u8(i <= 2 ? 0x80 : 0), u16(i), s16(0))))); continue; }
        if (h.type === MSG.ADD_ROSPEC) { rospec = C.parseParams(body); validate(body); }
        if (h.type === MSG.ADD_ACCESSSPEC) { validate(body); const a = C.find(C.parseParams(body), P.AccessSpec); access = { id: a.body.readUInt32BE(0), cmd: C.parseParams(a.body, 12), enabled: false }; }
        if (h.type === MSG.ENABLE_ACCESSSPEC && access) access.enabled = true;
        if (h.type === MSG.DISABLE_ACCESSSPEC && access) access.enabled = false;
        if (h.type === MSG.DELETE_ACCESSSPEC) access = null;
        if (h.type === MSG.START_ROSPEC) { clearInterval(timer); let n = 0; timer = setInterval(() => sendTags(s, ++n, access, () => access = null, tags), 20); }
        if (h.type === MSG.STOP_ROSPEC) clearInterval(timer);
        if (h.type === MSG.CLOSE_CONNECTION) { s.write(message(4, h.id, ok())); s.end(); continue; }
        if (RESP[h.type]) s.write(message(RESP[h.type], h.id, ok()));
        else s.write(message(MSG.ERROR_MESSAGE, h.id, tlv(P.LLRPStatus, u16(101), utf8v('unsupported'))));
      }
    });
    s.on('close', () => clearInterval(timer)); s.on('error', () => { });
  });
  return new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(port, '127.0.0.1', () => resolve(srv)); });
}
function validate(buf, depth = 0) {
  if (depth > 16) throw new Error('Excessive parameter nesting');
  for (const p of C.parseParams(buf)) {
    if (p.tv) continue;
    const fixed = { [P.ROSpec]: 6, [P.ROBoundarySpec]: 0, [P.ROSpecStartTrigger]: 1, [P.ROSpecStopTrigger]: 5, [P.AISpecStopTrigger]: 5,
      [P.InventoryParameterSpec]: 3, [P.AntennaConfiguration]: 2, [P.C1G2InventoryCommand]: 1, [P.C1G2Filter]: 1,
      [P.ROReportSpec]: 3, [P.TagReportContentSelector]: 2, [P.AccessSpec]: 12, [P.AccessCommand]: 0, [P.C1G2TagSpec]: 0, [P.C1G2Lock]: 6 };
    const offset = p.type === P.AISpec ? 2 + 2 * p.body.readUInt16BE(0) : fixed[p.type];
    if (offset != null) { if (p.body.length < offset) throw new Error('Truncated container'); validate(p.body.subarray(offset), depth + 1); }
    if (p.type === P.Custom && p.subtype === IMP.TagReportContentSelector) validate(p.data, depth + 1);
  }
}
// Minimal tag memory model: validates target selection and operation result types.
// This is a test double, not an independent Gen2/LLRP conformance implementation.
function sendTags(s, n, access, clear, tags) {
  const reps = tags.filter(t => !t.killed).map((t, i) => tlv(P.TagReportData, tlv(P.EPCData, u16(t.epc.length * 4), Buffer.from(t.epc, 'hex')), tv(1, u16(1 + (n + i) % 2)), tv(6, Buffer.from([256 - 55])), tv(7, u16(1 + n % 3)),
    tv(2, u64(Date.now() * 1000)), tv(4, u64(Date.now() * 1000)), tv(8, u16(1)), tv(12, u16(0x3000)),
    custom(IMP.SerializedTID, u16(6), Buffer.from(t.tid, 'hex')), custom(IMP.RFPhaseAngle, u16(1024)), custom(IMP.PeakRSSI, s16(-5525))));
  if (access?.enabled && n > 3) {
    const cmd = C.find(access.cmd, P.AccessCommand), parts = C.parseParams(cmd.body), target = C.find(C.parseParams(C.find(parts, P.C1G2TagSpec).body), P.C1G2TargetTag).body;
    const bank = target[0] >> 6, pointer = target.readUInt16BE(1), maskBits = target.readUInt16BE(3), maskBytes = Math.ceil(maskBits / 8), dataBits = target.readUInt16BE(5 + maskBytes), data = target.subarray(7 + maskBytes);
    const matches = t => { const value = Buffer.from(bank === 2 ? t.tid : '00000000' + t.epc, 'hex'); for (let i = 0; i < dataBits; i++) { const at = pointer + i; if (target[5 + (i >> 3)] & (128 >> (i % 8))) if (((value[at >> 3] || 0) >> (7 - at % 8) & 1) !== (data[i >> 3] >> (7 - i % 8) & 1)) return false; } return true; };
    const tag = tags.find(t => !t.killed && matches(t));
    if (tag) {
      const op = parts.find(p => p.type !== P.C1G2TagSpec), b = op.body, opId = b.readUInt16BE(0); let result;
      if (op.type === P.C1G2Read) { const count = b.readUInt16BE(9), offset = b.readUInt16BE(7) * 2, memory = tag.mem[b[6] >> 6]; result = tlv(P.C1G2ReadOpSpecResult, u8(offset + count * 2 > memory.length ? 4 : 0), u16(opId), u16(count), memory.subarray(offset, offset + count * 2)); }
      else if ([P.C1G2Write, P.C1G2BlockWrite].includes(op.type)) {
        const bank = b[6] >> 6, offset = b.readUInt16BE(7) * 2, count = b.readUInt16BE(9), bytes = b.subarray(11), memory = tag.mem[bank], bad = offset + bytes.length > memory.length;
        if (!bad) { bytes.copy(memory, offset); if (bank === 1) { if (offset === 2) tag.epc = memory.subarray(4, 4 + (memory.readUInt16BE(2) >> 11) * 2).toString('hex').toUpperCase(); else if (offset === 4) tag.epc = bytes.toString('hex').toUpperCase(); } }
        result = tlv(op.type === P.C1G2Write ? P.C1G2WriteOpSpecResult : P.C1G2BlockWriteOpSpecResult, u8(bad ? 1 : 0), u16(opId), u16(bad ? 0 : count));
      } else if (op.type === P.C1G2Lock) result = tlv(P.C1G2LockOpSpecResult, u8(0), u16(opId));
      else if (op.type === P.C1G2Kill) { tag.killed = true; result = tlv(P.C1G2KillOpSpecResult, u8(0), u16(opId)); }
      if (result) { reps.push(tlv(P.TagReportData, tlv(P.EPCData, u16(tag.epc.length * 4), Buffer.from(tag.epc, 'hex')), tv(1, u16(1)), tv(16, u32(access.id)), result)); clear(); }
    }
  }
  s.write(message(MSG.RO_ACCESS_REPORT, 0, reps));
}
module.exports = { startMock, seen, validate };
if (require.main === module) startMock(+process.argv[2] || 5084).then(() => console.log('mock LLRP reader listening'));
