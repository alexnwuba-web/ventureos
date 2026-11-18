'use strict';
/* Oxi languages on VentureOS: the picker from Oxi in the top menu, and the person's language kept in their profile. */
process.env.OXI_LANG_URL = 'https://oxi-group.test/';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, end, reset, createApp, signIn, request } = require('./helpers');

let app;
test.before(async () => { await reset(); app = createApp(); });
test.after(async () => { await end(); });

test('pages load the picker from Oxi, with a place in the top menu', async () => {
  const r = await request(app).get('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /<script defer src="https:\/\/oxi-group.test\/oxi-lang\/lang.js" data-api="https:\/\/oxi-group.test" data-me="\/oxi-lang\/me"><\/script>/);
  assert.match(r.text, /<nav>\s*<span data-oxi-lang><\/span>/);
});

test('the language is kept in the person\'s profile', async () => {
  assert.deepEqual((await request(app).get('/oxi-lang/me')).body, { signedIn: false, lang: null });
  const a = await signIn(app, 'kemi@example.ng', 'Kemi');
  assert.deepEqual((await a.get('/oxi-lang/me')).body, { signedIn: true, lang: null });
  assert.equal((await a.post('/oxi-lang/me').send({ lang: 'fr' })).body.saved, true);
  assert.deepEqual((await a.get('/oxi-lang/me')).body, { signedIn: true, lang: 'fr' });
  assert.equal((await db.one("SELECT lang FROM people WHERE email = 'kemi@example.ng'")).lang, 'fr');
  assert.equal((await a.post('/oxi-lang/me').send({ lang: 'xx' })).status, 400);
});
