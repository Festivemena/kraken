import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

const logger = new Logger('Middleware');

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    statusCode
  });
  
  // Don't leak error details in production
  const response: any = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  };
  
  if (error.details) {
    response.details = error.details;
  }
  
  res.status(statusCode).json(response);
};

export const asyncHandler = (fn: Function) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const validateRequest = (schema: any) => 
  (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });
    
    if (error) {
      const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
      const customError: CustomError = new Error(`Validation failed: ${errorMessage}`);
      customError.statusCode = 400;
      customError.details = error.details;
      return next(customError);
    }
    
    req.body = value;
    next();
  };

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url, ip } = req;
    const { statusCode } = res;
    
    logger.info('HTTP Request', {
      method,
      url,
      ip,
      statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
};