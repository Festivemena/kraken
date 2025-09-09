import { KeyPair } from 'near-api-js';
import { Logger } from '../utils/logger';

interface KeyManagerConfig {
  keyRotationCount: number;
  masterAccountId: string;
  masterPrivateKey: string;
}

export class KeyManager {
  private logger = new Logger('KeyManager');
  private keyPairs: KeyPair[] = [];
  private config: KeyManagerConfig;

  constructor(config: KeyManagerConfig) {
    this.config = config;
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing key manager');
    
    try {
      // Add the master key
      const masterKeyPair = KeyPair.fromString(this.config.masterPrivateKey);
      this.keyPairs.push(masterKeyPair);
      
      // Generate additional keys for rotation
      for (let i = 1; i < this.config.keyRotationCount; i++) {
        const keyPair = KeyPair.fromRandom('ed25519');
        this.keyPairs.push(keyPair);
      }
      
      this.logger.info('Key manager initialized successfully', {
        totalKeys: this.keyPairs.length,
        rotationCount: this.config.keyRotationCount
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize key manager:', error);
      throw error;
    }
  }

  public getKeyPair(index: number): KeyPair {
    if (index < 0 || index >= this.keyPairs.length) {
      throw new Error(`Invalid key index: ${index}`);
    }
    return this.keyPairs[index];
  }

  public getPublicKeys(): string[] {
    return this.keyPairs.map(keyPair => keyPair.getPublicKey().toString());
  }

  public getKeyCount(): number {
    return this.keyPairs.length;
  }

  public getMetrics() {
    return {
      totalKeys: this.keyPairs.length,
      publicKeys: this.keyPairs.map((kp, index) => ({
        index,
        publicKey: kp.getPublicKey().toString().substring(0, 16) + '...'
      }))
    };
  }

  public async rotateKeys(): Promise<void> {
    this.logger.info('Rotating keys');
    
    // Generate new keys (in a real implementation, you'd also add them to the account)
    const newKeyPairs: KeyPair[] = [];
    
    for (let i = 0; i < this.config.keyRotationCount; i++) {
      const keyPair = KeyPair.fromRandom('ed25519');
      newKeyPairs.push(keyPair);
    }
    
    this.keyPairs = newKeyPairs;
    this.logger.info('Keys rotated successfully');
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Key manager shutdown');
  }
}