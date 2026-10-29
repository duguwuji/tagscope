// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Tag model information derived from the TID (ISO/IEC 15963 class E2 / GS1 MDID registry).
(function (root) {
  'use strict';
  const MFR = { 0x001: 'IMPINJ', 0x002: 'TEXAS INSTRUMENTS', 0x003: 'ALIEN', 0x004: 'INTELLEFLEX', 0x005: 'ATMEL', 0x006: 'NXP', 0x007: 'STMICROELECTRONICS', 0x008: 'EP MICROELECTRONICS',
    0x009: 'MOTOROLA', 0x00A: 'SENTECH', 0x00B: 'EM MICROELECTRONIC', 0x00C: 'RENESAS', 0x00D: 'MSTAR', 0x00E: 'TYCO', 0x00F: 'QUANRAY', 0x010: 'FUJITSU', 0x011: 'LSIS', 0x012: 'CAEN RFID',
    0x013: 'PRODUCTIVITY ENGINEERING', 0x014: 'FEDERAL ELECTRIC', 0x015: 'ON SEMICONDUCTOR', 0x016: 'RAMTRON', 0x017: 'TEGO', 0x018: 'CEITEC', 0x019: 'CPA WIRELESS', 0x01A: 'TEXTRON', 0x01E: 'ANDY RFID',
    0x01F: 'RFMICRON', 0x020: 'KILOWAY' };
  const MODEL = {
    0x001: { 0x093: 'MONZA 3', 0x0A0: 'MONZA 2', 0x100: 'MONZA 4D', 0x104: 'MONZA 4U', 0x105: 'MONZA 4QT', 0x10C: 'MONZA 4E', 0x130: 'MONZA 5', 0x140: 'MONZA X-2K', 0x150: 'MONZA X-8K',
      0x160: 'MONZA R6', 0x170: 'MONZA R6-P', 0x171: 'MONZA R6-A', 0x173: 'MONZA S6-C', 0x190: 'M750', 0x191: 'M730', 0x1A0: 'M770', 0x1A2: 'M775', 0x1B0: 'M781', 0x1D0: 'M830/M850' },
    0x006: { 0x003: 'UCODE G2XM', 0x004: 'UCODE G2XL', 0x006: 'UCODE G2iL', 0x007: 'UCODE G2iL+', 0x00A: 'UCODE G2iM', 0x00B: 'UCODE G2iM+', 0x810: 'UCODE 7', 0x891: 'UCODE 7XM+', 0x894: 'UCODE 8', 0x994: 'UCODE 8M', 0x915: 'UCODE 9', 0x995: 'UCODE 9XE' },
    0x003: { 0x411: 'HIGGS 2', 0x412: 'HIGGS 3', 0x414: 'HIGGS 4', 0x811: 'HIGGS EC', 0x812: 'HIGGS 9' },
    0x00B: { 0x004: 'EM4124', 0x018: 'EM4126' },
  };
  function tagModel(tid) {
    const h = String(tid || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
    if (h.length < 8) return '';
    const cls = h.slice(0, 2);
    if (cls === 'E2') {
      const v = parseInt(h.slice(2, 8), 16), mdid = (v >> 12) & 0x1FF, tmn = v & 0xFFF;
      const m = MFR[mdid] || `MDID 0x${mdid.toString(16).toUpperCase().padStart(3, '0')}`;
      const model = (MODEL[mdid] || {})[tmn] || `TMN 0x${tmn.toString(16).toUpperCase().padStart(3, '0')}`;
      return `CLASS E2 : ${m} : ${model}`;
    }
    if (cls === 'E0') return 'CLASS E0 : ISO/IEC 7816-6';
    if (cls === 'E3') return 'CLASS E3 : ISO/IEC 7816-6 (ISO/IEC 15963)';
    return `CLASS ${cls}`;
  }
  root.TagDB = { tagModel };
  if (typeof module === 'object' && module.exports) module.exports = root.TagDB;
})(typeof self !== 'undefined' ? self : this);
