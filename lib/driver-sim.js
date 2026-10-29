'use strict';
// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Simulator driver for the bridge: wraps the shared simulator core (public/sim.js).
const { EventEmitter } = require('events');
const Sim = require('../public/sim.js');

class SimDriver extends EventEmitter {
  constructor() { super(); this.kind = 'sim'; this.core = new Sim((ev, ...a) => this.emit(ev, ...a)); }
  get running() { return this.core.running; }
  async connect(o) { return this.core.connect(o); }
  async start(cfg) { this.cfg = cfg; this.core.start(cfg); }
  async stop() { this.core.stop(); }
  async accessOp(r) { return this.core.accessOp(r); }
  async gpo(port, state) { return this.core.setGpo(port, state); }
  async gpi(port, level) { this.core.setGpi(port, level); return { port, level }; }
  async disconnect() { this.core.disconnect(); }
}
module.exports = { SimDriver };
