import { config } from 'dotenv';
import { createServer } from './app/server';
import { Logger } from './utils/logger';
import { MetricsService } from './utils/metrics';

// Load environment variables
config();

const logger = new Logger('Index');
const metrics = MetricsService.getInstance();

async function bootstrap() {
  try {
    const app = await createServer();
    const port = process.env.PORT || 3000;

    const server = app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Start metrics collection
      metrics.startCollection();
      
      // Graceful shutdown handling
      setupGracefulShutdown(server);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function setupGracefulShutdown(server: any) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      // Stop accepting new connections
      server.close(() => {
        logger.info('HTTP server closed');
        
        // Clean up other resources here
        metrics.stopCollection();
        
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    });
  });
}

// Start the application
if (require.main === module) {
  bootstrap().catch(error => {
    logger.error('Unhandled error during bootstrap:', error);
    process.exit(1);
  });
}

export { bootstrap };