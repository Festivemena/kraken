import { providers, KeyPair, connect, keyStores, transactions } from 'near-api-js';
import { Logger } from '../utils/logger';

interface NonceManagerConfig {
  masterAccountId: string;
  networkId: string;
  nodeUrl: string;
}

interface KeyNonce {
  publicKey: string;
  nonce: number;
  lastUsed: number;
  lastUpdated: number;
}

export class NonceManager {
  private logger = new Logger('NonceManager');
  private nonces: Map<string, KeyNonce> = new Map();
  private config: NonceManagerConfig;
  private provider: providers.JsonRpcProvider;

  constructor(provider: providers.JsonRpcProvider, config: NonceManagerConfig) {
    this.provider = provider;
    this.config = config;
  }

  public async initialize(publicKeys: string[]): Promise<void> {
    this.logger.info('Initializing nonce manager');
    try {
      await Promise.all(
        publicKeys.map((publicKey) => this.initializeNonceForKey(publicKey))
      );
      this.logger.info('Nonce manager initialized successfully', {
        keyCount: publicKeys.length,
      });
    } catch (error) {
      this.logger.error('Failed to initialize nonce manager:', error);
      throw error;
    }
  }

  private async initializeNonceForKey(publicKey: string): Promise<void> {
    try {
      const accessKey = await this.provider.query({
        request_type: 'view_access_key',
        finality: 'final',
        account_id: this.config.masterAccountId,
        public_key: publicKey,
      });

      if (accessKey && typeof accessKey === 'object' && 'nonce' in accessKey) {
        const nonce = (accessKey as any).nonce + 1;

        this.nonces.set(publicKey, {
          publicKey,
          nonce,
          lastUsed: Date.now(),
          lastUpdated: Date.now(),
        });

        this.logger.debug('Nonce initialized for key', { publicKey, nonce });
        return;
      }
    } catch (error: any) {
      if (error?.type === 'AccessKeyDoesNotExist') {
        this.logger.warn(`Access key not found for ${publicKey}, creating a new one...`);
        await this.createAccessKey(publicKey);
        return this.initializeNonceForKey(publicKey); // retry
      }

      this.logger.error(
        `Failed to initialize nonce for key ${publicKey}: ${error?.message}`,
        { stack: error?.stack }
      );
      throw new Error(`Failed to initialize nonce for key ${publicKey}`);
    }
  }

  private async createAccessKey(publicKey: string): Promise<void> {
    try {
      const keyStore = new keyStores.InMemoryKeyStore();
      const near = await connect({
        networkId: this.config.networkId,
        nodeUrl: this.config.nodeUrl,
        deps: { keyStore },
      });

      const account = await near.account(this.config.masterAccountId);

      // Add full access key (⚠️ be careful, this gives full control)
      const tx = await account.addKey(publicKey);

      this.logger.info('New access key added', { publicKey, txId: tx.transaction_outcome.id });
    } catch (error: any) {
      this.logger.error(
        `Failed to create access key for ${publicKey}: ${error?.message}`,
        { stack: error?.stack }
      );
      throw error;
    }
  }

  public async getNextNonce(publicKey: string): Promise<number> {
    const keyNonce = this.nonces.get(publicKey);

    if (!keyNonce) {
      throw new Error(`No nonce found for public key: ${publicKey}`);
    }

    const nextNonce = keyNonce.nonce++;
    keyNonce.lastUsed = Date.now();
    this.nonces.set(publicKey, keyNonce);

    this.logger.debug('Nonce allocated', { publicKey, nonce: nextNonce });
    return nextNonce;
  }

  public async refreshNonce(publicKey: string): Promise<void> {
    try {
      await this.initializeNonceForKey(publicKey);
      this.logger.debug('Nonce refreshed for key', { publicKey });
    } catch (error) {
      this.logger.error('Failed to refresh nonce:', { publicKey, error });
      throw error;
    }
  }

  public getMetrics() {
    const now = Date.now();
    const nonceEntries = Array.from(this.nonces.entries());

    return {
      totalKeys: nonceEntries.length,
      nonces: nonceEntries.map(([publicKey, nonce]) => ({
        publicKey: publicKey.substring(0, 16) + '...',
        nonce: nonce.nonce,
        lastUsed: now - nonce.lastUsed,
        lastUpdated: now - nonce.lastUpdated,
      })),
    };
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Nonce manager shutdown');
  }
}
