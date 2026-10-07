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
               'tools.html', 'evidence.html', 'safety.html', 'rights.html', 'complaint.html'];

async function main() {
  console.log('\nshared shell on all 10 pages');
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
    check(doc.querySelectorAll('.nav a').length === 11, 'nav lists 10 pages plus Chat');
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
    check(!fs.existsSync(path.join(DIR, 'account.html')), 'the account page has been removed');
    check(!fs.existsSync(path.join(DIR, 'assets/js/account.js')), 'the account script has been removed');
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
    // the surviving pages must not have duplicate ids either
    const { doc } = await load('complaint.html');
    const ids = Array.from(doc.querySelectorAll('[id]')).map((n) => n.id);
    const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
    check(dupes.length === 0, 'complaint page has no duplicate element ids' + (dupes.length ? ': ' + dupes.join(', ') : ''));
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
    const { win } = await load('index.html');
    check(win.SS.getApiBase() === 'https://sakhi-shield.onrender.com',
      'uses the built-in server address on a static host (no configuration needed)');
    check(win.SS.isBackendLikely() === true, 'a configured base counts as a backend');

    win.SS.setApiBase('https://example.test/');
    check(win.SS.getApiBase() === 'https://example.test', 'a saved override wins and the trailing slash is trimmed');
    win.SS.setApiBase('');
    check(win.SS.getApiBase() === 'https://sakhi-shield.onrender.com', 'clearing the override falls back to the default');

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

  console.log('\nassistant runs on the server only');
  {
    const core = fs.readFileSync(path.join(DIR, 'assets/js/core.js'), 'utf8');
    check(!/SS\.askDirect|directCall|detectProvider|SS\.getAI|SS\.setAI/.test(core),
      'no client-side AI key machinery is left in the browser');
    check(!core.includes('text.pollinations.ai') && !core.includes('api.groq.com'),
      'the browser never calls an AI provider directly');

    const { win, doc } = await load('index.html');
    const msgs = () => Array.from(doc.querySelectorAll('#chatLog .msg')).map((n) => n.textContent.trim());

    win.fetch = async () => ({ ok: true, status: 200, json: async () => ({ reply: 'SERVER OK' }) });
    await win.SS.chatSend('How do I file an FIR?');
    check(msgs().some((m) => m.includes('SERVER OK')), 'shows the reply the server returned');
    check(!msgs().some((m) => m.includes('Thinking')), 'the thinking bubble is cleared on success');

    // a failing request must never leave the bubble stuck on screen
    win.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await win.SS.chatSend('hello');
    check(!msgs().some((m) => m.includes('Thinking')), 'a failed request never leaves "Thinking\u2026" behind');
    check(msgs().some((m) => /could not answer|not connected/i.test(m)), 'a failed request explains itself');

    // a non-200 from the server is reported, not swallowed
    win.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'bad gateway' }) });
    await win.SS.chatSend('hello again');
    check(!msgs().some((m) => m.includes('Thinking')), 'an error response still clears the bubble');
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
