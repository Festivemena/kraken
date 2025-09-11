# Multi-stage build for production-ready FT Transfer API
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Copy additional files
COPY --chown=nodejs:nodejs scripts/ ./scripts/
COPY --chown=nodejs:nodejs benchmarks/ ./benchmarks/

# Create necessary directories
RUN mkdir -p logs benchmarks/results/{localnet,testnet} && \
    chown -R nodejs:nodejs logs benchmarks

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV UV_THREADPOOL_SIZE=128

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Switch to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Labels for better container management
LABEL maintainer="NEAR FT Transfer Team"
LABEL version="1.0.0"
LABEL description="High-performance NEAR FT transfer API service"
LABEL org.opencontainers.image.source="https://github.com/your-org/ft-transfer-api"