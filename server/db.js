'use strict';

/**
 * SQLite persistence layer.
 *
 * Uses better-sqlite3 (synchronous, no connection pool needed) so the whole
 * data layer stays in one small file. Swap this module for Postgres later
 * without touching the routes: they only use the exported helper functions.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sakhi.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  phone      TEXT,
  email      TEXT,
  created_at TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  happened_at TEXT,
  place       TEXT,
  people      TEXT,
  description TEXT,
  lat         REAL,
  lng         REAL,
  created_at  TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  lat         REAL,
  lng         REAL,
  accuracy    REAL,
  message     TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',
  share_token TEXT    NOT NULL UNIQUE,
  created_at  TEXT    NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS locations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  lat      REAL,
  lng      REAL,
  accuracy REAL,
  ts       TEXT    NOT NULL,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user  ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user   ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_alert ON locations(alert_id);

CREATE TABLE IF NOT EXISTS complaints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  ref         TEXT,
  offence     TEXT,
  station     TEXT,
  place       TEXT,
  happened_at TEXT,
  people      TEXT,
  witnesses   TEXT,
  injury      TEXT,
  action      TEXT,
  earlier     TEXT,
  description TEXT,
  text        TEXT,
  declared    INTEGER NOT NULL DEFAULT 0,
  lat         REAL,
  lng         REAL,
  created_at  TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
`);

const now = () => new Date().toISOString();

/* ---------- users ---------- */
const users = {
  create({ name, email, passwordHash }) {
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
    ).run(name, email.toLowerCase(), passwordHash, now());
    return users.findById(info.lastInsertRowid);
  },
  findByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  },
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
};

/* ---------- contacts ---------- */
const contacts = {
  list(userId) {
    return db.prepare(
      'SELECT id, name, phone, email, created_at FROM contacts WHERE user_id = ? ORDER BY id'
    ).all(userId);
  },
  create(userId, { name, phone, email }) {
    const info = db.prepare(
      'INSERT INTO contacts (user_id, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, name, phone || null, email || null, now());
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid);
  },
  remove(userId, id) {
    return db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, userId).changes;
  },
  count(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id = ?').get(userId).n;
  }
};

/* ---------- reports ---------- */
const reports = {
  list(userId) {
    return db.prepare(
      'SELECT * FROM reports WHERE user_id = ? ORDER BY id DESC'
    ).all(userId);
  },
  create(userId, r) {
    const info = db.prepare(
      `INSERT INTO reports (user_id, happened_at, place, people, description, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, r.happenedAt || null, r.place || null, r.people || null,
          r.description || null, r.lat ?? null, r.lng ?? null, now());
    return db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
  },
  remove(userId, id) {
    return db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }
};

/* ---------- complaints (Form SS-1 police complaint sheets) ---------- */
const complaints = {
  list(userId) {
    return db.prepare('SELECT * FROM complaints WHERE user_id = ? ORDER BY id DESC').all(userId);
  },
  create(userId, c) {
    const info = db.prepare(
      `INSERT INTO complaints
        (user_id, ref, offence, station, place, happened_at, people, witnesses, injury,
         action, earlier, description, text, declared, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, c.ref || null, c.offence || null, c.station || null, c.place || null,
          c.happenedAt || null, c.people || null, c.witnesses || null, c.injury || null,
          c.action || null, c.earlier || null, c.description || null, c.text || null,
          c.declared ? 1 : 0, c.lat ?? null, c.lng ?? null, now());
    return db.prepare('SELECT * FROM complaints WHERE id = ?').get(info.lastInsertRowid);
  },
  remove(userId, id) {
    return db.prepare('DELETE FROM complaints WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }
};

/* ---------- alerts + locations ---------- */
const alerts = {
  create(userId, { lat, lng, accuracy, message, shareToken }) {
    const info = db.prepare(
      `INSERT INTO alerts (user_id, lat, lng, accuracy, message, status, share_token, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run(userId, lat ?? null, lng ?? null, accuracy ?? null, message || null, shareToken, now());
    return alerts.findById(info.lastInsertRowid);
  },
  findById(id) {
    return db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  },
  findByToken(token) {
    return db.prepare('SELECT * FROM alerts WHERE share_token = ?').get(token);
  },
  listByUser(userId, limit = 50) {
    return db.prepare(
      'SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    ).all(userId, limit);
  },
  resolve(userId, id) {
    return db.prepare(
      `UPDATE alerts SET status = 'resolved', resolved_at = ?
       WHERE id = ? AND user_id = ? AND status = 'active'`
    ).run(now(), id, userId).changes;
  },
  addLocation(alertId, { lat, lng, accuracy }) {
    db.prepare(
      'INSERT INTO locations (alert_id, lat, lng, accuracy, ts) VALUES (?, ?, ?, ?, ?)'
    ).run(alertId, lat ?? null, lng ?? null, accuracy ?? null, now());
    // keep the alert row's headline fix in sync
    db.prepare('UPDATE alerts SET lat = ?, lng = ?, accuracy = ? WHERE id = ?')
      .run(lat ?? null, lng ?? null, accuracy ?? null, alertId);
  },
  locations(alertId, limit = 200) {
    return db.prepare(
      'SELECT lat, lng, accuracy, ts FROM locations WHERE alert_id = ? ORDER BY id DESC LIMIT ?'
    ).all(alertId, limit).reverse();
  }
};

module.exports = { db, users, contacts, reports, alerts, complaints, DB_PATH };
