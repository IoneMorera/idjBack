const nodemailer = require('nodemailer');
const {
  applyShortcodes,
  buildShortcodeValues,
  getDefaultLogoUrl,
  getEmailTemplate,
} = require('../utils/emailTemplate');

const ADMIN_EMAIL = process.env.SMTP_USER || 'ludovyp@gmail.com';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

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
  if (!process.env.SMTP_USER) {
    console.log(`[SMTP no configurado] Se habría enviado email a ${options.to}: ${options.subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Ludo VyP" <${ADMIN_EMAIL}>`,
    ...options,
  });
  console.log(`Email enviado a ${options.to}: ${options.subject}`);
}

async function sendInscriptionEmailToUser(inscription) {
  const template = await getEmailTemplate(inscription.eventId);
  const values = buildShortcodeValues(inscription);
  const logoUrl = template.logo_url || await getDefaultLogoUrl();
  const rendered = renderUserInscriptionEmail({
    title: template.title,
    subject: template.subject,
    body: template.body,
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
    to: ADMIN_EMAIL,
    subject: `Nueva inscripción - ${inscription.nombre} ${inscription.apellidos} - ${inscription.eventName}`,
    html: renderAdminInscriptionEmail({ ...inscription, title, logoUrl }),
  });
}

async function sendInscriptionEmails(inscriptionData) {
  await Promise.all([
    sendInscriptionEmailToUser(inscriptionData),
    sendInscriptionEmailToAdmin(inscriptionData),
  ]);
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
