const nodemailer = require('nodemailer');

const ADMIN_EMAIL = process.env.SMTP_USER || 'ludovyp@gmail.com';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

function emailWrapper(content) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px; background-color: #1a1a2e; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0;">Ludo VyP</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #e0e0e0;">
        ${content}
      </div>
      <div style="text-align: center; padding: 15px; background-color: #1a1a2e; border-radius: 0 0 12px 12px;">
        <p style="color: #aaa; font-size: 12px; margin: 0;">
          © ${new Date().getFullYear()} Ludo VyP — Convivencias lúdicas de juegos de mesa
        </p>
      </div>
    </div>
  `;
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

async function sendInscriptionEmailToUser({ email, nombre, eventName }) {
  await sendMail({
    to: email,
    subject: `Inscripción recibida - ${eventName}`,
    html: emailWrapper(`
      <h2 style="color: #333;">¡Hola ${nombre}!</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Hemos recibido correctamente tu solicitud de inscripción para el evento
        <strong>${eventName}</strong>.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Tu inscripción se encuentra actualmente en estado
        <strong>Pendiente de Confirmación</strong>.
      </p>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Te iremos informando de los siguientes pasos a través de este correo electrónico.
        Si tienes alguna duda, no dudes en contactarnos.
      </p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
      <p style="color: #888; font-size: 14px;">
        Puedes consultar el estado de tu inscripción en cualquier momento desde
        tu área de usuario en nuestra web.
      </p>
    `),
  });
}

async function sendInscriptionEmailToAdmin({ nombre, apellidos, email, telefono, dni, eventName }) {
  await sendMail({
    to: ADMIN_EMAIL,
    subject: `Nueva inscripción - ${nombre} ${apellidos} - ${eventName}`,
    html: emailWrapper(`
      <h2 style="color: #333;">Nueva inscripción recibida</h2>
      <p style="color: #555; font-size: 16px; line-height: 1.6;">
        Se ha inscrito una nueva persona al evento <strong>${eventName}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #888; width: 140px;">Nombre</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #333;"><strong>${nombre} ${apellidos}</strong></td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #888;">Email</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #333;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #888;">Teléfono</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #333;">${telefono || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #888;">DNI</td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; color: #333;">${dni}</td>
        </tr>
        <tr>
          <td style="padding: 8px; color: #888;">Evento</td>
          <td style="padding: 8px; color: #333;">${eventName}</td>
        </tr>
      </table>
      <p style="color: #888; font-size: 14px; margin-top: 20px;">
        Estado actual: <strong>Pendiente de Confirmación</strong>
      </p>
    `),
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
  // Compatibilidad con código anterior
  sendInscriptionEmail: (to, nombre, eventName) =>
    sendInscriptionEmailToUser({ email: to, nombre, eventName }),
};
