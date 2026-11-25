const supabase = require('../database');

async function recordEmailFailure({ eventId, source, emailName, recipient, subject, error }) {
  try {
    const { error: insertError } = await supabase.from('email_failures').insert({
      event_id: eventId || null,
      source,
      email_name: emailName || null,
      recipient: recipient || null,
      subject: subject || null,
      error: String(error?.message || error || 'Error desconocido').slice(0, 1000),
    });
    if (insertError) throw insertError;
  } catch (saveError) {
    console.error('No se pudo registrar el fallo del correo:', saveError.message);
  }
}

module.exports = { recordEmailFailure };
