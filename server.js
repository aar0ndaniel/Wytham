const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');
const { z } = require('zod');
const { createConfig } = require('./lib/config');
const {
  createStore,
  summarizeDailySignupRows,
  summarizeDonations,
  summarizeInstitutionRows,
  summarizeSignups,
} = require('./lib/store');
const { createAdminSupabaseClient } = require('./lib/supabase');

const BACKEND_DIR = __dirname;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(BACKEND_DIR, 'data');
const PRIMARY_DB_PATH = path.join(DATA_DIR, 'wytham-beta.db');
const LEGACY_DB_PATH = path.join(DATA_DIR, 'semora-beta.db');
if (!fs.existsSync(PRIMARY_DB_PATH) && fs.existsSync(LEGACY_DB_PATH)) {
  fs.copyFileSync(LEGACY_DB_PATH, PRIMARY_DB_PATH);
}
const DB_PATH = PRIMARY_DB_PATH;
const EMAIL_TEMPLATE_PATH = path.join(BACKEND_DIR, 'signup-beta-email-template.html');
const LOGO_PATH = path.join(BACKEND_DIR, 'wytham-logo-dark-nav.png');
const ADMIN_SCRIPT_PATH = path.join(BACKEND_DIR, 'admin.js');
const MATTER_FONT_PATH = path.join(BACKEND_DIR, 'matter.woff2');
const PUBLIC_ROOT_FILES = new Set([
  '/index.html',
  '/contact.html',
  '/docs.html',
  '/team.html',
  '/updates.html',
  '/navbar.html',
  '/signup-beta-email-template.html',
  '/style.css',
  '/docs.css',
  '/team_styles.css',
  '/script.js',
  '/update_links.js',
  '/favicon.ico',
  '/favicon.svg',
  '/folder-close.svg',
  '/folder-open.svg',
  '/logo-black.svg',
  '/logo-white.svg',
  '/matter.woff2',
  '/paper-mono.woff2',
  '/Aaron Daniel Akuteye.png',
  '/Akosua.jpeg',
  '/app-logo.png',
  '/wytham-logo-dark-nav.png',
  '/wytham-logo-light-nav.png',
  '/wytham-logo-dark.png',
  '/wytham-logo-light.png',
  '/bismark.jpeg',
  '/Emmanuel.jpeg',
  '/Mavis.jpeg',
  '/Prof Harry.PNG',
]);
const PUBLIC_PATH_PREFIXES = ['/vendor/'];

loadEnv(path.join(BACKEND_DIR, '.env'));

const config = createConfig(process.env);

const RATE_POLICIES = Object.freeze({
  signup: { limit: 5, windowMs: 10 * 60 * 1000 },
  donate: { limit: 5, windowMs: 10 * 60 * 1000 },
  beta: { limit: 60, windowMs: 10 * 60 * 1000 },
  'admin-login': { limit: 10, windowMs: 10 * 60 * 1000 },
});
const RATE_SWEEP_INTERVAL_MS = 60 * 1000;

const signupSchema = z
  .object({
    name: z.string({ error: 'Please enter your full name.' }),
    email: z.string({ error: 'Please enter a valid email address.' }),
    institution: z.string().optional().default(''),
    country: z.string().optional().default(''),
    role: z.string().optional().default(''),
    version: z.string().optional(),
    edition: z.string().optional(),
    hp_field: z.string().optional().default(''),
    sourcePage: z.string().optional().default(''),
    sourceTitle: z.string().optional().default(''),
  })
  .transform((input) => ({
    name: clean(input.name, 100),
    email: cleanEmail(input.email),
    institution: clean(input.institution, 200),
    country: clean(input.country, 80),
    role: clean(input.role, 80),
    edition: clean(input.version || input.edition || '', 10).toLowerCase(),
    hp_field: clean(input.hp_field, 200),
    source_page: clean(input.sourcePage, 120),
    source_title: clean(input.sourceTitle, 120),
  }))
  .superRefine((input, ctx) => {
    if (input.name.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'Please enter your full name.', path: ['name'] });
    }
    if (!validEmail(input.email)) {
      ctx.addIssue({ code: 'custom', message: 'Please enter a valid email address.', path: ['email'] });
    }
    if (!['lite', 'bundle'].includes(input.edition)) {
      ctx.addIssue({ code: 'custom', message: 'Please choose Lite or Bundle.', path: ['edition'] });
    }
  });

const donateSchema = z
  .object({
    name: z.string({ error: 'Please enter your name.' }),
    email: z.string({ error: 'Please enter a valid email address.' }),
    country: z.string().optional().default(''),
    message: z.string().optional().default(''),
    amount: z.string().optional().default(''),
    hp_field: z.string().optional().default(''),
  })
  .transform((input) => ({
    name: clean(input.name, 100),
    email: cleanEmail(input.email),
    country: clean(input.country, 80),
    message: clean(input.message, 500),
    amount: clean(input.amount, 40),
    hp_field: clean(input.hp_field, 200),
  }))
  .superRefine((input, ctx) => {
    if (!input.name) {
      ctx.addIssue({ code: 'custom', message: 'Please enter your name.', path: ['name'] });
    }
    if (!validEmail(input.email)) {
      ctx.addIssue({ code: 'custom', message: 'Please enter a valid email address.', path: ['email'] });
    }
  });

const adminLoginSchema = z.object({
  username: z
    .string({ error: 'Please enter your username.' })
    .transform((value) => clean(value, 120))
    .pipe(z.string().min(1, { message: 'Please enter your username.' })),
  password: z.string({ error: 'Please enter your password.' }).min(1, { message: 'Please enter your password.' }),
});

ensureDir(DATA_DIR);

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    institution TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    edition TEXT NOT NULL,
    source_page TEXT NOT NULL DEFAULT '',
    source_title TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    beta_visits INTEGER NOT NULL DEFAULT 0,
    last_beta_visit_at TEXT NOT NULL DEFAULT '',
    email_status TEXT NOT NULL DEFAULT 'pending',
    email_error TEXT NOT NULL DEFAULT '',
    email_sent_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    amount TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_signups_created_at ON signups(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_signups_edition ON signups(edition);
`);

const statements = {
  byEmail: db.prepare('SELECT * FROM signups WHERE email = ?'),
  byToken: db.prepare('SELECT * FROM signups WHERE token = ?'),
  insert: db.prepare(`
    INSERT INTO signups (
      token, name, email, institution, country, role, edition,
      source_page, source_title, ip_address, user_agent,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  update: db.prepare(`
    UPDATE signups
    SET name = ?, institution = ?, country = ?, role = ?, edition = ?,
        source_page = ?, source_title = ?, ip_address = ?, user_agent = ?,
        updated_at = ?
    WHERE email = ?
  `),
  markEmail: db.prepare(`
    UPDATE signups
    SET email_status = ?, email_error = ?, email_sent_at = ?
    WHERE token = ?
  `),
  markVisit: db.prepare(`
    UPDATE signups
    SET beta_visits = beta_visits + 1,
        last_beta_visit_at = ?
    WHERE token = ?
  `),
  insertDonation: db.prepare(`
    INSERT INTO donations (
      name, email, country, message, amount, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteSignup: db.prepare(`
    DELETE FROM signups
    WHERE token = ?
  `),
  counts: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN edition = 'lite' THEN 1 ELSE 0 END) AS lite_count,
      SUM(CASE WHEN edition = 'bundle' THEN 1 ELSE 0 END) AS bundle_count,
      SUM(CASE WHEN beta_visits > 0 THEN 1 ELSE 0 END) AS opened_count,
      COALESCE(SUM(beta_visits), 0) AS total_beta_visits
    FROM signups
  `),
  recent: db.prepare(`
    SELECT token, name, email, institution, country, role, edition, created_at, email_status, beta_visits, last_beta_visit_at
    FROM signups
    ORDER BY created_at DESC
    LIMIT 50
  `),
  topInstitutions: db.prepare(`
    SELECT institution, COUNT(*) AS total
    FROM signups
    WHERE institution <> ''
    GROUP BY institution
    ORDER BY total DESC, institution ASC
    LIMIT 10
  `),
  dailySignupSeries: db.prepare(`
    SELECT
      substr(created_at, 1, 10) AS day,
      COUNT(*) AS total,
      SUM(CASE WHEN edition = 'lite' THEN 1 ELSE 0 END) AS lite_count,
      SUM(CASE WHEN edition = 'bundle' THEN 1 ELSE 0 END) AS bundle_count
    FROM signups
    WHERE substr(created_at, 1, 10) >= date('now', '-13 days')
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day ASC
  `),
  donationCounts: db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(DISTINCT email) AS unique_donors,
      COUNT(DISTINCT CASE WHEN country <> '' THEN country END) AS countries,
      COUNT(CASE WHEN amount <> '' THEN 1 END) AS amount_entries
    FROM donations
  `),
  recentDonations: db.prepare(`
    SELECT name, email, country, amount, message, created_at
    FROM donations
    ORDER BY created_at DESC
    LIMIT 50
  `),
  allForExport: db.prepare(`
    SELECT name, email, institution, country, role, edition, created_at, email_status, beta_visits
    FROM signups
    ORDER BY created_at DESC
  `),
};

const mailer = createMailer(config);

const app = express();
const adminApp = express();

const rateStore = new Map();
let lastRateSweepAt = 0;
const adminActionSecret = crypto.randomBytes(32).toString('hex');
const adminSessionSecret = crypto.randomBytes(32).toString('hex');
applyAppMiddleware(app, { allowCors: true });
applyAppMiddleware(adminApp, { allowCors: false });

app.get('/health', (req, res) => {
  const requestedToken = trim(req.query.token || '');
  res.setHeader('Cache-Control', 'no-store');

  if (config.healthToken && requestedToken && !safeEqualStrings(requestedToken, config.healthToken)) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }

  if (config.healthToken && safeEqualStrings(requestedToken, config.healthToken)) {
    return res.json({
      ok: true,
      emailConfigured: smtpReady(),
      totalSignups: statements.counts.get().total || 0,
    });
  }

  res.json({ ok: true });
});

app.post('/api/signup', async (req, res) => {
  if (!originAllowed(req, config.allowedOrigins)) {
    return res.status(403).json({ success: false, error: 'Origin not allowed.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  const ip = clientIp(req);
  if (!allowRate(ip, 'signup')) {
    return res.status(429).json({ success: false, error: 'Too many signup attempts. Please try again later.' });
  }

  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: firstValidationMessage(parsed.error, 'Please check your signup details and try again.'),
    });
  }

  const body = parsed.data;
  if (body.hp_field) {
    tripRateLimit(ip, 'signup');
    return res.json({ success: true, message: "You're on the list." });
  }

  const now = new Date().toISOString();
  const existing = statements.byEmail.get(body.email);
  const token = existing?.token || crypto.randomBytes(24).toString('hex');

  if (existing) {
    statements.update.run(
      body.name,
      body.institution,
      body.country,
      body.role,
      body.edition,
      body.source_page,
      body.source_title,
      ip,
      cut(req.headers['user-agent'], 300),
      now,
      body.email
    );
  } else {
    statements.insert.run(
      token,
      body.name,
      body.email,
      body.institution,
      body.country,
      body.role,
      body.edition,
      body.source_page,
      body.source_title,
      ip,
      cut(req.headers['user-agent'], 300),
      now,
      now
    );
  }

  const signup = statements.byToken.get(token);
  const emailResult = await sendSignupEmail(signup);
  statements.markEmail.run(
    emailResult.status,
    emailResult.error || '',
    emailResult.sentAt || '',
    signup.token
  );

  res.json({
    success: true,
    message: emailResult.status === 'sent'
      ? `Thank you, ${firstName(signup.name)}. Please check your email for your Wytham beta access link.`
      : `Thank you, ${firstName(signup.name)}. We saved your request and will send your Wytham beta email shortly.`,
  });
});

app.post('/api/donate', (req, res) => {
  if (!originAllowed(req, config.allowedOrigins)) {
    return res.status(403).json({ success: false, error: 'Origin not allowed.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  const ip = clientIp(req);
  if (!allowRate(ip, 'donate')) {
    return res.status(429).json({ success: false, error: 'Too many donation attempts. Please try again later.' });
  }

  const parsed = donateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: firstValidationMessage(parsed.error, 'Please check your donation details and try again.'),
    });
  }

  const body = parsed.data;
  if (body.hp_field) {
    tripRateLimit(ip, 'donate');
    return res.json({ success: true, message: 'Thank you for your support!' });
  }

  statements.insertDonation.run(
    body.name,
    body.email,
    body.country,
    body.message,
    body.amount,
    ip,
    cut(req.headers['user-agent'], 300),
    new Date().toISOString()
  );

  res.json({ success: true, message: 'Thank you for your support! We will be in touch.' });
});

app.get('/beta/:token', (req, res) => {
  if (!validToken(req.params.token)) {
    return res.status(404).type('html').send(simplePage('Beta Link Not Found', 'This beta access link does not exist or has expired.'));
  }

  const ip = clientIp(req);
  if (!allowRate(ip, 'beta')) {
    return res.status(429).type('html').send(simplePage('Too Many Requests', 'Please wait a moment and try your beta link again.'));
  }

  const signup = statements.byToken.get(req.params.token);
  if (!signup) {
    return res.status(404).type('html').send(simplePage('Beta Link Not Found', 'This beta access link does not exist or has expired.'));
  }

  statements.markVisit.run(new Date().toISOString(), signup.token);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderBetaPage(signup));
});

app.get('/download/:token', (req, res) => {
  if (!validToken(req.params.token)) {
    return res.status(404).type('html').send(simplePage('Download Not Available', 'This download link does not exist or has expired.'));
  }

  const signup = statements.byToken.get(req.params.token);
  if (!signup) {
    return res.status(404).type('html').send(simplePage('Download Not Available', 'This download link does not exist or has expired.'));
  }

  const shareUrl = shareUrlForEdition(signup.edition);
  if (!isSafeExternalUrl(shareUrl)) {
    return res.status(503).type('html').send(simplePage('Download Unavailable', 'The download location is not configured yet. Please contact the Wytham team.'));
  }

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, shareUrl);
});

adminApp.get('/admin', requireLocalAdmin, (req, res) => {
  const counts = statements.counts.get();
  const donationCounts = statements.donationCounts.get();
  const recent = statements.recent.all();
  const recentDonations = statements.recentDonations.all();
  const institutions = statements.topInstitutions.all();
  const dailySignups = statements.dailySignupSeries.all();
  const notice = trim(req.query.notice);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderAdminPage(counts, donationCounts, recent, recentDonations, institutions, dailySignups, notice));
});

adminApp.get('/admin/export.csv', requireLocalAdmin, (_req, res) => {
  const rows = statements.allForExport.all();
  const headers = ['name', 'email', 'institution', 'country', 'role', 'edition', 'created_at', 'email_status', 'beta_visits'];
  const csvBody = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wytham-signups.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(csvBody);
});

adminApp.get('/admin/logo', (req, res) => {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(LOGO_PATH);
});

adminApp.get('/admin/assets/admin.js', (req, res) => {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/javascript').sendFile(ADMIN_SCRIPT_PATH);
});

adminApp.get('/admin/assets/matter.woff2', (req, res) => {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('font/woff2').sendFile(MATTER_FONT_PATH);
});

adminApp.get('/admin/login', (req, res) => {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  if (hasAdminSession(req)) {
    return res.redirect('/admin');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderAdminLoginPage());
});

adminApp.post('/admin/login', (req, res) => {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  if (!adminOriginAllowed(req)) {
    return res.status(403).type('html').send(simplePage('Action Blocked', 'This login request was not accepted from that origin.'));
  }

  const ip = clientIp(req);
  if (!allowRate(ip, 'admin-login')) {
    return res.status(429).type('html').send(renderAdminLoginPage('Too many login attempts. Please wait a moment and try again.'));
  }

  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .type('html')
      .send(renderAdminLoginPage(firstValidationMessage(parsed.error, 'Please check your login details and try again.')));
  }

  const { username, password } = parsed.data;
  if (!safeEqualStrings(username, config.adminUsername) || !safeEqualStrings(password, config.adminPassword)) {
    return res.status(401).type('html').send(renderAdminLoginPage('That username or password was not correct.'));
  }

  setAdminSession(res, username);
  res.redirect('/admin');
});

adminApp.get('/admin/preview/email', requireLocalAdmin, (_req, res) => {
  const sample = sampleSignup('lite');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(renderAdminEmailPreviewPage(renderEmailTemplate(sample, '/admin/logo')));
});

adminApp.post('/admin/signups/:token/delete', requireLocalAdmin, (req, res) => {
  const signupToken = trim(req.params.token);
  const csrfToken = trim(req.body?.csrfToken);
  if (!validToken(signupToken) || !safeEqualStrings(csrfToken, adminFormToken(signupToken))) {
    return res.status(403).type('html').send(simplePage('Action Blocked', 'This delete request could not be verified.'));
  }

  statements.deleteSignup.run(signupToken);
  res.redirect('/admin?notice=Signup%20deleted');
});

adminApp.post('/admin/signups/delete', requireLocalAdmin, (req, res) => {
  const csrfToken = trim(req.body?.csrfToken);
  if (!safeEqualStrings(csrfToken, adminFormToken('batch-delete'))) {
    return res.status(403).type('html').send(simplePage('Action Blocked', 'This batch delete request could not be verified.'));
  }

  const tokens = parseBatchTokens(req.body?.tokens);
  if (!tokens.length) {
    return res.redirect('/admin?notice=No%20signups%20selected');
  }

  for (const token of tokens) {
    statements.deleteSignup.run(token);
  }

  const deletedLabel = tokens.length === 1 ? '1%20signup%20deleted' : `${tokens.length}%20signups%20deleted`;
  res.redirect(`/admin?notice=${deletedLabel}`);
});

adminApp.post('/admin/logout', requireLocalAdmin, (_req, res) => {
  clearAdminSession(res);
  res.redirect('/admin/login');
});

app.use((req, res, next) => {
  const requestedPath = canonicalRequestPath(req);
  if (
    requestedPath === '/api' ||
    requestedPath.startsWith('/api/') ||
    isSensitivePublicPath(requestedPath)
  ) {
    return res.sendStatus(404);
  }
  next();
});

app.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return next();
  }

  const requestedPath = canonicalRequestPath(req);
  if (requestedPath === '/') {
    return next();
  }
  if (!isAllowedPublicPath(requestedPath)) {
    return res.sendStatus(404);
  }

  return res.sendFile(resolvePublicPath(requestedPath));
});

app.get('/logo.png', (_req, res) => {
  if (!fs.existsSync(LOGO_PATH)) return res.sendStatus(404);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type('image/png').sendFile(LOGO_PATH);
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

registerErrorHandler(app);
registerErrorHandler(adminApp);

function startServers() {
  app.listen(config.port, config.host, () => {
    console.log(`Wytham beta backend listening on http://${config.host}:${config.port}`);
    console.log(`Public base URL: ${config.publicBaseUrl}`);
    if (config.publicBaseUrl.includes('127.0.0.1') || config.publicBaseUrl.includes('localhost')) {
      console.warn('[warn] PUBLIC_BASE_URL is localhost — portal links in emails will not reach external users. Set it to your ngrok URL in backend/.env');
    }
    if (!smtpReady()) {
      console.warn('[warn] SMTP not configured — signup emails will not be sent. Add SMTP_HOST, SMTP_USER, SMTP_PASS to backend/.env');
    }
    if (config.adminPassword === 'change-this-password') {
      console.warn('[warn] ADMIN_PASSWORD is still the default — change it in backend/.env before sharing the server URL');
    }
  });

  adminApp.listen(config.adminPort, config.adminHost, () => {
    console.log(`Wytham admin dashboard listening on http://${config.adminHost}:${config.adminPort}/admin`);
  });
}

