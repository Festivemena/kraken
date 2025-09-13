import { config } from 'dotenv';
import { FTTransferBenchmark } from './load-test';
import { Logger } from '../utils/logger';

config();

const logger = new Logger('Benchmark');

async function main() {
  const args = process.argv.slice(2);
  
  const apiUrl = args[0] || 'http://localhost:3000';
  const tps = parseInt(args[1] || '100');
  const duration = parseInt(args[2] || '10');
  const network = args[3] || 'testnet';
  
  logger.info('Starting FT Transfer Benchmark for NEAR Bounty', { 
    apiUrl, 
    targetTPS: tps, 
    durationMinutes: duration, 
    network,
    bountyRequirement: '100+ TPS sustained for 10 minutes'
  });
  
  // Validate inputs
  if (tps < 1 || tps > 1000) {
    logger.error('Invalid TPS value. Must be between 1 and 1000');
    process.exit(1);
  }
  
  if (duration < 1 || duration > 60) {
    logger.error('Invalid duration. Must be between 1 and 60 minutes');
    process.exit(1);
  }
  
  const benchmark = new FTTransferBenchmark(apiUrl, tps, duration, network);
  
  try {
    console.log('\n🚀 Starting benchmark...');
    console.log(`📊 Target: ${tps} TPS for ${duration} minutes`);
    console.log(`🌐 Network: ${network}`);
    console.log(`🔗 API URL: ${apiUrl}`);
    console.log(`🎯 Bounty Goal: ${tps >= 100 ? 'MEETS' : 'BELOW'} requirement (100+ TPS)\n`);
    
    const result = await benchmark.run();
    
    // Final bounty compliance check
    console.log('\n🎯 BOUNTY COMPLIANCE SUMMARY:');
    console.log('━'.repeat(50));
    console.log(`Requirement: 100+ TPS sustained`);
    console.log(`Achieved: ${result.actualTps.toFixed(2)} TPS`);
    console.log(`Status: ${result.actualTps >= 100 ? '✅ COMPLIANT' : '❌ NOT COMPLIANT'}`);
    console.log(`Success Rate: ${result.successRate.toFixed(2)}%`);
    console.log(`Reliability: ${result.successRate >= 95 ? '✅ HIGH' : result.successRate >= 90 ? '⚠️ MEDIUM' : '❌ LOW'}`);
    console.log('━'.repeat(50));
    
    if (result.actualTps >= 100) {
      console.log('🎉 BOUNTY REQUIREMENT MET! The API successfully achieved 100+ TPS.');
    } else {
      console.log('⚠️ Bounty requirement not met. Consider optimizing configuration.');
      console.log('\n💡 Optimization suggestions:');
      console.log('- Increase BATCH_SIZE in .env (try 100-150)');
      console.log('- Increase QUEUE_CONCURRENCY (try 200-300)');
      console.log('- Increase MAX_PARALLEL_TX (try 50)');
      console.log('- Reduce BATCH_INTERVAL_MS (try 200ms)');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Benchmark failed:', error);
    console.log('\n❌ BENCHMARK FAILED');
    console.log('Common issues:');
    console.log('1. Server not running - start with: npm run dev');
    console.log('2. Wrong API URL - check the server address');
    console.log('3. Network issues - check internet connection');
    console.log('4. Configuration issues - verify .env file');
    
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in benchmark:', error);
  process.exit(1);
});