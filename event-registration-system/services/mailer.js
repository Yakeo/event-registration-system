/**
 * services/mailer.js
 * One place that knows how to hand an e-mail to a transport.
 *
 * MAIL_TRANSPORT
 *   console  (default) writes a real .eml file to tmp/outbox/ and logs one line.
 *            Works with no SMTP server, no credentials and no internet - which
 *            is what a live demo needs. Open the .eml in any mail client.
 *   smtp     sends through nodemailer using SMTP_HOST/SMTP_PORT/SMTP_USER/
 *            SMTP_PASS/SMTP_SECURE (Mailtrap, Ethereal, Gmail, the school's
 *            relay, ...).
 *   memory   records messages in an array and sends nothing (used by `npm test`).
 *
 * The transport is resolved per call, not at require time, so tests and the
 * worker can be configured independently.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTBOX_DIR = process.env.MAIL_OUTBOX_DIR
  ? path.resolve(process.env.MAIL_OUTBOX_DIR)
  : path.join(__dirname, '..', 'tmp', 'outbox');

let memoryMessages = [];
let smtpTransport = null;

function currentTransport() {
  return (process.env.MAIL_TRANSPORT || 'console').toLowerCase();
}

function fromAddress() {
  return process.env.MAIL_FROM || 'EventReg <no-reply@eventreg.test>';
}

/** Minimal RFC-822 rendering, enough for a .eml a mail client can open. */
function toEml({ to, subject, html, text, messageId }) {
  return [
    `From: ${fromAddress()}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    '<!-- text/plain alternative -->',
    text || '',
    '',
  ].join('\r\n');
}

function writeEml(parts) {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const safeSubject = parts.subject.replace(/[^a-z0-9]+/gi, '-').slice(0, 60).replace(/^-|-$/g, '');
  const file = path.join(OUTBOX_DIR, `${Date.now()}-${safeSubject}.eml`);
  fs.writeFileSync(file, toEml(parts), 'utf8');
  return file;
}

function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;

  let nodemailer;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    nodemailer = require('nodemailer');
  } catch (err) {
    throw new Error(
      "MAIL_TRANSPORT=smtp needs the 'nodemailer' package. Run: npm install nodemailer"
    );
  }

  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '127.0.0.1',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' }
        : undefined,
  });
  return smtpTransport;
}

/**
 * Sends one already-rendered message.
 * Throws on failure - the worker is responsible for recording the attempt.
 * @returns {Promise<{messageId: string, transport: string, file?: string}>}
 */
async function send({ to, subject, html, text }) {
  const transport = currentTransport();
  const messageId = `${crypto.randomUUID()}@eventreg.local`;
  const parts = { to, subject, html, text, messageId };

  if (transport === 'memory') {
    memoryMessages.push({ ...parts, sentAt: new Date() });
    return { messageId, transport };
  }

  if (transport === 'smtp') {
    const info = await getSmtpTransport().sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
    });
    return { messageId: info.messageId || messageId, transport };
  }

  const file = writeEml(parts);
  console.log(`[MAIL] ${subject} -> ${to}  (${path.relative(process.cwd(), file)})`);
  return { messageId, transport: 'console', file };
}

/* --------------------------------- helpers -------------------------------- */

/** Messages captured by the memory transport (tests). */
function drainMemoryOutbox() {
  const sent = memoryMessages;
  memoryMessages = [];
  return sent;
}

function resetSmtpTransport() {
  smtpTransport = null;
}

module.exports = { send, drainMemoryOutbox, resetSmtpTransport, currentTransport, OUTBOX_DIR };
