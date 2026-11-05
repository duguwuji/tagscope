// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Built-in simulator scenes, modelled on the scene files of the ReaderForge / r700-sim project.
// Shared by the browser simulator (public/sim.js) and the bridge (lib/driver-sim.js).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TagScopeScenes = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const hex = n => Array.from({ length: n }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
  const CHIPS = ['E2801191', 'E2801170', 'E2806915', 'E2003412', 'E2801150', 'E28011A0'];

  // GPI pulse train: high for `width` seconds every `every` seconds, `count` times.
  const pulses = (port, from, every, width, count) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const at = from + i * every;
      out.push({ at, gpi: { port, state: 'high' } }, { at: +(at + width).toFixed(3), gpi: { port, state: 'low' } });
    }
    return out;
  };
  const sortEvents = list => list.slice().sort((a, b) => a.at - b.at);

  const SCENES = [
    {
      id: 'conveyor',
      title: '传送带分拣',
      desc: '纸箱每 1.5 s 通过一箱、场内停留 0.8 s，两侧天线各一个；第 25 箱标签损坏信号极弱，光电 GPI2 每箱到达时发脉冲。用于验证高速通过时的漏读与读取时延。',
      duration: 50,
      loop: true,
      tags: [
        { epcPattern: '3074257BF7194E4C{seq:08d}', count: 24, enterAt: 2, exitAt: 2.8, stagger: 1.5, antennas: { 1: -52, 2: -58 }, jitter: 3 },
        { epc: '3074257BF7194E4C00000025', enterAt: 38, exitAt: 38.8, antennas: { 1: -83, 2: -86 }, jitter: 2 },
        { epcPattern: '3074257BF7194E4C{seq:08d}', seqStart: 26, count: 6, enterAt: 39.5, exitAt: 40.3, stagger: 1.5, antennas: { 1: -52, 2: -58 }, jitter: 3 },
      ],
      events: pulses(2, 2, 1.5, 0.3, 30),
    },
    {
      id: 'dock_door',
      title: '物流收货门',
      desc: '叉车带 40 箱货穿过收货门，GPI1 进门拉高、出门拉低；门框 4 个参考标签常驻；40 s 天线 3 掉线、50 s 恢复。用于验证 GPI 触发盘点与天线故障。',
      duration: 60,
      loop: true,
      tags: [
        { epcPattern: 'E2000017221101441890{seq:04d}', count: 4, static: true, antennas: { 1: -62, 2: -68 } },
        { epcPattern: '3034257BF7194E4000{seq:06d}', count: 40, enterAt: 10, exitAt: 25, stagger: 0.1, antennas: { 1: -48, 2: -55, 3: -60 }, jitter: 3 },
        { epc: '300833B2DDD9014000000001', tid: 'E2801190200052A1B2C3D4E5', user: 'CAFEBABE00000000', accessPassword: '12345678', enterAt: 30, antennas: { 4: -50 } },
      ],
      events: sortEvents([
        { at: 9, gpi: { port: 1, state: 'high' } },
        { at: 26, gpi: { port: 1, state: 'low' } },
        { at: 40, antenna: 3, connected: false },
        { at: 50, antenna: 3, connected: true },
      ]),
    },
    {
      id: 'retail_shelf',
      title: '零售门店盘点',
      desc: '300 件单品静态挂在 4 组货架，信号偏弱且波动大；20 件在试衣间时有时无；15 s 拿走 5 件、补货 10 件。用于验证大标签量与盘点准确率。',
      duration: 90,
      loop: false,
      tags: [
        { epcPattern: '30361F84C03F2B4000{seq:06d}', count: 80, static: true, antennas: { 1: -66, 2: -74 }, jitter: 5 },
        { epcPattern: '30361F84C03F2B4100{seq:06d}', count: 80, static: true, antennas: { 2: -64, 3: -73 }, jitter: 5 },
        { epcPattern: '30361F84C03F2B4200{seq:06d}', count: 70, static: true, antennas: { 3: -67, 4: -72 }, jitter: 5 },
        { epcPattern: '30361F84C03F2B4300{seq:06d}', count: 50, static: true, antennas: { 4: -70, 1: -76 }, jitter: 6 },
        { epcPattern: '30361F84C03F2B4400{seq:06d}', count: 20, enterAt: 5, exitAt: 60, stagger: 1, antennas: { 4: -78 }, jitter: 7 },
      ],
      events: sortEvents([
        { at: 15, remove: '30361F84C03F2B4000000001' },
        { at: 15, remove: '30361F84C03F2B4000000002' },
        { at: 15, remove: '30361F84C03F2B4000000003' },
        { at: 15, remove: '30361F84C03F2B4000000004' },
        { at: 15, remove: '30361F84C03F2B4000000005' },
        { at: 15, add: [{ epcPattern: '30361F84C03F2B4500{seq:06d}', count: 10, antennas: { 1: -63 }, jitter: 4 }] },
      ]),
    },
    {
      id: 'smart_cabinet',
      title: '智能工具柜',
      desc: '柜内 4 层共 48 件工具常驻、层间有串读；10 s 开门取走 3 件、20 s 关门；40 s 再开门归还 1 件并放入 1 件未登记物品。用于验证开关门盘点与差异。',
      duration: 70,
      loop: false,
      tags: [
        { epcPattern: 'E28068940000501F0C11{seq:04d}', count: 12, static: true, antennas: { 1: -45, 2: -70 }, jitter: 2 },
        { epcPattern: 'E28068940000501F0C12{seq:04d}', count: 12, static: true, antennas: { 2: -46, 1: -69, 3: -71 }, jitter: 2 },
        { epcPattern: 'E28068940000501F0C13{seq:04d}', count: 12, static: true, antennas: { 3: -47, 2: -70, 4: -72 }, jitter: 2 },
        { epcPattern: 'E28068940000501F0C14{seq:04d}', count: 12, static: true, antennas: { 4: -48, 3: -71 }, jitter: 2 },
      ],
      events: sortEvents([
        { at: 10, gpi: { port: 1, state: 'high' } },
        { at: 14, remove: 'E28068940000501F0C110003' },
        { at: 15, remove: 'E28068940000501F0C120007' },
        { at: 16, remove: 'E28068940000501F0C140011' },
        { at: 20, gpi: { port: 1, state: 'low' } },
        { at: 40, gpi: { port: 1, state: 'high' } },
        { at: 44, add: [{ epc: 'E28068940000501F0C120007', antennas: { 2: -46, 1: -69 } }, { epc: 'E28068940000501F0C99FFFF', antennas: { 3: -50 } }] },
        { at: 48, gpi: { port: 1, state: 'low' } },
      ]),
    },
    {
      id: 'access_gate',
      title: '人员通道 / 门禁',
      desc: '通道两侧天线：1 朝外、2 朝内。上班高峰 15 人进门（天线 1 更强）、5 人出门（天线 2 更强）；2 人结伴同时进入；1 张工牌常驻门边。用于验证方向判断与滞留告警。',
      duration: 45,
      loop: true,
      tags: [
        { epcPattern: '35A1000000000000E{seq:07d}', count: 15, enterAt: 3, exitAt: 4.5, stagger: 2, antennas: { 1: -50, 2: -63 }, jitter: 4 },
        { epcPattern: '35A1000000000000F{seq:07d}', count: 5, enterAt: 33, exitAt: 34.5, stagger: 1.6, antennas: { 2: -50, 1: -64 }, jitter: 4 },
        { epc: '35A1000000000000A0000001', enterAt: 20, exitAt: 21.2, antennas: { 1: -55, 2: -60 } },
        { epc: '35A1000000000000A0000002', enterAt: 20.1, exitAt: 21.3, antennas: { 1: -57, 2: -62 } },
        { epc: '35A1000000000000B0000099', static: true, antennas: { 2: -71 }, jitter: 3 },
      ],
      events: [],
    },
  ];

  const byId = id => SCENES.find(s => s.id === id) || null;

  // Expand an EPC pattern such as 'E280{seq:04d}' for tag number `seq` (1-based).
  function epcFor(pattern, seq) {
    return String(pattern).replace(/\{seq:0?(\d+)d\}/, (_, w) => String(seq).padStart(+w, '0'));
  }

  // Materialise a scene (or any { tags: [...] } object) into simulator tag objects.
  function buildTags(scene) {
    const out = [];
    for (const spec of (scene && scene.tags) || []) {
      const n = spec.epc ? 1 : Math.max(1, +spec.count || 1);
      const stagger = +spec.stagger || 0;
      for (let i = 0; i < n; i++) {
        const seq = (+spec.seqStart || 1) + i;
        const epc = spec.epc ? String(spec.epc).toUpperCase() : epcFor(spec.epcPattern, seq);
        const enterAt = (+spec.enterAt || 0) + i * stagger;
        out.push({
          epc, seq,
          tid: spec.tid ? String(spec.tid).toUpperCase() : CHIPS[seq % CHIPS.length] + '2000' + hex(12),
          pc: '3000',
          user: spec.user ? String(spec.user).toUpperCase() : '0'.repeat(128),
          // Reserved bank: kill password words first (zeroed), then the access password words.
          reserved: '00000000' + (spec.accessPassword ? String(spec.accessPassword).toUpperCase() : '00000000'),
          antRssi: spec.antennas || {},
          jitter: +spec.jitter || 0,
          angle: Math.round(Math.random() * 360),
          enterAt, exitAt: spec.exitAt == null ? Infinity : (+spec.exitAt + i * stagger),
          static: !!spec.static, removed: false, killed: false,
          flag: [0, 0, 0, 0], decay: [0, 0, 0, 0], locks: {},
        });
      }
    }
    return out;
  }

  // A tag is readable at `elapsed` seconds into the scene timeline.
  function visibleAt(tag, elapsed) {
    if (!tag || tag.removed || tag.killed) return false;
    return !!tag.static || (elapsed >= tag.enterAt && elapsed <= tag.exitAt);
  }

  return { SCENES, byId, buildTags, visibleAt, epcFor };
});
