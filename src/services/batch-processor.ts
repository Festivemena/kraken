import { Logger } from '../utils/logger';
import { TransferRequest } from '../models/transfer-request';
import { v4 as uuidv4 } from 'uuid';

interface BatchProcessorConfig {
  batchSize: number;
  batchIntervalMs: number;
}

export class BatchProcessor {
  private logger = new Logger('BatchProcessor');
  private queue: Map<string, TransferRequest> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: BatchProcessorConfig;

  constructor(
    config: BatchProcessorConfig,
    private processCallback: (requests: TransferRequest[]) => Promise<void>
  ) {
    this.config = config;
  }

  public start(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(
      () => this.processBatch(),
      this.config.batchIntervalMs
    );

    this.logger.info('Batch processor started', {
      batchSize: this.config.batchSize,
      intervalMs: this.config.batchIntervalMs
    });
  }

  public stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.logger.info('Batch processor stopped');
  }

  public addToQueue(request: TransferRequest): string {
    const id = uuidv4();
    this.queue.set(id, request);
    return id;
  }

  public getQueueSize(): number {
    return this.queue.size;
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get batch of requests
      const batchSize = Math.min(this.config.batchSize, this.queue.size);
      const batchRequests: TransferRequest[] = [];
      const batchIds: string[] = [];

      // Take requests from queue
      for (const [id, request] of this.queue.entries()) {
        if (batchRequests.length >= batchSize) break;
        
        batchRequests.push(request);
        batchIds.push(id);
        this.queue.delete(id);
      }

      if (batchRequests.length > 0) {
        await this.processCallback(batchRequests);
      }

    } catch (error) {
      this.logger.error('Error in batch processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  public clearQueue(): void {
    this.queue.clear();
    this.logger.info('Queue cleared');
  }
}