const supabase = require('../database');

// Obtener formulario completo de un evento (bloques + campos + opciones)
exports.getEventForm = async (req, res) => {
  try {
    const { eventId } = req.params;

    const { data: blocks, error } = await supabase
      .from('form_blocks')
      .select(`
        *,
        form_fields (
          *,
          form_field_options ( * )
        )
      `)
      .eq('event_id', eventId)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'form_fields' })
      .order('sort_order', { referencedTable: 'form_fields.form_field_options' });

    if (error) throw error;

    res.json({ blocks: blocks || [] });
  } catch (error) {
    console.error('Error al obtener formulario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Crear un bloque nuevo
exports.createBlock = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { titulo } = req.body;

    if (!titulo) {
      return res.status(400).json({ message: 'El título es obligatorio' });
    }

    // Obtener el siguiente sort_order
    const { data: existing } = await supabase
      .from('form_blocks')
      .select('sort_order')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: block, error } = await supabase
      .from('form_blocks')
      .insert({ event_id: eventId, titulo, sort_order: nextOrder })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Bloque creado', block });
  } catch (error) {
    console.error('Error al crear bloque:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Actualizar bloque
exports.updateBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { titulo, sort_order } = req.body;

    const updates = {};
    if (titulo !== undefined) updates.titulo = titulo;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data: block, error } = await supabase
      .from('form_blocks')
      .update(updates)
      .eq('id', blockId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Bloque actualizado', block });
  } catch (error) {
    console.error('Error al actualizar bloque:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Eliminar bloque (cascada: borra campos y opciones)
exports.deleteBlock = async (req, res) => {
  try {
    const { blockId } = req.params;

    const { error } = await supabase
      .from('form_blocks')
      .delete()
      .eq('id', blockId);

    if (error) throw error;

    res.json({ message: 'Bloque eliminado' });
  } catch (error) {
    console.error('Error al eliminar bloque:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Añadir campo a un bloque
exports.createField = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { label, field_type, required } = req.body;

    if (!label || !field_type) {
      return res.status(400).json({ message: 'Label y tipo son obligatorios' });
    }

    const validTypes = ['text', 'textarea', 'select', 'radio', 'checkbox', 'date'];
    if (!validTypes.includes(field_type)) {
      return res.status(400).json({ message: `Tipo no válido. Debe ser: ${validTypes.join(', ')}` });
    }

    const { data: existing } = await supabase
      .from('form_fields')
      .select('sort_order')
      .eq('block_id', blockId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: field, error } = await supabase
      .from('form_fields')
      .insert({ block_id: blockId, label, field_type, required: required || false, sort_order: nextOrder })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Campo creado', field });
  } catch (error) {
    console.error('Error al crear campo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Actualizar campo
exports.updateField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { label, field_type, required, sort_order } = req.body;

    const updates = {};
    if (label !== undefined) updates.label = label;
    if (field_type !== undefined) updates.field_type = field_type;
    if (required !== undefined) updates.required = required;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data: field, error } = await supabase
      .from('form_fields')
      .update(updates)
      .eq('id', fieldId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Campo actualizado', field });
  } catch (error) {
    console.error('Error al actualizar campo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Eliminar campo
exports.deleteField = async (req, res) => {
  try {
    const { fieldId } = req.params;

    const { error } = await supabase
      .from('form_fields')
      .delete()
      .eq('id', fieldId);

    if (error) throw error;

    res.json({ message: 'Campo eliminado' });
  } catch (error) {
    console.error('Error al eliminar campo:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Establecer opciones de un campo (reemplaza todas las existentes)
exports.setFieldOptions = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { options } = req.body;

    if (!Array.isArray(options)) {
      return res.status(400).json({ message: 'Se espera un array de opciones' });
    }

    // Borrar opciones existentes
    await supabase.from('form_field_options').delete().eq('field_id', fieldId);

    if (options.length > 0) {
      const rows = options.map((opt, i) => ({
        field_id: Number(fieldId),
        label: opt.label,
        sort_order: i,
      }));

      const { error } = await supabase.from('form_field_options').insert(rows);
      if (error) throw error;
    }

    const { data: updated } = await supabase
      .from('form_field_options')
      .select('*')
      .eq('field_id', fieldId)
      .order('sort_order');

    res.json({ message: 'Opciones actualizadas', options: updated });
  } catch (error) {
    console.error('Error al establecer opciones:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
