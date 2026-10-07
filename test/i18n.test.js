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
    const { doc } = await load('complaint.html');
    check(doc.querySelector('#sheetRef').textContent.includes('SS1/'), 'complaint page stamps a reference number');
    doc.querySelector('#cName2').value = 'Tharun';
    doc.querySelector('#cPlace').value = 'MG Road';
    doc.querySelector('#cDesc').value = 'Followed from the bus stop.';
    doc.querySelector('#reportGenBtn').dispatchEvent(new (doc.defaultView.Event)('click', { bubbles: true }));
    const out = doc.querySelector('#reportOut').textContent;
    check(out.includes('FORM SS-1') && out.includes('Tharun') && out.includes('Station House Officer'),
      'complaint page generates a formal complaint');
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
