const assert = require('node:assert/strict');
const { renderAdminLoginPage, renderAdminPage } = require('./server.js');

function run() {
  const loginHtml = renderAdminLoginPage();
  assert.match(loginHtml, /metis/i);
  assert.doesNotMatch(loginHtml, /Semora admin/i);
  assert.match(loginHtml, /Sign in/i);
  assert.match(loginHtml, /Protected route only/i);
  assert.doesNotMatch(loginHtml, /Beta Control|Protected access to beta signups/i);

  const dashboardHtml = renderAdminPage(
    {
      total: 12,
      lite_count: 5,
      bundle_count: 7,
      opened_count: 8,
      total_beta_visits: 13,
    },
    {
      total: 2,
      unique_donors: 2,
      countries: 2,
      amount_entries: 1,
    },
    [
      {
        token: 'a'.repeat(48),
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        institution: 'KNUST',
        edition: 'bundle',
        email_status: 'pending',
        beta_visits: 2,
        last_beta_visit_at: '2026-04-12T10:00:00.000Z',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        token: 'b'.repeat(48),
        name: 'Grace Hopper',
        email: 'grace@example.com',
        institution: 'Navy',
        edition: 'lite',
        email_status: 'sent',
        beta_visits: 1,
        last_beta_visit_at: '2026-04-13T10:00:00.000Z',
        created_at: '2026-04-09T10:00:00.000Z',
      },
    ],
    [
      {
        name: 'Ada Lovelace',
        email: 'ada+donor@example.com',
        country: 'Ghana',
        amount: '$25',
        message: 'Happy to support.',
        created_at: '2026-04-11T10:00:00.000Z',
      },
    ],
    [{ institution: 'KNUST', total: 3 }],
    [
      { day: '2026-04-11', total: 2, lite_count: 1, bundle_count: 1 },
      { day: '2026-04-12', total: 3, lite_count: 1, bundle_count: 2 },
      { day: '2026-04-13', total: 1, lite_count: 0, bundle_count: 1 },
    ],
    'Saved'
  );

  assert.match(dashboardHtml, /metis admin/i);
  assert.match(dashboardHtml, />Signups</);
  assert.match(dashboardHtml, />Donations</);
  assert.match(dashboardHtml, />Account</);
  assert.doesNotMatch(dashboardHtml, /Semora/i);
  assert.match(dashboardHtml, /A quieter view of signups, support notes, and export/i);
  assert.doesNotMatch(dashboardHtml, /var\(--blue|var\(--warm|Beta dashboard/i);
  assert.doesNotMatch(dashboardHtml, /This account panel stays intentionally small|Protected admin route|Protected destructive actions|Session controls|Wrap up cleanly|Use logout when you are done/i);
  assert.match(dashboardHtml, /Send selected/i);
  assert.match(dashboardHtml, /action="\/admin\/signups\/a{48}\/send"/i);
  assert.doesNotMatch(dashboardHtml, /action="\/admin\/signups\/b{48}\/send"/i);
  assert.match(dashboardHtml, /Already sent/i);
  console.log('admin-ui.test.js: PASS');
}

try {
  run();
} catch (error) {
  console.error('admin-ui.test.js: FAIL');
  console.error(error.stack || error);
  process.exitCode = 1;
}
