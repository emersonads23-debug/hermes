const winston = require('winston');
const crypto = require('crypto');
const env = require('./env');

// Generate unique request ID
function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'contabil-ai' },
  transports: [
    new winston.transports.Console({
      format:
        env.nodeEnv === 'production'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
                const rid = requestId ? ` [${requestId}]` : '';
                const extra = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
                return `${timestamp} ${level}${rid}: ${message}${extra}`;
              })
            ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10485760, maxFiles: 10 }),
  ],
});

// Express middleware: attach requestId and log request/response
function requestTracing(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = Date.now();

  logger.info('request_start', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('request_end', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id,
      officeId: req.user?.office_id,
    });
  });

  next();
}

// Child logger with request context
function childLogger(requestId) {
  return logger.child({ requestId });
}

module.exports = logger;
module.exports.requestTracing = requestTracing;
module.exports.childLogger = childLogger;
module.exports.generateRequestId = generateRequestId;
