const supabase = require('../database');
const { isMissingSchema } = require('../utils/schema');

const MISSING_TABLE = 'Falta aplicar la migración 016_email_failures.sql en Supabase';

exports.listFailures = async (req, res) => {
  try {
    const { data, error, count } = await supabase
      .from('email_failures')
      .select('id, event_id, source, email_name, recipient, subject, error, created_at, events ( nombre, mes, anio )', { count: 'exact' })
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const failures = (data || []).map(({ events, ...row }) => ({
      ...row,
      event_name: events ? `${events.nombre} - ${events.mes} ${events.anio}` : null,
    }));
    res.json({ failures, total: count ?? failures.length });
  } catch (error) {
    if (isMissingSchema(error)) return res.status(503).json({ message: MISSING_TABLE });
    console.error('Error al listar correos fallidos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.resolveFailure = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Identificador no válido' });
    const { error } = await supabase
      .from('email_failures')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
      .is('resolved_at', null);
    if (error) throw error;
    res.json({ message: 'Fallo marcado como revisado' });
  } catch (error) {
    if (isMissingSchema(error)) return res.status(503).json({ message: MISSING_TABLE });
    console.error('Error al marcar el correo fallido:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.resolveAll = async (req, res) => {
  try {
    const { error } = await supabase
      .from('email_failures')
      .update({ resolved_at: new Date().toISOString() })
      .is('resolved_at', null);
    if (error) throw error;
    res.json({ message: 'Todos los fallos marcados como revisados' });
  } catch (error) {
    if (isMissingSchema(error)) return res.status(503).json({ message: MISSING_TABLE });
    console.error('Error al marcar los correos fallidos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
