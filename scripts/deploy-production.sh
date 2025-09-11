#!/bin/bash

set -e

# Production Deployment Script for High-Performance FT Transfer API
# This script handles the complete production deployment process

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ft-transfer-api"
ENVIRONMENT=${1:-"production"}
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"your-registry.com"}
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "latest")
DEPLOY_DIR="/opt/ft-transfer-api"
BACKUP_DIR="/opt/backups/ft-transfer-api"

# Performance settings
TARGET_TPS=${TARGET_TPS:-100}
TEST_DURATION=${TEST_DURATION:-10}
SCALE_INSTANCES=${SCALE_INSTANCES:-3}

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Check if running as root (needed for production deployment)
check_privileges() {
    if [[ $EUID -ne 0 ]] && [[ "$ENVIRONMENT" == "production" ]]; then
        error "Production deployment requires root privileges"
        exit 1
    fi
}

# Validate required environment variables
check_environment() {
    local required_vars=(
        "MASTER_ACCOUNT_ID"
        "MASTER_PRIVATE_KEY"
        "CONTRACT_ID"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Missing required environment variables:"
        printf '%s\n' "${missing_vars[@]}"
        error "Please set these variables in .env.production or export them"
        exit 1
    fi
    
    # Validate NEAR account ID format
    if [[ ! "$MASTER_ACCOUNT_ID" =~ ^[a-z0-9_-]+\.(testnet|near)$ ]]; then
        error "Invalid MASTER_ACCOUNT_ID format: $MASTER_ACCOUNT_ID"
        exit 1
    fi
    
    # Validate private key format
    if [[ ! "$MASTER_PRIVATE_KEY" =~ ^ed25519: ]]; then
        error "Invalid MASTER_PRIVATE_KEY format (must start with 'ed25519:')"
        exit 1
    fi
}

# Check system dependencies
check_dependencies() {
    local deps=("docker" "docker-compose" "curl" "jq" "git")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies:"
        printf '%s\n' "${missing_deps[@]}"
        exit 1
    fi
    
    # Check Docker version
    local docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null)
    info "Docker version: $docker_version"
    
    # Check available memory
    local available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [[ $available_memory -lt 2048 ]]; then
        warn "Available memory is less than 2GB (${available_memory}MB). Performance may be affected."
    fi
    
    # Check available disk space
    local available_disk=$(df / | awk 'NR==2 {print $4}')
    if [[ $available_disk -lt 5000000 ]]; then # 5GB in KB
        warn "Available disk space is less than 5GB. Consider freeing up space."
    fi
}

# Create deployment directory structure
setup_directories() {
    log "Setting up deployment directories"
    
    mkdir -p "$DEPLOY_DIR"/{config,logs,data,backups,ssl}
    mkdir -p "$BACKUP_DIR"
    
    # Set proper permissions
    if [[ "$ENVIRONMENT" == "production" ]]; then
        chmod 755 "$DEPLOY_DIR"
        chmod 700 "$DEPLOY_DIR"/{config,ssl}
        chmod 755 "$DEPLOY_DIR"/{logs,data,backups}
    fi
}

# Backup current deployment
backup_current_deployment() {
    if [[ -d "$DEPLOY_DIR" ]] && [[ "$(ls -A $DEPLOY_DIR)" ]]; then
        log "Backing up current deployment"
        
        local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
        local backup_path="$BACKUP_DIR/$backup_name"
        
        mkdir -p "$backup_path"
        
        # Backup configuration and data
        if [[ -f "$DEPLOY_DIR/.env.production" ]]; then
            cp "$DEPLOY_DIR/.env.production" "$backup_path/"
        fi
        
        if [[ -d "$DEPLOY_DIR/logs" ]]; then
            cp -r "$DEPLOY_DIR/logs" "$backup_path/"
        fi
        
        if [[ -d "$DEPLOY_DIR/data" ]]; then
            cp -r "$DEPLOY_DIR/data" "$backup_path/"
        fi
        
        log "Backup created at: $backup_path"
        
        # Keep only last 5 backups
        cd "$BACKUP_DIR"
        ls -t | tail -n +6 | xargs rm -rf
    fi
}

