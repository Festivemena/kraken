import axios, { AxiosResponse, AxiosError } from 'axios';
import { Logger } from '../utils/logger';

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
  private logger = new Logger('FTBenchmark');
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
  const totalRequests = Math.floor(this.targetTps * 60 * this.durationMinutes);

  console.log('\n🔍 BENCHMARK DEBUG INFO:');
  console.log(`Target TPS: ${this.targetTps}`);
  console.log(`Duration: ${this.durationMinutes} minutes (${this.durationMinutes * 60} seconds)`);
  console.log(`Total requests planned: ${totalRequests}`);
  console.log(`API URL: ${this.apiUrl}`);
  console.log(`Network: ${this.network}\n`);

  // Validate the calculation
  if (totalRequests <= 0) {
    throw new Error(`Invalid total requests: ${totalRequests}. Check your TPS (${this.targetTps}) and duration (${this.durationMinutes})`);
  }

  this.logger.info('Starting FT transfer benchmark for 100+ TPS requirement', {
    targetTps: this.targetTps,
    durationMinutes: this.durationMinutes,
    totalRequests,
    network: this.network,
    apiUrl: this.apiUrl
  });

  // Test server connectivity first
  await this.testConnectivity();

  // Start throughput monitoring every 5 seconds
  const throughputInterval = setInterval(() => {
    this.measureThroughput();
  }, 5000);

  // Progress monitoring every 10 seconds
  const progressInterval = setInterval(() => {
    this.logProgress();
  }, 10000);

  // Generate requests at target TPS with proper timing
  const requestPromises: Promise<void>[] = [];
  let requestsSent = 0;

  // Use more precise timing for high TPS
  const intervalMs = 100; // 100ms intervals for better precision
  const requestsPerInterval = Math.ceil(this.targetTps / 10); // requests per 100ms

  console.log(`🚀 Starting request generation:`);
  console.log(`  - ${requestsPerInterval} requests every ${intervalMs}ms`);
  console.log(`  - Total duration: ${this.durationMinutes * 60 * 1000}ms`);
  console.log(`  - Expected completion time: ${totalRequests / this.targetTps} seconds\n`);

  const startSending = Date.now();

  // FIXED: Create the interval and store the reference
  const requestInterval = setInterval(() => {
    // FIXED: Add condition check debugging
    if (requestsSent >= totalRequests) {
      console.log(`✅ All ${totalRequests} requests queued in ${Date.now() - startSending}ms`);
      clearInterval(requestInterval);
      return;
    }

    // Send batch of requests for this interval
    const batchStart = requestsSent;
    for (let i = 0; i < requestsPerInterval && requestsSent < totalRequests; i++) {
      const requestId = requestsSent++;
      // FIXED: Make sure we're actually pushing to the array
      const requestPromise = this.sendTransferRequest(requestId);
      requestPromises.push(requestPromise);
    }

    // Debug logging for first few batches
    if (batchStart < 50 || batchStart % 1000 === 0) {
      console.log(`📦 Batch queued: requests ${batchStart} to ${requestsSent - 1} (${requestPromises.length} total promises)`);
    }

    // Log progress every 1000 requests
    if (requestsSent % 1000 === 0 || requestsSent === totalRequests) {
      console.log(`📊 Queued ${requestsSent}/${totalRequests} requests (${((requestsSent/totalRequests)*100).toFixed(1)}%)`);
    }
  }, intervalMs);

  // Stop after duration - FIXED: Make sure this doesn't interfere
  const durationMs = this.durationMinutes * 60 * 1000;
  const durationTimeout = setTimeout(() => {
    console.log(`⏰ Duration completed (${this.durationMinutes} minutes), stopping new requests...`);
    console.log(`Total requests queued so far: ${requestsSent}`);
    clearInterval(requestInterval);
    clearInterval(progressInterval);
    clearInterval(throughputInterval);
    this.logger.info('Benchmark duration completed, waiting for remaining requests...');
  }, durationMs);

  // FIXED: Wait for either all requests to be queued OR duration to complete
  return new Promise(async (resolve) => {
    const checkCompletion = () => {
      if (requestsSent >= totalRequests || !this.isRunning) {
        clearTimeout(durationTimeout);
        clearInterval(requestInterval);
        clearInterval(progressInterval);
        clearInterval(throughputInterval);
        
        console.log(`⏳ Waiting for all ${requestPromises.length} requests to complete...`);
        
        // Wait for all requests to complete with timeout
        const completionTimeoutMs = Math.max(durationMs, 60000); // At least 60 seconds
        const completionTimeout = setTimeout(() => {
          console.log('⚠️ Completion timeout reached, stopping benchmark...');
          this.logger.warn('Benchmark completion timeout reached');
          this.completeBenchmark();
          resolve(this.results);
        }, completionTimeoutMs);

        // Monitor completion progress
        const completionMonitor = setInterval(() => {
          const completed = this.requestMetrics.filter(m => m.endTime).length;
          console.log(`📈 Progress: ${completed}/${requestPromises.length} requests completed`);
        }, 5000);

        Promise.allSettled(requestPromises).then(() => {
          clearTimeout(completionTimeout);
          clearInterval(completionMonitor);

          console.log(`✅ All requests completed, calculating results...`);

          // Calculate final results
          this.completeBenchmark();
          resolve(this.results);
        });
      } else {
        // Check again in 100ms
        setTimeout(checkCompletion, 100);
      }
    };

    // Start checking for completion
    setTimeout(checkCompletion, 1000); // Start checking after 1 second
  });
}

  private async testConnectivity(): Promise<void> {
    try {
      this.logger.info('Testing API server connectivity...');
      console.log('🔍 Testing API server connectivity...');
      
      const response = await axios.get(`${this.apiUrl}/health`, { 
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500
      });
      
      if (response.status !== 200) {
        throw new Error(`Health check failed with status: ${response.status}`);
      }
      
      console.log(`✅ API server connectivity test passed - Status: ${response.status}`);
      
      this.logger.info('API server connectivity test passed', {
        status: response.status,
        statusText: response.statusText
      });

      // Additional test - try the status endpoint
      try {
        const statusResponse = await axios.get(`${this.apiUrl}/status`, { timeout: 5000 });
        console.log(`✅ Status endpoint accessible - Status: ${statusResponse.status}`);
      } catch (error) {
        console.log(`⚠️ Status endpoint check failed, but health passed - continuing...`);
      }

    } catch (error: any) {
      console.log(`❌ API server connectivity test failed`);
      const safeError = this.extractSafeErrorInfo(error);
      this.logger.error('API server connectivity test failed', safeError);
      throw new Error(`Cannot connect to API server at ${this.apiUrl}: ${safeError.message}`);
    }
  }

  private extractSafeErrorInfo(error: any): { message: string; code?: string; status?: number; url?: string } {
    const safeError: { message: string; code?: string; status?: number; url?: string } = {
      message: error?.message || 'Unknown error'
    };

    if (error?.code) {
      safeError.code = error.code;
    }

    if (error?.response?.status) {
      safeError.status = error.response.status;
    }

    if (error?.config?.url) {
      safeError.url = error.config.url;
    }

    return safeError;
  }

  private async sendTransferRequest(requestId: number): Promise<void> {
    // Generate realistic test data
    const receiverId = this.generateTestReceiverId(requestId);
    const amount = this.generateTestAmount();
    
    // Add debug logging for first few requests
    if (requestId < 5) {
      console.log(`🔍 Debug: Sending request ${requestId} to ${receiverId} for ${amount} tokens`);
    }
    
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
          validateStatus: () => true, // Don't throw on HTTP errors
          maxRedirects: 0,
          transformResponse: [(data) => {
            try {
              return typeof data === 'string' ? JSON.parse(data) : data;
            } catch {
              return { error: 'Invalid JSON response', raw: data };
            }
          }]
        }
      );

      metric.endTime = Date.now();
      metric.httpStatus = response.status;
      
      // Add debug logging for first few responses
      if (requestId < 5) {
        console.log(`🔍 Debug: Request ${requestId} response - Status: ${response.status}`);
        console.log(`🔍 Debug: Response data:`, JSON.stringify(response.data, null, 2));
      }
      
      if (response.status === 200 && response.data?.success) {
        metric.success = true;
        this.results.successfulRequests++;
        
        if (requestId < 5) {
          console.log(`✅ Debug: Request ${requestId} successful`);
        }
      } else {
        metric.success = false;
        metric.error = response.data?.error || `HTTP ${response.status}`;
        this.results.failedRequests++;
        
        // Log error for debugging
        if (requestId < 5) {
          console.log(`❌ Debug: Request ${requestId} failed - Error: ${metric.error}`);
        }
        
        // Track error types for analysis
        const errorType = this.categorizeError(response.status, response.data?.error);
        this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
      }
    } catch (error: any) {
      metric.endTime = Date.now();
      metric.success = false;
      
      // Safe error extraction
      const safeError = this.extractSafeErrorInfo(error);
      metric.error = safeError.code || safeError.message || 'Unknown error';
      this.results.failedRequests++;
      
      // Debug logging for errors
      if (requestId < 5) {
        console.log(`❌ Debug: Request ${requestId} threw error:`, safeError);
      }
      
      // Track network/timeout errors
      const errorType = this.categorizeError(safeError.status || 0, safeError.code || safeError.message);
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
    }
  }

  private generateTestReceiverId(requestId: number): string {
    // Use actual testnet accounts that exist for testing
    const testAccounts = [
      'tx-bench.testnet',
      'favvit.testnet'
    ];
    
    // Rotate through test accounts
    return testAccounts[requestId % testAccounts.length];
  }

  private generateTestAmount(): string {
    // Generate realistic transfer amounts (1-1000 tokens)
    const amount = Math.floor(Math.random() * 1000) + 1;
    return amount.toString();
  }

  private categorizeError(httpStatus: number, errorMessage?: string): string {
    if (httpStatus === 429) return 'RATE_LIMITED';
    if (httpStatus >= 500) return 'SERVER_ERROR';
    if (httpStatus === 400) return 'BAD_REQUEST';
    if (httpStatus === 404) return 'NOT_FOUND';
    if (httpStatus === 0 || !httpStatus) {
      if (errorMessage?.includes('timeout')) return 'TIMEOUT';
      if (errorMessage?.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
      if (errorMessage?.includes('ENOTFOUND')) return 'DNS_ERROR';
      if (errorMessage?.includes('ECONNRESET')) return 'CONNECTION_RESET';
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
    const progress = totalTarget > 0 ? (completed / totalTarget) * 100 : 0;
    
    // Calculate current TPS (last measurement window)
    const recentMeasurements = this.throughputMeasurements.slice(-2);
    let currentTps = 0;
    
    if (recentMeasurements.length >= 2) {
      const [prev, current] = recentMeasurements;
      const timeDiff = (current.timestamp - prev.timestamp) / 1000;
      const requestDiff = current.completedRequests - prev.completedRequests;
      currentTps = timeDiff > 0 ? requestDiff / timeDiff : 0;
    }
    
    console.log(`📊 Progress: ${progress.toFixed(1)}% | Completed: ${completed}/${totalTarget} | Current TPS: ${currentTps.toFixed(2)} | Success Rate: ${((this.results.successfulRequests / Math.max(1, completed)) * 100).toFixed(1)}%`);
    
    this.logger.info('FT Transfer Benchmark Progress (100+ TPS Target)', {
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
    this.results.actualTps = completedRequests.length > 0 ? completedRequests.length / totalTime : 0;
    this.results.successRate = completedRequests.length > 0 ? 
      (this.results.successfulRequests / completedRequests.length) * 100 : 0;
    
    if (responseTimes.length > 0) {
      this.results.minResponseTime = responseTimes[0];
      this.results.maxResponseTime = responseTimes[responseTimes.length - 1];
      this.results.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      this.results.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
      this.results.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    }

    // Process throughput data
    this.results.throughputOverTime = this.calculateThroughputOverTime();
    this.results.errorsByType = this.errorsByType;

    console.log('\n📈 BENCHMARK COMPLETED - Calculating final results...');
    console.log(`Total execution time: ${totalTime.toFixed(2)} seconds`);
    console.log(`Requests attempted: ${this.requestMetrics.length}`);
    console.log(`Requests completed: ${completedRequests.length}`);
    console.log(`Successful requests: ${this.results.successfulRequests}`);
    console.log(`Failed requests: ${this.results.failedRequests}`);

    this.printBenchmarkResults();
    this.saveBenchmarkResults();
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
        tps: timeDiff > 0 ? requestDiff / timeDiff : 0,
        success: successDiff,
        errors: errorDiff
      });
    }
    
    return throughputData;
  }

  private printBenchmarkResults(): void {
    console.log('\n' + '='.repeat(70));
    console.log('FT TRANSFER API BENCHMARK RESULTS (100+ TPS REQUIREMENT)');
    console.log('='.repeat(70));
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
    console.log(`TPS Achievement: ${this.targetTps > 0 ? ((this.results.actualTps / this.targetTps) * 100).toFixed(1) : 0}%`);
    console.log(`Total time: ${this.results.totalTime.toFixed(2)}s`);
    console.log('');
    
    console.log('RESPONSE TIME METRICS:');
    console.log(`Min response time: ${this.results.minResponseTime === Infinity ? 'N/A' : this.results.minResponseTime + 'ms'}`);
    console.log(`Max response time: ${this.results.maxResponseTime}ms`);
    console.log(`Avg response time: ${this.results.avgResponseTime.toFixed(2)}ms`);
    console.log(`95th percentile: ${this.results.p95ResponseTime}ms`);
    console.log(`99th percentile: ${this.results.p99ResponseTime}ms`);
    console.log('');
    
    if (this.errorsByType.size > 0) {
      console.log('ERROR BREAKDOWN:');
      for (const [errorType, count] of this.errorsByType.entries()) {
        const percentage = this.results.failedRequests > 0 ? 
          ((count / this.results.failedRequests) * 100).toFixed(1) : '0';
        console.log(`${errorType}: ${count} (${percentage}%)`);
      }
      console.log('');
    }
    
    // Assessment for 100+ TPS requirement
    console.log('BOUNTY REQUIREMENT ASSESSMENT (100+ TPS):');
    if (this.results.actualTps >= 100) {
      console.log('✅ REQUIREMENT MET: Achieved 100+ TPS');
      if (this.results.actualTps >= 150) {
        console.log('🚀 EXCELLENT: Significantly exceeded requirement');
      } else if (this.results.actualTps >= 120) {
        console.log('⭐ GREAT: Well above minimum requirement');
      }
    } else {
      console.log('❌ REQUIREMENT NOT MET: Below 100 TPS threshold');
    }
    
    if (this.results.successRate >= 95) {
      console.log('✅ HIGH RELIABILITY: Success rate >= 95%');
    } else if (this.results.successRate >= 90) {
      console.log('⚠️  ACCEPTABLE: Success rate >= 90%');
    } else {
      console.log('❌ LOW RELIABILITY: Success rate < 90%');
    }
    
    console.log('='.repeat(70));
  }

  private saveBenchmarkResults(): void {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const resultsDir = path.join(process.cwd(), 'benchmark-results', this.network);
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `ft-transfer-benchmark-${this.targetTps}tps-${timestamp}.json`;
      const filepath = path.join(resultsDir, filename);
      
      const resultData = {
        ...this.results,
        timestamp: new Date().toISOString(),
        bountyRequirement: '100+ TPS for 10 minutes',
        requirementMet: this.results.actualTps >= 100,
        config: {
          apiUrl: this.apiUrl,
          targetTps: this.targetTps,
          durationMinutes: this.durationMinutes,
          network: this.network
        },
        errorsByType: Array.from(this.errorsByType.entries())
      };
      
      fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
      console.log(`Benchmark results saved to: ${filepath}`);
      
      // Save CSV summary for analysis
      this.saveCsvSummary(resultsDir, timestamp);
    } catch (error) {
      console.error('Failed to save benchmark results:', error);
    }
  }

  private saveCsvSummary(resultsDir: string, timestamp: string): void {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const csvFilename = `benchmark-summary-${timestamp}.csv`;
      const csvFilepath = path.join(resultsDir, csvFilename);
      
      const csvData = [
        'timestamp,network,target_tps,actual_tps,requirement_met,total_requests,successful_requests,failed_requests,success_rate,avg_response_time,p95_response_time,p99_response_time',
        `${new Date().toISOString()},${this.network},${this.targetTps},${this.results.actualTps.toFixed(2)},${this.results.actualTps >= 100},${this.results.totalRequests},${this.results.successfulRequests},${this.results.failedRequests},${this.results.successRate.toFixed(2)},${this.results.avgResponseTime.toFixed(2)},${this.results.p95ResponseTime},${this.results.p99ResponseTime}`
      ].join('\n');
      
      fs.writeFileSync(csvFilepath, csvData);
      console.log(`CSV summary saved to: ${csvFilepath}`);
    } catch (error) {
      console.error('Failed to save CSV summary:', error);
    }
  }
}