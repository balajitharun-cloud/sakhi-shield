/* ============================================================
   Sakhi Shield - content renderers
   Helplines, safety tips and legal rights. Each page only has one
   of the containers, so every renderer exits early when absent.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, el = SS.el;
  const D = window.SS_DATA || {};
  const isPhone = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  /* ---------- helplines ---------- */
  function renderHelplines() {
    const groups = { national: $('#hlNational'), women: $('#hlWomen') };
    if (!groups.national && !groups.women) return;
    (D.HELPLINES || []).forEach((h) => {
      const host = groups[h.group];
      if (!host) return;
      const row = el('div', { class: 'hl' });
      row.appendChild(el('div', { class: 'hl__num mono', text: h.num }));
      const meta = el('div', { class: 'contact__meta' });
      meta.appendChild(el('b', { text: h.name }));
      meta.appendChild(el('span', { class: 'dim', text: h.desc }));
      row.appendChild(meta);
      const call = el('a', { class: 'btn btn--sm btn--solid hl__call', href: 'tel:' + h.num, text: 'Call' });
      call.setAttribute('aria-label', 'Call ' + h.name + ' on ' + h.num);
      call.addEventListener('click', () => { if (!isPhone) SS.copyText(h.num, 'Number copied: ' + h.num); });
      row.appendChild(call);
      host.appendChild(row);
    });
  }

  /* ---------- safety tips ---------- */
  function renderTips() {
    const host = $('#tipsGrid');
    if (!host) return;
    (D.TIPS || []).forEach((t, i) => {
      const c = el('div', { class: 'tip' });
      c.appendChild(el('div', { class: 'tip__n mono', text: String(i + 1).padStart(2, '0') }));
      c.appendChild(el('p', { text: t }));
      host.appendChild(c);
    });
  }

  /* ---------- legal rights ---------- */
  function renderRights() {
    const host = $('#rightsList');
    if (!host) return;
    (D.RIGHTS || []).forEach((r) => {
      const d = el('details', { class: 'acc' });
      d.appendChild(el('summary', { text: r.q }));
      const body = el('div', { class: 'acc__body' });
      body.appendChild(el('p', { text: r.a }));
      d.appendChild(body);
      host.appendChild(d);
    });
  }

  renderHelplines();
  renderTips();
  renderRights();
})();
