const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

test('comment form is registered for Turnstile rendering and submit states', () => {
  assert.match(script, /commentForm:\s*\{\s*btnId:\s*'commentBtn',\s*containerId:\s*'commentTurnstile',\s*msgId:\s*'commentMsg'/);
  assert.match(script, /commentBtn:\s*\{[\s\S]*?idle:\s*'pin to the wall'/);
});
