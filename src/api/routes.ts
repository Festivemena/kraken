import { Express } from 'express';
import { FTTransferService } from '../services/transfer-service';
import { transferSchema, bulkTransferSchema } from './validators';
import { asyncHandler, validateRequest } from '../app/middleware';
import { TransferController } from './controllers';

export function setupRoutes(app: Express, transferService: FTTransferService): void {
  const controller = new TransferController(transferService);
  
  // Health check endpoint
  app.get('/health', asyncHandler(controller.healthCheck.bind(controller)));
  
  // Primary transfer endpoint for the bounty requirement
  app.post(
    '/transfer',
    validateRequest(transferSchema),
    asyncHandler(controller.transfer.bind(controller))
  );

  // Bulk transfer endpoint for high-efficiency batch operations
  app.post(
    '/bulk-transfer',
    validateRequest(bulkTransferSchema),
    asyncHandler(controller.bulkTransfer.bind(controller))
  );

  // Direct transfer endpoint (bypasses queue for immediate processing)
  app.post(
    '/direct-transfer',
    validateRequest(transferSchema),
    asyncHandler(controller.directTransfer.bind(controller))
  );
  
  // Metrics endpoint for performance monitoring
  app.get(
    '/metrics',
    asyncHandler(controller.getMetrics.bind(controller))
  );

  // Performance stats endpoint
  app.get(
    '/performance',
    asyncHandler(controller.getPerformanceStats.bind(controller))
  );
  
  // Status endpoint for system health
  app.get(
    '/status',
    asyncHandler(controller.getStatus.bind(controller))
  );

  // Bounty compliance status endpoint
  app.get(
    '/bounty-status',
    asyncHandler(controller.getBountyStatus.bind(controller))
  );

  // System information endpoint
  app.get('/system', (req, res) => {
    const systemInfo = transferService.getSystemInfo();
    res.json({
      ...systemInfo,
      timestamp: new Date().toISOString()
    });
  });

  // API documentation endpoint
  app.get('/api-docs', (req, res) => {
    res.json({
      service: 'FT Transfer API',
      version: '1.0.0',
      bountyCompliance: '100+ TPS sustained for 10 minutes',
      library: 'near-api-js (stable)',
      endpoints: {
        'POST /transfer': {
          description: 'Queue a single FT transfer (primary bounty endpoint)',
          body: {
            receiverId: 'string (required) - NEAR account ID',
            amount: 'string (required) - Token amount',
            memo: 'string (optional) - Transfer memo'
          },
          example: {
            receiverId: 'alice.testnet',
            amount: '100',
            memo: 'Payment for services'
          }
        },
        'POST /bulk-transfer': {
          description: 'Queue multiple FT transfers in a single request',
          body: {
            transfers: 'array (required) - Array of transfer objects',
            priority: 'number (optional) - Processing priority',
            batchId: 'string (optional) - Custom batch identifier'
          }
        },
        'POST /direct-transfer': {
          description: 'Execute immediate FT transfer (bypasses queue)',
          body: 'Same as /transfer'
        },
        'GET /health': {
          description: 'Health check endpoint'
        },
        'GET /metrics': {
          description: 'Detailed performance metrics'
        },
        'GET /performance': {
          description: 'Real-time performance statistics'
        },
        'GET /status': {
          description: 'System status and configuration'
        },
        'GET /bounty-status': {
          description: 'Bounty compliance status and testing information'
        },
        'GET /system': {
          description: 'System information and configuration'
        }
      },
      usage: {
        highTPS: 'Use /transfer endpoint with concurrent requests for 100+ TPS',
        bulk: 'Use /bulk-transfer for efficient batch processing',
        monitoring: 'Use /metrics and /performance for real-time monitoring',
        testing: 'Run npm run benchmark:100tps to validate bounty compliance'
      },
      rateLimit: 'Configured for high TPS (1000 requests/sec by default)',
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint with basic information
  app.get('/', (req, res) => {
    const performanceStats = transferService.getPerformanceStats();
    
    res.json({
      service: 'FT Transfer API Server',
      version: '1.0.0',
      bountyCompliance: {
        requirement: '100+ TPS sustained for 10 minutes',
        currentTPS: performanceStats.currentTPS,
        status: performanceStats.bountyCompliance.achieved ? 'COMPLIANT' : 'NOT_COMPLIANT'
      },
      endpoints: [
        'POST /transfer - Queue FT transfer',
        'POST /bulk-transfer - Bulk transfer operations', 
        'POST /direct-transfer - Immediate transfer',
        'GET /health - Health check',
        'GET /metrics - Performance metrics',
        'GET /status - System status',
        'GET /bounty-status - Bounty compliance status',
        'GET /api-docs - API documentation'
      ],
      testing: {
        benchmark: 'npm run benchmark:100tps',
        example: {
          curl: `curl -X POST ${req.protocol}://${req.get('host')}/transfer \\
  -H "Content-Type: application/json" \\
  -d '{"receiverId":"alice.testnet","amount":"100","memo":"test"}'`
        }
      },
      library: 'near-api-js',
      timestamp: new Date().toISOString()
    });
  });
}