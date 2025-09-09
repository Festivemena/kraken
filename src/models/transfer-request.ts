export interface TransferRequest {
  receiverId: string;
  amount: string;
  memo?: string;
}

export interface TransferResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  processingTime?: number;
}

export interface BatchMetrics {
  batchSize: number;
  successful: number;
  failed: number;
  processingTime: number;
  timestamp: number;
}