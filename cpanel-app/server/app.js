'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { renderSpaHtml } = require('./seo-render');

const questions = require('./routes/questions');
const messages = require('./routes/messages');
const archive = require('./routes/archive');
const admin = require('./routes/admin');
const prayer = require('./routes/prayer');
const seo = require('./routes/seo');
const stats = require('./routes/stats');

/**
 * Build the Express app (no `.listen()`). Isolated from process startup so tests can
 * create one app against an in-memory database without binding a port.
 */
function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // A small request ID for correlation in logs.
  app.use((req, res, next) => {
    req.id = (req.headers['x-request-id'] || `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
    res.setHeader('x-request-id', req.id);
    next();
  });

  // Security headers that are safe to set on every response. The strict CSP is only
  // applied in production so Vite's dev server (inline HMR script + WebSocket) is not
  // blocked; in development Express only serves the API, never the SPA shell.
  const isProd = process.env.NODE_ENV === 'production';
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-XSS-Protection', '0'); // modern browsers ignore this; belt-and-braces only
    if (isProd) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      );
    }
    next();
  });

  // API
  app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
  app.use('/api/questions', questions);
  app.use('/api/messages', messages);
  app.use('/api/archive', archive);
  app.use('/api/admin', admin);
  app.use('/api/prayer', prayer);
  app.use('/api/stats', stats);

  // SEO endpoints (robots.txt, sitemap.xml, rss) — served before the SPA fallback.
  app.use(seo);

  // Static SPA + history fallback.
  const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(
      express.static(CLIENT_DIST, {
        maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
        etag: true,
        index: false,
        setHeaders(res, filePath) {
          // Long-cache hashed build assets; never cache the HTML shell.
          if (/\/assets\//.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // History fallback for the SPA (never for /api — handled above). We inject
    // route-specific meta/JSON-LD so crawlers get real signals without JS.
    app.get(/^(?!\/api\/).*/, (req, res) => {
      const indexHtml = fs.readFileSync(path.join(CLIENT_DIST, 'index.html'), 'utf8');
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(renderSpaHtml(indexHtml, req.path));
    });
  } else {
    app.get('/', (req, res) => {
      res
        .status(200)
        .send(
          '<h1>GraceLine Answers</h1><p>Frontend not built yet. Run <code>npm run build</code> in the app folder.</p>',
        );
    });
  }

  // JSON 404 for unknown API routes (avoids returning the SPA HTML for API mistakes).
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Central error handler — never leak internal details to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      console.error(`[graceline-answers] ${req.method} ${req.path} -> ${err.stack || err.message}`);
    }
    if (res.headersSent) return next(err);
    res.status(status).json({ error: err.expose ? err.message : 'server_error' });
  });

  return app;
}

module.exports = { createApp };
