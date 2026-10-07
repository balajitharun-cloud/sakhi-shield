/* ============================================================
   Sakhi Shield - account & cloud sync (account.html)

   Two separate status areas:
     #serverHint  - is the backend reachable?
     #apiHint     - what happened with the sign-in / sign-up attempt

   The backend URL can be set right here in the UI (saved to this
   device), so a front-end on GitHub Pages can talk to a backend on
   Render without editing any code.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$;
  const forms = $('#authForms');
  if (!forms) return;

  let mode = 'login';

  /* ---------- status helpers ---------- */
  function setServerHint(text) {
    const n = $('#serverHint');
    if (n) n.textContent = text;
  }
  function setAuthHint(text, kind) {
    const n = $('#apiHint');
    if (!n) return;
    n.textContent = text || '';
    n.style.color = kind === 'err' ? 'var(--sos)' : kind === 'ok' ? 'var(--safe)' : '';
  }

  /* ---------- backend connection ---------- */
  const urlInput = $('#serverUrl');
  if (urlInput) urlInput.value = SS.getApiBase();

  function describeBase() {
    const base = SS.getApiBase();
    setServerHint(base
      ? 'Backend set to ' + base + '. Press Test connection to check it.'
      : 'No backend set. The app works fully offline; add a backend URL to enable accounts, cloud sync and real SOS alerts.');
  }

  async function testConnection() {
    setServerHint('Checking the backend\u2026');
    try {
      const r = await SS.api('/api/health');
      const c = r.channels || {};
      const on = (v) => (v ? 'on' : 'off');
      setServerHint('Connected. Alerts - email: ' + on(c.email) + ', SMS: ' + on(c.sms) + ', AI chat: ' + on(c.llm) + '.');
      SS.toast('Backend connected', 'ok');
      return true;
    } catch (e) {
      setServerHint('Not reachable (' + e.message + '). Deploy the backend on Render, paste its URL above and press Save.');
      return false;
    }
  }

  const saveBtn = $('#saveServerBtn');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    SS.setApiBase(urlInput ? urlInput.value : '');
    SS.toast('Backend URL saved on this device', 'ok');
    await testConnection();
  });

  const clearBtn = $('#clearServerBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    SS.setApiBase('');
    if (urlInput) urlInput.value = '';
    describeBase();
    setAuthHint('');
    SS.toast('Backend URL cleared');
  });

  const testBtn = $('#testServerBtn');
  if (testBtn) testBtn.addEventListener('click', testConnection);

  /* ---------- form validation ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function validate(name, email, password) {
    if (mode === 'register' && !name) return 'Please enter your name.';
    if (!email) return 'Please enter your email address.';
    if (!EMAIL_RE.test(email)) return 'That email address does not look right.';
    if (!password) return 'Please enter a password.';
    if (mode === 'register' && password.length < 6) return 'Your password must be at least 6 characters long.';
    return null;
  }

  /* ---------- auth UI ---------- */
  function setMode(m) {
    mode = m;
    const nameField = $('#nameField');
    if (nameField) nameField.hidden = m !== 'register';
    const submit = $('#authSubmit');
    if (submit) submit.textContent = m === 'register' ? 'Create account' : 'Log in';
    const tl = $('#tabLogin'), tr = $('#tabRegister');
    if (tl) tl.className = 'btn' + (m === 'login' ? ' btn--solid' : '');
    if (tr) tr.className = 'btn' + (m === 'register' ? ' btn--solid' : '');
    const hint = $('#passwordHint');
    if (hint) hint.hidden = m !== 'register';
    setAuthHint('');
  }

  function setUI() {
    const user = SS.getUser(), token = SS.getToken();
    const signedIn = Boolean(token && user);
    forms.hidden = signedIn;
    const status = $('#authStatus');
    if (status) status.hidden = !signedIn;
    if (signedIn) {
      const who = $('#acctWho');
      if (who) who.textContent = user.name + ' \u00b7 ' + user.email;
      const count = $('#acctCount');
      if (count) count.textContent = SS.getContacts().length + ' contact(s) saved on this device.';
      setAuthHint('Signed in.', 'ok');
    } else {
      setAuthHint(SS.getApiBase() ? '' : 'Accounts need a backend. Add its URL above and press Save.');
    }
  }

  async function pushContacts() {
    const contacts = SS.getContacts();
    if (!contacts.length) return 0;
    let added = 0;
    for (const c of contacts) {
      try { await SS.api('/api/contacts', { method: 'POST', body: { name: c.name, phone: c.phone } }); added++; }
      catch (e) { /* duplicates are fine */ }
    }
    return added;
  }

  const tabLogin = $('#tabLogin'), tabRegister = $('#tabRegister');
  if (tabLogin) tabLogin.addEventListener('click', () => setMode('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => setMode('register'));

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = ($('#acctName').value || '').trim();
    const email = ($('#acctEmail').value || '').trim();
    const password = $('#acctPass').value || '';

    const problem = validate(name, email, password);
    if (problem) { setAuthHint(problem, 'err'); SS.toast(problem, 'err'); return; }

    const submit = $('#authSubmit');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = mode === 'register' ? 'Creating your account\u2026' : 'Signing in\u2026';
    setAuthHint('');

    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register' ? { name, email, password } : { email, password };
      const r = await SS.api(path, { method: 'POST', body });
      SS.setSession(r.token, r.user);
      setUI();
      SS.toast(mode === 'register' ? 'Account created - welcome, ' + r.user.name : 'Signed in as ' + r.user.name, 'ok');
      if (mode === 'register') {
        const added = await pushContacts();
        if (added) SS.toast('Also synced ' + added + ' contact(s) to your new account', 'ok');
      }
    } catch (err) {
      let msg = err.message || 'Something went wrong.';
      if (/Cannot reach the server/i.test(msg)) {
        msg = 'No backend reachable. Add your backend URL above, press Save, then try again.';
      } else if (/already registered/i.test(msg)) {
        msg = 'That email already has an account - switch to Log in.';
      } else if (/Failed to fetch|NetworkError/i.test(msg)) {
        msg = 'Network problem reaching the backend. Check the URL and try again.';
      }
      setAuthHint(msg, 'err');
      SS.toast(msg, 'err');
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });

  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    SS.setSession(null, null);
    setUI();
    SS.toast('Logged out');
  });

  const syncBtn = $('#syncContactsBtn');
  if (syncBtn) syncBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in first', 'err'); return; }
    if (!SS.getContacts().length) { SS.toast('No local contacts to sync', 'err'); return; }
    const added = await pushContacts();
    SS.toast('Synced ' + added + ' contact(s)', added ? 'ok' : 'err');
  });

  /* ---------- AI assistant settings (browser mode) ---------- */
  const aiProvider = $('#aiProvider'), aiKey = $('#aiKey');

  function paintAI() {
    const cfg = SS.getAI();
    if (aiProvider) aiProvider.value = cfg.provider || 'pollinations';
    if (aiKey) aiKey.value = cfg.key || '';
    const hint = $('#aiHint');
    if (!hint) return;
    const p = cfg.provider || 'pollinations';
    if (p !== 'pollinations' && !cfg.key) {
      hint.textContent = 'Add an API key for ' + p + ', then press Save.';
    } else {
      hint.textContent = 'Ready: ' + p + (cfg.key ? ' (key saved on this device)' : ' (no key needed)') +
        '. The chatbot uses this when the backend is not connected.';
    }
  }

  const aiSave = $('#aiSaveBtn');
  if (aiSave) aiSave.addEventListener('click', () => {
    SS.setAI({
      provider: aiProvider ? aiProvider.value : 'pollinations',
      key: aiKey ? aiKey.value.trim() : '',
      model: ''
    });
    paintAI();
    SS.toast('AI settings saved on this device', 'ok');
  });

  const aiTest = $('#aiTestBtn');
  if (aiTest) aiTest.addEventListener('click', async () => {
    const hint = $('#aiHint');
    if (hint) hint.textContent = 'Asking the assistant\u2026';
    const reply = await SS.askDirect('Reply with exactly: OK');
    if (hint) {
      hint.textContent = reply
        ? 'Working. The assistant replied: ' + String(reply).slice(0, 80)
        : 'No reply from ' + (SS.getAI().provider || 'pollinations') + '. Check the key, or try another provider.';
    }
    SS.toast(reply ? 'AI assistant is working' : 'AI assistant did not respond', reply ? 'ok' : 'err');
  });
  paintAI();

  /* ---------- boot ---------- */
  setMode('login');
  setUI();
  describeBase();
  testConnection();
})();
