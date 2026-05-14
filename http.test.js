const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp, startServer } = require('./server.js');

function createMemoryStore(initial = {}) {
  const state = {
    comments: Array.isArray(initial.comments) ? initial.comments.map(cloneComment) : [],
    donations: Array.isArray(initial.donations) ? [...initial.donations] : [],
    feedback: Array.isArray(initial.feedback) ? initial.feedback.map((item) => ({ ...item })) : [],
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

    async insertFeedback(feedback) {
      const record = {
        id: state.feedback.length + 1,
        ...feedback,
      };
      state.feedback.push(record);
      return { data: { ...record }, error: null };
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

    async listRecentFeedback(limit = 100) {
      return { data: state.feedback.slice(0, limit).map((item) => ({ ...item })), error: null };
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

    async listFeedbackSummaryRows(limit = 5000) {
      return {
        data: state.feedback.slice(0, limit).map((item) => ({ email: item.email, created_at: item.created_at })),
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

    async listDonationsForExport() {
      return { data: state.donations.map((donation) => ({ ...donation })), error: null };
    },

    async listFeedbackForExport() {
      return { data: state.feedback.map((feedback) => ({ ...feedback })), error: null };
    },

    async markSignupEmailStatus(token, nextStatus) {
      const signup = state.signups.find((item) => item.token === token);
      if (!signup) {
        return { data: null, error: new Error('Missing signup') };
      }

      signup.email_status = nextStatus.status;
      signup.email_error = nextStatus.error;
      signup.email_sent_at = nextStatus.sentAt;
      signup.email_sent_by = nextStatus.sentBy || '';
      return {
        data: {
          token: signup.token,
          email_status: signup.email_status,
          email_error: signup.email_error,
          email_sent_at: signup.email_sent_at,
          email_sent_by: signup.email_sent_by,
        },
        error: null,
      };
    },

    async markSignupEmailSender(token, sentBy) {
      const signup = state.signups.find((item) => item.token === token);
      if (!signup) {
        return { data: null, error: new Error('Missing signup') };
      }

      signup.email_sent_by = sentBy || '';
      return {
        data: {
          token: signup.token,
          email_sent_by: signup.email_sent_by,
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
    emailSendTimeoutMs: 15000,
    smtpHost: '',
    smtpPass: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    supportEmail: 'aaronakuteye@gmail.com',
    supportBccEmail: 'hbessel.art@knust.edu.gh',
    supportUpdateEmail: 'aaronakuteye@gmail.com',
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

let adminLoginIpCounter = 1;

function nextAdminLoginIp() {
  adminLoginIpCounter += 1;
  return `198.51.100.${adminLoginIpCounter % 200}`;
}

async function login(baseUrl) {
  const response = await loginResponse(baseUrl);

  assert.equal(response.status, 302);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /metis_admin=/);
  return cookie.split(';', 1)[0];
}

async function loginResponse(baseUrl, body = { password: 'top-secret', username: 'ops' }, headers = {}) {
  return fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://metis.emend.it.com',
      'x-forwarded-for': nextAdminLoginIp(),
      ...headers,
    },
    body: new URLSearchParams(body),
    redirect: 'manual',
  });
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

test('GET / shows backend status instead of the landing page', async (t) => {
  const { baseUrl } = await startApp(t);

  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /metis Backend/);
  assert.match(html, /metis API and admin dashboard/);
  assert.doesNotMatch(html, /metis public beta access/i);
});

test('startServer refuses exposed hosted admin with the default password', () => {
  assert.throws(
    () => startServer({
      app: {
        listen() {
          throw new Error('listen should not be called');
        },
      },
      config: {
        adminPassword: 'change-this-password',
        host: '0.0.0.0',
        port: 0,
        publicBaseUrl: 'https://metis.emend.it.com',
        supabase: { isConfigured: true, schema: 'public' },
      },
      store: createMemoryStore(),
    }),
    /ADMIN_PASSWORD must be changed/
  );
});

test('POST /admin/login rate limits hosted login attempts', async (t) => {
  const { baseUrl } = await startApp(t);
  const headers = { 'x-forwarded-for': '203.0.113.10' };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await loginResponse(baseUrl, {
      password: `wrong-${attempt}`,
      username: 'ops',
    }, headers);
    assert.equal(response.status, 401);
  }

  const limited = await loginResponse(baseUrl, {
    password: 'wrong-again',
    username: 'ops',
  }, headers);
  assert.equal(limited.status, 429);
});

test('POST /admin/login rejects untrusted hosted admin origins', async (t) => {
  const { baseUrl } = await startApp(t);

  const response = await loginResponse(baseUrl, undefined, {
    origin: 'https://evil.example.com',
  });

  assert.equal(response.status, 403);
});

test('POST /admin/login sets Secure on hosted admin cookies when the public URL is HTTPS', async (t) => {
  const { baseUrl } = await startApp(t);

  const response = await loginResponse(baseUrl);
  assert.equal(response.status, 302);
  assert.match(response.headers.getSetCookie()[0], /;\s*Secure\b/);
});

test('POST /admin/login accepts multiple admins with separate passwords', async (t) => {
  const { baseUrl } = await startApp(t, {
    config: {
      adminUsers: [
        { username: 'anne', password: 'anne-password' },
        { username: 'mavis', password: 'mavis-password' },
      ],
    },
  });

  const anneResponse = await loginResponse(baseUrl, { username: 'anne', password: 'anne-password' });
  assert.equal(anneResponse.status, 302);
  const anneCookie = anneResponse.headers.getSetCookie()[0].split(';', 1)[0];

  const anneDashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie: anneCookie },
  });
  assert.equal(anneDashboard.status, 200);
  assert.match(await anneDashboard.text(), /anne/);

  const mavisResponse = await loginResponse(baseUrl, { username: 'mavis', password: 'mavis-password' });
  assert.equal(mavisResponse.status, 302);

  const mismatchedResponse = await loginResponse(baseUrl, { username: 'anne', password: 'mavis-password' });
  assert.equal(mismatchedResponse.status, 401);
});

test('GET /health with token reports non-secret runtime diagnostics', async (t) => {
  const { baseUrl } = await startApp(t, {
    config: {
      healthToken: 'health-secret',
      supabase: {
        isConfigured: false,
        schema: 'public',
      },
    },
    store: createMemoryStore({
      signups: [
        {
          token: 'h'.repeat(48),
          name: 'Health Check',
          email: 'health@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'lite',
          created_at: '2026-05-06T10:00:00.000Z',
          updated_at: '2026-05-06T10:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'pending',
          email_error: '',
          email_sent_at: '',
        },
      ],
    }),
  });

  const response = await fetch(`${baseUrl}/health?token=health-secret`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    emailConfigured: false,
    storeMode: 'custom',
    supabaseConfigured: false,
    supabaseSchema: 'public',
    totalSignups: 1,
  });
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
  assert.match(html, /background:\s*#ffffff/i);
  assert.match(html, /Beta testing/);
  assert.match(html, /Thank you for registering to test Metis/);
  assert.match(html, /Your Lite version is now ready for testing/);
  assert.match(html, /Access your download/);
  assert.match(html, /https:\/\/metis\.emend\.it\.com\/beta\/preview/);
  assert.doesNotMatch(html, /&lt;img\b/i);
  assert.doesNotMatch(html, /\/admin\/logo/);
  assert.doesNotMatch(html, /metis-logo-light-nav\.png/);
  assert.doesNotMatch(html, /onedrive\.example\.com\/lite-installer/);
});

test('admin support update preview uses the correction template and direct support email', async (t) => {
  const { baseUrl } = await startApp(t);

  const cookie = await login(baseUrl);
  const response = await fetch(`${baseUrl}/admin/preview/email/support-update`, {
    headers: { cookie },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Download &amp;amp;&lt;br \/&gt;Support Update/);
  assert.match(html, /This file is not commonly downloaded/);
  assert.match(html, /Keep anyway/);
  assert.match(html, /mailto:aaronakuteye@gmail\.com/);
  assert.match(html, /Product Lead, Metis/);
});

test('GET /metis-logo-light-nav.png serves the email logo image', async (t) => {
  const { baseUrl } = await startApp(t);

  const response = await fetch(`${baseUrl}/metis-logo-light-nav.png`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /image\/png/);
  assert.ok((await response.arrayBuffer()).byteLength > 1000);
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

test('POST /api/comment stores wall notes when Turnstile is not configured', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    config: {
      turnstile: {
        secretKey: '',
        isConfigured: false,
      },
    },
  });

  const response = await fetch(`${baseUrl}/api/comment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      name: 'Yaw',
      body: 'No challenge is configured, but the wall should still work.',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Pinned to the wall.',
  });
  assert.equal(store.state.comments.length, 1);
  assert.equal(store.state.comments[0].body, 'No challenge is configured, but the wall should still work.');
});

test('POST /api/feedback stores tester feedback for admin review', async (t) => {
  const { baseUrl, store } = await startApp(t, {
    verifyTurnstile: async ({ action, token }) => ({
      success: action === 'feedback' && token === 'valid-feedback-token',
      error: token === 'valid-feedback-token' ? '' : 'Verification failed. Please try again.',
    }),
  });

  const response = await fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://metis.emend.it.com',
    },
    body: JSON.stringify({
      app_version: '0.1.7',
      analysis: JSON.stringify({
        best_feature: 'Fast PLS output.',
        bugs: 'The app freezes after clicking Calculate.',
      }),
      dataset_type: 'Survey data',
      draw_mode: JSON.stringify({ q1: 4 }),
      email: 'tester@example.com',
      features_tested: ['PLS-SEM analysis', 'Draw mode / model building'],
      name: 'Beta Tester',
      navigation: JSON.stringify({ q1: 5 }),
      num_constructs: '5',
      num_indicators: '24',
      overall: JSON.stringify({
        adoption_likelihood: 5,
        final_note: 'Metis already feels useful enough to share on the wall.',
        final_note_name: 'Wall Tester',
        most_valuable_feature: 'The comparison report.',
        needs_improvement: 'Stop freezing after Calculate.',
      }),
      privacyAccepted: 'yes',
      privacyPolicyVersion: '1.0',
      ram: '16 GB',
      sample_size: '250',
      sourcePage: '/feedback.html',
      sourceTitle: 'Feedback',
      tam: JSON.stringify({
        att1: 5,
        att2: 5,
        att3: 4,
        bi1: 5,
        bi2: 4,
        bi3: 5,
        bi4: 4,
        peou1: 3,
        peou2: 4,
        peou3: 4,
        peou4: 3,
        pu1: 5,
        pu2: 4,
        pu3: 5,
        pu4: 4,
      }),
      windows_version: 'Windows 11',
      'cf-turnstile-response': 'valid-feedback-token',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Feedback received. We will review it as we improve the beta.',
  });
  assert.equal(store.state.feedback.length, 1);
  assert.equal(store.state.feedback[0].app_version, '0.1.7');
  assert.deepEqual(store.state.feedback[0].features_tested, ['PLS-SEM analysis', 'Draw mode / model building']);
  assert.match(store.state.feedback[0].created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(store.state.comments.length, 1);
  assert.equal(store.state.comments[0].name, 'Wall Tester');
  assert.equal(store.state.comments[0].body, 'Metis already feels useful enough to share on the wall.');

  const loginResponse = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ username: 'ops', password: 'top-secret' }).toString(),
  });
  const cookie = loginResponse.headers.get('set-cookie');

  const adminResponse = await fetch(`${baseUrl}/admin`, {
    headers: {
      cookie,
    },
  });

  assert.equal(adminResponse.status, 200);
  const html = await adminResponse.text();
  assert.match(html, /Beta feedback/i);
  assert.match(html, /Beta Tester/i);
  assert.match(html, /The app freezes after clicking Calculate/i);
  assert.match(html, /Metis would improve the way I run PLS-SEM analysis\./i);
  assert.match(html, /Once the major issues are fixed, I would use Metis for my own work\./i);
  assert.match(html, /After your testing experience, how likely are you to use Metis when the reported issues are fixed\?/i);
  assert.match(html, /The comparison report/i);
  assert.doesNotMatch(html, /Adoption \/ TAM/i);
  assert.doesNotMatch(html, /\s\|\s/);
  assert.doesNotMatch(html, /Recent wall notes/i);
});

test('GET /api/comments includes wall notes submitted through feedback', async (t) => {
  const { baseUrl } = await startApp(t, {
    store: createMemoryStore({
      feedback: [
        {
          created_at: '2026-05-08T08:00:00.000Z',
          email: 'tester@example.com',
          name: 'Beta Tester',
          overall: {
            final_note: 'This was submitted from the feedback wall fields.',
            final_note_name: 'Feedback Wall',
          },
        },
      ],
    }),
  });

  const response = await fetch(`${baseUrl}/api/comments`, {
    headers: {
      origin: 'https://metis.emend.it.com',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    comments: [
      {
        id: 'feedback:2026-05-08T08:00:00.000Z:tester@example.com',
        name: 'Feedback Wall',
        body: 'This was submitted from the feedback wall fields.',
        created_at: '2026-05-08T08:00:00.000Z',
      },
    ],
  });
});

test('admin CSV export follows the active admin panel data shape', async (t) => {
  const { baseUrl } = await startApp(t, {
    store: createMemoryStore({
      donations: [
        {
          amount: '$25',
          country: 'Ghana',
          created_at: '2026-04-12T10:00:00.000Z',
          email: 'donor@example.com',
          message: 'Happy to support.',
          name: 'Donor One',
        },
      ],
      feedback: [
        {
          app_version: '0.1.7',
          analysis: {
            best_feature: 'PLS output worked best.',
            bugs: 'Freeze after Calculate.',
            confusing_feature: 'PLSpredict output format.',
            comparison: 'SmartPLS matched within 0.01.',
            q1: 5,
          },
          created_at: '2026-04-14T10:00:00.000Z',
          dataset_type: 'Survey data',
          draw_mode: { open1: 'Draw mode was simple.', q1: 4 },
          email: 'tester@example.com',
          features_tested: ['PLS-SEM analysis'],
          name: 'Beta Tester',
          navigation: { open1: 'The navigation labels were clear.', q1: 5 },
          num_constructs: '5',
          num_indicators: '24',
          overall: {
            adoption_likelihood: 5,
            final_note: 'I would use it.',
            final_note_name: 'Beta Tester',
            most_valuable_feature: 'Comparison report',
            needs_improvement: 'IPMA needs clearer labels.',
          },
          privacy_accepted_at: '2026-04-14T10:00:00.000Z',
          privacy_policy_version: '1.0',
          ram: '16 GB',
          sample_size: '250',
          screenshot_url: '',
          source_page: '/feedback.html',
          source_title: 'Feedback',
          tam: {
            att1: 5,
            att2: 5,
            att3: 4,
            bi1: 5,
            bi2: 4,
            bi3: 5,
            bi4: 4,
            peou1: 3,
            peou2: 4,
            peou3: 4,
            peou4: 3,
            pu1: 5,
            pu2: 4,
            pu3: 5,
            pu4: 4,
          },
          windows_version: 'Windows 11',
        },
      ],
      signups: [
        {
          beta_visits: 2,
          country: 'Ghana',
          created_at: '2026-04-10T10:00:00.000Z',
          edition: 'bundle',
          email: 'ada@example.com',
          email_status: 'sent',
          institution: 'KNUST',
          name: 'Ada Lovelace',
          role: 'Researcher',
          token: 'a'.repeat(48),
          updated_at: '2026-04-11T10:00:00.000Z',
        },
      ],
    }),
  });
  const cookie = await login(baseUrl);

  const signupsResponse = await fetch(`${baseUrl}/admin/export/signups.csv`, { headers: { cookie } });
  assert.equal(signupsResponse.status, 200);
  assert.match(signupsResponse.headers.get('content-type'), /text\/csv/i);
  const signupsCsv = await signupsResponse.text();
  assert.match(signupsCsv, /^name,email,institution,country,role,edition,created_at,email_status,email_sent_by,beta_visits/m);
  assert.match(signupsCsv, /"Ada Lovelace","ada@example.com"/);

  const donationsResponse = await fetch(`${baseUrl}/admin/export/donations.csv`, { headers: { cookie } });
  assert.equal(donationsResponse.status, 200);
  const donationsCsv = await donationsResponse.text();
  assert.match(donationsCsv, /^name,email,country,amount,message,created_at/m);
  assert.match(donationsCsv, /"Donor One","donor@example.com","Ghana","\$25","Happy to support\."/);

  const feedbackResponse = await fetch(`${baseUrl}/admin/export/feedback.csv`, { headers: { cookie } });
  assert.equal(feedbackResponse.status, 200);
  const feedbackCsv = await feedbackResponse.text();
  const feedbackHeader = feedbackCsv.split('\n')[0];
  assert.doesNotMatch(feedbackHeader, /draw_mode,navigation,analysis,tam,overall,adoption_likelihood,tam_pu_avg/);
  assert.match(feedbackHeader, /It was easy to create constructs in the canvas\./);
  assert.match(feedbackHeader, /Which part of the draw mode was easiest to figure out\?/);
  assert.match(feedbackHeader, /"The main action button, such as Calculate, was easy to find\."/);
  assert.match(feedbackHeader, /Which feature worked best for you\?/);
  assert.match(feedbackHeader, /Metis would improve the way I run PLS-SEM analysis\./);
  assert.match(feedbackHeader, /"Once the major issues are fixed, I would use Metis for my own work\."/);
  assert.match(feedbackHeader, /"After your testing experience, how likely are you to use Metis when the reported issues are fixed\?"/);
  assert.match(feedbackHeader, /What feature would make Metis more valuable to you\?/);
  assert.match(feedbackCsv, /"Beta Tester","tester@example.com","Windows 11"/);
  assert.match(feedbackCsv, /"4"(?:,""){9},"Draw mode was simple\."/);
  assert.match(feedbackCsv, /"5"(?:,""){6},"The navigation labels were clear\."/);
  assert.match(feedbackCsv, /"5"(?:,""){8},"PLS output worked best\.","PLSpredict output format\.","SmartPLS matched within 0\.01\.","Freeze after Calculate\."/);
  assert.match(feedbackCsv, /"5","4","5","4","3","4","4","3","5","5","4","5","4","5","4"/);
  assert.match(feedbackCsv, /"5","IPMA needs clearer labels\.","Comparison report","Beta Tester","I would use it\."/);
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
  assert.equal(store.state.signups[0].email_sent_by, 'ops');
});

test('POST /admin/signups/:token/send resends to an already sent signup', async (t) => {
  const token = 'd'.repeat(48);
  const sentEmails = [];
  const { baseUrl, store } = await startApp(t, {
    sendSignupEmail: async (signup) => {
      sentEmails.push(signup.email);
      return { status: 'sent', error: '', sentAt: '2026-04-17T09:00:00.000Z' };
    },
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Grace Hopper',
          email: 'grace@example.com',
          institution: 'Navy',
          country: 'US',
          role: 'Scientist',
          edition: 'bundle',
          created_at: '2026-04-16T18:00:00.000Z',
          updated_at: '2026-04-16T18:00:00.000Z',
          beta_visits: 1,
          last_beta_visit_at: '2026-04-16T18:30:00.000Z',
          email_status: 'sent',
          email_error: '',
          email_sent_at: '2026-04-16T19:00:00.000Z',
        },
      ],
    }),
  });

  const cookie = await login(baseUrl);
  const dashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie },
  });
  const html = await dashboard.text();
  assert.match(html, />Resend</i);
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
  assert.deepEqual(sentEmails, ['grace@example.com']);
  assert.equal(store.state.signups[0].email_status, 'sent');
  assert.equal(store.state.signups[0].email_error, '');
  assert.equal(store.state.signups[0].email_sent_at, '2026-04-17T09:00:00.000Z');
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
  assert.deepEqual(requests[0].body.bcc, ['hbessel.art@knust.edu.gh']);
  assert.equal(requests[0].body.reply_to, 'aaronakuteye@gmail.com');
  assert.match(requests[0].body.subject, /Metis beta testing/i);
  assert.match(requests[0].body.html, /https:\/\/metis\.emend\.it\.com\/beta\/eeee/);
  assert.match(requests[0].body.html, /Your Lite version is now ready for testing/);
  assert.doesNotMatch(requests[0].body.html, /<img\b/i);
  assert.doesNotMatch(requests[0].body.html, /cid:metis-logo/);
  assert.doesNotMatch(requests[0].body.html, /metis-logo-light-nav\.png/);
  assert.match(requests[0].body.text, /To submit your feedback, open Metis and click the Feedback tab/);
  assert.equal(Object.hasOwn(requests[0].body, 'attachments'), false);
  assert.equal(store.state.signups[0].email_status, 'sent');
});

test('POST /admin/signups/:token/send fails fast when Resend HTTP hangs', async (t) => {
  const token = 'f'.repeat(48);
  const { baseUrl, store } = await startApp(t, {
    config: {
      emailSendTimeoutMs: 5,
      resendApiKey: 're_test_key',
      resendEndpoint: 'https://api.resend.test',
      smtpFromEmail: 'team@metis.emend.it.com',
      smtpFromName: 'metis Team',
    },
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        });
      }),
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Slow Mail',
          email: 'slow@example.com',
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
  assert.match(response.headers.get('location'), /Email%20failed/i);
  assert.equal(store.state.signups[0].email_status, 'failed');
  assert.equal(store.state.signups[0].email_error, 'Resend HTTP request timed out after 5ms.');
  assert.equal(store.state.signups[0].email_sent_at, '');
});

test('POST /admin/signups/send attempts selected pending and sent rows', async (t) => {
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
  assert.equal(response.headers.get('location'), '/admin?notice=0%20beta%20access%20emails%20sent%2C%202%20failed');
  assert.equal(store.state.signups[0].email_status, 'failed');
  assert.equal(store.state.signups[0].email_error, 'SMTP not configured.');
  assert.equal(store.state.signups[0].email_sent_at, '');
  assert.equal(store.state.signups[1].email_status, 'failed');
  assert.equal(store.state.signups[1].email_error, 'SMTP not configured.');
  assert.equal(store.state.signups[1].email_sent_at, '');
});

test('POST /admin/signups/send-all sends the support update to every signup without changing beta email status', async (t) => {
  const tokens = ['g'.repeat(48), 'h'.repeat(48)];
  const sent = [];
  const { baseUrl, store } = await startApp(t, {
    sendSignupEmail: async (signup, templateKey) => {
      sent.push([signup.email, templateKey]);
      return { status: 'sent', error: '', sentAt: '2026-05-14T09:30:00.000Z' };
    },
    store: createMemoryStore({
      signups: [
        {
          token: tokens[0],
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'lite',
          created_at: '2026-05-13T10:00:00.000Z',
          updated_at: '2026-05-13T10:00:00.000Z',
          beta_visits: 0,
          last_beta_visit_at: '',
          email_status: 'pending',
          email_error: '',
          email_sent_at: '',
        },
        {
          token: tokens[1],
          name: 'Grace Hopper',
          email: 'grace@example.com',
          institution: 'Navy',
          country: 'US',
          role: 'Scientist',
          edition: 'bundle',
          created_at: '2026-05-13T11:00:00.000Z',
          updated_at: '2026-05-13T11:00:00.000Z',
          beta_visits: 4,
          last_beta_visit_at: '2026-05-14T08:00:00.000Z',
          email_status: 'sent',
          email_error: '',
          email_sent_at: '2026-05-13T12:00:00.000Z',
        },
      ],
    }),
  });

  const cookie = await login(baseUrl);
  const dashboard = await fetch(`${baseUrl}/admin`, {
    headers: { cookie },
  });
  const html = await dashboard.text();
  const csrfToken = extractCsrfToken(html, '/admin/signups/send-all');

  const response = await fetch(`${baseUrl}/admin/signups/send-all`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams({
      csrfToken,
      template: 'support-update',
    }),
    redirect: 'manual',
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin?notice=2%20support%20updates%20sent');
  assert.deepEqual(sent, [
    ['ada@example.com', 'support-update'],
    ['grace@example.com', 'support-update'],
  ]);
  assert.equal(store.state.signups[0].email_status, 'pending');
  assert.equal(store.state.signups[1].email_status, 'sent');
  assert.equal(store.state.signups[0].email_sent_by, 'ops');
  assert.equal(store.state.signups[1].email_sent_by, 'ops');
});

test('POST /admin/signups/send-all rejects untrusted hosted admin origins', async (t) => {
  const token = 'i'.repeat(48);
  const { baseUrl, store } = await startApp(t, {
    store: createMemoryStore({
      signups: [
        {
          token,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          institution: 'KNUST',
          country: 'Ghana',
          role: 'Researcher',
          edition: 'lite',
          created_at: '2026-05-13T10:00:00.000Z',
          updated_at: '2026-05-13T10:00:00.000Z',
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
  const csrfToken = extractCsrfToken(html, '/admin/signups/send-all');

  const response = await fetch(`${baseUrl}/admin/signups/send-all`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie,
      origin: 'https://evil.example.com',
    },
    body: new URLSearchParams({
      csrfToken,
      template: 'support-update',
    }),
    redirect: 'manual',
  });

  assert.equal(response.status, 403);
  assert.equal(store.state.signups[0].email_status, 'pending');
});

test('POST /admin/signups/send-all rate limits repeated all-user email blasts', async (t) => {
  const token = 'j'.repeat(48);
  const sent = [];
  const { baseUrl } = await startApp(t, {
    sendSignupEmail: async (signup, templateKey) => {
      sent.push([signup.email, templateKey]);
      return { status: 'sent', error: '', sentAt: '2026-05-14T09:30:00.000Z' };
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
          edition: 'lite',
          created_at: '2026-05-13T10:00:00.000Z',
          updated_at: '2026-05-13T10:00:00.000Z',
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
  const csrfToken = extractCsrfToken(html, '/admin/signups/send-all');
  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
    cookie,
    origin: 'https://metis.emend.it.com',
    'x-forwarded-for': '203.0.113.99',
  };
  const body = new URLSearchParams({
    csrfToken,
    template: 'support-update',
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl}/admin/signups/send-all`, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
    });
    assert.equal(response.status, 302);
  }

  const limited = await fetch(`${baseUrl}/admin/signups/send-all`, {
    method: 'POST',
    headers,
    body,
    redirect: 'manual',
  });

  assert.equal(limited.status, 429);
  assert.equal(sent.length, 2);
});
