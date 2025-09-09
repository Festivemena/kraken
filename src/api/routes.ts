import { Express } from 'express';
import { FTTransferService } from '../services/transfer-service';
import { transferSchema } from './validators';
import { asyncHandler, validateRequest } from '../app/middleware';
import { TransferController } from './controllers';

export function setupRoutes(app: Express, transferService: FTTransferService): void {
  const controller = new TransferController(transferService);
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // Transfer endpoint
  app.post(
    '/transfer',
    validateRequest(transferSchema),
    asyncHandler(controller.transfer.bind(controller))
  );
  
  // Metrics endpoint
  app.get(
    '/metrics',
    asyncHandler(controller.getMetrics.bind(controller))
  );
  
  // Status endpoint
  app.get(
    '/status',
    asyncHandler(controller.getStatus.bind(controller))
  );
}