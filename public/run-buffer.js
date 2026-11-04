// Sequenced batches shared by bridge and browser simulator; bounded replay repairs HTTP/SSE races.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.TagScopeRunBuffer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const incomplete = message => Object.assign(new Error(message), { code: 'INCOMPLETE_DATA' });
  class RunBuffer {
    constructor(id, runId) { this.id = id; this.runId = runId; this.seq = 0; this.map = new Map(); this.total = 0; this.history = []; this.bytes = 0; }
    add(t) {
      this.total += t.count || 1; const key = t.epc + '|' + t.antenna, b = this.map.get(key), hasR = Number.isFinite(t.rssi);
      if (!b) this.map.set(key, { ...t, count: t.count || 1, maxRssi: t.rssi, minRssi: t.rssi, rssiSum: hasR ? t.rssi : 0, rssiN: hasR ? 1 : 0, firstTs: t.ts });
      else { b.count += t.count || 1; if (hasR) { b.rssi = t.rssi; b.rssiSum += t.rssi; b.rssiN++; b.maxRssi = Math.max(b.maxRssi ?? -Infinity, t.rssi); b.minRssi = Math.min(b.minRssi ?? Infinity, t.rssi); }
        for (const f of ['phase', 'doppler', 'channel', 'freq', 'tid', 'pc', 'xpc', 'crh', 'rts', 'power']) if (t[f] != null) b[f] = t[f]; b.ts = t.ts; }
    }
    flush() {
      if (!this.map.size) return null;
      const batch = { id: this.id, runId: this.runId, seq: ++this.seq, reads: [...this.map.values()], total: this.total, ts: Date.now() };
      this.map.clear(); this.total = 0;
      const bytes = JSON.stringify(batch).length * 2; this.history.push({ batch, bytes }); this.bytes += bytes;
      while (this.history.length > 1 && (this.history.length > 64 || this.bytes > 4 * 1024 * 1024)) this.bytes -= this.history.shift().bytes;
      return batch;
    }
    since(seq = 0) { return { runId: this.runId, finalSeq: this.seq, complete: seq >= (this.history[0]?.batch.seq || 1) - 1, batches: this.history.filter(x => x.batch.seq > seq).map(x => x.batch) }; }
  }
  class Receiver {
    constructor(deliver) { this.deliver = deliver; this.runs = new Map(); }
    begin(id, runId) { this.runs.set(id, { runId, seq: 0, pending: new Map(), broken: false }); }
    seq(id) { return this.runs.get(id)?.seq || 0; }
    accept(b) {
      const r = this.runs.get(b.id); if (!r || r.runId !== b.runId || r.broken || !Number.isInteger(b.seq) || b.seq <= r.seq) return;
      if (r.pending.size > 64) {
        // A gap this large cannot be repaired. Drop the buffered tail and fail once,
        // instead of keeping the receiver poisoned for the rest of the run.
        r.pending.clear(); r.broken = true;
        throw incomplete('标签数据流缺失，当前结果不完整');
      }
      r.pending.set(b.seq, b);
      while (r.pending.has(r.seq + 1)) { const next = r.pending.get(r.seq + 1); r.pending.delete(++r.seq); this.deliver(next); }
    }
    finish(id, result) {
      const r = this.runs.get(id);
      if (!r || r.runId !== result.runId) throw incomplete('运行标识不匹配，当前结果不完整');
      for (const b of result.batches || []) this.accept(b);
      // SSE may have delivered older batches after the stop request captured afterSeq.
      // Only the contiguous received sequence determines completeness.
      if (r.broken || r.seq !== result.finalSeq) throw incomplete('标签数据流缺失，当前结果不完整，请重新运行');
    }
  }
  return { RunBuffer, Receiver };
});
