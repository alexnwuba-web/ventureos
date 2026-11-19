'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db, end, reset, createApp, request } = require('./helpers');
const config = require('../src/config');
const auth = require('../src/auth');

let app;
let googleUser = {};
before(async () => {
  await reset(); app = createApp();
  config.google.clientId = 'test-client.apps.googleusercontent.com'; config.google.clientSecret = 'test-secret';
  // Google's two endpoints, faked.
  auth.google.fetch = async (url, opts) => {
    if (/oauth2\.googleapis\.com\/token/.test(url)) {
      const ok = new URLSearchParams(opts.body).get('code') === 'good-code';
      return { ok, json: async () => (ok ? { access_token: 'tok' } : { error: 'invalid_grant' }) };
    }
    return { ok: true, json: async () => googleUser };
  };
});
after(async () => { config.google.clientId = ''; config.google.clientSecret = ''; await end(); });

async function viaGoogle(agent, next, code = 'good-code') {
  const r = await agent.get('/signin/google' + (next ? '?next=' + encodeURIComponent(next) : '')).expect(302);
  const to = new URL(r.headers.location);
  assert.equal(to.host, 'accounts.google.com');
  assert.equal(to.searchParams.get('redirect_uri'), `${config.baseUrl}/signin/google/callback`);
  return agent.get(`/signin/google/callback?state=${to.searchParams.get('state')}&code=${code}`);
}

test('the sign-in page offers Google only when it is set up', async () => {
  assert.match((await request(app).get('/signin').expect(200)).text, /Continue with Google/);
  config.google.clientSecret = '';
  assert.doesNotMatch((await request(app).get('/signin').expect(200)).text, /Continue with Google/);
  await request(app).get('/signin/google').expect(302).expect('location', '/signin');
  config.google.clientSecret = 'test-secret';
});

test('a founder signs in with Google: the account is created with the Google name', async () => {
  googleUser = { email: 'Ada@Example.ng', email_verified: true, name: 'Ada Obi' };
  const agent = request.agent(app);
  const r = await viaGoogle(agent, '/my/new');
  assert.equal(r.status, 302); assert.equal(r.headers.location, '/my/new');
  await agent.get('/my').expect(200);
  const p = await db.one(`SELECT * FROM people WHERE email = 'ada@example.ng'`);
  assert.equal(p.name, 'Ada Obi');
});

test('Google signs in to the same account as email codes; staff land on the staff console', async () => {
  googleUser = { email: 'admin@scalegate.test', email_verified: true, name: 'Someone Else' };
  const agent = request.agent(app);
  const r = await viaGoogle(agent);
  assert.equal(r.headers.location, '/staff');
  const p = await db.one(`SELECT * FROM people WHERE email = 'admin@scalegate.test'`);
  assert.equal(p.staff_role, 'admin');
});

test('forged, cancelled, unconfirmed and failed Google sign-ins are refused', async () => {
  // No state cookie (a forged link)
  await request(app).get('/signin/google/callback?state=abc&code=good-code').expect(400, /expired/);
  // Cancelled at Google
  const a1 = request.agent(app); await a1.get('/signin/google').expect(302);
  await a1.get('/signin/google/callback?error=access_denied').expect(400, /cancelled/);
  // Email not confirmed by Google
  googleUser = { email: 'x@example.ng', email_verified: false };
  const a2 = request.agent(app);
  (await viaGoogle(a2).then((r) => assert.equal(r.status, 400)));
  assert.equal((await db.one(`SELECT count(*)::int AS n FROM people WHERE email = 'x@example.ng'`)).n, 0);
  // Google rejects the code
  googleUser = { email: 'y@example.ng', email_verified: true };
  const a3 = request.agent(app);
  assert.equal((await viaGoogle(a3, null, 'bad-code')).status, 400);
});

test('privacy policy and terms pages exist for Google and founders', async () => {
  const p = await request(app).get('/privacy').expect(200);
  assert.match(p.text, /Privacy <em>policy<\/em>/); assert.match(p.text, /Limited Use/);
  assert.match((await request(app).get('/terms').expect(200)).text, /Terms of <em>use<\/em>/);
  assert.match((await request(app).get('/').expect(200)).text, /href="\/privacy"/);
});
