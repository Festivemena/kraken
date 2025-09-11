import { Logger } from '../utils/logger';
import { TransferRequest } from '../models/transfer-request';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

interface BatchProcessorConfig {
  batchSize: number;
  batchIntervalMs: number;
  maxConcurrentBatches?: number;
  adaptiveBatching?: boolean;
}

interface QueuedTransfer {
  id: string;
  request: TransferRequest;
  timestamp: number;
  priority: number;
  retryCount: number;
}

interface BatchMetrics {
  totalBatches: number;
  avgBatchSize: number;
  avgProcessingTime: number;
  successRate: number;
  lastBatchTime: number;
}

export class BatchProcessor extends EventEmitter {
  private logger = new Logger('BatchProcessor');
  private queue: Map<string, QueuedTransfer> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private config: BatchProcessorConfig;
  private metrics: BatchMetrics;
  private currentBatchCount = 0;
  private recentProcessingTimes: number[] = [];

  constructor(
    config: BatchProcessorConfig,
    private processCallback: (requests: TransferRequest[]) => Promise<void>
  ) {
    super();
    this.config = {
      maxConcurrentBatches: 5,
      adaptiveBatching: true,
      ...config
    };

    this.metrics = {
      totalBatches: 0,
      avgBatchSize: 0,
      avgProcessingTime: 0,
      successRate: 100,
      lastBatchTime: 0
    };
  }

  public start(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(
      () => this.processBatch(),
      this.config.batchIntervalMs
    );

    this.logger.info('Enhanced batch processor started', {
      batchSize: this.config.batchSize,
      intervalMs: this.config.batchIntervalMs,
      maxConcurrentBatches: this.config.maxConcurrentBatches,
      adaptiveBatching: this.config.adaptiveBatching
    });
  }

