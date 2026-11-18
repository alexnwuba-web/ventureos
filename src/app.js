'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const auth = require('./auth');
const helpers = require('./lib/view');
const fs = require('fs');
const crypto = require('crypto');

// A fingerprint of the stylesheets and scripts, added to their links (?v=…) so browsers fetch the new
// files after every update instead of keeping an old copy for a day.
function assetVersion() {
  const h = crypto.createHash('sha1');
  for (const dir of ['css', 'js']) {
    const d = path.join(__dirname, '..', 'public', dir);
    for (const f of fs.readdirSync(d).sort()) h.update(fs.readFileSync(path.join(d, f)));
  }
  return h.digest('hex').slice(0, 10);
}
const ASSET_V = assetVersion();

function createApp() {
  if (!config.sessionSecret) throw new Error('VENTUREOS_SESSION_SECRET must be set in production.');
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
    next();
  });
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: config.prod ? '1d' : 0 }));
  app.use(express.urlencoded({ extended: true, limit: '2mb', parameterLimit: 5000 }));
  app.use(cookieParser());

  // Forms are only accepted from our own pages.
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin') || req.get('referer');
    if (!origin) return next();
    try {
      const host = new URL(origin).host;
      if (host === req.get('host') || host === new URL(config.baseUrl).host) return next();
    } catch { /* fall through */ }
    return next(Object.assign(new Error('That form came from another site.'), { status: 403 }));
  });

  app.use(auth.load);
  app.use((req, res, next) => { Object.assign(res.locals, helpers, { path: req.path, config, v: ASSET_V }); next(); });

  // Express 4 does not pass async errors on by itself.
  const wrap = (router) => {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const l of layer.route.stack) {
        const fn = l.handle;
        if (fn.length <= 3) l.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
      }
    }
    return router;
  };
  // Oxi languages: the person's language, saved from the picker in the top menu (routes/lang.js).
  app.use(wrap(require('./routes/lang')));
  app.use(wrap(require('./routes/public')));
  app.use(wrap(require('./routes/my')));
  app.use(wrap(require('./routes/staff')));
  app.use(wrap(require('./routes/events')));

  app.get('/health', (req, res) => res.json({ ok: true, app: 'ventureos' }));

  app.use((req, res) => res.status(404).render('public/message', { title: 'Not found', message: 'That page does not exist.', back: '/' }));
  // eslint-disable-next-line no-unused-vars
  app.use((e, req, res, next) => {
    const status = e.status || (e.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[ventureos]', e);
    const message = e.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 20 MB.' : status >= 500 ? 'Something went wrong on our side. Please try again.' : e.message;
    res.status(status).render('public/message', { title: status === 403 ? 'Not allowed' : 'Sorry', message, back: req.get('referer') || '/' });
  });
  return app;
}

module.exports = { createApp };
