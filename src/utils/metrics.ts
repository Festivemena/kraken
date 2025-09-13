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
  startTime: number;
  lastResetTime: number;
}

interface TPSMetrics {
  currentTPS: number;
  avgTPS: number;
  maxTPS: number;
  measurements: Array<{
    timestamp: number;
    tps: number;
    successful: number;
    failed: number;
  }>;
}

interface PerformanceWindow {
  windowStart: number;
  windowEnd: number;
  transfers: number;
  successful: number;
  failed: number;
}

export class MetricsService {
  private static instance: MetricsService;
  private metrics: Metrics;
  private tpsMetrics: TPSMetrics;
  private collectionInterval: NodeJS.Timeout | null = null;
  private performanceWindows: PerformanceWindow[] = [];
  private readonly maxWindows = 60; // Keep 60 seconds of data
  private readonly windowSizeMs = 1000; // 1 second windows

  private constructor() {
    const now = Date.now();

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
      batchErrors: 0,
      startTime: now,
      lastResetTime: now,
    };

    this.tpsMetrics = {
      currentTPS: 0,
      avgTPS: 0,
      maxTPS: 0,
      measurements: [],
    };

    this.initializePerformanceWindows();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  private initializePerformanceWindows(): void {
    const now = Date.now();
    this.performanceWindows = [];
    for (let i = 0; i < this.maxWindows; i++) {
      this.performanceWindows.push({
        windowStart: now - (this.maxWindows - i) * this.windowSizeMs,
        windowEnd: now - (this.maxWindows - i - 1) * this.windowSizeMs,
        transfers: 0,
        successful: 0,
        failed: 0,
      });
    }
  }

  public incrementTransferQueued(): void {
    this.metrics.totalTransfers++;
    this.updateCurrentWindow(1, 0, 0);
  }

  public recordTransferSuccess(processingTime: number): void {
    this.metrics.successfulTransfers++;
    this.updateProcessingTimeMetrics(processingTime);
    this.updateCurrentWindow(0, 1, 0);
  }

  public recordTransferFailure(processingTime: number): void {
    this.metrics.failedTransfers++;
    this.updateProcessingTimeMetrics(processingTime);
    this.updateCurrentWindow(0, 0, 1);
  }

  public recordBatchProcessing(
    batchSize: number,
    successful: number,
    failed: number,
    processingTime: number
  ): void {
    this.metrics.totalBatches++;

    if (failed === 0) {
      this.metrics.successfulBatches++;
    } else {
      this.metrics.failedBatches++;
    }

    this.metrics.lastBatchTime = processingTime;

    // Calculate TPS for this batch
    const batchTPS = successful / (processingTime / 1000);
    this.updateTPSMetrics(batchTPS, successful, failed);
  }

  public incrementBatchErrors(): void {
    this.metrics.batchErrors++;
  }

  public setQueueSize(size: number): void {
    this.metrics.queueSize = size;
  }

  private updateProcessingTimeMetrics(processingTime: number): void {
    this.metrics.totalProcessingTime += processingTime;

    const completedTransfers =
      this.metrics.successfulTransfers + this.metrics.failedTransfers;
    this.metrics.averageProcessingTime =
      this.metrics.totalProcessingTime / completedTransfers;

    this.metrics.maxProcessingTime = Math.max(
      this.metrics.maxProcessingTime,
      processingTime
    );
    this.metrics.minProcessingTime = Math.min(
      this.metrics.minProcessingTime,
      processingTime
    );
  }

  private updateCurrentWindow(
    queued: number,
    successful: number,
    failed: number
  ): void {
    const now = Date.now();

    // Clean old windows
    while (
      this.performanceWindows.length > 0 &&
      this.performanceWindows[0].windowEnd <
        now - this.maxWindows * this.windowSizeMs
    ) {
      this.performanceWindows.shift();
    }

    // Find or create current window
    let currentWindow = this.performanceWindows.find(
      (w) => now >= w.windowStart && now < w.windowEnd
    );

    if (!currentWindow) {
      const windowStart =
        Math.floor(now / this.windowSizeMs) * this.windowSizeMs;
      currentWindow = {
        windowStart,
        windowEnd: windowStart + this.windowSizeMs,
        transfers: 0,
        successful: 0,
        failed: 0,
      };
      this.performanceWindows.push(currentWindow);
    }

    currentWindow.transfers += queued;
    currentWindow.successful += successful;
    currentWindow.failed += failed;
  }

  private updateTPSMetrics(
    batchTPS: number,
    successful: number,
    failed: number
  ): void {
    const now = Date.now();

    this.tpsMetrics.currentTPS = batchTPS;
    this.tpsMetrics.maxTPS = Math.max(this.tpsMetrics.maxTPS, batchTPS);

    this.tpsMetrics.measurements.push({
      timestamp: now,
      tps: batchTPS,
      successful,
      failed,
    });

    // Keep only recent measurements (last 10 minutes)
    const tenMinutesAgo = now - 10 * 60 * 1000;
    this.tpsMetrics.measurements = this.tpsMetrics.measurements.filter(
      (m) => m.timestamp > tenMinutesAgo
    );

    // Calculate average TPS
    if (this.tpsMetrics.measurements.length > 0) {
      const totalTPS = this.tpsMetrics.measurements.reduce(
        (sum, m) => sum + m.tps,
        0
      );
      this.tpsMetrics.avgTPS =
        totalTPS / this.tpsMetrics.measurements.length;
    }
  }

