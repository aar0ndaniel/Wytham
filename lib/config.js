const fs = require('fs');
const path = require('path');

function createConfig(env = process.env) {
  const port = number(env.PORT, 8787);
  const resendApiKey = resendKey(env);
  const smtpFromEmail = trim(env.SMTP_FROM_EMAIL || env.RESEND_FROM_EMAIL || env.SMTP_USER);
  const supportEmail = firstEmail(env.SUPPORT_EMAIL) || smtpFromEmail;

  return {
    host: trim(env.HOST) || '127.0.0.1',
    port,
    adminHost: trim(env.ADMIN_HOST) || '127.0.0.1',
    adminPort: number(env.ADMIN_PORT, port + 1),
    publicBaseUrl: stripSlash(env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787'),
    allowedOrigins: csv(env.ALLOWED_ORIGINS || 'http://127.0.0.1:8787,http://localhost:8787'),
    adminUsername: trim(env.ADMIN_USERNAME) || 'admin',
    adminPassword: trim(env.ADMIN_PASSWORD) || 'change-this-password',
    healthToken: trim(env.HEALTH_TOKEN),
    smtpHost: trim(env.SMTP_HOST),
    smtpPort: number(env.SMTP_PORT, 465),
    smtpSecure: env.SMTP_SECURE == null ? true : boolean(env.SMTP_SECURE),
    smtpUser: trim(env.SMTP_USER),
    smtpPass: trim(env.SMTP_PASS),
    smtpFromName: trim(env.SMTP_FROM_NAME || env.RESEND_FROM_NAME) || 'metis Team',
    smtpFromEmail,
    emailSendTimeoutMs: number(env.EMAIL_SEND_TIMEOUT_MS, 15000),
    resendApiKey,
    resendEndpoint: stripSlash(env.RESEND_API_BASE_URL || 'https://api.resend.com'),
    supportEmail,
    liteShareUrl:
      trim(env.LITE_SHARE_URL) ||
      'https://knustedugh-my.sharepoint.com/:f:/g/personal/adakuteye_st_knust_edu_gh/IgBYClZK6W-YRLviMlqzM1avASTrfMZsrbxSZWAnbUzC79w?e=ynf32b',
    bundleShareUrl:
      trim(env.BUNDLE_SHARE_URL) ||
      'https://knustedugh-my.sharepoint.com/:f:/g/personal/adakuteye_st_knust_edu_gh/IgBNGRrdnVqPQKEy7KHXz-JLAQUaVdSM9Ev1hSNltF1uqVU?e=zD2KS3',
    supabase: {
      url: trim(env.padi),
      projectRef: trim(env.tsotso),
      publishableKey: trim(env.amenya),
      secretKey: trim(env.Tarkitey),
      schema: trim(env.SUPABASE_DB_SCHEMA) || 'public',
      isConfigured: Boolean(trim(env.padi) && trim(env.Tarkitey)),
    },
    turnstile: {
      secretKey: trim(env.TURNSTILE_SECRET_KEY),
      isConfigured: Boolean(trim(env.TURNSTILE_SECRET_KEY)),
    },
  };
}

function resendKey(env = {}) {
  const explicit = trim(env.RESEND_API_KEY || env.RESEND_KEY || env.EMAIL_API_KEY);
  if (explicit) {
    return explicit;
  }

  const smtpPass = trim(env.SMTP_PASS);
  const smtpHost = trim(env.SMTP_HOST).toLowerCase();
  const looksLikeResendKey = /^re_[A-Za-z0-9_-]+$/.test(smtpPass);
  const isResendSmtpHost = smtpHost === 'smtp.resend.com';
  return looksLikeResendKey && (!smtpHost || isResendSmtpHost) ? smtpPass : '';
}

function loadEnvFiles(baseDir, targetEnv = process.env) {
  const protectedKeys = new Set(Object.keys(targetEnv));
  const files = [
    path.join(baseDir, 'backend', '.env'),
    path.join(baseDir, '.env'),
    path.join(baseDir, '.env.local'),
  ];

  for (const filePath of files) {
    loadEnvFile(filePath, targetEnv, protectedKeys);
  }
}

function loadEnvFile(filePath, targetEnv, protectedKeys) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const index = trimmed.indexOf('=');
    if (index < 0) {
      continue;
    }

    const key = trimmed.slice(0, index).trim();
    if (!key || protectedKeys.has(key)) {
      continue;
    }

    targetEnv[key] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value) {
  const normalized = trim(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function csv(value) {
  return String(value)
    .split(',')
    .map((item) => trim(item))
    .filter(Boolean);
}

function stripSlash(value) {
  return trim(value).replace(/\/+$/, '');
}

function firstEmail(value) {
  const raw = trim(value);
  if (!raw) return '';

  const parts = raw
    .split(/[;,|\s]+/)
    .map((item) => trim(item))
    .filter(Boolean);

  return parts.find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) || '';
}

module.exports = {
  boolean,
  createConfig,
  csv,
  loadEnvFiles,
  number,
  resendKey,
  stripSlash,
  trim,
};
