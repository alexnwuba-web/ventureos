'use strict';
/* Each test file starts from an empty test database (VENTUREOS_TEST_DATABASE_URL). */
process.env.VENTUREOS_DATABASE_URL = process.env.VENTUREOS_TEST_DATABASE_URL || 'postgres://postgres:pg@localhost:5432/ventureos_test';
process.env.VENTUREOS_ADMINS = 'admin@scalegate.test';
process.env.VENTUREOS_UPLOADS = require('path').join(require('os').tmpdir(), 'ventureos-test-uploads');

const request = require('supertest');
const { db, end } = require('../src/db');
const { migrate } = require('../src/migrate');
const { createApp } = require('../src/app');
const mail = require('../src/lib/mail');

async function reset() {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
}

/** Signs in through the real email-code flow and returns a supertest agent with the session. */
async function signIn(app, email, name = 'Test Person') {
  const agent = request.agent(app);
  await agent.post('/signin').type('form').send({ email }).expect(302);
  const m = mail.outbox.filter((x) => x.to === email).pop();
  const code = /(\d{6}) is your/.exec(m.subject)[1];
  const r = await agent.post('/signin/code').type('form').send({ email, code }).expect(302);
  if (/\/my\/profile/.test(r.headers.location)) await agent.post('/my/profile').type('form').send({ name }).expect(302);
  return agent;
}

module.exports = { request, db, end, reset, createApp, signIn, mail };
