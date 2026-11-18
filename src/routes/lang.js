'use strict';
/*
 * Oxi languages on VentureOS (November 2026). The picker in the top menu is Oxi's (loaded from
 * ${OXI_LANG_URL}/oxi-lang/lang.js, which also translates the page into English, French, Spanish, Mandarin, Italian,
 * German, Yoruba, Igbo or Hausa); the person's choice is kept in their profile here:
 *   GET  /oxi-lang/me   { signedIn, lang }
 *   POST /oxi-lang/me   { lang }   kept in people.lang
 */
const express = require('express');
const { db } = require('../db');

const CODES = ['en', 'fr', 'es', 'zh', 'it', 'de', 'yo', 'ig', 'ha'];
const router = express.Router();

router.get('/oxi-lang/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!req.person) return res.json({ signedIn: false, lang: null });
  res.json({ signedIn: true, lang: CODES.includes(req.person.lang) ? req.person.lang : null });
});
router.post('/oxi-lang/me', express.json({ limit: '2kb' }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const lang = String((req.body && req.body.lang) || '').toLowerCase();
  if (!CODES.includes(lang)) return res.status(400).json({ error: 'Unknown language.' });
  if (!req.person) return res.json({ signedIn: false, saved: false });
  await db.query('UPDATE people SET lang = $1 WHERE id = $2', [lang, req.person.id]);
  res.json({ signedIn: true, saved: true, lang });
});

module.exports = router;
