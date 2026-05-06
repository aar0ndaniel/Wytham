const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('./server.js');

function createMemoryStore(initial = {}) {
  const state = {
    comments: Array.isArray(initial.comments) ? initial.comments.map(cloneComment) : [],
    donations: Array.isArray(initial.donations) ? [...initial.donations] : [],
    signups: Array.isArray(initial.signups) ? initial.signups.map(cloneSignup) : [],
  };

  return {
    async findSignupByEmail(email) {
      return { data: state.signups.find((signup) => signup.email === email) || null, error: null };
    },

    async findSignupByToken(token) {
      return { data: state.signups.find((signup) => signup.token === token) || null, error: null };
    },

    async insertSignup(signup) {
      const record = cloneSignup(signup);
      state.signups.push(record);
      return { data: record, error: null };
    },

    async insertDonation(donation) {
      const record = { ...donation };
      state.donations.push(record);
      return { data: record, error: null };
    },

    async insertComment(comment) {
      const record = {
        id: state.comments.length + 1,
        ...cloneComment(comment),
      };
      state.comments.push(record);
      return { data: cloneComment(record), error: null };
    },

    async listRecentComments(limit = 200) {
      return { data: state.comments.slice(0, limit).map(cloneComment), error: null };
    },

    async listInstitutionRows() {
      return { data: state.signups.map((signup) => ({ institution: signup.institution })), error: null };
    },

    async listRecentDonations() {
      return { data: [...state.donations], error: null };
    },

    async listRecentSignups() {
      return { data: state.signups.map(cloneSignup), error: null };
    },

    async listSignupSeriesRows() {
      return {
        data: state.signups.map((signup) => ({ created_at: signup.created_at, edition: signup.edition })),
        error: null,
      };
    },

    async listSignupSummaryRows() {
      return {
        data: state.signups.map((signup) => ({ edition: signup.edition, beta_visits: signup.beta_visits || 0 })),
        error: null,
      };
    },

    async listSignupsForExport() {
      return { data: state.signups.map(cloneSignup), error: null };
    },

    async markSignupEmailStatus(token, nextStatus) {
      const signup = state.signups.find((item) => item.token === token);
      if (!signup) {
        return { data: null, error: new Error('Missing signup') };
      }

      signup.email_status = nextStatus.status;
      signup.email_error = nextStatus.error;
      signup.email_sent_at = nextStatus.sentAt;
      return {
        data: {
          token: signup.token,
          email_status: signup.email_status,
          email_error: signup.email_error,
          email_sent_at: signup.email_sent_at,
        },
        error: null,
      };
    },

    async markSignupVisit(token, visitUpdate) {
      const signup = state.signups.find((item) => item.token === token);
      if (!signup) {
        return { data: null, error: new Error('Missing signup') };
      }

      signup.beta_visits = visitUpdate.betaVisits;
      signup.last_beta_visit_at = visitUpdate.visitedAt;
      return {
        data: {
          token: signup.token,
          beta_visits: signup.beta_visits,
          last_beta_visit_at: signup.last_beta_visit_at,
        },
        error: null,
      };
    },

    async updateSignupByEmail(email, updates) {
      const signup = state.signups.find((item) => item.email === email);
      if (!signup) {
        return { data: null, error: new Error('Missing signup') };
      }

      Object.assign(signup, updates);
      return { data: cloneSignup(signup), error: null };
    },

    state,
  };
}

function cloneSignup(signup) {
  return { ...signup };
}

function cloneComment(comment) {
  return { ...comment };
}

