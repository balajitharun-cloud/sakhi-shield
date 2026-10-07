'use strict';

/**
 * File storage for cloud evidence.
 *
 * Uploads are written to disk under DATA_DIR/uploads and described by a row in
 * the `files` table. Only the owning user can list, download or delete them.
 *
 * NOTE: on Render's free tier the disk is ephemeral, so uploads are lost on a
 * redeploy or restart - the same as the SQLite database. Attach a persistent
 * disk (paid) or move this to object storage for anything real.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const DATA_DIR = path.dirname(require('./db').DB_PATH);
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024); // 25 MB

const KINDS = ['photo', 'audio', 'video', 'pdf', 'other'];

// Only allow types this app actually produces, plus a couple of document types.
const ALLOWED = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav',
  'video/webm', 'video/mp4', 'video/quicktime',
  'application/pdf', 'text/plain'
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // never trust the client filename on disk
    const ext = path.extname(file.originalname || '').slice(0, 10).replace(/[^.\w]/g, '') || '';
    cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext);
  }
});

function fileFilter(req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase();
  if (ALLOWED.indexOf(mime) >= 0) return cb(null, true);
  cb(new Error('Unsupported file type: ' + (mime || 'unknown')));
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_BYTES, files: 1 } });

/** Safe original name for display / download. */
function safeName(name, fallback) {
  const base = path.basename(String(name || '')).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  return base || fallback || 'file';
}

function normaliseKind(kind, mime) {
  const k = String(kind || '').toLowerCase();
  if (KINDS.indexOf(k) >= 0) return k;
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'photo';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  return 'other';
}

function removeStored(storedAs) {
  if (!storedAs) return;
  const full = path.join(UPLOAD_DIR, path.basename(storedAs));
  fs.unlink(full, () => {});   // best effort
}

module.exports = { upload, UPLOAD_DIR, MAX_BYTES, safeName, normaliseKind, removeStored, ALLOWED, KINDS };
