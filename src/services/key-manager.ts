import { KeyPair } from '@near-js/api';
import { Logger } from '../utils/logger';
import { NearClientService } from './near-client';
import { AppConfig } from '../app/config';

interface ManagedKey {
  accountId: string;
  keyPair: KeyPair;
  publicKey: string;
  isActive: boolean;
  usageCount: number;
  lastUsed: number;
  errors: number;
}

export class KeyManager {
  private logger = new Logger('KeyManager');
  private keys: Map<number, ManagedKey> = new Map();
  private keysByAccount: Map<string, number[]> = new Map();
  private config: AppConfig;
  private nearClient: NearClientService;
  private currentKeyIndex = 0;

  constructor(config: AppConfig, nearClient: NearClientService) {
    this.config = config;
    this.nearClient = nearClient;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing enhanced key manager');
    
    try {
      // Add the master key
      const masterKeyPair = KeyPair.fromString(this.config.masterPrivateKey);
      await this.addKey(this.config.masterAccountId, masterKeyPair, 0);
      
      // Generate additional keys for high-performance operation
      await this.generateAdditionalKeys();
      
      this.logger.info('Enhanced key manager initialized successfully', {
        totalKeys: this.keys.size,
        accounts: this.keysByAccount.size,
        rotationCount: this.config.keyRotationCount
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize key manager:', error);
      throw error;
    }
  }

  private async generateAdditionalKeys(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    // Generate keys for the master account
    for (let i = 1; i < this.config.keyRotationCount; i++) {
      promises.push(this.createAndAddKey(this.config.masterAccountId, i));
    }
    
    // Wait for all keys to be generated
    await Promise.allSettled(promises);
  }

  private async createAndAddKey(accountId: string, index: number): Promise<void> {
    try {
      const keyPair = KeyPair.fromRandom('ed25519');
      await this.addKey(accountId, keyPair, index);
      
      // Add to NEAR keystore for transactions
      await this.nearClient.addKeyToKeyStore(accountId, keyPair);
      
    } catch (error) {
      this.logger.error(`Failed to create key ${index} for ${accountId}:`, error);
      // Don't throw - we can work with fewer keys
    }
  }

  private async addKey(accountId: string, keyPair: KeyPair, index: number): Promise<void> {
    const publicKey = keyPair.getPublicKey().toString();
    
    const managedKey: ManagedKey = {
      accountId,
      keyPair,
      publicKey,
      isActive: true,
      usageCount: 0,
      lastUsed: Date.now(),
      errors: 0
    };

    this.keys.set(index, managedKey);
    
    // Update account-to-keys mapping
    const accountKeys = this.keysByAccount.get(accountId) || [];
    accountKeys.push(index);
    this.keysByAccount.set(accountId, accountKeys);

    this.logger.debug('Key added', { 
      accountId, 
      index,
      publicKey: publicKey.substring(0, 16) + '...'
    });
  }

  public getKeyPair(index?: number): { accountId: string; keyPair: KeyPair; keyIndex: number } {
    let keyIndex: number;
    
    if (index !== undefined) {
      keyIndex = index;
    } else {
      // Round-robin key selection for load balancing
      keyIndex = this.getNextAvailableKeyIndex();
    }

    const managedKey = this.keys.get(keyIndex);
    if (!managedKey || !managedKey.isActive) {
      throw new Error(`No active key found at index: ${keyIndex}`);
    }

    // Update usage statistics
    managedKey.usageCount++;
    managedKey.lastUsed = Date.now();
    this.keys.set(keyIndex, managedKey);

    return {
      accountId: managedKey.accountId,
      keyPair: managedKey.keyPair,
      keyIndex
    };
  }

  private getNextAvailableKeyIndex(): number {
    const maxAttempts = this.keys.size;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const keyIndex = this.currentKeyIndex;
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.size;
      
      const managedKey = this.keys.get(keyIndex);
      if (managedKey && managedKey.isActive && managedKey.errors < 5) {
        return keyIndex;
      }
      
      attempts++;
    }
    
    // If no healthy key found, return the first available key
    for (const [index, key] of this.keys.entries()) {
      if (key.isActive) {
        this.logger.warn('Using potentially unhealthy key', { index, errors: key.errors });
        return index;
      }
    }
    
    throw new Error('No active keys available');
  }

  public getPublicKeys(): string[] {
    return Array.from(this.keys.values())
      .filter(key => key.isActive)
      .map(key => key.publicKey);
  }

  public getKeyPairsWithAccounts(): { accountId: string; keyPair: KeyPair }[] {
    return Array.from(this.keys.values())
      .filter(key => key.isActive)
      .map(key => ({ accountId: key.accountId, keyPair: key.keyPair }));
  }

  public getKeyCount(): number {
    return Array.from(this.keys.values()).filter(key => key.isActive).length;
  }

  public markKeyError(keyIndex: number): void {
    const managedKey = this.keys.get(keyIndex);
    if (managedKey) {
      managedKey.errors++;
      
      // Deactivate key if too many errors
      if (managedKey.errors > 10) {
        managedKey.isActive = false;
        this.logger.warn('Key deactivated due to errors', { 
          keyIndex, 
          errors: managedKey.errors,
          publicKey: managedKey.publicKey.substring(0, 16) + '...'
        });
      }
      
      this.keys.set(keyIndex, managedKey);
    }
  }

  public markKeySuccess(keyIndex: number): void {
    const managedKey = this.keys.get(keyIndex);
    if (managedKey) {
      // Reset error count on successful transaction
      managedKey.errors = Math.max(0, managedKey.errors - 1);
      this.keys.set(keyIndex, managedKey);
    }
  }

  public getMetrics() {
    const now = Date.now();
    const keyEntries = Array.from(this.keys.entries());
    
    return {
      totalKeys: keyEntries.length,
      activeKeys: keyEntries.filter(([_, key]) => key.isActive).length,
      inactiveKeys: keyEntries.filter(([_, key]) => !key.isActive).length,
      errorKeys: keyEntries.filter(([_, key]) => key.errors > 0).length,
      accounts: this.keysByAccount.size,
      currentKeyIndex: this.currentKeyIndex,
      keys: keyEntries.map(([index, key]) => ({
        index,
        accountId: key.accountId,
        publicKey: key.publicKey.substring(0, 16) + '...',
        isActive: key.isActive,
        usageCount: key.usageCount,
        lastUsed: now - key.lastUsed,
        errors: key.errors
      }))
    };
  }

  public async rotateKeys(): Promise<void> {
    this.logger.info('Starting key rotation');
    
    try {
      // Generate new keys to replace inactive ones
      const inactiveKeys = Array.from(this.keys.entries())
        .filter(([_, key]) => !key.isActive);
      
      const rotationPromises = inactiveKeys.map(async ([index, key]) => {
        try {
          await this.createAndAddKey(key.accountId, index);
          this.logger.debug('Key rotated', { index, accountId: key.accountId });
        } catch (error) {
          this.logger.error(`Failed to rotate key ${index}:`, error);
        }
      });
      
      await Promise.allSettled(rotationPromises);
      
      this.logger.info('Key rotation completed', {
        rotatedKeys: inactiveKeys.length,
        totalActiveKeys: this.getKeyCount()
      });
      
    } catch (error) {
      this.logger.error('Key rotation failed:', error);
      throw error;
    }
  }

  public async addAccountKeys(accountId: string, keyCount: number = 10): Promise<void> {
    this.logger.info(`Adding ${keyCount} keys for account ${accountId}`);
    
    const promises: Promise<void>[] = [];
    const startIndex = this.keys.size;
    
    for (let i = 0; i < keyCount; i++) {
      promises.push(this.createAndAddKey(accountId, startIndex + i));
    }
    
    await Promise.allSettled(promises);
    
    this.logger.info(`Added keys for ${accountId}`, {
      requestedKeys: keyCount,
      actualKeys: this.getKeyCount() - startIndex
    });
  }

  public getHealthyKeyIndices(): number[] {
    return Array.from(this.keys.entries())
      .filter(([_, key]) => key.isActive && key.errors < 3)
      .map(([index]) => index);
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Key manager shutdown');
    // Clear sensitive data
    this.keys.clear();
    this.keysByAccount.clear();
  }