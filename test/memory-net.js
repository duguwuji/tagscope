'use strict';
// Deterministic duplex transport for LLRP tests in environments that prohibit TCP listeners.
const { EventEmitter } = require('events');
const servers = new Map(); let nextPort = 20000;
class Socket extends EventEmitter {
  constructor() { super(); this.destroyed = false; }
  setNoDelay() {} setKeepAlive() {}
  write(data) { if (this.destroyed) throw new Error('Socket closed'); const copy = Buffer.from(data); queueMicrotask(() => { if (!this.peer.destroyed) this.peer.emit('data', copy); }); return true; }
  end(data) { if (data) this.write(data); queueMicrotask(() => { if (!this.peer.destroyed) this.peer.emit('end'); this.destroy(); }); }
  destroy() { if (this.destroyed) return; this.destroyed = true; const peer = this.peer; if (peer) peer.destroyed = true; queueMicrotask(() => { this.emit('close'); peer?.emit('close'); }); }
}
function createServer(handler) {
  const server = new EventEmitter(); server.on('connection', handler);
  server.listen = (port, host, cb) => { server.port = port || nextPort++; servers.set(server.port, server); queueMicrotask(cb); return server; };
  server.address = () => ({ port: server.port, address: '127.0.0.1' });
  server.close = cb => { servers.delete(server.port); cb?.(); };
  return server;
}
function connect({ port }) {
  const client = new Socket(), peer = new Socket(); client.peer = peer; peer.peer = client;
  queueMicrotask(() => { const server = servers.get(port); if (!server) return client.emit('error', new Error('ECONNREFUSED')); client.emit('connect'); server.emit('connection', peer); });
  return client;
}
module.exports = { createServer, connect };