if (require.main === module) {
  startServer();
}

function requireLocalAdmin(req, res, next) {
  if (!isLocalAddress(req.socket.remoteAddress)) {
    return res.status(403).type('html').send(simplePage('Local Access Only', 'The admin dashboard is only available on this laptop.'));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !adminOriginAllowed(req)) {
    return res.status(403).type('html').send(simplePage('Action Blocked', 'This request origin is not allowed for the local dashboard.'));
  }

  if (!hasAdminSession(req)) {
    return res.redirect('/admin/login');
  }

  next();
}

function sampleSignup(edition) {
  return {
    token: 'preview',
    name: 'Dr. Jane Doe',
    email: 'jane.doe@university.edu',
    institution: 'KNUST',
    country: 'Ghana',
    role: 'Researcher',
    edition,
  };
}

function renderEmailTemplate(signup, logoSrc, currentConfig = config) {
  const template = fs.readFileSync(EMAIL_TEMPLATE_PATH, 'utf8');
  const editionLabel = signup.edition === 'lite' ? 'Lite' : 'Bundle';
  const shareUrl = shareUrlForEdition(signup.edition, currentConfig);
  const packageNote =
    signup.edition === 'lite'
      ? 'Lite is the smaller option and works best if R is already installed on your computer.'
      : 'Bundle includes the full setup path and is the easiest option if you want everything together.';

  const values = {
    logo_src: logoSrc,
    first_name: firstName(signup.name),
    full_name: signup.name,
    email: signup.email,
    institution: signup.institution || 'Not provided',
    country: signup.country || 'Not provided',
    role: signup.role || 'Not provided',
    package_label: `${editionLabel} beta`,
    package_note: packageNote,
    download_portal_url: shareUrl,
    support_email: currentConfig.supportEmail || currentConfig.smtpFromEmail || '',
  };

  return template.replace(/\{\{([a-z_]+)\}\}/gi, (_match, key) => escapeHtml(values[key] || ''));
}

function renderEmailText(signup, currentConfig = config) {
  const editionLabel = signup.edition === 'lite' ? 'Lite' : 'Bundle';
  const shareUrl = shareUrlForEdition(signup.edition, currentConfig);
  const supportEmail = currentConfig.supportEmail || currentConfig.smtpFromEmail || '';

  return [
    `Hi ${firstName(signup.name)},`,
    '',
    `Your Wytham ${editionLabel} beta access is ready.`,
    `Open your access page: ${shareUrl}`,
    '',
    'If you need help, reply to this email or contact support:',
    supportEmail || 'Not configured',
    '',
    'Wytham Team',
  ].join('\n');
}

async function sendSignupEmail(signup, options = {}) {
  const currentConfig = options.config || config;
  const currentMailer = options.mailer !== undefined ? options.mailer : mailer;

  if (!currentMailer || !currentConfig.smtpFromEmail) {
    return { status: 'failed', error: 'SMTP not configured.', sentAt: '' };
  }

  const logoUrl = `${currentConfig.publicBaseUrl}/logo.png`;
  const html = renderEmailTemplate(signup, logoUrl, currentConfig);
  const text = renderEmailText(signup, currentConfig);
  const subject = `Your Wytham ${signup.edition === 'lite' ? 'Lite' : 'Bundle'} beta access`;
  const unsubscribeEmail = currentConfig.supportEmail || currentConfig.smtpFromEmail;
  try {
    await currentMailer.sendMail({
      from: `"${currentConfig.smtpFromName}" <${currentConfig.smtpFromEmail}>`,
      to: signup.email,
      replyTo: unsubscribeEmail,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<mailto:${unsubscribeEmail}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'Precedence': 'bulk',
        'X-Mailer': 'Wytham Mailer',
      },
    });
    return { status: 'sent', error: '', sentAt: new Date().toISOString() };
  } catch (error) {
    return { status: 'failed', error: cut(error.message, 300), sentAt: '' };
  }
}

