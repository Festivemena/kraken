import { Request, Response } from 'express';
import { FTTransferService } from '../services/transfer-service';
import { Logger } from '../utils/logger';

export class TransferController {
  private logger = new Logger('TransferController');
  
  constructor(private transferService: FTTransferService) {}
  
  async transfer(req: Request, res: Response): Promise<void> {
    const { receiverId, amount, memo } = req.body;
    
    try {
      const queueId = await this.transferService.queueTransfer({
        receiverId,
        amount,
        memo
      });
      
      res.json({
        success: true,
        message: 'Transfer queued successfully',
        queueId,
        receiverId,
        amount
      });
      
    } catch (error) {
      this.logger.error('Error queueing transfer:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to queue transfer',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.transferService.getMetrics();
      res.json(metrics);
    } catch (error) {
      this.logger.error('Error getting metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }
  
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.transferService.getMetrics();
      
      res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        queueSize: metrics.queueSize,
        totalTransfers: metrics.totalTransfers,
        successfulTransfers: metrics.successfulTransfers,
        failedTransfers: metrics.failedTransfers
      });
    } catch (error) {
      this.logger.error('Error getting status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  }
}