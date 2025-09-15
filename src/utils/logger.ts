import { createLogger, format, transports } from 'winston';
import * as path from 'path';
import * as fs from 'fs';

const { combine, timestamp, printf, colorize, errors, json } = format;

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Safe JSON stringify function to handle circular references
const safeStringify = (obj: any, space?: number): string => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (val != null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    // Filter out problematic properties that cause circular references
    if (key === 'socket' || key === 'request' || key === 'response' || 
        key === '_http_message' || key === 'agent' || key === 'parser' ||
        key === '_httpMessage' || key === 'connection' || key === 'client') {
      return '[Filtered]';
    }
    return val;
  }, space);
};

// Clean metadata function to remove problematic objects
const cleanMeta = (meta: any): any => {
  if (!meta || typeof meta !== 'object') {
    return meta;
  }

  // Handle axios errors specifically
  if (meta.isAxiosError) {
    return {
      isAxiosError: true,
      message: meta.message,
      code: meta.code,
      status: meta.response?.status,
      statusText: meta.response?.statusText,
      url: meta.config?.url,
      method: meta.config?.method,
      timeout: meta.config?.timeout
    };
  }

  // Handle regular Error objects
  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack
    };
  }

  // For other objects, recursively clean
  const cleaned: any = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key === 'socket' || key === 'request' || key === 'response' || 
        key === '_http_message' || key === 'agent' || key === 'parser' ||
        key === 'connection' || key === 'client') {
      cleaned[key] = '[Filtered]';
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        // Limit array size in logs
        cleaned[key] = value.length > 10 ? 
          [...value.slice(0, 10), `... ${value.length - 10} more items`] : 
          value;
      } else {
        // Recursively clean nested objects, but limit depth
        cleaned[key] = cleanMeta(value);
      }
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, scope, stack, ...meta }) => {
  let log = `${timestamp} [${scope || 'APP'}] ${level}: ${message}`;
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  // Clean and safely stringify metadata
  const cleanedMeta = cleanMeta(meta);
  if (Object.keys(cleanedMeta).length > 0) {
    try {
      log += `\n${safeStringify(cleanedMeta, 2)}`;
    } catch (error: any) {
      log += `\n[Error stringifying metadata: ${error.message}]`;
    }
  }
  
  return log;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, scope, stack, ...meta }) => {
  const cleanedMeta = cleanMeta(meta);
  const logEntry = {
    timestamp,
    level,
    scope: scope || 'APP',
    message,
    ...(stack ? { stack } : {}),
    ...(Object.keys(cleanedMeta).length > 0 ? { meta: cleanedMeta } : {})
  };
  
  try {
    return safeStringify(logEntry);
  } catch (error: any) {
    return safeStringify({
      timestamp,
      level,
      scope: scope || 'APP',
      message,
      error: `Failed to stringify log entry: ${error.message}`
    });
  }
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
          level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
          handleExceptions: false, // We'll handle this manually to prevent crashes
          handleRejections: false
        }),
        
        // Error log file
        new transports.File({ 
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: fileFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 10,
          tailable: true,
          handleExceptions: false
        }),
        
        // Combined log file
        new transports.File({ 
          filename: path.join(logsDir, 'combined.log'),
          format: fileFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true,
          handleExceptions: false
        }),
        
        // High TPS performance log (separate file for transfer metrics)
        new transports.File({
          filename: path.join(logsDir, 'performance.log'),
          format: fileFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 3,
          tailable: true,
          level: 'info',
          handleExceptions: false
        })
      ],
      
      // Handle uncaught exceptions and rejections
      exceptionHandlers: [
        new transports.File({ filename: path.join(logsDir, 'exceptions.log') })
      ],
      rejectionHandlers: [
        new transports.File({ filename: path.join(logsDir, 'rejections.log') })
      ],
      
      // Exit on handled exceptions
      exitOnError: false
    });

    // Add error handler for the logger itself
    this.logger.on('error', (err) => {
      console.error('Logger error:', err);
    });
  }
  
  debug(message: string, meta?: any): void {
    try {
      this.logger.debug(message, cleanMeta(meta));
    } catch (error) {
      console.error('Debug logging failed:', error);
    }
  }
  
  info(message: string, meta?: any): void {
    try {
      this.logger.info(message, cleanMeta(meta));
    } catch (error) {
      console.error('Info logging failed:', error);
    }
  }
  
  warn(message: string, meta?: any): void {
    try {
      this.logger.warn(message, cleanMeta(meta));
    } catch (error) {
      console.error('Warn logging failed:', error);
    }
  }
  
  error(message: string, meta?: any): void {
    try {
      this.logger.error(message, cleanMeta(meta));
    } catch (error) {
      console.error('Error logging failed:', error);
      console.error('Original message:', message);
      console.error('Original meta:', meta);
    }
  }

  // Special method for performance logging
  performance(message: string, meta?: any): void {
    try {
      this.logger.info(`[PERFORMANCE] ${message}`, cleanMeta(meta));
    } catch (error) {
      console.error('Performance logging failed:', error);
    }
  }

  // Method for TPS tracking
  tps(message: string, tpsValue: number, meta?: any): void {
    try {
      this.logger.info(`[TPS] ${message}`, cleanMeta({ 
        tps: tpsValue, 
        timestamp: new Date().toISOString(),
        ...meta 
      }));
    } catch (error) {
      console.error('TPS logging failed:', error);
    }
  }

  // Method for batch logging
  batch(message: string, batchData: any): void {
    try {
      this.logger.info(`[BATCH] ${message}`, cleanMeta({
        ...batchData,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Batch logging failed:', error);
    }
  }

  // Method for transfer logging
  transfer(message: string, transferData: any): void {
    try {
      this.logger.info(`[TRANSFER] ${message}`, cleanMeta({
        ...transferData,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Transfer logging failed:', error);
    }
  }

  // Create child logger with additional context
  child(additionalMeta: any): Logger {
    const childLogger = new Logger(additionalMeta.scope || this.logger.defaultMeta.scope);
    childLogger.logger.defaultMeta = { 
      ...this.logger.defaultMeta, 
      ...cleanMeta(additionalMeta)
    };
    return childLogger;
  }
}