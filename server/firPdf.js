'use strict';

/**
 * Builds the F.I.R. written complaint as an A4 PDF, server-side, with pdfkit.
 *
 * The layout mirrors the A4 sheet on the complaint page: a headed frame, the
 * lettered sections A-F, a signature block and an office-use block.
 *
 * NOTE ON SCRIPT: pdfkit's built-in fonts are Latin-only. Text containing
 * Devanagari or Kannada will not render in this PDF - use the page's
 * Print / Save as PDF option for those languages, which uses system fonts.
 */

const PDFDocument = require('pdfkit');

const M = 34;                    // page margin, points
const WIDTH = 595.28;            // A4 width
const HEIGHT = 841.89;           // A4 height
const INNER = WIDTH - M * 2;

function clean(v, max) {
  const s = String(v == null ? '' : v).trim();
  return s.slice(0, max || 4000);
}

function hasNonLatin(s) {
  // Anything outside Latin-1 that pdfkit's built-in fonts cannot draw.
  return /[^\u0000-\u024F\u2010-\u203A\u20B9]/.test(s);
}

/**
 * @param {object} f  the complaint fields
 * @returns {Promise<Buffer>} the PDF bytes
 */
function buildFirPdf(f) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = M;

    const text = (str, opts) => {
      const o = Object.assign({ width: INNER }, opts || {});
      doc.text(str, M + (o.indent || 0), y, o);
      y = doc.y;
    };
    const gap = (n) => { y += (n == null ? 6 : n); };

    const rule = (thick) => {
      doc.moveTo(M, y).lineTo(M + INNER, y)
         .lineWidth(thick ? 1.6 : 0.7).strokeColor('#111').stroke();
      y += 5;
    };

    /** A labelled row inside a light box. */
    const row = (label, value) => {
      const startY = y;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111');
      const labelH = doc.heightOfString(label, { width: INNER * 0.34 - 10 });
      doc.font('Helvetica').fontSize(9);
      const valH = doc.heightOfString(clean(value) || '\u2014', { width: INNER * 0.66 - 10 });
      const h = Math.max(labelH, valH, 11) + 5;

      doc.rect(M, startY, INNER * 0.34, h).fillAndStroke('#f4f4f4', '#111');
      doc.rect(M + INNER * 0.34, startY, INNER * 0.66, h).stroke('#111');

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111')
         .text(label, M + 5, startY + 3, { width: INNER * 0.34 - 10 });
      doc.font('Helvetica').fontSize(9).fillColor('#111')
         .text(clean(value) || '\u2014', M + INNER * 0.34 + 5, startY + 3, { width: INNER * 0.66 - 10 });

      y = startY + h;
    };

    /** A dark section band. */
    const section = (title) => {
      const h = 15;
      doc.rect(M, y, INNER, h).fill('#111');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff')
         .text(title.toUpperCase(), M + 5, y + 4.5, { width: INNER - 10, characterSpacing: 0.6 });
      y += h;
    };

    /** A numbered paragraph inside the bordered block. */
    const numbered = (n, label, value) => {
      const startY = y;
      doc.font('Helvetica').fontSize(9);
      const valH = doc.heightOfString(clean(value) || '\u2014', { width: INNER - 34 });
      const h = Math.max(valH, 11) + 5;
      doc.rect(M, startY, 22, h).fillAndStroke('#f4f4f4', '#111');
      doc.rect(M + 22, startY, INNER - 22, h).stroke('#111');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111')
         .text(String(n), M + 6, startY + 3, { width: 14, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111')
         .text(label + ' ', M + 27, startY + 3, { width: INNER - 34, continued: true });
      doc.font('Helvetica').fontSize(9).fillColor('#111')
         .text(clean(value) || '\u2014', { width: INNER - 34 });
      y = startY + h;
    };

    /* ---------- header ---------- */
    doc.font('Helvetica').fontSize(7.5).fillColor('#555')
       .text('GOVERNMENT OF INDIA \u00b7 POLICE DEPARTMENT', M, y, { width: INNER, align: 'center', characterSpacing: 1.4 });
    y = doc.y + 3;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111')
       .text('FIRST INFORMATION REPORT', M, y, { width: INNER, align: 'center', characterSpacing: 0.8 });
    y = doc.y + 2;
    doc.font('Helvetica').fontSize(8).fillColor('#333')
       .text('(Under Section 173 of the Bharatiya Nagarik Suraksha Sanhita, 2023 - formerly Section 154 Cr.P.C.)',
             M, y, { width: INNER, align: 'center' });
    y = doc.y + 1;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#555')
       .text('Written complaint submitted by the complainant for registration at the police station',
             M, y, { width: INNER, align: 'center' });
    y = doc.y + 6;
    rule(true);

    /* ---------- meta ---------- */
    const metaRow = (l1, v1, l2, v2) => {
      const startY = y;
      doc.font('Helvetica').fontSize(9.5);
      const h1 = doc.heightOfString(clean(v1) || '\u2014', { width: INNER * 0.3 - 10 });
      const h2 = doc.heightOfString(clean(v2) || '\u2014', { width: INNER * 0.3 - 10 });
      const h = Math.max(h1, h2, 12) + 8;
      const c = [0, INNER * 0.2, INNER * 0.5, INNER * 0.7, INNER];
      doc.rect(M, startY, INNER, h).stroke('#111');
      [c[1], c[2], c[3]].forEach((x) => doc.moveTo(M + x, startY).lineTo(M + x, startY + h).stroke('#111'));
      doc.font('Helvetica-Bold').fontSize(8.5)
         .text(l1, M + c[0] + 5, startY + 4, { width: c[1] - c[0] - 10 });
      doc.font('Helvetica').fontSize(9)
         .text(clean(v1) || '\u2014', M + c[1] + 5, startY + 4, { width: c[2] - c[1] - 10 });
      doc.font('Helvetica-Bold').fontSize(8.5)
         .text(l2, M + c[2] + 5, startY + 4, { width: c[3] - c[2] - 10 });
      doc.font('Helvetica').fontSize(9)
         .text(clean(v2) || '\u2014', M + c[3] + 5, startY + 4, { width: c[4] - c[3] - 10 });
      y = startY + h;
    };

    metaRow('District', f.district, 'Police station', f.station);
    metaRow('F.I.R. No.', 'To be assigned by the police station',
            "Complainant's ref.", f.ref);
    metaRow('Date & time of report', f.reportedAt, 'Pages', '1 of 1');
    gap(5);

    /* ---------- A ---------- */
    section('A. Particulars of the occurrence');
    numbered(1, 'Act and sections:', f.act);
    numbered(2, 'Nature of offence:', f.offence);
    numbered(3, 'Date and time of occurrence:', f.when);
    numbered(4, 'Place of occurrence:',
             (f.place || '\u2014') + (f.distance ? '  (approx. ' + f.distance + ' from the police station)' : ''));
    numbered(5, 'Delay in reporting, if any, and its reason:', f.delay || 'None');
    numbered(6, 'Complaint made earlier:', f.earlier || 'No');
    gap(5);

    /* ---------- B ---------- */
    section('B. Complainant');
    row('Name', f.name);
    row("Father's / husband's name", f.father);
    row('Age / sex', [f.age, f.sex].filter(Boolean).join(' / '));
    row('Occupation', f.occupation);
    row('Address', f.address);
    row('Contact number', f.phone);
    gap(5);

    /* ---------- C ---------- */
    section('C. Accused / suspects');
    row('Name or description', f.people || 'Not known');
    row('Address, if known', f.accusedAddress || 'Not known');
    gap(5);

    /* ---------- D ---------- */
    section('D. Witnesses, property and injury');
    row('Witnesses', f.witnesses || 'None');
    row('Property involved / lost', f.property || 'None');
    row('Injury or damage', f.injury || 'None reported');
    gap(5);

    /* ---------- E ---------- */
    section('E. Brief facts of the case');
    {
      const startY = y;
      doc.font('Helvetica').fontSize(9.5);
      const body = clean(f.description) || 'To be written by the complainant.';
      const h = Math.max(doc.heightOfString(body, { width: INNER - 10 }), 72) + 8;
      doc.rect(M, startY, INNER, h).stroke('#111');
      doc.fillColor('#111').text(body, M + 5, startY + 5, { width: INNER - 10 });
      y = startY + h;
    }
    gap(5);

    /* ---------- F ---------- */
    section('F. Action requested');
    row('Requested', f.action || 'Register an FIR');
    gap(13);

    /* ---------- declaration + signature ---------- */
    doc.font('Helvetica').fontSize(9).fillColor('#111')
       .text('I declare that the information given above is true to the best of my knowledge and belief.',
             M, y, { width: INNER });
    y = doc.y + 18;
    doc.moveTo(M, y).lineTo(M + INNER * 0.45, y).stroke('#111');
    doc.moveTo(M + INNER * 0.55, y).lineTo(M + INNER, y).stroke('#111');
    doc.font('Helvetica').fontSize(8.5).fillColor('#333')
       .text('Signature / thumb impression of complainant', M, y + 3, { width: INNER * 0.45 });
    doc.text('Date', M + INNER * 0.55, y + 3, { width: INNER * 0.45 });
    y += 18;

    /* ---------- office use ---------- */
    gap(5);
    {
      const startY = y;
      doc.rect(M, startY, INNER, 50).dash(3, { space: 3 }).strokeColor('#666').stroke().undash();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#444')
         .text('For office use only \u2014 action taken by the police station', M + 5, startY + 5, { width: INNER - 10 });
      doc.moveTo(M, startY + 32).lineTo(M + INNER, startY + 32).strokeColor('#666').stroke();
      doc.moveTo(M + INNER * 0.5, startY + 32).lineTo(M + INNER * 0.5, startY + 50).strokeColor('#666').stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#444')
         .text('Registered as F.I.R. No.:', M + 5, startY + 35, { width: INNER * 0.5 - 10 })
         .text('Date of registration:', M + INNER * 0.5 + 5, startY + 35, { width: INNER * 0.5 - 10 });
      y = startY + 50;
    }

    /* ---------- footer ---------- */
    gap(8);
    doc.font('Helvetica').fontSize(7).fillColor('#666')
       .text('Prepared with Sakhi Shield. This is a written complaint drawn up in the standard F.I.R. format; it is not ' +
             'itself a registered F.I.R. - the police station registers the F.I.R. on receipt. Please read it through and ' +
             'sign it before submitting.', M, y, { width: INNER });

    doc.end();
  });
}

module.exports = { buildFirPdf, hasNonLatin };
