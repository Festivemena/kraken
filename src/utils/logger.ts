import { createLogger, format, transports } from 'winston';
import * as path from 'path';
import * as fs from 'fs';

const { combine, timestamp, printf, colorize, errors, json } = format;

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, scope, stack, ...meta }) => {
  let log = `${timestamp} [${scope || 'APP'}] ${level}: ${message}`;
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  
  return log;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, scope, stack, ...meta }) => {
  const logEntry = {
    timestamp,
    level,
    scope: scope || 'APP',
    message,
    ...(stack ? { stack } : {}),
    ...(Object.keys(meta).length > 0 ? { meta } : {})
  };
  
  return JSON.stringify(logEntry);
});

export class Logger {
  private logger;
  
  constructor(scope: string) {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' })
      ),
      defaultMeta: { scope },
      transports: [
        // Console transport with colors
        new transports.Console({
          format: combine(
            colorize({ all: true }),
            consoleFormat
          ),
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        }),
        
        // Error log file
        new transports.File({ 
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 10,
          tailable: true
        }),
        
        // Combined log file
        new transports.File({ 
          filename: path.join(logsDir, 'combined.log'),
          format: fileFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true
        }),
        
        // High TPS performance log (separate file for transfer metrics)
        new transports.File({
          filename: path.join(logsDir, 'performance.log'),
          format: fileFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 3,
          tailable: true,
          level: 'info'
        })
      ],
      
      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new transports.File({ filename: path.join(logsDir, 'exceptions.log') })
      ],
      rejectionHandlers: [
        new transports.File({ filename: path.join(logsDir, 'rejections.log') })
      ]
    });

    // Add request correlation for debugging
    this.logger.on('error', (err) => {
      console.error('Logger error:', err);
    });
  }
  
  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }
  
  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }
  
  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }
  
  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  // Special method for performance logging
  performance(message: string, meta?: any): void {
    this.logger.info(`[PERFORMANCE] ${message}`, meta);
  }

  // Method for TPS tracking
  tps(message: string, tpsValue: number, meta?: any): void {
    this.logger.info(`[TPS] ${message}`, { 
      tps: tpsValue, 
      timestamp: new Date().toISOString(),
      ...meta 
    });
  }

  // Method for batch logging
  batch(message: string, batchData: any): void {
    this.logger.info(`[BATCH] ${message}`, {
      ...batchData,
      timestamp: new Date().toISOString()
    });
  }

  // Method for transfer logging
  transfer(message: string, transferData: any): void {
    this.logger.info(`[TRANSFER] ${message}`, {
      ...transferData,
      timestamp: new Date().toISOString()
    });
  }

  // Create child logger with additional context
  child(additionalMeta: any): Logger {
    const childLogger = new Logger(additionalMeta.scope || this.logger.defaultMeta.scope);
    childLogger.logger.defaultMeta = { 
      ...this.logger.defaultMeta, 
      ...additionalMeta 
    };
    return childLogger;
  }
}