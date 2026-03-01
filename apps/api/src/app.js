const express = require('express');
const cors = require('cors');

const pingRoutes = require('./routes/ping');
const diagnosticRoutes = require('./routes/diagnostic');
const companiesRoutes = require('./routes/companies');
const assessmentsRoutes = require('./routes/assessments');
const f3Routes = require('./routes/f3');
const f4Routes = require('./routes/f4');
const f4bRoutes = require('./routes/f4b');
const gateCRoutes = require('./routes/gateC');
const leadsRoutes = require('./routes/leads');
const fullRoutes = require('./routes/full');
const meRoutes = require('./routes/me');
const consultorRoutes = require('./routes/consultor');
const helpRequestsRoutes = require('./routes/helpRequests');
const supportRoutes = require('./routes/support');
const messagesRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');

const app = express();

// Configurar CORS
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => origin.length > 0);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin (curl, postman, etc)
    if (!origin) {
      return callback(null, true);
    }
    // Verificar se origin está na whitelist
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

// Habilitar preflight
app.options('*', cors(corsOptions));

// Aplicar CORS antes das rotas
app.use(cors(corsOptions));
app.use(express.json());

// Auth: popula req.user a partir do JWT (não falha em token ausente/inválido)
const { populateAuth } = require('./middleware/auth');
app.use(populateAuth);

// Rotas
app.use('/', pingRoutes);
app.use('/', diagnosticRoutes);
app.use('/companies', companiesRoutes);
app.use('/assessments', assessmentsRoutes);
app.use('/', f3Routes);
app.use('/', f4Routes);
app.use('/', f4bRoutes);
app.use('/', gateCRoutes);
app.use('/', leadsRoutes);
app.use('/', meRoutes);
app.use('/', helpRequestsRoutes);
app.use('/', supportRoutes);
app.use('/consultor', consultorRoutes);
app.use('/messages', messagesRoutes);
app.use('/admin', adminRoutes);
app.use('/', fullRoutes);
console.log('ROUTES OK: f4 mounted');
console.log('ROUTES OK: f4b mounted');
console.log('ROUTES OK: gateC mounted');

// Alias pt-BR (frontend antigo) -> endpoint oficial
app.get('/diagnostico', (req, res) => {
  const qs = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
  const target = qs ? `/full/diagnostic?${qs}` : '/full/diagnostic';
  return res.redirect(307, target); // mantém método e querystring
});

// Health check legacy (mantido para compatibilidade)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

module.exports = app;
