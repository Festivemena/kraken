import { config } from 'dotenv';
import * as process from 'process';

config();

export interface AppConfig {
  // Server configuration
  port: number;
  nodeEnv: string;
  
  // NEAR configuration
  networkId: string;
  nodeUrl: string;
  walletUrl: string;
  helperUrl: string;
  explorerUrl: string;
  
  // Account configuration
  masterAccountId: string;
  masterPrivateKey: string;
  contractId: string;
  
  // Performance configuration
  batchSize: number;
  batchIntervalMs: number;
  maxParallelTransactions: number;
  keyRotationCount: number;
  
  // Redis configuration
  redisUrl?: string;
  redisEnabled: boolean;
  
  // Rate limiting
  rateLimitPoints: number;
  rateLimitDuration: number;
  
  // Security
  corsOrigin: string;
}

export const getConfig = (): AppConfig => {
  return {
    // Server configuration
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // NEAR configuration
    networkId: process.env.NETWORK_ID || 'testnet',
    nodeUrl: process.env.NODE_URL || 'https://rpc.testnet.near.org',
    walletUrl: process.env.WALLET_URL || 'https://wallet.testnet.near.org',
    helperUrl: process.env.HELPER_URL || 'https://helper.testnet.near.org',
    explorerUrl: process.env.EXPLORER_URL || 'https://explorer.testnet.near.org',
    
    // Account configuration
    masterAccountId: process.env.MASTER_ACCOUNT_ID || '',
    masterPrivateKey: process.env.MASTER_PRIVATE_KEY || '',
    contractId: process.env.CONTRACT_ID || '',
    
    // Performance configuration
    batchSize: parseInt(process.env.BATCH_SIZE || '10'),
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || '1000'),
    maxParallelTransactions: parseInt(process.env.MAX_PARALLEL_TX || '5'),
    keyRotationCount: parseInt(process.env.KEY_ROTATION_COUNT || '10'),
    
    // Redis configuration
    redisUrl: process.env.REDIS_URL,
    redisEnabled: process.env.REDIS_ENABLED === 'true',
    
    // Rate limiting
    rateLimitPoints: parseInt(process.env.RATE_LIMIT_POINTS || '100'),
    rateLimitDuration: parseInt(process.env.RATE_LIMIT_DURATION || '1'),
    
    // Security
    corsOrigin: process.env.CORS_ORIGIN || '*'
  };
};

export const validateConfig = (config: AppConfig): string[] => {
  const errors: string[] = [];
  
  if (!config.masterAccountId) {
    errors.push('MASTER_ACCOUNT_ID is required');
  }
  
  if (!config.masterPrivateKey) {
    errors.push('MASTER_PRIVATE_KEY is required');
  }
  
  if (!config.contractId) {
    errors.push('CONTRACT_ID is required');
  }
  
  if (config.masterPrivateKey && !config.masterPrivateKey.startsWith('ed25519:')) {
    errors.push('MASTER_PRIVATE_KEY must start with ed25519:');
  }
  
  return errors;
};