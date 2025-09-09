import { Account, KeyPair, providers, transactions, utils } from 'near-api-js';
import { Logger } from '../utils/logger';
import { MetricsService } from '../utils/metrics';
import { BatchProcessor } from './batch-processor';
import { NonceManager } from './nonce-manager';
import { KeyManager } from './key-manager';
import { TransferRequest } from '../models/transfer-request';
import { getConfig } from '../app/config';

export class FTTransferService {
  private static instance: FTTransferService;
  private config = getConfig();
  private logger = new Logger('FTTransferService');
  private metrics = MetricsService.getInstance();
  private provider: providers.JsonRpcProvider;
  private batchProcessor: BatchProcessor;
  private nonceManager: NonceManager;
  private keyManager: KeyManager;
  private isInitialized = false;

  private constructor() {
    this.provider = new providers.JsonRpcProvider({ url: this.config.nodeUrl });
    this.keyManager = new KeyManager(this.config);
    this.nonceManager = new NonceManager(this.provider, this.config);
    this.batchProcessor = new BatchProcessor(
      this.config,
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
      // Initialize key manager
      await this.keyManager.initialize();
      
      // Initialize nonce manager
      await this.nonceManager.initialize(this.keyManager.getPublicKeys());
      
      // Start batch processor
      this.batchProcessor.start();
      
      this.isInitialized = true;
      this.logger.info('FTTransferService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize FTTransferService:', error);
      throw error;
    }
  }

  public async queueTransfer(request: TransferRequest): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Service not initialized');
    }

    const queueId = this.batchProcessor.addToQueue(request);
    this.metrics.incrementTransferQueued();
    
    this.logger.debug('Transfer queued', { queueId, receiverId: request.receiverId });
    return queueId;
  }

  public getMetrics() {
    return {
      queueSize: this.batchProcessor.getQueueSize(),
      ...this.metrics.getMetrics(),
      keyManager: this.keyManager.getMetrics(),
      nonceManager: this.nonceManager.getMetrics()
    };
  }

  private async processBatch(requests: TransferRequest[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    const batchStartTime = Date.now();
    this.logger.info(`Processing batch of ${requests.length} transfers`);

    try {
      // Process transfers in parallel with key rotation
      const results = await Promise.allSettled(
        requests.map((request, index) => 
          this.processSingleTransfer(request, index % this.config.keyRotationCount)
        )
      );

      // Update metrics
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      this.metrics.recordBatchProcessing(
        requests.length,
        successful,
        failed,
        Date.now() - batchStartTime
      );

      this.logger.info(`Batch processed: ${successful} successful, ${failed} failed`);
      
      // Log errors for failed transfers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error('Transfer failed', {
            receiverId: requests[index].receiverId,
            error: result.reason.message
          });
        }
      });

    } catch (error) {
      this.logger.error('Error processing batch:', error);
      this.metrics.incrementBatchErrors();
    }
  }

  private async processSingleTransfer(request: TransferRequest, keyIndex: number): Promise<string> {
    const startTime = Date.now();
    
    try {
      const keyPair = this.keyManager.getKeyPair(keyIndex);
      const publicKey = keyPair.getPublicKey().toString();
      const nonce = await this.nonceManager.getNextNonce(publicKey);

      // Create FT transfer function call
      const functionCall = transactions.functionCall(
        'ft_transfer',
        {
          receiver_id: request.receiverId,
          amount: request.amount,
          memo: request.memo
        },
        30000000000000, // 30 TGas
        '1' // 1 yoctoNEAR
      );

      // Get recent block hash
      const recentBlockHash = utils.serialize.base_decode(
        (await this.provider.getStatus()).sync_info.latest_block_hash
      );

      // Create transaction
      const transaction = transactions.createTransaction(
        this.config.masterAccountId,
        keyPair.getPublicKey(),
        this.config.contractId,
        nonce,
        [functionCall],
        recentBlockHash
      );

      // Sign transaction
      const signedTransaction = await transactions.signTransaction(
        transaction,
        keyPair,
        this.config.masterAccountId,
        this.config.networkId
      );

      // Send transaction
      const result = await this.provider.sendTransaction(signedTransaction);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.recordTransferSuccess(processingTime);
      
      this.logger.debug('Transfer successful', {
        receiverId: request.receiverId,
        transactionId: result.transaction_outcome.id,
        processingTime
      });

      return result.transaction_outcome.id;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.recordTransferFailure(processingTime);
      
      this.logger.error('Transfer failed', {
        receiverId: request.receiverId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });
      
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    this.batchProcessor.stop();
    this.logger.info('FTTransferService shutdown completed');
  }
}