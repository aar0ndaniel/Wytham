function createConfig(env = process.env) {
  const port = number(env.PORT, 8787);
  const smtpFromEmail = trim(env.SMTP_FROM_EMAIL || env.SMTP_USER);
  const supportEmail = firstEmail(env.SUPPORT_EMAIL) || smtpFromEmail;

  return {
    host: trim(env.HOST) || '127.0.0.1',
    port,
    adminHost: trim(env.ADMIN_HOST) || '127.0.0.1',
    adminPort: number(env.ADMIN_PORT, port + 1),
    publicBaseUrl: stripSlash(env.PUBLIC_BASE_URL || 'http://127.0.0.1:8787'),
    allowedOrigins: csv(env.ALLOWED_ORIGINS || 'http://127.0.0.1:8787,http://localhost:8787')
      .map((origin) => normalizeOrigin(origin))
      .filter(Boolean),
    adminUsername: trim(env.ADMIN_USERNAME) || 'admin',
    adminPassword: trim(env.ADMIN_PASSWORD) || 'change-this-password',
    healthToken: trim(env.HEALTH_TOKEN),
    smtpHost: trim(env.SMTP_HOST),
    smtpPort: number(env.SMTP_PORT, 465),
    smtpSecure: env.SMTP_SECURE == null ? true : boolean(env.SMTP_SECURE),
    smtpUser: trim(env.SMTP_USER),
    smtpPass: trim(env.SMTP_PASS),
    smtpFromName: trim(env.SMTP_FROM_NAME) || 'Wytham Team',
    smtpFromEmail,
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

function normalizeOrigin(value) {
  const raw = stripSlash(stripWrappingQuotes(value));
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return stripSlash(parsed.origin);
  } catch {
    return raw;
  }
}

function stripWrappingQuotes(value) {
  const text = trim(value);
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).trim();
  }
  return text;
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
  normalizeOrigin,
  number,
  stripSlash,
  trim,
};
