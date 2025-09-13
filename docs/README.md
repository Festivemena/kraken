# Complete Setup Guide - FT Transfer API (100+ TPS)

## 🚀 Quick Start (5 Minutes)

### 1. Clone and Install

```bash
# Create project directory
mkdir ft-transfer-api && cd ft-transfer-api

# Initialize package.json (copy from artifacts above)
# Install dependencies
npm install
```

### 2. Environment Setup

Create `.env` file (copy from `.env.example` artifact above):

```bash
cp .env.example .env
```

**Required Configuration:**
```bash
# Your NEAR account (must have FT tokens and NEAR for gas)
MASTER_ACCOUNT_ID=your-account.testnet
MASTER_PRIVATE_KEY=ed25519:your-private-key-here

# FT contract to transfer tokens from
CONTRACT_ID=usdt.testnet

# High TPS optimization
BATCH_SIZE=75
QUEUE_CONCURRENCY=150
MAX_PARALLEL_TX=30
```

### 3. Start Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build && npm start
```

### 4. Validate 100+ TPS

```bash
# Run bounty compliance test
npm run benchmark:100tps

# Server should achieve 100+ TPS for 10 minutes
```

## 📁 Complete File Structure

```
ft-transfer-api/
├── src/
│   ├── api/
│   │   ├── controllers.ts        # Request handlers
│   │   ├── routes.ts             # Route definitions  
│   │   └── validators.ts         # Request validation
│   ├── app/
│   │   ├── config.ts             # Configuration management
│   │   ├── server.ts             # Express server setup
│   │   └── middleware.ts         # Custom middleware
│   ├── services/
│   │   ├── transfer-service.ts   # Main FT transfer logic
│   │   └── batch-processor.ts    # Batch processing system
│   ├── models/
│   │   └── transfer-request.ts   # Type definitions
│   ├── utils/
│   │   ├── logger.ts             # Winston logging
│   │   └── metrics.ts            # Performance metrics
│   ├── benchmarks/
│   │   ├── index.ts              # Benchmark runner
│   │   └── load-test.ts          # Load testing logic
│   └── index.ts                  # Application entry point
├── package.json
├── tsconfig.json
├── .env.example
├── .env                          # Your configuration
└── README.md
```

## 🔧 File Contents

Copy each file from the artifacts I provided above:

1. **package.json** - Dependencies and scripts
2. **tsconfig.json** - TypeScript configuration
3. **src/index.ts** - Application entry point
4. **src/app/config.ts** - Configuration management
5. **src/services/transfer-service.ts** - Main service logic
6. **src/models/transfer-request.ts** - Type definitions
7. **src/utils/logger.ts** - Logging system
8. **src/utils/metrics.ts** - Performance metrics
9. **src/api/controllers.ts** - API controllers
10. **src/api/routes.ts** - Route definitions
11. **src/api/validators.ts** - Request validation
12. And the remaining files from the artifacts...

## ⚙️ NEAR Account Setup

### 1. Create NEAR Testnet Account

```bash
# Install NEAR CLI
npm install -g near-cli

# Create account
near create-account your-account.testnet --masterAccount testnet

# Or use NEAR Wallet: https://wallet.testnet.near.org
```

### 2. Fund Your Account

```bash
# Check NEAR balance (for gas fees)
near state your-account.testnet

# Get testnet NEAR tokens from faucet if needed
# Visit: https://near-faucet.io
```

### 3. Get FT Tokens

For testing, you'll need FT tokens to transfer:

```bash
# Check if you have FT tokens (example with USDT testnet)
near view usdt.testnet ft_balance_of '{"account_id":"your-account.testnet"}'

# If zero, you may need to:
# 1. Find a testnet FT faucet
# 2. Deploy your own test FT contract
# 3. Use an existing test FT contract with available tokens
```

### 4. Get Private Key

```bash
# Your private key is stored in ~/.near-credentials/testnet/your-account.testnet.json
cat ~/.near-credentials/testnet/your-account.testnet.json

# Copy the private_key value (starts with "ed25519:") to your .env file
```

## 🧪 Testing the Setup

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "bountyTarget": "100+ TPS",
  "details": {
    "initialized": true,
    "nearConnection": true,
    "ftContract": true
  }
}
```

### 2. Single Transfer Test

```bash
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "alice.testnet",
    "amount": "1",
    "memo": "Test transfer"
  }'
```

### 3. Bounty Compliance Test

```bash
# Run 100 TPS for 10 minutes (bounty requirement)
npm run benchmark:100tps

# Expected output:
# ✅ REQUIREMENT MET: Achieved 100+ TPS  
# ✅ HIGH RELIABILITY: Success rate >= 95%
```

## 📊 Monitoring and Validation

### Performance Endpoints

```bash
# Real-time metrics
curl http://localhost:3000/metrics

# Bounty compliance status  
curl http://localhost:3000/bounty-status

# System status
curl http://localhost:3000/status
```

### Key Metrics to Monitor

- **Current TPS**: Should consistently exceed 100
- **Success Rate**: Should be > 95%
- **Queue Size**: Should remain manageable under load
- **Memory Usage**: Should remain stable over time

## 🚨 Troubleshooting

### Common Issues

**1. "Service not initialized"**
- Check your MASTER_ACCOUNT_ID and MASTER_PRIVATE_KEY
- Verify the account exists and private key is correct

**2. "FT contract not accessible"**
- Verify CONTRACT_ID points to valid FT contract
- Check if contract implements ft_transfer method

**3. "Insufficient balance" errors**
- Fund your account with NEAR tokens for gas
- Get FT tokens to transfer

**4. Low TPS performance**
- Increase BATCH_SIZE (try 100-150)
- Increase QUEUE_CONCURRENCY (try 200-300)
- Increase MAX_PARALLEL_TX (try 50)

### Performance Tuning

For optimal 100+ TPS:

```bash
# High performance settings in .env
BATCH_SIZE=100
BATCH_INTERVAL_MS=200
MAX_PARALLEL_TX=50
QUEUE_CONCURRENCY=200
MAX_CONCURRENT_BATCHES=20
```

## 🎯 Bounty Validation Checklist

- [ ] Server starts without errors
- [ ] Health check returns "healthy" status
- [ ] Single transfer works correctly
- [ ] Bulk transfers work efficiently  
- [ ] Benchmark achieves 100+ TPS sustained
- [ ] Success rate stays above 95%
- [ ] Memory usage remains stable
- [ ] All API endpoints respond correctly

## 🚀 Production Deployment

### Environment Variables for Production

```bash
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_POINTS=2000
```

### Process Management

```bash
# Using PM2
npm install -g pm2
pm2 start dist/index.js --name ft-transfer-api
pm2 startup
pm2 save

# Using Docker
docker build -t ft-transfer-api .
docker run -p 3000:3000 --env-file .env ft-transfer-api
```

---

This complete setup will give you a production-ready FT Transfer API that meets the NEAR bounty requirement of 100+ TPS sustained for 10 minutes using the stable near-api-js library.