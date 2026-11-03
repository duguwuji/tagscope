// Shared validation for imported presets and bridge requests. No coercion of untrusted fields.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TagScopeValidation = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function object(v, label) { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(label + '必须为对象'); return v; }
  function number(v, min, max, label, integer = false) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw new Error(label + '数值或范围无效');
    return v;
  }
  const integer = (v, min, max, label) => number(v, min, max, label, true);
  function bool(v, label) { if (typeof v !== 'boolean') throw new Error(label + '必须为布尔值'); return v; }
  function choice(v, values, label) { if (!values.includes(v)) throw new Error(label + '无效'); return v; }
  function hex(v, max, label, empty = false) {
    if (typeof v !== 'string' || v.length > max || !(empty && !v) && !/^[0-9a-f]+$/i.test(v)) throw new Error(label + '必须为十六进制');
    return v.toUpperCase();
  }
  function filters(v = []) {
    if (!Array.isArray(v) || v.length > 5) throw new Error('过滤器最多 5 个');
    return v.map(f => {
      object(f, '过滤器'); const mask = hex(f.mask, 2048, '过滤掩码');
      const match = choice(f.match, ['select', 'unselect', 'nothing'], '匹配动作');
      const miss = choice(f.miss, ['select', 'unselect', 'nothing'], '不匹配动作');
      if (match === miss) throw new Error('过滤器匹配与不匹配动作不能相同');
      return { mask, bank: choice(f.bank, ['epc', 'tid', 'user', 'reserved'], '存储区'), pointer: integer(f.pointer, 0, 65535, '过滤偏移'),
        bits: f.bits === '' || f.bits == null ? '' : integer(f.bits, 1, mask.length * 4, '过滤位长度'), match, miss };
    });
  }
  function ldc(v) { object(v, '低占空比'); return { enabled: bool(v.enabled, '低占空比'), emptyTimeout: integer(v.emptyTimeout, 1, 65535, '空闲超时'), pingInterval: integer(v.pingInterval, 1, 65535, '探测间隔') }; }
  function preset(input, defaults) {
    object(input, '预设'); object(defaults, '默认预设');
    const p = { ...defaults, ...input };
    if (typeof p.ants !== 'string' || p.ants.length > 512 || !/^\s*\d+(?:[\s,，;]+\d+)*\s*$/.test(p.ants)) throw new Error('天线列表无效');
    const ants = [...new Set(p.ants.trim().split(/[\s,，;]+/).map(n => integer(Number(n), 1, 64, '天线')))];
    const out = { ants: ants.join(', '), mode: integer(p.mode, 0, 0xffffffff, 'RF 模式'), search: choice(p.search, [0, 1, 2, 3, 5, 6], '搜索模式'),
      session: integer(p.session, 0, 3, 'Session'), pop: integer(p.pop, 1, 65535, '标签数量'), power: number(p.power, -50, 40, '发射功率'), rx: number(p.rx, -150, 0, '灵敏度'),
      fastId: bool(p.fastId, 'Fast ID'), phase: bool(p.phase, '相位角'), doppler: bool(p.doppler, '多普勒'), maxSens: bool(p.maxSens, '最大灵敏度'),
      filters: filters(p.filters), per: {}, gpi: {}, ldc: ldc(p.ldc) };
    for (const [key, value] of Object.entries(object(p.per, '独立天线设置'))) {
      if (!/^[1-9]\d?$/.test(key)) throw new Error('天线编号无效'); integer(+key, 1, 64, '天线'); object(value, '天线设置');
      const a = {}; if (own(value, 'tx')) a.tx = number(value.tx, -50, 40, '天线功率'); if (own(value, 'rx')) a.rx = number(value.rx, -150, 0, '天线灵敏度'); out.per[key] = a;
    }
    for (const [key, value] of Object.entries(object(p.gpi, 'GPI 设置'))) {
      if (!/^[1-9]\d?$/.test(key)) throw new Error('GPI 编号无效'); integer(+key, 1, 64, 'GPI'); object(value, 'GPI 设置');
      const g = { start: bool(value.start ?? false, 'GPI 启动'), stop: bool(value.stop ?? false, 'GPI 停止'), startLvl: choice(value.startLvl ?? 'high', ['high', 'low'], 'GPI 电平'), stopLvl: choice(value.stopLvl ?? 'low', ['high', 'low'], 'GPI 电平') };
      if (g.start && g.stop && g.startLvl === g.stopLvl) throw new Error('同一 GPI 启停电平不能相同'); out.gpi[key] = g;
    }
    return out;
  }
  function inventory(c) {
    object(c, '盘点配置');
    if (!Array.isArray(c.antennas) || !c.antennas.length || c.antennas.length > 64) throw new Error('天线配置无效');
    const ids = new Set();
    const antennas = c.antennas.map(a => { object(a, '天线'); const id = integer(a.id, 1, 64, '天线'); if (ids.has(id)) throw new Error('天线重复'); ids.add(id);
      return { id, enabled: bool(a.enabled, '启用天线'), txDbm: number(a.txDbm, -50, 40, '发射功率'), rxDbm: a.rxDbm === '' || a.rxDbm == null ? '' : number(a.rxDbm, -150, 0, '灵敏度') }; });
    if (!antennas.some(a => a.enabled)) throw new Error('请至少启用一个天线');
    const gpi = {};
    if (c.gpi) for (const k of ['start', 'stop']) if (c.gpi[k]) { const g = object(c.gpi[k], 'GPI'); gpi[k] = { port: integer(g.port, 1, 64, 'GPI'), level: choice(g.level, ['high', 'low'], 'GPI 电平') }; }
    let fs = c.filters;
    if (!fs && c.filter?.enabled) fs = [{ bank: c.filter.bank, pointer: c.filter.pointer, mask: c.filter.mask, bits: c.filter.maskBits, match: c.filter.action === 'exclude' ? 'unselect' : 'select', miss: c.filter.action === 'exclude' ? 'select' : 'unselect' }];
    return { antennas, mode: integer(c.mode ?? 0, 0, 0xffffffff, 'RF 模式'), session: integer(c.session ?? 0, 0, 3, 'Session'), searchMode: choice(c.searchMode ?? 2, [0, 1, 2, 3, 5, 6], '搜索模式'),
      tagPopulation: integer(c.tagPopulation ?? 32, 1, 65535, '标签数量'), fastId: bool(c.fastId ?? false, 'Fast ID'), phase: bool(c.phase ?? true, '相位角'), doppler: bool(c.doppler ?? false, '多普勒'), quiet: bool(c.quiet ?? false, 'quiet'),
      filters: filters(fs), filterLink: choice(c.filterLink ?? 'union', ['union', 'intersection'], '过滤关系'), gpi: c.gpi ? gpi : null, ldc: c.ldc ? ldc(c.ldc) : null };
  }
  function access(r) {
    object(r, '标签操作'); const op = choice(r.op, ['read', 'write', 'blockWrite', 'writeEpc', 'lock', 'kill'], '标签操作');
    const out = { op, targetEpc: hex(r.targetEpc ?? '', 124, '目标 EPC', true), targetTid: hex(r.targetTid ?? '', 256, '目标 TID', true), password: hex(r.password ?? '', 8, '密码', true),
      timeout: number(r.timeout ?? 5, 0.001, 60, '操作超时'), antenna: integer(r.antenna ?? 0, 0, 64, '天线') };
    if (!out.targetEpc && !out.targetTid) throw new Error('标签操作必须指定目标 EPC 或 TID');
    if (out.targetEpc.length % 2 || out.targetTid.length % 2) throw new Error('目标标识必须是完整字节');
    if (op === 'read' || op === 'write' || op === 'blockWrite') { out.bank = choice(r.bank, ['reserved', 'epc', 'tid', 'user'], '存储区'); out.wordPointer = integer(r.wordPointer ?? 0, 0, 65535, '字偏移'); }
    if (op === 'read') out.wordCount = integer(r.wordCount, 1, 32, '读取字数');
    if (['write', 'blockWrite', 'writeEpc'].includes(op)) { out.data = hex(r.data, op === 'writeEpc' ? 124 : 128, '写入数据'); if (out.data.length % 4) throw new Error('写入数据必须为完整的 16 位字'); }
    if (op === 'lock') { out.field = choice(r.field, ['kill', 'access', 'epc', 'tid', 'user'], '锁定区'); out.privilege = choice(r.privilege, ['lock', 'permalock', 'permaunlock', 'unlock'], '锁定权限'); }
    if (op === 'kill' && !parseInt(out.password || '0', 16)) throw new Error('灭活密码不能为 0');
    return out;
  }
  return { preset, inventory, access, object, integer };
});