async function startApp(t, options = {}) {
  const store = options.store || createMemoryStore();
  const config = {
    allowedOrigins: ['https://metis.emend.it.com'],
    adminPassword: 'top-secret',
    adminUsername: 'ops',
    bundleShareUrl: 'https://example.com/bundle',
    healthToken: '',
    host: '127.0.0.1',
    liteShareUrl: 'https://example.com/lite',
    port: 0,
    publicBaseUrl: 'https://metis.emend.it.com',
    smtpFromEmail: '',
    smtpFromName: 'metis Team',
    smtpHost: '',
    smtpPass: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    supportEmail: 'support@metis.emend.it.com',
    turnstile: {
      secretKey: 'turnstile-secret',
      isConfigured: true,
    },
    ...options.config,
  };

  const app = createApp({
    config,
    fetchImpl: options.fetchImpl,
    sendSignupEmail: options.sendSignupEmail,
    store,
    verifyTurnstile: options.verifyTurnstile,
  });

  const server = await listenOnSafePort(app);
  t.after(() => server.close());

  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    store,
  };
}

async function listenOnSafePort(app) {
  const startPort = 18080 + Math.floor(Math.random() * 1000);

  for (let offset = 0; offset < 200; offset += 1) {
    const port = startPort + offset;
    const server = app.listen(port, '127.0.0.1');

    try {
      await once(server, 'listening');
      return server;
    } catch (error) {
      server.close();
      if (error && error.code === 'EADDRINUSE') {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to bind the test app to a safe loopback port.');
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      password: 'top-secret',
      username: 'ops',
    }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /metis_admin=/);
  return cookie.split(';', 1)[0];
}

function extractCsrfToken(html, actionPath) {
  const pattern = new RegExp(`action="${escapeRegExp(actionPath)}"[\\s\\S]*?name="csrfToken" value="([^"]+)"`);
  const match = html.match(pattern);
  assert.ok(match, `missing csrf token for ${actionPath}`);
  return match[1];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('POST /api/signup queues a pending signup without sending email automatically', async (t) => {
  const sentEmails = [];
  const { baseUrl, store } = await startApp(t, {
    sendSignupEmail: async (signup) => {
      sentEmails.push(signup.email);
      return { status: 'sent', error: '', sentAt: new Date().toISOString() };
    },
    verifyTurnstile: async ({ token }) => ({
      success: token === 'valid-signup-token',
      error: token === 'valid-signup-token' ? '' : 'Verification failed.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      country: 'Ghana',
      edition: 'lite',
      email: 'ada@example.com',
      institution: 'KNUST',
      name: 'Ada Lovelace',
      role: 'Researcher',
      sourcePage: '/index.html',
      sourceTitle: 'Landing',
      'cf-turnstile-response': 'valid-signup-token',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Thank you, Ada. We saved your request and will send your metis beta email shortly.',
  });
  assert.deepEqual(sentEmails, []);
  assert.equal(store.state.signups.length, 1);
  assert.equal(store.state.signups[0].email_status, 'pending');
  assert.equal(store.state.signups[0].email_error, '');
  assert.equal(store.state.signups[0].email_sent_at, '');
});

test('POST /api/signup rejects a missing Turnstile token before writing signup data', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    verifyTurnstile: async ({ token }) => ({
      success: Boolean(token),
      statusCode: token ? 200 : 400,
      error: token ? '' : 'Complete the verification challenge and try again.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      country: 'Ghana',
      edition: 'lite',
      email: 'no-token@example.com',
      institution: 'KNUST',
      name: 'No Token',
      role: 'Researcher',
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Complete the verification challenge and try again.',
  });
  assert.equal(store.state.signups.length, 0);
});

test('POST /api/donate rejects an invalid Turnstile token before writing donation data', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    verifyTurnstile: async ({ token }) => ({
      success: token === 'valid-donation-token',
      error: token === 'valid-donation-token' ? '' : 'Verification failed. Please try again.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/donate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      amount: '20',
      country: 'Ghana',
      email: 'donor@example.com',
      message: 'Happy to support.',
      name: 'Donor Person',
      'cf-turnstile-response': 'invalid-donation-token',
    }),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Verification failed. Please try again.',
  });
  assert.equal(store.state.donations.length, 0);
});

