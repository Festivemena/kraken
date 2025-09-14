import express from 'express';
import { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import promMiddleware from 'express-prometheus-middleware';

import { getConfig, validateConfig } from './config';
import { Logger } from '../utils/logger';
import { setupRoutes } from '../api/routes';
import { errorHandler, requestLogger } from './middleware';
import { FTTransferService } from '../services/transfer-service';
import { MetricsService } from '../utils/metrics';

const logger = new Logger('Server');

export async function createServer(): Promise<express.Application> {
  const app = express();
  const config = getConfig();
  
  // Validate configuration
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    throw new Error(`Configuration errors: ${configErrors.join(', ')}`);
  }
  
  logger.info('Starting FT Transfer API Server for NEAR Bounty', {
    networkId: config.networkId,
    targetPerformance: '100+ TPS',
    library: 'near-api-js (stable)',
    nodeEnv: config.nodeEnv
  });
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"]
      }
    }
  }));
  
  app.use(cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  
  // Compression middleware for better performance
  // app.use(compression({
  //   level: 6,
  //   threshold: 1024,
  //   filter: (req, res) => {
  //     if (req.headers['x-no-compression']) {
  //       return false;
  //     }
  //     return compressionFilter(req, res);
  //   }
  // }));
  
  // Body parsing middleware with optimized limits
  app.use(express.json({ 
    limit: '10mb',
    strict: true,
    type: 'application/json'
  }));
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 100
  }));
  
  // Request logging
  if (config.nodeEnv !== 'production') {
    app.use(requestLogger);
  }
  
  // Rate limiting optimized for high TPS API
  const rateLimiter = new RateLimiterMemory({
    points: config.rateLimitPoints, // Number of requests
    duration: config.rateLimitDuration, // Per second
    blockDuration: 10, // Block for 10 seconds if exceeded
    execEvenly: true // Spread requests evenly across duration
  });
  
  app.use(async (req, res, next) => {
    try {
      await rateLimiter.consume(req.ip || 'unknown');
      next();
    } catch (rateLimiterRes: any) {
      const remainingPoints = rateLimiterRes?.remainingPoints ?? 0;
      const msBeforeNext = rateLimiterRes?.msBeforeNext ?? 1000;
      
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded - High TPS API protection',
        message: 'Too many requests, please slow down',
        retryAfter: Math.ceil(msBeforeNext / 1000),
        remainingPoints,
        limit: config.rateLimitPoints,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Prometheus metrics middleware for monitoring TPS performance
  if (config.metricsEnabled) {
    app.use(promMiddleware({
      metricsPath: '/prometheus',
      collectDefaultMetrics: true,
      requestDurationBuckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10], // Optimized for fast API
      requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
      responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
      includeMethod: true,
      includePath: true,
      includeStatusCode: true,
      includeUp: true,
      ccustomLabels: ['service', 'version', 'bounty'],
transformLabels(labels) {
  labels.service = 'ft-transfer-api';
  labels.version = '1.0.0';
  labels.bounty = 'near-100tps';
  return labels;
}
    }));
  }
  
  // Request ID middleware for tracing
  app.use((req: any, res, next) => {
    req.id = Math.random().toString(36).substring(2, 15);
    res.setHeader('X-Request-ID', req.id);
    next();
  });
  
  // Initialize FT Transfer Service
  logger.info('Initializing FT Transfer Service with near-api-js optimization');
  const transferService = FTTransferService.getInstance();
  
  try {
    await transferService.initialize();
    logger.info('FT Transfer Service initialized successfully', {
      performance: 'Optimized for 100+ TPS',
      batchSize: config.batchSize,
      concurrency: config.queueConcurrency
    });
  } catch (error) {
    logger.error('Failed to initialize FT Transfer Service:', error);
    throw error;
  }
  
  // Setup API routes
  setupRoutes(app, transferService);
  
  // Error handling middleware (should be last)
  app.use(errorHandler);
  
  // 404 handler with helpful message
  app.use('*', (req, res) => {
    res.status(404).json({ 
      success: false,
      error: 'Endpoint not found',
      availableEndpoints: [
        'POST /transfer - Queue FT transfer',
        'POST /bulk-transfer - Bulk transfer operations',
        'POST /direct-transfer - Immediate transfer',
        'GET /health - Service health check',
        'GET /metrics - Performance metrics',
        'GET /status - System status',
        'GET /bounty-status - Bounty compliance status',
        'GET /api-docs - API documentation'
      ],
      documentation: 'Visit GET / for quick start guide',
      timestamp: new Date().toISOString()
    });
  });
  
  logger.info('FT Transfer API Server configured successfully for NEAR bounty', {
    endpoints: ['transfer', 'bulk-transfer', 'health', 'metrics', 'bounty-status'],
    rateLimit: `${config.rateLimitPoints}/sec`,
    targetPerformance: '100+ TPS sustained',
    library: 'near-api-js'
  });
  
  return app;
}