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
  maxConcurrentBatches: number;
  
  // Queue configuration
  queueConcurrency: number;
  queueMaxRetries: number;
  
  // Connection pool configuration
  rpcPoolSize: number;
  rpcTimeout: number;
  
  // Redis configuration
  redisUrl?: string;
  redisEnabled: boolean;
  redisMaxRetries: number;
  redisRetryDelayOnFailover: number;
  
  // Rate limiting
  rateLimitPoints: number;
  rateLimitDuration: number;
  
  // Security
  corsOrigin: string;
  
  // Monitoring
  metricsEnabled: boolean;
  healthCheckInterval: number;
  
  // Gas configuration
  functionCallGas: string;
  attachedDeposit: string;
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
    batchSize: parseInt(process.env.BATCH_SIZE || '50'),
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || '500'),
    maxParallelTransactions: parseInt(process.env.MAX_PARALLEL_TX || '20'),
    keyRotationCount: parseInt(process.env.KEY_ROTATION_COUNT || '50'),
    maxConcurrentBatches: parseInt(process.env.MAX_CONCURRENT_BATCHES || '10'),
    
    // Queue configuration
    queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '100'),
    queueMaxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
    
    // Connection pool configuration
    rpcPoolSize: parseInt(process.env.RPC_POOL_SIZE || '10'),
    rpcTimeout: parseInt(process.env.RPC_TIMEOUT || '30000'),
    
    // Redis configuration
    redisUrl: process.env.REDIS_URL,
    redisEnabled: process.env.REDIS_ENABLED === 'true',
    redisMaxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
    redisRetryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100'),
    
    // Rate limiting
    rateLimitPoints: parseInt(process.env.RATE_LIMIT_POINTS || '1000'),
    rateLimitDuration: parseInt(process.env.RATE_LIMIT_DURATION || '1'),
    
    // Security
    corsOrigin: process.env.CORS_ORIGIN || '*',
    
    // Monitoring
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
    
    // Gas configuration
    functionCallGas: process.env.FUNCTION_CALL_GAS || '30000000000000', // 30 TGas
    attachedDeposit: process.env.ATTACHED_DEPOSIT || '1' // 1 yoctoNEAR
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
  
  if (!config.nodeUrl) {
    errors.push('NODE_URL is required');
  }
  
  // Validate performance settings for high TPS
  if (config.batchSize < 10) {
    errors.push('BATCH_SIZE should be at least 10 for high performance');
  }
  
  if (config.keyRotationCount < 10) {
    errors.push('KEY_ROTATION_COUNT should be at least 10 for high TPS');
  }
  
  if (config.maxParallelTransactions < 5) {
    errors.push('MAX_PARALLEL_TX should be at least 5 for high performance');
  }
  
  return errors;
};