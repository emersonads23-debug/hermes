require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: process.env.DATABASE_URL,
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },

  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'contabil-ai',
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
  },

  contaAzul: {
    clientId: process.env.CONTA_AZUL_CLIENT_ID,
    clientSecret: process.env.CONTA_AZUL_CLIENT_SECRET,
    redirectUri: process.env.CONTA_AZUL_REDIRECT_URI,
  },

  omie: {
    appKey: process.env.OMIE_APP_KEY,
    appSecret: process.env.OMIE_APP_SECRET,
  },

  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'ContabilAI <noreply@contabilai.com>',
  },

  escalationEmail: process.env.ESCALATION_EMAIL,

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  encryptionKey: process.env.ENCRYPTION_KEY,

  upload: {
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25,
    dir: process.env.UPLOAD_DIR || './uploads',
  },
};

// Startup validation for critical variables
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to backend/.env and fill in the required values.');
  process.exit(1);
}

if (process.env.JWT_SECRET === 'dev-secret' && env.nodeEnv === 'production') {
  console.error('FATAL: JWT_SECRET must be changed from default in production.');
  process.exit(1);
}

module.exports = env;
