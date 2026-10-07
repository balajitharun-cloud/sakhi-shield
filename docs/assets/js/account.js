/* ============================================================
   Sakhi Shield - account & cloud sync (account.html)

   Fixes the old "server not reachable" dead end: the backend URL can
   be set right here in the UI (saved to this device), so a front-end
   hosted on GitHub Pages can talk to a backend hosted on Render
   without editing any code.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, $$ = SS.$$;
  const forms = $('#authForms');
  if (!forms) return;

  let mode = 'login';

  /* ---------- connection settings ---------- */
  const urlInput = $('#serverUrl');
  if (urlInput) urlInput.value = SS.getApiBase();

  function paintStatus() {
    const hint = $('#apiHint');
    if (!hint) return;
    const base = SS.getApiBase();
    hint.textContent = base
      ? 'Backend set to ' + base + '. Use Test connection to check it.'
      : 'No backend set. Using this same site as the backend (works when you run the server locally or on Render).';
  }

  const saveBtn = $('#saveServerBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    SS.setApiBase(urlInput ? urlInput.value : '');
    paintStatus();
    SS.toast('Backend URL saved on this device', 'ok');
    testConnection();
  });

  const clearBtn = $('#clearServerBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    SS.setApiBase('');
    if (urlInput) urlInput.value = '';
    paintStatus();
    SS.toast('Backend URL cleared');
  });

  async function testConnection() {
    const hint = $('#apiHint');
    if (hint) hint.textContent = 'Checking the backend\u2026';
    try {
      const r = await SS.api('/api/health');
      const c = r.channels || {};
      const on = (v) => (v ? 'on' : 'off');
      if (hint) {
        hint.textContent = 'Connected. Alerts - email: ' + on(c.email) +
          ', SMS: ' + on(c.sms) + ', AI chat: ' + on(c.llm) + '.';
      }
      SS.toast('Backend connected', 'ok');
      return true;
    } catch (e) {
      if (hint) {
        hint.textContent = 'Not reachable (' + e.message + '). ' +
          'Deploy the backend on Render, then paste its URL above and Save.';
      }
      return false;
    }
  }
  const testBtn = $('#testServerBtn');
  if (testBtn) testBtn.addEventListener('click', testConnection);

  /* ---------- auth UI ---------- */
  function setMode(m) {
    mode = m;
    $('#nameField').hidden = m !== 'register';
    $('#authSubmit').textContent = m === 'register' ? 'Create account' : 'Log in';
    $('#tabLogin').className = 'btn' + (m === 'login' ? ' btn--solid' : '');
    $('#tabRegister').className = 'btn' + (m === 'register' ? ' btn--solid' : '');
  }
  function setUI() {
    const user = SS.getUser(), token = SS.getToken();
    const signedIn = Boolean(token && user);
    forms.hidden = signedIn;
    $('#authStatus').hidden = !signedIn;
    if (signedIn) $('#acctWho').textContent = user.name + ' \u00b7 ' + user.email;
  }

  $('#tabLogin').addEventListener('click', () => setMode('login'));
  $('#tabRegister').addEventListener('click', () => setMode('register'));

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#acctEmail').value.trim();
    const password = $('#acctPass').value;
    const name = $('#acctName').value.trim();
    const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const body = mode === 'register' ? { name, email, password } : { email, password };
    try {
      const r = await SS.api(path, { method: 'POST', body });
      SS.setSession(r.token, r.user);
      setUI();
      SS.toast('Signed in as ' + r.user.name, 'ok');
    } catch (err) { SS.toast(err.message, 'err'); }
  });

  $('#logoutBtn').addEventListener('click', () => {
    SS.setSession(null, null);
    setUI();
    SS.toast('Logged out');
  });

  const syncBtn = $('#syncContactsBtn');
  if (syncBtn) syncBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in first', 'err'); return; }
    const contacts = SS.getContacts();
    if (!contacts.length) { SS.toast('No local contacts to sync', 'err'); return; }
    let added = 0, skipped = 0;
    for (const c of contacts) {
      try { await SS.api('/api/contacts', { method: 'POST', body: { name: c.name, phone: c.phone } }); added++; }
      catch (e) { skipped++; }
    }
    SS.toast('Synced ' + added + ' contact(s)' + (skipped ? ' \u00b7 ' + skipped + ' skipped' : ''), added ? 'ok' : 'err');
  });

  /* ---------- boot ---------- */
  setMode('login');
  setUI();
  paintStatus();
  testConnection();
})();
