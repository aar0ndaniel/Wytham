# Wytham Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin login and admin dashboard so they match the approved Wytham brand direction and minimal left-sidebar layout before the Railway deployment work.

**Architecture:** Keep the admin as server-rendered HTML generated from `backend/server.js`, with the existing `backend/admin.js` panel switching behavior preserved where useful. Add one integration-style HTML test that boots the backend on local ports, verifies the new login and dashboard strings/structure, then update the embedded admin templates and related copy until the test passes.

**Tech Stack:** Node.js, Express, server-rendered HTML/CSS, built-in `node:test`, built-in `fetch`

---

### Task 1: Add an Admin UI Regression Test

**Files:**
- Create: `backend/admin-ui.test.js`
- Modify: `backend/package.json`
- Test: `backend/admin-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('admin login and dashboard use the Wytham admin language', async () => {
  assert.match('', /Wytham admin/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test admin-ui.test.js`
Expected: FAIL because the current admin still renders `Semora` language and the test expectation is not satisfied.

- [ ] **Step 3: Replace the placeholder test with a real boot-and-fetch integration test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function freePort(seed) {
  return 41000 + Math.floor(Math.random() * 1000) + seed;
}

async function bootServer() {
  const port = freePort(0);
  const adminPort = freePort(2000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      ADMIN_HOST: '127.0.0.1',
      PORT: String(port),
      ADMIN_PORT: String(adminPort),
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'secret-pass',
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  for (let i = 0; i < 40; i += 1) {
    if (output.includes(`http://127.0.0.1:${adminPort}/admin`)) {
      return { child, port, adminPort };
    }
    await delay(250);
  }

  child.kill('SIGTERM');
  throw new Error(`Server did not start.\n${output}`);
}

async function stopServer(child) {
  child.kill('SIGTERM');
  await delay(300);
}

test('admin login and dashboard use the Wytham admin language', async () => {
  const { child, adminPort } = await bootServer();

  try {
    const loginRes = await fetch(`http://127.0.0.1:${adminPort}/admin/login`);
    const loginHtml = await loginRes.text();

    assert.equal(loginRes.status, 200);
    assert.match(loginHtml, /Wytham/i);
    assert.doesNotMatch(loginHtml, /Semora admin/i);

    const loginPost = await fetch(`http://127.0.0.1:${adminPort}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'admin', password: 'secret-pass' }),
      redirect: 'manual',
    });

    const cookie = loginPost.headers.get('set-cookie');
    assert.equal(loginPost.status, 302);
    assert.ok(cookie);

    const dashboardRes = await fetch(`http://127.0.0.1:${adminPort}/admin`, {
      headers: { cookie },
    });
    const dashboardHtml = await dashboardRes.text();

    assert.equal(dashboardRes.status, 200);
    assert.match(dashboardHtml, /Wytham admin/i);
    assert.match(dashboardHtml, />Signups</);
    assert.match(dashboardHtml, />Donations</);
    assert.match(dashboardHtml, />Account</);
    assert.doesNotMatch(dashboardHtml, /Semora/i);
  } finally {
    await stopServer(child);
  }
});
```

- [ ] **Step 4: Add a simple test command**

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js",
    "test": "node --test admin-ui.test.js"
  }
}
```

- [ ] **Step 5: Run the test again to confirm it still fails for the right reason**

Run: `cd backend && npm test`
Expected: FAIL because the current HTML still contains the old `Semora` branding and the dashboard still uses the old compact icon rail instead of the approved Wytham language.

### Task 2: Rebuild the Login Template

**Files:**
- Modify: `backend/server.js`
- Test: `backend/admin-ui.test.js`

- [ ] **Step 1: Replace the old login copy and structure in `renderAdminLoginPage()`**

```js
<body>
  <div class="login-scene" aria-hidden="true">
    <div class="light-beam"></div>
    <div class="light-orb"></div>
  </div>
  <main class="login-shell">
    <section class="login-panel">
      <div class="login-mark">
        <img src="/admin/logo" alt="Wytham logo" />
      </div>
      <h1 class="login-title">Sign in</h1>
      <p class="login-copy">Access the Wytham admin.</p>
      ${errorBlock}
      <form method="post" action="/admin/login" novalidate>
        ...
      </form>
    </section>
  </main>
</body>
```

- [ ] **Step 2: Replace the old neon admin palette with the Wytham dark palette**

```css
:root {
  --bg: #181818;
  --text: #F5F1E7;
  --muted: #C8C1AE;
  --moss: #87976B;
  --moss-soft: rgba(135,151,107,.18);
  --gold: #C6A24B;
  --gold-strong: #D3B85F;
  --line: rgba(245,241,231,.10);
  --glass: rgba(255,255,255,.05);
}
```

