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

  console.log('\nassistant: server first, then a key on this device');
  {
    const core = fs.readFileSync(path.join(DIR, 'assets/js/core.js'), 'utf8');
    check(core.includes('/api/chat'), 'the assistant calls the server endpoint');
    check(core.includes('detectProvider'), 'a pasted key is matched to a provider');
    check(!core.includes('text.pollinations.ai'),
      'the dead pollinations service is gone from the browser');
    check(!/localAnswer|CHAT_INTENTS/.test(core), 'there is still no canned-answer fallback');

    const { win, doc } = await load('index.html');
    const msgs = () => Array.from(doc.querySelectorAll('#chatLog .msg')).map((n) => n.textContent.trim());
    const click = (el) => el.dispatchEvent(new win.Event('click', { bubbles: true }));

    // the gear reveals the key field
    const gear = doc.querySelector('#chatSetupBtn');
    const box = doc.querySelector('#chatSetup');
    check(!!gear && !!box && box.hidden === true, 'the assistant settings are hidden behind a gear');
    click(gear);
    check(box.hidden === false, 'the gear reveals the settings');

    // a pasted key is recognised and stored
    doc.querySelector('#chatKey').value = 'gsk_abc123';
    click(doc.querySelector('#chatKeySave'));
    check(win.SS.getAI().provider === 'groq', 'detects a Groq key from its shape');
    check(win.SS.getAI().key === 'gsk_abc123', 'stores the key on the device');

    // an unrecognised key is refused
    doc.querySelector('#chatKey').value = 'not-a-key';
    click(doc.querySelector('#chatKeySave'));
    check(win.SS.getAI().key === 'gsk_abc123', 'an unrecognised key is not saved');

    // a Google key is recognised too
    doc.querySelector('#chatKey').value = 'AIzaSyExampleKeyValue';
    click(doc.querySelector('#chatKeySave'));
    check(win.SS.getAI().provider === 'gemini', 'detects a Google key from its shape');

    // 1. the server answers -> use it
    win.SS.setAI({ provider: 'groq', key: 'gsk_abc123', model: '' });
    win.fetch = async () => ({ ok: true, status: 200, json: async () => ({ reply: 'SERVER OK', source: 'ai' }) });
    await win.SS.chatSend('How do I file an FIR?');
    check(msgs().some((m) => m.includes('SERVER OK')), 'prefers the server when it answers');
    check(!msgs().some((m) => m.includes('Thinking')), 'the thinking bubble is cleared on success');

    // 2. the server has no AI of its own -> fall through to the saved key
    win.fetch = async (url) => String(url).includes('/api/chat')
      ? { ok: true, status: 200, json: async () => ({ reply: 'nope', source: 'unavailable' }) }
      : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'DIRECT OK' } }] }) };
    await win.SS.chatSend('and again');
    check(msgs().some((m) => m.includes('DIRECT OK')), 'falls back to the key saved on this device');

    // 3. nothing works and no key -> explain, and never leave the bubble stuck
    win.SS.setAI({ provider: '', key: '', model: '' });
    win.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await win.SS.chatSend('hello');
    check(!msgs().some((m) => m.includes('Thinking')), 'a total failure never leaves "Thinking\u2026" behind');
    check(msgs().some((m) => /gear icon/i.test(m)), 'tells the user how to add a key');

    // 4. a non-200 from the server is reported, not swallowed
    win.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'bad gateway' }) });
    await win.SS.chatSend('hello again');
    check(!msgs().some((m) => m.includes('Thinking')), 'an error response still clears the bubble');
    check(msgs().some((m) => /bad gateway/.test(m)), 'reports the real server error');
  }
  console.log('\nnearby police & hospitals (real OpenStreetMap data)');
  {
    const POLICE = [
      {"name": "Central Police Station", "category": "amenity", "type": "police", "lat": "12.9601119", "lon": "77.5720676", "display_name": "Central Police Station, Aluri Venkata Rao Road, Chamarajapete, Chamarajpet, Bengaluru Central City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560018, India", "extratags": {"designation": "Central Police Station", "phone": "080 2294 2559"}},
      {"name": "Koramangala Police Station", "category": "amenity", "type": "police", "lat": "12.9411249", "lon": "77.6214094", "display_name": "Koramangala Police Station, 19th Main Road, Koramangala 5th Block, A Adugodi, Bengaluru South City Corporation, Bengaluru, Bangalore South, Bengaluru Urban, Karnataka, 560095, India", "extratags": null},
      {"name": "Ashok Nagar Police Station", "category": "amenity", "type": "police", "lat": "12.9715906", "lon": "77.6101953", "display_name": "Ashok Nagar Police Station, Commissariat Road, Corporation Quarters, Ashok Nagar, Ashokanagar, Bengaluru Central City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560025, India", "extratags": null},
      {"name": "Banaswadi Police Station", "category": "amenity", "type": "police", "lat": "13.0196670", "lon": "77.6401530", "display_name": "Banaswadi Police Station, 3rd Cross Road, Kalyan Nagar, Kalyanagar, Bengaluru North City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560043, India", "extratags": {"landuse": "commercial"}},
      {"name": "Upparpet Traffic Police Station", "category": "amenity", "type": "police", "lat": "12.9745091", "lon": "77.5749573", "display_name": "Upparpet Traffic Police Station, Tank Bund Road, Gandhinagar, Nehru Nagar, Bengaluru Central City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560009, India", "extratags": {"building": "yes"}},
      {"name": "Bellandur Traffic Police Station", "category": "amenity", "type": "police", "lat": "12.9218104", "lon": "77.6615878", "display_name": "Bellandur Traffic Police Station, 1st Main Road, Iblur, Bengaluru South City Corporation, Bengaluru, Bangalore South, Bengaluru Urban, Karnataka, 560102, India", "extratags": {"building": "yes"}},
      {"name": "Police Bazaar Road", "category": "highway", "type": "residential", "lat": "12.98", "lon": "77.60"},
      {"name": "", "category": "amenity", "type": "police", "lat": "12.99", "lon": "77.61"},
      {"name": "Central Police Station", "category": "amenity", "type": "police", "lat": "12.9601119", "lon": "77.5720676", "display_name": "Central Police Station, Aluri Venkata Rao Road, Chamarajapete, Chamarajpet, Bengaluru Central City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560018, India", "extratags": {"designation": "Central Police Station"}}
    ];
    const HOSP = [
      {"name": "Greenview Hospital", "category": "amenity", "type": "hospital", "lat": "12.9191928", "lon": "77.6381223", "display_name": "Greenview Hospital, 14th Main Road, MCHS Colony, Sector 5, Jakkasandra, Bengaluru South City Corporation, Bengaluru, Bangalore South, Bengaluru Urban, Karnataka, 560034, India", "extratags": {"healthcare": "hospital", "wheelchair": "yes"}},
      {"name": "Hospital", "category": "amenity", "type": "hospital", "lat": "12.9914123", "lon": "77.6117329", "display_name": "Hospital, Saint John's Church Road, Bharathi Nagar, Bengaluru Central City Corporation, Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, 560001, India", "extratags": {"phone": "+9193411 44150", "website": "https://www.mirlayeyecare.com/"}},
      {"name": "Karanth Speciality Hospital", "category": "amenity", "type": "hospital", "lat": "12.9160081", "lon": "77.6193573", "display_name": "Karanth Speciality Hospital, Ragigudda-Silk Board Integrated Flyover (u/c), BTM 2nd Stage, BTM Layout, Viswamanava Kuvempu Ward, Bengaluru South City Corporation, Bengaluru, Bangalore South, Bengaluru North, Karnataka, 560068, India", "extratags": {"emergency": "yes", "healthcare": "hospital"}},
      {"name": "Hi Tech Kidney Stone Hospital", "category": "amenity", "type": "hospital", "lat": "12.9271389", "lon": "77.5790280", "display_name": "Hi Tech Kidney Stone Hospital, 32nd Cross Road, Jayanagar 7th Block, Devagiri Temple Ward, Bengaluru West City Corporation, Bengaluru, Bangalore South, Bengaluru Urban, Karnataka, 560001, India", "extratags": {"email": "shridhar@hitechkidneystonehospital.org; suresh@hitechkidneystonehospital.org", "website": "http://www.hitechkidneystonehospital.org/", "operator:type": "private", "healthcare:speciality": "Dornier AlphaLithotripsy Treatment; X-Rays; US Scan; Urologist Consultation"}},
      {"name": "Shanti Hospital", "category": "amenity", "type": "hospital", "lat": "12.9235041", "lon": "77.5857517", "display_name": "Shanti Hospital, 36th Cross Road, Jayanagar 4th Block, Byrasandra, Bengaluru South City Corporation, Bengaluru, Bangalore South, Bengaluru Urban, Karnataka, 560011, India", "extratags": null},
      {"name": "Columbiaa Hospital", "category": "amenity", "type": "hospital", "lat": "13.0104342", "lon": "77.6583242", "display_name": "Columbiaa Hospital, B Channasandra Main Road, Vijaya Bank Colony, Banaswadi, Bengaluru North City Corporation, Bengaluru, Bangalore East, Bengaluru Urban, Karnataka, 560041, India", "extratags": {"check_date": "2026-04-26"}}
    ];

    const { win, doc } = await load('location.html');
    const click = (e) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
    check(!!doc.querySelector('#nearbyBtn') && !!doc.querySelector('#nearbyOut'),
      'the location page has the nearby scanner');

    const calls = [];
    win.fetch = async (url) => {
      const u = String(url);
      calls.push(u);
      return { ok: true, status: 200, json: async () => (u.indexOf('q=police') >= 0 ? POLICE : HOSP) };
    };
    click(doc.querySelector('#nearbyBtn'));
    await wait(3000);

    const names = Array.from(doc.querySelectorAll('.nearby-item b')).map((n) => n.textContent);
    check(names.length > 0, 'lists places near you');
    check(doc.querySelectorAll('.nearby-group').length === 2, 'separates police stations from hospitals');
    check(names.indexOf('Police Bazaar Road') < 0, 'ignores matches that are not police or hospitals');
    check(names.every((n) => n.trim().length > 0), 'ignores unnamed places');
    check(names.filter((v, i) => names.indexOf(v) !== i).length === 0, 'removes duplicates');

    Array.from(doc.querySelectorAll('.nearby-group')).forEach((g) => {
      const ds = Array.from(g.querySelectorAll('.nearby-meta')).map((n) => parseFloat(n.textContent));
      check(ds.length > 0 && ds.every((d, i) => i === 0 || d >= ds[i - 1]), 'nearest first within a group');
    });

    const hrefs = Array.from(doc.querySelectorAll('.nearby-actions a')).map((a) => a.getAttribute('href'));
    check(hrefs.some((h) => /google\.com\/maps\/dir/.test(h)), 'each place links to directions');
    check(hrefs.some((h) => /^tel:\+?[0-9]+$/.test(h)), 'a known phone number becomes a tap-to-call link');
    check(calls.length === 2, 'makes exactly two lookups (Nominatim allows one per second)');
    check(calls.every((u) => u.indexOf('bounded=1') >= 0 && u.indexOf('viewbox=') >= 0),
      'both lookups are restricted to the area around you');

    const before = calls.length;
    click(doc.querySelector('#nearbyBtn'));
    await wait(500);
    check(calls.length === before, 'a repeat scan of the same spot is served from cache');

    const { win: w2, doc: d2 } = await load('location.html');
    w2.fetch = async () => { throw new TypeError('Failed to fetch'); };
    click(d2.querySelector('#nearbyBtn'));
    await wait(1500);
    const hint = d2.querySelector('#nearbyHint').textContent;
    check(/could not be reached/i.test(hint), 'a failed scan explains itself');
    check(/Open in Maps/i.test(hint), 'a failed scan points at the map fallback');
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
