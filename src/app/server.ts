import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import promMiddleware from 'express-prometheus-middleware';

import { getConfig, validateConfig } from './config';
import { Logger } from '../utils/logger';
import { setupRoutes } from '../api/routes';
import { errorHandler } from './middleware';
import { FTTransferService } from '../services/transfer-service';
import { MetricsService } from '@/utils/metrics';

const logger = new Logger('Server');

export async function createServer() {
  const app = express();
  const config = getConfig();
  
  // Validate configuration
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
  }
  
  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true
  }));
  
  // Compression middleware
  app.use(compression());
  
  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Rate limiting
  const rateLimiter = new RateLimiterMemory({
    points: config.rateLimitPoints,
    duration: config.rateLimitDuration
  });
  
  app.use(async (req, res, next) => {
    try {
      await rateLimiter.consume(req.ip);
      next();
    } catch (rateLimiterRes) {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000)
      });
    }
  });
  
  // Metrics middleware
  app.use(promMiddleware({
    metricsPath: '/metrics',
    collectDefaultMetrics: true,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10],
    requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
    responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
  }));
  
  // Initialize services
  const transferService = FTTransferService.getInstance();
  await transferService.initialize();
  
  // Setup routes
  setupRoutes(app, transferService);
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Error handling middleware (should be last)
  app.use(errorHandler);
  
  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  
  logger.info('Server configured successfully');
  return app;
}