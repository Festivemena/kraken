import { config } from 'dotenv';
import { FTTransferBenchmark } from './load-test';
import { Logger } from '@/utils/logger';

config();

const logger = new Logger('Benchmark');

async function main() {
  const args = process.argv.slice(2);
  
  const apiUrl = args[0] || 'http://localhost:3000';
  const tps = parseInt(args[1] || '100');
  const duration = parseInt(args[2] || '10');
  const network = args[3] || 'testnet';
  
  logger.info('Starting benchmark', { apiUrl, tps, duration, network });
  
  const benchmark = new FTTransferBenchmark(apiUrl, tps, duration, network);
  
  try {
    await benchmark.run();
    process.exit(0);
  } catch (error) {
    logger.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in benchmark:', error);
  process.exit(1);
});