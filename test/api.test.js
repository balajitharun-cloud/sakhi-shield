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
// Keep the chat test offline and deterministic: exercise the built-in
// knowledge base rather than calling out to a live AI provider.
process.env.LLM_PROVIDER = 'off';

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
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* non-JSON */ }
        resolve({ status: res.statusCode, data: json, text, buffer, contentType: res.headers['content-type'] });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

  // multipart/form-data, built by hand (undici's fetch is unreliable here)
  const upload = (method, url, fields, file, token) => new Promise((resolve, reject) => {
    const b = '----sakhitest' + Math.random().toString(16).slice(2);
    const parts = [];
    Object.keys(fields || {}).forEach((k) => {
      parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + fields[k] + '\r\n'));
    });
    parts.push(Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="file"; filename="' + file.filename +
      '"\r\nContent-Type: ' + file.mime + '\r\n\r\n'));
    parts.push(file.data);
    parts.push(Buffer.from('\r\n--' + b + '--\r\n'));
    const body = Buffer.concat(parts);
    const u = new URL(url);
    const headers = { 'Content-Type': 'multipart/form-data; boundary=' + b, 'Content-Length': body.length };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => {
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
    r.write(body);
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

    console.log('\nchat assistant (AI only)');
    const chatMod = require('../server/chat.js');
    check(Object.keys(chatMod.PROVIDERS).length >= 6, 'chat supports multiple AI providers');
    check('pollinations' in chatMod.PROVIDERS && 'openai' in chatMod.PROVIDERS, 'includes a keyless provider and OpenAI');
    check(!('KB' in chatMod), 'the old keyword knowledge base has been removed');

    r = await call('POST', '/api/chat', { message: 'How do I file an FIR?', lang: 'en' });
    check(r.status === 200 && typeof r.data.reply === 'string' && r.data.reply.length > 0, 'chat always returns a reply');
    check(r.data.llm === false, 'reports the AI provider as off in this test run');
    check(r.data.source === 'unavailable', 'says so plainly when the AI provider is off');

    r = await call('POST', '/api/chat', { message: 'I think I am being followed', lang: 'hi' });
    check(r.status === 200 && r.data.reply.length > 0, 'chat answers in Hindi mode');
    check(r.data.lang === 'hi', 'echoes the requested language');

    r = await call('POST', '/api/chat', {});
    check(r.status === 400, 'chat rejects an empty message (400)');

    r = await call('POST', '/api/chat', { message: 'emergency numbers' });
    check(r.status === 200 && r.data.lang === 'en', 'chat defaults to English without a lang field');

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

    console.log('\ncloud files + FIR PDF');
    r = await call('POST', '/api/fir', { name: 'Tharun', place: 'MG Road', description: 'Followed from the bus stop.', ref: 'SS-TEST-1' }, token);
    check(r.status === 201 && r.data.file.kind === 'pdf', 'generates an F.I.R. PDF and stores it in the cloud');
    check(r.data.file.size > 1000, 'the PDF has real content (' + r.data.file.size + ' bytes)');
    check(!r.data.warning, 'no script warning for Latin text');
    const pdfId = r.data.file.id;

    const dl = await raw('GET', base + '/api/files/' + pdfId + '/download', null, token);
    check(dl.status === 200, 'downloads the stored PDF');
    check(dl.text.startsWith('%PDF'), 'the download really is a PDF');
    check(/application\/pdf/.test(dl.contentType || ''), 'served with the PDF content type');

    r = await call('POST', '/api/fir', { place: 'somewhere' }, token);
    check(r.status === 400, 'the F.I.R. PDF requires a complainant name');

    r = await call('POST', '/api/fir', { name: 'Tharun', description: '\u0915\u0941\u091b \u0939\u0941\u0906' }, token);
    check(r.status === 201 && !!r.data.warning, 'warns when the text uses a non-Latin script');

    const up = await upload('POST', base + '/api/files', { kind: 'photo', note: 'evidence test' },
      { filename: 'x.jpg', mime: 'image/jpeg', data: Buffer.from('fake-jpeg-bytes') }, token);
    check(up.status === 201 && up.data.file.kind === 'photo', 'uploads a camera/evidence file to the cloud');
    const fileId = up.data.file.id;

    const dl2 = await raw('GET', base + '/api/files/' + fileId + '/download', null, token);
    check(dl2.status === 200 && dl2.buffer.toString() === 'fake-jpeg-bytes', 'downloads the uploaded bytes intact');

    const audioUp = await upload('POST', base + '/api/files', { kind: 'audio' },
      { filename: 'v.webm', mime: 'audio/webm', data: Buffer.from('audio-bytes') }, token);
    check(audioUp.status === 201 && audioUp.data.file.kind === 'audio', 'uploads a voice recording to the cloud');

    r = await call('GET', '/api/files', null, token);
    check(r.status === 200 && r.data.files.length === 4, 'lists every cloud file');
    check(r.data.stats.n === 4 && r.data.stats.bytes > 0, 'reports file stats');
    check(r.data.maxBytes > 0, 'reports the upload size limit');

    const bad = await upload('POST', base + '/api/files', {},
      { filename: 'x.exe', mime: 'application/x-msdownload', data: Buffer.from('MZ') }, token);
    check(bad.status === 400, 'rejects an unsupported file type');

    r = await call('GET', '/api/files');
    check(r.status === 401, 'cloud files require auth (401)');

    r = await call('DELETE', '/api/files/' + fileId, null, token);
    check(r.status === 200, 'deletes a cloud file');

    r = await call('GET', '/api/files', null, token);
    check(r.data.files.length === 3, 'the deleted file is gone from the list');

    // another user must not reach these files
    r = await call('POST', '/api/auth/register', { name: 'Nosy', email: 'nosy@example.com', password: 'secret123' });
    const token3 = r.data.token;
    r = await call('GET', '/api/files/' + pdfId + '/download', null, token3);
    check(r.status === 404, "another user cannot download someone else's file");

    console.log('\nstatic frontend + isolation');
    const home = await raw('GET', base + '/');
    const homeHtml = home.text;
    check(home.status === 200 && homeHtml.includes('Sakhi Shield'), 'serves the frontend at /');
    check(homeHtml.includes('data-lang="hi"') && homeHtml.includes('data-lang="kn"'), 'frontend has the EN/HI/KN switcher');
    check(homeHtml.includes('chat-panel') && homeHtml.includes('chat-fab'), 'frontend has the chatbot');
    check(homeHtml.includes('assets/js/i18n.js'), 'frontend loads the shared translation dictionary');
    check(homeHtml.includes('link-card'), 'home page links to the feature pages');

    const pages = ['sos.html', 'helplines.html', 'location.html', 'contacts.html', 'tools.html',
                   'evidence.html', 'safety.html', 'rights.html', 'complaint.html', 'account.html'];
    let allPages = true;
    for (const p of pages) {
      const r2 = await raw('GET', base + '/' + p);
      if (r2.status !== 200 || !r2.text.includes('Sakhi Shield')) allPages = false;
    }
    check(allPages, 'all 10 feature pages are served as separate pages');

    const comp = await raw('GET', base + '/complaint.html');
    check(comp.text.includes('FIRST INFORMATION REPORT'), 'complaint page has the FIR sheet');
    check(comp.text.includes('id="a4sheet"'), 'complaint page renders an A4 sheet');
    check(comp.text.includes('id="reportPrintBtn"'), 'complaint page can print / save as PDF');
    check(comp.text.includes('id="reportHtmlBtn"'), 'complaint page can export the A4 sheet');
    check(comp.text.includes('Bharatiya Nagarik Suraksha Sanhita'), 'FIR sheet cites the correct statute');
    const acct = await raw('GET', base + '/account.html');
    check(acct.text.includes('id="serverUrl"'), 'account page has the backend URL field');
    check((acct.text.match(/id="apiHint"/g) || []).length === 1, 'account page has exactly one auth-status element (was duplicated)');
    check(acct.text.includes('id="serverHint"'), 'account page has a separate backend-status element');
    check(acct.text.includes('id="passwordHint"'), 'account page has the password hint');
    check(!acct.text.includes('loadAlertsBtn'), 'account page no longer has the dead alert-list button');
    const sosjs = await raw('GET', base + '/assets/js/sos.js');
    check(sosjs.text.includes('/api/sos'), 'frontend is wired to the SOS endpoint');
    check(sosjs.text.includes('requestPermission'), 'frontend requests motion-sensor permission');
    check(sosjs.text.includes('autoNotify'), 'frontend auto-sends the SOS to contacts');
    check(sosjs.text.includes('startAutoRecord'), 'SOS can start an evidence recording');
    const evPage = await raw('GET', base + '/evidence.html');
    check(evPage.text.includes('id="camVideo"') && evPage.text.includes('id="recAudioBtn"'), 'evidence page has camera and recording');
    const evjs = await raw('GET', base + '/assets/js/evidence.js');
    check(evjs.text.includes('MediaRecorder') && evjs.text.includes('indexedDB'), 'evidence module records and stores locally');
    const corejs = await raw('GET', base + '/assets/js/core.js');
    check(corejs.text.includes('/api/chat'), 'frontend is wired to the AI chat endpoint');

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
