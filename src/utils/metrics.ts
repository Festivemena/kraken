interface Metrics {
  totalTransfers: number;
  successfulTransfers: number;
  failedTransfers: number;
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  maxProcessingTime: number;
  minProcessingTime: number;
  lastBatchTime: number;
  queueSize: number;
  batchErrors: number;
}

export class MetricsService {
  private static instance: MetricsService;
  private metrics: Metrics;
  private collectionInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.metrics = {
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      maxProcessingTime: 0,
      minProcessingTime: Infinity,
      lastBatchTime: 0,
      queueSize: 0,
      batchErrors: 0
    };
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  public incrementTransferQueued(): void {
    this.metrics.totalTransfers++;
  }

  public recordTransferSuccess(processingTime: number): void {
    this.metrics.successfulTransfers++;
    this.updateProcessingTimeMetrics(processingTime);
  }

  public recordTransferFailure(processingTime: number): void {
    this.metrics.failedTransfers++;
    this.updateProcessingTimeMetrics(processingTime);
  }

  public recordBatchProcessing(
    batchSize: number,
    successful: number,
    failed: number,
    processingTime: number
  ): void {
    this.metrics.totalBatches++;
    this.metrics.successfulBatches += successful === batchSize ? 1 : 0;
    this.metrics.failedBatches += failed > 0 ? 1 : 0;
    this.metrics.lastBatchTime = processingTime;
  }

  public incrementBatchErrors(): void {
    this.metrics.batchErrors++;
  }

  public setQueueSize(size: number): void {
    this.metrics.queueSize = size;
  }

  private updateProcessingTimeMetrics(processingTime: number): void {
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / 
      (this.metrics.successfulTransfers + this.metrics.failedTransfers);
    this.metrics.maxProcessingTime = Math.max(this.metrics.maxProcessingTime, processingTime);
    this.metrics.minProcessingTime = Math.min(this.metrics.minProcessingTime, processingTime);
  }

  public getMetrics(): Metrics {
    return { ...this.metrics };
  }

  public reset(): void {
    this.metrics = {
      totalTransfers: 0,
      successfulTransfers: 0,
      failedTransfers: 0,
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      maxProcessingTime: 0,
      minProcessingTime: Infinity,
      lastBatchTime: 0,
      queueSize: 0,
      batchErrors: 0
    };
  }

  public startCollection(): void {
    if (this.collectionInterval) {
      return;
    }

    this.collectionInterval = setInterval(() => {
      // Here you could push metrics to external systems
      // like Prometheus, Datadog, etc.
    }, 30000); // Every 30 seconds
  }

  public stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }
}