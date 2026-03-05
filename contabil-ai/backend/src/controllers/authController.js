const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const env = require('../config/env');

async function login(req, res) {
  const { email, password } = req.body;

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .eq('active', true)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Credenciais invalidas' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciais invalidas' });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, office_id: user.office_id },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  const { password_hash, ...userWithoutPassword } = user;
  res.json({ token, user: userWithoutPassword });
}

async function me(req, res) {
  const { password_hash, ...user } = req.user;
  res.json({ user });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const valid = await bcrypt.compare(currentPassword, req.user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Senha atual incorreta' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);

  res.json({ message: 'Senha alterada com sucesso' });
}

module.exports = { login, me, changePassword };
