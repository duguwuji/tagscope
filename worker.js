// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Cloudflare Worker: serves the TagScope web UI. Reader traffic never goes through Cloudflare —
// the page talks to the in-browser simulator or to the local bridge (node server.js).
import html from './public/index.html';
import app from './public/app.js'; // bundled as text (see wrangler.toml rules)
import sim from './public/sim.js';
import tagdb from './public/tagdb.js';
import views from './public/views.js';
import i18n from './public/i18n.js';

const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
const JS = { '/app.js': app, '/sim.js': sim, '/tagdb.js': tagdb, '/views.js': views, '/i18n.js': i18n };
// Content hash per script so browsers fetch new JS after every deploy (scripts are cached for a day).
const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return (x >>> 0).toString(36); };
const page = html.replace('<script src="tagdb.js', '<script>window.TAGSCOPE_CLOUD=1;</script>\n<script src="tagdb.js')
  .replace(/src="([\w-]+\.js)\?v=[^"]*"/g, (m, f) => JS['/' + f] ? `src="${f}?v=${hash(JS['/' + f])}"` : m);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: SEC });
    if (pathname === '/' || pathname === '/index.html')
      return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SEC } });
    if (JS[pathname])
      return new Response(JS[pathname], { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ...SEC } });
    if (pathname === '/favicon.ico') return new Response(null, { status: 204, headers: SEC });
    if (pathname.startsWith('/api/'))
      return Response.json({ error: '网页版没有服务端 API。连接真实读写器请在本机运行 node server.js。' }, { status: 404, headers: SEC });
    return new Response('Not found', { status: 404, headers: SEC });
  },
};
