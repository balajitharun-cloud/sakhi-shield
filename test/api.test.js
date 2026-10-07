'use strict';

/**
 * End-to-end API test. Starts the Express app on an ephemeral port against a
 * throwaway SQLite file and exercises every route, including failure cases.
 *   node test/api.test.js
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

const tmpDb = path.join(os.tmpdir(), 'sakhi-test-' + Date.now() + '.sqlite');
process.env.DB_PATH = tmpDb;
process.env.JWT_SECRET = 'test-secret';

const app = require('../server/index.js');

let passed = 0, failed = 0;
function check(cond, label) {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label); }
}

async function main() {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Use Node's http module: global fetch (undici) is unreliable in this sandbox.
  const raw = (method, url, body, token) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* non-JSON */ }
        resolve({ status: res.statusCode, data: json, text });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

  const call = (method, p, body, token) => raw(method, base + p, body, token);

  try {
    console.log('\nhealth');
    let r = await call('GET', '/api/health');
    check(r.status === 200 && r.data.ok === true, 'GET /api/health returns ok');
    check(r.data.channels && r.data.channels.email === false, 'reports email channel as not configured');

    console.log('\nauth');
    r = await call('POST', '/api/auth/register', { name: 'Tharun', email: 'T@Example.com', password: 'secret123' });
    check(r.status === 201 && !!r.data.token, 'register returns a token');
    check(r.data.user.email === 't@example.com', 'email is normalised to lowercase');
    check(r.data.user.password_hash === undefined, 'password hash is never returned');
    const token = r.data.token;

    r = await call('POST', '/api/auth/register', { name: 'Dup', email: 't@example.com', password: 'secret123' });
    check(r.status === 409, 'duplicate email is rejected (409)');

    r = await call('POST', '/api/auth/register', { name: 'Bad', email: 'not-an-email', password: 'secret123' });
    check(r.status === 400, 'invalid email is rejected (400)');

    r = await call('POST', '/api/auth/register', { name: 'Short', email: 'a@b.com', password: '123' });
    check(r.status === 400, 'short password is rejected (400)');

    r = await call('POST', '/api/auth/login', { email: 't@example.com', password: 'secret123' });
    check(r.status === 200 && !!r.data.token, 'login succeeds with correct password');

    r = await call('POST', '/api/auth/login', { email: 't@example.com', password: 'wrong' });
    check(r.status === 401, 'login fails with wrong password (401)');

    r = await call('GET', '/api/auth/me', null, token);
    check(r.status === 200 && r.data.user.name === 'Tharun', 'GET /api/auth/me returns the user');

    r = await call('GET', '/api/contacts');
    check(r.status === 401, 'protected route rejects a missing token (401)');

    console.log('\ncontacts');
    r = await call('POST', '/api/contacts', { name: 'Amma', phone: '+919000000000', email: 'amma@example.com' }, token);
    check(r.status === 201 && r.data.contact.id > 0, 'create contact with phone + email');
    const contactId = r.data.contact.id;

    r = await call('POST', '/api/contacts', { name: 'NoChannels' }, token);
    check(r.status === 400, 'contact with no phone/email is rejected');

    r = await call('GET', '/api/contacts', null, token);
    check(r.status === 200 && r.data.contacts.length === 1, 'list returns 1 contact');

    console.log('\nsos + live share');
    r = await call('POST', '/api/sos', { lat: 12.9716, lng: 77.5946, accuracy: 18, message: 'Test SOS' }, token);
    check(r.status === 201 && !!r.data.shareUrl, 'SOS creates an alert with a share URL');
    check(Array.isArray(r.data.notified) && r.data.notified.length === 2, 'notified one row per channel (email + sms)');
    check(r.data.notified.every(n => n.status === 'logged'), 'deliveries fall back to "logged" with no creds configured');
    const alert = r.data.alert;
    const shareToken = alert.shareToken;
    check(/^\/s\/[0-9a-f]{32}$/.test(new URL(r.data.shareUrl).pathname), 'share URL points at /s/<32 hex chars>');

    r = await call('POST', `/api/alerts/${alert.id}/location`, { lat: 12.9720, lng: 77.5950, accuracy: 12 }, token);
    check(r.status === 200, 'push a follow-up GPS point to the alert');

    r = await call('GET', `/api/public/share/${shareToken}`);
    check(r.status === 200 && r.data.alert.status === 'active', 'public share endpoint returns the alert (no auth)');
    check(r.data.owner === 'Tharun', 'public share exposes the owner name');
    check(r.data.trail.length === 2, 'public share returns the location trail (2 points)');
    check(r.data.alert.shareToken === undefined, 'public payload omits the raw share token');

    r = await call('GET', `/api/public/share/${'0'.repeat(32)}`);
    check(r.status === 404, 'unknown share token returns 404');

    const pageRes = await raw('GET', `${base}/s/${shareToken}`);
    const pageHtml = pageRes.text;
    check(pageRes.status === 200 && pageHtml.includes("Tharun's live location"), 'share page renders owner name');
    check(pageHtml.includes('/api/public/share/'), 'share page polls the public API');

    const badPage = await raw('GET', `${base}/s/${'0'.repeat(32)}`);
    check(badPage.status === 404, 'invalid share page returns 404');

    console.log('\nreports');
    r = await call('POST', '/api/reports', { happenedAt: '2026-10-07T18:00', place: 'MG Road', people: 'Unknown', description: 'Followed by someone.', lat: 12.97, lng: 77.59 }, token);
    check(r.status === 201 && r.data.report.id > 0, 'create an incident report');
    const reportId = r.data.report.id;

    r = await call('GET', '/api/reports', null, token);
    check(r.status === 200 && r.data.reports.length === 1, 'list incident reports');

    r = await call('DELETE', `/api/reports/${reportId}`, null, token);
    check(r.status === 200, 'delete an incident report');

    console.log('\nalert lifecycle');
    r = await call('GET', '/api/alerts', null, token);
    check(r.status === 200 && r.data.alerts.length === 1, 'list alerts');

    r = await call('POST', `/api/alerts/${alert.id}/resolve`, null, token);
    check(r.status === 200, 'resolve an active alert');

    r = await call('POST', `/api/alerts/${alert.id}/resolve`, null, token);
    check(r.status === 404, 'resolving twice returns 404');

    r = await call('GET', `/api/public/share/${shareToken}`);
    check(r.data.alert.status === 'resolved', 'public share reflects the resolved status');

    console.log('\nchat assistant');
    r = await call('POST', '/api/chat', { message: 'How do I file an FIR?', lang: 'en' });
    check(r.status === 200 && /FIR/.test(r.data.reply), 'chat answers an FIR question');
    check(r.data.llm === false, 'reports no LLM configured');
    check(r.data.source === 'kb', 'answer came from the built-in knowledge base');

    r = await call('POST', '/api/chat', { message: 'I think I am being followed', lang: 'hi' });
    check(r.status === 200 && r.data.reply.length > 0, 'chat answers in Hindi mode');
    check(r.data.lang === 'hi', 'echoes the requested language');

    r = await call('POST', '/api/chat', { message: 'zzzz nonsense qwerty', lang: 'en' });
    check(r.status === 200 && r.data.source === 'fallback', 'unknown question falls back gracefully');

    r = await call('POST', '/api/chat', {});
    check(r.status === 400, 'chat rejects an empty message (400)');

    r = await call('POST', '/api/chat', { message: 'emergency numbers' });
    check(r.status === 200 && /112/.test(r.data.reply), 'chat works without a lang field');

    console.log('\ncomplaint sheets');
    r = await call('POST', '/api/complaints', {
      ref: 'SS1/20261007/1234', offence: 'Stalking / following', station: 'MG Road',
      place: 'MG Road bus stop', happenedAt: '2026-10-07T18:00',
      description: 'Followed by an unknown man.', text: 'FORM SS-1 ...', declared: true,
      lat: 12.97, lng: 77.59
    }, token);
    check(r.status === 201 && r.data.complaint.id > 0, 'save a complaint sheet');
    check(r.data.complaint.declared === 1, 'declaration flag is stored');
    const complaintId = r.data.complaint.id;

    r = await call('GET', '/api/complaints', null, token);
    check(r.status === 200 && r.data.complaints.length === 1, 'list complaint sheets');

    r = await call('GET', '/api/complaints');
    check(r.status === 401, 'complaints require auth (401)');

    r = await call('DELETE', `/api/complaints/${complaintId}`, null, token);
    check(r.status === 200, 'delete a complaint sheet');

    console.log('\nstatic frontend + isolation');
    const home = await raw('GET', base + '/');
    const homeHtml = home.text;
    check(home.status === 200 && homeHtml.includes('Sakhi Shield'), 'serves the frontend at /');
    check(homeHtml.includes('id="account"'), 'frontend includes the account section');
    check(homeHtml.includes('data-lang="hi"') && homeHtml.includes('data-lang="kn"'), 'frontend has the EN/HI/KN switcher');
    check(homeHtml.includes('const I18N ='), 'frontend ships the translation dictionary');
    check(homeHtml.includes('chat-panel') && homeHtml.includes('chat-fab'), 'frontend has the chatbot');
    check(homeHtml.includes('Form SS-1'), 'frontend has the police complaint sheet');
    check(homeHtml.includes('/api/sos'), 'frontend is wired to the SOS endpoint');

    // second user cannot see the first user's data
    r = await call('POST', '/api/auth/register', { name: 'Other', email: 'other@example.com', password: 'secret123' });
    const token2 = r.data.token;
    r = await call('GET', '/api/contacts', null, token2);
    check(r.data.contacts.length === 0, 'second user sees no contacts (data isolation)');
    r = await call('GET', '/api/alerts', null, token2);
    check(r.data.alerts.length === 0, 'second user sees no alerts (data isolation)');
    r = await call('DELETE', `/api/contacts/${contactId}`, null, token2);
    check(r.status === 404, "second user cannot delete another user's contact");

    console.log('\ncleanup');
    r = await call('DELETE', `/api/contacts/${contactId}`, null, token);
    check(r.status === 200, 'delete own contact');

  } catch (e) {
    failed++;
    console.log('  THREW ' + e.stack);
  } finally {
    server.close();
    try { fs.unlinkSync(tmpDb); } catch (e) { /* ignore */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
