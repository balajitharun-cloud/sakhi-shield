/* ============================================================
   Sakhi Shield - trusted contacts (contacts.html)
   Stored on the device; optionally synced to the server account.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, el = SS.el;
  const host = $('#contactList');
  if (!host) return;
  const empty = $('#contactEmpty');
  let contacts = SS.getContacts();

  function render() {
    host.innerHTML = '';
    if (!contacts.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    contacts.forEach((c, i) => {
      const row = el('div', { class: 'contact' });
      row.appendChild(el('div', { class: 'avatar', text: (c.name || '?').trim().charAt(0).toUpperCase() }));
      const meta = el('div', { class: 'contact__meta' });
      meta.appendChild(el('b', { text: c.name }));
      meta.appendChild(el('span', { text: c.phone || c.email || '' }));
      row.appendChild(meta);
      const del = el('button', { class: 'btn btn--sm btn--ghost contact__del', text: '\u2715' });
      del.setAttribute('aria-label', 'Remove ' + c.name);
      del.addEventListener('click', () => {
        contacts.splice(i, 1); SS.setContacts(contacts); render();
        SS.toast('Removed ' + c.name);
      });
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  const form = $('#contactForm');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#cName').value.trim();
    const phone = $('#cPhone').value.trim();
    if (!name || !phone) return;
    if (contacts.length >= 8) { SS.toast('Up to 8 trusted contacts', 'err'); return; }
    contacts.push({ name, phone });
    SS.setContacts(contacts); render(); form.reset();
    SS.toast('Added ' + name, 'ok');
  });

  const syncBtn = $('#syncContactsBtn');
  if (syncBtn) syncBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in on the Account page first', 'err'); return; }
    if (!contacts.length) { SS.toast('No local contacts to sync', 'err'); return; }
    let added = 0, skipped = 0;
    for (const c of contacts) {
      try { await SS.api('/api/contacts', { method: 'POST', body: { name: c.name, phone: c.phone } }); added++; }
      catch (e) { skipped++; }
    }
    SS.toast('Synced ' + added + ' contact(s)' + (skipped ? ' \u00b7 ' + skipped + ' skipped' : ''), added ? 'ok' : 'err');
  });

  const loadBtn = $('#loadCloudContacts');
  if (loadBtn) loadBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in on the Account page first', 'err'); return; }
    try {
      const r = await SS.api('/api/contacts');
      const cloud = r.contacts || [];
      cloud.forEach((c) => {
        if (!contacts.some((x) => x.phone === c.phone)) contacts.push({ name: c.name, phone: c.phone });
      });
      SS.setContacts(contacts); render();
      SS.toast('Pulled ' + cloud.length + ' contact(s) from the cloud', 'ok');
    } catch (e) { SS.toast(e.message, 'err'); }
  });

  render();
})();
