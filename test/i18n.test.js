'use strict';

/**
 * Front-end test for the multi-page site. Loads each page in a headless DOM
 * (including its external scripts) and checks the shared shell, the language
 * switcher, and each feature page.
 *   npm run test:i18n
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');

const DIR = path.join(__dirname, '..', 'docs');

// Only load local files; skip the Google Fonts request so tests stay offline.
class LocalOnly extends ResourceLoader {
  fetch(url, options) {
    if (url.startsWith('file:')) return super.fetch(url, options);
    return null;
  }
}

let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); c ? pass++ : fail++; };

function load(file) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    resources: new LocalOnly(),
    url: 'file://' + path.join(DIR, file),
    beforeParse(window) {
      window.navigator.vibrate = () => true;
      window.navigator.clipboard = { writeText: () => Promise.resolve() };
      window.AudioContext = function () {
        return {
          currentTime: 0, state: 'running', resume() {}, destination: {},
          createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
          createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} })
        };
      };
      window.navigator.geolocation = {
        getCurrentPosition: (ok) => ok({ coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 20 } }),
        watchPosition: () => 1, clearWatch() {}
      };
      window.URL.createObjectURL = () => 'blob:x';
      window.URL.revokeObjectURL = () => {};
      window.fetch = () => Promise.reject(new Error('offline in test'));
      window.DeviceMotionEvent = function () {};
      window.DeviceMotionEvent.requestPermission = () => Promise.resolve('granted');
      window.ondevicemotion = null;
    }
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve({ dom, doc: dom.window.document, win: dom.window, errors }); } };
    dom.window.addEventListener('load', () => setTimeout(finish, 60));
    setTimeout(finish, 2500);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = ['index.html', 'sos.html', 'helplines.html', 'location.html', 'contacts.html',
               'tools.html', 'evidence.html', 'safety.html', 'rights.html', 'complaint.html', 'account.html'];

async function main() {
  console.log('\nshared shell on all 11 pages');
  for (const f of PAGES) {
    const { doc, win, errors } = await load(f);
    const ok = doc.querySelector('.brand__name') && doc.querySelector('.lang__btn[data-lang="hi"]') &&
               doc.querySelector('#chatFab') && doc.querySelector('#chatPanel') && doc.querySelector('#themeBtn') &&
               typeof win.SS !== 'undefined';
    check(ok, f + ' has the shared shell and scripts run');
    check(errors.length === 0, f + ' loads with no runtime errors' + (errors.length ? ': ' + errors[0] : ''));
  }

  console.log('\nactive nav');
  {
    const { doc } = await load('helplines.html');
    const active = doc.querySelector('.nav a.is-active');
    check(active && active.getAttribute('href') === 'helplines.html', 'highlights the current page in the nav');
    check(doc.querySelectorAll('.nav a').length === 12, 'nav lists 11 pages plus Chat');
  }

  console.log('\nfeature pages');
  {
    const { doc } = await load('helplines.html');
    check(doc.querySelectorAll('#hlNational .hl').length === 4, 'helplines page renders 4 national numbers');
    check(doc.querySelectorAll('#hlWomen .hl').length === 6, 'helplines page renders 6 support numbers');
  }
  {
    const { doc } = await load('safety.html');
    check(doc.querySelectorAll('#tipsGrid .tip').length === 12, 'safety page renders 12 tips');
  }
  {
    const { doc } = await load('rights.html');
    check(doc.querySelectorAll('#rightsList details').length === 8, 'rights page renders 8 entries');
  }
  {
    const { doc } = await load('sos.html');
    check(!!doc.querySelector('#sosBtn'), 'SOS page has the SOS button');
    check(!!doc.querySelector('#sosOverlay'), 'SOS page has the active overlay');
    check(!!doc.querySelector('#sosDelivery'), 'SOS overlay has the delivery-status panel');
    check(!!doc.querySelector('#motionBtn'), 'SOS page has the motion-sensor button');
    check(!!doc.querySelector('#alertList'), 'SOS page has the alert history');
  }
  {
    const { doc } = await load('tools.html');
    check(!!doc.querySelector('#fakeCallBtn') && !!doc.querySelector('#fakeCallOverlay'), 'tools page has the fake call');
    check(!!doc.querySelector('#timerStartBtn') && !!doc.querySelector('#checkinOverlay'), 'tools page has the check-in timer');
    check(!!doc.querySelector('.toggle[data-motion]'), 'tools page has the motion toggle');
  }
  {
    const { doc, win } = await load('complaint.html');
    check(doc.querySelector('#sheetRef').value.startsWith('SS-'), 'stamps a complainant reference');
    check(!!doc.querySelector('#a4sheet') && doc.querySelector('#a4sheet').className === 'a4', 'renders an A4-sized sheet');
    check(!!doc.querySelector('#printArea'), 'has a print area');

    const fire = (sel) => doc.querySelector(sel).dispatchEvent(new win.Event('input', { bubbles: true }));
    doc.querySelector('#cName2').value = 'Tharun';
    doc.querySelector('#cPlace').value = 'MG Road';
    doc.querySelector('#cDesc').value = 'Followed from the bus stop.';
    doc.querySelector('#cFather').value = 'Balaji';
    doc.querySelector('#cAge').value = '27';
    fire('#cName2'); fire('#cPlace'); fire('#cDesc'); fire('#cFather'); fire('#cAge');

    check(doc.querySelector('#fName').textContent === 'Tharun', 'the A4 sheet fills in live from the form');
    check(doc.querySelector('#fPlace').textContent === 'MG Road', 'the sheet shows the place of occurrence');
    check(doc.querySelector('#fFather').textContent === 'Balaji', 'the sheet shows the father/husband name');
    check(!doc.querySelector('#fDesc').classList.contains('empty'), 'a filled description clears the placeholder style');

    const out = doc.querySelector('#reportOut').textContent;
    check(out.includes('FIRST INFORMATION REPORT') && out.includes('Tharun') && out.includes('MG Road'),
      'a plain-text version is generated alongside the sheet');
    check(out.includes('BRIEF FACTS OF THE CASE'), 'the plain-text version has the section headings');

    // --- Clear must reset everything, including the dropdowns ---
    doc.querySelector('#cOffence').selectedIndex = 3;
    doc.querySelector('#cSex').selectedIndex = 1;
    doc.querySelector('#cDeclare').checked = true;
    const oldRef = doc.querySelector('#sheetRef').value;
    doc.querySelector('#reportClearBtn').dispatchEvent(new win.Event('click', { bubbles: true }));

    check(doc.querySelector('#cName2').value === '', 'Clear empties the text fields');
    check(doc.querySelector('#fName').textContent === '\u2014', 'Clear resets the sheet back to blanks');
    check(doc.querySelector('#cSex').selectedIndex === 0, 'Clear resets the Sex dropdown');
    check(doc.querySelector('#cOffence').selectedIndex === 0, 'Clear resets the offence dropdown');
    check(doc.querySelector('#fOffence').textContent === doc.querySelector('#cOffence').value,
      'the sheet follows the reset dropdown');
    check(doc.querySelector('#cDeclare').checked === false, 'Clear unticks the declaration');
    check(doc.querySelector('#sheetRef').value !== oldRef, 'Clear issues a fresh reference number');
  }
  {
    const { doc } = await load('account.html');
    check(!!doc.querySelector('#serverUrl') && !!doc.querySelector('#testServerBtn'), 'account page has the backend URL field');
    check(!!doc.querySelector('#authForm'), 'account page has the login form');
  }
  {
    const { doc } = await load('evidence.html');
    check(!!doc.querySelector('#camVideo') && !!doc.querySelector('#camStartBtn'), 'evidence page has the camera');
    check(!!doc.querySelector('#recAudioBtn') && !!doc.querySelector('#recVideoBtn') && !!doc.querySelector('#recStopBtn'), 'evidence page has audio and video recording');
    check(!!doc.querySelector('#snapBtn'), 'evidence page can take a photo');
    check(!!doc.querySelector('#evList') && !!doc.querySelector('#evEmpty'), 'evidence page has the vault');
    check(!!doc.querySelector('#tgAutoRecord'), 'evidence page has the auto-record toggle');
  }
  {
    const { doc } = await load('account.html');
    const ids = Array.from(doc.querySelectorAll('[id]')).map((n) => n.id);
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    check(dupes.length === 0, 'account page has no duplicate element ids' + (dupes.length ? ': ' + dupes.join(', ') : ''));
    check(!!doc.querySelector('#serverHint') && !!doc.querySelector('#passwordHint') && !!doc.querySelector('#acctCount'),
      'account page has the new status elements');
  }
  {
    const core = fs.readFileSync(path.join(DIR, 'assets/js/core.js'), 'utf8');
    const data = fs.readFileSync(path.join(DIR, 'assets/js/data.js'), 'utf8');
    check(core.includes('/api/chat'), 'chatbot calls the AI endpoint');
    check(!core.includes('localAnswer') && !data.includes('CHAT_INTENTS'), 'the old canned-answer chatbot is gone');
    check(core.includes('No server is connected'), 'a missing backend produces a clear message');
  }

  console.log('\nserver discovery + request timeouts');
  {
    const { win, doc } = await load('account.html');
    check(win.SS.getApiBase() === 'https://sakhi-shield.onrender.com',
      'uses the built-in server address on a static host (no configuration needed)');
    check(win.SS.isBackendLikely() === true, 'a configured base counts as a backend');

    win.SS.setApiBase('https://example.test/');
    check(win.SS.getApiBase() === 'https://example.test', 'a saved override wins and the trailing slash is trimmed');
    win.SS.setApiBase('');
    check(win.SS.getApiBase() === 'https://sakhi-shield.onrender.com', 'clearing the override falls back to the default');

    // the Backend URL box is no longer a required field in the main flow
    const urlBox = doc.querySelector('#serverUrl');
    check(!!urlBox && urlBox.closest('details') !== null, 'the server address is tucked into an advanced disclosure');

    // a hung request must time out rather than leaving the UI stuck
    win.fetch = (url, opts) => new Promise((resolve, reject) => {
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
        });
      }
    });
    const t0 = Date.now();
    let err = null;
    try { await win.SS.api('/api/health', { timeout: 250 }); } catch (e) { err = e.message; }
    check(/did not answer within/.test(err || ''), 'a hanging request times out with a clear message');
    check(Date.now() - t0 < 5000, 'the timeout fires promptly instead of hanging');

    win.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
    err = null;
    try { await win.SS.api('/api/health'); } catch (e) { err = e.message; }
    check(/Cannot reach the server/.test(err || ''), 'an unreachable server is reported plainly');
  }

  console.log('\nbrowser-direct AI (works with no backend)');
  {
    const { win } = await load('account.html');
    win.SS.setAI({ provider: 'groq', key: 'test-key', model: '' });
    let captured = null;
    win.fetch = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'DIRECT OK' } }] }) };
    };
    const reply = await win.SS.askDirect('How do I file an FIR?');
    check(reply === 'DIRECT OK', 'calls the AI provider directly from the browser');
    check(captured && captured.url.includes('api.groq.com'), 'uses the Groq endpoint for the groq provider');
    check(captured && /Bearer test-key/.test(captured.opts.headers.Authorization), 'sends the saved key as a bearer token');

    win.SS.setAI({ provider: 'groq', key: '', model: '' });
    check((await win.SS.askDirect('hello')) === null, 'returns null when a key is required but missing');

    win.SS.setAI({ provider: 'gemini', key: 'gk', model: '' });
    captured = null;
    win.fetch = async (url) => {
      captured = url;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'GEMINI OK' }] } }] }) };
    };
    check((await win.SS.askDirect('hi')) === 'GEMINI OK', 'supports the Gemini response shape');
    check(captured && captured.includes('generativelanguage.googleapis.com'), 'uses the Gemini endpoint');

    // provider detection from the shape of the key
    check(win.SS.detectProvider('gsk_abc') === 'groq', 'detects a Groq key');
    check(win.SS.detectProvider('AIzaSy123') === 'gemini', 'detects a Gemini key');
    check(win.SS.detectProvider('sk-or-v1-x') === 'openrouter', 'detects an OpenRouter key');
    check(win.SS.detectProvider('sk-abc') === 'openai', 'detects an OpenAI key');
    check(win.SS.detectProvider('nonsense') === null, 'returns null for an unrecognised key');

    // key saved but the provider left on the default
    win.SS.setAI({ provider: 'pollinations', key: 'gsk_abc', model: '' });
    const mixed = await win.SS.askDirectDebug('hi');
    check(/provider is still/i.test(mixed.error || ''), 'explains when a key is set but the provider is still pollinations');

    // a failing HTTP response must surface the real reason
    win.SS.setAI({ provider: 'groq', key: 'bad', model: '' });
    win.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API Key' } }) });
    const bad = await win.SS.askDirectDebug('hi');
    check(/401/.test(bad.error || '') && /Invalid API Key/.test(bad.error || ''), 'reports the real HTTP status and message');

    // a missing key is explained, not silent
    win.SS.setAI({ provider: 'groq', key: '', model: '' });
    const nokey = await win.SS.askDirectDebug('hi');
    check(/No API key saved/i.test(nokey.error || ''), 'explains when no key is saved');

    // --- runtime model discovery: providers retire ids, so ask what exists ---
    win.SS.setAI({ provider: 'gemini', key: 'gk', model: '' });
    const tried = [];
    win.fetch = async (url) => {
      if (url.includes('/models?')) {
        return { ok: true, status: 200, json: async () => ({ models: [
          { name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
        ] }) };
      }
      tried.push(url);
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'DISCOVERED OK' }] } }] }) };
    };
    const disc = await win.SS.askDirectDebug('hi');
    check(disc.reply === 'DISCOVERED OK', 'discovers a working model at runtime');
    check(disc.model === 'gemini-3.8-flash', 'picks the newest flash model, not the retired one');
    check(!tried.some((u) => u.includes('gemini-1.5-flash')), 'never even tries the retired model');

    win.SS.setAI({ provider: 'groq', key: 'gsk_x', model: '' });
    let groqBody = null;
    win.fetch = async (url, opts) => {
      if (url.endsWith('/models')) {
        return { ok: true, status: 200, json: async () => ({ data: [
          { id: 'openai/gpt-oss-20b' }, { id: 'whisper-large-v3' }, { id: 'llama-guard-3-8b' }
        ] }) };
      }
      groqBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'GROQ OK' } }] }) };
    };
    const g = await win.SS.askDirectDebug('hi');
    check(g.reply === 'GROQ OK', 'discovers a working Groq model');
    check(g.model === 'openai/gpt-oss-20b', 'skips whisper/guard models and picks a chat model');
    check(groqBody && groqBody.model === 'openai/gpt-oss-20b', 'sends the discovered model id in the request');

    // a retired id the user pinned still falls through to a working one
    win.SS.setAI({ provider: 'groq', key: 'gsk_x', model: 'llama-3.1-8b-instant' });
    win.fetch = async (url, opts) => {
      if (url.endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'openai/gpt-oss-20b' }] }) };
      const b = JSON.parse(opts.body);
      if (b.model === 'llama-3.1-8b-instant') {
        return { ok: false, status: 404, json: async () => ({ error: { message: 'does not exist' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'FALLTHROUGH OK' } }] }) };
    };
    const fb = await win.SS.askDirectDebug('hi');
    check(fb.reply === 'FALLTHROUGH OK', 'falls through a pinned-but-retired model to a working one');
    check(fb.model === 'openai/gpt-oss-20b', 'reports which model actually answered');
  }
  {
    const { doc } = await load('index.html');
    check(doc.querySelectorAll('#hub .link-card').length === 10, 'home page links to all 10 feature pages');
  }

  console.log('\nlanguage switching');
  {
    const { doc, win } = await load('helplines.html');
    const click = (el) => el.dispatchEvent(new win.Event('click', { bubbles: true }));
    const navText = () => Array.from(doc.querySelectorAll('.nav a')).map((a) => a.textContent.trim());
    check(navText().includes('Helplines'), 'starts in English');
    click(doc.querySelector('.lang__btn[data-lang="hi"]'));
    check(navText().includes('हेल्पलाइन्स'), 'switches to Hindi');
    click(doc.querySelector('.lang__btn[data-lang="kn"]'));
    check(navText().includes('ಸಹಾಯವಾಣಿಗಳು'), 'switches to Kannada');
    click(doc.querySelector('.lang__btn[data-lang="en"]'));
    check(navText().includes('Helplines'), 'switches back to English');
    check(doc.documentElement.getAttribute('lang') === 'en', 'html lang attribute tracks the choice');
  }

  console.log('\nmotion sensor permission flow');
  {
    const { doc, win } = await load('sos.html');
    const btn = doc.querySelector('#motionBtn');
    check(btn.getAttribute('aria-pressed') === 'false', 'motion starts off');
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    await wait(150);
    check(win.SS.motionOn() === true, 'tapping the button requests permission and turns motion on');
    check(doc.querySelector('[data-motion-status]').textContent.startsWith('On'), 'status text updates to On');
    btn.dispatchEvent(new win.Event('click', { bubbles: true }));
    await wait(50);
    check(win.SS.motionOn() === false, 'tapping again turns motion off');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.log('THREW: ' + e.stack); process.exit(2); });
