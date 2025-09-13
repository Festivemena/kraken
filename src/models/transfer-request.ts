export interface TransferRequest {
  receiverId: string;
  amount: string;
  memo?: string;
}

export interface TransferResult {
  success: boolean;
  transactionId?: string;
  queueId?: string;
  error?: string;
  processingTime?: number;
  timestamp?: number;
}

export interface BatchMetrics {
  batchSize: number;
  successful: number;
  failed: number;
  processingTime: number;
  timestamp: number;
  tps?: number;
}

export interface QueuedTransfer {
  id: string;
  request: TransferRequest;
  timestamp: number;
  priority: number;
  retryCount: number;
  maxRetries: number;
}

export interface TransferValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface BulkTransferRequest {
  transfers: TransferRequest[];
  priority?: number;
  batchId?: string;
}

export interface BulkTransferResult {
  success: boolean;
  batchId: string;
  totalRequests: number;
  queuedRequests: number;
  rejectedRequests: number;
  results: Array<{
    request: TransferRequest;
    queueId?: string;
    error?: string;
  }>;
}