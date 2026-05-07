const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createConfig, loadEnvFiles } = require('./lib/config');

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
    EMAIL_SEND_TIMEOUT_MS: '9000',
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
  assert.equal(config.emailSendTimeoutMs, 9000);
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
  assert.equal(config.emailSendTimeoutMs, 15000);
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

test('createConfig prefers Resend HTTP when smtp.resend.com is configured with a Resend key', () => {
  const config = createConfig({
    SMTP_HOST: 'smtp.resend.com',
    SMTP_USER: 'resend',
    SMTP_PASS: 're_railway_resend_key',
    SMTP_FROM_EMAIL: 'team@example.com',
  });

  assert.equal(config.resendApiKey, 're_railway_resend_key');
  assert.equal(config.smtpHost, 'smtp.resend.com');
  assert.equal(config.smtpFromEmail, 'team@example.com');
});

test('loadEnvFiles loads backend fallback, root env, and local overrides without replacing process values', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metis-env-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tempDir, 'backend'));
  fs.writeFileSync(
    path.join(tempDir, 'backend', '.env'),
    [
      'PUBLIC_BASE_URL=https://api-fallback.example.com',
      'ALLOWED_ORIGINS=https://fallback.example.com',
      'padi=https://fallback.supabase.co',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(tempDir, '.env'),
    [
      'PUBLIC_BASE_URL=https://api.example.com',
      'ALLOWED_ORIGINS=https://metis.example.com',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(tempDir, '.env.local'),
    [
      'ALLOWED_ORIGINS=https://local-metis.example.com',
      'padi=https://local.supabase.co',
      'ADMIN_PASSWORD=from-local-file',
    ].join('\n')
  );

  const env = { ADMIN_PASSWORD: 'from-real-env' };
  loadEnvFiles(tempDir, env);

  assert.equal(env.PUBLIC_BASE_URL, 'https://api.example.com');
  assert.equal(env.ALLOWED_ORIGINS, 'https://local-metis.example.com');
  assert.equal(env.padi, 'https://local.supabase.co');
  assert.equal(env.ADMIN_PASSWORD, 'from-real-env');
});
