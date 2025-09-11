import axios, { AxiosResponse } from 'axios';
import { Logger } from '../utils/logger';
import { delay } from '../utils/helpers';

interface BenchmarkResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTime: number;
  actualTps: number;
  successRate: number;
  minResponseTime: number;
  maxResponseTime: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  network: string;
  targetTps: number;
  durationMinutes: number;
  throughputOverTime: Array<{ timestamp: number; tps: number; success: number; errors: number }>;
  errorsByType: Map<string, number>;
}

interface RequestMetrics {
  startTime: number;
  endTime?: number;
  success?: boolean;
  error?: string;
  httpStatus?: number;
}

interface ThroughputMeasurement {
  timestamp: number;
  completedRequests: number;
  successfulRequests: number;
  errorCount: number;
}

export class FTTransferBenchmark {
  private logger = new Logger('ProductionBenchmark');
  private results: BenchmarkResult;
  private requestMetrics: RequestMetrics[] = [];
  private throughputMeasurements: ThroughputMeasurement[] = [];
  private isRunning = false;
  private startTime = 0;
  private errorsByType = new Map<string, number>();

  constructor(
    private apiUrl: string,
    private targetTps: number,
    private durationMinutes: number,
    private network: string
  ) {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTime: 0,
      actualTps: 0,
      successRate: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      network: this.network,
      targetTps: this.targetTps,
      durationMinutes: this.durationMinutes,
      throughputOverTime: [],
      errorsByType: new Map()
    };
  }

  public async run(): Promise<BenchmarkResult> {
    if (this.isRunning) {
      throw new Error('Benchmark is already running');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    const totalRequests = this.targetTps * 60 * this.durationMinutes;

    this.logger.info('Starting production-ready benchmark', {
      targetTps: this.targetTps,
      durationMinutes: this.durationMinutes,
      totalRequests,
      network: this.network,
      apiUrl: this.apiUrl
    });

    // Test server connectivity first
    await this.testConnectivity();

    // Start throughput monitoring
    const throughputInterval = setInterval(() => {
      this.measureThroughput();
    }, 5000); // Every 5 seconds

    // Start request generation
    const requestPromises: Promise<void>[] = [];
    let requestsSent = 0;

    // Generate requests at target TPS
    const intervalMs = 1000; // 1 second intervals
    const requestsPerInterval = this.targetTps;

    const requestInterval = setInterval(() => {
      if (requestsSent >= totalRequests) {
        clearInterval(requestInterval);
        return;
      }

      // Send burst of requests
      for (let i = 0; i < requestsPerInterval && requestsSent < totalRequests; i++) {
        const requestId = requestsSent++;
        requestPromises.push(this.sendSingleRequest(requestId));
      }
    }, intervalMs);

    // Progress monitoring
    const progressInterval = setInterval(() => {
      this.logProgress();
    }, 10000); // Every 10 seconds

    // Stop after duration
    setTimeout(() => {
      clearInterval(requestInterval);
      clearInterval(progressInterval);
      clearInterval(throughputInterval);
      this.logger.info('Benchmark duration completed, waiting for remaining requests...');
    }, this.durationMinutes * 60 * 1000);

    // Wait for all requests to complete (with timeout)
    const completionTimeout = setTimeout(() => {
      this.logger.warn('Benchmark completion timeout reached');
    }, (this.durationMinutes * 60 + 60) * 1000); // Extra minute for completion

    await Promise.allSettled(requestPromises);
    clearTimeout(completionTimeout);

    // Final calculations
    this.completeBenchmark();

    return this.results;
  }

  private async testConnectivity(): Promise<void> {
    try {
      this.logger.info('Testing server connectivity...');
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      
      if (response.status !== 200) {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
      
      this.logger.info('Server connectivity test passed');
    } catch (error) {
      this.logger.error('Server connectivity test failed:', error);
      throw new Error(`Cannot connect to server at ${this.apiUrl}`);
    }
  }

  private async sendSingleRequest(requestId: number): Promise<void> {
    const receiverId = `benchmark-${requestId}-${Math.random().toString(36).substring(7)}.${this.network}`;
    const amount = this.generateRandomAmount();
    
    const metric: RequestMetrics = { 
      startTime: Date.now(),
      success: false
    };
    this.requestMetrics.push(metric);
    
    try {
      const response: AxiosResponse = await axios.post(
        `${this.apiUrl}/transfer`,
        {
          receiverId,
          amount,
          memo: `benchmark-${requestId}-${Date.now()}`
        },
        { 
          timeout: 30000,
          validateStatus: () => true // Don't throw on HTTP errors
        }
      );

      metric.endTime = Date.now();
      metric.httpStatus = response.status;
      
      if (response.status === 200 && response.data.success) {
        metric.success = true;
        this.results.successfulRequests++;
      } else {
        metric.success = false;
        metric.error = response.data.error || `HTTP ${response.status}`;
        this.results.failedRequests++;
        
        // Track error types
        const errorType = this.categorizeError(response.status, response.data.error);
        this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
      }
    } catch (error: any) {
      metric.endTime = Date.now();
      metric.success = false;
      metric.error = error.code || error.message || 'Unknown error';
      this.results.failedRequests++;
      
      // Track network/timeout errors
      const errorType = this.categorizeError(0, error.code || error.message);
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
    }
  }

  private generateRandomAmount(): string {
    // Generate amounts between 1 and 1000 tokens
    const amount = Math.floor(Math.random() * 1000) + 1;
    return amount.toString();
  }

  private categorizeError(httpStatus: number, errorMessage?: string): string {
    if (httpStatus === 429) return 'RATE_LIMITED';
    if (httpStatus >= 500) return 'SERVER_ERROR';
    if (httpStatus === 400) return 'BAD_REQUEST';
    if (httpStatus === 0 || !httpStatus) {
      if (errorMessage?.includes('timeout')) return 'TIMEOUT';
      if (errorMessage?.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
      if (errorMessage?.includes('ENOTFOUND')) return 'DNS_ERROR';
      return 'NETWORK_ERROR';
    }
    return 'OTHER_ERROR';
  }

  private measureThroughput(): void {
    const now = Date.now();
    const completed = this.requestMetrics.filter(m => m.endTime).length;
    const successful = this.requestMetrics.filter(m => m.success).length;
    const errors = this.requestMetrics.filter(m => m.endTime && !m.success).length;

    this.throughputMeasurements.push({
      timestamp: now,
      completedRequests: completed,
      successfulRequests: successful,
      errorCount: errors
    });
  }

  private logProgress(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.startTime) / 1000;
    const completed = this.requestMetrics.filter(m => m.endTime).length;
    const totalTarget = this.targetTps * 60 * this.durationMinutes;
    const progress = (completed / totalTarget) * 100;
    
    // Calculate current TPS (last 10 seconds)
    const recentMeasurements = this.throughputMeasurements.slice(-2);
    let currentTps = 0;
    
    if (recentMeasurements.length >= 2) {
      const [prev, current] = recentMeasurements;
      const timeDiff = (current.timestamp - prev.timestamp) / 1000;
      const requestDiff = current.completedRequests - prev.completedRequests;
      currentTps = requestDiff / timeDiff;
    }
    
    this.logger.info('Production benchmark progress', {
      progress: `${progress.toFixed(1)}%`,
      completed,
      totalTarget,
      elapsed: `${elapsedSeconds.toFixed(0)}s`,
      successful: this.results.successfulRequests,
      failed: this.results.failedRequests,
      currentTps: currentTps.toFixed(2),
      targetTps: this.targetTps,
      successRate: `${((this.results.successfulRequests / Math.max(1, completed)) * 100).toFixed(1)}%`
    });
  }

  private completeBenchmark(): void {
    this.isRunning = false;
    const totalTime = (Date.now() - this.startTime) / 1000;
    
    // Calculate response time metrics
    const completedRequests = this.requestMetrics.filter(m => m.endTime);
    const responseTimes = completedRequests.map(m => (m.endTime! - m.startTime));
    responseTimes.sort((a, b) => a - b);
    
    this.results.totalRequests = completedRequests.length;
    this.results.totalTime = totalTime;
    this.results.actualTps = completedRequests.length / totalTime;
    this.results.successRate = (this.results.successfulRequests / completedRequests.length) * 100;
    
    if (responseTimes.length > 0) {
      this.results.minResponseTime = responseTimes[0];
      this.results.maxResponseTime = responseTimes[responseTimes.length - 1];
      this.results.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      this.results.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)];
      this.results.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)];
    }

    // Process throughput data
    this.results.throughputOverTime = this.calculateThroughputOverTime();
    this.results.errorsByType = this.errorsByType;

    this.printDetailedResults();
    this.saveResults();
  }

  private calculateThroughputOverTime(): Array<{ timestamp: number; tps: number; success: number; errors: number }> {
    const throughputData: Array<{ timestamp: number; tps: number; success: number; errors: number }> = [];
    
    for (let i = 1; i < this.throughputMeasurements.length; i++) {
      const prev = this.throughputMeasurements[i - 1];
      const current = this.throughputMeasurements[i];
      
      const timeDiff = (current.timestamp - prev.timestamp) / 1000;
      const requestDiff = current.completedRequests - prev.completedRequests;
      const successDiff = current.successfulRequests - prev.successfulRequests;
      const errorDiff = current.errorCount - prev.errorCount;
      
      throughputData.push({
        timestamp: current.timestamp,
        tps: requestDiff / timeDiff,
        success: successDiff,
        errors: errorDiff
      });
    }
    
    return throughputData;
  }

  private printDetailedResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('PRODUCTION-READY BENCHMARK RESULTS');
    console.log('='.repeat(60));
    console.log(`Network: ${this.results.network}`);
    console.log(`API URL: ${this.apiUrl}`);
    console.log(`Duration: ${this.durationMinutes} minutes`);
    console.log(`Target TPS: ${this.targetTps}`);
    console.log('');
    
    console.log('PERFORMANCE METRICS:');
    console.log(`Total requests: ${this.results.totalRequests}`);
    console.log(`Successful: ${this.results.successfulRequests}`);
    console.log(`Failed: ${this.results.failedRequests}`);
    console.log(`Success rate: ${this.results.successRate.toFixed(2)}%`);
    console.log(`Actual TPS: ${this.results.actualTps.toFixed(2)}`);
    console.log(`TPS Achievement: ${((this.results.actualTps / this.targetTps) * 100).toFixed(1)}%`);
    console.log(`Total time: ${this.results.totalTime.toFixed(2)}s`);
    console.log('');
    
    console.log('RESPONSE TIME METRICS:');
    console.log(`Min response time: ${this.results.minResponseTime}ms`);
    console.log(`Max response time: ${this.results.maxResponseTime}ms`);
    console.log(`Avg response time: ${this.results.avgResponseTime.toFixed(2)}ms`);
    console.log(`95th percentile: ${this.results.p95ResponseTime}ms`);
    console.log(`99th percentile: ${this.results.p99ResponseTime}ms`);
    console.log('');
    
    if (this.errorsByType.size > 0) {
      console.log('ERROR BREAKDOWN:');
      for (const [errorType, count] of this.errorsByType.entries()) {
        const percentage = ((count / this.results.failedRequests) * 100).toFixed(1);
        console.log(`${errorType}: ${count} (${percentage}%)`);
      }
      console.log('');
    }
    
    // Performance assessment
    console.log('PERFORMANCE ASSESSMENT:');
    const tpsAchievement = (this.results.actualTps / this.targetTps) * 100;
    if (tpsAchievement >= 95) {
      console.log('✅ EXCELLENT: Target TPS achieved');
    } else if (tpsAchievement >= 80) {
      console.log('✅ GOOD: Close to target TPS');
    } else if (tpsAchievement >= 60) {
      console.log('⚠️  FAIR: Below target TPS but acceptable');
    } else {
      console.log('❌ POOR: Significantly below target TPS');
    }
    
    if (this.results.successRate >= 99.5) {
      console.log('✅ EXCELLENT: Very high success rate');
    } else if (this.results.successRate >= 95) {
      console.log('✅ GOOD: High success rate');
    } else if (this.results.successRate >= 90) {
      console.log('⚠️  FAIR: Acceptable success rate');
    } else {
      console.log('❌ POOR: Low success rate');
    }
    
    console.log('='.repeat(60));
  }

  private saveResults(): void {
    const fs = require('fs');
    const path = require('path');
    
    const resultsDir = path.join(__dirname, 'results', this.network);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `production-benchmark-${this.targetTps}tps-${timestamp}.json`;
    const filepath = path.join(resultsDir, filename);
    
    const resultData = {
      ...this.results,
      timestamp: new Date().toISOString(),
      config: {
        apiUrl: this.apiUrl,
        targetTps: this.targetTps,
        durationMinutes: this.durationMinutes,
        network: this.network
      },
      errorsByType: Array.from(this.errorsByType.entries())
    };
    
    fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
    this.logger.info(`Production benchmark results saved to: ${filepath}`);
    
    // Also save a CSV summary for analysis
    this.saveCsvSummary(resultsDir, timestamp);
  }

  private saveCsvSummary(resultsDir: string, timestamp: string): void {
    const fs = require('fs');
    const path = require('path');
    
    const csvFilename = `benchmark-summary-${timestamp}.csv`;
    const csvFilepath = path.join(resultsDir, csvFilename);
    
    const csvData = [
      'timestamp,network,target_tps,actual_tps,total_requests,successful_requests,failed_requests,success_rate,avg_response_time,p95_response_time,p99_response_time',
      `${new Date().toISOString()},${this.network},${this.targetTps},${this.results.actualTps.toFixed(2)},${this.results.totalRequests},${this.results.successfulRequests},${this.results.failedRequests},${this.results.successRate.toFixed(2)},${this.results.avgResponseTime.toFixed(2)},${this.results.p95ResponseTime},${this.results.p99ResponseTime}`
    ].join('\n');
    
    fs.writeFileSync(csvFilepath, csvData);
    this.logger.info(`CSV summary saved to: ${csvFilepath}`);
  }
}