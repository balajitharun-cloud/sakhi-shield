/* ============================================================
   Sakhi Shield - F.I.R. builder (complaint.html)

   Fills an A4 F.I.R.-format sheet live from the form, produces a
   plain-text copy, and exports the sheet as a standalone A4 HTML
   file or via the browser's print / Save-as-PDF.
   ============================================================ */
(function () {
  'use strict';
  const SS = window.SS, $ = SS.$, el = SS.el;
  const sheet = $('#a4sheet');
  if (!sheet) return;

  /* ---------- fields -> sheet spans ---------- */
  const MAP = [
    ['#cName2', '#fName'], ['#cFather', '#fFather'], ['#cAge', '#fAge'],
    ['#cSex', '#fSex'], ['#cOccupation', '#fOccupation'], ['#cAddr', '#fAddr'],
    ['#cPhone2', '#fPhone'], ['#cDistrict', '#fDistrict'], ['#cStation', '#fStation'],
    ['#sheetRef', '#fRef'], ['#cWhen', '#fWhen'], ['#cPlace', '#fPlace'],
    ['#cDistance', '#fDistance'], ['#cOffence', '#fOffence'], ['#cAct', '#fAct'],
    ['#cDelay', '#fDelay'], ['#cPrev', '#fPrev'], ['#cPeople', '#fPeople'],
    ['#cAccusedAddr', '#fAccusedAddr'], ['#cWitness', '#fWitness'],
    ['#cProperty', '#fProperty'], ['#cInjury', '#fInjury'],
    ['#cDesc', '#fDesc'], ['#cAction', '#fAction']
  ];

  function v(sel) { const n = $(sel); return n ? String(n.value).trim() : ''; }

  function fmtWhen(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function ref() {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
    return 'SS-' + ymd + '-' + Math.floor(Math.random() * 9000 + 1000);
  }

  function put(sel, text, fallback) {
    const n = $(sel);
    if (!n) return;
    const val = text || '';
    n.textContent = val || fallback || '\u2014';
    n.classList.toggle('empty', !val && Boolean(fallback));
  }

  function sync() {
    MAP.forEach(([from, to]) => {
      let val = v(from);
      if (from === '#cWhen') val = fmtWhen(val);
      const fallbacks = {
        '#fPeople': 'Not known', '#fAccusedAddr': 'Not known', '#fWitness': 'None',
        '#fProperty': 'None', '#fInjury': 'None reported', '#fDelay': 'None',
        '#fPrev': 'No', '#fAction': 'Register an FIR', '#fDesc': 'To be written by the complainant.'
      };
      put(to, val, fallbacks[to]);
    });
    // hide the distance parenthesis when there is no distance
    const wrap = $('#fDistanceWrap');
    if (wrap) wrap.style.display = v('#cDistance') ? '' : 'none';

    const out = $('#reportOut');
    if (out) out.textContent = plainText();
    const hint = $('#complaintHint');
    if (hint) {
      hint.textContent = $('#cDeclare') && $('#cDeclare').checked
        ? 'Declaration signed. Print or save this and carry it to the police station.'
        : 'Tip: tick the declaration and sign the printed sheet before submitting it.';
    }
  }

  /* ---------- plain-text version ---------- */
  function plainText() {
    const g = (sel, fb) => v(sel) || fb || '____________________';
    const when = fmtWhen(v('#cWhen')) || '____________________';
    return [
      'FIRST INFORMATION REPORT (written complaint)',
      '(Under Section 173 BNSS, 2023 - formerly Section 154 Cr.P.C.)',
      '------------------------------------------------------------',
      'Complainant\'s reference : ' + g('#sheetRef', '\u2014'),
      'Date & time of report   : ' + (($('#fReported') || {}).textContent || ''),
      'District                : ' + g('#cDistrict'),
      'Police station          : ' + g('#cStation'),
      '',
      'A. PARTICULARS OF THE OCCURRENCE',
      '1. Act and sections      : ' + g('#cAct'),
      '2. Nature of offence     : ' + g('#cOffence'),
      '3. Date & time           : ' + when,
      '4. Place of occurrence   : ' + g('#cPlace') +
        (v('#cDistance') ? '  (approx. ' + v('#cDistance') + ' from the police station)' : ''),
      '5. Delay in reporting    : ' + g('#cDelay', 'None'),
      '6. Complaint made earlier: ' + g('#cPrev', 'No'),
      '',
      'B. COMPLAINANT',
      'Name                     : ' + g('#cName2'),
      'Father / husband         : ' + g('#cFather'),
      'Age / sex                : ' + g('#cAge', '\u2014') + ' / ' + g('#cSex', '\u2014'),
      'Occupation               : ' + g('#cOccupation'),
      'Address                  : ' + g('#cAddr'),
      'Contact number           : ' + g('#cPhone2'),
      '',
      'C. ACCUSED / SUSPECTS',
      'Name or description      : ' + g('#cPeople', 'Not known'),
      'Address, if known        : ' + g('#cAccusedAddr', 'Not known'),
      '',
      'D. WITNESSES, PROPERTY AND INJURY',
      'Witnesses                : ' + g('#cWitness', 'None'),
      'Property involved / lost : ' + g('#cProperty', 'None'),
      'Injury or damage         : ' + g('#cInjury', 'None reported'),
      '',
      'E. BRIEF FACTS OF THE CASE',
      g('#cDesc', '(not described)'),
      '',
      'F. ACTION REQUESTED',
      g('#cAction', 'Register an FIR'),
      '',
      '------------------------------------------------------------',
      'I declare that the information given above is true to the best of my',
      'knowledge and belief.',
      '',
      'Signature of complainant : ____________________',
      'Date                     : ____________________'
    ].join('\n');
  }

  /* ---------- standalone A4 export ---------- */
  const A4_CSS = [
    '@page{size:A4;margin:0}',
    'html,body{margin:0;padding:0;background:#e9e9e9}',
    'body{font-family:"Times New Roman",Georgia,serif;color:#111;font-size:10.5pt;line-height:1.45}',
    '.a4{width:210mm;min-height:297mm;background:#fff;margin:0 auto;padding:14mm 13mm;box-sizing:border-box}',
    '.a4 *{box-sizing:border-box}',
    '.a4__frame{border:2px solid #111;padding:8mm 7mm;min-height:267mm}',
    '.a4__head{text-align:center;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:9px}',
    '.a4__crest{font-size:7.5pt;letter-spacing:.24em;color:#555}',
    '.a4__title{font-size:14.5pt;font-weight:700;letter-spacing:.07em;margin:5px 0 2px}',
    '.a4__sub{font-size:8.5pt;color:#333}',
    '.a4__sub2{font-size:8.5pt;font-style:italic;color:#555;margin-top:3px}',
    '.a4 table{width:100%;border-collapse:collapse;margin-bottom:6px}',
    '.a4 td,.a4 th{border:1px solid #111;padding:4px 6px;vertical-align:top;font-size:10pt}',
    '.a4 .lbl{width:34%;font-weight:700;background:#f6f6f6}',
    '.a4 .sec{background:#111;color:#fff;font-weight:700;letter-spacing:.09em;text-transform:uppercase;font-size:8.5pt;padding:4px 6px}',
    '.a4 .num{width:24px;text-align:center;font-weight:700;background:#f6f6f6}',
    '.a4 .val{white-space:pre-wrap;word-break:break-word}',
    '.a4 .box{min-height:56mm}',
    '.a4 .half{width:50%}',
    '.a4 .sig{display:flex;justify-content:space-between;gap:24px;margin-top:11mm}',
    '.a4 .sig div{flex:1;border-top:1px solid #111;padding-top:3px;font-size:9pt;text-align:center}',
    '.a4__office{border:1px dashed #666;padding:6px 8px;margin-top:5mm;font-size:8.5pt;color:#444}',
    '.a4__office .o{min-height:14mm}',
    '.a4__foot{margin-top:5mm;border-top:1px solid #111;padding-top:4px;font-size:7.5pt;color:#666}',
    '.a4 .empty{color:#999}',
    '@media print{body{background:#fff}.a4{margin:0}}'
  ].join('\n');

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- wiring ---------- */
  $('#sheetRef').value = ref();
  const reported = $('#fReported');
  if (reported) reported.textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  if ($('#cWhen')) $('#cWhen').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  // live fill
  MAP.forEach(([from]) => {
    const n = $(from);
    if (!n) return;
    n.addEventListener('input', sync);
    n.addEventListener('change', sync);
  });
  const decl = $('#cDeclare');
  if (decl) decl.addEventListener('change', sync);

  const printBtn = $('#reportPrintBtn');
  if (printBtn) printBtn.addEventListener('click', () => {
    sync();
    SS.toast('Choose "Save as PDF" in the print dialog', 'ok');
    setTimeout(() => window.print(), 120);
  });

  const htmlBtn = $('#reportHtmlBtn');
  if (htmlBtn) htmlBtn.addEventListener('click', () => {
    sync();
    const title = 'FIR - ' + (v('#cName2') || 'complaint');
    const doc = '<!DOCTYPE html>\n<html lang="' + SS.getLang() + '">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + SS.esc(title) + '</title>\n<style>\n' + A4_CSS + '\n</style>\n</head>\n<body>\n' +
      sheet.outerHTML + '\n</body>\n</html>\n';
    download('fir-complaint.html', doc, 'text/html;charset=utf-8');
    SS.toast('A4 sheet downloaded - open it and print to PDF', 'ok');
  });

  const copyBtn = $('#reportCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', () => SS.copyText(plainText(), 'Report copied as text'));

  const clearBtn = $('#reportClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    // text inputs and textareas
    ['#cName2', '#cFather', '#cAge', '#cOccupation', '#cAddr', '#cPhone2', '#cDistrict',
     '#cStation', '#cWhen', '#cPlace', '#cDistance', '#cAct', '#cDelay', '#cPeople',
     '#cAccusedAddr', '#cWitness', '#cProperty', '#cInjury', '#cDesc']
      .forEach((s) => { const n = $(s); if (n) n.value = ''; });
    // dropdowns go back to their first option - these were being missed
    ['#cSex', '#cOffence', '#cAction', '#cPrev']
      .forEach((s) => { const n = $(s); if (n) n.selectedIndex = 0; });
    if (decl) decl.checked = false;
    $('#sheetRef').value = ref();
    sync();
    SS.toast('Form and sheet cleared', 'ok');
  });

  const cloudBtn = $('#reportCloudBtn');
  if (cloudBtn) cloudBtn.addEventListener('click', async () => {
    if (!SS.getToken()) { SS.toast('Sign in on the Account page first', 'err'); return; }
    const fix = SS.getFix();
    try {
      await SS.api('/api/complaints', { method: 'POST', body: {
        ref: v('#sheetRef'), offence: v('#cOffence'), station: v('#cStation'), place: v('#cPlace'),
        happenedAt: v('#cWhen'), people: v('#cPeople'), witnesses: v('#cWitness'),
        injury: v('#cInjury'), action: v('#cAction'), earlier: v('#cPrev'),
        description: v('#cDesc'), text: plainText(), declared: Boolean(decl && decl.checked),
        lat: fix ? fix.lat : null, lng: fix ? fix.lng : null
      } });
      SS.toast('Saved to the cloud', 'ok');
    } catch (e) { SS.toast(e.message, 'err'); }
  });

  sync();
})();
