/* ============================================================
   Sakhi Shield - shared core
   Utilities, theme, toasts, the i18n engine, the API client,
   page navigation and the chatbot widget.
   Loaded by every page, after i18n.js and data.js.
   ============================================================ */
(function () {
  'use strict';

  const SS = window.SS = {};
  SS.version = '6';

  /* ---------- DOM helpers ---------- */
  const $ = SS.$ = (sel, root) => (root || document).querySelector(sel);
  const $$ = SS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  SS.el = function (tag, attrs, html) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (html != null) n.innerHTML = html;
    return n;
  };
  SS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- storage ---------- */
  // localStorage can be unavailable (Safari private mode, cookies disabled,
  // opaque origins), so keep an in-memory copy as a session fallback.
  const MEM = {};
  SS.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        if (v != null) return JSON.parse(v);
      } catch (e) { /* unavailable */ }
      return Object.prototype.hasOwnProperty.call(MEM, key) ? MEM[key] : fallback;
    },
    set(key, val) {
      MEM[key] = val;
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* unavailable */ }
    }
  };

  /* ---------- toasts ---------- */
  SS.toast = function (msg, kind) {
    const host = $('#toastHost');
    if (!host) return;
    const t = SS.el('div', { class: 'toast' + (kind ? ' toast--' + kind : '') });
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 3200);
    setTimeout(() => t.remove(), 3600);
  };

  SS.copyText = async function (text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      SS.toast(okMsg || 'Copied to clipboard', 'ok');
      return true;
    } catch (e) {
      const ta = SS.el('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      SS.toast(ok ? (okMsg || 'Copied') : 'Could not copy - select the text manually', ok ? 'ok' : 'err');
      return ok;
    }
  };

  /* ---------- theme ---------- */
  SS.applyTheme = function (mode) {
    document.documentElement.setAttribute('data-theme', mode);
    SS.store.set('ss_theme', mode);
  };

  /* ============================================================
     i18n - English / Hindi / Kannada
     The dictionary keys are the exact English strings; nodes are
     swapped by exact match and the English original is remembered,
     so switching languages always works in any order.
     ============================================================ */
  const I18N = window.SS_I18N || { hi: {}, kn: {} };
  const SRC = new WeakMap();
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  let LANG = SS.store.get('ss_lang', 'en');

  SS.t = function (s) {
    if (!s || LANG === 'en') return s;
    const pack = I18N[LANG];
    return (pack && pack[s]) || s;
  };
  SS.getLang = () => LANG;

  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      const raw = node.nodeValue;
      let src = SRC.get(node);
      if (src === undefined) {
        const trimmed = raw.trim();
        if (!trimmed || !/[A-Za-z]/.test(trimmed)) return;
        src = trimmed;
        SRC.set(node, src);
      }
      const out = SS.t(src);
      const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
      const next = lead + out + trail;
      if (node.nodeValue !== next) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    ATTRS.forEach((a) => {
      if (!node.hasAttribute || !node.hasAttribute(a)) return;
      const key = 'data-i18n-' + a;
      if (!node.hasAttribute(key)) node.setAttribute(key, node.getAttribute(a));
      node.setAttribute(a, SS.t(node.getAttribute(key)));
    });
    if (tag !== 'SCRIPT' && tag !== 'STYLE') {
      Array.from(node.childNodes).forEach(translateNode);
    }
  }

  let applying = false;
  SS.applyI18n = function (root) {
    applying = true;
    try { translateNode(root || document.body); } finally { applying = false; }
  };
  new MutationObserver((muts) => {
    if (applying) return;
    applying = true;
    try { muts.forEach((m) => Array.from(m.addedNodes).forEach(translateNode)); }
    finally { applying = false; }
  }).observe(document.body, { childList: true, subtree: true });

  SS.setLang = function (lang) {
    LANG = ['en', 'hi', 'kn'].indexOf(lang) >= 0 ? lang : 'en';
    SS.store.set('ss_lang', LANG);
    document.documentElement.setAttribute('lang', LANG);
    $$('.lang__btn').forEach((b) => b.classList.toggle('is-on', b.dataset.lang === LANG));
    if (SS.renderChips) SS.renderChips();
    SS.applyI18n(document.body);
  };

  /* ============================================================
     API client
     Base URL order: a saved override, then
     the <meta name="api-base"> tag, then same origin.
     ============================================================ */
  // Where the backend lives. No configuration needed by the user:
  //   1. ?api=<url> in the address bar wins (escape hatch)
  //   2. a saved override, if one was set
  //   3. if this page is served BY the backend, use the same origin
  //   4. otherwise the default baked into the page
  SS.getApiBase = function () {
    try {
      const q = new URLSearchParams(location.search).get('api');
      if (q) return String(q).replace(/\/$/, '');
    } catch (e) { /* no URLSearchParams */ }
    const saved = SS.store.get('ss_api_base', '');
    if (saved) return String(saved).replace(/\/$/, '');
    const host = location.hostname || '';
    const isStaticHost = /\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/.test(host);
    if (host && !isStaticHost) return '';      // served by the backend -> same origin
    const m = document.querySelector('meta[name="api-base"]');
    return (m && m.content ? m.content : '').replace(/\/$/, '');
  };

  // Is there a real backend to talk to? Either an explicit base URL, or we are
  // being served by a server rather than a static host.
  SS.isBackendLikely = function () {
    if (SS.getApiBase()) return true;
    const host = location.hostname || '';
    if (!host) return false;
    return !/\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/.test(host);
  };
  SS.setApiBase = function (url) {
    SS.store.set('ss_api_base', url ? String(url).trim().replace(/\/$/, '') : '');
  };

  SS.getToken = () => SS.store.get('ss_token', null);
  SS.getUser = () => SS.store.get('ss_user', null);
  SS.setSession = function (token, user) {
    SS.store.set('ss_token', token || null);
    SS.store.set('ss_user', user || null);
  };

  // Every request is bounded - a sleeping or unreachable host used to leave the
  // UI stuck on "Thinking..." forever.
  SS.api = async function (path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = SS.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const ctrl = new AbortController();
    const ms = opts.timeout || 15000;
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      let res;
      try {
        res = await fetch(SS.getApiBase() + path, {
          method: opts.method || 'GET',
          headers,
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal
        });
      } catch (netErr) {
        if (netErr && netErr.name === 'AbortError') {
          throw new Error('The server did not answer within ' + Math.round(ms / 1000) + ' seconds.');
        }
        throw new Error('Cannot reach the server.');
      }

      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON */ }
      if (!res.ok) {
        // 404 on an /api/ path with no server configured = a purely static host.
        if (res.status === 404 && path.indexOf('/api/') === 0 && !SS.isBackendLikely()) {
          throw new Error('No server is connected to this site yet.');
        }
        throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      }
      return data || {};
    } finally {
      clearTimeout(timer);
    }
  };

  /* ---------- shared state (survives across pages) ---------- */
  SS.getFix = () => SS.store.get('ss_lastfix', null);
  SS.setFix = function (f) { SS.store.set('ss_lastfix', f || null); };

  SS.getContacts = () => SS.store.get('ss_contacts', []);
  SS.setContacts = function (list) { SS.store.set('ss_contacts', list || []); };

  SS.mapsLink = (f) => f ? ('https://www.google.com/maps?q=' + f.lat.toFixed(6) + ',' + f.lng.toFixed(6)) : '';
  SS.fmtFix = (f) => f ? (f.lat.toFixed(5) + ', ' + f.lng.toFixed(5) + '  (\u00b1' + Math.round(f.acc) + ' m)') : '\u2014';

  SS.currentLinkOrPrompt = async function () {
    const f = SS.getFix();
    if (f) return SS.mapsLink(f);
    const fresh = await SS.doGetLocation(true);
    return fresh ? SS.mapsLink(fresh) : null;
  };

  SS.doGetLocation = function (quiet) {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        if (!quiet) SS.toast('Geolocation is not supported here', 'err');
        resolve(null); return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const f = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, ts: Date.now() };
          SS.setFix(f);
          resolve(f);
        },
        (err) => {
          if (!quiet) SS.toast('Could not get location: ' + err.message, 'err');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
      );
    });
  };

  /* ============================================================
     Chatbot - Sakhi Assistant
     Asks the backend first (which is backed by a live AI API) and
     falls back to the built-in knowledge base when it cannot answer.
     ============================================================ */
  const D = window.SS_DATA || {};
  const CHIPS = D.CHIPS_EN || [];

  // The assistant is AI-only: every question goes to the backend, which is
  // backed by a live AI provider. There is no local canned-answer fallback.
  // The assistant runs entirely on the server, which is where the AI key lives.
  // Nothing secret is ever stored in the browser.
  async function askServer(msg) {
    const r = await SS.api('/api/chat', {
      method: 'POST',
      body: { message: msg, lang: LANG },
      timeout: 25000
    });
    return (r && r.reply) ? String(r.reply).trim() : null;
  }

  SS.renderChips = function () {
    const host = $('#chatChips');
    if (!host) return;
    host.innerHTML = '';
    CHIPS.forEach((c) => {
      const b = SS.el('button', { class: 'chip', type: 'button', text: c });
      b.addEventListener('click', () => SS.chatSend(c));
      host.appendChild(b);
    });
  };

  function addMsg(text, who) {
    const log = $('#chatLog');
    if (!log) return null;
    const m = SS.el('div', { class: 'msg msg--' + who });
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }
  SS.chatOpen = function () {
    const panel = $('#chatPanel');
    if (!panel) return;
    panel.classList.add('is-open');
    const log = $('#chatLog');
    if (log && !log.childElementCount) {
      addMsg(D.UI_STRINGS && D.UI_STRINGS[2]
        ? D.UI_STRINGS[2]
        : 'I am the Sakhi Assistant. Ask me about your rights, emergency numbers, filing a complaint, or what to do if you feel unsafe.', 'bot');
    }
    const input = $('#chatText');
    setTimeout(() => input && input.focus(), 60);
  };
  SS.chatClose = function () {
    const panel = $('#chatPanel');
    if (panel) panel.classList.remove('is-open');
  };

  SS.chatSend = async function (text) {
    const input = $('#chatText');
    const msg = String(text != null ? text : (input ? input.value : '')).trim();
    if (!msg) return;
    if (input) input.value = '';
    addMsg(msg, 'me');
    const thinking = addMsg('Thinking\u2026', 'bot');
    if (thinking) thinking.classList.add('msg--typing');

    let answer = null, why = null;
    try {
      answer = await askServer(msg);
    } catch (e) {
      why = e && e.message;
    }
    // The bubble is always cleared, whatever happened.
    if (thinking) thinking.remove();

    if (!answer) {
      addMsg(!SS.isBackendLikely()
        ? 'The assistant needs the server, which is not connected to this site yet.'
        : 'The assistant could not answer just now' + (why ? ' (' + why + ')' : '') +
          '. Please try again in a moment.', 'bot');
      return;
    }
    addMsg(answer, 'bot');
  };

  /* ---------- nav ---------- */
  function markActiveNav() {
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav a').forEach((a) => {
      const target = (a.getAttribute('href') || '').toLowerCase();
      if (target === here) a.classList.add('is-active');
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    const themeBtn = $('#themeBtn');
    SS.applyTheme(SS.store.get('ss_theme', 'auto'));
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const order = ['auto', 'light', 'dark'];
        const cur = SS.store.get('ss_theme', 'auto');
        SS.applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
      });
    }

    $$('.lang__btn').forEach((b) => b.addEventListener('click', () => SS.setLang(b.dataset.lang)));

    const fab = $('#chatFab');
    if (fab) fab.addEventListener('click', () => {
      const panel = $('#chatPanel');
      panel && panel.classList.contains('is-open') ? SS.chatClose() : SS.chatOpen();
    });
    const close = $('#chatClose');
    if (close) close.addEventListener('click', SS.chatClose);
    const send = $('#chatSend');
    if (send) send.addEventListener('click', () => SS.chatSend());
    const input = $('#chatText');
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); SS.chatSend(); }
    });

    const navChat = $('#navChatLink');
    if (navChat) navChat.addEventListener('click', (e) => { e.preventDefault(); SS.chatOpen(); });

    markActiveNav();
    SS.renderChips();
    SS.setLang(LANG);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
