'use strict';

/**
 * Authentication: bcrypt password hashing + stateless JWT bearer tokens.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const TOKEN_TTL = '30d';
const ROUNDS = 10;

if (process.env.NODE_ENV === 'production' && SECRET === 'dev-insecure-secret-change-me') {
  console.warn('[auth] WARNING: JWT_SECRET is unset in production. Set it in your host env vars.');
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

/** Express middleware: requires a valid `Authorization: Bearer <token>`. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Not authenticated. Provide a valid Bearer token.' });
  }
  req.user = { id: payload.sub, email: payload.email, name: payload.name };
  next();
}

/** Public shape of a user - never leak password_hash. */
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.created_at };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth, publicUser };