  public getCurrentTPS(): number {
    const now = Date.now();
    const recentWindows = this.performanceWindows.filter(
      (w) => w.windowEnd > now - 5000
    );

    if (recentWindows.length === 0) return 0;

    const totalSuccessful = recentWindows.reduce(
      (sum, w) => sum + w.successful,
      0
    );
    return totalSuccessful / recentWindows.length;
  }

  public getTPSHistory(
    durationMinutes: number = 10
  ): Array<{ timestamp: number; tps: number }> {
    const cutoff = Date.now() - durationMinutes * 60 * 1000;
    return this.tpsMetrics.measurements
      .filter((m) => m.timestamp > cutoff)
      .map((m) => ({ timestamp: m.timestamp, tps: m.tps }));
  }

  public getMetrics(): Metrics & {
    currentTPS: number;
    avgTPS: number;
    maxTPS: number;
    uptimeSeconds: number;
    bountyCompliance: {
      target: number;
      achieved: boolean;
      performance: string;
    };
  } {
    const currentTPS = this.getCurrentTPS();
    const uptimeSeconds = (Date.now() - this.metrics.startTime) / 1000;

    return {
      ...this.metrics,
      currentTPS,
      avgTPS: this.tpsMetrics.avgTPS,
      maxTPS: this.tpsMetrics.maxTPS,
      uptimeSeconds,
      bountyCompliance: {
        target: 100,
        achieved: currentTPS >= 100,
        performance:
          currentTPS >= 150
            ? "EXCELLENT"
            : currentTPS >= 100
            ? "MEETS_REQUIREMENT"
            : currentTPS >= 50
            ? "APPROACHING_TARGET"
            : "BELOW_TARGET",
      },
    };
  }

  public getDetailedPerformanceStats() {
    const now = Date.now();
    const metrics = this.getMetrics();

    const windows = [
      { name: "1min", duration: 60 * 1000 },
      { name: "5min", duration: 5 * 60 * 1000 },
      { name: "10min", duration: 10 * 60 * 1000 },
    ];

    const performanceByWindow = windows.map((window) => {
      const windowMeasurements = this.tpsMetrics.measurements.filter(
        (m) => m.timestamp > now - window.duration
      );

      if (windowMeasurements.length === 0) {
        return {
          window: window.name,
          avgTPS: 0,
          maxTPS: 0,
          totalSuccessful: 0,
          totalFailed: 0,
          successRate: 0,
        };
      }

      const totalSuccessful = windowMeasurements.reduce(
        (sum, m) => sum + m.successful,
        0
      );
      const totalFailed = windowMeasurements.reduce(
        (sum, m) => sum + m.failed,
        0
      );
      const avgTPS =
        windowMeasurements.reduce((sum, m) => sum + m.tps, 0) /
        windowMeasurements.length;
      const maxTPS = Math.max(...windowMeasurements.map((m) => m.tps));
      const successRate =
        (totalSuccessful / (totalSuccessful + totalFailed)) * 100;

      return {
        window: window.name,
        avgTPS: parseFloat(avgTPS.toFixed(2)),
        maxTPS: parseFloat(maxTPS.toFixed(2)),
        totalSuccessful,
        totalFailed,
        successRate: parseFloat(successRate.toFixed(2)),
      };
    });

    return {
      current: metrics,
      performanceWindows: performanceByWindow,
      realtimeTPS: this.getCurrentTPS(),
      bountyStatus: {
        requirementMet: metrics.currentTPS >= 100,
        sustainedPerformance: this.checkSustainedPerformance(100, 10),
        peakPerformance: metrics.maxTPS,
      },
    };
  }

  private checkSustainedPerformance(
    targetTPS: number,
    durationMinutes: number
  ): boolean {
    const cutoff = Date.now() - durationMinutes * 60 * 1000;
    const relevantMeasurements = this.tpsMetrics.measurements.filter(
      (m) => m.timestamp > cutoff
    );

    if (relevantMeasurements.length < durationMinutes * 6) {
      return false;
    }

    const meetingTarget = relevantMeasurements.filter(
      (m) => m.tps >= targetTPS
    ).length;
    return meetingTarget / relevantMeasurements.length >= 0.8;
  }

  public reset(): void {
    const now = Date.now();

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
      batchErrors: 0,
      startTime: this.metrics.startTime,
      lastResetTime: now,
    };

    this.tpsMetrics.measurements = [];
    this.tpsMetrics.currentTPS = 0;
    this.tpsMetrics.avgTPS = 0;
    // keep maxTPS as historical record

    this.initializePerformanceWindows();
  }

  public startCollection(): void {
    if (this.collectionInterval) return;

    this.collectionInterval = setInterval(() => {
      const stats = this.getDetailedPerformanceStats();
      console.log(
        `[METRICS] TPS: ${stats.realtimeTPS.toFixed(2)} | ` +
          `Total: ${stats.current.totalTransfers} | ` +
          `Success Rate: ${(
            (stats.current.successfulTransfers /
              Math.max(1, stats.current.totalTransfers)) *
            100
          ).toFixed(1)}% | ` +
          `Queue: ${stats.current.queueSize} | ` +
          `Bounty: ${stats.bountyStatus.requirementMet ? "✅" : "❌"}`
      );
    }, 30000);
  }

  public stopCollection(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  public exportMetrics() {
    return {
      metrics: this.getMetrics(),
      tpsHistory: this.getTPSHistory(10),
      performanceWindows: this.performanceWindows.slice(-10),
      bountyCompliance: {
        target: 100,
        current: this.getCurrentTPS(),
        sustained: this.checkSustainedPerformance(100, 10),
        peak: this.tpsMetrics.maxTPS,
      },
    };
  }
}
