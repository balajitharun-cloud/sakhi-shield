'use strict';

/**
 * Notification fan-out for SOS alerts.
 *
 * Both channels degrade gracefully: if the relevant env vars are missing the
 * message is logged to the console and reported as `status: 'logged'`, so the
 * whole app still runs (and is testable) without paid SMS/email credentials.
 *
 * Email  -> nodemailer + any SMTP provider (Gmail app password, Brevo, etc.)
 * SMS    -> Twilio
 */

const nodemailer = require('nodemailer');

const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM,
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
} = process.env;

const emailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
const smsConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);

let transporter = null;
if (emailConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

let twilioClient = null;
if (smsConfigured) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('[notify] Twilio configured but the package could not be loaded:', e.message);
  }
}

/** Build the message body once, reuse across channels. */
function buildMessage({ userName, message, mapUrl, time }) {
  return [
    `SAKHI SHIELD SOS${userName ? ' - ' + userName : ''}`,
    message || 'I need help. This is my live location.',
    mapUrl ? `Live location: ${mapUrl}` : 'Location unavailable.',
    `Sent: ${time}`
  ].join('\n');
}

async function sendEmail(to, subject, body) {
  if (!emailConfigured || !transporter) {
    console.log(`[notify:email] (not configured) to=${to} subject="${subject}"\n${body}`);
    return { status: 'logged', detail: 'SMTP not configured' };
  }
  try {
    await transporter.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, text: body });
    return { status: 'sent' };
  } catch (e) {
    console.error('[notify:email] failed:', e.message);
    return { status: 'failed', detail: e.message };
  }
}

async function sendSms(to, body) {
  if (!smsConfigured || !twilioClient) {
    console.log(`[notify:sms] (not configured) to=${to}\n${body}`);
    return { status: 'logged', detail: 'Twilio not configured' };
  }
  try {
    await twilioClient.messages.create({ from: TWILIO_FROM_NUMBER, to, body });
    return { status: 'sent' };
  } catch (e) {
    console.error('[notify:sms] failed:', e.message);
    return { status: 'failed', detail: e.message };
  }
}

/**
 * Notify every contact that has the relevant channel.
 * @returns {Promise<Array>} one result per attempted channel delivery
 */
async function notifyContacts(userName, contactList, { message, mapUrl }) {
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const body = buildMessage({ userName, message, mapUrl, time });
  const subject = 'SOS alert from Sakhi Shield';
  const results = [];

  await Promise.all(contactList.map(async (c) => {
    if (c.email) {
      const r = await sendEmail(c.email, subject, body);
      results.push({ contact: c.name, channel: 'email', target: c.email, ...r });
    }
    if (c.phone) {
      const r = await sendSms(c.phone, body);
      results.push({ contact: c.name, channel: 'sms', target: c.phone, ...r });
    }
    if (!c.email && !c.phone) {
      results.push({ contact: c.name, channel: 'none', status: 'skipped', detail: 'No phone or email on file' });
    }
  }));

  return results;
}

module.exports = { notifyContacts, emailConfigured, smsConfigured };