function renderBetaPage(signup, currentConfig = config) {
  const editionLabel = signup.edition === 'lite' ? 'Lite' : 'Bundle';
  const note =
    signup.edition === 'lite'
      ? 'You selected Lite. This path is best for testers who already have R available on their machine.'
      : 'You selected Bundle. This path is best for testers who want the simplest packaged setup experience.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wytham Beta Access</title>
  <style>
    body { margin:0; background:#0a0a0a; color:#f0f0ec; font-family:Arial,sans-serif; padding:24px; }
    .shell { max-width:920px; margin:0 auto; }
    .card { border:1px solid rgba(255,255,255,0.08); background:#111111; padding:32px; }
    .eyebrow { color:#C6A24B; font-size:12px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:14px; }
    h1 { margin:0 0 14px; font-size:48px; line-height:.95; letter-spacing:-.05em; }
    p { color:rgba(240,240,236,.72); line-height:1.7; font-size:16px; }
    .btn { display:inline-block; margin-top:22px; padding:13px 22px; background:#C6A24B; color:#181412; text-decoration:none; border-radius:999px; }
    .meta { margin-top:24px; padding:18px 20px; background:#161616; border:1px solid rgba(255,255,255,0.08); }
    .meta strong { color:#f0f0ec; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="eyebrow">Wytham public beta access</div>
      <h1>${escapeHtml(firstName(signup.name))}, your ${escapeHtml(editionLabel)} beta access is ready.</h1>
      <p>${escapeHtml(note)}</p>
      <p>Thank you for joining the Wytham public beta. Use the button below to open your ${escapeHtml(editionLabel.toLowerCase())} access page and download the build you selected.</p>
      <a class="btn" href="${escapeHtml(downloadUrl(signup.token, currentConfig))}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(editionLabel)} access page</a>
      <div class="meta">
        <strong>Email:</strong> ${escapeHtml(signup.email)}<br />
        <strong>Edition:</strong> ${escapeHtml(editionLabel)} beta<br />
        <strong>Support:</strong> <a href="mailto:${escapeHtml(currentConfig.supportEmail || currentConfig.smtpFromEmail || '')}?subject=Wytham%20support">${escapeHtml(currentConfig.supportEmail || currentConfig.smtpFromEmail || 'Not configured')}</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderAdminPageLegacy(counts, donationCounts, recent, recentDonations, institutions, dailySignups, notice) {
  const batchDeleteToken = adminFormToken('batch-delete');
  const totalSignups = Number(counts.total) || 0;
  const liteCount = Number(counts.lite_count) || 0;
  const bundleCount = Number(counts.bundle_count) || 0;
  const openedCount = Number(counts.opened_count) || 0;
  const totalVisits = Number(counts.total_beta_visits) || 0;
  const openRate = totalSignups ? Math.round((openedCount / totalSignups) * 100) : 0;
  const institutionRows = institutions.length
    ? institutions
        .map((item) => `<tr><td><div class="institution-name">${escapeHtml(item.institution)}</div></td><td class="num">${item.total}</td></tr>`)
        .join('')
    : '<tr><td colspan="2">No institution data yet.</td></tr>';
  const chartSeries = buildDailySignupSeries(dailySignups, 14);
  const chartSvg = renderSignupLineChart(chartSeries);

  const recentRows = recent.length
    ? recent
        .map((item) => `<tr>
            <td class="select-cell"><input class="row-select" type="checkbox" value="${escapeHtml(item.token)}" data-row-select aria-label="Select ${escapeHtml(item.email)}" /></td>
            <td><div class="identity-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></div></td>
            <td>${escapeHtml(item.institution || '—')}</td>
            <td>${renderEditionBadge(item.edition)}</td>
            <td>${renderStatusBadge(item.email_status)}</td>
            <td class="num">${item.beta_visits || 0}</td>
            <td>${item.last_beta_visit_at ? escapeHtml(formatDate(item.last_beta_visit_at)) : 'Not yet'}</td>
            <td>${escapeHtml(formatDate(item.created_at))}</td>
            <td class="actions-cell">
              <form method="post" action="/admin/signups/${encodeURIComponent(item.token)}/delete" data-confirm="Delete ${escapeHtml(jsString(item.email))} from the beta database?">
                <input type="hidden" name="csrfToken" value="${escapeHtml(adminFormToken(item.token))}" />
                <button type="submit" class="danger-btn danger-btn-soft">Delete</button>
              </form>
            </td>
          </tr>`)
        .join('')
    : '<tr><td colspan="8">No signups yet.</td></tr>';
  const donationRows = recentDonations.length
    ? recentDonations
        .map((item) => `<tr>
            <td><div class="identity-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></div></td>
            <td>${escapeHtml(item.country || '—')}</td>
            <td>${item.amount ? `<span class="pill pill-warm">${escapeHtml(item.amount)}</span>` : '—'}</td>
            <td>${escapeHtml(cut(item.message || '—', 180))}</td>
            <td>${escapeHtml(formatDate(item.created_at))}</td>
          </tr>`)
        .join('')
    : '<tr><td colspan="5">No donations yet.</td></tr>';

  const noticeBanner = notice
    ? `<div class="notice">${escapeHtml(notice)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Wytham Beta Operations Admin Dashboard" />
  <title>Wytham Admin</title>
  <script src="/admin/assets/admin.js" defer></script>
  <style>
    @font-face {
      font-family: 'Matter';
      src: url('/admin/assets/matter.woff2') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    :root {
      /* — Surface & Background — */
      --bg: #050810;
      --bg-mid: #08111e;
      --bg-soft: #0c1728;
      --panel: #0f1b2d;
      --panel-raised: #111e30;
      --panel-glow: linear-gradient(145deg, rgba(16,27,46,.97) 0%, rgba(9,15,26,.96) 100%);

      /* — Borders — */
      --stroke: rgba(255,255,255,.07);
      --stroke-mid: rgba(255,255,255,.12);
      --stroke-vivid: rgba(255,255,255,.18);

      /* — Text — */
      --text: #eef2fa;
      --text-secondary: rgba(238,242,250,.72);
      --muted: rgba(238,242,250,.48);
      --muted-bold: rgba(238,242,250,.62);

      /* — Brand Blue — */
      --blue: #7DC8FF;
      --blue-light: #a8daff;
      --blue-soft: rgba(125,200,255,.12);
      --blue-glow: rgba(125,200,255,.18);
      --blue-ring: rgba(125,200,255,.35);

      /* — Warm Accent — */
      --warm: #F0C992;
      --warm-soft: rgba(240,201,146,.12);
      --warm-glow: rgba(240,201,146,.18);

      /* — Semantic — */
      --danger: #ff9999;
      --danger-text: #ffd4d4;
      --danger-soft: rgba(255,100,100,.12);
      --danger-ring: rgba(255,100,100,.28);
      --success: #7de8b8;
      --success-soft: rgba(125,232,184,.12);
      --success-ring: rgba(125,232,184,.28);
      --warn: #ffd166;
      --warn-soft: rgba(255,209,102,.12);

      /* — Shadows & Elevation — */
      --shadow-sm: 0 4px 16px rgba(0,0,0,.24);
      --shadow-md: 0 12px 40px rgba(0,0,0,.32);
      --shadow-lg: 0 24px 72px rgba(0,0,0,.38);
      --shadow-xl: 0 40px 100px rgba(0,0,0,.44);
      --glow-blue: 0 0 40px rgba(125,200,255,.08);

      /* — Typography scale — */
      --text-xs: 11px;
      --text-sm: 13px;
      --text-base: 15px;
      --text-lg: 17px;
      --text-xl: 22px;
      --text-2xl: 28px;
      --text-3xl: 36px;
      --text-4xl: 48px;
      --text-5xl: 60px;

      /* — Z-index layer map — */
      --z-sidebar: 40;
      --z-modal: 100;

      /* — Transitions — */
      --t-fast: 120ms ease-out;
      --t-base: 200ms ease-out;
      --t-slow: 320ms ease-out;
    }

    /* — Reset & Base — */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Skip link for keyboard accessibility */
    .skip-link {
      position: absolute; top: -100%; left: 16px;
      background: var(--blue); color: #050810;
      padding: 8px 16px; border-radius: 0 0 12px 12px;
      font-weight: 600; font-size: var(--text-sm);
      text-decoration: none; z-index: 999;
      transition: top var(--t-fast);
    }
    .skip-link:focus { top: 0; }

    html { color-scheme: dark; scroll-behavior: smooth; }

    body {
      margin: 0;
      min-height: 100dvh;
      color: var(--text);
      font-family: 'Matter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: var(--text-base);
      line-height: 1.6;
      background:
        radial-gradient(ellipse 70% 50% at 10% 5%, rgba(125,200,255,.13) 0%, transparent 50%),
        radial-gradient(ellipse 60% 40% at 90% 10%, rgba(240,201,146,.09) 0%, transparent 45%),
        radial-gradient(ellipse 80% 60% at 50% 100%, rgba(125,200,255,.05) 0%, transparent 60%),
        linear-gradient(180deg, #050a14 0%, #04070e 100%);
      padding: 28px 28px 28px 116px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* — Focus Rings (a11y) — */
    :focus-visible {
      outline: 2px solid var(--blue);
      outline-offset: 3px;
      border-radius: 4px;
    }

    /* — Shell — */
    .shell { max-width: 1440px; margin: 0 auto; }

    /* — Floating Sidebar — */
    .floating-sidebar {
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: 999px;
      background: rgba(8,14,24,.92);
      border: 1px solid var(--stroke-mid);
      box-shadow: var(--shadow-lg), var(--glow-blue);
      backdrop-filter: blur(20px) saturate(160%);
      z-index: var(--z-sidebar);
    }

    .side-btn {
      position: relative;
      width: 48px;
      height: 48px;
      border-radius: 999px;
      border: 1px solid var(--stroke);
      background: rgba(255,255,255,.035);
      color: var(--muted-bold);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      cursor: pointer;
      padding: 0;
      transition:
        transform var(--t-fast),
        border-color var(--t-base),
        color var(--t-base),
        background var(--t-base),
        box-shadow var(--t-base);
      touch-action: manipulation;
    }
    .side-btn:hover {
      transform: translateY(-1px);
      color: var(--text);
      border-color: var(--stroke-vivid);
      background: rgba(255,255,255,.06);
    }
    .side-btn:active { transform: scale(0.96); }
    .side-btn svg {
      width: 18px; height: 18px;
      stroke: currentColor; fill: none;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
      pointer-events: none;
    }
    .side-btn.is-active {
      color: var(--blue-light);
      background: var(--blue-soft);
      border-color: var(--blue-ring);
      box-shadow: 0 0 0 1px var(--blue-glow) inset, 0 0 16px var(--blue-glow);
    }
    /* Tooltip for sidebar buttons */
    .side-btn::after {
      content: attr(title);
      position: absolute;
      left: calc(100% + 12px);
      top: 50%;
      transform: translateY(-50%);
      background: rgba(10,18,30,.96);
      color: var(--text);
      border: 1px solid var(--stroke-mid);
      border-radius: 10px;
      padding: 6px 10px;
      font-size: var(--text-xs);
      font-family: 'Matter', sans-serif;
      font-weight: 500;
      letter-spacing: .04em;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--t-fast);
      box-shadow: var(--shadow-sm);
    }
    .side-btn:hover::after { opacity: 1; }

    /* — Notice Banner — */
    .notice {
      margin: 0 0 20px;
      padding: 14px 18px;
      border-radius: 16px;
      border: 1px solid rgba(125,200,255,.22);
      background: rgba(125,200,255,.08);
      color: #d0eaff;
      font-size: var(--text-sm);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .notice::before {
      content: '';
      width: 6px; height: 6px;
      border-radius: 999px;
      background: var(--blue);
      flex-shrink: 0;
    }

    /* — Card System — */
    .card {
      border-radius: 24px;
      border: 1px solid var(--stroke);
      background: var(--panel-glow);
      box-shadow: var(--shadow-md);
      transition: border-color var(--t-base);
    }
    .card:hover { border-color: var(--stroke-mid); }

    /* — Hero Layout — */
    .hero-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(280px, .8fr);
      gap: 18px;
      margin-bottom: 20px;
    }
    .hero-card {
      position: relative;
      overflow: hidden;
      padding: 28px;
    }
    .hero-card::before {
      content: '';
      position: absolute;
      inset: auto -20% -40% 40%;
      height: 280px;
      background: radial-gradient(ellipse, rgba(125,200,255,.14) 0%, transparent 65%);
      pointer-events: none;
    }
    .hero-card::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(125,200,255,.4), transparent);
      pointer-events: none;
    }

    /* — Labels / Eyebrows — */
    .hero-eyebrow, .section-eyebrow, .label {
      color: var(--blue);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    .hero-brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
      position: relative;
      z-index: 1;
    }
    .brand-wrap { display: flex; align-items: center; gap: 14px; }
    .brand-wrap img {
      width: 54px; height: 54px;
      border-radius: 16px;
      display: block;
      box-shadow: var(--shadow-md), 0 0 0 1px rgba(255,255,255,.1);
    }
    .brand-stack h1 {
      margin: 4px 0 0;
      font-size: 36px;
      font-weight: 700;
      line-height: .96;
      letter-spacing: -.05em;
    }
    .hero-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .hero-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--stroke-mid);
      background: rgba(255,255,255,.04);
      color: var(--muted-bold);
      font-size: 12px;
      font-weight: 400;
    }
    .hero-chip strong { color: var(--text); font-weight: 600; }

    .hero-summary {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr);
      gap: 18px;
      align-items: end;
    }
    .hero-copy h2 {
      font-size: var(--text-5xl);
      font-weight: 700;
      line-height: .90;
      letter-spacing: -.06em;
      max-width: 11ch;
    }
    .hero-copy p {
      margin: 16px 0 0;
      color: var(--muted-bold);
      font-size: var(--text-base);
      line-height: 1.75;
      max-width: 56ch;
    }

    /* — Metric Cards — */
    .hero-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .metric-card {
      min-height: 120px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--stroke);
      background: rgba(255,255,255,.03);
      transition: border-color var(--t-base), background var(--t-base);
    }
    .metric-card:hover {
      border-color: var(--stroke-mid);
      background: rgba(255,255,255,.045);
    }
    .metric-card.metric-card-primary {
      grid-column: span 2;
      background: linear-gradient(135deg, rgba(125,200,255,.13) 0%, rgba(125,200,255,.05) 100%);
      border-color: rgba(125,200,255,.22);
    }
    .metric-card.metric-card-primary:hover {
      border-color: rgba(125,200,255,.36);
    }
    .metric-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .metric-top span:last-child {
      color: var(--muted);
      font-size: var(--text-xs);
      font-weight: 500;
      text-align: right;
    }
    .value {
      margin-top: 16px;
      font-size: var(--text-4xl);
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.05em;
      font-variant-numeric: tabular-nums;
    }
    .subvalue {
      margin-top: 8px;
      color: var(--muted);
      font-size: var(--text-sm);
      line-height: 1.65;
    }

    /* — Hero Sidebar — */
    .hero-side { display: grid; gap: 14px; align-content: start; }
    .quick-card {
      display: block;
      padding: 22px;
      text-decoration: none;
      color: inherit;
      transition: transform var(--t-fast), border-color var(--t-base), box-shadow var(--t-base);
    }
    .quick-card:hover {
      transform: translateY(-2px);
      border-color: var(--stroke-mid);
      box-shadow: var(--shadow-lg);
    }
    .quick-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .quick-head .icon-shell, .account-avatar {
      width: 44px; height: 44px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--blue-soft);
      color: var(--blue-light);
      border: 1px solid var(--blue-ring);
    }
    .quick-head .icon-shell svg, .account-avatar svg { width: 20px; height: 20px; }
    .quick-card h3 {
      margin: 0 0 8px;
      font-size: var(--text-xl);
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -.03em;
    }
    .quick-card p, .section-copy, .account-copy, .chart-copy {
      margin: 0;
      color: var(--muted-bold);
      line-height: 1.7;
      font-size: var(--text-sm);
    }
    .quick-meta {
      margin-top: 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--warm);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    /* — Panels — */
    .panel { display: none; }
    .panel.is-active {
      display: block;
      animation: fadeSlideUp 260ms ease-out;
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel.is-active { animation: none; }
    }

    /* — Layout helpers — */
    .section-shell { display: grid; gap: 18px; }
    .section-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: -4px;
      flex-wrap: wrap;
    }
    .section-header h2 {
      margin: 8px 0 0;
      font-size: var(--text-3xl);
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.04em;
    }

    /* — Summary Grid — */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .summary-stat { padding: 20px; }
    .summary-stat .value { margin-top: 10px; font-size: var(--text-3xl); }

    /* — Analytics Grid — */
    .analytics-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(280px, .85fr);
      gap: 16px;
      align-items: start;
    }
    .stack { display: grid; gap: 16px; }

    /* — Chart & Table Cards — */
    .chart-card, .table-card, .side-card, .donation-card { padding: 24px; }
    .chart-head, .table-toolbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .chart-head { margin-bottom: 18px; }
    .chart-legend {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      color: var(--muted-bold);
      font-size: var(--text-sm);
    }
    .chart-legend span { display: inline-flex; align-items: center; gap: 8px; }
    .chart-legend i {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 999px;
    }
    .chart-svg { width: 100%; height: auto; display: block; }
    .chart-grid-line { stroke: rgba(255,255,255,.06); stroke-width: 1; }
    .chart-axis-line { stroke: rgba(255,255,255,.14); stroke-width: 1; }
    .chart-line-lite { stroke: var(--blue); stroke-width: 2.5; fill: none; stroke-linejoin: round; stroke-linecap: round; }
    .chart-line-bundle { stroke: var(--warm); stroke-width: 2.5; fill: none; stroke-linejoin: round; stroke-linecap: round; }
    .chart-dot-lite { fill: var(--blue); }
    .chart-dot-bundle { fill: var(--warm); }
    .chart-axis-label { fill: rgba(238,242,250,.38); font-size: 11px; font-family: 'Matter', Arial, sans-serif; }

    /* — Mini Tiles — */
    .mini-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .mini-tile {
      padding: 14px;
      border-radius: 14px;
      background: rgba(255,255,255,.03);
      border: 1px solid var(--stroke);
      transition: border-color var(--t-base);
    }
    .mini-tile:hover { border-color: var(--stroke-mid); }
    .mini-tile strong {
      display: block;
      margin-top: 6px;
      font-size: var(--text-2xl);
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.04em;
      font-variant-numeric: tabular-nums;
    }
    .mini-tile span { color: var(--muted-bold); font-size: var(--text-sm); line-height: 1.6; }

    /* — Table toolbar — */
    .table-toolbar { margin-bottom: 16px; }
    .selection-tools {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted-bold);
      font-size: var(--text-sm);
    }
    .selection-tools label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
    .selection-count {
      color: var(--blue-light);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .row-select, .select-all { width: 15px; height: 15px; accent-color: var(--blue); }

    /* — Table — */
    .table-wrap {
      overflow: auto;
      border-radius: 16px;
      border: 1px solid var(--stroke);
      background: rgba(255,255,255,.015);
    }
    table { width: 100%; border-collapse: collapse; min-width: 900px; }
    th, td {
      text-align: left;
      padding: 13px 14px;
      border-bottom: 1px solid rgba(255,255,255,.05);
      font-size: var(--text-sm);
      vertical-align: top;
    }
    th {
      position: sticky; top: 0; z-index: 1;
      background: rgba(8,15,28,.98);
      color: var(--muted);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
    }
    tr:last-child td { border-bottom: 0; }
    tbody tr {
      transition: background var(--t-fast);
    }
    tbody tr:hover { background: rgba(255,255,255,.025); }
    a { color: var(--blue-light); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .identity-cell { display: grid; gap: 3px; }
    .identity-cell strong { font-size: var(--text-sm); font-weight: 600; line-height: 1.4; }
    .identity-cell span { color: var(--muted-bold); font-size: 12px; line-height: 1.5; word-break: break-word; }
    .select-cell, .num { width: 1%; white-space: nowrap; }
    .actions-cell { white-space: nowrap; }
    .actions-cell form { margin: 0; }

    /* — Pills — */
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--stroke);
      font-size: var(--text-xs);
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .pill-blue { color: var(--blue-light); background: var(--blue-soft); border-color: var(--blue-ring); }
    .pill-warm { color: var(--warm); background: var(--warm-soft); border-color: rgba(240,201,146,.3); }
    .pill-success { color: var(--success); background: var(--success-soft); border-color: var(--success-ring); }
    .pill-danger { color: var(--danger-text); background: var(--danger-soft); border-color: var(--danger-ring); }
    .pill-muted { color: var(--muted-bold); background: rgba(255,255,255,.04); }
    .institution-name { font-weight: 600; }

    /* — Buttons — */
    .danger-btn {
      min-height: 40px;
      border-radius: 999px;
      border: 1px solid var(--stroke-mid);
      background: rgba(255,255,255,.04);
      color: var(--text);
      padding: 9px 16px;
      font-size: var(--text-sm);
      font-weight: 500;
      font-family: 'Matter', sans-serif;
      cursor: pointer;
      transition:
        transform var(--t-fast),
        border-color var(--t-base),
        background var(--t-base),
        box-shadow var(--t-base);
      touch-action: manipulation;
    }
    .danger-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    .danger-btn:active { transform: scale(0.97); }
    .danger-btn:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
    .danger-btn[disabled] { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
    .danger-btn-soft {
      border-color: var(--danger-ring);
      color: var(--danger-text);
      background: var(--danger-soft);
    }
    .danger-btn-soft:hover { border-color: rgba(255,100,100,.44); }
    .danger-btn-solid {
      border-color: rgba(200,60,60,.4);
      color: #fff4f4;
      background: linear-gradient(160deg, rgba(140,30,30,.95), rgba(100,18,18,.95));
    }
    .danger-btn-solid:hover { background: linear-gradient(160deg, rgba(160,36,36,.97), rgba(115,22,22,.97)); }

    /* — Account Panel — */
    .account-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr);
      gap: 16px;
    }
    .account-card, .account-panel-card { padding: 24px; }
    .account-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .account-profile { display: flex; align-items: center; gap: 14px; }
    .account-copy { max-width: 54ch; }
    .security-list { display: grid; gap: 10px; margin-top: 16px; }
    .security-item {
      padding: 14px 16px;
      border-radius: 14px;
      background: rgba(255,255,255,.025);
      border: 1px solid var(--stroke);
      transition: border-color var(--t-base);
    }
    .security-item:hover { border-color: var(--stroke-mid); }
    .security-item strong { display: block; margin-bottom: 5px; font-weight: 600; }
    .security-item span { color: var(--muted-bold); line-height: 1.7; font-size: var(--text-sm); }

    /* — Responsive — */
    @media (max-width: 1180px) {
      .hero-layout, .analytics-grid, .account-layout { grid-template-columns: 1fr; }
      .hero-summary { grid-template-columns: 1fr; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
      body { padding: 24px 16px 108px; }
      .floating-sidebar {
        left: 50%;
        top: auto;
        bottom: 16px;
        transform: translateX(-50%);
        flex-direction: row;
      }
      .side-btn::after { display: none; }
      .hero-card, .chart-card, .table-card, .side-card, .donation-card, .account-card, .account-panel-card { padding: 18px; }
      .hero-copy h2 { font-size: var(--text-4xl); }
      .brand-stack h1, .section-header h2 { font-size: var(--text-2xl); }
    }
    @media (max-width: 640px) {
      .summary-grid, .mini-grid, .hero-metrics { grid-template-columns: 1fr; }
      .metric-card.metric-card-primary { grid-column: auto; }
      .hero-brand, .hero-summary, .table-toolbar, .section-header { gap: 12px; }
      .hero-copy h2 { font-size: 38px; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <nav class="floating-sidebar" aria-label="Dashboard navigation">
    <button type="button" class="side-btn is-active" data-panel-target="signups-panel" aria-label="Show signups panel" title="Signups">${adminIcon('signups')}</button>
    <button type="button" class="side-btn" data-panel-target="donations-panel" aria-label="Show donations panel" title="Donations">${adminIcon('donations')}</button>
    <a class="side-btn" href="/admin/export.csv" aria-label="Export signups as CSV" title="Export CSV">${adminIcon('export')}</a>
    <a class="side-btn" href="/admin/preview/email" aria-label="Preview beta email template" title="Email preview">${adminIcon('preview')}</a>
    <button type="button" class="side-btn" data-panel-target="account-panel" aria-label="Account settings" title="Account">${adminIcon('account')}</button>
  </nav>
  <main id="main-content" class="shell">
    <header class="hero-layout">
      <section class="card hero-card">
        <div class="hero-brand">
          <div class="brand-wrap">
            <img src="/admin/logo" alt="Wytham app icon" />
            <div class="brand-stack">
              <div class="hero-eyebrow">Wytham control room</div>
              <h1>Beta Operations</h1>
            </div>
          </div>
          <div class="hero-chip-row">
            <span class="hero-chip"><strong>Local</strong> Admin only</span>
            <span class="hero-chip"><strong>Live</strong> Laptop-hosted</span>
          </div>
        </div>
        <div class="hero-summary">
          <div class="hero-copy">
            <h2>Monitor testers, interest, and momentum.</h2>
            <p>The dashboard keeps your signup list, engagement trend, and donation inbox in one place so you can move quickly without losing clarity.</p>
          </div>
          <div class="hero-metrics">
            <div class="metric-card metric-card-primary">
              <div class="metric-top">
                <span class="label">Beta signups</span>
                <span>${openRate}% opened</span>
              </div>
              <div class="value">${totalSignups}</div>
              <div class="subvalue">${openedCount} people opened their beta link, with ${totalVisits} total visits recorded so far.</div>
            </div>
            <div class="metric-card">
              <div class="metric-top"><span class="label">Lite interest</span><span>${totalSignups ? Math.round((liteCount / totalSignups) * 100) : 0}%</span></div>
              <div class="value">${liteCount}</div>
              <div class="subvalue">People who prefer the lighter setup path.</div>
            </div>
            <div class="metric-card">
              <div class="metric-top"><span class="label">Bundle interest</span><span>${totalSignups ? Math.round((bundleCount / totalSignups) * 100) : 0}%</span></div>
              <div class="value">${bundleCount}</div>
              <div class="subvalue">People who want the full packaged path.</div>
            </div>
          </div>
        </div>
      </section>
      <aside class="hero-side">
        <a class="card quick-card" href="/admin/export.csv">
          <div class="quick-head">
            <span class="icon-shell">${adminIcon('export')}</span>
            <span class="hero-chip">CSV export</span>
          </div>
          <h3>Export the latest signup list</h3>
          <p>Download the current beta roster with engagement columns so you can review or archive it outside the app.</p>
          <div class="quick-meta">Download snapshot</div>
        </a>
        <a class="card quick-card" href="/admin/preview/email">
          <div class="quick-head">
            <span class="icon-shell">${adminIcon('preview')}</span>
            <span class="hero-chip">Email preview</span>
          </div>
          <h3>Check the beta email template</h3>
          <p>Open the current newsletter preview and confirm the message, branding, and CTA before sending more signups through.</p>
          <div class="quick-meta">Review outgoing mail</div>
        </a>
      </aside>
    </header>
    ${noticeBanner}

    <section id="signups-panel" class="panel is-active" data-panel>
      <div class="section-shell">
        <div class="section-header">
          <div>
            <div class="section-eyebrow">Signups</div>
            <h2>Tester pipeline</h2>
            <p class="section-copy">Read the signups at a glance, compare Lite versus Bundle demand, and clean the list without leaving the table.</p>
          </div>
        </div>
        <div class="summary-grid">
          <div class="card summary-stat"><div class="label">Total signups</div><div class="value">${totalSignups}</div><div class="subvalue">All beta requests captured so far.</div></div>
          <div class="card summary-stat"><div class="label">Lite</div><div class="value">${liteCount}</div><div class="subvalue">Smaller setup path requests.</div></div>
          <div class="card summary-stat"><div class="label">Bundle</div><div class="value">${bundleCount}</div><div class="subvalue">Full setup path requests.</div></div>
          <div class="card summary-stat"><div class="label">Opened beta link</div><div class="value">${openedCount}</div><div class="subvalue">${openRate}% of signups have opened their link.</div></div>
        </div>

        <div class="analytics-grid">
          <div class="card chart-card">
            <div class="chart-head">
              <div>
                <div class="label">Signup trend</div>
                <p class="chart-copy">A time-series view of how interest has moved over the last 14 days, split between Lite and Bundle.</p>
              </div>
              <div class="chart-legend">
                <span><i style="background:#83C3FF;"></i> Lite</span>
                <span><i style="background:#ECBA82;"></i> Bundle</span>
              </div>
            </div>
            ${chartSvg}
          </div>
          <div class="stack">
            <div class="card side-card">
              <div class="label">Engagement pulse</div>
              <div class="mini-grid">
                <div class="mini-tile">
                  <span>Open rate</span>
                  <strong>${openRate}%</strong>
                </div>
                <div class="mini-tile">
                  <span>Total visits</span>
                  <strong>${totalVisits}</strong>
                </div>
              </div>
            </div>
            <div class="card side-card">
              <div class="label">Top institutions</div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Institution</th><th>Count</th></tr></thead>
                  <tbody>${institutionRows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div class="card table-card" id="recent-signups">
          <div class="table-toolbar">
            <div>
              <div class="label">Recent signups</div>
              <p class="section-copy">Select one or many rows, then clear them in one action when you need to tidy the tester list.</p>
            </div>
            <div class="selection-tools">
              <label><input class="select-all" type="checkbox" data-select-all aria-label="Select all visible signups" /> <span>Select all on this page</span></label>
              <span class="selection-count" data-selection-count>0 selected</span>
              <form method="post" action="/admin/signups/delete" data-batch-form data-confirm-selected="Delete the selected signups from the beta database?">
                <input type="hidden" name="csrfToken" value="${escapeHtml(batchDeleteToken)}" />
                <input type="hidden" name="tokens" value="" data-selected-tokens />
                <button type="submit" class="danger-btn danger-btn-solid" data-batch-delete disabled>Delete selected</button>
              </form>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Person</th>
                  <th>Institution</th>
                  <th>Edition</th>
                  <th>Email status</th>
                  <th>Visits</th>
                  <th>Last open</th>
                  <th>Signed up</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section id="donations-panel" class="panel" data-panel>
      <div class="section-shell">
        <div class="section-header">
          <div>
            <div class="section-eyebrow">Donations</div>
            <h2>Support inbox</h2>
            <p class="section-copy">Keep an eye on supporters, where interest is coming from, and what they are saying when they reach out.</p>
          </div>
        </div>
        <div class="summary-grid">
          <div class="card summary-stat"><div class="label">Total donations</div><div class="value">${donationCounts.total || 0}</div><div class="subvalue">All donation submissions recorded.</div></div>
          <div class="card summary-stat"><div class="label">Unique donors</div><div class="value">${donationCounts.unique_donors || 0}</div><div class="subvalue">Distinct emails in your support inbox.</div></div>
          <div class="card summary-stat"><div class="label">Countries</div><div class="value">${donationCounts.countries || 0}</div><div class="subvalue">Different locations represented.</div></div>
          <div class="card summary-stat"><div class="label">Amount entries</div><div class="value">${donationCounts.amount_entries || 0}</div><div class="subvalue">Submissions that included an amount.</div></div>
        </div>
        <div class="card donation-card">
          <div class="label">Recent donations</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Country</th>
                  <th>Amount</th>
                  <th>Message</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>${donationRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section id="account-panel" class="panel" data-panel>
      ${renderAdminAccountPanel()}
    </section>
  </main>
</body>
</html>`;
}

function buildDailySignupSeries(rows, days) {
  const lookup = new Map(
    (rows || []).map((row) => [
      String(row.day || ''),
      {
        total: Number(row.total) || 0,
        lite_count: Number(row.lite_count) || 0,
        bundle_count: Number(row.bundle_count) || 0,
      },
    ])
  );
  const result = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const current = new Date(today);
    current.setUTCDate(today.getUTCDate() - offset);
    const key = current.toISOString().slice(0, 10);
    const entry = lookup.get(key) || { total: 0, lite_count: 0, bundle_count: 0 };
    result.push({
      day: key,
      label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      total: entry.total,
      lite_count: entry.lite_count,
      bundle_count: entry.bundle_count,
    });
  }

  return result;
}

function renderAdminPage(counts, donationCounts, recent, recentDonations, institutions, dailySignups, notice, options = {}) {
  const formToken = typeof options.formToken === 'function' ? options.formToken : adminFormToken;
  const batchSendToken = formToken('batch-send');
  const totalSignups = Number(counts.total) || 0;
  const liteCount = Number(counts.lite_count) || 0;
  const bundleCount = Number(counts.bundle_count) || 0;
  const openedCount = Number(counts.opened_count) || 0;
  const totalVisits = Number(counts.total_beta_visits) || 0;
  const openRate = totalSignups ? Math.round((openedCount / totalSignups) * 100) : 0;
  const noticeBanner = notice ? `<div class="notice">${escapeHtml(notice)}</div>` : '';
  const donationSummary = `${donationCounts.total || 0} messages from ${donationCounts.unique_donors || 0} donors across ${donationCounts.countries || 0} countries.`;
  const recentRows = recent.length
    ? recent
        .map((item) => {
          const status = trim(item.email_status).toLowerCase();
          const sendAction = status === 'sent'
            ? `<span class="pill pill-success">Already sent</span>`
            : `<form method="post" action="/admin/signups/${encodeURIComponent(item.token)}/send" data-confirm="Send the Wytham beta email to ${escapeHtml(jsString(item.email))}?">
                <input type="hidden" name="csrfToken" value="${escapeHtml(formToken(`${item.token}:send`))}" />
                <button type="submit" class="ghost-btn">Send</button>
              </form>`;

          return `<tr>
          <td class="select-cell"><input class="row-select" type="checkbox" value="${escapeHtml(item.token)}" data-row-select aria-label="Select ${escapeHtml(item.email)}" /></td>
          <td><div class="identity-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></div></td>
          <td>${escapeHtml(item.institution || '—')}</td>
          <td>${renderEditionBadge(item.edition)}</td>
          <td>${renderStatusBadge(item.email_status)}</td>
          <td class="num">${item.beta_visits || 0}</td>
          <td>${item.last_beta_visit_at ? escapeHtml(formatDate(item.last_beta_visit_at)) : 'Not yet'}</td>
          <td>${escapeHtml(formatDate(item.created_at))}</td>
          <td class="actions-cell">
            <div class="row-actions">
              ${sendAction}
              <form method="post" action="/admin/signups/${encodeURIComponent(item.token)}/delete" data-confirm="Delete ${escapeHtml(jsString(item.email))} from the beta database?">
                <input type="hidden" name="csrfToken" value="${escapeHtml(formToken(item.token))}" />
                <button type="submit" class="ghost-btn danger-ghost">Delete</button>
              </form>
            </div>
          </td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="9">No signups yet.</td></tr>';
  const donationRows = recentDonations.length
    ? recentDonations
        .map((item) => `<tr>
          <td><div class="identity-cell"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></div></td>
          <td>${escapeHtml(item.country || '—')}</td>
          <td>${item.amount ? `<span class="pill pill-warm">${escapeHtml(item.amount)}</span>` : '—'}</td>
          <td>${escapeHtml(cut(item.message || '—', 160))}</td>
          <td>${escapeHtml(formatDate(item.created_at))}</td>
        </tr>`)
        .join('')
    : '<tr><td colspan="5">No donations yet.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wytham Admin</title>
  <script src="/admin/assets/admin.js" defer></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #181818;
      --bg-deep: #111110;
      --surface: rgba(255,255,255,.03);
      --panel: rgba(255,255,255,.035);
      --panel-strong: rgba(255,255,255,.055);
      --line: rgba(245,241,231,.08);
      --line-strong: rgba(245,241,231,.12);
      --text: #F5F1E7;
      --muted: #C8C1AE;
      --moss: #87976B;
      --moss-soft: rgba(135,151,107,.16);
      --moss-light: #AAB68A;
      --gold: #C6A24B;
      --gold-soft: rgba(198,162,75,.16);
      --gold-strong: #D3B85F;
      --success: #AAB68A;
      --success-soft: rgba(170,182,138,.14);
      --danger: #d98585;
      --danger-soft: rgba(217,133,133,.12);
      --shadow: 0 24px 64px rgba(0,0,0,.3);
    }
    *, *::before, *::after { box-sizing: border-box; }
    html { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(211,184,95,.08), transparent 18%),
        linear-gradient(180deg, var(--bg-deep) 0%, var(--bg) 42%, #151514 100%);
      padding: 32px 32px 48px 356px;
      -webkit-font-smoothing: antialiased;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        radial-gradient(circle at top right, rgba(245,241,231,.08), transparent 20%),
        linear-gradient(rgba(245,241,231,.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(245,241,231,.02) 1px, transparent 1px);
      background-size: auto, 52px 52px, 52px 52px;
      pointer-events: none;
      z-index: 0;
    }
    body::after {
      content: '';
      position: fixed;
      left: -14%;
      bottom: -12%;
      width: 440px;
      height: 440px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(135,151,107,.14) 0%, rgba(135,151,107,0) 68%);
      filter: blur(10px);
      pointer-events: none;
      z-index: 0;
    }
    .shell { max-width: 1240px; margin: 0 auto; position: relative; z-index: 1; }
    .floating-sidebar {
      position: fixed;
      left: 18px;
      top: 18px;
      bottom: 18px;
      width: 306px;
      display: flex;
      flex-direction: column;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 30px;
      background: rgba(18,18,18,.88);
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow);
      z-index: 100;
    }
    .sidebar-panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 2px 6px 12px;
    }
    .sidebar-panel-toggle {
      width: 28px;
      height: 28px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(245,241,231,.7);
      border: 1px solid var(--line);
      background: rgba(255,255,255,.03);
    }
    .sidebar-panel-toggle svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      transform: rotate(180deg);
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px 14px;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    .sidebar-brand img {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: block;
      box-shadow: 0 10px 24px rgba(0,0,0,.24);
    }
    .sidebar-title {
      margin-top: 2px;
      font-family: 'Newsreader', Georgia, serif;
      font-size: 26px;
      font-weight: 700;
      line-height: .95;
      letter-spacing: -.03em;
    }
    .sidebar-subtitle {
      color: rgba(200,193,174,.56);
      font-size: 10px;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    .nav-group {
      display: grid;
      gap: 10px;
    }
    .nav-footer {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid var(--line);
    }
    .nav-footer form { margin: 0; }
    .side-btn {
      width: 100%;
      min-height: 50px;
      padding: 0 14px;
      border-radius: 14px;
      border: 1px solid rgba(245,241,231,.08);
      background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.02));
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      cursor: pointer;
      text-decoration: none;
      font: inherit;
      font-size: 14px;
      text-align: left;
      font-weight: 500;
      transition: background .14s, border-color .14s, color .14s, transform .14s;
    }
    .side-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
    .side-btn-label {
      flex: 1;
      line-height: 1.2;
    }
    .side-btn:hover,
    .side-btn.is-active {
      color: var(--text);
      transform: translateY(-1px);
    }
    .side-btn:hover {
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
      border-color: rgba(245,241,231,.16);
    }
    .side-btn.is-active {
      background:
        linear-gradient(110deg, rgba(245,241,231,.16), transparent 42%),
        linear-gradient(180deg, rgba(10,10,10,.98), rgba(7,7,7,.92));
      border-color: rgba(245,241,231,.22);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 12px 28px rgba(0,0,0,.18);
    }
    .side-btn-logout {
      color: #f3cece;
      border-color: rgba(217,133,133,.24);
      background: rgba(217,133,133,.08);
    }
    .side-btn-logout:hover {
      color: #fff0f0;
      border-color: rgba(217,133,133,.36);
      background: rgba(217,133,133,.12);
    }
    .notice {
      margin-bottom: 20px;
      padding: 14px 16px;
      border: 1px solid rgba(170,182,138,.24);
      border-radius: 14px;
      background: rgba(170,182,138,.08);
      color: #d8e2c9;
      font-size: 14px;
      letter-spacing: .02em;
    }
    .card { box-shadow: none; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 8px 0 24px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--line);
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 44px; height: 44px; border-radius: 14px; display: block; box-shadow: 0 10px 24px rgba(0,0,0,.24); }
    .eyebrow,
    .label {
      color: rgba(200,193,174,.58);
      font-size: 11px;
      letter-spacing: .18em;
      text-transform: uppercase;
    }
    .brand h1 {
      margin: 8px 0 0;
      font-family: 'Newsreader', Georgia, serif;
      font-size: 42px;
      font-weight: 700;
      line-height: .95;
      letter-spacing: -.04em;
    }
    .brand p,
    .section-copy,
    .account-copy {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
      max-width: 46ch;
    }
    .quick-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .quick-actions form {
      margin: 0;
      display: flex;
    }
    .ghost-btn,
    .primary-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      min-width: 140px;
      padding: 0 20px;
      border-radius: 999px;
      border: 1px solid var(--line-strong);
      background: transparent;
      color: var(--text);
      text-decoration: none;
      text-align: center;
      white-space: nowrap;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      line-height: 1.1;
      vertical-align: middle;
      transition: background .14s, border-color .14s, color .14s, transform .14s;
    }
    .ghost-btn:hover {
      background: rgba(255,255,255,.04);
      border-color: rgba(245,241,231,.18);
      transform: translateY(-1px);
    }
    .primary-btn {
      color: #181818;
      background: linear-gradient(180deg, var(--gold-strong), var(--gold));
      border-color: rgba(198,162,75,.5);
      box-shadow: 0 12px 30px rgba(198,162,75,.18);
    }
    .primary-btn:hover {
      background: linear-gradient(180deg, #e1c978, var(--gold-strong));
      transform: translateY(-1px);
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .summary-item {
      padding: 20px 22px 22px;
      border: none;
      border-right: 1px solid var(--line);
      background: transparent;
    }
    .summary-item:last-child { border-right: none; }
    .summary-value {
      display: block;
      margin-top: 10px;
      font-family: 'Newsreader', Georgia, serif;
      font-size: 34px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -.04em;
    }
    .summary-text {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .panel { display: none; }
    .panel.is-active { display: block; }
    .section-card,
    .account-card,
    .account-panel-card {
      padding: 22px 24px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
    }
    .section-head,
    .table-toolbar,
    .account-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .section-head h2,
    .table-toolbar h2 {
      margin: 8px 0 0;
      font-family: 'Newsreader', Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      line-height: .95;
      letter-spacing: -.04em;
    }
    .selection-tools {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 13px;
    }
    .selection-tools label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
    .selection-count { color: var(--moss-light); font-size: 11px; text-transform: uppercase; letter-spacing: .16em; }
    .row-select,
    .select-all { width: 15px; height: 15px; accent-color: var(--moss); }
    .table-wrap {
      overflow: auto;
      border-top: 1px solid var(--line);
      background: transparent;
    }
    table { width: 100%; min-width: 860px; border-collapse: collapse; }
    th, td {
      padding: 16px 18px;
      border-bottom: 1px solid rgba(245,241,231,.05);
      text-align: left;
      font-size: 14px;
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      background: rgba(24,24,24,.96);
      color: rgba(200,193,174,.58);
      font-size: 11px;
      font-family: 'IBM Plex Mono', monospace;
      letter-spacing: .16em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--line-strong);
    }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: rgba(255,255,255,.02); }
    .identity-cell { display: grid; gap: 4px; }
    .identity-cell strong { font-size: 15px; font-weight: 600; line-height: 1.35; }
    .identity-cell span { color: var(--muted); line-height: 1.55; font-size: 13px; }
    .select-cell,
    .num,
    .actions-cell { width: 1%; white-space: nowrap; }
    .row-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .row-actions form { margin: 0; }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      font-size: 11px;
      font-family: 'IBM Plex Mono', monospace;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .pill-blue { color: var(--moss-light); background: var(--moss-soft); border-color: rgba(135,151,107,.34); }
    .pill-warm { color: #f4d9a3; background: var(--gold-soft); border-color: rgba(198,162,75,.34); }
    .pill-success { color: #d8e2c9; background: var(--success-soft); border-color: rgba(170,182,138,.34); }
    .pill-danger { color: #f1c6c6; background: var(--danger-soft); border-color: rgba(217,133,133,.34); }
    .pill-muted { color: rgba(200,193,174,.78); background: rgba(255,255,255,.04); }
    .danger-ghost { color: #f3cece; border-color: rgba(217,133,133,.32); background: rgba(217,133,133,.1); }
    .danger-solid { color: #fff0f0; border-color: rgba(217,133,133,.32); background: rgba(120,37,37,.82); }
    .account-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr);
      gap: 14px;
    }
    .account-profile { display: flex; align-items: center; gap: 14px; }
    .account-avatar {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--moss-light);
      background: var(--moss-soft);
      border: 1px solid rgba(135,151,107,.28);
    }
    .account-avatar svg { width: 20px; height: 20px; }
    .security-list { display: grid; gap: 8px; margin-top: 16px; }
    .security-item {
      padding: 13px 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      border-left: 3px solid rgba(198,162,75,.34);
      background: rgba(255,255,255,.02);
    }
    .security-item strong { display: block; margin-bottom: 5px; font-size: 13px; }
    .security-item span { color: var(--muted); font-size: 12px; line-height: 1.65; }
    @media (max-width: 1080px) {
      .account-layout { grid-template-columns: 1fr; }
      .summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 860px) {
      body { padding: 18px 16px 76px; }
      .floating-sidebar {
        position: static;
        width: auto;
        margin-bottom: 18px;
        border-radius: 24px;
      }
      .nav-group { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .shell { padding-top: 0; }
      .topbar,
      .section-card,
      .account-card,
      .account-panel-card { padding: 16px; }
    }
    @media (max-width: 640px) {
      .nav-group,
      .summary-strip { grid-template-columns: 1fr; }
      .topbar,
      .section-head,
      .table-toolbar { gap: 12px; }
    }
  </style>
</head>
<body>
  <div class="floating-sidebar" aria-label="Dashboard shortcuts">
    <div class="sidebar-panel-head">
      <div class="sidebar-subtitle">Protected route</div>
      <div class="sidebar-panel-toggle" aria-hidden="true">${adminIcon('back')}</div>
    </div>
    <div class="sidebar-brand">
      <img src="/admin/logo" alt="Wytham app icon" />
      <div>
        <div class="sidebar-title">Wytham</div>
      </div>
    </div>
    <nav class="nav-group" aria-label="Primary">
      <button type="button" class="side-btn is-active" data-panel-target="signups-panel" aria-label="Show signups" title="Signups">${adminIcon('signups')}<span class="side-btn-label">Signups</span></button>
      <button type="button" class="side-btn" data-panel-target="donations-panel" aria-label="Show donations" title="Donations">${adminIcon('donations')}<span class="side-btn-label">Donations</span></button>
      <button type="button" class="side-btn" data-panel-target="account-panel" aria-label="Account" title="Account">${adminIcon('account')}<span class="side-btn-label">Account</span></button>
      <a class="side-btn" href="/admin/export.csv" aria-label="Export signups CSV" title="Export CSV">${adminIcon('export')}<span class="side-btn-label">Export CSV</span></a>
      <a class="side-btn" href="/admin/preview/email" aria-label="Preview email" title="Preview email">${adminIcon('preview')}<span class="side-btn-label">Email preview</span></a>
    </nav>
    <div class="nav-footer">
      <form method="post" action="/admin/logout">
        <button type="submit" class="side-btn side-btn-logout">${adminIcon('logout')}<span class="side-btn-label">Log out</span></button>
      </form>
    </div>
  </div>
  <div class="shell">
    <section class="card topbar">
      <div class="brand">
        <img src="/admin/logo" alt="Wytham app icon" />
        <div>
          <div class="eyebrow">Wytham admin</div>
          <h1>Admin</h1>
          <p>A quieter view of signups, support notes, and export.</p>
        </div>
      </div>
      <div class="quick-actions">
        <a class="ghost-btn" href="/admin/preview/email">Preview email</a>
        <a class="primary-btn" href="/admin/export.csv">Export CSV</a>
      </div>
    </section>
    ${noticeBanner}

    <section id="signups-panel" class="panel is-active" data-panel>
      <section class="section-card summary-strip" aria-label="Signup summary">
        <div class="summary-item">
          <div class="label">Total</div>
          <strong class="summary-value">${totalSignups}</strong>
          <span class="summary-text">Beta requests</span>
        </div>
        <div class="summary-item">
          <div class="label">Editions</div>
          <strong class="summary-value">${liteCount} / ${bundleCount}</strong>
          <span class="summary-text">Lite and Bundle</span>
        </div>
        <div class="summary-item">
          <div class="label">Open rate</div>
          <strong class="summary-value">${openRate}%</strong>
          <span class="summary-text">${openedCount} opened</span>
        </div>
        <div class="summary-item">
          <div class="label">Visits</div>
          <strong class="summary-value">${totalVisits}</strong>
          <span class="summary-text">Beta link opens</span>
        </div>
      </section>

      <section class="card section-card">
        <div class="table-toolbar">
          <div>
            <div class="label">Signups</div>
            <h2>Recent signups</h2>
            <p class="section-copy">Latest requests across the beta list.</p>
          </div>
          <div class="selection-tools">
            <label><input class="select-all" type="checkbox" data-select-all aria-label="Select all visible signups" /> <span>Select all</span></label>
            <span class="selection-count" data-selection-count>0 selected</span>
            <form method="post" action="/admin/signups/send" data-batch-form data-confirm-selected="Send the Wytham beta email to the selected signups?">
              <input type="hidden" name="csrfToken" value="${escapeHtml(batchSendToken)}" />
              <input type="hidden" name="tokens" value="" data-selected-tokens />
              <button type="submit" class="ghost-btn" data-batch-delete disabled>Send selected</button>
            </form>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Person</th>
                <th>Institution</th>
                <th>Edition</th>
                <th>Email status</th>
                <th>Visits</th>
                <th>Last open</th>
                <th>Signed up</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </section>
    </section>

    <section id="donations-panel" class="panel" data-panel>
      <section class="card section-card">
        <div class="section-head">
          <div>
            <div class="label">Donations</div>
            <h2>Support inbox</h2>
            <p class="section-copy">${escapeHtml(donationSummary)}</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Country</th>
                <th>Amount</th>
                <th>Message</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>${donationRows}</tbody>
          </table>
        </div>
      </section>
    </section>

    <section id="account-panel" class="panel" data-panel>
      ${renderAdminAccountPanel({ adminUsername: options.adminUsername })}
    </section>
  </div>
</body>
</html>`;
}

function renderAdminLoginPage(errorMessage) {
  const errorBlock = errorMessage
    ? `<div class="login-error">${escapeHtml(errorMessage)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wytham Admin &mdash; Sign in</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,600;6..72,700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #070706;
      --surface: rgba(20,20,20,.72);
      --line: rgba(245,241,231,.08);
      --line-strong: rgba(245,241,231,.12);
      --cream: #F5F1E7;
      --accent: #C6A24B;
      --accent-strong: #D3B85F;
      --moss: #AAB68A;
      --text: #F5F1E7;
      --muted: #C8C1AE;
      --danger: #d98585;
      --danger-dim: rgba(217,133,133,.12);
    }
    html { color-scheme: dark; }
    body {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 50% 0%, rgba(255,255,255,.12), transparent 24%),
        linear-gradient(180deg, #050505 0%, #090907 42%, #050505 100%);
      color: var(--text);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    body::before {
      content: '';
      position: fixed;
      width: 420px;
      height: 260px;
      top: -14%;
      right: 16%;
      left: auto;
      bottom: auto;
      background: radial-gradient(circle, rgba(255,255,255,.32) 0%, rgba(255,255,255,.08) 24%, rgba(255,255,255,0) 68%);
      transform: rotate(-16deg);
      opacity: .72;
      filter: blur(4px);
      pointer-events: none;
      z-index: 0;
    }
    body::after {
      content: '';
      position: fixed;
      top: -6%;
      right: 8%;
      width: 520px;
      height: 300px;
      background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0));
      clip-path: polygon(70% 0, 100% 0, 72% 100%, 48% 100%);
      opacity: .18;
      pointer-events: none;
      z-index: 0;
    }
    .login-wrap {
      position: relative;
      z-index: 1;
      width: min(100%, 372px);
      padding: 28px 24px 24px;
      border: 1px solid var(--line-strong);
      border-radius: 28px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)),
        var(--surface);
      backdrop-filter: blur(28px);
      box-shadow: 0 28px 70px rgba(0,0,0,.42);
    }
    .login-mark {
      display: grid;
      place-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }
    .login-badge {
      width: 54px;
      height: 54px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, rgba(170,182,138,.20), rgba(198,162,75,.16));
      border: 1px solid rgba(245,241,231,.14);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 12px 32px rgba(0,0,0,.24);
    }
    .login-badge img {
      width: 28px;
      height: 28px;
      display: block;
    }
    .login-kicker {
      color: rgba(200,193,174,.78);
      font-size: 11px;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .form-title {
      font-family: 'Newsreader', Georgia, serif;
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -.04em;
      line-height: .95;
      margin-bottom: 10px;
      text-align: center;
    }
    .login-copy {
      margin: 0 auto 20px;
      max-width: 28ch;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .login-error {
      margin: 0 0 16px;
      padding: 12px 14px;
      border: 1px solid rgba(217,133,133,.28);
      border-radius: 14px;
      background: var(--danger-dim);
      color: #f1cdcd;
      font-size: 13px;
      letter-spacing: .02em;
      display: block;
    }
    .login-error::before { content: none; }
    .field { margin-top: 12px; margin-bottom: 0; }
    .field-wrap { position: relative; }
    .field input {
      width: 100%;
      border: 1px solid var(--line-strong);
      min-height: 48px;
      background: rgba(255,255,255,.06);
      color: var(--text);
      padding: 0 15px;
      font-size: 14px;
      outline: none;
      border-radius: 15px;
      transition: border-color 150ms, background 150ms;
      -webkit-font-smoothing: antialiased;
    }
    .field input::placeholder { color: rgba(200,193,174,.5); }
    .field input:focus {
      border-color: rgba(198,162,75,.6);
      background: rgba(255,255,255,.08);
    }
    .field input.has-toggle { padding-right: 42px; }
    .pwd-toggle {
      position: absolute; right: 0; top: 0; bottom: 0; width: 42px;
      display: inline-flex; align-items: center; justify-content: center;
      background: none; border: none;
      color: var(--muted); cursor: pointer;
      transition: color 140ms;
    }
    .pwd-toggle:hover { color: var(--accent); }
    .pwd-toggle svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    .submit-btn {
      width: 100%;
      min-height: 48px;
      margin-top: 20px;
      border: 1px solid rgba(245,241,231,.28);
      background: linear-gradient(180deg, #faf7ef, #e8dfcc);
      color: #181818;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border-radius: 999px;
      transition: transform 130ms, filter 130ms;
    }
    .submit-btn:hover {
      transform: translateY(-1px);
      filter: brightness(1.03);
    }
    .login-note {
      margin-top: 16px;
      text-align: center;
      color: rgba(200,193,174,.64);
      font-size: 12px;
      letter-spacing: .04em;
    }
    :focus-visible { outline: 2px solid rgba(198,162,75,.58); outline-offset: 2px; }
    @media (max-width: 680px) {
      .login-wrap { padding: 26px 20px 22px; }
    }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-mark">
      <div class="login-badge">
        <img src="/admin/logo" alt="Wytham icon" />
      </div>
      <div class="login-kicker">Wytham admin</div>
    </div>
    <h2 class="form-title">Sign in</h2>
    <p class="login-copy">Protected access to signups, support notes, and export.</p>
    ${errorBlock}
    <form method="post" action="/admin/login" novalidate>
      <div class="field">
        <label for="admin-username" class="sr-only">Username</label>
        <div class="field-wrap">
          <input id="admin-username" name="username" type="text" autocomplete="username" required aria-required="true" placeholder="Username" />
        </div>
      </div>
      <div class="field">
        <label for="admin-password" class="sr-only">Password</label>
        <div class="field-wrap">
          <input id="admin-password" name="password" type="password" autocomplete="current-password" required aria-required="true" class="has-toggle" placeholder="Password" />
          <button type="button" class="pwd-toggle" aria-label="Show password" id="pwd-toggle-btn" onclick="(function(){var i=document.getElementById('admin-password'),b=document.getElementById('pwd-toggle-btn');if(i.type==='password'){i.type='text';b.setAttribute('aria-label','Hide password');}else{i.type='password';b.setAttribute('aria-label','Show password');}})()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>
      <button class="submit-btn" type="submit" id="login-submit-btn">Sign in</button>
    </form>
    <p class="login-note">Protected route only.</p>
  </div>
</body>
</html>`;
}

function renderAdminEmailPreviewPage(emailHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wytham Admin &mdash; Email Preview</title>
  <style>
    body { margin:0; background:#181818; color:#F5F1E7; font-family:'IBM Plex Sans',system-ui,sans-serif; padding:24px; }
    .shell { max-width:1180px; margin:0 auto; }
    .toolbar { display:flex; align-items:center; gap:12px; margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid rgba(245,241,231,.1); }
    .back-link { width:46px; height:46px; border-radius:999px; border:1px solid rgba(245,241,231,.12); background:rgba(255,255,255,.03); color:#F5F1E7; display:inline-flex; align-items:center; justify-content:center; text-decoration:none; }
    .back-link svg { width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .preview-title { display:flex; align-items:center; gap:10px; color:#C8C1AE; }
    .preview-title svg { width:20px; height:20px; stroke:#87976B; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
    .preview-frame { width:100%; min-height:1080px; border:1px solid rgba(245,241,231,.08); border-radius:24px; background:#111111; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <a class="back-link" href="/admin" aria-label="Back to dashboard" title="Back to dashboard">${adminIcon('back')}</a>
      <div class="preview-title">${adminIcon('preview')}<span>Wytham email preview</span></div>
    </div>
    <iframe class="preview-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="${escapeHtml(emailHtml)}"></iframe>
  </div>
</body>
</html>`;
}

function renderSignupLineChart(series) {
  const width = 920;
  const height = 260;
  const padLeft = 40;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const maxValue = Math.max(1, ...series.map((item) => Math.max(item.lite_count, item.bundle_count, item.total)));
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const gridLevels = Array.from(new Set([maxValue, Math.max(0, Math.round(maxValue / 2)), 0])).sort((a, b) => b - a);
  const litePoints = lineSeriesPoints(series, 'lite_count', width, height, padLeft, padRight, padTop, padBottom, maxValue);
  const bundlePoints = lineSeriesPoints(series, 'bundle_count', width, height, padLeft, padRight, padTop, padBottom, maxValue);
  const grid = gridLevels
    .map((level) => {
      const y = yForLineValue(level, height, padTop, padBottom, maxValue);
      return `<g>
        <line class="chart-grid-line" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
        <text class="chart-axis-label" x="${padLeft - 10}" y="${y + 4}" text-anchor="end">${level}</text>
      </g>`;
    })
    .join('');
  const xLabels = litePoints
    .map((point, index) => `<text class="chart-axis-label" x="${point.x}" y="${height - 8}" text-anchor="middle">${escapeHtml(series[index].label)}</text>`)
    .join('');

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Signups over the last 14 days">
    ${grid}
    <line class="chart-axis-line" x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}"></line>
    <path class="chart-line-lite" d="${linePath(litePoints)}"></path>
    <path class="chart-line-bundle" d="${linePath(bundlePoints)}"></path>
    ${lineDots(litePoints, 'chart-dot-lite', 'Lite')}
    ${lineDots(bundlePoints, 'chart-dot-bundle', 'Bundle')}
    ${xLabels}
  </svg>`;
}

function lineSeriesPoints(series, key, width, height, padLeft, padRight, padTop, padBottom, maxValue) {
  const usableWidth = width - padLeft - padRight;
  const stepX = series.length > 1 ? usableWidth / (series.length - 1) : 0;
  return series.map((item, index) => ({
    x: roundNumber(padLeft + (stepX * index)),
    y: roundNumber(yForLineValue(Number(item[key]) || 0, height, padTop, padBottom, maxValue)),
    value: Number(item[key]) || 0,
    label: item.label,
  }));
}

function yForLineValue(value, height, padTop, padBottom, maxValue) {
  const usableHeight = height - padTop - padBottom;
  return height - padBottom - ((value / maxValue) * usableHeight);
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function lineDots(points, cssClass, label) {
  return points
    .map((point) => `<circle class="${cssClass}" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(`${point.label}: ${point.value} ${label} signups`)}</title></circle>`)
    .join('');
}

function adminIcon(name) {
  const icons = {
    signups: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="11" r="4"></circle><path d="M5 24c1.9-3.8 4.7-5.7 8-5.7s6.1 1.9 8 5.7"></path><path d="M21 10a3.5 3.5 0 1 1 0 7"></path><path d="M23.5 24c.9-2.1 2.5-3.6 4.5-4.5"></path></svg>',
    donations: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 26s-8-4.9-10.6-9.5C3.2 12.7 5.4 8 10 8c2.5 0 4.1 1.3 6 3.5C17.9 9.3 19.5 8 22 8c4.6 0 6.8 4.7 4.6 8.5C24 21.1 16 26 16 26z"></path></svg>',
    export: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 4h9l7 7v15a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path><path d="M19 4v7h7"></path><path d="M16 14v8"></path><path d="M12.5 19.5 16 23l3.5-3.5"></path></svg>',
    preview: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10h24v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10z"></path><path d="M4 11l12 8 12-8"></path></svg>',
    account: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="5"></circle><path d="M7 26c1.8-4.3 5.1-6.5 9-6.5S23.2 21.7 25 26"></path></svg>',
    back: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M20 8 12 16l8 8"></path><path d="M13 16h13"></path></svg>',
    logout: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 6H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5"></path><path d="M18 11l5 5-5 5"></path><path d="M12 16h11"></path></svg>',
  };
  return icons[name] || '';
}

function renderAdminAccountPanel(options = {}) {
  const adminUsername = trim(options.adminUsername) || config.adminUsername;
  return `<div class="account-layout">
    <section class="card account-card">
      <div class="account-top">
        <div class="account-profile">
          <div class="account-avatar">${adminIcon('account')}</div>
          <div>
            <div class="label">Signed in as</div>
            <div style="font-size:28px;line-height:1.05;letter-spacing:-.04em;margin-top:8px;">${escapeHtml(adminUsername)}</div>
          </div>
        </div>
        <span class="pill pill-blue">Admin session</span>
      </div>
    </section>
    <section class="card account-panel-card">
      <form method="post" action="/admin/logout">
        <button type="submit" class="ghost-btn danger-solid" style="display:inline-flex;align-items:center;gap:8px;">${adminIcon('logout')}<span>Log out</span></button>
      </form>
    </section>
  </div>`;
}

function renderEditionBadge(edition) {
  return trim(edition).toLowerCase() === 'bundle'
    ? '<span class="pill pill-warm">Bundle</span>'
    : '<span class="pill pill-blue">Lite</span>';
}

function renderStatusBadge(status) {
  const normalized = trim(status).toLowerCase();
  if (normalized === 'sent') return '<span class="pill pill-success">Sent</span>';
  if (normalized === 'failed') return '<span class="pill pill-danger">Failed</span>';
  if (normalized === 'pending') return '<span class="pill pill-muted">Pending</span>';
  return `<span class="pill pill-muted">${escapeHtml(status || 'Unknown')}</span>`;
}

function simplePage(title, copy) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(title)}</title><style>body{margin:0;background:#0a0a0a;color:#f0f0ec;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:#111111;border:1px solid rgba(255,255,255,.08);padding:28px}h1{margin:0 0 12px;font-size:32px;line-height:1}p{margin:0;color:rgba(240,240,236,.72);line-height:1.7}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div></body></html>`;
}

function betaUrl(token, currentConfig = config) {
  return `${currentConfig.publicBaseUrl}/beta/${token}`;
}

function downloadUrl(token, currentConfig = config) {
  return `${currentConfig.publicBaseUrl}/download/${token}`;
}

function shareUrlForEdition(edition, currentConfig = config) {
  return edition === 'lite' ? currentConfig.liteShareUrl : currentConfig.bundleShareUrl;
}

function smtpReady(currentConfig = config) {
  return Boolean(currentConfig.smtpHost && currentConfig.smtpPort && currentConfig.smtpUser && currentConfig.smtpPass && currentConfig.smtpFromEmail);
}

async function verifyTurnstileToken(token, options = {}) {
  const currentConfig = options.config || config;
  const fetchImpl = options.fetchImpl || fetch;
  const secretKey = trim(currentConfig.turnstile?.secretKey);
  const trimmedToken = trim(token);

  if (!secretKey) {
    return {
      success: false,
      statusCode: 503,
      error: 'Verification is unavailable right now. Please try again later.',
    };
  }

  if (!trimmedToken) {
    return {
      success: false,
      statusCode: 400,
      error: 'Complete the verification challenge and try again.',
    };
  }

  try {
    const payload = new URLSearchParams({
      secret: secretKey,
      response: trimmedToken,
    });
    const remoteIp = trim(options.ip);
    if (remoteIp) {
      payload.set('remoteip', remoteIp);
    }

    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      return {
        success: false,
        statusCode: 502,
        error: 'Verification could not be completed. Please try again.',
      };
    }

    const result = await response.json();
    if (result && result.success) {
      return { success: true, statusCode: 200, error: '' };
    }

    return {
      success: false,
      statusCode: 403,
      error: 'Verification failed. Please try again.',
    };
  } catch (_error) {
    return {
      success: false,
      statusCode: 502,
      error: 'Verification could not be completed. Please try again.',
    };
  }
}

function createMailer(currentConfig = config) {
  if (!smtpReady(currentConfig)) {
    return null;
  }

  return nodemailer.createTransport({
    host: currentConfig.smtpHost,
    port: currentConfig.smtpPort,
    secure: currentConfig.smtpSecure,
    auth: {
      user: currentConfig.smtpUser,
      pass: currentConfig.smtpPass,
    },
  });
}

function clientIp(req) {
  const remoteAddr = normalizeIp(req.socket.remoteAddress) || 'unknown';
  // Only trust proxy headers from a local tunnel/agent process. Use the right-most
  // forwarded IP because untrusted clients can prepend spoofed values on the left.
  if (isLocalAddress(remoteAddr)) {
    const forwarded = trim(req.headers['x-forwarded-for']);
    if (forwarded) {
      const parts = forwarded.split(',').map((part) => normalizeIp(part)).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  return remoteAddr;
}

function applyAppMiddleware(target, options, currentConfig = config) {
  target.disable('x-powered-by');
  target.use((req, res, next) => {
    const origin = trim(req.headers.origin);
    const isApiRequest = req.path === '/api' || req.path.startsWith('/api/');
    if (options?.allowCors) {
      if (origin && currentConfig.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return origin && !currentConfig.allowedOrigins.includes(origin) ? res.sendStatus(403) : res.sendStatus(204);
      }
      if (isApiRequest && req.method !== 'GET' && req.method !== 'HEAD' && origin && !currentConfig.allowedOrigins.includes(origin)) {
        return res.status(403).json({ success: false, error: 'Origin not allowed.' });
      }
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (requestUsesHttps(req)) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader(
      'Content-Security-Policy',
      options?.allowCors ? publicContentSecurityPolicy() : adminContentSecurityPolicy()
    );
    next();
  });
  target.use(express.json({ limit: '10kb' }));
  target.use(express.urlencoded({ extended: false, limit: '10kb' }));
}

function allowRate(ip, action) {
  const policy = ratePolicy(action);
  const now = Date.now();
  const key = `${ip}:${action}`;
  sweepRateStore(now);

  const existing = rateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + policy.windowMs });
    return true;
  }

  if (existing.count >= policy.limit) {
    return false;
  }

  existing.count += 1;
  rateStore.set(key, existing);
  return true;
}

function tripRateLimit(ip, action) {
  const policy = ratePolicy(action);
  const now = Date.now();
  sweepRateStore(now);
  rateStore.set(`${ip}:${action}`, { count: policy.limit, resetAt: now + policy.windowMs });
}

function sweepRateStore(now) {
  if (now - lastRateSweepAt < RATE_SWEEP_INTERVAL_MS) {
    return;
  }

  for (const [entryKey, entry] of rateStore.entries()) {
    if (entry && entry.resetAt > now) {
      continue;
    }
    rateStore.delete(entryKey);
  }
  lastRateSweepAt = now;
}

function ratePolicy(action) {
  return RATE_POLICIES[action] || RATE_POLICIES.signup;
}

function isLocalAddress(value) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(trim(value));
}

function normalizeIp(value) {
  const candidate = trim(String(value || '')).replace(/[\r\n]/g, '').slice(0, 64);
  if (!candidate) return '';
  return /^[a-fA-F0-9:.]+$/.test(candidate) ? candidate : '';
}

function normalizeHost(value) {
  return trim(String(value || '')).toLowerCase().replace(/^\[|\]$/g, '');
}

function originAllowed(req, allowedOrigins) {
  const origin = trim(req.headers.origin);
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

function requestUsesHttps(req) {
  const forwardedProto = trim(req.headers['x-forwarded-proto']).split(',')[0];
  return req.secure || forwardedProto === 'https';
}

function adminAllowedOrigins() {
  return Array.from(
    new Set([
      `http://${config.adminHost}:${config.adminPort}`,
      `http://127.0.0.1:${config.adminPort}`,
      `http://localhost:${config.adminPort}`,
    ])
  );
}

function adminOriginAllowed(req) {
  if (!adminHostAllowed(req)) {
    return false;
  }

  const origin = trim(req.headers.origin);
  if (!origin || origin === 'null') return true;

  try {
    const parsed = new URL(origin);
    const hostname = normalizeHost(parsed.hostname);
    const adminHost = normalizeHost(config.adminHost);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    if (adminHost) {
      allowedHosts.add(adminHost);
    }
    return parsed.protocol === 'http:' && port === String(config.adminPort) && allowedHosts.has(hostname);
  } catch {
    return adminRefererAllowed(req);
  }
}

function adminHostAllowed(req) {
  const rawHost = trim(req.headers.host);
  if (!rawHost) return false;

  try {
    const parsed = new URL(`http://${rawHost}`);
    const hostname = normalizeHost(parsed.hostname);
    const adminHost = normalizeHost(config.adminHost);
    const port = parsed.port || '80';
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    if (adminHost) {
      allowedHosts.add(adminHost);
    }
    return port === String(config.adminPort) && allowedHosts.has(hostname);
  } catch {
    return false;
  }
}

function adminRefererAllowed(req) {
  const referer = trim(req.headers.referer);
  if (!referer) return true;

  try {
    const parsed = new URL(referer);
    const hostname = normalizeHost(parsed.hostname);
    const adminHost = normalizeHost(config.adminHost);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    if (adminHost) {
      allowedHosts.add(adminHost);
    }
    return parsed.protocol === 'http:' && port === String(config.adminPort) && allowedHosts.has(hostname);
  } catch {
    return false;
  }
}

function publicContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "img-src 'self' https: data: cid:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' https: data:",
    "script-src 'self' https://challenges.cloudflare.com",
    "script-src-attr 'none'",
    "connect-src 'self' https: https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

function adminContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "img-src 'self' https: data: cid:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' https: data:",
    "script-src 'self'",
    "script-src-attr 'none'",
    "connect-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

function registerErrorHandler(target) {
  target.use((err, req, res, next) => {
    if (!err) return next();

    const isApiRequest = req.path === '/api' || req.path.startsWith('/api/');
    const parseFailure =
      err.type === 'entity.parse.failed' ||
      err.type === 'encoding.unsupported' ||
      err.type === 'entity.too.large' ||
      err instanceof SyntaxError;

    res.setHeader('Cache-Control', 'no-store');

    if (parseFailure) {
      if (isApiRequest) {
        return res.status(err.type === 'entity.too.large' ? 413 : 400).json({
          success: false,
          error: err.type === 'entity.too.large' ? 'Request body too large.' : 'Invalid request body.',
        });
      }
      return res
        .status(err.type === 'entity.too.large' ? 413 : 400)
        .type('html')
        .send(simplePage('Bad Request', err.type === 'entity.too.large' ? 'The request body was too large.' : 'The request body could not be read.'));
    }

    console.error('[server error]', err && err.stack ? err.stack : err);
    if (isApiRequest) {
      return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
    return res.status(500).type('html').send(simplePage('Server Error', 'Something went wrong on the server.'));
  });
}

function loadEnv(filePath) {
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
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function boolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value, maxLength) {
  return trim(normalizeInputValue(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ')).slice(0, maxLength);
}

function cleanEmail(value) {
  return trim(normalizeInputValue(value).replace(/[\r\n<>]/g, '')).slice(0, 254);
}

function validEmail(value) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}

function firstValidationMessage(error, fallback) {
  const message = error && Array.isArray(error.issues) && error.issues.length ? error.issues[0].message : '';
  return trim(message) || fallback;
}

function trim(value) {
  return String(value || '').trim();
}

function normalizeInputValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function cut(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function safeEqualStrings(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || '');
  return cookieHeader.split(';').reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;
    try {
      acc[rawKey] = decodeURIComponent(rawValue.join('=') || '');
    } catch {
      acc[rawKey] = rawValue.join('=') || '';
    }
    return acc;
  }, {});
}

function createAdminSession(username) {
  const expiresAt = Date.now() + (8 * 60 * 60 * 1000);
  const payload = `${username}|${expiresAt}`;
  const signature = crypto.createHmac('sha256', adminSessionSecret).update(payload, 'utf8').digest('hex');
  return `${payload}|${signature}`;
}

function hasAdminSession(req) {
  const session = parseCookies(req).wytham_admin;
  if (!session) return false;
  const [username, expiresAt, signature] = session.split('|');
  if (!username || !expiresAt || !signature) return false;
  const payload = `${username}|${expiresAt}`;
  const expected = crypto.createHmac('sha256', adminSessionSecret).update(payload, 'utf8').digest('hex');
  if (!safeEqualStrings(signature, expected)) return false;
  if (!safeEqualStrings(username, config.adminUsername)) return false;
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) return false;
  return true;
}

function setAdminSession(res, username) {
  res.setHeader('Set-Cookie', serializeCookie('wytham_admin', createAdminSession(username), {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/admin',
    maxAge: 8 * 60 * 60,
  }));
}

function clearAdminSession(res) {
  res.setHeader('Set-Cookie', serializeCookie('wytham_admin', '', {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/admin',
    maxAge: 0,
  }));
}

function adminFormToken(value) {
  return crypto
    .createHmac('sha256', adminActionSecret)
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function parseBatchTokens(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const tokens = [];
  for (const rawValue of rawValues) {
    const pieces = String(rawValue || '')
      .split(',')
      .map((item) => trim(item))
      .filter(Boolean);
    for (const piece of pieces) {
      if (validToken(piece)) {
        tokens.push(piece);
      }
    }
  }
  return Array.from(new Set(tokens)).slice(0, 100);
}

function firstName(value) {
  return trim(value).split(/\s+/)[0] || 'there';
}

function stripSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function canonicalRequestPath(req) {
  const rawUrl = String(req.originalUrl || req.url || '/').split('?')[0].split('#')[0] || '/';
  let value = rawUrl;
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  value = value.replace(/\\/g, '/');
  const normalized = path.posix.normalize(value.startsWith('/') ? value : `/${value}`);
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function isSensitivePublicPath(requestedPath) {
  const normalized = String(requestedPath || '/').replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const segments = lower.split('/').filter(Boolean);

  if (lower === '/backend' || lower.startsWith('/backend/')) return true;
  if (segments.some((segment) => segment.startsWith('.'))) return true;
  if (lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.sqlite3') || lower.endsWith('.log')) return true;

  return false;
}

function isAllowedPublicPath(requestedPath) {
  return PUBLIC_ROOT_FILES.has(requestedPath) || PUBLIC_PATH_PREFIXES.some((prefix) => requestedPath.startsWith(prefix));
}

function resolvePublicPath(requestedPath) {
  const targetPath = path.resolve(ROOT_DIR, `.${requestedPath}`);
  if (!targetPath.startsWith(ROOT_DIR + path.sep) && targetPath !== ROOT_DIR) {
    throw new Error('Resolved public path escaped the root directory.');
  }
  return targetPath;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '')
    .replace(/\n/g, ' ');
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options?.path) parts.push(`Path=${options.path}`);
  if (options?.httpOnly) parts.push('HttpOnly');
  if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (Number.isFinite(options?.maxAge)) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
}

function roundNumber(value) {
  return Math.round(Number(value) * 100) / 100;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function csvCell(value) {
  const s = String(value == null ? '' : value);
  // Prefix formula-injection trigger chars (=, +, -, @, tab, CR) so spreadsheet apps
  // treat them as plain text and never execute them as formulas.
  const fc = s.charCodeAt(0);
  const safe = (fc === 61 || fc === 43 || fc === 45 || fc === 64 || fc === 9 || fc === 13)
    ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function validToken(value) {
  return /^[a-f0-9]{48}$/i.test(String(value || ''));
}

function isSafeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createLegacySqliteStore() {
  const insertSignupStatement = db.prepare(`
    INSERT INTO signups (
      token, name, email, institution, country, role, edition,
      source_page, source_title, ip_address, user_agent,
      created_at, updated_at, beta_visits, last_beta_visit_at,
      email_status, email_error, email_sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSignupStatement = db.prepare(`
    UPDATE signups
    SET name = ?, institution = ?, country = ?, role = ?, edition = ?,
        source_page = ?, source_title = ?, ip_address = ?, user_agent = ?,
        updated_at = ?, beta_visits = ?, last_beta_visit_at = ?,
        email_status = ?, email_error = ?, email_sent_at = ?
    WHERE email = ?
  `);
  const updateVisitStatement = db.prepare(`
    UPDATE signups
    SET beta_visits = ?, last_beta_visit_at = ?
    WHERE token = ?
  `);
  const recentSignupsStatement = db.prepare(`
    SELECT token, name, email, institution, country, role, edition, created_at, email_status, beta_visits, last_beta_visit_at
    FROM signups
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const recentDonationsStatement = db.prepare(`
    SELECT name, email, country, amount, message, created_at
    FROM donations
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const donationSummaryStatement = db.prepare(`
    SELECT email, country, amount
    FROM donations
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const institutionRowsStatement = db.prepare(`
    SELECT institution
    FROM signups
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const signupSummaryStatement = db.prepare(`
    SELECT edition, beta_visits
    FROM signups
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const signupSeriesStatement = db.prepare(`
    SELECT created_at, edition
    FROM signups
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const exportStatement = db.prepare(`
    SELECT name, email, institution, country, role, edition, created_at, email_status, beta_visits
    FROM signups
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return {
    async deleteSignupByToken(token) {
      statements.deleteSignup.run(token);
      return { data: { token }, error: null };
    },

    async findSignupByEmail(email) {
      return { data: statements.byEmail.get(email) || null, error: null };
    },

    async findSignupByToken(token) {
      return { data: statements.byToken.get(token) || null, error: null };
    },

    async insertDonation(donation) {
      statements.insertDonation.run(
        donation.name,
        donation.email,
        donation.country || '',
        donation.message || '',
        donation.amount || '',
        donation.ip_address || '',
        donation.user_agent || '',
        donation.created_at
      );
      return { data: donation, error: null };
    },

    async insertSignup(signup) {
      insertSignupStatement.run(
        signup.token,
        signup.name,
        signup.email,
        signup.institution || '',
        signup.country || '',
        signup.role || '',
        signup.edition,
        signup.source_page || '',
        signup.source_title || '',
        signup.ip_address || '',
        signup.user_agent || '',
        signup.created_at,
        signup.updated_at,
        Number(signup.beta_visits) || 0,
        signup.last_beta_visit_at || '',
        signup.email_status || 'pending',
        signup.email_error || '',
        signup.email_sent_at || ''
      );
      return { data: statements.byToken.get(signup.token) || null, error: null };
    },

    async listDonationSummaryRows(limit = 5000) {
      return { data: donationSummaryStatement.all(limit), error: null };
    },

    async listInstitutionRows(limit = 1000) {
      return { data: institutionRowsStatement.all(limit), error: null };
    },

    async listRecentDonations(limit = 50) {
      return { data: recentDonationsStatement.all(limit), error: null };
    },

    async listRecentSignups(limit = 50) {
      return { data: recentSignupsStatement.all(limit), error: null };
    },

    async listSignupSeriesRows(limit = 5000) {
      return { data: signupSeriesStatement.all(limit), error: null };
    },

    async listSignupSummaryRows(limit = 5000) {
      return { data: signupSummaryStatement.all(limit), error: null };
    },

    async listSignupsForExport(limit = 1000) {
      return { data: exportStatement.all(limit), error: null };
    },

    async markSignupEmailStatus(token, { error = '', sentAt = '', status } = {}) {
      statements.markEmail.run(status || 'pending', error || '', sentAt || '', token);
      const signup = statements.byToken.get(token);
      return {
        data: signup
          ? {
              token: signup.token,
              email_status: signup.email_status,
              email_error: signup.email_error,
              email_sent_at: signup.email_sent_at,
            }
          : null,
        error: null,
      };
    },

    async markSignupVisit(token, { betaVisits, visitedAt } = {}) {
      updateVisitStatement.run(Number(betaVisits) || 0, visitedAt || '', token);
      const signup = statements.byToken.get(token);
      return {
        data: signup
          ? {
              token: signup.token,
              beta_visits: signup.beta_visits,
              last_beta_visit_at: signup.last_beta_visit_at,
            }
          : null,
        error: null,
      };
    },

    summarizeDailySignupRows,
    summarizeDonations,
    summarizeInstitutionRows,
    summarizeSignups,

    async updateSignupByEmail(email, updates) {
      const existing = statements.byEmail.get(email);
      if (!existing) {
        return { data: null, error: null };
      }

      const nextSignup = { ...existing, ...updates, email };
      updateSignupStatement.run(
        nextSignup.name,
        nextSignup.institution || '',
        nextSignup.country || '',
        nextSignup.role || '',
        nextSignup.edition,
        nextSignup.source_page || '',
        nextSignup.source_title || '',
        nextSignup.ip_address || '',
        nextSignup.user_agent || '',
        nextSignup.updated_at,
        Number(nextSignup.beta_visits) || 0,
        nextSignup.last_beta_visit_at || '',
        nextSignup.email_status || 'pending',
        nextSignup.email_error || '',
        nextSignup.email_sent_at || '',
        email
      );

      return { data: statements.byEmail.get(email) || null, error: null };
    },
  };
}

function createRuntimeStore(currentConfig = config) {
  if (currentConfig.supabase && currentConfig.supabase.isConfigured) {
    return createStore(createAdminSupabaseClient(currentConfig));
  }

  return createLegacySqliteStore();
}

async function readStoreResult(resultLike) {
  const result = await resultLike;
  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'error')) {
    if (result.error) {
      throw result.error;
    }
    return result.data == null ? null : result.data;
  }
  return result == null ? null : result;
}

function normalizeEmailResult(result) {
  const normalized = result && typeof result === 'object' ? result : {};
  return {
    status: normalized.status === 'sent' ? 'sent' : 'failed',
    error: normalized.status === 'sent' ? '' : trim(normalized.error || 'SMTP not configured.'),
    sentAt: normalized.status === 'sent' ? trim(normalized.sentAt || new Date().toISOString()) : '',
  };
}

async function listSignupSummaryRowsFromStore(store) {
  if (typeof store.listSignupSummaryRows === 'function') {
    return (await readStoreResult(store.listSignupSummaryRows(5000))) || [];
  }
  if (typeof store.listRecentSignups === 'function') {
    return (await readStoreResult(store.listRecentSignups(5000))) || [];
  }
  return [];
}

async function listSignupSeriesRowsFromStore(store) {
  if (typeof store.listSignupSeriesRows === 'function') {
    return (await readStoreResult(store.listSignupSeriesRows(5000))) || [];
  }
  if (typeof store.listRecentSignups === 'function') {
    return (await readStoreResult(store.listRecentSignups(5000))) || [];
  }
  return [];
}

async function listDonationSummaryRowsFromStore(store) {
  if (typeof store.listDonationSummaryRows === 'function') {
    return (await readStoreResult(store.listDonationSummaryRows(5000))) || [];
  }
  if (typeof store.listRecentDonations === 'function') {
    return (await readStoreResult(store.listRecentDonations(5000))) || [];
  }
  return [];
}

function createApp(options = {}) {
  const currentConfig = options.config || config;
  const store = options.store || createRuntimeStore(currentConfig);
  const currentMailer = options.mailer !== undefined ? options.mailer : createMailer(currentConfig);
  const sendEmail = typeof options.sendSignupEmail === 'function'
    ? options.sendSignupEmail
    : (signup) => sendSignupEmail(signup, { config: currentConfig, mailer: currentMailer });
  const verifyTurnstile = typeof options.verifyTurnstile === 'function'
    ? options.verifyTurnstile
    : ({ token, ip }) => verifyTurnstileToken(token, { config: currentConfig, ip });
  const hostedApp = express();
  const actionSecret = crypto.randomBytes(32).toString('hex');
  const sessionSecret = crypto.randomBytes(32).toString('hex');

  applyAppMiddleware(hostedApp, { allowCors: true }, currentConfig);

  function formToken(value) {
    return crypto
      .createHmac('sha256', actionSecret)
      .update(String(value || ''), 'utf8')
      .digest('hex');
  }

  function createSession(username) {
    const expiresAt = Date.now() + (8 * 60 * 60 * 1000);
    const payload = `${username}|${expiresAt}`;
    const signature = crypto.createHmac('sha256', sessionSecret).update(payload, 'utf8').digest('hex');
    return `${payload}|${signature}`;
  }

  function hasHostedAdminSession(req) {
    const session = parseCookies(req).wytham_admin;
    if (!session) return false;
    const [username, expiresAt, signature] = session.split('|');
    if (!username || !expiresAt || !signature) return false;
    const payload = `${username}|${expiresAt}`;
    const expected = crypto.createHmac('sha256', sessionSecret).update(payload, 'utf8').digest('hex');
    if (!safeEqualStrings(signature, expected)) return false;
    if (!safeEqualStrings(username, currentConfig.adminUsername)) return false;
    if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) return false;
    return true;
  }

  function setHostedAdminSession(res, username) {
    res.setHeader('Set-Cookie', serializeCookie('wytham_admin', createSession(username), {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/admin',
      maxAge: 8 * 60 * 60,
    }));
  }

  function clearHostedAdminSession(res) {
    res.setHeader('Set-Cookie', serializeCookie('wytham_admin', '', {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/admin',
      maxAge: 0,
    }));
  }

  function requireHostedAdmin(req, res, next) {
    if (!hasHostedAdminSession(req)) {
      return res.redirect('/admin/login');
    }
    next();
  }

  async function loadAdminDashboardData() {
    const [
      signupSummaryRows,
      recentSignups,
      donationSummaryRows,
      recentDonations,
      institutionRows,
      signupSeriesRows,
    ] = await Promise.all([
      listSignupSummaryRowsFromStore(store),
      readStoreResult(store.listRecentSignups ? store.listRecentSignups(50) : []),
      listDonationSummaryRowsFromStore(store),
      readStoreResult(store.listRecentDonations ? store.listRecentDonations(50) : []),
      readStoreResult(store.listInstitutionRows ? store.listInstitutionRows(1000) : []),
      listSignupSeriesRowsFromStore(store),
    ]);

    return {
      counts: summarizeSignups(signupSummaryRows || []),
      dailySignups: buildDailySignupSeries(summarizeDailySignupRows(signupSeriesRows || [], 14), 14),
      donationCounts: summarizeDonations(donationSummaryRows || []),
      institutions: summarizeInstitutionRows(institutionRows || [], 10),
      recentDonations: recentDonations || [],
      recentSignups: recentSignups || [],
    };
  }

  hostedApp.get('/health', async (req, res, next) => {
    try {
      const requestedToken = trim(req.query.token || '');
      res.setHeader('Cache-Control', 'no-store');

      if (currentConfig.healthToken && requestedToken && !safeEqualStrings(requestedToken, currentConfig.healthToken)) {
        return res.status(401).json({ success: false, error: 'Unauthorized.' });
      }

      if (currentConfig.healthToken && safeEqualStrings(requestedToken, currentConfig.healthToken)) {
        const counts = summarizeSignups(await listSignupSummaryRowsFromStore(store));
        return res.json({
          ok: true,
          emailConfigured: smtpReady(currentConfig),
          totalSignups: counts.total || 0,
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.post('/api/signup', async (req, res, next) => {
    try {
      if (!originAllowed(req, currentConfig.allowedOrigins)) {
        return res.status(403).json({ success: false, error: 'Origin not allowed.' });
      }

      res.setHeader('Cache-Control', 'no-store');
      const ip = clientIp(req);
      const verification = await verifyTurnstile({
        action: 'signup',
        ip,
        req,
        token: req.body?.['cf-turnstile-response'] || req.body?.turnstileToken,
      });
      if (!verification || !verification.success) {
        return res.status(verification?.statusCode || 403).json({
          success: false,
          error: verification?.error || 'Verification failed. Please try again.',
        });
      }
      if (!allowRate(ip, 'signup')) {
        return res.status(429).json({ success: false, error: 'Too many signup attempts. Please try again later.' });
      }

      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: firstValidationMessage(parsed.error, 'Please check your signup details and try again.'),
        });
      }

      const body = parsed.data;
      if (body.hp_field) {
        tripRateLimit(ip, 'signup');
        return res.json({ success: true, message: "You're on the list." });
      }

      const now = new Date().toISOString();
      const userAgent = cut(req.headers['user-agent'], 300);
      const existing = await readStoreResult(store.findSignupByEmail(body.email));
      const token = existing?.token || crypto.randomBytes(24).toString('hex');
      const nextSignup = {
        token,
        name: body.name,
        email: body.email,
        institution: body.institution,
        country: body.country,
        role: body.role,
        edition: body.edition,
        source_page: body.source_page,
        source_title: body.source_title,
        ip_address: ip,
        user_agent: userAgent,
        created_at: existing?.created_at || now,
        updated_at: now,
        beta_visits: Number(existing?.beta_visits) || 0,
        last_beta_visit_at: existing?.last_beta_visit_at || '',
        email_status: 'pending',
        email_error: '',
        email_sent_at: '',
      };

      if (existing) {
        await readStoreResult(store.updateSignupByEmail(body.email, nextSignup));
      } else {
        await readStoreResult(store.insertSignup(nextSignup));
      }

      await readStoreResult(store.markSignupEmailStatus(token, { status: 'pending', error: '', sentAt: '' }));
      const savedSignup = await readStoreResult(store.findSignupByToken(token));
      return res.json({
        success: true,
        message: `Thank you, ${firstName(savedSignup?.name || body.name)}. We saved your request and will send your Wytham beta email shortly.`,
      });
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.post('/api/donate', async (req, res, next) => {
    try {
      if (!originAllowed(req, currentConfig.allowedOrigins)) {
        return res.status(403).json({ success: false, error: 'Origin not allowed.' });
      }

      res.setHeader('Cache-Control', 'no-store');
      const ip = clientIp(req);
      const verification = await verifyTurnstile({
        action: 'donate',
        ip,
        req,
        token: req.body?.['cf-turnstile-response'] || req.body?.turnstileToken,
      });
      if (!verification || !verification.success) {
        return res.status(verification?.statusCode || 403).json({
          success: false,
          error: verification?.error || 'Verification failed. Please try again.',
        });
      }
      if (!allowRate(ip, 'donate')) {
        return res.status(429).json({ success: false, error: 'Too many donation attempts. Please try again later.' });
      }

      const parsed = donateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: firstValidationMessage(parsed.error, 'Please check your donation details and try again.'),
        });
      }

      const body = parsed.data;
      if (body.hp_field) {
        tripRateLimit(ip, 'donate');
        return res.json({ success: true, message: 'Thank you for your support!' });
      }

      await readStoreResult(
        store.insertDonation({
          name: body.name,
          email: body.email,
          country: body.country,
          message: body.message,
          amount: body.amount,
          ip_address: ip,
          user_agent: cut(req.headers['user-agent'], 300),
          created_at: new Date().toISOString(),
        })
      );

      return res.json({ success: true, message: 'Thank you for your support! We will be in touch.' });
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.get('/beta/:token', async (req, res, next) => {
    try {
      if (!validToken(req.params.token)) {
        return res.status(404).type('html').send(simplePage('Beta Link Not Found', 'This beta access link does not exist or has expired.'));
      }

      const ip = clientIp(req);
      if (!allowRate(ip, 'beta')) {
        return res.status(429).type('html').send(simplePage('Too Many Requests', 'Please wait a moment and try your beta link again.'));
      }

      const signup = await readStoreResult(store.findSignupByToken(req.params.token));
      if (!signup) {
        return res.status(404).type('html').send(simplePage('Beta Link Not Found', 'This beta access link does not exist or has expired.'));
      }

      await readStoreResult(
        store.markSignupVisit(signup.token, {
          betaVisits: (Number(signup.beta_visits) || 0) + 1,
          visitedAt: new Date().toISOString(),
        })
      );

      res.setHeader('Cache-Control', 'no-store');
      return res.type('html').send(renderBetaPage(signup, currentConfig));
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.get('/download/:token', async (req, res, next) => {
    try {
      if (!validToken(req.params.token)) {
        return res.status(404).type('html').send(simplePage('Download Not Available', 'This download link does not exist or has expired.'));
      }

      const signup = await readStoreResult(store.findSignupByToken(req.params.token));
      if (!signup) {
        return res.status(404).type('html').send(simplePage('Download Not Available', 'This download link does not exist or has expired.'));
      }

      const shareUrl = shareUrlForEdition(signup.edition, currentConfig);
      if (!isSafeExternalUrl(shareUrl)) {
        return res.status(503).type('html').send(simplePage('Download Unavailable', 'The download location is not configured yet. Please contact the Wytham team.'));
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, shareUrl);
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.get('/admin', requireHostedAdmin, async (req, res, next) => {
    try {
      const dashboard = await loadAdminDashboardData();
      const notice = trim(req.query.notice);
      res.setHeader('Cache-Control', 'no-store');
      return res.type('html').send(
        renderAdminPage(
          dashboard.counts,
          dashboard.donationCounts,
          dashboard.recentSignups,
          dashboard.recentDonations,
          dashboard.institutions,
          dashboard.dailySignups,
          notice,
          { adminUsername: currentConfig.adminUsername, formToken }
        )
      );
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.get('/admin/login', (req, res) => {
    if (hasHostedAdminSession(req)) {
      return res.redirect('/admin');
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.type('html').send(renderAdminLoginPage());
  });

  hostedApp.post('/admin/login', (req, res) => {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).type('html').send(renderAdminLoginPage(firstValidationMessage(parsed.error, 'Please check your login details and try again.')));
    }

    const { username, password } = parsed.data;
    if (!safeEqualStrings(username, currentConfig.adminUsername) || !safeEqualStrings(password, currentConfig.adminPassword)) {
      return res.status(401).type('html').send(renderAdminLoginPage('That username or password was not correct.'));
    }

    setHostedAdminSession(res, username);
    return res.redirect('/admin');
  });

  hostedApp.post('/admin/logout', requireHostedAdmin, (_req, res) => {
    clearHostedAdminSession(res);
    res.redirect('/admin/login');
  });

  hostedApp.get('/admin/export.csv', requireHostedAdmin, async (_req, res, next) => {
    try {
      const rows = (await readStoreResult(store.listSignupsForExport ? store.listSignupsForExport(1000) : [])) || [];
      const headers = ['name', 'email', 'institution', 'country', 'role', 'edition', 'created_at', 'email_status', 'beta_visits'];
      const csvBody = [
        headers.join(','),
        ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="wytham-signups.csv"');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(csvBody);
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.get('/logo.png', (_req, res) => {
    if (!fs.existsSync(LOGO_PATH)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('image/png').sendFile(LOGO_PATH);
  });

  hostedApp.get('/admin/logo', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(LOGO_PATH);
  });

  hostedApp.get('/admin/assets/admin.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/javascript').sendFile(ADMIN_SCRIPT_PATH);
  });

  hostedApp.get('/admin/assets/matter.woff2', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.type('font/woff2').sendFile(MATTER_FONT_PATH);
  });

  hostedApp.get('/admin/preview/email', requireHostedAdmin, (_req, res) => {
    const sample = sampleSignup('lite');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(renderAdminEmailPreviewPage(renderEmailTemplate(sample, '/admin/logo', currentConfig)));
  });

  hostedApp.post('/admin/signups/:token/send', requireHostedAdmin, async (req, res, next) => {
    try {
      const signupToken = trim(req.params.token);
      const csrfToken = trim(req.body?.csrfToken);
      if (!validToken(signupToken) || !safeEqualStrings(csrfToken, formToken(`${signupToken}:send`))) {
        return res.status(403).type('html').send(simplePage('Action Blocked', 'This send request could not be verified.'));
      }

      const signup = await readStoreResult(store.findSignupByToken(signupToken));
      if (!signup) {
        return res.redirect('/admin?notice=Signup%20not%20found');
      }
      if (trim(signup.email_status).toLowerCase() === 'sent') {
        return res.redirect('/admin?notice=Signup%20already%20sent');
      }

      const emailResult = normalizeEmailResult(await sendEmail(signup));
      await readStoreResult(store.markSignupEmailStatus(signup.token, emailResult));
      const notice = emailResult.status === 'sent'
        ? 'Email sent'
        : `Email failed: ${emailResult.error || 'Unknown error.'}`;
      return res.redirect(`/admin?notice=${encodeURIComponent(notice)}`);
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.post('/admin/signups/send', requireHostedAdmin, async (req, res, next) => {
    try {
      const csrfToken = trim(req.body?.csrfToken);
      if (!safeEqualStrings(csrfToken, formToken('batch-send'))) {
        return res.status(403).type('html').send(simplePage('Action Blocked', 'This batch send request could not be verified.'));
      }

      const tokens = parseBatchTokens(req.body?.tokens);
      if (!tokens.length) {
        return res.redirect('/admin?notice=No%20signups%20selected');
      }

      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      for (const token of tokens) {
        const signup = await readStoreResult(store.findSignupByToken(token));
        if (!signup) {
          continue;
        }
        if (trim(signup.email_status).toLowerCase() === 'sent') {
          skippedCount += 1;
          continue;
        }

        const emailResult = normalizeEmailResult(await sendEmail(signup));
        await readStoreResult(store.markSignupEmailStatus(signup.token, emailResult));

        if (emailResult.status === 'sent') {
          sentCount += 1;
        } else {
          failedCount += 1;
        }
      }

      let notice = `${sentCount} sent`;
      if (failedCount) {
        notice += `, ${failedCount} failed`;
      }
      if (skippedCount) {
        notice += `, ${skippedCount} skipped`;
      }

      return res.redirect(`/admin?notice=${encodeURIComponent(notice)}`);
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.post('/admin/signups/:token/delete', requireHostedAdmin, async (req, res, next) => {
    try {
      const signupToken = trim(req.params.token);
      const csrfToken = trim(req.body?.csrfToken);
      if (!validToken(signupToken) || !safeEqualStrings(csrfToken, formToken(signupToken))) {
        return res.status(403).type('html').send(simplePage('Action Blocked', 'This delete request could not be verified.'));
      }

      await readStoreResult(store.deleteSignupByToken(signupToken));
      return res.redirect('/admin?notice=Signup%20deleted');
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.post('/admin/signups/delete', requireHostedAdmin, async (req, res, next) => {
    try {
      const csrfToken = trim(req.body?.csrfToken);
      if (!safeEqualStrings(csrfToken, formToken('batch-delete'))) {
        return res.status(403).type('html').send(simplePage('Action Blocked', 'This batch delete request could not be verified.'));
      }

      const tokens = parseBatchTokens(req.body?.tokens);
      if (!tokens.length) {
        return res.redirect('/admin?notice=No%20signups%20selected');
      }

      for (const token of tokens) {
        await readStoreResult(store.deleteSignupByToken(token));
      }

      const deletedLabel = tokens.length === 1 ? '1%20signup%20deleted' : `${tokens.length}%20signups%20deleted`;
      return res.redirect(`/admin?notice=${deletedLabel}`);
    } catch (error) {
      return next(error);
    }
  });

  hostedApp.use((req, res, next) => {
    const requestedPath = canonicalRequestPath(req);
    if (
      requestedPath === '/api' ||
      requestedPath.startsWith('/api/') ||
      isSensitivePublicPath(requestedPath)
    ) {
      return res.sendStatus(404);
    }
    next();
  });

  hostedApp.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      return next();
    }

    const requestedPath = canonicalRequestPath(req);
    if (requestedPath === '/') {
      return next();
    }
    if (!isAllowedPublicPath(requestedPath)) {
      return res.sendStatus(404);
    }

    return res.sendFile(resolvePublicPath(requestedPath));
  });

  hostedApp.get('/', (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'index.html'));
  });

  registerErrorHandler(hostedApp);
  return hostedApp;
}

function startServer(options = {}) {
  if (options.legacy === true || boolean(process.env.LEGACY_MULTI_PORT)) {
    return startServers();
  }

  const currentConfig = options.config || config;
  const appToStart = options.app || createApp(options);
  const server = appToStart.listen(currentConfig.port, currentConfig.host, () => {
    console.log(`Wytham beta backend listening on http://${currentConfig.host}:${currentConfig.port}`);
    console.log(`Public base URL: ${currentConfig.publicBaseUrl}`);
    if (currentConfig.publicBaseUrl.includes('127.0.0.1') || currentConfig.publicBaseUrl.includes('localhost')) {
      console.warn('[warn] PUBLIC_BASE_URL is localhost — portal links in emails will not reach external users. Set it to your public deployment URL.');
    }
    if (!smtpReady(currentConfig)) {
      console.warn('[warn] SMTP not configured — admin sends will fail until SMTP_* vars are set.');
    }
    if (currentConfig.adminPassword === 'change-this-password') {
      console.warn('[warn] ADMIN_PASSWORD is still the default — change it before exposing the admin login.');
    }
  });

  return server;
}

module.exports = {
  createApp,
  renderAdminLoginPage,
  renderAdminPage,
  renderAdminAccountPanel,
  startServer,
  startServers,
  verifyTurnstileToken,
};
