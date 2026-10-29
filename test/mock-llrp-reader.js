'use strict';
// A tiny fake LLRP reader used to exercise the driver's encoder/decoder end-to-end (not a spec validator).
const net = require('net');
const C = require('../lib/llrp-codec');
const { MSG, P, IMP, u8, u16, s16, u32, u64, utf8v, tlv, tv, custom, message } = C;
const ok = () => tlv(P.LLRPStatus, u16(0), utf8v(''));
const RESP = { 1: 11, 2: 12, 3: 13, 14: 4, 20: 30, 21: 31, 22: 32, 23: 33, 24: 34, 25: 35, 40: 50, 41: 51, 42: 52, 43: 53 };
const seen = [];
function startMock(port) {
  const srv = net.createServer(s => {
    let buf = Buffer.alloc(0), timer = null, access = null, rospec = null;
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
        if (h.type === MSG.ADD_ACCESSSPEC) { validate(body); const a = C.find(C.parseParams(body), P.AccessSpec); access = { id: a.body.readUInt32BE(0), cmd: C.parseParams(a.body, 12) }; }
        if (h.type === MSG.START_ROSPEC) { clearInterval(timer); let n = 0; timer = setInterval(() => sendTags(s, ++n, access, () => access = null), 20); }
        if (h.type === MSG.STOP_ROSPEC) clearInterval(timer);
        if (h.type === MSG.CLOSE_CONNECTION) { s.write(message(4, h.id, ok())); s.end(); continue; }
        if (RESP[h.type]) s.write(message(RESP[h.type], h.id, ok()));
        else s.write(message(MSG.ERROR_MESSAGE, h.id, tlv(P.LLRPStatus, u16(101), utf8v('unsupported'))));
      }
    });
    s.on('close', () => clearInterval(timer)); s.on('error', () => { });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
function validate(buf, depth = 0) { // recursively walks TLVs to check lengths nest properly
  for (const p of C.parseParams(buf)) if (!p.tv && p.body.length >= 4 && depth < 12) { try { C.parseParams(p.body); } catch (_) { } }
}
function sendTags(s, n, access, clear) {
  const epcs = ['E28011700000020A1B2C3D01', 'E28011700000020A1B2C3D02', 'E28011700000020A1B2C3D03'];
  const reps = epcs.map((e, i) => tlv(P.TagReportData, tv(13, Buffer.from(e, 'hex')), tv(1, u16(1 + (n + i) % 2)), tv(6, Buffer.from([256 - 55])), tv(7, u16(1 + n % 3)),
    tv(2, u64(Date.now() * 1000)), tv(4, u64(Date.now() * 1000)), tv(8, u16(1)), tv(12, u16(0x3000)),
    custom(IMP.SerializedTID, u16(6), Buffer.from('E2801170200012345678' + String(i).padStart(4, '0'), 'hex')), custom(IMP.RFPhaseAngle, u16(1024)), custom(IMP.PeakRSSI, s16(-5525))));
  if (access && n > 3) {
    reps.push(tlv(P.TagReportData, tv(13, Buffer.from(epcs[0], 'hex')), tv(1, u16(1)), tv(16, u32(access.id)),
      tlv(P.C1G2ReadOpSpecResult, u8(0), u16(1), u16(2), Buffer.from('E2801170', 'hex')))); clear();
  }
  s.write(message(MSG.RO_ACCESS_REPORT, 0, reps));
}
module.exports = { startMock, seen };
if (require.main === module) startMock(+process.argv[2] || 5084).then(() => console.log('mock LLRP reader listening'));
