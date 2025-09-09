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
  network: string;
}

interface RequestMetrics {
  startTime: number;
  endTime?: number;
  success?: boolean;
  error?: string;
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
    network: this.network
  };
  
  private requestMetrics: RequestMetrics[] = [];
  private isRunning = false;

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

    this.logger.info('Starting benchmark', {
      targetTps: this.targetTps,
      durationMinutes: this.durationMinutes,
      totalRequests,
      network: this.network
    });

    // Create request generator
    const requestInterval = setInterval(() => {
      this.sendRequestBatch(this.targetTps);
    }, 1000);

    // Monitor progress
    const progressInterval = setInterval(() => {
      this.logProgress(startTime, totalRequests);
    }, 5000);

    // Stop after duration
    setTimeout(() => {
      clearInterval(requestInterval);
      clearInterval(progressInterval);
      this.completeBenchmark(startTime, totalRequests);
    }, this.durationMinutes * 60 * 1000);

    // Wait for completion
    await new Promise(resolve => {
      setTimeout(resolve, this.durationMinutes * 60 * 1000 + 1000);
    });

    return this.results;
  }

  private async sendRequestBatch(batchSize: number): Promise<void> {
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
        })
      );
    }

    await Promise.all(requests);
  }

  private async sendSingleRequest(metric: RequestMetrics): Promise<void> {
    const receiverId = `test-${Math.random().toString(36).substring(7)}.${this.network}`;
    const amount = '1';
    
    try {
      const response: AxiosResponse = await axios.post(
        `${this.apiUrl}/transfer`,
        {
          receiverId,
          amount,
          memo: 'benchmark-test'
        },
        { 
          timeout: 10000,
          validateStatus: () => true // Don't throw on HTTP errors
        }
      );

      metric.endTime = Date.now();
      
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
      metric.success = false;
      metric.error = error instanceof Error ? error.message : 'Unknown error';
      this.results.failedRequests++;
    }
  }

  private logProgress(startTime: number, totalRequests: number): void {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const completed = this.requestMetrics.filter(m => m.endTime).length;
    const progress = (completed / totalRequests) * 100;
    
    this.logger.info('Benchmark progress', {
      progress: `${progress.toFixed(1)}%`,
      completed,
      total: totalRequests,
      elapsed: `${elapsedSeconds.toFixed(0)}s`,
      successful: this.results.successfulRequests,
      failed: this.results.failedRequests
    });
  }

  private completeBenchmark(startTime: number, totalRequests: number): void {
    this.isRunning = false;
    const totalTime = (Date.now() - startTime) / 1000;
    
    // Calculate response time metrics
    const completedRequests = this.requestMetrics.filter(m => m.endTime);
    const responseTimes = completedRequests.map(m => (m.endTime! - m.startTime));
    
    this.results.totalRequests = completedRequests.length;
    this.results.totalTime = totalTime;
    this.results.actualTps = completedRequests.length / totalTime;
    this.results.successRate = (this.results.successfulRequests / completedRequests.length) * 100;
    this.results.minResponseTime = Math.min(...responseTimes);
    this.results.maxResponseTime = Math.max(...responseTimes);
    this.results.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    this.printResults();
    this.saveResults();
  }

  private printResults(): void {
    console.log('\n=== BENCHMARK RESULTS ===');
    console.log(`Network: ${this.results.network}`);
    console.log(`Duration: ${this.durationMinutes} minutes`);
    console.log(`Target TPS: ${this.targetTps}`);
    console.log(`Total requests: ${this.results.totalRequests}`);
    console.log(`Successful: ${this.results.successfulRequests}`);
    console.log(`Failed: ${this.results.failedRequests}`);
    console.log(`Success rate: ${this.results.successRate.toFixed(2)}%`);
    console.log(`Actual TPS: ${this.results.actualTps.toFixed(2)}`);
    console.log(`Total time: ${this.results.totalTime.toFixed(2)}s`);
    console.log(`Min response time: ${this.results.minResponseTime}ms`);
    console.log(`Max response time: ${this.results.maxResponseTime}ms`);
    console.log(`Avg response time: ${this.results.avgResponseTime.toFixed(2)}ms`);
    console.log('=========================');
  }

  private saveResults(): void {
    const fs = require('fs');
    const path = require('path');
    
    const resultsDir = path.join(__dirname, 'results', this.network);
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const filename = `benchmark-${Date.now()}.json`;
    const filepath = path.join(resultsDir, filename);
    
    const resultData = {
      ...this.results,
      timestamp: new Date().toISOString(),
      config: {
        apiUrl: this.apiUrl,
        targetTps: this.targetTps,
        durationMinutes: this.durationMinutes,
        network: this.network
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
    this.logger.info(`Results saved to: ${filepath}`);
  }
}