test('GET /download/:token redirects to the selected file URL and records access', async (t) => {
  const token = 'd'.repeat(48);
  const { baseUrl, store } = await startApp(t, {
    config: {
      bundleShareUrl: 'https://onedrive.example.com/bundle-installer.exe',
      liteShareUrl: 'https://onedrive.example.com/lite-installer.exe',
    },
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'bundle',
          created_at: '2026-04-16T18:00:00.000Z',
          updated_at: '2026-04-16T18:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'sent',
          email_error: '',
          email_sent_at: '2026-04-16T20:15:00.000Z',
        },
      ],
    }),
  });

  const response = await fetch(`${baseUrl}/download/${token}`, {
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://onedrive.example.com/bundle-installer.exe');
  assert.equal(store.state.signups[0].beta_visits, 1);
  assert.match(store.state.signups[0].last_beta_visit_at, /^20\d\d-\d\d-\d\dT/);
});

test('admin email preview uses tokenized backend access URL instead of raw share URL', async (t) => {
  const { baseUrl } = await startApp(t, {
    config: {
      liteShareUrl: 'https://onedrive.example.com/lite-installer.exe',
    },
  });

  const cookie = await login(baseUrl);
  const response = await fetch(`${baseUrl}/admin/preview/email`, {
    headers: { cookie },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Open access page/);
  assert.match(html, /https:\/\/metis\.emend\.it\.com\/beta\/preview/);
  assert.doesNotMatch(html, /onedrive\.example\.com\/lite-installer/);
});

test('POST /api/comment stores only public wall fields after Turnstile verification', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    verifyTurnstile: async ({ token, action }) => ({
      success: action === 'comment' && token === 'valid-comment-token',
      error: token === 'valid-comment-token' ? '' : 'Verification failed. Please try again.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/comment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
      'user-agent': 'wall-test-agent',
      'x-forwarded-for': '203.0.113.8',
    },
    body: JSON.stringify({
      name: 'Grace <script>',
      body: 'Ship the wall, safely.',
      sourcePage: '/wall.html',
      'cf-turnstile-response': 'valid-comment-token',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Pinned to the wall.',
  });
  assert.equal(store.state.comments.length, 1);
  assert.deepEqual(Object.keys(store.state.comments[0]).sort(), ['body', 'created_at', 'id', 'name']);
  assert.equal(store.state.comments[0].name, 'Grace script');
  assert.equal(store.state.comments[0].body, 'Ship the wall, safely.');
});

test('POST /api/comment rejects missing Turnstile token before writing comment data', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    verifyTurnstile: async ({ token }) => ({
      success: Boolean(token),
      statusCode: token ? 200 : 400,
      error: token ? '' : 'Complete the verification challenge and try again.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/comment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      body: 'No token should mean no write.',
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Complete the verification challenge and try again.',
  });
  assert.equal(store.state.comments.length, 0);
});

