# NEAR FT Transfer API Service

High-performance API service for Fungible Token transfers on NEAR Protocol.

## Features

- 🚀 High-throughput FT transfers (100+ TPS)
- 🔄 Request batching for efficiency
- 🔑 Multiple access key rotation
- 📊 Nonce management with caching
- 📈 Comprehensive metrics and monitoring
- 🧪 Built-in benchmarking tools
- 🐳 Docker containerization
- 🔒 Security best practices

## Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for containerized deployment)
- NEAR account with FT tokens

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/ft-transfer-api.git
   cd ft-transfer-api
Setup environment

bash
npm run setup
# Edit .env file with your configuration
Build and start

bash
npm run build
npm start
Test the API

bash
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "test.account.testnet",
    "amount": "100",
    "memo": "test transfer"
  }'
Configuration
Environment Variables
See .env.example for all available options.

Required Configuration
MASTER_ACCOUNT_ID: NEAR account holding the FT tokens

MASTER_PRIVATE_KEY: Private key for the account (ed25519 format)

CONTRACT_ID: FT contract address

Performance Tuning
BATCH_SIZE: Number of transfers per batch (default: 10)

BATCH_INTERVAL_MS: Time between batch processing (default: 1000ms)

KEY_ROTATION_COUNT: Number of access keys for parallel processing (default: 10)

API Endpoints
POST /transfer
Queue a new FT transfer request.

Request:

json
{
  "receiverId": "account.testnet",
  "amount": "100",
  "memo": "optional message"
}
Response:

json
{
  "success": true,
  "message": "Transfer queued successfully",
  "queueId": "uuid-1234",
  "receiverId": "account.testnet",
  "amount": "100"
}
GET /health
Health check and basic metrics.

Response:

json
{
  "status": "ok",
  "timestamp": "2023-07-01T12:00:00.000Z",
  "uptime": 123.45,
  "metrics": {
    "queueSize": 5,
    "totalTransfers": 1000,
    "successfulTransfers": 950,
    "failedTransfers": 50
  }
}
GET /metrics
Detailed performance metrics (Prometheus format).

Benchmarking
Run performance tests:

bash
# Test on localnet (100 TPS for 10 minutes)
npm run benchmark http://localhost:3000 100 10 localnet

# Test on testnet
npm run benchmark http://localhost:3000 50 5 testnet
Results are saved in benchmarks/results/ directory.

Deployment
Docker Deployment
Build and push

bash
./scripts/deploy.sh production
Docker Compose

bash
docker-compose -f docker/docker-compose.yml up -d
Manual Deployment
Setup server

bash
npm ci --production
npm run build
Start with PM2

bash
npm install -g pm2
pm2 start dist/index.js --name ft-transfer-api
Monitoring
The service provides several monitoring endpoints:

/health: Service health check

/metrics: Prometheus metrics

/status: Current status and statistics

Key Metrics
transfer_queue_size: Number of pending transfers

transfer_processing_time: Transfer processing duration

transfer_success_rate: Success rate percentage

batch_processing_time: Batch processing duration

Security Considerations
Run behind firewall: This service is designed for internal use

Key management: Use dedicated keys with limited permissions

Rate limiting: Configure appropriate rate limits based on your needs

Monitoring: Monitor for unusual activity or performance issues

Regular updates: Keep dependencies and Node.js updated

Support
For issues and questions:

Check the troubleshooting guide

Create an issue on GitHub

Join our Telegram support group

License
MIT License - see LICENSE file for details.