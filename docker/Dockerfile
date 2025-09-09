FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY benchmarks/ ./benchmarks/

# Build the application
RUN npm run build

# Remove dev dependencies
RUN rm -rf node_modules && \
    npm ci --only=production --ignore-scripts

# Create runtime image
FROM node:18-alpine AS runtime

# Install runtime dependencies
RUN apk add --no-cache tini

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S near -u 1001

# Create app directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=near:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=near:nodejs /app/dist ./dist
COPY --from=builder --chown=near:nodejs /app/package.json ./

# Create logs directory
RUN mkdir -p logs && chown near:nodejs logs

# Switch to non-root user
USER near

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]