test('POST /admin/signups/:token/send sends a pending signup manually and marks it sent', async (t) => {
  const token = 'a'.repeat(48);
  const sentEmails = [];
  const { baseUrl, store } = await startApp(t, {
    sendSignupEmail: async (signup) => {
      sentEmails.push(signup.email);
      return { status: 'sent', error: '', sentAt: '2026-04-16T20:15:00.000Z' };
    },
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'bundle',
          created_at: '2026-04-16T18:00:00.000Z',
          updated_at: '2026-04-16T18:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'pending',
          email_error: '',
          email_sent_at: '',
        },
      ],
    }),
  });

  const cookie = await login(baseUrl);
  const dashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie },
  });
  const html = await dashboard.text();
  const csrfToken = extractCsrfToken(html, `/admin/signups/${token}/send`);

  const response = await fetch(`${baseUrl}/admin/signups/${token}/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams({ csrfToken }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin?notice=Email%20sent');
  assert.deepEqual(sentEmails, ['ada@example.com']);
  assert.equal(store.state.signups[0].email_status, 'sent');
  assert.equal(store.state.signups[0].email_error, '');
  assert.equal(store.state.signups[0].email_sent_at, '2026-04-16T20:15:00.000Z');
});

test('POST /admin/signups/:token/send sends through Resend HTTP when configured', async (t) => {
  const token = 'e'.repeat(48);
  const requests = [];
  const { baseUrl, store } = await startApp(t, {
    config: {
      resendApiKey: 're_test_key',
      resendEndpoint: 'https://api.resend.test',
      smtpFromEmail: 'team@metis.emend.it.com',
      smtpFromName: 'metis Team',
    },
    fetchImpl: async (url, init) => {
      requests.push({
        body: JSON.parse(init.body),
        headers: init.headers,
        method: init.method,
        url,
      });
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
    },
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Ada Lovelace',
          email: 'ada@gmail.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'lite',
          created_at: '2026-04-16T18:00:00.000Z',
          updated_at: '2026-04-16T18:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'pending',
          email_error: '',
          email_sent_at: '',
        },
      ],
    }),
  });

  const cookie = await login(baseUrl);
  const dashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie },
  });
  const html = await dashboard.text();
  const csrfToken = extractCsrfToken(html, `/admin/signups/${token}/send`);

  const response = await fetch(`${baseUrl}/admin/signups/${token}/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams({ csrfToken }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin?notice=Email%20sent');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.test/emails');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].headers.Authorization, 'Bearer re_test_key');
  assert.equal(requests[0].headers['User-Agent'], 'metis-beta-backend/0.1.0');
  assert.equal(requests[0].body.from, '"metis Team" <team@metis.emend.it.com>');
  assert.deepEqual(requests[0].body.to, ['ada@gmail.com']);
  assert.match(requests[0].body.html, /https:\/\/metis\.emend\.it\.com\/beta\/eeee/);
  assert.equal(store.state.signups[0].email_status, 'sent');
});

test('POST /admin/signups/send skips sent rows and marks pending rows failed when SMTP is missing', async (t) => {
  const pendingToken = 'b'.repeat(48);
  const sentToken = 'c'.repeat(48);
  const { baseUrl, store } = await startApp(t, {
    store: createMemoryStore({
      signups: [
        {
          token: pendingToken,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'lite',
          created_at: '2026-04-16T18:00:00.000Z',
          updated_at: '2026-04-16T18:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'pending',
          email_error: '',
          email_sent_at: '',
        },
        {
          token: sentToken,
          name: 'Grace Hopper',
          email: 'grace@example.com',
          institution: 'Navy',
          country: 'US',
          role: 'Scientist',
          edition: 'bundle',
          created_at: '2026-04-16T17:00:00.000Z',
          updated_at: '2026-04-16T17:00:00.000Z',
          beta_visits: 1,
          last_beta_visit_at: '2026-04-16T17:30:00.000Z',
          email_status: 'sent',
          email_error: '',
          email_sent_at: '2026-04-16T17:05:00.000Z',
        },
      ],
    }),
  });

  const cookie = await login(baseUrl);
  const dashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie },
  });
  const html = await dashboard.text();
  const csrfToken = extractCsrfToken(html, '/admin/signups/send');

  const response = await fetch(`${baseUrl}/admin/signups/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams({
      csrfToken,
      tokens: `${pendingToken},${sentToken}`,
    }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin?notice=0%20sent%2C%201%20failed%2C%201%20skipped');
  assert.equal(store.state.signups[0].email_status, 'failed');
  assert.equal(store.state.signups[0].email_error, 'SMTP not configured.');
  assert.equal(store.state.signups[0].email_sent_at, '');
  assert.equal(store.state.signups[1].email_status, 'sent');
  assert.equal(store.state.signups[1].email_sent_at, '2026-04-16T17:05:00.000Z');
});
