require('../preferIpv4');

const dns = require('dns');
const nodemailer = require('nodemailer');
const {
  applyShortcodes,
  buildShortcodeValues,
  defaultTemplate,
  getDefaultLogoUrl,
  getEmailTemplate,
} = require('../utils/emailTemplate');

function smtpAuth() {
  return {
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  };
}

function fromAddress(user) {
  const raw = (process.env.SMTP_FROM || '').trim().replace(/^["']|["']$/g, '');
  if (raw.includes('@') && raw.includes('<')) return raw;
  if (user) return `"Ludo VyP" <${user}>`;
  return '"Ludo VyP" <ludovyp@gmail.com>';
}

function smtpAttempts() {
  const configured = parseInt(process.env.SMTP_PORT || '587', 10);
  const attempts = Number.isInteger(configured) && configured > 0
    ? [[configured, configured === 465]]
    : [[587, false]];
  if (!attempts.some(([, secure]) => secure)) attempts.push([465, true]);
  if (!attempts.some(([port]) => port === 587)) attempts.push([587, false]);
  return attempts;
}

function smtpHostname() {
  return process.env.SMTP_HOST || 'smtp.gmail.com';
}

function resolveIpv4(hostname) {
  return new Promise((resolve, reject) => {
    dns.resolve4(hostname, (error, addresses) => {
      if (error || !addresses || addresses.length === 0) {
        reject(error || new Error(`Sin dirección IPv4 para ${hostname}`));
        return;
      }
      resolve(addresses[0]);
    });
  });
}

function createTransport(port, secure, ipv4) {
  const auth = smtpAuth();
  const hostname = smtpHostname();
  return nodemailer.createTransport({
    host: ipv4 || hostname,
    port,
    secure,
    servername: hostname,
    family: 4,
    requireTLS: !secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { servername: hostname },
    auth,
  });
}

function senderParts(user) {
  const raw = fromAddress(user);
  const match = raw.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  if (match) return { name: (match[1] || 'Ludo VyP').trim() || 'Ludo VyP', email: match[2].trim() };
  if (raw.includes('@')) return { name: 'Ludo VyP', email: raw.trim() };
  return { name: 'Ludo VyP', email: user };
}

function gmailConfigured() {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function gmailRawMessage({ from, to, subject, html }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
  return toBase64Url(message);
}

async function gmailAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google no entregó un acceso: ${response.status} ${payload.error || ''}`.trim());
  }
  return payload.access_token;
}

async function sendViaGmail(options) {
  const auth = smtpAuth();
  const accessToken = await gmailAccessToken();
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      raw: gmailRawMessage({
        from: fromAddress(auth.user),
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail respondió ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log('Email enviado por la API de Gmail');
}

async function sendViaBrevo(options) {
  const sender = senderParts(smtpAuth().user);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY.trim(),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: options.to }],
      subject: options.subject,
      htmlContent: options.html,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo respondió ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log('Email enviado por HTTPS');
}

function connectionFailed(error) {
  const code = error?.code || '';
  const message = error?.message || '';
  return ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)
    || /timed out|greeting never received|connection|socket/i.test(message);
}

function emailWrapper(content, { title = 'Ludo VyP', logoUrl } = {}) {
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" width="72" height="72" style="display:block;margin:0 auto 12px;border-radius:16px;background:#fff;" />`
    : '';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background:#fffaf6;">
      <div style="text-align: center; padding: 28px 20px 22px; background-color: #1c1410; border-radius: 12px 12px 0 0;">
        ${logo}
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 0.02em;">${escapeHtml(title)}</h1>
      </div>
      <div style="height: 4px; background-color: #f97316;"></div>
      <div style="padding: 30px; background-color: #fffaf6; border: 1px solid #fed7aa; border-top: none;">
        ${content}
      </div>
      <div style="text-align: center; padding: 15px; background-color: #1c1410; border-radius: 0 0 12px 12px;">
        <p style="color: #e7e5e4; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} ${escapeHtml(title)} — Convivencias lúdicas de juegos de mesa
        </p>
      </div>
    </div>
  `;
}

function applyBold(html) {
  return html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
}

function renderBody(template, values) {
  const escaped = escapeHtml(template);
  const replaced = escaped.replace(/\[([a-z0-9_]+)\]/gi, (match, key) => {
    const value = values[String(key).toLowerCase()];
    if (value == null || value === '') return match;
    return escapeHtml(value);
  });
  return replaced
    .split(/\n{2,}/)
    .map((paragraph, index) => {
      const html = applyBold(paragraph.replace(/\n/g, '<br>'));
      if (index === 0) {
        return `<h2 style="color: #1c1410; font-size: 22px; margin: 0 0 16px;">${html}</h2>`;
      }
      return `<p style="color: #44403c; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">${html}</p>`;
    })
    .join('');
}

function renderUserInscriptionEmail({ title, subject, body, logoUrl, values }) {
  const resolvedTitle = applyShortcodes(title, values);
  const resolvedSubject = applyShortcodes(subject, values);
  return {
    subject: resolvedSubject,
    html: emailWrapper(renderBody(body, values), { title: resolvedTitle, logoUrl }),
  };
}

async function sendMail(options) {
  if (gmailConfigured()) {
    await sendViaGmail(options);
    return;
  }
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevo(options);
    return;
  }
  const auth = smtpAuth();
  if (!auth.user || !auth.pass) {
    console.error('Correo sin configurar: falta BREVO_API_KEY o SMTP_USER y SMTP_PASS');
    return;
  }
  const hostname = smtpHostname();
  let ipv4 = null;
  try {
    ipv4 = await resolveIpv4(hostname);
  } catch (error) {
    console.error(`No se pudo resolver IPv4 de ${hostname}: ${error.message}`);
  }
  let lastError = null;
  for (const [port, secure] of smtpAttempts()) {
    const transporter = createTransport(port, secure, ipv4);
    try {
      await transporter.sendMail({
        from: fromAddress(auth.user),
        ...options,
      });
      console.log(`Email enviado por el puerto ${port}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`SMTP puerto ${port} falló: ${error.code || ''} ${error.responseCode || ''} ${error.message}`);
      if (!connectionFailed(error)) break;
    } finally {
      transporter.close();
    }
  }
  console.error('Gmail no acepta la conexión desde este servidor. Añade BREVO_API_KEY para enviar por HTTPS.');
  throw lastError;
}

