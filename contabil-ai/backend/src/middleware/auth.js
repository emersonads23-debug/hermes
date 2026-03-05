const jwt = require('jsonwebtoken');
const env = require('../config/env');
const supabase = require('../config/supabase');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, env.jwt.secret);

    const { data: user, error } = await supabase
      .from('users')
      .select('*, office:offices(*)')
      .eq('id', payload.sub)
      .single();

    if (error || !user || !user.active) {
      return res.status(401).json({ error: 'Usuario nao autorizado' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