- [ ] **Step 3: Give the login panel the approved image-inspired glass treatment**

```css
.login-shell {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px;
}

.login-panel {
  width: min(100%, 380px);
  padding: 32px 28px;
  border-radius: 28px;
  border: 1px solid rgba(245,241,231,.10);
  background:
    linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.05)),
    rgba(20,20,20,.72);
  backdrop-filter: blur(20px);
  box-shadow: 0 24px 60px rgba(0,0,0,.42);
}
```

- [ ] **Step 4: Keep the form minimal and well-spaced**

```css
.field {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.field input {
  min-height: 46px;
  padding: 0 14px;
  border-radius: 14px;
}

.submit-btn {
  min-height: 46px;
  margin-top: 20px;
  border-radius: 999px;
}
```

- [ ] **Step 5: Run the integration test**

Run: `cd backend && npm test`
Expected: Still FAIL, but now only on the dashboard assertions.

### Task 3: Rebuild the Dashboard and Account Views

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/admin.js`
- Test: `backend/admin-ui.test.js`

- [ ] **Step 1: Replace the admin shell with a true left-sidebar layout**

```js
<body>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="sidebar-brand">
        <img src="/admin/logo" alt="Wytham logo" />
        <div>
          <div class="sidebar-brand-name">Wytham</div>
          <div class="sidebar-brand-tag">Admin</div>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="Admin navigation">
        <button type="button" class="nav-btn is-active" data-panel-target="signups-panel">...</button>
        <button type="button" class="nav-btn" data-panel-target="donations-panel">...</button>
        <button type="button" class="nav-btn" data-panel-target="account-panel">...</button>
      </nav>

      <div class="sidebar-tools">
        <a class="nav-link" href="/admin/export.csv">Export CSV</a>
        <a class="nav-link" href="/admin/preview/email">Email preview</a>
      </div>
    </aside>

    <main class="admin-main">...</main>
  </div>
</body>
```

- [ ] **Step 2: Replace the current heavy sections with the minimal Wytham spacing system**

```css
.admin-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  background: #181818;
  color: #F5F1E7;
}

.admin-sidebar {
  padding: 28px 20px;
  border-right: 1px solid rgba(245,241,231,.08);
}

.admin-main {
  padding: 28px 32px 40px;
}
```

- [ ] **Step 3: Replace the large card grid with one compact metrics strip and the main signups table**

```js
<section id="signups-panel" class="panel is-active" data-panel>
  <header class="page-head">...</header>
  <div class="metric-strip">
    <div class="metric-item">...</div>
    <div class="metric-item">...</div>
    <div class="metric-item">...</div>
    <div class="metric-item">...</div>
  </div>
  <section class="table-section">...</section>
</section>
```

- [ ] **Step 4: Keep the donations and account screens lighter than signups**

```js
<section id="donations-panel" class="panel" data-panel>
  <header class="page-head">...</header>
  <section class="table-section">...</section>
</section>

<section id="account-panel" class="panel" data-panel>
  <section class="settings-group">...</section>
</section>
```

- [ ] **Step 5: Remove remaining `Semora` labels from the admin flow**

```js
<title>Wytham Admin</title>
<div class="sidebar-brand-name">Wytham</div>
<div class="sidebar-brand-tag">Admin</div>
```

- [ ] **Step 6: Update `backend/admin.js` only if the new sidebar or selection controls need matching selectors**

```js
const buttons = Array.from(document.querySelectorAll('[data-panel-target]'));
const panels = Array.from(document.querySelectorAll('[data-panel]'));
```

- [ ] **Step 7: Run the integration test**

Run: `cd backend && npm test`
Expected: PASS

### Task 4: Verify the Implementation

**Files:**
- Verify: `backend/server.js`
- Verify: `backend/admin.js`
- Verify: `backend/admin-ui.test.js`
- Verify: `backend/package.json`

- [ ] **Step 1: Run the integration test suite**

Run: `cd backend && npm test`
Expected: PASS with 1 passing test and 0 failures

- [ ] **Step 2: Run a syntax check on the backend**

Run: `cd backend && node --check server.js`
Expected: no output, exit code 0

- [ ] **Step 3: Review the changed strings and layout hooks**

Run: `rg -n "Semora|Wytham admin|Sign in|Signups|Donations|Account" backend/server.js backend/admin-ui.test.js`
Expected: the main admin flow uses `Wytham`, and any remaining `Semora` strings are limited to untouched legacy areas outside the redesigned admin flow

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-13-wytham-admin-redesign.md backend/package.json backend/admin-ui.test.js backend/server.js backend/admin.js
git commit -m "feat: redesign the Wytham admin UI"
```
