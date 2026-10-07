/* ============================================================
   Sakhi Shield - evidence: camera, audio and video recording
   Everything is captured with the user's own device and stored in
   IndexedDB on that device. Nothing is uploaded anywhere.

   Needs a secure context (https:// or localhost) for getUserMedia.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, el = SS.el;
  const toast = SS.toast;
  if (!$('#camWrap') && !$('#evList')) return;

  const DB_NAME = 'sakhi_evidence', STORE = 'items';

  /* ---------- IndexedDB helpers ---------- */
  function openDb() {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  async function addItem(item) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const rq = tx.objectStore(STORE).add(item);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
  }
  async function allItems() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  }
  async function removeItem(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const rq = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
      rq.onsuccess = () => resolve();
      rq.onerror = () => reject(rq.error);
    });
  }

  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  /* ---------- save an evidence item (geo-tagged) ---------- */
  async function save(blob, type, note) {
    const fix = SS.getFix();
    const item = {
      type,                       // 'photo' | 'audio' | 'video'
      blob,
      mime: blob.type || 'application/octet-stream',
      size: blob.size,
      at: new Date().toISOString(),
      lat: fix ? fix.lat : null,
      lng: fix ? fix.lng : null,
      note: note || ''
    };
    await addItem(item);
    toast((type === 'photo' ? 'Photo' : type === 'audio' ? 'Audio' : 'Video') + ' saved to the vault', 'ok');
    renderVault();
  }

  /* ============================================================
     Camera
     ============================================================ */
  let camStream = null;
  const video = () => $('#camVideo');

  async function startCamera() {
    if (!supported) { toast('Camera and recording need a secure (https) connection', 'err'); return; }
    if (camStream) return;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false
      });
      const v = video();
      if (v) { v.srcObject = camStream; v.play().catch(() => {}); }
      const off = $('#camOff'); if (off) off.hidden = true;
      const stop = $('#camStopBtn'); if (stop) stop.hidden = false;
      const snap = $('#snapBtn'); if (snap) snap.disabled = false;
      const start = $('#camStartBtn'); if (start) start.hidden = true;
    } catch (e) {
      camStream = null;
      toast(e.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow it in your browser settings.'
        : 'Could not start the camera: ' + e.message, 'err');
    }
  }
  function stopCamera() {
    if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
    const v = video(); if (v) v.srcObject = null;
    const off = $('#camOff'); if (off) off.hidden = false;
    const stop = $('#camStopBtn'); if (stop) stop.hidden = true;
    const snap = $('#snapBtn'); if (snap) snap.disabled = true;
    const start = $('#camStartBtn'); if (start) start.hidden = false;
  }

  async function takePhoto() {
    const v = video();
    if (!camStream || !v) { toast('Start the camera first', 'err'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => { if (blob) await save(blob, 'photo'); }, 'image/jpeg', 0.9);
  }

  /* ============================================================
     Recording (audio and video)
     ============================================================ */
  let recorder = null, recStream = null, recChunks = [], recType = null, recTimer = null, recStart = 0;

  function pickMime(kind) {
    const candidates = kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
  }

  function paintRec(on) {
    const badge = $('#recBadge');
    if (badge) badge.classList.toggle('is-on', on);
    const stop = $('#recStopBtn'); if (stop) stop.hidden = !on;
    const a = $('#recAudioBtn'); if (a) a.disabled = on;
    const v = $('#recVideoBtn'); if (v) v.disabled = on;
  }
  function paintClock() {
    const c = $('#recClock');
    if (!c) return;
    const s = Math.floor((Date.now() - recStart) / 1000);
    c.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  async function startRecording(kind) {
    if (!supported) { toast('Recording needs a secure (https) connection', 'err'); return; }
    if (recorder) return;
    try {
      recStream = await navigator.mediaDevices.getUserMedia(
        kind === 'video' ? { video: { facingMode: { ideal: 'environment' } }, audio: true } : { audio: true }
      );
      const mime = pickMime(kind);
      recorder = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
      recChunks = []; recType = kind;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(recChunks, { type: recorder.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') });
        recChunks = [];
        if (blob.size > 0) await save(blob, kind);
        if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; }
        recorder = null;
        if (kind === 'video') stopCamera();
      };
      recorder.start(1000);
      recStart = Date.now();
      if (recTimer) clearInterval(recTimer);
      recTimer = setInterval(paintClock, 500);
      paintClock();
      paintRec(true);
      // show the live preview while recording video
      if (kind === 'video') {
        camStream = recStream;
        const v = video(); if (v) { v.srcObject = recStream; v.play().catch(() => {}); }
        const off = $('#camOff'); if (off) off.hidden = true;
      }
      toast(kind === 'video' ? 'Recording video\u2026' : 'Recording audio\u2026', 'err');
    } catch (e) {
      recorder = null;
      if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null; }
      toast(e.name === 'NotAllowedError'
        ? 'Microphone/camera permission was denied.'
        : 'Could not start recording: ' + e.message, 'err');
    }
  }

  function stopRecording() {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    paintRec(false);
    const c = $('#recClock'); if (c) c.textContent = '00:00';
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  /* ============================================================
     Vault
     ============================================================ */
  const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const extFor = (mime, type) => mime.indexOf('mp4') >= 0 ? (type === 'video' ? 'mp4' : 'm4a')
    : mime.indexOf('ogg') >= 0 ? 'ogg' : type === 'photo' ? 'jpg' : 'webm';

  async function renderVault() {
    const host = $('#evList');
    if (!host) return;
    let items = [];
    try { items = await allItems(); } catch (e) { host.innerHTML = '<p class="placeholder">Could not open the vault.</p>'; return; }
    host.innerHTML = '';
    const empty = $('#evEmpty');
    if (!items.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;

    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    items.forEach((it) => {
      const url = URL.createObjectURL(it.blob);
      const card = el('div', { class: 'ev-item' });
      const media = el('div', { class: 'ev-item__media' });
      if (it.type === 'photo') {
        media.appendChild(el('img', { src: url, alt: 'Captured evidence' }));
      } else if (it.type === 'video') {
        const v = el('video', { src: url, controls: 'controls', playsinline: 'playsinline' });
        media.appendChild(v);
      } else {
        const a = el('audio', { src: url, controls: 'controls' });
        media.appendChild(a);
      }
      card.appendChild(media);

      const body = el('div', { class: 'ev-item__body' });
      body.appendChild(el('div', { class: 'ev-item__meta', text:
        it.type.toUpperCase() + ' \u00b7 ' + fmtSize(it.size) + '\n' +
        new Date(it.at).toLocaleString('en-IN') +
        (it.lat != null ? '\n' + it.lat.toFixed(5) + ', ' + it.lng.toFixed(5) : '') }));
      card.appendChild(body);

      const acts = el('div', { class: 'ev-item__acts' });
      const dl = el('a', { class: 'btn btn--sm', text: 'Download' });
      dl.href = url;
      dl.download = 'sakhi-evidence-' + it.type + '-' + it.at.replace(/[:.]/g, '-') + '.' + extFor(it.mime, it.type);
      acts.appendChild(dl);
      const del = el('button', { class: 'btn btn--sm', text: 'Delete' });
      del.addEventListener('click', async () => {
        if (!confirm('Delete this evidence item? This cannot be undone.')) return;
        await removeItem(it.id);
        URL.revokeObjectURL(url);
        toast('Deleted');
        renderVault();
      });
      acts.appendChild(del);
      card.appendChild(acts);
      host.appendChild(card);
    });
  }

  /* ============================================================
     Auto-record while SOS is active
     ============================================================ */
  SS.evidence = {
    isRecording: () => !!recorder,
    async startAutoRecord() {
      if (!SS.store.get('ss_auto_record', false)) return;
      await SS.doGetLocation(true);
      await startRecording('video');
    },
    stopAutoRecord() { if (recorder) stopRecording(); },
    renderVault
  };

  /* ---------- wiring ---------- */
  const on = (sel, ev, fn) => { const n = $(sel); if (n) n.addEventListener(ev, fn); };
  on('#camStartBtn', 'click', startCamera);
  on('#camStopBtn', 'click', stopCamera);
  on('#snapBtn', 'click', takePhoto);
  on('#recAudioBtn', 'click', () => startRecording('audio'));
  on('#recVideoBtn', 'click', () => startRecording('video'));
  on('#recStopBtn', 'click', stopRecording);
  on('#evRefreshBtn', 'click', renderVault);
  on('#evClearBtn', 'click', async () => {
    if (!confirm('Delete ALL saved evidence? This cannot be undone.')) return;
    const items = await allItems();
    for (const it of items) await removeItem(it.id);
    toast('Vault cleared');
    renderVault();
  });

  const autoRec = $('#tgAutoRecord');
  if (autoRec) {
    autoRec.setAttribute('aria-checked', SS.store.get('ss_auto_record', false) ? 'true' : 'false');
    autoRec.addEventListener('click', () => {
      const v = !SS.store.get('ss_auto_record', false);
      SS.store.set('ss_auto_record', v);
      autoRec.setAttribute('aria-checked', v ? 'true' : 'false');
      toast(v ? 'Auto-record on SOS is on' : 'Auto-record on SOS is off');
    });
  }

  if (!supported) {
    const off = $('#camOff');
    if (off) off.textContent = 'Camera and recording need a secure (https) connection and a browser that supports MediaRecorder.';
    ['#camStartBtn', '#recAudioBtn', '#recVideoBtn'].forEach((s) => { const n = $(s); if (n) n.disabled = true; });
  }

  renderVault();
})();
