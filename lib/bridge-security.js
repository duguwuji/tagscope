'use strict';
const crypto = require('crypto');
const os = require('os');

function createSecurity({ host, port, token, allowOrigins = [], allowHosts = [] }) {
  token = token || crypto.randomBytes(24).toString('base64url');
  if (typeof token !== 'string' || token.length < 24 || token.length > 256 || /[\s\x00-\x1f]/.test(token)) throw new Error('桥接配对码需为 24–256 个非空白字符');
  const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!['0.0.0.0', '::'].includes(host)) hosts.add(host.toLowerCase());
  for (const list of Object.values(os.networkInterfaces())) for (const x of list || []) hosts.add(x.family === 'IPv6' ? `[${x.address.toLowerCase()}]` : x.address);
  for (const h of allowHosts) { if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(h)) throw new Error('允许的桥接主机名无效'); hosts.add(h.toLowerCase()); }
  const origins = new Set(['https://tagscope.iotrfid.top', ...allowOrigins]);
  for (const o of origins) { const u = new URL(o); if (!['http:', 'https:'].includes(u.protocol) || u.origin !== o) throw new Error('允许来源必须是完整 origin（不含路径）'); }
  function hostOk(req) {
    const h = req.headers.host; if (!h || !/^[a-z0-9.:[\]-]+$/i.test(h)) return false;
    try { const u = new URL('http://' + h); return hosts.has(u.hostname.toLowerCase()) && Number(u.port || 80) === Number(typeof port === 'function' ? port() : port); } catch (_) { return false; }
  }
  function originOk(req) { return !req.headers.origin || origins.has(req.headers.origin) || hostOk(req) && req.headers.origin === `http://${req.headers.host}`; }
  const expected = crypto.createHash('sha256').update(token).digest();
  function authorized(req) {
    const a = req.headers.authorization || ''; if (!a.startsWith('Bearer ') || a.length > 263) return false;
    return crypto.timingSafeEqual(expected, crypto.createHash('sha256').update(a.slice(7)).digest());
  }
  function localPage(req) { return hostOk(req) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress) && (!req.headers.origin || req.headers.origin === `http://${req.headers.host}`) && (!req.headers['sec-fetch-site'] || ['none', 'same-origin'].includes(req.headers['sec-fetch-site'])); }
  return { token, hostOk, originOk, authorized, localPage };
}
module.exports = { createSecurity };
