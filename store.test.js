const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdminSupabaseClient } = require('./lib/supabase');
const {
  createStore,
  normalizeEmailStatus,
  summarizeDonations,
  summarizeInstitutionRows,
  summarizeSignups,
} = require('./lib/store');

class QueryRecorder {
  constructor(table) {
    this.table = table;
    this.steps = [];
  }

  select(columns) {
    this.steps.push({ method: 'select', args: [columns] });
    return this;
  }

  insert(payload) {
    this.steps.push({ method: 'insert', args: [payload] });
    return this;
  }

  update(payload) {
    this.steps.push({ method: 'update', args: [payload] });
    return this;
  }

  delete() {
    this.steps.push({ method: 'delete', args: [] });
    return this;
  }

  eq(column, value) {
    this.steps.push({ method: 'eq', args: [column, value] });
    return this;
  }

  order(column, options) {
    this.steps.push({ method: 'order', args: [column, options] });
    return this;
  }

  limit(value) {
    this.steps.push({ method: 'limit', args: [value] });
    return this;
  }

  single() {
    this.steps.push({ method: 'single', args: [] });
    return this;
  }

  maybeSingle() {
    this.steps.push({ method: 'maybeSingle', args: [] });
    return this;
  }

  not(column, operator, value) {
    this.steps.push({ method: 'not', args: [column, operator, value] });
    return this;
  }
}

test('createAdminSupabaseClient uses secret key and schema with safe auth settings', () => {
  const calls = [];
  const fakeClient = { kind: 'supabase-admin-client' };
  const config = {
    supabase: {
      url: 'https://project.supabase.co',
      secretKey: 'secret-key',
      schema: 'wytham',
    },
  };

  const client = createAdminSupabaseClient(config, {
    createClient(url, key, options) {
      calls.push({ url, key, options });
      return fakeClient;
    },
  });

  assert.equal(client, fakeClient);
  assert.deepEqual(calls, [
    {
      url: 'https://project.supabase.co',
      key: 'secret-key',
      options: {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        db: {
          schema: 'wytham',
        },
      },
    },
  ]);
});

test('createAdminSupabaseClient throws when required backend Supabase env values are missing', () => {
  assert.throws(
    () => createAdminSupabaseClient({ supabase: { url: '', secretKey: '', schema: 'public' } }, { createClient() {} }),
    /Missing Supabase admin configuration/i
  );
});

test('createStore shapes signup and admin queries around the supplied client', () => {
  const queries = [];
  const client = {
    from(table) {
      const query = new QueryRecorder(table);
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);

  const signup = {
    token: 'signup-token',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    institution: 'Analytical Engine Institute',
    country: 'UK',
    role: 'Researcher',
    edition: 'bundle',
    source_page: '/index.html',
    source_title: 'Landing',
    ip_address: '127.0.0.1',
    user_agent: 'node-test',
    created_at: '2026-04-16T12:00:00.000Z',
    updated_at: '2026-04-16T12:00:00.000Z',
  };

  store.insertSignup(signup);
  store.updateSignupByEmail('ada@example.com', {
    role: 'Lead Researcher',
    updated_at: '2026-04-16T12:30:00.000Z',
  });
  store.markSignupEmailStatus('signup-token', {
    status: 'failed',
    error: 'Mailbox unavailable',
    sentAt: '',
  });
  store.listRecentSignups(25);
  store.findSignupByEmail('ada@example.com');
  store.findSignupByToken('signup-token');
  store.markSignupVisit('signup-token', {
    betaVisits: 3,
    visitedAt: '2026-04-16T13:00:00.000Z',
  });
  store.listInstitutionRows(100);

  assert.equal(queries[0].table, 'signups');
  assert.deepEqual(queries[0].steps, [
    { method: 'insert', args: [signup] },
    { method: 'select', args: ['*'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[1].table, 'signups');
  assert.deepEqual(queries[1].steps, [
    { method: 'update', args: [{ role: 'Lead Researcher', updated_at: '2026-04-16T12:30:00.000Z' }] },
    { method: 'eq', args: ['email', 'ada@example.com'] },
    { method: 'select', args: ['*'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[2].table, 'signups');
  assert.deepEqual(queries[2].steps, [
    {
      method: 'update',
      args: [{ email_status: 'failed', email_error: 'Mailbox unavailable', email_sent_at: null }],
    },
    { method: 'eq', args: ['token', 'signup-token'] },
    { method: 'select', args: ['token,email_status,email_error,email_sent_at'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[3].table, 'signups');
  assert.deepEqual(queries[3].steps, [
    {
      method: 'select',
      args: ['token,name,email,institution,country,role,edition,created_at,email_status,beta_visits,last_beta_visit_at'],
    },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [25] },
  ]);

  assert.equal(queries[4].table, 'signups');
  assert.deepEqual(queries[4].steps, [
    { method: 'select', args: ['*'] },
    { method: 'eq', args: ['email', 'ada@example.com'] },
    { method: 'maybeSingle', args: [] },
  ]);

  assert.equal(queries[5].table, 'signups');
  assert.deepEqual(queries[5].steps, [
    { method: 'select', args: ['*'] },
    { method: 'eq', args: ['token', 'signup-token'] },
    { method: 'maybeSingle', args: [] },
  ]);

  assert.equal(queries[6].table, 'signups');
  assert.deepEqual(queries[6].steps, [
    {
      method: 'update',
      args: [{ beta_visits: 3, last_beta_visit_at: '2026-04-16T13:00:00.000Z' }],
    },
    { method: 'eq', args: ['token', 'signup-token'] },
    { method: 'select', args: ['token,beta_visits,last_beta_visit_at'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[7].table, 'signups');
  assert.deepEqual(queries[7].steps, [
    { method: 'select', args: ['institution'] },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [100] },
  ]);
});

test('summary helpers preserve the current admin dashboard metrics', () => {
  const signupSummary = summarizeSignups([
    { edition: 'lite', beta_visits: 2 },
    { edition: 'bundle', beta_visits: 0 },
    { edition: 'bundle', beta_visits: 4 },
  ]);
  const donationSummary = summarizeDonations([
    { email: 'ada@example.com', country: 'UK', amount: '25' },
    { email: 'grace@example.com', country: 'US', amount: '' },
    { email: 'ada@example.com', country: 'UK', amount: '40' },
  ]);

  assert.deepEqual(signupSummary, {
    total: 3,
    lite_count: 1,
    bundle_count: 2,
    opened_count: 2,
    total_beta_visits: 6,
  });
  assert.deepEqual(donationSummary, {
    total: 3,
    unique_donors: 2,
    countries: 2,
    amount_entries: 2,
  });
  assert.deepEqual(
    summarizeInstitutionRows([
      { institution: 'KNUST' },
      { institution: 'MIT' },
      { institution: 'KNUST' },
      { institution: ' ' },
      { institution: 'MIT' },
      { institution: 'KNUST' },
    ]),
    [
      { institution: 'KNUST', total: 3 },
      { institution: 'MIT', total: 2 },
    ]
  );
});

test('normalizeEmailStatus keeps the manual workflow statuses canonical', () => {
  assert.equal(normalizeEmailStatus('sent'), 'sent');
  assert.equal(normalizeEmailStatus('FAILED'), 'failed');
  assert.equal(normalizeEmailStatus('unknown'), 'pending');
  assert.equal(normalizeEmailStatus(''), 'pending');
});
