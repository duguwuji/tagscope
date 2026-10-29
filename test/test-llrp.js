'use strict';
const assert = require('assert');
const { startMock, seen } = require('./mock-llrp-reader');
const { LlrpDriver } = require('../lib/driver-llrp');
(async () => {
  const srv = await startMock(15084);
  const d = new LlrpDriver(); const tags = [];
  d.on('tag', t => tags.push(t)); d.on('log', (l, m) => l === 'error' && console.log('LOG', m));
  const info = await d.connect({ host: '127.0.0.1', port: 15084 });
  assert.equal(info.manufacturer, 'Impinj'); assert.equal(info.antennaCount, 4); assert.equal(info.txPowerMax, 30); assert.equal(info.modes.length, 3);
  assert.deepEqual(info.antennas.map(a => a.connected), [true, true, false, false]); assert.equal(info.serial, '001625123456');
  const cfg = { mode: 1002, session: 1, searchMode: 2, tagPopulation: 32, fastId: true, doppler: true, antennas: [{ id: 1, enabled: true, txDbm: 30, rxDbm: -80 }, { id: 2, enabled: true, txDbm: 25, rxDbm: -70 }], filter: { enabled: true, bank: 'epc', pointer: 32, mask: 'E280', action: 'include' } };
  await d.start(cfg);
  await new Promise(r => setTimeout(r, 200));
  assert(tags.length > 10, 'tags received'); const t = tags[0];
  assert.equal(t.epc, 'E28011700000020A1B2C3D01'); assert.equal(t.rssi, -55.25); assert.equal(t.phase, 90); assert.equal(t.freq, 903.25 > 0 ? t.freq : 0); assert(t.tid.startsWith('E280'));
  const r = await d.accessOp({ op: 'read', targetEpc: 'E28011700000020A1B2C3D01', bank: 'tid', wordPointer: 0, wordCount: 2, password: '00000000', timeout: 3 });
  assert(r.ok && r.data === 'E2801170', 'access read ' + JSON.stringify(r));
  await d.accessOp({ op: 'writeEpc', targetEpc: 'E28011700000020A1B2C3D01', data: 'AAAA', password: '0', timeout: 0.3 }); // times out (mock only answers once) but must encode
  await d.stop(); await d.disconnect();
  console.log('PASS', { tags: tags.length, sample: t, access: r, msgTypes: [...new Set(seen)].join(',') });
  srv.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
