import { KeyPair, transactions, utils } from '@near-js/api';
import { Logger } from '../utils/logger';
import { MetricsService } from '../utils/metrics';
import { BatchProcessor } from './batch-processor';
import { NonceManager } from './nonce-manager';
import { KeyManager } from './key-manager';
import { NearClientService } from './near-client';
import { TransferRequest } from '../models/transfer-request';
import { getConfig } from '../app/config';
import PQueue from 'p-queue';
import pLimit from 'p-limit';

interface TransferTask {
  request: TransferRequest;
  keyIndex: number;
  resolve: (value: string) => void;
  reject: (reason: any) => void;
}

export class FTTransferService {
  private static instance: FTTransferService;
  private config = getConfig();
  private logger = new Logger('FTTransferService');
  private metrics = MetricsService.getInstance();
  
  private batchProcessor: BatchProcessor;
  private nonceManager: NonceManager;
  private keyManager: KeyManager;
  private nearClient: NearClientService;
  
  private transferQueue: PQueue;
  private concurrencyLimit = pLimit(this.config.maxParallelTransactions);
  
  private isInitialized = false;
  private isShuttingDown = false;

  private constructor() {
    this.nearClient = NearClientService.getInstance(this.config);
    this.keyManager = new KeyManager(this.config, this.nearClient);
    this.nonceManager = new NonceManager(this.nearClient, this.config);
    
    // High-performance queue configuration
    this.transferQueue = new PQueue({
      concurrency: this.config.queueConcurrency,
      intervalCap: this.config.batchSize,
      interval: this.config.batchIntervalMs,
      timeout: 30000,
      throwOnTimeout: true
    });
    
    this.batchProcessor = new BatchProcessor(
      {
        batchSize: this.config.batchSize,
        batchIntervalMs: this.config.batchIntervalMs
      },
      this.processBatch.bind(this)
    );
  }

  public static getInstance(): FTTransferService {
    if (!FTTransferService.instance) {
      FTTransferService.instance = new FTTransferService();
    }
    return FTTransferService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing high-performance FT transfer service');
      
      // Initialize NEAR client service first
      await this.nearClient.initialize();
      
      // Initialize key manager
      await this.keyManager.initialize();
      
      // Initialize nonce manager with all key pairs
      const keyPairsWithAccounts = this.keyManager.getKeyPairsWithAccounts();
      await this.nonceManager.initialize(keyPairsWithAccounts);
      
      // Start batch processor
      this.batchProcessor.start();
      
      // Setup queue event handlers
      this.setupQueueHandlers();
      
      this.isInitialized = true;
      this.logger.info('High-performance FT transfer service initialized successfully', {
        keyCount: this.keyManager.getKeyCount(),
        queueConcurrency: this.config.queueConcurrency,
        batchSize: this.config.batchSize
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize FT transfer service:', error);
      throw error;
    }
  }

  private setupQueueHandlers(): void {
    this.transferQueue.on('add', () => {
      this.metrics.incrementTransferQueued();
    });

    this.transferQueue.on('completed', () => {
      // Metrics updated in individual transfer methods
    });

    this.transferQueue.on('failed', (error) => {
      this.logger.error('Queue task failed:', error);
    });
  }

  public async queueTransfer(request: TransferRequest): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Service is shutting down');
    }

    const queueId = this.batchProcessor.addToQueue(request);
    
    this.logger.debug('Transfer queued', { 
      queueId, 
      receiverId: request.receiverId,
      amount: request.amount,
      queueSize: this.batchProcessor.getQueueSize()
    });
    
