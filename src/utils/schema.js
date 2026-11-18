function isMissingSchema(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return /does not exist|schema cache|Could not find/i.test(message);
}

function schemaErrorMessage(error, fallback) {
  if (isMissingSchema(error)) {
    return 'Falta aplicar la migración 006_rooms_games_snacks.sql en Supabase';
  }
  return error?.status ? error.message : fallback;
}

module.exports = { isMissingSchema, schemaErrorMessage };
