const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    'Saved',
    {
      feedbackCounts: { total: 1, unique_testers: 1 },
      feedbackList: [
        {
          app_version: '0.1.7',
          analysis: {
            best_feature: 'PLS output',
            bugs: 'The app freezes after Calculate.',
            confusing_feature: 'Bootstrapping labels',
          },
          created_at: '2026-04-14T10:00:00.000Z',
          email: 'kwame@example.com',
          features_tested: ['PLS-SEM analysis'],
          name: 'Kwame',
          overall: {
            adoption_likelihood: 5,
            final_note: 'I would use it after export polish.',
            most_valuable_feature: 'Clear comparison table',
            needs_improvement: 'Stability',
          },
          screenshot_url: '',
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
    }
  );

  assert.match(dashboardHtml, /metis admin/i);
  assert.match(dashboardHtml, />Signups</);
  assert.match(dashboardHtml, />Donations</);
  assert.match(dashboardHtml, />Feedback</);
  assert.match(dashboardHtml, />Account</);
  assert.doesNotMatch(dashboardHtml, />Wall</);
  assert.doesNotMatch(dashboardHtml, /Semora/i);
  assert.match(dashboardHtml, /A quieter view of signups, support notes, and export/i);
  assert.doesNotMatch(dashboardHtml, /var\(--blue|var\(--warm|Beta dashboard/i);
  assert.doesNotMatch(dashboardHtml, /This account panel stays intentionally small|Protected admin route|Protected destructive actions|Session controls|Wrap up cleanly|Use logout when you are done/i);
  assert.match(dashboardHtml, /Send \/ resend selected/i);
  assert.match(dashboardHtml, /action="\/admin\/signups\/a{48}\/send"/i);
  assert.match(dashboardHtml, /action="\/admin\/signups\/b{48}\/send"/i);
  assert.match(dashboardHtml, />Resend</i);
  assert.match(dashboardHtml, />Sent</i);
  assert.match(dashboardHtml, /Beta feedback/i);
  assert.match(dashboardHtml, /Kwame/i);
  assert.match(dashboardHtml, /The app freezes after Calculate/i);
  assert.match(dashboardHtml, /Metis would improve the way I run PLS-SEM analysis\./i);
  assert.match(dashboardHtml, /Metis would make it easier for me to conduct PLS-SEM-related research\./i);
  assert.match(dashboardHtml, /Learning to use Metis would be easy for me\./i);
  assert.match(dashboardHtml, /Once the major issues are fixed, I would use Metis for my own work\./i);
  assert.match(dashboardHtml, /After your testing experience, how likely are you to use Metis when the reported issues are fixed\?/i);
  assert.match(dashboardHtml, /What feature would make Metis more valuable to you\?/i);
  assert.match(dashboardHtml, /Clear comparison table/i);
  assert.match(dashboardHtml, /I would use it after export polish/i);
  assert.doesNotMatch(dashboardHtml, /Adoption \/ TAM/i);
  assert.doesNotMatch(dashboardHtml, /Use intent and TAM/i);
  assert.doesNotMatch(dashboardHtml, /\s\|\s/);
  assert.match(dashboardHtml, /href="\/admin\/export\/signups\.csv"[^>]*data-export-link/i);
  assert.match(dashboardHtml, /data-export-href="\/admin\/export\/donations\.csv"/i);
  assert.match(dashboardHtml, /data-export-href="\/admin\/export\/feedback\.csv"/i);

  const adminScript = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
  assert.match(adminScript, /data-export-link/);
  assert.match(adminScript, /data-export-href/);
  console.log('admin-ui.test.js: PASS');
}

try {
  run();
} catch (error) {
  console.error('admin-ui.test.js: FAIL');
  console.error(error.stack || error);
  process.exitCode = 1;
}
