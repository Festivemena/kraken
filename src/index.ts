import { config } from 'dotenv';
import { createServer } from './app/server';
import { Logger } from './utils/logger';
import { MetricsService } from './utils/metrics';
import { getConfig, validateConfig } from './app/config';

// Load environment variables
config();

const logger = new Logger('Index');
const metrics = MetricsService.getInstance();
const appConfig = getConfig();

async function bootstrap() {
  try {
    logger.info('Starting FT Transfer API Server for NEAR Bounty', {
      service: 'ft-transfer-api',
      version: '1.0.0',
      bountyTarget: '100+ TPS sustained for 10 minutes',
      library: 'near-api-js (stable)',
      nodeVersion: process.version,
      platform: process.platform
    });

    // Validate configuration before starting
    const configErrors = validateConfig(appConfig);
    if (configErrors.length > 0) {
      logger.error('Configuration validation failed:', { errors: configErrors });
      process.exit(1);
    }

    logger.info('Configuration validated successfully', {
      networkId: appConfig.networkId,
      masterAccountId: appConfig.masterAccountId,
      contractId: appConfig.contractId,
      batchSize: appConfig.batchSize,
      queueConcurrency: appConfig.queueConcurrency,
      performance: 'Optimized for 100+ TPS'
    });

    // Create and start the server
    const app = await createServer();
    const port = appConfig.port;

    const server = app.listen(port, () => {
      logger.info('🚀 FT Transfer API Server started successfully', {
        port,
        environment: appConfig.nodeEnv,
        endpoints: [
          `http://localhost:${port}/transfer`,
          `http://localhost:${port}/bulk-transfer`,
          `http://localhost:${port}/metrics`,
          `http://localhost:${port}/bounty-status`
        ],
        bountyCompliance: {
          target: '100+ TPS for 10 minutes',
          library: 'near-api-js',
          benchmarkCommand: 'npm run benchmark:100tps'
        }
      });

      // Start metrics collection
      metrics.startCollection();
      
      // Log system information for debugging
      logger.info('System Information', {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: {
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        },
        uptime: process.uptime()
      });

      // Display bounty information
      console.log('\n' + '='.repeat(60));
      console.log('🎯 NEAR BOUNTY - FT TRANSFER API SERVER');
      console.log('='.repeat(60));
      console.log('📋 Requirement: 100+ transfers per second for 10 minutes');
      console.log('📚 Library: near-api-js (stable production version)');
      console.log('🔧 Optimization: Batch processing + concurrency control');
      console.log('');
      console.log('🚀 Quick Start:');
      console.log(`   Server: http://localhost:${port}`);
      console.log('   Health: curl http://localhost:${port}/health');
      console.log('   Status: curl http://localhost:${port}/bounty-status');
      console.log('');
      console.log('📊 Testing:');
      console.log('   Benchmark: npm run benchmark:100tps');
      console.log('   Custom:    npm run benchmark http://localhost:${port} 150 10 testnet');
      console.log('');
      console.log('📱 Example Transfer:');
      console.log(`   curl -X POST http://localhost:${port}/transfer \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"receiverId":"alice.testnet","amount":"100","memo":"test"}\'');
      console.log('='.repeat(60) + '\n');
      
      // Setup graceful shutdown
      // setupGracefulShutdown(server);
    });

    // Handle server startup errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use. Please choose a different port.`);
      } else {
        logger.error('Server startup error:', error);
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

function setupGracefulShutdown(server: any) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
      });

      try {
        // Stop metrics collection
        metrics.stopCollection();
        
        // Give ongoing requests time to complete
        logger.info('Waiting for ongoing requests to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined
    });
    process.exit(1);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000).unref(); // unref() allows process to exit naturally if other work completes
}

// Handle process warnings
process.on('warning', (warning) => {
  logger.warn('Process warning:', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
  });
});

// Start the application if this file is run directly
if (require.main === module) {
  bootstrap().catch(error => {
    console.error('Unhandled error during bootstrap:', error);
    process.exit(1);
  });
}

export { bootstrap };