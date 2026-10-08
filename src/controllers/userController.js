const supabase = require('../database');

const USER_SELECT = 'id, username, nombre, apellidos, email, telefono, foto, role, created_at';

exports.getAllUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select(USER_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(USER_SELECT)
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    res.json({ user });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    if (!['usuario', 'administrador'].includes(role)) {
      return res.status(400).json({ message: 'Rol no válido. Debe ser "usuario" o "administrador"' });
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', id)
      .select(USER_SELECT)
      .single();

    if (error) throw error;

    res.json({ message: 'Rol actualizado correctamente', user: updatedUser });
  } catch (error) {
    console.error('Error al actualizar rol:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.user.id) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta desde aquí' });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
