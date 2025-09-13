import { Request, Response } from 'express';
import { FTTransferService } from '../services/transfer-service';
import { Logger } from '../utils/logger';
import { TransferRequest, BulkTransferRequest } from '../models/transfer-request';

export class TransferController {
  private logger = new Logger('TransferController');
  
  constructor(private transferService: FTTransferService) {}
  
  async transfer(req: Request, res: Response): Promise<void> {
    const { receiverId, amount, memo } = req.body as TransferRequest;
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing FT transfer request', {
        receiverId,
        amount,
        memo: memo ? memo.substring(0, 50) + '...' : undefined,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      const queueId = await this.transferService.queueTransfer({
        receiverId,
        amount,
        memo
      });
      
      const processingTime = Date.now() - startTime;
      
      this.logger.transfer('Transfer queued successfully', {
        queueId,
        receiverId,
        amount,
        processingTime: `${processingTime}ms`
      });

      res.json({
        success: true,
        message: 'Transfer queued successfully',
        queueId,
        receiverId,
        amount,
        processingTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Error queueing transfer:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        receiverId,
        amount,
        processingTime: `${processingTime}ms`,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(400).json({
        success: false,
        error: 'Failed to queue transfer',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        timestamp: new Date().toISOString()
      });
    }
  }

  async bulkTransfer(req: Request, res: Response): Promise<void> {
    const { transfers, priority = 1, batchId } = req.body as BulkTransferRequest;
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing bulk transfer request', {
        count: transfers.length,
        batchId,
        priority,
        ip: req.ip
      });

      if (!Array.isArray(transfers) || transfers.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Transfers array is required and must not be empty'
        });
        return;
      }

      if (transfers.length > 1000) {
        res.status(400).json({
          success: false,
          error: 'Maximum 1000 transfers per bulk request'
        });
        return;
      }

      const results = [];
      let queuedCount = 0;
      let rejectedCount = 0;

      for (const transfer of transfers) {
        try {
          const queueId = await this.transferService.queueTransfer(transfer);
          results.push({
            request: transfer,
            queueId,
            success: true
          });
          queuedCount++;
        } catch (error) {
          results.push({
            request: transfer,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false
          });
          rejectedCount++;
        }
      }

      const processingTime = Date.now() - startTime;
      const finalBatchId = batchId || `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      this.logger.batch('Bulk transfer completed', {
        batchId: finalBatchId,
        totalRequests: transfers.length,
        queued: queuedCount,
        rejected: rejectedCount,
        processingTime: `${processingTime}ms`
      });

      res.json({
        success: true,
        batchId: finalBatchId,
        totalRequests: transfers.length,
        queuedRequests: queuedCount,
        rejectedRequests: rejectedCount,
        results,
        processingTime,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Bulk transfer failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transferCount: transfers?.length || 0,
        processingTime: `${processingTime}ms`
      });

      res.status(500).json({
        success: false,
        error: 'Bulk transfer failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        timestamp: new Date().toISOString()
      });
    }
  }

  async directTransfer(req: Request, res: Response): Promise<void> {
    const { receiverId, amount, memo } = req.body as TransferRequest;
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing direct FT transfer (bypass queue)', {
        receiverId,
        amount,
        memo: memo ? memo.substring(0, 50) + '...' : undefined
      });

      const transactionHash = await this.transferService.executeDirectTransfer({
        receiverId,
        amount,
        memo
      });
      
      const processingTime = Date.now() - startTime;

      this.logger.transfer('Direct transfer completed', {
        transactionHash,
        receiverId,
        amount,
        processingTime: `${processingTime}ms`
      });

      res.json({
        success: true,
        message: 'Direct transfer completed',
        transactionHash,
        receiverId,
        amount,
        processingTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Direct transfer failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        receiverId,
        amount,
        processingTime: `${processingTime}ms`
      });
      
      res.status(500).json({
        success: false,
        error: 'Direct transfer failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const metrics = this.transferService.getMetrics();
      const performanceStats = this.transferService.getPerformanceStats();
      
      res.json({
        timestamp: new Date().toISOString(),
        service: 'ft-transfer-api',
        bountyTarget: '100+ TPS sustained for 10 minutes',
        metrics,
        performance: performanceStats,
        uptime: process.uptime()
      });
    } catch (error) {
      this.logger.error('Error getting metrics:', error);
      res.status(500).json({ 
        error: 'Failed to get metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getPerformanceStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = this.transferService.getPerformanceStats();
      
      res.json({
        timestamp: new Date().toISOString(),
        ...stats
      });
    } catch (error) {
      this.logger.error('Error getting performance stats:', error);
      res.status(500).json({ 
        error: 'Failed to get performance stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const healthCheck = await this.transferService.healthCheck();
      const metrics = this.transferService.getMetrics();
      const systemInfo = this.transferService.getSystemInfo();
      
      res.json({
        status: healthCheck.healthy ? 'operational' : 'degraded',
        timestamp: new Date().toISOString(),
        bountyCompliance: {
          target: '100+ TPS sustained for 10 minutes',
          currentTPS: metrics.currentTPS,
          achieved: metrics.bountyCompliance.achieved,
          performance: metrics.bountyCompliance.performance
        },
        health: healthCheck,
        queue: {
          size: metrics.queueSize,
          pending: metrics.transferQueuePending,
          concurrency: systemInfo.configuration.queueConcurrency
        },
        totals: {
          transfers: metrics.totalTransfers,
          successful: metrics.successfulTransfers,
          failed: metrics.failedTransfers,
          successRate: metrics.totalTransfers > 0 ? 
            `${((metrics.successfulTransfers / metrics.totalTransfers) * 100).toFixed(2)}%` : '0%'
        },
        system: systemInfo
      });
    } catch (error) {
      this.logger.error('Error getting status:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to get status',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  async getBountyStatus(req: Request, res: Response): Promise<void> {
    try {
      const performanceStats = this.transferService.getPerformanceStats();
      const systemInfo = this.transferService.getSystemInfo();
      
      res.json({
        bounty: {
          requirement: '100+ transfers per second sustained for 10 minutes',
          library: 'near-api-js (stable)',
          status: performanceStats.bountyCompliance.achieved ? 'COMPLIANT' : 'NOT_COMPLIANT'
        },
        performance: {
          currentTPS: performanceStats.currentTPS,
          targetTPS: 100,
          achieved: performanceStats.bountyCompliance.achieved,
          performance: performanceStats.bountyCompliance.performance,
          sustainedTest: 'Use benchmark suite to validate 10-minute sustained performance'
        },
        system: {
          configuration: systemInfo.configuration,
          optimization: 'Configured for high TPS with batch processing and concurrency control'
        },
        testing: {
          benchmarkCommand: 'npm run benchmark:100tps',
          customBenchmark: 'npm run benchmark http://localhost:3000 [TPS] [MINUTES] testnet',
          validation: 'Run benchmark to generate compliance report'
        },
        endpoints: {
          transfer: 'POST /transfer',
          bulkTransfer: 'POST /bulk-transfer',
          directTransfer: 'POST /direct-transfer',
          metrics: 'GET /metrics',
          status: 'GET /status'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error getting bounty status:', error);
      res.status(500).json({ 
        error: 'Failed to get bounty status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthCheck = await this.transferService.healthCheck();
      const statusCode = healthCheck.healthy ? 200 : 503;
      
      res.status(statusCode).json({
        status: healthCheck.healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'ft-transfer-api',
        version: '1.0.0',
        bountyTarget: '100+ TPS',
        details: healthCheck.details,
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version
      });
    } catch (error) {
      this.logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }
}