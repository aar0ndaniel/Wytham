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
    last_beta_visit_at: '',
    email_sent_at: '',
  };

  store.insertSignup(signup);
  store.updateSignupByEmail('ada@example.com', {
    role: 'Lead Researcher',
    updated_at: '2026-04-16T12:30:00.000Z',
    email_sent_at: '',
  });
  store.markSignupEmailStatus('signup-token', {
    status: 'failed',
    error: 'Mailbox unavailable',
    sentAt: '',
    sentBy: 'ops',
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
    { method: 'insert', args: [{ ...signup, last_beta_visit_at: null, email_sent_at: null }] },
    { method: 'select', args: ['*'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[1].table, 'signups');
  assert.deepEqual(queries[1].steps, [
    { method: 'update', args: [{ role: 'Lead Researcher', updated_at: '2026-04-16T12:30:00.000Z', email_sent_at: null }] },
    { method: 'eq', args: ['email', 'ada@example.com'] },
    { method: 'select', args: ['*'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[2].table, 'signups');
  assert.deepEqual(queries[2].steps, [
    {
      method: 'update',
      args: [{ email_status: 'failed', email_error: 'Mailbox unavailable', email_sent_at: null, email_sent_by: 'ops' }],
    },
    { method: 'eq', args: ['token', 'signup-token'] },
    { method: 'select', args: ['token,email_status,email_error,email_sent_at,email_sent_by'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[3].table, 'signups');
  assert.deepEqual(queries[3].steps, [
    {
      method: 'select',
      args: ['token,name,email,institution,country,role,edition,created_at,updated_at,email_status,email_sent_by,beta_visits,last_beta_visit_at'],
    },
    { method: 'order', args: ['updated_at', { ascending: false }] },
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

test('createStore keeps comment writes limited to public wall fields', () => {
  const queries = [];
  const client = {
    from(table) {
      const query = new QueryRecorder(table);
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);

  store.insertComment({
    name: 'Ada',
    body: 'A careful public note.',
    ip_address: '203.0.113.8',
    user_agent: 'node-test',
    created_at: '2026-05-02T12:00:00.000Z',
  });
  store.listRecentComments(12);

  assert.equal(queries[0].table, 'comments');
  assert.deepEqual(queries[0].steps, [
    {
      method: 'insert',
      args: [{ name: 'Ada', body: 'A careful public note.', created_at: '2026-05-02T12:00:00.000Z' }],
    },
    { method: 'select', args: ['id,name,body,created_at'] },
    { method: 'single', args: [] },
  ]);

  assert.equal(queries[1].table, 'comments');
  assert.deepEqual(queries[1].steps, [
    { method: 'select', args: ['id,name,body,created_at'] },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [12] },
  ]);
});

test('createStore supports beta feedback intake and admin review queries', () => {
  const queries = [];
  const client = {
    from(table) {
      const query = new QueryRecorder(table);
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);
  const feedback = {
    name: 'Beta Tester',
    email: 'tester@example.com',
    windows_version: 'Windows 11',
    ram: '16 GB',
    app_version: '0.1.7',
    dataset_type: 'Survey data',
    sample_size: '250',
    num_constructs: '5',
    num_indicators: '24',
    features_tested: ['PLS-SEM analysis'],
    draw_mode: { q1: 4 },
    navigation: { q1: 5 },
    analysis: { bugs: 'Freeze after Calculate' },
    tam: { pu1: 5 },
    overall: { needs_improvement: 'Stability' },
    screenshot_url: '',
    privacy_policy_version: '1.0',
    privacy_accepted_at: '2026-05-04T10:00:00.000Z',
    created_at: '2026-05-04T10:00:00.000Z',
  };

  store.insertFeedback(feedback);
  store.listRecentFeedback(20);
  store.listFeedbackSummaryRows(200);

  assert.equal(queries[0].table, 'feedback');
  assert.deepEqual(queries[0].steps, [
    { method: 'insert', args: [feedback] },
    { method: 'select', args: ['*'] },
    { method: 'single', args: [] },
  ]);
  assert.equal(queries[1].table, 'feedback');
  assert.equal(queries[1].steps[0].method, 'select');
  assert.match(queries[1].steps[0].args[0], /features_tested/);
  assert.deepEqual(queries[1].steps.slice(1), [
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [20] },
  ]);
  assert.equal(queries[2].table, 'feedback');
  assert.deepEqual(queries[2].steps, [
    { method: 'select', args: ['email,created_at'] },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [200] },
  ]);
});

test('createStore exposes CSV export queries for each admin panel', () => {
  const queries = [];
  const client = {
    from(table) {
      const query = new QueryRecorder(table);
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);

  store.listSignupsForExport(10);
  store.listDonationsForExport(20);
  store.listFeedbackForExport(30);

  assert.equal(queries[0].table, 'signups');
  assert.deepEqual(queries[0].steps, [
    { method: 'select', args: ['name,email,institution,country,role,edition,created_at,email_status,email_sent_by,beta_visits'] },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [10] },
  ]);
  assert.equal(queries[1].table, 'donations');
  assert.deepEqual(queries[1].steps, [
    { method: 'select', args: ['name,email,country,amount,message,created_at'] },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [20] },
  ]);
  assert.equal(queries[2].table, 'feedback');
  assert.deepEqual(queries[2].steps, [
    {
      method: 'select',
      args: ['id,name,email,windows_version,ram,app_version,dataset_type,sample_size,num_constructs,num_indicators,features_tested,draw_mode,navigation,analysis,tam,overall,screenshot_url,privacy_policy_version,privacy_accepted_at,source_page,source_title,created_at'],
    },
    { method: 'order', args: ['created_at', { ascending: false }] },
    { method: 'limit', args: [30] },
  ]);
});

test('createStore falls back when deployed Supabase is missing email_sent_by migration', async () => {
  const queries = [];
  const missingColumn = {
    code: '42703',
    message: 'column signups.email_sent_by does not exist',
  };
  const results = [
    { data: null, error: missingColumn },
    {
      data: [
        {
          token: 'signup-token',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          email_status: 'sent',
        },
      ],
      error: null,
    },
  ];
  class PromiseQuery extends QueryRecorder {
    then(resolve, reject) {
      return Promise.resolve(results.shift()).then(resolve, reject);
    }
  }
  const client = {
    from(table) {
      const query = new PromiseQuery(table);
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);

  const result = await store.listRecentSignups(25);

  assert.equal(result.error, null);
  assert.deepEqual(result.data, [
    {
      token: 'signup-token',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      email_status: 'sent',
      email_sent_by: '',
    },
  ]);
  assert.deepEqual(queries.map((query) => query.steps[0]), [
    {
      method: 'select',
      args: ['token,name,email,institution,country,role,edition,created_at,updated_at,email_status,email_sent_by,beta_visits,last_beta_visit_at'],
    },
    {
      method: 'select',
      args: ['token,name,email,institution,country,role,edition,created_at,updated_at,email_status,beta_visits,last_beta_visit_at'],
    },
  ]);
});

test('createStore treats PostgREST schema cache miss for email_sent_by as missing migration', async () => {
  const queries = [];
  const cacheMiss = {
    code: 'PGRST204',
    message: "Could not find the 'email_sent_by' column of 'signups' in the schema cache",
  };
  const results = [
    { data: null, error: cacheMiss },
    { data: [{ token: 'signup-token', email_status: 'sent' }], error: null },
  ];
  class PromiseQuery extends QueryRecorder {
    then(resolve, reject) {
      return Promise.resolve(results.shift()).then(resolve, reject);
    }
  }
  const client = {
    from() {
      const query = new PromiseQuery();
      queries.push(query);
      return query;
    },
  };
  const store = createStore(client);

  const result = await store.listRecentSignups(10);

  assert.equal(result.error, null);
  assert.equal(result.data[0].email_sent_by, '');
  assert.equal(queries.length, 2);
});

test('createStore ignores email_sent_by update when migration is not applied yet', async () => {
  const missingColumn = {
    code: '42703',
    message: 'column signups.email_sent_by does not exist',
  };
  class PromiseQuery extends QueryRecorder {
    then(resolve, reject) {
      return Promise.resolve({ data: null, error: missingColumn }).then(resolve, reject);
    }
  }
  const client = {
    from(table) {
      return new PromiseQuery(table);
    },
  };
  const store = createStore(client);

  const result = await store.markSignupEmailSender('signup-token', 'ops');

  assert.deepEqual(result, {
    data: { token: 'signup-token', email_sent_by: '' },
    error: null,
  });
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
