'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const dbApi = require('./db');
const { users, contacts, reports, alerts, complaints, files } = dbApi;
const auth = require('./auth');
const { notifyContacts, emailConfigured, smsConfigured } = require('./notify');
const { sharePage } = require('./sharePage');
const chat = require('./chat');
const store = require('./files');
const { buildFirPdf, hasNonLatin } = require('./firPdf');

const app = express();
app.set('trust proxy', 1); // Render terminates TLS in front of us

/* ---------- middleware ---------- */
const origins = (process.env.CORS_ORIGIN || '*').trim();
app.use(cors(origins === '*' ? {} : { origin: origins.split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '256kb' }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const sosLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

/* ---------- helpers ---------- */
const nowIso = () => new Date().toISOString();
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const clean = (s, max = 500) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

function baseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function publicAlert(a) {
  return {
    id: a.id,
    lat: a.lat, lng: a.lng, accuracy: a.accuracy,
    message: a.message,
    status: a.status,
    shareToken: a.share_token,
    createdAt: a.created_at,
    resolvedAt: a.resolved_at
  };
}

/* ================= AUTH ================= */
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const name = clean(req.body.name, 60);
    const email = clean(req.body.email, 120);
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (users.findByEmail(email)) return res.status(409).json({ error: 'That email is already registered.' });

    const user = users.create({ name, email, passwordHash: await auth.hashPassword(password) });
    res.status(201).json({ token: auth.signToken(user), user: auth.publicUser(user) });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 120);
    const password = String(req.body.password || '');
    const user = users.findByEmail(email);
    if (!user || !(await auth.verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.json({ token: auth.signToken(user), user: auth.publicUser(user) });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', auth.requireAuth, (req, res, next) => {
  try {
    const user = users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: auth.publicUser(user) });
  } catch (e) { next(e); }
});

/* ================= CONTACTS ================= */
app.get('/api/contacts', auth.requireAuth, (req, res, next) => {
  try { res.json({ contacts: contacts.list(req.user.id) }); } catch (e) { next(e); }
});

app.post('/api/contacts', auth.requireAuth, (req, res, next) => {
  try {
    const name = clean(req.body.name, 60);
    const phone = clean(req.body.phone, 24);
    const email = clean(req.body.email, 120);
    if (!name) return res.status(400).json({ error: 'Contact name is required.' });
    if (!phone && !email) return res.status(400).json({ error: 'Provide a phone number, an email, or both.' });
    if (email && !isEmail(email)) return res.status(400).json({ error: 'That email is not valid.' });
    if (contacts.count(req.user.id) >= 8) return res.status(400).json({ error: 'Limit reached - up to 8 trusted contacts.' });
    res.status(201).json({ contact: contacts.create(req.user.id, { name, phone, email }) });
  } catch (e) { next(e); }
});