    return queueId;
  }

  public async queueDirectTransfer(request: TransferRequest): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    return new Promise((resolve, reject) => {
      const { accountId, keyPair, keyIndex } = this.keyManager.getKeyPair();
      
      this.transferQueue.add(() => this.concurrencyLimit(async () => {
        try {
          const transactionId = await this.processSingleTransfer(request, keyIndex);
          resolve(transactionId);
        } catch (error) {
          reject(error);
        }
      }));
    });
  }

  public getMetrics() {
    return {
      queueSize: this.batchProcessor.getQueueSize(),
      transferQueueSize: this.transferQueue.size,
      transferQueuePending: this.transferQueue.pending,
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      ...this.metrics.getMetrics(),
      keyManager: this.keyManager.getMetrics(),
      nonceManager: this.nonceManager.getMetrics(),
      nearClient: this.nearClient.getMetrics()
    };
  }

  private async processBatch(requests: TransferRequest[]): Promise<void> {
    if (requests.length === 0 || this.isShuttingDown) {
      return;
    }

    const batchStartTime = Date.now();
    this.logger.info(`Processing high-performance batch of ${requests.length} transfers`);

    try {
      // Process transfers with controlled concurrency
      const transferPromises = requests.map((request, index) => 
        this.concurrencyLimit(async () => {
          const keyIndex = index % this.keyManager.getKeyCount();
          return this.processSingleTransfer(request, keyIndex);
        })
      );

      const results = await Promise.allSettled(transferPromises);

      // Update metrics
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      this.metrics.recordBatchProcessing(
        requests.length,
        successful,
        failed,
        Date.now() - batchStartTime
      );

      this.logger.info(`High-performance batch processed: ${successful} successful, ${failed} failed`, {
        batchSize: requests.length,
        processingTime: Date.now() - batchStartTime,
        tps: (successful / ((Date.now() - batchStartTime) / 1000)).toFixed(2)
      });
      
      // Log errors for failed transfers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error('Transfer failed in batch', {
            receiverId: requests[index].receiverId,
            error: result.reason.message
          });
        }
      });

    } catch (error) {
      this.logger.error('Error processing high-performance batch:', error);
      this.metrics.incrementBatchErrors();
    }
  }

  private async processSingleTransfer(request: TransferRequest, keyIndex?: number): Promise<string> {
    const startTime = Date.now();
    let usedKeyIndex: number | undefined;
    
    try {
      const { accountId, keyPair, keyIndex: selectedKeyIndex } = this.keyManager.getKeyPair(keyIndex);
      usedKeyIndex = selectedKeyIndex;
      
      const publicKey = keyPair.getPublicKey().toString();
      const nonce = await this.nonceManager.getNextNonce(accountId, publicKey);

      // Create FT transfer function call with optimized gas
      const functionCall = transactions.functionCall(
        'ft_transfer',
        {
          receiver_id: request.receiverId,
          amount: request.amount,
          memo: request.memo || null
        },
        BigInt(this.config.functionCallGas),
        BigInt(this.config.attachedDeposit)
      );

      // Get recent block hash (cached from connection pool)
      const recentBlockHash = await this.nearClient.getRecentBlockHash();

      // Create transaction
      const transaction = transactions.createTransaction(
        accountId,
        keyPair.getPublicKey(),
        this.config.contractId,
        BigInt(nonce),
        [functionCall],
        recentBlockHash
      );

      // Sign transaction
      const [, signedTransaction] = await transactions.signTransaction(
        transaction,
        keyPair,
        accountId,
        this.config.networkId
      );

      // Send transaction through connection pool
      const result = await this.nearClient.sendTransaction(signedTransaction);
      
      // Release nonce and mark success
      this.nonceManager.releaseNonce(accountId, publicKey, true);
      this.keyManager.markKeySuccess(selectedKeyIndex);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.recordTransferSuccess(processingTime);
      
      this.logger.debug('High-performance transfer successful', {
        receiverId: request.receiverId,
        transactionId: result.transaction.hash,
        processingTime,
        keyIndex: selectedKeyIndex,
        nonce
      });

      return result.transaction.hash;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Release nonce and mark error
      if (usedKeyIndex !== undefined) {
        const { accountId, keyPair } = this.keyManager.getKeyPair(usedKeyIndex);
        const publicKey = keyPair.getPublicKey().toString();
        this.nonceManager.releaseNonce(accountId, publicKey, false);
        this.keyManager.markKeyError(usedKeyIndex);
      }
      
      this.metrics.recordTransferFailure(processingTime);
      
      this.logger.error('High-performance transfer failed', {
        receiverId: request.receiverId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime,
        keyIndex: usedKeyIndex
      });
      
      throw error;
    }
  }

  public async waitForQueueEmpty(): Promise<void> {
    return new Promise((resolve) => {
      const checkQueue = () => {
        if (this.transferQueue.size === 0 && this.transferQueue.pending === 0 && 
            this.batchProcessor.getQueueSize() === 0) {
          resolve();
        } else {
          setTimeout(checkQueue, 100);
        }
      };
      checkQueue();
    });
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down high-performance FT transfer service');
    this.isShuttingDown = true;
    
    try {
      // Stop accepting new transfers
      this.batchProcessor.stop();
      
      // Wait for current transfers to complete (with timeout)
      const shutdownTimeout = setTimeout(() => {
        this.logger.warn('Shutdown timeout reached, forcing shutdown');
      }, 30000);
      
      await this.waitForQueueEmpty();
      clearTimeout(shutdownTimeout);
      
      // Shutdown all services
      await Promise.all([
        this.keyManager.shutdown(),
        this.nonceManager.shutdown(),
        this.nearClient.shutdown()
      ]);
      
      this.logger.info('High-performance FT transfer service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }
  }

  // Performance monitoring methods
  public getPerformanceStats() {
    const metrics = this.getMetrics();
    const now = Date.now();
    
    return {
      currentTPS: this.calculateCurrentTPS(),
      avgProcessingTime: metrics.averageProcessingTime,
      successRate: metrics.totalTransfers > 0 ? 
        (metrics.successfulTransfers / metrics.totalTransfers) * 100 : 0,
      queueHealth: {
        size: metrics.queueSize,
        pending: metrics.transferQueuePending,
        concurrency: this.config.queueConcurrency
      },
      keyHealth: {
        total: metrics.keyManager.totalKeys,
        active: metrics.keyManager.activeKeys,
        healthy: this.keyManager.getHealthyKeyIndices().length
      }
    };
  }

  private calculateCurrentTPS(): number {
    const metrics = this.metrics.getMetrics();
    const timeWindow = 60000; // 1 minute window
    const now = Date.now();
    
    // This is a simplified calculation - in production you'd want a sliding window
    if (metrics.totalTransfers > 0 && metrics.totalProcessingTime > 0) {
      return metrics.successfulTransfers / (metrics.totalProcessingTime / 1000);
    }
    return 0;
  }
}