#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ft-transfer-api"
ENVIRONMENT=${1:-"production"}
DOCKER_REGISTRY="your-registry.com"
VERSION=$(git describe --tags --always)

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

check_dependencies() {
    local deps=("docker" "docker-compose" "node" "npm" "git")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "Required dependency $dep is not installed"
            exit 1
        fi
    done
}

build_app() {
    log "Building application..."
    npm ci
    npm run build
    npm test
}

build_docker() {
    log "Building Docker image..."
    docker build -t $DOCKER_REGISTRY/$APP_NAME:$VERSION -t $DOCKER_REGISTRY/$APP_NAME:latest .
}

push_docker() {
    log "Pushing Docker image to registry..."
    docker push $DOCKER_REGISTRY/$APP_NAME:$VERSION
    docker push $DOCKER_REGISTRY/$APP_NAME:latest
}

deploy() {
    log "Deploying to $ENVIRONMENT environment..."
    
    # Export environment variables for docker-compose
    export APP_VERSION=$VERSION
    export ENVIRONMENT=$ENVIRONMENT
    export DOCKER_REGISTRY=$DOCKER_REGISTRY
    
    # Pull latest images and deploy
    docker-compose -f docker/docker-compose.yml pull
    docker-compose -f docker/docker-compose.yml up -d --force-recreate
    
    # Wait for service to be healthy
    log "Waiting for service to be healthy..."
    sleep 30
    
    # Run health check
    if curl -f http://localhost:3000/health; then
        log "Deployment successful!"
    else
        error "Deployment failed - health check failed"
        exit 1
    fi
}

run_migrations() {
    log "Running database migrations..."
    # Add your migration commands here
}

main() {
    log "Starting deployment of $APP_NAME version $VERSION to $ENVIRONMENT"
    
    check_dependencies
    build_app
    build_docker
    
    if [ "$ENVIRONMENT" != "local" ]; then
        push_docker
    fi
    
    deploy
    run_migrations
    
    log "Deployment completed successfully!"
}

# Handle errors
trap 'error "Deployment failed with error: $?"; exit 1' ERR

main "$@"