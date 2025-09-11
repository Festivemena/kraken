import { 
  Account, 
  KeyPair, 
  connect, 
  Near,
  providers,
  transactions,
  utils 
} from '@near-js/api';
import { InMemoryKeyStore } from '@near-js/keystores';
import { Logger } from '../utils/logger';
import { AppConfig } from '../app/config';

export interface ConnectionPool {
  provider: providers.JsonRpcProvider;
  near: Near;
  account: Account;
}

export class NearClientService {
  private static instance: NearClientService;
  private logger = new Logger('NearClientService');
  private connectionPool: ConnectionPool[] = [];
  private currentConnectionIndex = 0;
  private config: AppConfig;
  private keyStore: InMemoryKeyStore;

  private constructor(config: AppConfig) {
    this.config = config;
    this.keyStore = new InMemoryKeyStore();
  }

  public static getInstance(config: AppConfig): NearClientService {
    if (!NearClientService.instance) {
      NearClientService.instance = new NearClientService(config);
    }
    return NearClientService.instance;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing NEAR client service');
    
    try {
      // Add master key to keystore
      const masterKeyPair = KeyPair.fromString(this.config.masterPrivateKey);
      await this.keyStore.setKey(
        this.config.networkId,
        this.config.masterAccountId,
        masterKeyPair
      );

      // Create connection pool
      for (let i = 0; i < this.config.rpcPoolSize; i++) {
        const connection = await this.createConnection();
        this.connectionPool.push(connection);
      }

      this.logger.info('NEAR client service initialized successfully', {
        poolSize: this.connectionPool.length,
        networkId: this.config.networkId
      });

    } catch (error) {
      this.logger.error('Failed to initialize NEAR client service:', error);
      throw error;
    }
  }

  private async createConnection(): Promise<ConnectionPool> {
    const provider = new providers.JsonRpcProvider({ 
      url: this.config.nodeUrl,
      timeout: this.config.rpcTimeout
    });

    const near = new Near({
      networkId: this.config.networkId,
      provider,
      keyStore: this.keyStore,
      config: {
        networkId: this.config.networkId,
        nodeUrl: this.config.nodeUrl,
        walletUrl: this.config.walletUrl,
        helperUrl: this.config.helperUrl,
        explorerUrl: this.config.explorerUrl
      }
    });

    const account = await near.account(this.config.masterAccountId);

    return { provider, near, account };
  }

  public getConnection(): ConnectionPool {
    const connection = this.connectionPool[this.currentConnectionIndex];
    this.currentConnectionIndex = (this.currentConnectionIndex + 1) % this.connectionPool.length;
    return connection;
  }

  public async sendTransaction(
    signedTransaction: transactions.SignedTransaction
  ): Promise<providers.FinalExecutionOutcome> {
    let lastError: Error;

    // Try with different connections if one fails
    for (let i = 0; i < this.connectionPool.length; i++) {
      try {
        const connection = this.getConnection();
        const result = await connection.provider.sendTransaction(signedTransaction);
        
        // Wait for transaction to be processed
        return await this.waitForTransaction(result.transaction.hash, connection.provider);
      } catch (error) {
        lastError = error as Error;
        this.logger.warn('Transaction failed, trying next connection', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: i + 1 
        });
        continue;
      }
    }

    throw lastError!;
  }

  private async waitForTransaction(
    txHash: string, 
    provider: providers.JsonRpcProvider,
    maxAttempts: number = 10
  ): Promise<providers.FinalExecutionOutcome> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await provider.txStatus(txHash, this.config.masterAccountId);
        return result;
      } catch (error: any) {
        if (error.type === 'TimeoutError' && i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Transaction ${txHash} not found after ${maxAttempts} attempts`);
  }

  public async getRecentBlockHash(): Promise<Uint8Array> {
    const connection = this.getConnection();
    const status = await connection.provider.status();
    return utils.serialize.base_decode(status.sync_info.latest_block_hash);
  }

  public async getAccessKey(accountId: string, publicKey: string): Promise<any> {
    const connection = this.getConnection();
    return await connection.provider.query({
      request_type: 'view_access_key',
      finality: 'final',
      account_id: accountId,
      public_key: publicKey,
    });
  }

  public async addKeyToKeyStore(accountId: string, keyPair: KeyPair): Promise<void> {
    await this.keyStore.setKey(this.config.networkId, accountId, keyPair);
  }

  public getMetrics() {
    return {
      poolSize: this.connectionPool.length,
      currentConnectionIndex: this.currentConnectionIndex,
      networkId: this.config.networkId,
      nodeUrl: this.config.nodeUrl
    };
  }

  public async shutdown(): Promise<void> {
    this.logger.info('NEAR client service shutdown');
    // Clean up connections if needed
  }
}