  public stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.logger.info('Enhanced batch processor stopped');
  }

  public addToQueue(request: TransferRequest, priority: number = 1): string {
    const id = uuidv4();
    const queuedTransfer: QueuedTransfer = {
      id,
      request,
      timestamp: Date.now(),
      priority,
      retryCount: 0
    };

    this.queue.set(id, queuedTransfer);
    this.emit('itemQueued', { id, queueSize: this.queue.size });
    
    // Trigger immediate processing if queue is getting large
    if (this.queue.size >= this.config.batchSize * 2 && !this.isProcessing) {
      setImmediate(() => this.processBatch());
    }

    return id;
  }

  public getQueueSize(): number {
    return this.queue.size;
  }

  public getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.size === 0) {
      return;
    }

    // Check if we're at max concurrent batches
    if (this.currentBatchCount >= this.config.maxConcurrentBatches!) {
      this.logger.debug('Max concurrent batches reached, waiting');
      return;
    }

    this.isProcessing = true;
    this.currentBatchCount++;
    const batchStartTime = Date.now();

    try {
      // Get optimal batch size
      const batchSize = this.getOptimalBatchSize();
      
      // Get highest priority items first
      const batchItems = this.getBatchItems(batchSize);
      
      if (batchItems.length === 0) {
        return;
      }

      const batchRequests = batchItems.map(item => item.request);
      const batchIds = batchItems.map(item => item.id);

      this.logger.debug(`Processing adaptive batch`, {
        size: batchRequests.length,
        queueSize: this.queue.size,
        avgProcessingTime: this.metrics.avgProcessingTime
      });

      // Remove items from queue
      batchIds.forEach(id => this.queue.delete(id));

      // Process the batch
      await this.processCallback(batchRequests);

      // Update metrics
      const processingTime = Date.now() - batchStartTime;
      this.updateMetrics(batchRequests.length, processingTime, true);

      this.emit('batchProcessed', {
        size: batchRequests.length,
        processingTime,
        success: true
      });

    } catch (error) {
      const processingTime = Date.now() - batchStartTime;
      this.logger.error('Batch processing failed:', error);
      
      this.updateMetrics(0, processingTime, false);
      
      this.emit('batchFailed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

    } finally {
      this.isProcessing = false;
      this.currentBatchCount--;
    }
  }

  private getBatchItems(batchSize: number): QueuedTransfer[] {
    const items = Array.from(this.queue.values());
    
    // Sort by priority (higher first) and then by timestamp (older first)
    items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });

    return items.slice(0, batchSize);
  }

  private getOptimalBatchSize(): number {
    if (!this.config.adaptiveBatching) {
      return this.config.batchSize;
    }

    const queueSize = this.queue.size;
    const baseBatchSize = this.config.batchSize;

    // Adaptive batching logic
    if (queueSize > baseBatchSize * 3) {
      // Queue is getting large, increase batch size
      return Math.min(baseBatchSize * 2, queueSize);
    } else if (queueSize < baseBatchSize / 2) {
      // Queue is small, reduce batch size to maintain responsiveness
      return Math.max(1, Math.min(baseBatchSize / 2, queueSize));
    }

    // Use recent processing times to adjust batch size
    if (this.recentProcessingTimes.length >= 3) {
      const avgProcessingTime = this.recentProcessingTimes.reduce((a, b) => a + b, 0) / 
                               this.recentProcessingTimes.length;
      
      if (avgProcessingTime > this.config.batchIntervalMs * 2) {
        // Processing is slow, reduce batch size
        return Math.max(1, Math.floor(baseBatchSize * 0.7));
      } else if (avgProcessingTime < this.config.batchIntervalMs / 2) {
        // Processing is fast, we can increase batch size
        return Math.min(baseBatchSize * 1.5, queueSize);
      }
    }

    return baseBatchSize;
  }

  private updateMetrics(batchSize: number, processingTime: number, success: boolean): void {
    this.metrics.totalBatches++;
    this.metrics.lastBatchTime = processingTime;

    // Update average batch size
    this.metrics.avgBatchSize = (
      (this.metrics.avgBatchSize * (this.metrics.totalBatches - 1)) + batchSize
    ) / this.metrics.totalBatches;

    // Update average processing time
    this.metrics.avgProcessingTime = (
      (this.metrics.avgProcessingTime * (this.metrics.totalBatches - 1)) + processingTime
    ) / this.metrics.totalBatches;

    // Keep recent processing times for adaptive batching
    this.recentProcessingTimes.push(processingTime);
    if (this.recentProcessingTimes.length > 10) {
      this.recentProcessingTimes.shift();
    }

    // Update success rate
    const successCount = success ? 1 : 0;
    this.metrics.successRate = (
      (this.metrics.successRate * (this.metrics.totalBatches - 1)) + (successCount * 100)
    ) / this.metrics.totalBatches;
  }

  public clearQueue(): void {
    const clearedCount = this.queue.size;
    this.queue.clear();
    
    this.logger.info('Queue cleared', { clearedCount });
    this.emit('queueCleared', { clearedCount });
  }

  public requeueFailedItems(items: QueuedTransfer[]): void {
    items.forEach(item => {
      item.retryCount++;
      item.timestamp = Date.now();
      
      // Reduce priority for retried items
      item.priority = Math.max(0.1, item.priority * 0.8);
      
      if (item.retryCount <= 3) {
        this.queue.set(item.id, item);
      } else {
        this.logger.warn('Item exceeded max retries, dropping', { 
          id: item.id, 
          retryCount: item.retryCount 
        });
      }
    });
  }

  // Get items by priority for external monitoring
  public getQueueStats() {
    const items = Array.from(this.queue.values());
    const now = Date.now();
    
    return {
      totalItems: items.length,
      highPriority: items.filter(item => item.priority > 1).length,
      oldestItem: items.length > 0 ? Math.max(...items.map(item => now - item.timestamp)) : 0,
      retryItems: items.filter(item => item.retryCount > 0).length,
      avgAge: items.length > 0 ? 
        items.reduce((sum, item) => sum + (now - item.timestamp), 0) / items.length : 0
    };
  }

  // Priority transfer for urgent requests
  public addPriorityTransfer(request: TransferRequest): string {
    return this.addToQueue(request, 10); // High priority
  }

  public async shutdown(): Promise<void> {
    this.stop();
    
    // Wait for current batch to complete
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.logger.info('Enhanced batch processor shutdown completed', {
      remainingItems: this.queue.size,
      totalBatchesProcessed: this.metrics.totalBatches
    });
  }
}