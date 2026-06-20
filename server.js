const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { randomUUID } = require('crypto');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const loginAttempts = new Map();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ results: [], forms: [], users: [] }, null, 2));
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{"results": [], "forms": [], "users": []}');
  return {
    results: Array.isArray(parsed.results) ? parsed.results : [],
    forms: Array.isArray(parsed.forms) ? parsed.forms : [],
    users: Array.isArray(parsed.users) ? parsed.users : []
  };
}

function saveDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt);
  return hash === storedHash;
}

function sanitizeUser(user) {
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

async function supabaseRequest(table, options = {}) {
  if (!USE_SUPABASE) return null;
  const query = new URLSearchParams(options.query || {}).toString();
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Error al consultar Supabase.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function findUserByEmailFromStorage(email) {
  if (USE_SUPABASE) {
    const data = await supabaseRequest('users', {
      query: {
        email: `eq.${encodeURIComponent(email)}`,
        select: '*'
      }
    });
    return Array.isArray(data) ? data[0] || null : null;
  }

  const db = loadDatabase();
  return db.users.find(item => item.email.toLowerCase() === email.toLowerCase()) || null;
}

async function upsertUserInStorage(user) {
  if (USE_SUPABASE) {
    const response = await supabaseRequest('users', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: user
    });
    return response;
  }

  const db = loadDatabase();
  const existingIndex = db.users.findIndex(item => item.id === user.id);
  if (existingIndex >= 0) {
    db.users[existingIndex] = user;
  } else {
    db.users.push(user);
  }
  saveDatabase(db);
  return user;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function rateLimit(req, res, next) {
  const key = getClientIp(req);
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo más tarde.' });
  }

  entry.count += 1;
  loginAttempts.set(key, entry);
  next();
}

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://accounts.google.com http://localhost:3000 https://*.netlify.app; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com; upgrade-insecure-requests"
  );
  next();
});
app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Servidor funcionando correctamente.' });
});

app.post('/api/register', async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
  }
  if (typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' });
  }
  if (fullName.trim().length < 2 || fullName.trim().length > 80) {
    return res.status(400).json({ error: 'El nombre debe tener entre 2 y 80 caracteres.' });
  }

  try {
    const existingUser = await findUserByEmailFromStorage(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    const { salt, hash } = hashPassword(password);
    const user = {
      id: randomUUID(),
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash: hash,
      passwordSalt: salt,
      provider: 'local',
      photoUrl: '',
      createdAt: new Date().toISOString()
    };

    await upsertUserInStorage(user);
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo crear la cuenta.', details: error.message });
  }
});

app.post('/api/login', rateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  try {
    const user = await findUserByEmailFromStorage(normalizedEmail);
    if (!user || user.provider !== 'local' || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo iniciar sesión.', details: error.message });
  }
});

app.post('/api/google-login', rateLimit, async (req, res) => {
  const { email, name, photo } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Faltan datos del perfil de Google.' });
  }
  if (typeof email !== 'string' || typeof name !== 'string') {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }

  try {
    let user = await findUserByEmailFromStorage(normalizedEmail);

    if (!user) {
      user = {
        id: randomUUID(),
        fullName: name.trim(),
        email: normalizedEmail,
        passwordHash: '',
        passwordSalt: '',
        provider: 'google',
        photoUrl: photo || '',
        createdAt: new Date().toISOString()
      };
    } else {
      user.fullName = user.fullName || name.trim();
      user.photoUrl = photo || user.photoUrl || '';
      user.provider = user.provider || 'google';
    }

    await upsertUserInStorage(user);
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo autenticar con Google.', details: error.message });
  }
});

app.post('/api/update-profile', (req, res) => {
  const { userId, fullName, photoUrl, currentPassword, newPassword } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Falta el identificador del usuario.' });
  }

  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  const db = loadDatabase();
  const user = db.users.find(item => item.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  if (typeof fullName === 'string' && fullName.trim()) {
    user.fullName = fullName.trim();
  }
  if (typeof photoUrl === 'string') {
    user.photoUrl = photoUrl.trim();
  }

  if (newPassword) {
    if (user.provider === 'local') {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Debes confirmar tu contraseña actual para cambiarla.' });
      }
      if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
        return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
      }
      const { salt, hash } = hashPassword(newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
    } else {
      const { salt, hash } = hashPassword(newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
      user.provider = 'local';
    }
  }

  saveDatabase(db);
  res.json({ success: true, user: sanitizeUser(user) });
});

app.post('/api/save-result', (req, res) => {
  const { userId, name, email, quizType, score, total } = req.body;
  if (!name || !email || !quizType || typeof score !== 'number' || typeof total !== 'number') {
    return res.status(400).json({ error: 'Faltan datos obligatorios para guardar el resultado.' });
  }

  const db = loadDatabase();
  const record = {
    id: randomUUID(),
    userId: userId || randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    quizType,
    score,
    total,
    createdAt: new Date().toISOString()
  };
  db.results.push(record);
  saveDatabase(db);
  res.json({ success: true, record });
});

app.post('/api/save-form', (req, res) => {
  const { userId, name, email, formType, data } = req.body;
  if (!name || !email || !formType || !data) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para guardar el formulario.' });
  }

  const db = loadDatabase();
  const record = {
    id: randomUUID(),
    userId: userId || randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    formType,
    data,
    createdAt: new Date().toISOString()
  };
  db.forms.push(record);
  saveDatabase(db);
  res.json({ success: true, record });
});

app.get('/api/search', (req, res) => {
  const { email, userId, query } = req.query;
  const db = loadDatabase();

  const normalizedQuery = query ? query.toString().trim().toLowerCase() : null;
  const normalizedEmail = email ? email.toString().trim().toLowerCase() : null;
  const normalizedUserId = userId ? userId.toString().trim().toLowerCase() : null;

  const matchRecord = (record) => {
    if (normalizedUserId && record.userId.toLowerCase() === normalizedUserId) return true;
    if (normalizedEmail && record.email.toLowerCase() === normalizedEmail) return true;
    if (normalizedQuery) {
      return [record.email, record.name, record.quizType, record.formType, record.data && JSON.stringify(record.data)]
        .filter(Boolean)
        .some(value => value.toString().toLowerCase().includes(normalizedQuery));
    }
    return false;
  };

  const results = normalizedEmail || normalizedUserId || normalizedQuery
    ? db.results.filter(matchRecord)
    : db.results.slice(-50);
  const forms = normalizedEmail || normalizedUserId || normalizedQuery
    ? db.forms.filter(matchRecord)
    : db.forms.slice(-50);

  res.json({ results, forms });
});

app.get('/api/results', (req, res) => {
  const db = loadDatabase();
  res.json({ results: db.results });
});

app.get('/api/forms', (req, res) => {
  const db = loadDatabase();
  res.json({ forms: db.forms });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ICA Digital Hub server iniciado en http://localhost:${PORT}`);
});
