'use strict';
/*
 * Settings. VentureOS has its own PostgreSQL database (VENTUREOS_DATABASE_URL) and its own sign-in: founders and
 * staff sign in with their email and a six-digit code sent to it.
 */
const path = require('path');
const env = process.env;
const prod = env.NODE_ENV === 'production';

module.exports = {
  prod,
  port: Number(env.PORT || 4300),
  databaseUrl: env.VENTUREOS_DATABASE_URL || env.DATABASE_URL || 'postgres://postgres:pg@localhost:5432/ventureos',
  databaseSsl: env.VENTUREOS_DATABASE_SSL === 'require',
  poolMax: Number(env.VENTUREOS_POOL_MAX || 5),
  baseUrl: (env.VENTUREOS_BASE_URL || 'http://localhost:4300').replace(/\/$/, ''),
  sessionSecret: env.VENTUREOS_SESSION_SECRET || (prod ? null : 'dev-ventureos-session'),
  // Emails that are always administrators (the first staff). Others are made staff from Staff → People.
  admins: (env.VENTUREOS_ADMINS || 'alex@scalegate.org,alexnwuba@gmail.com').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  uploadsDir: env.VENTUREOS_UPLOADS || path.join(__dirname, '..', 'uploads'),
  uploadLimit: 20 * 1024 * 1024,
  smtp: {
    host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || 'VentureOS <no-reply@scalegate.org>',
  },
  // Shown in emails and on pages.
  org: { name: 'ScaleGate Africa', product: 'VentureOS', address: '18A Sinari Daranijo Street, Victoria Island, Lagos', email: env.VENTUREOS_CONTACT || 'alex@scalegate.org' },
};
