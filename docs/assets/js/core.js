/* ============================================================
   Sakhi Shield - shared core
   Utilities, theme, toasts, the i18n engine, the API client,
   page navigation and the chatbot widget.
   Loaded by every page, after i18n.js and data.js.
   ============================================================ */
(function () {
  'use strict';

  const SS = window.SS = {};

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
     Base URL order: what the user saved in the Account page, then
     the <meta name="api-base"> tag, then same origin.
     ============================================================ */
  SS.getApiBase = function () {
    const saved = SS.store.get('ss_api_base', '');
    if (saved) return String(saved).replace(/\/$/, '');
    const m = document.querySelector('meta[name="api-base"]');
    return (m && m.content ? m.content : '').replace(/\/$/, '');
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

  SS.api = async function (path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = SS.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(SS.getApiBase() + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (netErr) {
      throw new Error('Cannot reach the server. Is the backend running?');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      // A 404 on an /api/ path with no backend configured means the site is
      // being served statically (e.g. GitHub Pages) and has no server at all.
      if (res.status === 404 && path.indexOf('/api/') === 0 && !SS.getApiBase()) {
        throw new Error('No backend is connected to this site yet. Open the Account page and add your backend URL.');
      }
      throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    }
    return data || {};
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
  async function askServer(msg) {
    try {
      const r = await SS.api('/api/chat', { method: 'POST', body: { message: msg, lang: LANG } });
      return (r && r.reply) ? r.reply : null;
    } catch (e) { return null; }
  }

  /* ---------- direct (browser) AI, for when there is no backend ---------- */
  const AI_SYSTEM =
    'You are Sakhi Assistant, a calm, practical safety assistant for women in India. ' +
    'Give short, concrete, actionable steps. Never blame the user. Mention the relevant ' +
    'Indian helpline or law when useful (112 emergency, 181 women helpline, 1091, 1930 cyber). ' +
    'You are not a lawyer or a doctor. Keep answers under 120 words.';

  SS.getAI = () => SS.store.get('ss_ai', { provider: 'pollinations', key: '', model: '' });
  SS.setAI = (v) => SS.store.set('ss_ai', v);

  // Guess the provider from the shape of the key, so a pasted key "just works".
  function detectProvider(key) {
    const k = String(key || '').trim();
    if (/^gsk_/.test(k)) return 'groq';
    if (/^AIza/.test(k)) return 'gemini';
    if (/^sk-or-/.test(k)) return 'openrouter';
    if (/^sk-/.test(k)) return 'openai';
    return null;
  }
  SS.detectProvider = detectProvider;

  // Returns { reply } on success or { error } with a human-readable reason.
  // Providers retire model ids on a schedule, so never trust a hard-coded name.
  // Ask the provider what it actually serves and pick from that.
  function preferFlash(names) {
    const score = (n) => {
      let s = 0;
      if (n.indexOf('flash') >= 0) s += 100;
      if (n.indexOf('lite') >= 0) s += 10;
      if (n.indexOf('preview') >= 0 || n.indexOf('exp') >= 0) s -= 25;
      const v = n.match(/(\d+)\.(\d+)/);
      if (v) s += parseInt(v[1], 10) * 10 + parseInt(v[2], 10);
      return s;
    };
    return names.slice().sort((a, b) => score(b) - score(a));
  }

  async function discoverModels(provider, key, signal) {
    try {
      if (provider === 'gemini') {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' +
          encodeURIComponent(key), { signal });
        if (!r.ok) return [];
        const d = await r.json().catch(() => null);
        const names = ((d && d.models) || [])
          .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
          .map((m) => String(m.name || '').replace(/^models\//, ''))
          .filter((n) => n && n.indexOf('embedding') < 0 && n.indexOf('aqa') < 0);
        return preferFlash(names);
      }
      const bases = {
        groq: 'https://api.groq.com/openai/v1',
        openai: 'https://api.openai.com/v1',
        openrouter: 'https://openrouter.ai/api/v1'
      };
      const base = bases[provider];
      if (!base) return [];
      const r = await fetch(base + '/models', {
        headers: { Authorization: 'Bearer ' + key }, signal
      });
      if (!r.ok) return [];
      const d = await r.json().catch(() => null);
      const names = ((d && d.data) || []).map((m) => m.id).filter(Boolean)
        .filter((n) => !/whisper|guard|tts|embed|moderation|image|audio/i.test(n));
      return preferFlash(names);
    } catch (e) {
      return [];
    }
  }

  async function directCall(msg) {
    const cfg = SS.getAI();
    const provider = cfg.provider || 'pollinations';
    const key = String(cfg.key || '').trim();
    const configured = String(cfg.model || '').trim();
    const langName = { en: 'English', hi: 'Hindi', kn: 'Kannada' }[LANG] || 'English';
    const system = AI_SYSTEM + ' Reply in ' + langName + '.';

    if (provider !== 'pollinations' && !key) {
      return { error: 'No API key saved for ' + provider + '. Paste the key and press Save.' };
    }
    if (provider === 'pollinations' && key) {
      return { error: 'A key is saved but the provider is still "pollinations". Choose Groq or Gemini and press Save.' };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const describe = (status, detail) =>
      provider + ' returned HTTP ' + status + (detail ? ' - ' + detail : '');

    try {
      if (provider === 'pollinations') {
        const url = 'https://text.pollinations.ai/' +
          encodeURIComponent(system + '\n\n' + msg) + '?model=' + encodeURIComponent(configured || 'openai');
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) return { error: describe(r.status) };
        const t = await r.text();
        return t ? { reply: t.trim() } : { error: 'pollinations returned an empty reply.' };
      }

      // Build the candidate list: what the user chose, then what the provider
      // actually serves right now, then a small safety net.
      const SAFETY = {
        gemini: ['gemini-3.8-flash', 'gemini-2.5-flash'],
        groq: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
        openai: ['gpt-4o-mini'],
        openrouter: ['meta-llama/llama-3.1-8b-instruct:free']
      };
      const discovered = await discoverModels(provider, key, ctrl.signal);
      let models = (configured ? [configured] : []).concat(discovered, SAFETY[provider] || []);
      models = models.filter((m, i) => m && models.indexOf(m) === i);

      let last = null;
      for (const m of models) {
        if (provider === 'gemini') {
          const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            m + ':generateContent?key=' + encodeURIComponent(key);
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: msg }] }]
            }),
            signal: ctrl.signal
          });
          const d = await r.json().catch(() => null);
          if (r.ok) {
            const c = d && d.candidates && d.candidates[0] && d.candidates[0].content;
            const t = c && c.parts && c.parts[0] && c.parts[0].text;
            if (t) return { reply: String(t).trim(), model: m };
            last = { error: 'Gemini (' + m + ') returned no text.' };
            continue;
          }
          last = { error: describe(r.status, d && d.error && d.error.message) };
          if (r.status === 404 || r.status === 400) continue;   // model gone - try the next
          return last;
        }

        const bases = {
          groq: 'https://api.groq.com/openai/v1',
          openai: 'https://api.openai.com/v1',
          openrouter: 'https://openrouter.ai/api/v1'
        };
        const base = bases[provider];
        if (!base) return { error: 'Unknown provider: ' + provider };
        const r = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({
            model: m,
            messages: [{ role: 'system', content: system }, { role: 'user', content: msg }],
            temperature: 0.3,
            max_tokens: 400
          }),
          signal: ctrl.signal
        });
        const d = await r.json().catch(() => null);
        if (r.ok) {
          const t = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
          if (t) return { reply: String(t).trim(), model: m };
          last = { error: provider + ' (' + m + ') returned no text.' };
          continue;
        }
        last = { error: describe(r.status, d && d.error && d.error.message) };
        if (r.status === 404) continue;   // model retired - try the next
        return last;
      }
      return last || { error: provider + ' had no usable model. Set one in the Model field.' };
    } catch (e) {
      return { error: (e && e.name === 'AbortError') ? 'Timed out after 25s.' : 'Network error: ' + (e && e.message) };
    } finally {
      clearTimeout(timer);
    }
  }

  SS.askDirect = async function (msg) { const r = await directCall(msg); return r.reply || null; };
  SS.askDirectDebug = directCall;

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

    // AI only - the backend first, then a direct browser call if there is no
    // backend connected. If both fail, say so plainly.
    let answer = await askServer(msg);
    if (!answer) answer = await askDirect(msg);
    if (!answer) {
      answer = 'I could not reach the AI service just now. Open the Account page to set your AI provider, or try again in a moment.';
    }
    if (thinking) thinking.remove();
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
