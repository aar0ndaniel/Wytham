const test = require('node:test');
const assert = require('node:assert/strict');

const { createConfig } = require('./lib/config');

test('createConfig maps hosted runtime values and custom Supabase env names', () => {
  const config = createConfig({
    HOST: '0.0.0.0',
    PORT: '9000',
    ADMIN_HOST: '0.0.0.0',
    ADMIN_PORT: '9001',
    PUBLIC_BASE_URL: 'https://metis.emend.it.com/',
    ALLOWED_ORIGINS: ' https://metis.emend.it.com, ,https://admin.metis.emend.it.com ',
    ADMIN_USERNAME: 'ops',
    ADMIN_PASSWORD: 'secret-password',
    HEALTH_TOKEN: 'health-token',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'mailer@example.com',
    SMTP_PASS: 'smtp-pass',
    SMTP_FROM_NAME: 'metis Team',
    RESEND_API_KEY: 're_test_key',
    RESEND_API_BASE_URL: 'https://api.resend.test/',
    LITE_SHARE_URL: 'https://example.com/lite',
    BUNDLE_SHARE_URL: 'https://example.com/bundle',
    padi: 'https://project.supabase.co',
    tsotso: 'project-ref',
    amenya: 'publishable-key',
    Tarkitey: 'secret-key',
    SUPABASE_DB_SCHEMA: 'wytham',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
  });

  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 9000);
  assert.equal(config.adminHost, '0.0.0.0');
  assert.equal(config.adminPort, 9001);
  assert.equal(config.publicBaseUrl, 'https://metis.emend.it.com');
  assert.deepEqual(config.allowedOrigins, ['https://metis.emend.it.com', 'https://admin.metis.emend.it.com']);
  assert.equal(config.adminUsername, 'ops');
  assert.equal(config.adminPassword, 'secret-password');
  assert.equal(config.healthToken, 'health-token');
  assert.equal(config.smtpHost, 'smtp.example.com');
  assert.equal(config.smtpPort, 587);
  assert.equal(config.smtpSecure, false);
  assert.equal(config.smtpUser, 'mailer@example.com');
  assert.equal(config.smtpPass, 'smtp-pass');
  assert.equal(config.smtpFromName, 'metis Team');
  assert.equal(config.smtpFromEmail, 'mailer@example.com');
  assert.equal(config.resendApiKey, 're_test_key');
  assert.equal(config.resendEndpoint, 'https://api.resend.test');
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
  assert.deepEqual(config.turnstile, {
    secretKey: 'turnstile-secret',
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
  assert.equal(config.smtpFromName, 'metis Team');
  assert.equal(config.smtpFromEmail, '');
  assert.equal(config.resendApiKey, '');
  assert.equal(config.resendEndpoint, 'https://api.resend.com');
  assert.equal(config.supportEmail, '');
  assert.equal(config.supabase.schema, 'public');
  assert.equal(config.supabase.isConfigured, false);
  assert.equal(config.turnstile.secretKey, '');
  assert.equal(config.turnstile.isConfigured, false);
});

test('createConfig accepts a Resend key in SMTP_PASS when SMTP host is unset', () => {
  const config = createConfig({
    SMTP_FROM_EMAIL: 'team@example.com',
    SMTP_PASS: 're_legacy_http_key',
  });

  assert.equal(config.resendApiKey, 're_legacy_http_key');
  assert.equal(config.smtpFromEmail, 'team@example.com');
});
