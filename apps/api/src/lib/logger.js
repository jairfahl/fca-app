/**
 * Logger estruturado centralizado (pino).
 * Em produção: JSON compacto. Em desenvolvimento: saída colorida via pino-pretty.
 *
 * Uso:
 *   const logger = require('./logger');
 *   logger.info({ route: 'POST /full/assessments/start', userId }, 'Assessment iniciado');
 *   logger.error({ err, route }, 'Erro inesperado');
 */
const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'fca-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Formatar erros automaticamente
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service',
        },
      })
    : undefined
);

module.exports = logger;
