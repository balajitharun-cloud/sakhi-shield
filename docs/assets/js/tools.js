/* ============================================================
   Sakhi Shield - fake call & check-in timer (tools.html)
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$;
  if (!$('#fakeCallBtn') && !$('#timerStartBtn')) return;

  /* ---------- fake call ringtone ---------- */
  let ringCtx = null, ringTimer = null;
  function burst() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ringCtx = ringCtx || new AC();
    if (ringCtx.state === 'suspended') ringCtx.resume();
    const now = ringCtx.currentTime;
    const o = ringCtx.createOscillator(), g = ringCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, now);
    o.frequency.setValueAtTime(1046, now + 0.18);
    o.frequency.setValueAtTime(880, now + 0.36);
    o.frequency.setValueAtTime(1046, now + 0.54);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    o.connect(g); g.connect(ringCtx.destination);
    o.start(now); o.stop(now + 0.9);
  }
  function startRing() { if (ringTimer) return; burst(); ringTimer = setInterval(burst, 2000); }
  function stopRing() { if (ringTimer) { clearInterval(ringTimer); ringTimer = null; } }

  let sched = null;
  function openCall() {
    const name = ($('#callerName').value || 'Home').trim();
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('#fcName', name);
    set('#fcAvatar', name.charAt(0).toUpperCase());
    const sub = $('#fakeCallOverlay .caller__sub');
    if (sub) sub.textContent = 'Incoming call\u2026';
    $('#fakeCallOverlay').classList.add('is-open');
    startRing();
    if (navigator.vibrate) navigator.vibrate([400, 300, 400, 300, 400]);
  }
  function closeCall() {
    $('#fakeCallOverlay').classList.remove('is-open');
    stopRing();
    if (navigator.vibrate) navigator.vibrate(0);
  }

  const nowBtn = $('#fakeCallBtn');
  if (nowBtn) nowBtn.addEventListener('click', openCall);

  const schedBtn = $('#fakeCallTimerBtn');
  if (schedBtn) schedBtn.addEventListener('click', () => {
    const secs = Math.max(1, Math.min(300, parseInt($('#callDelay').value, 10) || 10));
    if (sched) clearTimeout(sched);
    SS.toast('Fake call in ' + secs + 's');
    sched = setTimeout(openCall, secs * 1000);
  });

  const decline = $('#fcDecline');
  if (decline) decline.addEventListener('click', closeCall);
  const accept = $('#fcAccept');
  if (accept) accept.addEventListener('click', () => {
    stopRing();
    const sub = $('#fakeCallOverlay .caller__sub');
    if (sub) sub.textContent = 'On call\u2026';
    SS.toast('Fake call "answered" - tap \u2715 to end');
  });

  /* ---------- check-in timer ---------- */
  const CIRC = 2 * Math.PI * 52;
  const bar = $('#ringBar');
  if (bar) bar.setAttribute('stroke-dasharray', CIRC.toFixed(1));
  let timerId = null, timerEnd = 0, timerTotal = 0;

  const preset = $('#timerPreset');
  if (preset) preset.addEventListener('change', (e) => {
    const custom = $('#timerCustom');
    if (custom) custom.hidden = e.target.value !== 'custom';
  });

  function fmt(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function paint(remain, total) {
    const t = $('#timerTime');
    if (t) t.textContent = fmt(remain);
    if (bar) bar.setAttribute('stroke-dashoffset', (CIRC * (1 - (total > 0 ? Math.max(0, remain / total) : 0))).toFixed(1));
  }

  const startBtn = $('#timerStartBtn');
  if (startBtn) startBtn.addEventListener('click', () => {
    const p = preset ? preset.value : '15';
    let mins = p === 'custom' ? parseInt($('#timerCustom').value, 10) : parseInt(p, 10);
    if (!mins || mins < 1) { SS.toast('Enter a valid duration', 'err'); return; }
    mins = Math.min(mins, 480);
    timerTotal = mins * 60000;
    timerEnd = Date.now() + timerTotal;
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      const remain = timerEnd - Date.now();
      paint(remain, timerTotal);
      if (remain <= 0) {
        clearInterval(timerId); timerId = null;
        const ov = $('#checkinOverlay');
        if (ov) ov.classList.add('is-open');
        SS.toast('Check-in due', 'err');
      }
    }, 300);
    paint(timerTotal, timerTotal);
    SS.toast('Timer started: ' + mins + ' min', 'ok');
  });

  function endTimer(msg) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    paint(0, 0);
    const ov = $('#checkinOverlay');
    if (ov) ov.classList.remove('is-open');
    if (msg) SS.toast(msg, 'ok');
  }
  ['#timerSafeBtn', '#ciSafe'].forEach((s) => {
    const b = $(s);
    if (b) b.addEventListener('click', () => endTimer('Checked in - you are safe \u2713'));
  });

  const alertBtn = $('#ciAlert');
  if (alertBtn) alertBtn.addEventListener('click', async () => {
    const ov = $('#checkinOverlay');
    if (ov) ov.classList.remove('is-open');
    endTimer(null);
    const contacts = SS.getContacts();
    if (!contacts.length) { SS.toast('Add trusted contacts first', 'err'); return; }
    const link = await SS.currentLinkOrPrompt();
    const msg = "I did not check in on time - please check on me. " + (link ? 'My location: ' + link : '');
    const to = contacts.map((c) => c.phone).filter(Boolean).join(',');
    if (navigator.share) {
      try { await navigator.share({ title: 'Check-in', text: msg }); return; } catch (e) { /* fall through */ }
    }
    SS.copyText(msg, 'Message copied - send it to your contacts');
    window.open('sms:' + to + '?body=' + encodeURIComponent(msg), '_blank', 'noopener');
  });

  paint(0, 0);
})();
