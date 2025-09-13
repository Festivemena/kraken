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
  maxConcurrentBatches: number;
  
  // Queue configuration
  queueConcurrency: number;
  queueMaxRetries: number;
  
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
    
    // Performance configuration (optimized for 100+ TPS)
    batchSize: parseInt(process.env.BATCH_SIZE || '75'),
    batchIntervalMs: parseInt(process.env.BATCH_INTERVAL_MS || '300'),
    maxParallelTransactions: parseInt(process.env.MAX_PARALLEL_TX || '30'),
    maxConcurrentBatches: parseInt(process.env.MAX_CONCURRENT_BATCHES || '15'),
    
    // Queue configuration
    queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '150'),
    queueMaxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3'),
    
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
    errors.push('MASTER_ACCOUNT_ID is required - this is the account that will send FT transfers');
  }
  
  if (!config.masterPrivateKey) {
    errors.push('MASTER_PRIVATE_KEY is required - needed to sign transactions');
  }
  
  if (!config.contractId) {
    errors.push('CONTRACT_ID is required - this is the FT contract address');
  }
  
  if (config.masterPrivateKey && !config.masterPrivateKey.startsWith('ed25519:')) {
    errors.push('MASTER_PRIVATE_KEY must start with "ed25519:" - check your key format');
  }
  
  if (!config.nodeUrl) {
    errors.push('NODE_URL is required - NEAR RPC endpoint');
  }
  
  // Validate network-specific URLs
  if (config.networkId === 'mainnet' && config.nodeUrl.includes('testnet')) {
    errors.push('Network mismatch: using mainnet but NODE_URL points to testnet');
  }
  
  if (config.networkId === 'testnet' && config.nodeUrl.includes('mainnet')) {
    errors.push('Network mismatch: using testnet but NODE_URL points to mainnet');
  }
  
  // Validate performance settings for high TPS
  if (config.batchSize < 10) {
    errors.push('BATCH_SIZE should be at least 10 for reasonable performance (recommended: 50-100)');
  }
  
  if (config.batchSize > 200) {
    errors.push('BATCH_SIZE should not exceed 200 to avoid RPC limits');
  }
  
  if (config.maxParallelTransactions < 5) {
    errors.push('MAX_PARALLEL_TX should be at least 5 for high performance (recommended: 20-50)');
  }
  
  if (config.batchIntervalMs < 100) {
    errors.push('BATCH_INTERVAL_MS should be at least 100ms to avoid overwhelming the network');
  }
  
  if (config.queueConcurrency < 50) {
    errors.push('QUEUE_CONCURRENCY should be at least 50 for 100+ TPS (recommended: 100-200)');
  }
  
  // Validate gas settings
  const gasLimit = parseInt(config.functionCallGas);
  if (gasLimit < 10000000000000) { // 10 TGas
    errors.push('FUNCTION_CALL_GAS seems too low for FT transfers (minimum: 10 TGas)');
  }
  
  if (gasLimit > 100000000000000) { // 100 TGas
    errors.push('FUNCTION_CALL_GAS seems excessive (maximum recommended: 50 TGas)');
  }
  
  return errors;
};

// Network configurations for easy setup
export const getNetworkConfig = (networkId: string) => {
  const configs = {
    mainnet: {
      nodeUrl: 'https://rpc.mainnet.near.org',
      walletUrl: 'https://wallet.near.org',
      helperUrl: 'https://helper.mainnet.near.org',
      explorerUrl: 'https://explorer.near.org'
    },
    testnet: {
      nodeUrl: 'https://rpc.testnet.near.org',
      walletUrl: 'https://wallet.testnet.near.org',
      helperUrl: 'https://helper.testnet.near.org',
      explorerUrl: 'https://explorer.testnet.near.org'
    }
  };
  
  return configs[networkId as keyof typeof configs] || configs.testnet;
};

// Performance presets for different TPS targets
export const getPerformancePreset = (targetTPS: number) => {
  if (targetTPS >= 200) {
    return {
      batchSize: 150,
      batchIntervalMs: 200,
      maxParallelTransactions: 50,
      queueConcurrency: 300,
      maxConcurrentBatches: 25
    };
  } else if (targetTPS >= 100) {
    return {
      batchSize: 100,
      batchIntervalMs: 300,
      maxParallelTransactions: 30,
      queueConcurrency: 200,
      maxConcurrentBatches: 15
    };
  } else if (targetTPS >= 50) {
    return {
      batchSize: 50,
      batchIntervalMs: 500,
      maxParallelTransactions: 20,
      queueConcurrency: 100,
      maxConcurrentBatches: 10
    };
  } else {
    return {
      batchSize: 25,
      batchIntervalMs: 1000,
      maxParallelTransactions: 10,
      queueConcurrency: 50,
      maxConcurrentBatches: 5
    };
  }
};