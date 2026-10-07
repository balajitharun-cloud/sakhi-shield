'use strict';

/**
 * Front-end test: loads docs/index.html in a headless DOM and checks the
 * language switcher, the Form SS-1 complaint sheet and the chatbot widget.
 *   npm run test:i18n
 *
 * Requires jsdom (a devDependency - not installed in production).
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'docs', 'index.html');
const html = fs.readFileSync(page, 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'https://example.org/',
  beforeParse(window) {
    // stub the browser APIs jsdom does not implement
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
  }
});

const { window } = dom;
const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
let pass = 0, fail = 0;
const check = (cond, label) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + label); cond ? pass++ : fail++; };
const click = (elm) => elm.dispatchEvent(new window.Event('click', { bubbles: true }));

setTimeout(() => {
  try {
    console.log('\nlanguage switcher');
    check($$('.nav a').map((a) => a.textContent.trim()).includes('Helplines'), 'nav starts in English');

    click($('.lang__btn[data-lang="hi"]'));
    check($$('.nav a').map((a) => a.textContent.trim()).includes('हेल्पलाइन्स'), 'switches to Hindi');
    check(doc.documentElement.getAttribute('lang') === 'hi', 'sets <html lang="hi">');
    check($('#cName2').getAttribute('placeholder') !== 'Full name', 'translates placeholders too');

    click($('.lang__btn[data-lang="kn"]'));
    check($$('.nav a').map((a) => a.textContent.trim()).includes('ಸಹಾಯವಾಣಿಗಳು'), 'switches to Kannada');
    check(doc.documentElement.getAttribute('lang') === 'kn', 'sets <html lang="kn">');

    click($('.lang__btn[data-lang="en"]'));
    check($$('.nav a').map((a) => a.textContent.trim()).includes('Helplines'), 'switches back to English');

    console.log('\ncomplaint sheet');
    check($('#sheetRef').textContent.includes('SS1/'), 'reference number stamped');
    $('#cName2').value = 'Tharun';
    $('#cPlace').value = 'MG Road';
    $('#cDesc').value = 'Someone followed me from the bus stop.';
    click($('#reportGenBtn'));
    const out = $('#reportOut').textContent;
    check(out.includes('FORM SS-1'), 'generates the complaint header');
    check(out.includes('Tharun') && out.includes('MG Road'), 'includes the name and place');
    check(out.includes('Station House Officer'), 'addressed to the SHO');

    console.log('\nchatbot');
    check($$('#chatChips .chip').length === 5, 'renders suggestion chips');
    check(!$('#chatPanel').classList.contains('is-open'), 'panel starts closed');
    click($('#chatFab'));
    check($('#chatPanel').classList.contains('is-open'), 'opens on the chat button');
    check($$('#chatLog .msg').length === 1, 'shows a greeting on first open');

    console.log('\nruntime errors: ' + errors.length);
    errors.forEach((e) => console.log('  ' + e));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit((fail || errors.length) ? 1 : 0);
  } catch (e) {
    console.log('THREW: ' + e.stack);
    process.exit(2);
  }
}, 400);
