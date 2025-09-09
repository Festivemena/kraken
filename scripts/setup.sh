#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    warn "Node.js is not installed. Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    warn "Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# Install dependencies
log "Installing dependencies..."
npm ci

# Create environment file
if [ ! -f .env ]; then
    log "Creating .env file from template..."
    cp .env.example .env
    warn "Please edit .env file with your configuration"
fi

# Create directories
log "Creating necessary directories..."
mkdir -p logs benchmarks/results/{localnet,testnet}

# Build the application
log "Building application..."
npm run build

# Set up git hooks
log "Setting up git hooks..."
cp scripts/git-hooks/* .git/hooks/
chmod +x .git/hooks/*

log "Setup completed successfully!"
log "Next steps:"
log "1. Edit .env file with your NEAR account details"
log "2. Run 'npm start' to start the server"
log "3. Run 'npm run benchmark' to test performance"