import axios, { AxiosResponse } from 'axios';
import { Logger } from '@/utils/logger';
import { delay } from '@/utils/helpers';

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
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  network: string;
  targetAchieved: boolean;
  sustainedThroughput: boolean;
}

interface RequestMetrics {
  startTime: number;
  endTime?: number;
  success?: boolean;
  error?: string;
  responseTime?: number;
}

export class FTTransferBenchmark {
  private logger = new Logger('Benchmark');
  private results: BenchmarkResult = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTime: 0,
    actualTps: 0,
    successRate: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
    avgResponseTime: 0,
    medianResponseTime: 0,
    p95ResponseTime: 0,
    p99ResponseTime: 0,
    network: this.network,
    targetAchieved: false,
    sustainedThroughput: false
  };
  
  private requestMetrics: RequestMetrics[] = [];
  private isRunning = false;
  private tpsHistory: number[] = [];

  constructor(
    private apiUrl: string,
    private targetTps: number,
    private durationMinutes: number,
    private network: string
  ) {}

  public async run(): Promise<BenchmarkResult> {
    if (this.isRunning) {
      throw new Error('Benchmark is already running');
    }

    this.isRunning = true;
    const totalRequests = this.targetTps * 60 * this.durationMinutes;
    const startTime = Date.now();

    this.logger.info('Starting enhanced benchmark for NEAR FT transfer API', {
      targetTps: this.targetTps,
      durationMinutes: this.durationMinutes,
      totalRequests,
      network: this.network,
      requirement: '100+ TPS sustained throughput'
    });

    // Warmup phase
    await this.warmupPhase();

    // Create request generator with better pacing
    const requestInterval = setInterval(() => {
      this.sendRequestBatch();
    }, 1000);

    // Monitor TPS every 5 seconds
    const tpsMonitor = setInterval(() => {
      this.monitorTps(startTime);
    }, 5000);

    // Progress monitoring
    const progressInterval = setInterval(() => {
      this.logProgress(startTime, totalRequests);
    }, 10000);

    // Stop after duration
    setTimeout(() => {
      clearInterval(requestInterval);
      clearInterval(tpsMonitor);
      clearInterval(progressInterval);
      this.completeBenchmark(startTime, totalRequests);
    }, this.durationMinutes * 60 * 1000);

    // Wait for completion
    await new Promise(resolve => {
      setTimeout(resolve, this.durationMinutes * 60 * 1000 + 5000);
    });

    return this.results;
  }

  private async warmupPhase(): Promise<void> {
    this.logger.info('Starting warmup phase...');
    
    // Send a few test requests to warm up the service
    const warmupRequests = Math.min(10, this.targetTps / 10);
    for (let i = 0; i < warmupRequests; i++) {
      try {
        await this.sendTestRequest();
        await delay(100);
      } catch (error) {
        this.logger.warn('Warmup request failed:', error);
      }
    }
    
    this.logger.info('Warmup phase completed');
  }

  private async sendTestRequest(): Promise<void> {
    const receiverId = `warmup-${Math.random().toString(36).substring(7)}.${this.network}`;
    await axios.post(`${this.apiUrl}/transfer`, {
      receiverId,
      amount: '1',
      memo: 'warmup-test'
    }, { timeout: 5000 });
  }

  private async sendRequestBatch(): Promise<void> {
    if (this.requestMetrics.length >= this.targetTps * 60 * this.durationMinutes) {
      return;
    }

    // Dynamic batch sizing based on target TPS
    const batchSize = Math.min(this.targetTps, 100);
    const requests: Promise<void>[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      if (this.requestMetrics.length >= this.targetTps * 60 * this.durationMinutes) {
        break;
      }

      const requestMetric: RequestMetrics = { startTime: Date.now() };
      this.requestMetrics.push(requestMetric);

      requests.push(
        this.sendSingleRequest(requestMetric).catch(error => {
          requestMetric.error = error.message;
          requestMetric.success = false;
          requestMetric.endTime = Date.now();
          requestMetric.responseTime = requestMetric.endTime - requestMetric.startTime;
        })
      );

      // Add small delay to prevent overwhelming the server
      if (i > 0 && i % 10 === 0) {
        await delay(10);
      }
    }

    await Promise.allSettled(requests);
  }

  private async sendSingleRequest(metric: RequestMetrics): Promise<void> {
    const receiverId = `benchmark-${Math.random().toString(36).substring(7)}.${this.network}`;
    const amount = (Math.floor(Math.random() * 1000) + 1).toString();
    
    try {
      const response: AxiosResponse = await axios.post(
        `${this.apiUrl}/transfer`,
        {
          receiverId,
          amount,
          memo: `Benchmark test - ${Date.now()}`
        },
        { 
          timeout: 30000,
          validateStatus: () => true
        }
      );

      metric.endTime = Date.now();
      metric.responseTime = metric.endTime - metric.startTime;
      
      if (response.status === 200 && response.data.success) {
        metric.success = true;
        this.results.successfulRequests++;
      } else {
        metric.success = false;
        metric.error = response.data.error || `HTTP ${response.status}`;
        this.results.failedRequests++;
      }
    } catch (error) {
      metric.endTime = Date.now();
      metric.responseTime = metric.endTime - metric.startTime;
      metric.success = false;
      metric.error = error instanceof Error ? error.message : 'Unknown error';
      this.results.failedRequests++;
    }
  }

  private monitorTps(startTime: number): void {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const completed = this.requestMetrics.filter(m => m.endTime && m.success).length;
    const currentTps = completed / elapsedSeconds;
    
    this.tpsHistory.push(currentTps);
    
    this.logger.debug('TPS Monitor', {
      currentTps: currentTps.toFixed(2),
      targetTps: this.targetTps,
      targetMet: currentTps >= this.targetTps,
      elapsed: `${elapsedSeconds.toFixed(0)}s`
    });
  }

  private logProgress(startTime: number, totalRequests: number): void {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const completed = this.requestMetrics.filter(m => m.endTime).length;
    const successful = this.results.successfulRequests;
    const currentTps = successful / elapsedSeconds;
    const progress = (completed / totalRequests) * 100;
    
    this.logger.info('Benchmark Progress Report', {
      progress: `${progress.toFixed(1)}%`,
      completed,
      successful,
      failed: this.results.failedRequests,
      currentTps: currentTps.toFixed(2),
      targetTps: this.targetTps,
      targetMet: currentTps >= this.targetTps ? '✅' : '❌',
      elapsed: `${Math.floor(elapsedSeconds / 60)}m ${Math.floor(elapsedSeconds % 60)}s`,
      network: this.network
    });
  }

  private completeBenchmark(startTime: number, totalRequests: number): void {
    this.isRunning = false;
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Filter completed requests and calculate response time metrics
    const completedRequests = this.requestMetrics.filter(m => m.endTime && m.responseTime !== undefined);
    const responseTimes = completedRequests.map(m => m.responseTime!).sort((a, b) => a - b);
    
    if (responseTimes.length === 0) {
      throw new Error('No completed requests to analyze');
    }

    // Calculate detailed metrics
    this.results.totalRequests = completedRequests.length;
    this.results.totalTime = totalTime;
    this.results.actualTps = this.results.successfulRequests / totalTime;
    this.results.successRate = (this.results.successfulRequests / completedRequests.length) * 100;
    this.results.minResponseTime = Math.min(...responseTimes);
    this.results.maxResponseTime = Math.max(...responseTimes);
    this.results.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Calculate percentiles
    this.results.medianResponseTime = this.calculatePercentile(responseTimes, 50);
    this.results.p95ResponseTime = this.calculatePercentile(responseTimes, 95);
    this.results.p99ResponseTime = this.calculatePercentile(responseTimes, 99);
    
    // Check if target was achieved
    this.results.targetAchieved = this.results.actualTps >= this.targetTps;
    
    // Check sustained throughput (80% of time should be above target)
    const sustainedPeriods = this.tpsHistory.filter(tps => tps >= this.targetTps * 0.9).length;
    this.results.sustainedThroughput = sustainedPeriods / this.tpsHistory.length >= 0.8;

    this.printDetailedResults();
    this.saveResults();
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private printDetailedResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 NEAR FT TRANSFER API BENCHMARK RESULTS');
    console.log('='.repeat(60));
    console.log(`📡 Network: ${this.results.network.toUpperCase()}`);
    console.log(`⏱️  Duration: ${this.durationMinutes} minutes (${this.results.totalTime.toFixed(2)}s actual)`);
    console.log(`🎯 Target TPS: ${this.targetTps}`);
    console.log('');
    
    // Performance metrics
    console.log('📊 PERFORMANCE METRICS');
    console.log('-'.repeat(30));
    console.log(`Total Requests: ${this.results.totalRequests.toLocaleString()}`);
    console.log(`✅ Successful: ${this.results.successfulRequests.toLocaleString()}`);
    console.log(`❌ Failed: ${this.results.failedRequests.toLocaleString()}`);
    console.log(`📈 Success Rate: ${this.results.successRate.toFixed(2)}%`);
    console.log(`⚡ Actual TPS: ${this.results.actualTps.toFixed(2)} ${this.results.targetAchieved ? '✅' : '❌'}`);
    console.log(`🎯 Target Achieved: ${this.results.targetAchieved ? 'YES ✅' : 'NO ❌'}`);
    console.log(`⏳ Sustained Throughput: ${this.results.sustainedThroughput ? 'YES ✅' : 'NO ❌'}`);
    console.log('');
    
    // Response time metrics
    console.log('⏱️  RESPONSE TIME METRICS');
    console.log('-'.repeat(30));
    console.log(`Min: ${this.results.minResponseTime}ms`);
    console.log(`Avg: ${this.results.avgResponseTime.toFixed(2)}ms`);
    console.log(`Median: ${this.results.medianResponseTime}ms`);
    console.log(`95th Percentile: ${this.results.p95ResponseTime}ms`);
    console.log(`99th Percentile: ${this.results.p99ResponseTime}ms`);
    console.log(`Max: ${this.results.maxResponseTime}ms`);
    console.log('');
    
    // Bounty requirements check
    console.log('🏆 BOUNTY REQUIREMENTS CHECK');
    console.log('-'.repeat(30));
    console.log(`100+ TPS Required: ${this.results.actualTps >= 100 ? 'PASS ✅' : 'FAIL ❌'} (${this.results.actualTps.toFixed(2)} TPS)`);
    console.log(`10 Min Duration: ${this.durationMinutes >= 10 ? 'PASS ✅' : 'FAIL ❌'} (${this.durationMinutes} min)`);
    console.log(`Success Rate >95%: ${this.results.successRate >= 95 ? 'PASS ✅' : 'FAIL ❌'} (${this.results.successRate.toFixed(2)}%)`);
    console.log(`Sustained Performance: ${this.results.sustainedThroughput ? 'PASS ✅' : 'FAIL ❌'}`);
    
    console.log('='.repeat(60));
    
    if (this.results.actualTps >= 100 && this.results.successRate >= 95 && this.results.sustainedThroughput) {
      console.log('🎉 BENCHMARK PASSED - READY FOR BOUNTY SUBMISSION! 🎉');
    } else {
      console.log('⚠️  BENCHMARK NEEDS IMPROVEMENT FOR BOUNTY REQUIREMENTS');
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
    const filename = `benchmark-${this.targetTps}tps-${this.durationMinutes}min-${timestamp}.json`;
    const filepath = path.join(resultsDir, filename);
    
    const resultData = {
      ...this.results,
      timestamp: new Date().toISOString(),
      bountyRequirements: {
        targetTps: this.targetTps,
        minimumTpsRequired: 100,
        durationMinutes: this.durationMinutes,
        minimumDurationRequired: 10,
        successRateRequired: 95,
        allRequirementsMet: this.results.actualTps >= 100 && 
                           this.results.successRate >= 95 && 
                           this.results.sustainedThroughput &&
                           this.durationMinutes >= 10
      },
      config: {
        apiUrl: this.apiUrl,
        targetTps: this.targetTps,
        durationMinutes: this.durationMinutes,
        network: this.network
      },
      tpsHistory: this.tpsHistory,
      detailedMetrics: {
        requestsPerSecondHistory: this.tpsHistory,
        averageTpsOverTime: this.tpsHistory.reduce((a, b) => a + b, 0) / this.tpsHistory.length,
        tpsVariance: this.calculateVariance(this.tpsHistory)
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
    this.logger.info(`📁 Detailed results saved to: ${filepath}`);
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }
}