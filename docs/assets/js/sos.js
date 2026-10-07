/* ============================================================
   Sakhi Shield - SOS
   The SOS button, the siren, the motion (shake) sensor, automatic
   delivery to trusted contacts, live-location streaming and the
   alert history. Loaded by index.html and sos.html.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, $$ = SS.$$, el = SS.el;
  const toast = SS.toast;

  const ARMED_SECONDS = 5;
  let countdown = null, tick = null, flashTimer = null;
  let activeAlertId = null, streamTimer = null, smsCountdown = null;

  /* ---------- settings (persisted) ---------- */
  const S = {
    get autoLoc() { return SS.store.get('ss_auto_loc', true); },
    set autoLoc(v) { SS.store.set('ss_auto_loc', v); },
    get vibrate() { return SS.store.get('ss_vibrate', true); },
    set vibrate(v) { SS.store.set('ss_vibrate', v); },
    get flash() { return SS.store.get('ss_flash', true); },
    set flash(v) { SS.store.set('ss_flash', v); },
    get autoSend() { return SS.store.get('ss_auto_send', true); },
    set autoSend(v) { SS.store.set('ss_auto_send', v); }
  };
  SS.settings = S;

  /* ============================================================
     Siren - a real two-tone wail from the Web Audio API
     ============================================================ */
  let audioCtx = null, sirenNodes = null;
  function startSiren() {
    if (sirenNodes) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Audio is not supported for the siren', 'err'); return; }
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    const now = audioCtx.currentTime, period = 1.1;
    for (let i = 0; i < 900; i++) {
      osc.frequency.setValueAtTime(620, now + i * period);
      osc.frequency.linearRampToValueAtTime(1180, now + i * period + period / 2);
      osc.frequency.linearRampToValueAtTime(620, now + i * period + period);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    sirenNodes = { osc, gain };
    syncSirenBtn(true);
  }
  function stopSiren() {
    if (!sirenNodes) return;
    try {
      const now = audioCtx.currentTime;
      sirenNodes.gain.gain.cancelScheduledValues(now);
      sirenNodes.gain.gain.setValueAtTime(sirenNodes.gain.gain.value, now);
      sirenNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      sirenNodes.osc.stop(now + 0.15);
    } catch (e) { /* already stopped */ }
    sirenNodes = null;
    syncSirenBtn(false);
  }
  function syncSirenBtn(on) {
    const b = $('#sirenBtn');
    if (!b) return;
    b.textContent = '\uD83D\uDD0A ' + (on ? 'Siren: on' : 'Siren: off');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  SS.startSiren = startSiren;
  SS.stopSiren = stopSiren;

  function startFlash() {
    if (flashTimer) return;
    let on = false;
    flashTimer = setInterval(() => {
      document.body.style.background = on ? '' : '#ffffff';
      on = !on;
    }, 380);
  }
  function stopFlash() {
    if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
    document.body.style.background = '';
  }

  /* ============================================================
     Motion sensor (shake to trigger SOS)
     Android/desktop need no permission; iOS 13+ only grants it from
     a user gesture, so the toggle doubles as the permission request.
     ============================================================ */
  let motionBound = false, lastShake = 0, shakeHits = 0;

  const LEVELS = { low: { mag: 34, hits: 4 }, medium: { mag: 25, hits: 3 }, high: { mag: 17, hits: 2 } };
  function level() { return LEVELS[SS.store.get('ss_shake_level', 'medium')] || LEVELS.medium; }

  function motionSupported() {
    return typeof window.DeviceMotionEvent !== 'undefined' && 'ondevicemotion' in window;
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    const now = Date.now();
    const L = level();
    if (mag > L.mag && now - lastShake > 220) {
      lastShake = now; shakeHits += 1;
      if (shakeHits >= L.hits) {
        shakeHits = 0;
        if (!countdown) { toast('Shake detected - arming SOS', 'err'); armSos(); }
      }
    }
    if (now - lastShake > 1600) shakeHits = 0;
  }

  SS.motionOn = () => motionBound;

  SS.enableMotion = async function () {
    if (!motionSupported()) {
      SS.setMotionStatus('unsupported');
      toast('This device or browser has no motion sensor', 'err');
      return false;
    }
    const DM = window.DeviceMotionEvent;
    if (typeof DM.requestPermission === 'function') {
      let res;
      try { res = await DM.requestPermission(); }
      catch (e) { res = 'denied'; }
      if (res !== 'granted') {
        SS.setMotionStatus('blocked');
        toast('Motion access was blocked. Allow "Motion & Orientation" in your browser settings, then try again.', 'err');
        return false;
      }
    }
    if (!motionBound) {
      window.addEventListener('devicemotion', onMotion, { passive: true });
      motionBound = true;
    }
    SS.store.set('ss_motion', true);
    SS.setMotionStatus('on');
    return true;
  };

  SS.disableMotion = function () {
    if (motionBound) { window.removeEventListener('devicemotion', onMotion); motionBound = false; }
    shakeHits = 0;
    SS.store.set('ss_motion', false);
    SS.setMotionStatus('off');
  };

  SS.setMotionStatus = function (state) {
    const txt = {
      on: 'On - shake the phone hard to trigger SOS',
      off: 'Off',
      blocked: 'Blocked - allow motion access in browser settings',
      unsupported: 'Not available on this device'
    }[state] || 'Off';
    $$('[data-motion-status]').forEach((n) => { n.textContent = txt; });
    $$('.toggle[data-motion]').forEach((b) => b.setAttribute('aria-checked', state === 'on' ? 'true' : 'false'));
    const btn = $('#motionBtn');
    if (btn) {
      btn.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false');
      btn.textContent = '\uD83D\uDCF3 Shake-to-SOS: ' + (state === 'on' ? 'on' : 'off');
    }
  };

  /* Re-enable silently if it was on before and the platform allows it. */
  async function restoreMotion() {
    if (!SS.store.get('ss_motion', false)) { SS.setMotionStatus(motionSupported() ? 'off' : 'unsupported'); return; }
    const DM = window.DeviceMotionEvent;
    if (!DM || typeof DM.requestPermission === 'function') { SS.setMotionStatus('off'); return; }
    if (await SS.enableMotion()) toast('Shake-to-SOS re-enabled', 'ok');
  }

  /* ============================================================
     SOS
     ============================================================ */
  function armSos() {
    const btn = $('#sosBtn'), label = $('#sosLabel'), hint = $('#sosHint');
    if (!btn || countdown) return;
    let n = ARMED_SECONDS;
    btn.classList.add('is-armed');
    if (label) label.textContent = String(n);
    if (hint) hint.textContent = 'Tap again to cancel';
    countdown = true;
    tick = setInterval(() => {
      n -= 1;
      if (n > 0) { if (label) label.textContent = String(n); }
      else {
        clearInterval(tick); tick = null; countdown = null;
        btn.classList.remove('is-armed');
        if (label) label.textContent = 'SOS';
        if (hint) hint.textContent = 'Tap to arm \u00b7 5s';
        fireSos();
      }
    }, 1000);
  }

  function cancelSos() {
    const btn = $('#sosBtn'), label = $('#sosLabel'), hint = $('#sosHint');
    if (tick) { clearInterval(tick); tick = null; }
    countdown = null;
    if (btn) btn.classList.remove('is-armed');
    if (label) label.textContent = 'SOS';
    if (hint) hint.textContent = 'Tap to arm \u00b7 5s';
  }

  async function fireSos() {
    if (navigator.vibrate && S.vibrate) navigator.vibrate([500, 200, 500, 200, 800]);
    startSiren();
    if (S.flash) startFlash();
    const overlay = $('#sosOverlay');
    if (overlay) overlay.classList.add('is-open');
    const loc = $('#sosLiveLoc');
    if (loc) loc.textContent = 'Fetching your location\u2026';

    let fix = SS.getFix();
    if (S.autoLoc) fix = await SS.doGetLocation(true) || fix;
    if (loc) loc.textContent = fix ? (SS.fmtFix(fix) + '\n' + SS.mapsLink(fix))
                                   : 'Location unavailable - call 112 and describe your surroundings.';

    if (S.autoSend) await autoNotify(fix);
  }

  /* ---------- automatic delivery to trusted contacts ---------- */
  async function autoNotify(fix) {
    const box = $('#sosDelivery');
    const say = (txt) => { if (box) box.textContent = txt; };

    if (!SS.getToken()) {
      const contacts = SS.getContacts();
      if (!contacts.length) {
        say('No trusted contacts saved yet. Add them on the Contacts page - and call 112 now.');
        return;
      }
      say('Not signed in, so opening your SMS app for ' + contacts.length + ' contact(s)\u2026');
      autoSms(fix);
      return;
    }

    say('Sending the alert to your trusted contacts\u2026');
    try {
      const body = { message: 'SOS from Sakhi Shield' };
      if (fix) { body.lat = fix.lat; body.lng = fix.lng; body.accuracy = fix.acc; }
      const r = await SS.api('/api/sos', { method: 'POST', body });
      activeAlertId = r.alert && r.alert.id;
      const n = r.notified || [];
      const sent = n.filter((x) => x.status === 'sent').length;
      const logged = n.filter((x) => x.status === 'logged').length;
      let msg = 'Alert sent to ' + n.length + ' contact(s).';
      if (sent) msg += ' ' + sent + ' delivered.';
      if (logged) msg += ' ' + logged + ' queued (add SMTP/Twilio keys on the server to really send).';
      if (!n.length) msg = 'You have no trusted contacts saved on the server yet.';
      msg += '\nLive link: ' + r.shareUrl;
      say(msg);
      if (activeAlertId) startStreaming(activeAlertId);
    } catch (e) {
      say('Server alert failed (' + e.message + '). Opening your SMS app instead.');
      autoSms(fix);
    }
  }

  /* Fallback that works with no backend at all: pre-fill an SMS to everyone. */
  function autoSms(fix) {
    const contacts = SS.getContacts();
    if (!contacts.length) return;
    const link = fix ? SS.mapsLink(fix) : '';
    const msg = 'SOS - I need help. ' + (link ? 'My location: ' + link : 'I could not get my location.');
    const to = contacts.map((c) => c.phone).filter(Boolean).join(',');

    const box = $('#sosDelivery');
    let n = 3;
    const paint = () => { if (box) box.textContent += ''; };
    if (smsCountdown) clearInterval(smsCountdown);
    smsCountdown = setInterval(() => {
      n -= 1;
      if (box) box.setAttribute('data-count', n);
      if (n <= 0) {
        clearInterval(smsCountdown); smsCountdown = null;
        location.href = 'sms:' + to + '?body=' + encodeURIComponent(msg);
      }
    }, 1000);
    paint();
  }

  /* ---------- live location streaming while SOS is active ---------- */
  function startStreaming(alertId) {
    if (!('geolocation' in navigator) || streamTimer) return;
    let lastPush = 0;
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, ts: Date.now() };
        SS.setFix(f);
        const loc = $('#sosLiveLoc');
        if (loc) loc.textContent = SS.fmtFix(f) + '\n' + SS.mapsLink(f);
        if (Date.now() - lastPush < 20000) return;
        lastPush = Date.now();
        try {
          await SS.api('/api/alerts/' + alertId + '/location', {
            method: 'POST', body: { lat: f.lat, lng: f.lng, accuracy: f.acc }
          });
          const box = $('#sosDelivery');
          if (box) box.textContent += '\nLive location updated ' + new Date().toLocaleTimeString() + '.';
        } catch (e) { /* keep trying on the next tick */ }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    streamTimer = { id: id };
  }
  function stopStreaming() {
    if (streamTimer) { navigator.geolocation.clearWatch(streamTimer.id); streamTimer = null; }
  }

  function stopSos() {
    stopSiren(); stopFlash(); stopStreaming();
    if (smsCountdown) { clearInterval(smsCountdown); smsCountdown = null; }
    if (navigator.vibrate) navigator.vibrate(0);
    const overlay = $('#sosOverlay');
    if (overlay) overlay.classList.remove('is-open');
    if (activeAlertId && SS.getToken()) {
      SS.api('/api/alerts/' + activeAlertId + '/resolve', { method: 'POST' }).catch(() => {});
      activeAlertId = null;
    }
    toast('SOS stopped');
  }

  /* ============================================================
     Alert history (sos.html)
     ============================================================ */
  async function loadAlerts() {
    const host = $('#alertList');
    if (!host) return;
    if (!SS.getToken()) {
      host.innerHTML = '<p class="placeholder">Sign in on the Account page to keep an alert history.</p>';
      return;
    }
    try {
      const r = await SS.api('/api/alerts');
      host.innerHTML = '';
      if (!r.alerts || !r.alerts.length) {
        host.innerHTML = '<p class="placeholder">No alerts yet.</p>';
        return;
      }
      r.alerts.forEach((a) => {
        const row = el('div', { class: 'hl' });
        const meta = el('div', { class: 'contact__meta' });
        meta.appendChild(el('b', { text: new Date(a.createdAt).toLocaleString('en-IN') }));
        meta.appendChild(el('span', { class: 'dim', text: a.status + (a.lat != null ? ' \u00b7 ' + a.lat.toFixed(4) + ', ' + a.lng.toFixed(4) : '') }));
        row.appendChild(meta);
        const b = el('button', { class: 'btn btn--sm hl__call', text: a.status === 'active' ? 'Resolve' : 'Open link' });
        b.addEventListener('click', async () => {
          if (a.status === 'active') {
            try { await SS.api('/api/alerts/' + a.id + '/resolve', { method: 'POST' }); toast('Alert resolved', 'ok'); loadAlerts(); }
            catch (e) { toast(e.message, 'err'); }
          } else {
            window.open('s/' + a.shareToken, '_blank', 'noopener');
          }
        });
        row.appendChild(b);
        host.appendChild(row);
      });
    } catch (e) { host.innerHTML = '<p class="placeholder">' + SS.esc(e.message) + '</p>'; }
  }

  /* ============================================================
     Wiring
     ============================================================ */
  const sosBtn = $('#sosBtn');
  if (sosBtn) sosBtn.addEventListener('click', () => (countdown ? cancelSos() : armSos()));

  const sirenBtn = $('#sirenBtn');
  if (sirenBtn) sirenBtn.addEventListener('click', () => (sirenNodes ? stopSiren() : startSiren()));

  const stopBtn = $('#sosStopBtn');
  if (stopBtn) stopBtn.addEventListener('click', stopSos);

  const callBtn = $('#sosCallBtn') || $('#call112Btn');
  if (callBtn) callBtn.addEventListener('click', () => {
    const isPhone = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isPhone) location.href = 'tel:112'; else SS.copyText('112', 'Emergency number copied: 112');
  });

  const alertBtn = $('#sosContactsBtn');
  if (alertBtn) alertBtn.addEventListener('click', () => autoNotify(SS.getFix()));

  // motion toggles (Tools page + SOS page button)
  $$('.toggle[data-motion]').forEach((b) => b.addEventListener('click', async () => {
    if (SS.motionOn()) { SS.disableMotion(); return; }
    await SS.enableMotion();
  }));
  const motionBtn = $('#motionBtn');
  if (motionBtn) motionBtn.addEventListener('click', async () => {
    if (SS.motionOn()) { SS.disableMotion(); toast('Shake-to-SOS off'); return; }
    if (await SS.enableMotion()) toast('Shake-to-SOS on - shake hard to trigger SOS', 'ok');
  });

  // sensitivity
  const sens = $('#shakeLevel');
  if (sens) {
    sens.value = SS.store.get('ss_shake_level', 'medium');
    sens.addEventListener('change', () => SS.store.set('ss_shake_level', sens.value));
  }

  // simple setting toggles on the SOS/Tools pages
  [['#tgAutoLoc', 'autoLoc'], ['#tgVibrate', 'vibrate'], ['#tgFlash', 'flash'], ['#tgAutoSend', 'autoSend']]
    .forEach(([sel, key]) => {
      const b = $(sel);
      if (!b) return;
      b.setAttribute('aria-checked', S[key] ? 'true' : 'false');
      b.addEventListener('click', () => {
        S[key] = !S[key];
        b.setAttribute('aria-checked', S[key] ? 'true' : 'false');
      });
    });

  const refreshBtn = $('#refreshAlertsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadAlerts);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); countdown ? cancelSos() : armSos();
    }
    if (e.key === 'Escape' && countdown) cancelSos();
  });

  SS.armSos = armSos;
  SS.stopSos = stopSos;
  SS.loadAlerts = loadAlerts;

  syncSirenBtn(false);
  restoreMotion();
  loadAlerts();
})();