# Build application
build_application() {
    log "Building application"
    
    # Install dependencies
    npm ci --production=false
    
    # Run linting
    log "Running code quality checks"
    npm run lint
    
    # Run tests
    log "Running tests"
    npm test
    
    # Build application
    log "Building TypeScript application"
    npm run build
    
    log "Application build completed successfully"
}

# Build Docker images
build_docker_images() {
    log "Building Docker images"
    
    # Build main application image
    docker build \
        -t "$DOCKER_REGISTRY/$APP_NAME:$VERSION" \
        -t "$DOCKER_REGISTRY/$APP_NAME:latest" \
        --target production \
        .
    
    log "Docker images built successfully"
    
    # Push to registry if configured
    if [[ "$DOCKER_REGISTRY" != "your-registry.com" ]] && [[ "$ENVIRONMENT" == "production" ]]; then
        log "Pushing images to registry"
        docker push "$DOCKER_REGISTRY/$APP_NAME:$VERSION"
        docker push "$DOCKER_REGISTRY/$APP_NAME:latest"
    fi
}

# Deploy configuration files
deploy_configuration() {
    log "Deploying configuration files"
    
    # Copy environment configuration
    if [[ -f ".env.$ENVIRONMENT" ]]; then
        cp ".env.$ENVIRONMENT" "$DEPLOY_DIR/.env.production"
        chmod 600 "$DEPLOY_DIR/.env.production"
    else
        error "Environment file .env.$ENVIRONMENT not found"
        exit 1
    fi
    
    # Copy Docker Compose configuration
    cp "docker-compose.production.yml" "$DEPLOY_DIR/"
    
    # Copy monitoring configuration
    if [[ -f "prometheus.yml" ]]; then
        cp "prometheus.yml" "$DEPLOY_DIR/config/"
    fi
    
    if [[ -d "grafana" ]]; then
        cp -r "grafana" "$DEPLOY_DIR/config/"
    fi
    
    # Copy SSL certificates if available
    if [[ -d "ssl" ]] && [[ "$(ls -A ssl)" ]]; then
        cp -r ssl/* "$DEPLOY_DIR/ssl/"
        chmod 600 "$DEPLOY_DIR/ssl"/*
    fi
}

# Deploy services
deploy_services() {
    log "Deploying services"
    
    cd "$DEPLOY_DIR"
    
    # Set environment variables for Docker Compose
    export APP_VERSION="$VERSION"
    export ENVIRONMENT="$ENVIRONMENT"
    export DOCKER_REGISTRY="$DOCKER_REGISTRY"
    
    # Pull latest images
    docker-compose -f docker-compose.production.yml pull
    
    # Stop existing services gracefully
    if docker-compose -f docker-compose.production.yml ps | grep -q "Up"; then
        log "Stopping existing services"
        docker-compose -f docker-compose.production.yml down --timeout 30
    fi
    
    # Start services
    log "Starting services with $SCALE_INSTANCES instances"
    docker-compose -f docker-compose.production.yml up -d --scale ft-transfer-api="$SCALE_INSTANCES"
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy"
    local max_attempts=60
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f http://localhost:3000/health &>/dev/null; then
            log "Services are healthy"
            break
        fi
        
        attempt=$((attempt + 1))
        sleep 5
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Services failed to become healthy within timeout"
            docker-compose -f docker-compose.production.yml logs --tail=50
            exit 1
        fi
        
        info "Waiting for services... ($attempt/$max_attempts)"
    done
}

# Run health checks
run_health_checks() {
    log "Running comprehensive health checks"
    
    # API health check
    info "Testing API health endpoint"
    local health_response=$(curl -s http://localhost:3000/health)
    if [[ $(echo "$health_response" | jq -r '.status') != "ok" ]]; then
        error "API health check failed"
        echo "$health_response"
        exit 1
    fi
    
    # Database connectivity (Redis)
    info "Testing Redis connectivity"
    if ! docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping | grep -q "PONG"; then
        error "Redis connectivity check failed"
        exit 1
    fi
    
    # Metrics endpoint
    info "Testing metrics endpoint"
    if ! curl -f http://localhost:3000/metrics &>/dev/null; then
        error "Metrics endpoint check failed"
        exit 1
    fi
    
    # Test transfer functionality
    info "Testing transfer functionality"
    local test_response=$(curl -s -X POST http://localhost:3000/transfer \
        -H "Content-Type: application/json" \
        -d "{
            \"receiverId\": \"test-$(date +%s).testnet\",
            \"amount\": \"1\",
            \"memo\": \"deployment-test\"
        }")
    
    if [[ $(echo "$test_response" | jq -r '.success') != "true" ]]; then
        warn "Transfer test failed - this may be expected if the contract is not properly configured"
        echo "$test_response"
    else
        log "Transfer functionality test passed"
    fi
}

# Run performance benchmark
run_performance_test() {
    log "Running performance benchmark (${TARGET_TPS} TPS for ${TEST_DURATION} minutes)"
    
    # Wait a bit for services to fully stabilize
    sleep 10
    
    # Run benchmark
    cd "$DEPLOY_DIR"
    docker-compose -f docker-compose.production.yml run --rm \
        -e TARGET_TPS="$TARGET_TPS" \
        -e TEST_DURATION="$TEST_DURATION" \
        benchmark-runner npm run benchmark -- http://ft-transfer-api:3000 "$TARGET_TPS" "$TEST_DURATION" testnet
    
    # Check benchmark results
    local benchmark_results_dir="$DEPLOY_DIR/benchmarks/results/testnet"
    local latest_result=$(ls -t "$benchmark_results_dir"/production-benchmark-*.json 2>/dev/null | head -n1)
    
    if [[ -f "$latest_result" ]]; then
        local actual_tps=$(jq -r '.actualTps' "$latest_result")
        local success_rate=$(jq -r '.successRate' "$latest_result")
        
        log "Benchmark Results:"
        log "  Target TPS: $TARGET_TPS"
        log "  Actual TPS: $actual_tps"
        log "  Success Rate: ${success_rate}%"
        
        # Validate performance meets requirements
        local tps_threshold=$(echo "$TARGET_TPS * 0.8" | bc -l)
        if (( $(echo "$actual_tps >= $tps_threshold" | bc -l) )); then
            log "✅ Performance test PASSED - TPS requirement met"
        else
            error "❌ Performance test FAILED - TPS below 80% of target"
            exit 1
        fi
        
        if (( $(echo "$success_rate >= 95" | bc -l) )); then
            log "✅ Reliability test PASSED - Success rate acceptable"
        else
            error "❌ Reliability test FAILED - Success rate below 95%"
            exit 1
        fi
    else
        warn "Benchmark results not found - skipping performance validation"
    fi
}

# Setup monitoring alerts (optional)
setup_monitoring() {
    log "Setting up monitoring and alerts"
    
    # Check if Prometheus is accessible
    if curl -f http://localhost:9090/-/healthy &>/dev/null; then
        log "Prometheus is healthy"
    else
        warn "Prometheus is not accessible"
    fi
    
    # Check if Grafana is accessible
    if curl -f http://localhost:3001/api/health &>/dev/null; then
        log "Grafana is healthy"
    else
        warn "Grafana is not accessible"
    fi
    
    # Import Grafana dashboards if configured
    local grafana_config="$DEPLOY_DIR/config/grafana"
    if [[ -d "$grafana_config/dashboards" ]]; then
        info "Grafana dashboards will be automatically imported"
    fi
}

# Cleanup old resources
cleanup() {
    log "Cleaning up old resources"
    
    # Remove old Docker images
    docker image prune -f --filter "until=72h"
    
    # Remove old logs (keep last 7 days)
    find "$DEPLOY_DIR/logs" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    
    # Cleanup old benchmark results (keep last 30)
    local results_dir="$DEPLOY_DIR/benchmarks/results"
    if [[ -d "$results_dir" ]]; then
        find "$results_dir" -name "*.json" | head -n -30 | xargs rm -f 2>/dev/null || true
    fi
}

# Generate deployment report
generate_report() {
    log "Generating deployment report"
    
    local report_file="$DEPLOY_DIR/deployment-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "deployment": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "version": "$VERSION",
    "environment": "$ENVIRONMENT",
    "target_tps": $TARGET_TPS,
    "scale_instances": $SCALE_INSTANCES
  },
  "system": {
    "hostname": "$(hostname)",
    "os": "$(uname -s)",
    "kernel": "$(uname -r)",
    "memory_gb": $(free -g | awk 'NR==2{print $2}'),
    "disk_available_gb": $(df / | awk 'NR==2 {printf "%.1f", $4/1024/1024}')
  },
  "services": {
    "api_health": "$(curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null || echo 'unknown')",
    "redis_status": "$(docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping 2>/dev/null || echo 'unknown')",
    "prometheus_status": "$(curl -s http://localhost:9090/-/healthy 2>/dev/null && echo 'healthy' || echo 'unknown')"
  },
  "performance": {
    "benchmark_completed": $(test -f "$DEPLOY_DIR/benchmarks/results/testnet/production-benchmark-"*".json" && echo 'true' || echo 'false')
  }
}
EOF

    log "Deployment report saved to: $report_file"
}

# Main deployment function
main() {
    log "Starting production deployment of $APP_NAME version $VERSION"
    
    # Pre-deployment checks
    check_privileges
    check_dependencies
    
    # Load environment variables
    if [[ -f ".env.$ENVIRONMENT" ]]; then
        source ".env.$ENVIRONMENT"
    fi
    
    check_environment
    
    # Deployment process
    setup_directories
    backup_current_deployment
    build_application
    build_docker_images
    deploy_configuration
    deploy_services
    
    # Post-deployment validation
    run_health_checks
    
    # Optional performance test
    if [[ "${SKIP_BENCHMARK:-false}" != "true" ]]; then
        run_performance_test
    else
        warn "Skipping performance benchmark (SKIP_BENCHMARK=true)"
    fi
    
    # Setup monitoring
    setup_monitoring
    
    # Cleanup
    cleanup
    
    # Generate report
    generate_report
    
    log "🚀 Production deployment completed successfully!"
    log ""
    log "Services:"
    log "  API:        http://localhost:3000"
    log "  Health:     http://localhost:3000/health"
    log "  Metrics:    http://localhost:3000/metrics"
    log "  Prometheus: http://localhost:9090"
    log "  Grafana:    http://localhost:3001 (admin/admin123)"
    log ""
    log "Deployment Details:"
    log "  Version:    $VERSION"
    log "  Instances:  $SCALE_INSTANCES"
    log "  Target TPS: $TARGET_TPS"
    log "  Logs:       $DEPLOY_DIR/logs"
    log "  Backups:    $BACKUP_DIR"
    log ""
    log "Next Steps:"
    log "  1. Monitor the services using Grafana dashboard"
    log "  2. Run additional load tests if needed"
    log "  3. Configure SSL certificates for production"
    log "  4. Set up automated monitoring alerts"
}

# Rollback function
rollback() {
    log "Rolling back to previous deployment"
    
    cd "$DEPLOY_DIR"
    
    # Stop current services
    docker-compose -f docker-compose.production.yml down
    
    # Find latest backup
    local latest_backup=$(ls -t "$BACKUP_DIR" | head -n1)
    
    if [[ -n "$latest_backup" ]]; then
        log "Restoring from backup: $latest_backup"
        
        # Restore configuration
        if [[ -f "$BACKUP_DIR/$latest_backup/.env.production" ]]; then
            cp "$BACKUP_DIR/$latest_backup/.env.production" "$DEPLOY_DIR/"
        fi
        
        # Restart services with previous configuration
        docker-compose -f docker-compose.production.yml up -d
        
        log "Rollback completed"
    else
        error "No backup found for rollback"
        exit 1
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy"|"production")
        main
        ;;
    "rollback")
        rollback
        ;;
    "test")
        run_performance_test
        ;;
    "health")
        run_health_checks
        ;;
    *)
        echo "Usage: $0 [deploy|rollback|test|health]"
        echo ""
        echo "Commands:"
        echo "  deploy     - Full production deployment (default)"
        echo "  rollback   - Rollback to previous deployment"
        echo "  test       - Run performance benchmark only"
        echo "  health     - Run health checks only"
        echo ""
        echo "Environment Variables:"
        echo "  TARGET_TPS=100        - Target transactions per second"
        echo "  TEST_DURATION=10      - Benchmark duration in minutes"
        echo "  SCALE_INSTANCES=3     - Number of API instances"
        echo "  SKIP_BENCHMARK=false  - Skip performance test"
        echo "  DOCKER_REGISTRY=...   - Docker registry URL"
        exit 1
        ;;
esac