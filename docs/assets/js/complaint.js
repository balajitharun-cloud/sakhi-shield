/* ============================================================
   Sakhi Shield - Form SS-1 police complaint sheet (complaint.html)
   A formal, numbered complaint form that generates a written
   complaint addressed to the Station House Officer.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$;
  const genBtn = $('#reportGenBtn');
  if (!genBtn) return;

  const v = (id) => { const n = $(id); return n ? String(n.value).trim() : ''; };
  const orDash = (s) => s || '____________________';

  function complaintRef() {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return 'SS1/' + ymd + '/' + Math.floor(Math.random() * 9000 + 1000);
  }

  function build() {
    const ref = ($('#sheetRef').textContent || '').replace(/^REF:\s*/, '');
    const when = v('#cWhen') ? new Date(v('#cWhen')).toLocaleString('en-IN') : '____________________';
    return [
      'FORM SS-1  -  COMPLAINT OF OFFENCE',
      'Reference No.: ' + ref,
      'To,',
      '  The Station House Officer,',
      '  ' + orDash(v('#cStation')) + ' Police Station',
      '',
      'SUBJECT: Complaint regarding ' + orDash(v('#cOffence')),
      '',
      'Respected Sir / Madam,',
      '',
      '1.  I, ' + orDash(v('#cName2')) + ', residing at ' + orDash(v('#cAddr')) +
        ', contact ' + orDash(v('#cPhone2')) + ', wish to lodge the following complaint.',
      '2.  Date and time of the incident: ' + when,
      '3.  Place of the incident: ' + orDash(v('#cPlace')),
      '4.  Nature of the offence: ' + orDash(v('#cOffence')),
      '5.  Person(s) involved: ' + (v('#cPeople') || 'Not known'),
      '6.  Witnesses, if any: ' + (v('#cWitness') || 'None'),
      '7.  Injury or property damage: ' + (v('#cInjury') || 'None reported'),
      '8.  Complaint made earlier: ' + (v('#cPrev') || 'No'),
      '',
      '9.  Brief facts of the incident:',
      '    ' + (v('#cDesc') || '(not described)'),
      '',
      '10. Action requested: ' + (v('#cAction') || 'Register an FIR'),
      '',
      '11. I request you to register my complaint and take appropriate action as per law.',
      '',
      'GPS coordinates at the time of filing: ' + (SS.getFix() ? SS.fmtFix(SS.getFix()) : 'Not captured'),
      'Filed on: ' + new Date().toLocaleString('en-IN'),
      '',
      'Thanking you,',
      'Yours faithfully,',
      '',
      'Signature: ____________________',
      'Name: ' + orDash(v('#cName2')),
      'Date: ____________________'
    ].join('\n');
  }

  function hasGenerated() {
    const out = $('#reportOut');
    return out && out.textContent.indexOf('FORM SS-1') !== -1;
  }

  genBtn.addEventListener('click', () => {
    if (!$('#sheetRef').textContent.includes('SS1/')) $('#sheetRef').textContent = 'REF: ' + complaintRef();
    if (!v('#cName2') || !v('#cDesc')) { SS.toast('Add your name and a description first', 'err'); return; }
    $('#reportOut').textContent = build();
    const hint = $('#complaintHint');
    if (hint) hint.textContent = $('#cDeclare').checked
      ? 'Declaration signed. This complaint is ready to submit.'
      : 'Tip: tick the declaration box before submitting this to a police station.';
    SS.toast('Complaint generated', 'ok');
  });

  const copyBtn = $('#reportCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    if (!hasGenerated()) { SS.toast('Generate the complaint first', 'err'); return; }
    SS.copyText($('#reportOut').textContent, 'Complaint copied');
  });

  const dlBtn = $('#reportDownloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', () => {
    if (!hasGenerated()) { SS.toast('Generate the complaint first', 'err'); return; }
    const blob = new Blob([$('#reportOut').textContent], { type: 'text/plain' });
    const a = SS.el('a', { href: URL.createObjectURL(blob), download: 'police-complaint.txt' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    SS.toast('Complaint downloaded', 'ok');
  });

  const clearBtn = $('#reportClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    ['#cName2', '#cPhone2', '#cAddr', '#cWhen', '#cPlace', '#cStation', '#cPeople', '#cWitness', '#cDesc', '#cInjury']
      .forEach((s) => { const n = $(s); if (n) n.value = ''; });
    if ($('#cDeclare')) $('#cDeclare').checked = false;
    $('#sheetRef').textContent = 'REF: ' + complaintRef();
    $('#reportOut').textContent = 'Your complaint text will appear here.';
    if ($('#complaintHint')) $('#complaintHint').textContent = '';
    SS.toast('Cleared');
  });

  const cloudBtn = $('#reportCloudBtn');
  if (cloudBtn) cloudBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in on the Account page first', 'err'); return; }
    const fix = SS.getFix();
    try {
      await SS.api('/api/complaints', { method: 'POST', body: {
        ref: ($('#sheetRef').textContent || '').replace(/^REF:\s*/, ''),
        offence: v('#cOffence'), station: v('#cStation'), place: v('#cPlace'),
        happenedAt: v('#cWhen'), people: v('#cPeople'), witnesses: v('#cWitness'),
        injury: v('#cInjury'), action: v('#cAction'), earlier: v('#cPrev'),
        description: v('#cDesc'), text: $('#reportOut').textContent,
        declared: $('#cDeclare').checked,
        lat: fix ? fix.lat : null, lng: fix ? fix.lng : null
      } });
      SS.toast('Complaint saved to cloud', 'ok');
    } catch (e) { SS.toast(e.message, 'err'); }
  });

  // default the date field to now and stamp a reference number
  if ($('#cWhen')) $('#cWhen').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  if ($('#sheetRef')) $('#sheetRef').textContent = 'REF: ' + complaintRef();
})();
