'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const dbApi = require('./db');
const { users, contacts, reports, alerts, complaints } = dbApi;
const auth = require('./auth');
const { notifyContacts, emailConfigured, smsConfigured } = require('./notify');
const { sharePage } = require('./sharePage');
const chat = require('./chat');

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
