const supabase = require('../database');
const { getEventById } = require('./foodAccess');
const { isMissingSchema } = require('./schema');

const MISSING_MIGRATION = 'Falta aplicar la migración 017_extra_food_payments.sql en Supabase';

async function fetchExtraPayments(eventId, kind) {
  const { data, error } = await supabase
    .from('event_extra_food_payments')
    .select('user_id, paid, changed_after_payment')
    .eq('event_id', eventId)
    .eq('kind', kind);
  if (error) {
    if (isMissingSchema(error)) return { paid_user_ids: null, changed_user_ids: [] };
    throw error;
  }
  const paidRows = (data || []).filter((row) => row.paid);
  return {
    paid_user_ids: paidRows.map((row) => row.user_id),
    changed_user_ids: paidRows.filter((row) => row.changed_after_payment).map((row) => row.user_id),
  };
}

async function getExtraPayment(eventId, userId, kind) {
  const { data, error } = await supabase
    .from('event_extra_food_payments')
    .select('paid, changed_after_payment')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return { paid: false, changed_after_payment: false };
    throw error;
  }
  return {
    paid: data?.paid === true,
    changed_after_payment: data?.paid === true && data?.changed_after_payment === true,
  };
}

async function markChangedAfterPayment(eventId, userId, kind) {
  const { error } = await supabase
    .from('event_extra_food_payments')
    .update({ changed_after_payment: true, updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('paid', true);
  if (error) throw error;
}

function parsePaymentTarget(req) {
  const eventId = Number(req.params.eventId);
  const userId = Number(req.body.userId);
  if (!Number.isInteger(eventId) || !Number.isInteger(userId)) return null;
  return { eventId, userId };
}

function setExtraPaymentHandler(kind) {
  return async (req, res) => {
    try {
      const target = parsePaymentTarget(req);
      const { paid } = req.body;
      if (!target || typeof paid !== 'boolean') {
        return res.status(400).json({ message: 'Indica el usuario y si ha pagado' });
      }

      const event = await getEventById(target.eventId);
      if (!event) return res.status(404).json({ message: 'Evento no encontrado' });

      const { error } = await supabase
        .from('event_extra_food_payments')
        .upsert({
          event_id: target.eventId,
          user_id: target.userId,
          kind,
          paid,
          changed_after_payment: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'event_id,user_id,kind' });
      if (error) {
        if (isMissingSchema(error)) return res.status(503).json({ message: MISSING_MIGRATION });
        throw error;
      }

      res.json({ user_id: target.userId, paid });
    } catch (error) {
      console.error('Error al guardar el pago del cargo extra:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  };
}

function confirmExtraPaymentHandler(kind) {
  return async (req, res) => {
    try {
      const target = parsePaymentTarget(req);
      if (!target) return res.status(400).json({ message: 'Indica el usuario' });

      const { error } = await supabase
        .from('event_extra_food_payments')
        .update({ changed_after_payment: false, updated_at: new Date().toISOString() })
        .eq('event_id', target.eventId)
        .eq('user_id', target.userId)
        .eq('kind', kind);
      if (error) {
        if (isMissingSchema(error)) return res.status(503).json({ message: MISSING_MIGRATION });
        throw error;
      }

      res.json({ user_id: target.userId, changed_after_payment: false });
    } catch (error) {
      console.error('Error al confirmar el pago del cargo extra:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  };
}

module.exports = {
  fetchExtraPayments,
  getExtraPayment,
  markChangedAfterPayment,
  setExtraPaymentHandler,
  confirmExtraPaymentHandler,
};
