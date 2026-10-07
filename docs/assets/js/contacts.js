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

  render();
})();
