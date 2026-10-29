// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// Cloudflare Worker: serves the TagScope web UI. Reader traffic never goes through Cloudflare —
// the page talks to the in-browser simulator or to the local bridge (node server.js).
import html from './public/index.html';
import app from './public/app.js'; // bundled as text (see wrangler.toml rules)

const page = html.replace('<script src="app.js">', '<script>window.TAGSCOPE_CLOUD=1;</script>\n<script src="app.js">');
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: SEC });
    if (pathname === '/' || pathname === '/index.html')
      return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...SEC } });
    if (pathname === '/app.js')
      return new Response(app, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...SEC } });
    if (pathname === '/favicon.ico') return new Response(null, { status: 204, headers: SEC });
    if (pathname.startsWith('/api/'))
      return Response.json({ error: '网页版没有服务端 API。连接真实读写器请在本机运行 node server.js。' }, { status: 404, headers: SEC });
    return new Response('Not found', { status: 404, headers: SEC });
  },
};
