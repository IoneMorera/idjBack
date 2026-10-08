/**
 * Script para crear un usuario administrador desde la línea de comandos.
 *
 * Uso:
 *   node src/scripts/create-admin.js <username> <nombre> <apellidos> <email> <password>
 *
 * Ejemplo:
 *   node src/scripts/create-admin.js admin Admin IDJ admin@ludovyp.com miPasswordSeguro123
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../database');

const [,, username, nombre, apellidos, email, password] = process.argv;

if (!username || !nombre || !apellidos || !email || !password) {
  console.error('Uso: node src/scripts/create-admin.js <username> <nombre> <apellidos> <email> <password>');
  process.exit(1);
}

async function main() {
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${email},username.eq.${username}`)
    .maybeSingle();

  if (existing) {
    console.error('Ya existe un usuario con ese email o username.');
    process.exit(1);
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const { data, error } = await supabase
    .from('users')
    .insert({ username, nombre, apellidos, email, password: hashedPassword, role: 'administrador' })
    .select('id')
    .single();

  if (error) {
    console.error('Error al crear administrador:', error.message);
    process.exit(1);
  }

  console.log(`Administrador creado con éxito (ID: ${data.id})`);
  console.log(`  Username: ${username}`);
  console.log(`  Email: ${email}`);
  console.log(`  Rol: administrador`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