async function sendInscriptionEmailToUser(inscription) {
  let template = defaultTemplate();
  let logoUrl = null;
  try {
    template = await getEmailTemplate(inscription.eventId);
    logoUrl = template.logo_url || await getDefaultLogoUrl();
  } catch (error) {
    console.error('No se pudo cargar la plantilla del correo:', error.message);
  }
  const values = buildShortcodeValues(inscription);
  const rendered = renderUserInscriptionEmail({
    title: template?.title,
    subject: template?.subject,
    body: template?.body,
    logoUrl,
    values,
  });
  await sendMail({
    to: inscription.email,
    subject: rendered.subject,
    html: rendered.html,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAnswer(value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length ? items.join(', ') : '—';
  }
  if (value == null) return '—';
  const text = String(value).trim();
  if (!text) return '—';
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return formatAnswer(parsed);
    } catch {
      // El valor es texto normal.
    }
  }
  return text;
}

function emailRow(label, value, { last = false, strong = false } = {}) {
  const border = last ? '' : 'border-bottom: 1px solid #fed7aa;';
  const safe = escapeHtml(formatAnswer(value));
  return `
        <tr>
          <td style="padding: 8px; ${border} color: #888; width: 140px; vertical-align: top;">${escapeHtml(label)}</td>
          <td style="padding: 8px; ${border} color: #333;">${strong ? `<strong>${safe}</strong>` : safe}</td>
        </tr>`;
}

function renderAdminInscriptionEmail({ nombre, apellidos, email, telefono, dni, eventName, estado, tarifa, precio, campos, title, logoUrl }) {
  const tariffLabel = [tarifa, precio].filter(Boolean).join(' — ');
  const rows = [
    { label: 'Nombre', value: `${nombre || ''} ${apellidos || ''}`.trim(), strong: true },
    { label: 'Email', value: email },
    { label: 'Teléfono', value: telefono },
    { label: 'DNI', value: dni },
  ];
  if (tariffLabel) rows.push({ label: 'Tipo de inscripción', value: tariffLabel });
  for (const campo of campos || []) {
    if (!campo?.label) continue;
    rows.push({ label: campo.label, value: campo.value });
  }
  rows.push({ label: 'Evento', value: eventName });

  return emailWrapper(`
      <h2 style="color: #1c1410; margin-top: 0;">Nueva inscripción recibida</h2>
      <p style="color: #44403c; font-size: 16px; line-height: 1.6;">
        Se ha inscrito una nueva persona al evento <strong>${escapeHtml(eventName)}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        ${rows.map((row, index) => emailRow(row.label, row.value, { last: index === rows.length - 1, strong: row.strong })).join('')}
      </table>
      <p style="color: #78716c; font-size: 14px; margin-top: 20px;">
        Estado actual: <strong style="color: #1c1410;">${escapeHtml(estado || 'Pendiente de Confirmación')}</strong>
      </p>
    `, { title, logoUrl });
}

async function sendInscriptionEmailToAdmin(inscription) {
  let title = 'Ludo VyP';
  let logoUrl = null;
  try {
    if (inscription.eventId) {
      const template = await getEmailTemplate(inscription.eventId);
      const values = buildShortcodeValues(inscription);
      title = applyShortcodes(template.title, values);
      logoUrl = template.logo_url || null;
    }
    if (!logoUrl) logoUrl = await getDefaultLogoUrl();
  } catch (error) {
    console.error('No se pudo cargar la cabecera del correo:', error.message);
  }
  await sendMail({
    to: smtpAuth().user,
    subject: `Nueva inscripción - ${inscription.nombre} ${inscription.apellidos} - ${inscription.eventName}`,
    html: renderAdminInscriptionEmail({ ...inscription, title, logoUrl }),
  });
}

async function sendInscriptionEmails(inscriptionData) {
  const results = await Promise.allSettled([
    sendInscriptionEmailToUser(inscriptionData),
    sendInscriptionEmailToAdmin(inscriptionData),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  for (const failure of failures) {
    console.error('Error al enviar un correo de inscripción:', failure.reason);
  }
  if (failures.length === results.length) {
    throw failures[0].reason;
  }
}

module.exports = {
  sendInscriptionEmails,
  sendInscriptionEmailToUser,
  sendInscriptionEmailToAdmin,
  renderAdminInscriptionEmail,
  renderUserInscriptionEmail,
  // Compatibilidad con código anterior
  sendInscriptionEmail: (to, nombre, eventName) =>
    sendInscriptionEmailToUser({ email: to, nombre, eventName }),
};
