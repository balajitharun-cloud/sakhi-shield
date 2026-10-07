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

  /* ============================================================
     Nearby police stations & hospitals.

     Source: OpenStreetMap's Nominatim search - no API key, and it sends
     Access-Control-Allow-Origin: *, so the browser can call it directly.
     Its usage policy allows one request per second, so the two lookups are
     spaced out and the results are cached for the position that produced them.
     ============================================================ */
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const NEARBY_KM = 5;          // search radius
  const NEARBY_MAX = 8;         // how many of each to show

  function boxAround(lat, lng, km) {
    const dLat = km / 111.32;
    const cos = Math.cos(lat * Math.PI / 180);
    const dLng = km / (111.32 * (Math.abs(cos) < 1e-6 ? 1e-6 : Math.abs(cos)));
    // Nominatim viewbox order: left,top,right,bottom
    return [lng - dLng, lat + dLat, lng + dLng, lat - dLat];
  }

  function haversine(aLat, aLng, bLat, bLng) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function nominatim(term, box) {
    const url = NOMINATIM + '?q=' + encodeURIComponent(term) +
      '&format=jsonv2&limit=40&bounded=1&addressdetails=1&extratags=1' +
      '&viewbox=' + box.map((n) => n.toFixed(5)).join(',');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } finally {
      clearTimeout(timer);
    }
  }

  // Keep only real amenity entries of the kind we asked for, drop unnamed and
  // duplicate places, then order by how far away they are.
  function tidy(rows, kind, fix) {
    const seen = Object.create(null), list = [];
    rows.forEach((r) => {
      if (r.category !== 'amenity' || r.type !== kind) return;
      const name = String(r.name || '').trim();
      if (!name) return;
      const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
      if (!isFinite(lat) || !isFinite(lng)) return;
      const key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      const extra = r.extratags || {};
      const parts = String(r.display_name || '').split(',').map((x) => x.trim());
      list.push({
        name: name,
        lat: lat,
        lng: lng,
        dist: haversine(fix.lat, fix.lng, lat, lng),
        phone: extra.phone || extra['contact:phone'] || '',
        where: parts.slice(1, 3).filter(Boolean).join(', ')
      });
    });
    list.sort((a, b) => a.dist - b.dist);
    return list.slice(0, NEARBY_MAX);
  }

  function renderGroup(title, items) {
    const group = el('div', { class: 'nearby-group' });
    group.appendChild(el('h4', { class: 'nearby-title', text: title + ' \u00b7 ' + items.length }));
    const list = el('div', { class: 'nearby-list' });
    items.forEach((it) => {
      const card = el('div', { class: 'nearby-item' });
      card.appendChild(el('b', { text: it.name }));
      card.appendChild(el('div', {
        class: 'nearby-meta',
        text: it.dist.toFixed(1) + ' km' + (it.where ? ' \u00b7 ' + it.where : '')
      }));
      const acts = el('div', { class: 'nearby-actions' });
      acts.appendChild(el('a', {
        class: 'btn btn--sm',
        href: 'https://www.google.com/maps/dir/?api=1&destination=' + it.lat + ',' + it.lng,
        target: '_blank', rel: 'noopener',
        text: 'Directions'
      }));
      if (it.phone) {
        acts.appendChild(el('a', {
          class: 'btn btn--sm',
          href: 'tel:' + it.phone.replace(/[^+0-9]/g, ''),
          text: 'Call ' + it.phone
        }));
      }
      card.appendChild(acts);
      list.appendChild(card);
    });
    group.appendChild(list);
    return group;
  }

  const nearbyBtn = $('#nearbyBtn');
  const nearbyHint = $('#nearbyHint');
  const nearbyOut = $('#nearbyOut');
  const sayNearby = (t) => { if (nearbyHint) nearbyHint.textContent = t; };
  let nearbyCache = null;   // { key, police, hospitals }

  async function scanNearby() {
    if (!nearbyBtn || !nearbyOut) return;
    nearbyOut.innerHTML = '';
    sayNearby('Getting your location\u2026');

    const fix = SS.getFix() || await SS.doGetLocation(false);
    if (!fix) {
      sayNearby('Could not read your location. Allow location access for this site, then try again.');
      return;
    }

    const key = fix.lat.toFixed(3) + ',' + fix.lng.toFixed(3);
    nearbyBtn.disabled = true;
    try {
      let police, hospitals;
      if (nearbyCache && nearbyCache.key === key) {
        police = nearbyCache.police; hospitals = nearbyCache.hospitals;
      } else {
        sayNearby('Searching the area around you\u2026');
        const box = boxAround(fix.lat, fix.lng, NEARBY_KM);
        const rawPolice = await nominatim('police', box);
        // Nominatim's policy: at most one request per second.
        await sleep(1200);
        const rawHosp = await nominatim('hospital', box);
        police = tidy(rawPolice, 'police', fix);
        hospitals = tidy(rawHosp, 'hospital', fix);
        nearbyCache = { key: key, police: police, hospitals: hospitals };
      }

      nearbyOut.innerHTML = '';
      if (!police.length && !hospitals.length) {
        sayNearby('Nothing was found in OpenStreetMap within ' + NEARBY_KM +
          ' km. Try "Open in Maps instead".');
        return;
      }
      sayNearby('Found within ' + NEARBY_KM + ' km of you. Distances are straight-line, ' +
        'not driving distance. In an emergency call 112.');
      if (police.length) nearbyOut.appendChild(renderGroup('Police stations', police));
      if (hospitals.length) nearbyOut.appendChild(renderGroup('Hospitals', hospitals));
    } catch (e) {
      nearbyOut.innerHTML = '';
      sayNearby('The map service could not be reached (' +
        ((e && e.message) || 'network error') + '). Try again, or use "Open in Maps instead".');
    } finally {
      nearbyBtn.disabled = false;
    }
  }

  if (nearbyBtn) nearbyBtn.addEventListener('click', scanNearby);

  const nearbyMapBtn = $('#nearbyMapBtn');
  if (nearbyMapBtn) nearbyMapBtn.addEventListener('click', () => {
    window.open('https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('police station hospital near me'), '_blank', 'noopener');
  });

  if (SS.getFix()) paint(SS.getFix());
})();
