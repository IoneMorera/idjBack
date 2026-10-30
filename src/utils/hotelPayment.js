const supabase = require('../database');

const HOTEL_PAYMENT_LABEL = 'Confirmación del Hotel';
const HOTEL_PAYMENT_BLOCK = 'Estado de pago';

function withoutInternalFormFields(blocks) {
  return (blocks || [])
    .filter((block) => block.titulo !== HOTEL_PAYMENT_BLOCK)
    .map((block) => ({
      ...block,
      form_fields: (block.form_fields || []).filter((field) => field.label !== HOTEL_PAYMENT_LABEL),
    }));
}

function pagoHotelFromValues(values) {
  const match = (values || []).find((value) => value.label === HOTEL_PAYMENT_LABEL);
  return match?.value === 'Sí';
}

async function ensureHotelPaymentField(eventId) {
  const { data: blocks, error } = await supabase
    .from('form_blocks')
    .select('id, titulo, form_fields ( id, label )')
    .eq('event_id', eventId);

  if (error) throw error;

  for (const block of blocks || []) {
    const existing = (block.form_fields || []).find((field) => field.label === HOTEL_PAYMENT_LABEL);
    if (existing) return existing.id;
  }

  const { data: block, error: blockError } = await supabase
    .from('form_blocks')
    .insert({
      event_id: Number(eventId),
      titulo: HOTEL_PAYMENT_BLOCK,
      sort_order: 999,
    })
    .select('id')
    .single();

  if (blockError) throw blockError;

  const { data: field, error: fieldError } = await supabase
    .from('form_fields')
    .insert({
      block_id: block.id,
      label: HOTEL_PAYMENT_LABEL,
      field_type: 'radio',
      required: false,
      sort_order: 0,
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

async function setHotelPayment(inscriptionId, eventId, pagoHotel) {
  const fieldId = await ensureHotelPaymentField(eventId);
  const value = pagoHotel ? 'Sí' : 'No';

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

  return pagoHotel;
}

module.exports = {
  HOTEL_PAYMENT_LABEL,
  HOTEL_PAYMENT_BLOCK,
  withoutInternalFormFields,
  pagoHotelFromValues,
  setHotelPayment,
};
