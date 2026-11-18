const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../database');
const { uploadProfilePhoto, saveToDisk } = require('../utils/profilePhoto');
const { sendRegistrationEmail } = require('../services/emailService');

const USER_SELECT = 'id, username, nombre, apellidos, email, telefono, foto, role, created_at';
const USER_SELECT_WITH_BGG = `${USER_SELECT}, bgg_username`;

function missingBggColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return /bgg_username/i.test(message) && /does not exist|schema cache|Could not find/i.test(message);
}

async function readUser(userId) {
  const withBgg = await supabase.from('users').select(USER_SELECT_WITH_BGG).eq('id', userId).single();
  if (!withBgg.error || !missingBggColumn(withBgg.error)) return withBgg;
  return supabase.from('users').select(USER_SELECT).eq('id', userId).single();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
}

exports.register = async (req, res) => {
  try {
    const { username, nombre, apellidos, email, telefono, password, passwordConfirm } = req.body;

    if (!username || !nombre || !apellidos || !email || !password || !passwordConfirm) {
      return res.status(400).json({ message: 'Todos los campos obligatorios deben estar completos' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ message: 'Las contraseñas no coinciden' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'El formato del correo electrónico no es válido' });
    }

    const { data: existingByEmail } = await supabase
      .from('users').select('id').eq('email', email).maybeSingle();
    const { data: existingByUsername } = await supabase
      .from('users').select('id').eq('username', username).maybeSingle();

    if (existingByEmail || existingByUsername) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese correo o nombre de usuario' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ username, nombre, apellidos, email, telefono: telefono || null, password: hashedPassword, role: 'usuario' })
      .select(USER_SELECT)
      .single();

    if (error) throw error;

    try {
      await sendRegistrationEmail({
        username,
        nombre,
        apellidos,
        email,
        telefono,
        password,
      });
    } catch (emailError) {
      console.error('No se pudo enviar el correo de confirmación de registro:', emailError);
    }

    const token = generateToken(newUser);

    res.status(201).json({ message: 'Usuario registrado correctamente', user: newUser, token });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Correo y contraseña son obligatorios' });
    }

    const { data: user, error } = await supabase
      .from('users').select('*').eq('email', email).maybeSingle();

    if (error) throw error;
    if (!user) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.json({ message: 'Inicio de sesión exitoso', user: userWithoutPassword, token });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const { data: user, error } = await readUser(req.user.id);

    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    res.json({ user });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { nombre, apellidos, telefono, bgg_username: bggUsername } = req.body;
    const patch = { nombre, apellidos, telefono: telefono || null };

    if (bggUsername !== undefined) {
      const username = String(bggUsername || '').trim();
      if (username && !/^[A-Za-z0-9_-]{2,50}$/.test(username)) {
        return res.status(400).json({
          message: 'El usuario de BoardGameGeek solo puede tener letras, números, guiones y guion bajo',
        });
      }
      patch.bgg_username = username || null;
    }

    let result = await supabase
      .from('users')
      .update(patch)
      .eq('id', req.user.id)
      .select(USER_SELECT_WITH_BGG)
      .single();

    if (result.error && missingBggColumn(result.error)) {
      if (bggUsername !== undefined) {
        return res.status(500).json({ message: 'Falta aplicar la migración 006_rooms_games_snacks.sql en Supabase' });
      }
      result = await supabase
        .from('users')
        .update({ nombre, apellidos, telefono: telefono || null })
        .eq('id', req.user.id)
        .select(USER_SELECT)
        .single();
    }

    if (result.error) throw result.error;

    res.json({ message: 'Perfil actualizado correctamente', user: result.data });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
    if (newPassword !== newPasswordConfirm) {
      return res.status(400).json({ message: 'Las contraseñas no coinciden' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'La nueva contraseña debe ser distinta de la actual' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isPasswordValid = bcrypt.compareSync(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', req.user.id);

    if (updateError) throw updateError;

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se ha proporcionado una imagen' });
    }

    let photoPath;
    try {
      photoPath = await uploadProfilePhoto(req.user.id, req.file);
    } catch (storageError) {
      console.error('No se pudo subir la foto a Supabase Storage, se guarda en disco:', storageError);
      photoPath = saveToDisk(req.user.id, req.file);
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ foto: photoPath })
      .eq('id', req.user.id)
      .select(USER_SELECT)
      .single();

    if (error) throw error;

    res.json({ message: 'Foto actualizada correctamente', user: updatedUser });
  } catch (error) {
    console.error('Error al actualizar foto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