app.delete('/api/contacts/:id', auth.requireAuth, (req, res, next) => {
  try {
    const removed = contacts.remove(req.user.id, Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= REPORTS ================= */
app.get('/api/reports', auth.requireAuth, (req, res, next) => {
  try { res.json({ reports: reports.list(req.user.id) }); } catch (e) { next(e); }
});

app.post('/api/reports', auth.requireAuth, (req, res, next) => {
  try {
    const r = reports.create(req.user.id, {
      happenedAt: clean(req.body.happenedAt, 40),
      place: clean(req.body.place, 200),
      people: clean(req.body.people, 300),
      description: clean(req.body.description, 4000),
      lat: Number.isFinite(req.body.lat) ? req.body.lat : null,
      lng: Number.isFinite(req.body.lng) ? req.body.lng : null
    });
    res.status(201).json({ report: r });
  } catch (e) { next(e); }
});

app.delete('/api/reports/:id', auth.requireAuth, (req, res, next) => {
  try {
    const removed = reports.remove(req.user.id, Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Report not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= POLICE COMPLAINT SHEETS ================= */
app.get('/api/complaints', auth.requireAuth, (req, res, next) => {
  try { res.json({ complaints: complaints.list(req.user.id) }); } catch (e) { next(e); }
});

app.post('/api/complaints', auth.requireAuth, (req, res, next) => {
  try {
    const c = complaints.create(req.user.id, {
      ref: clean(req.body.ref, 40),
      offence: clean(req.body.offence, 120),
      station: clean(req.body.station, 120),
      place: clean(req.body.place, 200),
      happenedAt: clean(req.body.happenedAt, 40),
      people: clean(req.body.people, 300),
      witnesses: clean(req.body.witnesses, 300),
      injury: clean(req.body.injury, 300),
      action: clean(req.body.action, 120),
      earlier: clean(req.body.earlier, 10),
      description: clean(req.body.description, 4000),
      text: clean(req.body.text, 8000),
      declared: Boolean(req.body.declared),
      lat: Number.isFinite(req.body.lat) ? req.body.lat : null,
      lng: Number.isFinite(req.body.lng) ? req.body.lng : null
    });
    res.status(201).json({ complaint: c });
  } catch (e) { next(e); }
});

app.delete('/api/complaints/:id', auth.requireAuth, (req, res, next) => {
  try {
    const removed = complaints.remove(req.user.id, Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Complaint not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= CHAT ASSISTANT ================= */
// Public (no login needed) so the assistant works before signing in.
app.post('/api/chat', chatLimiter, async (req, res, next) => {
  try {
    const message = clean(req.body.message, 800);
    const lang = ['en', 'hi', 'kn'].indexOf(req.body.lang) >= 0 ? req.body.lang : 'en';
    if (!message) return res.status(400).json({ error: 'message is required.' });
    const { reply, source } = await chat.answer(message, lang);
    res.json({ reply, source, llm: chat.llmConfigured, lang });
  } catch (e) { next(e); }
});

/* ================= SOS + LIVE SHARE ================= */
app.post('/api/sos', sosLimiter, auth.requireAuth, async (req, res, next) => {
  try {
    const lat = Number.isFinite(req.body.lat) ? req.body.lat : null;
    const lng = Number.isFinite(req.body.lng) ? req.body.lng : null;
    const accuracy = Number.isFinite(req.body.accuracy) ? req.body.accuracy : null;
    const message = clean(req.body.message, 500);

    const shareToken = crypto.randomBytes(16).toString('hex');
    const alert = alerts.create(req.user.id, { lat, lng, accuracy, message, shareToken });
    if (lat != null && lng != null) alerts.addLocation(alert.id, { lat, lng, accuracy });

    const shareUrl = `${baseUrl(req)}/s/${shareToken}`;
    const myContacts = contacts.list(req.user.id);
    const notified = myContacts.length
      ? await notifyContacts(req.user.name, myContacts, { message, mapUrl: shareUrl })
      : [];

    res.status(201).json({
      alert: publicAlert(alert),
      shareUrl,
      notified,
      channels: { email: emailConfigured, sms: smsConfigured }
    });
  } catch (e) { next(e); }
});

app.get('/api/alerts', auth.requireAuth, (req, res, next) => {
  try { res.json({ alerts: alerts.listByUser(req.user.id).map(publicAlert) }); } catch (e) { next(e); }
});

app.post('/api/alerts/:id/resolve', auth.requireAuth, (req, res, next) => {
  try {
    const changed = alerts.resolve(req.user.id, Number(req.params.id));
    if (!changed) return res.status(404).json({ error: 'Active alert not found.' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Push a new GPS point to an active alert (called repeatedly while SOS is live).
app.post('/api/alerts/:id/location', auth.requireAuth, (req, res, next) => {
  try {
    const alert = alerts.findById(Number(req.params.id));
    if (!alert || alert.user_id !== req.user.id) return res.status(404).json({ error: 'Alert not found.' });
    const lat = Number.isFinite(req.body.lat) ? req.body.lat : null;
    const lng = Number.isFinite(req.body.lng) ? req.body.lng : null;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required.' });
    alerts.addLocation(alert.id, { lat, lng, accuracy: Number.isFinite(req.body.accuracy) ? req.body.accuracy : null });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- public (no auth): what a trusted contact opens ---------- */
app.get('/api/public/share/:token', (req, res, next) => {
  try {
    const alert = alerts.findByToken(req.params.token);
    if (!alert) return res.status(404).json({ error: 'This share link is not valid.' });
    const user = users.findById(alert.user_id);
    res.json({
      alert: {
        ...publicAlert(alert),
        shareToken: undefined // not needed by the viewer
      },
      owner: user ? user.name : 'Someone',
      trail: alerts.locations(alert.id, 50)
    });
  } catch (e) { next(e); }
});

app.get('/s/:token', (req, res, next) => {
  try {
    const alert = alerts.findByToken(req.params.token);
    if (!alert) return res.status(404).send(sharePage(null));
    const user = users.findById(alert.user_id);
    res.type('html').send(sharePage({ token: req.params.token, owner: user ? user.name : 'Someone' }));
  } catch (e) { next(e); }
});

/* ================= CLOUD FILES (evidence + documents) ================= */
const fsx = require('fs');
const pathx = require('path');

// multer errors (too large, wrong type) should come back as clean JSON
function uploadOne(req, res, next) {
  store.upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is too large. The limit is ' + Math.round(store.MAX_BYTES / 1048576) + ' MB.'
        : err.message;
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

function publicFile(f) {
  return {
    id: f.id, kind: f.kind, name: f.name, mime: f.mime, size: f.size,
    note: f.note, lat: f.lat, lng: f.lng, createdAt: f.created_at,
    downloadUrl: '/api/files/' + f.id + '/download'
  };
}

app.get('/api/files', auth.requireAuth, (req, res, next) => {
  try {
    res.json({
      files: files.list(req.user.id).map(publicFile),
      stats: files.stats(req.user.id),
      maxBytes: store.MAX_BYTES
    });
  } catch (e) { next(e); }
});

app.post('/api/files', auth.requireAuth, uploadOne, (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file was received.' });
    const kind = store.normaliseKind(req.body.kind, req.file.mimetype);
    const row = files.create(req.user.id, {
      kind,
      name: store.safeName(req.file.originalname, kind + '-upload'),
      mime: req.file.mimetype,
      size: req.file.size,
      storedAs: req.file.filename,
      note: clean(req.body.note, 300),
      lat: Number.isFinite(Number(req.body.lat)) && req.body.lat !== '' ? Number(req.body.lat) : null,
      lng: Number.isFinite(Number(req.body.lng)) && req.body.lng !== '' ? Number(req.body.lng) : null
    });
    res.status(201).json({ file: publicFile(row) });
  } catch (e) { next(e); }
});

app.get('/api/files/:id/download', auth.requireAuth, (req, res, next) => {
  try {
    const row = files.findById(req.user.id, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'File not found.' });
    const full = pathx.join(store.UPLOAD_DIR, pathx.basename(row.stored_as));
    if (!fsx.existsSync(full)) {
      return res.status(410).json({ error: 'That file is no longer on the server (storage is ephemeral on the free tier).' });
    }
    res.type(row.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + row.name.replace(/"/g, '') + '"');
    fsx.createReadStream(full).pipe(res);
  } catch (e) { next(e); }
});

app.delete('/api/files/:id', auth.requireAuth, (req, res, next) => {
  try {
    const row = files.findById(req.user.id, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'File not found.' });
    store.removeStored(row.stored_as);
    files.remove(req.user.id, row.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= FIR PDF ================= */
// Takes the complaint fields, renders an A4 PDF and stores it as a cloud file.
app.post('/api/fir', auth.requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const fields = {
      ref: clean(b.ref, 60), district: clean(b.district, 80), station: clean(b.station, 120),
      reportedAt: clean(b.reportedAt, 60) || new Date().toLocaleString('en-IN'),
      act: clean(b.act, 200), offence: clean(b.offence, 160),
      when: clean(b.when, 60), place: clean(b.place, 240), distance: clean(b.distance, 60),
      delay: clean(b.delay, 200), earlier: clean(b.earlier, 20),
      name: clean(b.name, 120), father: clean(b.father, 120), age: clean(b.age, 10),
      sex: clean(b.sex, 20), occupation: clean(b.occupation, 80),
      address: clean(b.address, 240), phone: clean(b.phone, 30),
      people: clean(b.people, 400), accusedAddress: clean(b.accusedAddress, 300),
      witnesses: clean(b.witnesses, 400), property: clean(b.property, 300),
      injury: clean(b.injury, 300), description: clean(b.description, 6000),
      action: clean(b.action, 160)
    };
    if (!fields.name) return res.status(400).json({ error: 'The complainant name is required.' });

    const warn = hasNonLatin(fields.description + fields.name + fields.place)
      ? 'Some text uses a non-Latin script, which the PDF font cannot draw. Use Print / Save as PDF on the page for those languages.'
      : null;

    const pdf = await buildFirPdf(fields);
    const storedAs = 'fir-' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.pdf';
    fsx.writeFileSync(pathx.join(store.UPLOAD_DIR, storedAs), pdf);

    const row = files.create(req.user.id, {
      kind: 'pdf',
      name: store.safeName('FIR-' + (fields.name || 'complaint') + '.pdf', 'FIR.pdf'),
      mime: 'application/pdf', size: pdf.length, storedAs,
      note: 'F.I.R. written complaint' + (fields.ref ? ' (' + fields.ref + ')' : ''),
      lat: Number.isFinite(Number(b.lat)) ? Number(b.lat) : null,
      lng: Number.isFinite(Number(b.lng)) ? Number(b.lng) : null
    });

    res.status(201).json({ file: publicFile(row), warning: warn });
  } catch (e) { next(e); }
});

/* ================= HEALTH + STATIC FRONTEND ================= */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'sakhi-shield',
    time: nowIso(),
    channels: { email: emailConfigured, sms: smsConfigured, llm: chat.llmConfigured }
  });
});

app.use(express.static(path.join(__dirname, '..', 'docs')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'docs', 'index.html')));

/* ---------- errors ---------- */
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------- start ---------- */
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sakhi Shield backend listening on http://localhost:${PORT}`);
    console.log(`  email alerts: ${emailConfigured ? 'configured' : 'not configured (logging only)'}`);
    console.log(`  sms alerts:   ${smsConfigured ? 'configured' : 'not configured (logging only)'}`);
  });
}

module.exports = app;
