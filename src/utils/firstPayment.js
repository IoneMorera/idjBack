const supabase = require('../database');
const { HOTEL_PAYMENT_BLOCK, HOTEL_PAYMENT_LABEL } = require('./hotelPayment');

const FIRST_PAYMENT_LABEL = 'Primer pago realizado';

function isPagoAplazadoName(nombre) {
  if (!nombre) return false;
  const match = String(nombre).match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (!match) return false;
  return match[2].trim().replace(/\s+/g, ' ').toLowerCase() === 'pago aplazado';
}

function primerPagoFromValues(values) {
  const match = (values || []).find((value) => value.label === FIRST_PAYMENT_LABEL);
  return match?.value === 'Sí';
}

async function protectedFieldIds(eventId) {
  const { data: blocks, error } = await supabase
    .from('form_blocks')
    .select('id, titulo, form_fields ( id, label )')
    .eq('event_id', eventId);

  if (error) throw error;

  const ids = [];
  for (const block of blocks || []) {
    const hiddenBlock = block.titulo === HOTEL_PAYMENT_BLOCK;
    for (const field of block.form_fields || []) {
      if (hiddenBlock || field.label === HOTEL_PAYMENT_LABEL || field.label === FIRST_PAYMENT_LABEL) {
        ids.push(field.id);
      }
    }
  }
  return ids;
}

async function ensureFirstPaymentField(eventId) {
  const { data: blocks, error } = await supabase
    .from('form_blocks')
    .select('id, titulo, form_fields ( id, label )')
    .eq('event_id', eventId);

  if (error) throw error;

  for (const block of blocks || []) {
    const existing = (block.form_fields || []).find((field) => field.label === FIRST_PAYMENT_LABEL);
    if (existing) return existing.id;
  }

  let block = (blocks || []).find((item) => item.titulo === HOTEL_PAYMENT_BLOCK);
  if (!block) {
    const { data: created, error: blockError } = await supabase
      .from('form_blocks')
      .insert({
        event_id: Number(eventId),
        titulo: HOTEL_PAYMENT_BLOCK,
        sort_order: 999,
      })
      .select('id')
      .single();
    if (blockError) throw blockError;
    block = created;
  }

  const { data: field, error: fieldError } = await supabase
    .from('form_fields')
    .insert({
      block_id: block.id,
      label: FIRST_PAYMENT_LABEL,
      field_type: 'radio',
      required: false,
      sort_order: 1,
    })
    .select('id')
    .single();

  if (fieldError) throw fieldError;

  const { error: optionsError } = await supabase.from('form_field_options').insert([
    { field_id: field.id, label: 'Sí', sort_order: 0 },
    { field_id: field.id, label: 'No', sort_order: 1 },
  ]);
  if (optionsError) throw optionsError;

  return field.id;
}

async function setFirstPayment(inscriptionId, eventId, primerPago) {
  const fieldId = await ensureFirstPaymentField(eventId);
  const value = primerPago ? 'Sí' : 'No';

  const { data: existing, error: existingError } = await supabase
    .from('inscription_field_values')
    .select('id')
    .eq('inscription_id', inscriptionId)
    .eq('field_id', fieldId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from('inscription_field_values')
      .update({ value })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('inscription_field_values').insert({
      inscription_id: Number(inscriptionId),
      field_id: fieldId,
      value,
    });
    if (error) throw error;
  }

  return primerPago;
}

module.exports = {
  FIRST_PAYMENT_LABEL,
  isPagoAplazadoName,
  primerPagoFromValues,
  protectedFieldIds,
  setFirstPayment,
};
