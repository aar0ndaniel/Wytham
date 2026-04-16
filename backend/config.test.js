const test = require('node:test');
const assert = require('node:assert/strict');

const { createConfig } = require('./lib/config');

test('createConfig maps hosted runtime values and custom Supabase env names', () => {
  const config = createConfig({
    HOST: '0.0.0.0',
    PORT: '9000',
    ADMIN_HOST: '0.0.0.0',
    ADMIN_PORT: '9001',
    PUBLIC_BASE_URL: 'https://landing.wytham.app/',
    ALLOWED_ORIGINS: ' https://landing.wytham.app, ,https://admin.wytham.app ',
    ADMIN_USERNAME: 'ops',
    ADMIN_PASSWORD: 'secret-password',
    HEALTH_TOKEN: 'health-token',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'mailer@example.com',
    SMTP_PASS: 'smtp-pass',
    SMTP_FROM_NAME: 'Wytham Team',
    LITE_SHARE_URL: 'https://example.com/lite',
    BUNDLE_SHARE_URL: 'https://example.com/bundle',
    padi: 'https://project.supabase.co',
    tsotso: 'project-ref',
    amenya: 'publishable-key',
    Tarkitey: 'secret-key',
    SUPABASE_DB_SCHEMA: 'wytham',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9000);
  assert.equal(config.adminHost, '0.0.0.0');
  assert.equal(config.adminPort, 9001);
  assert.equal(config.publicBaseUrl, 'https://landing.wytham.app');
  assert.deepEqual(config.allowedOrigins, ['https://landing.wytham.app', 'https://admin.wytham.app']);
  assert.equal(config.adminUsername, 'ops');
  assert.equal(config.adminPassword, 'secret-password');
  assert.equal(config.healthToken, 'health-token');
  assert.equal(config.smtpHost, 'smtp.example.com');
  assert.equal(config.smtpPort, 587);
  assert.equal(config.smtpSecure, false);
  assert.equal(config.smtpUser, 'mailer@example.com');
  assert.equal(config.smtpPass, 'smtp-pass');
  assert.equal(config.smtpFromName, 'Wytham Team');
  assert.equal(config.smtpFromEmail, 'mailer@example.com');
  assert.equal(config.supportEmail, 'mailer@example.com');
  assert.equal(config.liteShareUrl, 'https://example.com/lite');
  assert.equal(config.bundleShareUrl, 'https://example.com/bundle');
  assert.deepEqual(config.supabase, {
    url: 'https://project.supabase.co',
    projectRef: 'project-ref',
    publishableKey: 'publishable-key',
    secretKey: 'secret-key',
    schema: 'wytham',
    isConfigured: true,
  });
});

test('createConfig falls back to current backend defaults', () => {
  const config = createConfig({});

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8787);
  assert.equal(config.adminHost, '127.0.0.1');
  assert.equal(config.adminPort, 8788);
  assert.equal(config.publicBaseUrl, 'http://127.0.0.1:8787');
  assert.deepEqual(config.allowedOrigins, ['http://127.0.0.1:8787', 'http://localhost:8787']);
  assert.equal(config.adminUsername, 'admin');
  assert.equal(config.adminPassword, 'change-this-password');
  assert.equal(config.smtpPort, 465);
  assert.equal(config.smtpSecure, true);
  assert.equal(config.smtpFromName, 'Wytham Team');
  assert.equal(config.smtpFromEmail, '');
  assert.equal(config.supportEmail, '');
  assert.equal(config.supabase.schema, 'public');
  assert.equal(config.supabase.isConfigured, false);
});
