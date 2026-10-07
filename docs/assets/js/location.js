/* ============================================================
   Sakhi Shield - live location & journey tracking (location.html)
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, el = SS.el;
  const out = $('#locOut');
  if (!out) return;

  let watchId = null, journey = [], journeyStart = null;

  function showMap(f) {
    const box = $('#mapBox');
    if (!box) return;
    const d = 0.006;
    const bbox = [f.lng - d, f.lat - d, f.lng + d, f.lat + d].join('%2C');
    box.innerHTML = '<iframe title="Map around your location" loading="lazy" ' +
      'src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox +
      '&layer=mapnik&marker=' + f.lat + '%2C' + f.lng + '"></iframe>';
  }

  function paint(f) {
    out.textContent = SS.fmtFix(f) + '\n' + SS.mapsLink(f);
    showMap(f);
  }

  const getBtn = $('#getLocBtn');
  if (getBtn) getBtn.addEventListener('click', async () => {
    out.textContent = 'Fetching GPS\u2026';
    const f = await SS.doGetLocation(false);
    if (f) { paint(f); SS.toast('Location acquired', 'ok'); }
    else out.textContent = 'Location unavailable. Check that location access is allowed for this site.';
  });

  const watchBtn = $('#watchBtn');
  if (watchBtn) {
    const info = $('#journeyInfo');
    if (SS.getFix()) paint(SS.getFix());
    watchBtn.addEventListener('click', () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId); watchId = null;
        watchBtn.setAttribute('aria-pressed', 'false');
        watchBtn.textContent = '\uD83D\uDEF0 Track journey: off';
        const mins = journeyStart ? ((Date.now() - journeyStart) / 60000).toFixed(1) : '0';
        if (info) info.textContent = 'Journey ended \u00b7 ' + journey.length + ' points \u00b7 ' + mins + ' min tracked.';
        SS.toast('Journey tracking stopped');
        return;
      }
      if (!('geolocation' in navigator)) { SS.toast('Geolocation is not supported here', 'err'); return; }
      journey = []; journeyStart = Date.now();
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, ts: Date.now() };
          SS.setFix(f); journey.push(f); paint(f);
          const mins = ((Date.now() - journeyStart) / 60000).toFixed(1);
          if (info) info.textContent = 'Tracking \u00b7 ' + journey.length + ' points \u00b7 ' + mins + ' min.';
        },
        (err) => SS.toast('Tracking error: ' + err.message, 'err'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      watchBtn.setAttribute('aria-pressed', 'true');
      watchBtn.textContent = '\uD83D\uDEF0 Track journey: on';
      SS.toast('Journey tracking started', 'ok');
    });
  }

  const copyBtn = $('#copyLocBtn');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const link = await SS.currentLinkOrPrompt();
    if (link) SS.copyText(link, 'Map link copied');
  });

  const shareBtn = $('#shareLocBtn');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const link = await SS.currentLinkOrPrompt();
    if (!link) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'My live location', text: 'This is where I am right now:', url: link }); }
      catch (e) { /* cancelled */ }
    } else SS.copyText(link, 'Map link copied (sharing not supported here)');
  });

  const waBtn = $('#waLocBtn');
  if (waBtn) waBtn.addEventListener('click', async () => {
    const link = await SS.currentLinkOrPrompt();
    if (!link) return;
    window.open('https://wa.me/?text=' + encodeURIComponent('This is my live location: ' + link), '_blank', 'noopener');
  });

  const smsBtn = $('#smsLocBtn');
  if (smsBtn) smsBtn.addEventListener('click', async () => {
    const link = await SS.currentLinkOrPrompt();
    if (!link) return;
    const to = SS.getContacts().map((c) => c.phone).filter(Boolean).join(',');
    location.href = 'sms:' + to + '?body=' + encodeURIComponent('This is my live location: ' + link);
  });

  if (SS.getFix()) paint(SS.getFix());
})();
