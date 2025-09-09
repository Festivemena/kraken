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

generate_keys() {
    local count=${1:-10}
    local network=${2:-testnet}
    
    log "Generating $count key pairs for $network..."
    
    for i in $(seq 1 $count); do
        # Generate key pair
        keypair=$(node -e "
            const { KeyPair } = require('near-api-js');
            const keyPair = KeyPair.fromRandom('ed25519');
            console.log(JSON.stringify({
                publicKey: keyPair.getPublicKey().toString(),
                privateKey: keyPair.toString()
            }));
        ")
        
        public_key=$(echo $keypair | jq -r '.publicKey')
        private_key=$(echo $keypair | jq -r '.privateKey')
        
        echo "Key $i:"
        echo "  Public:  $public_key"
        echo "  Private: $private_key"
        echo
        
        # Add key to account (this would require near-cli)
        warn "To use this key, add it to your account with:"
        warn "near add-key <your-account> $public_key"
    done
}

show_usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  -c, --count NUMBER    Number of keys to generate (default: 10)"
    echo "  -n, --network NETWORK Network (testnet/mainnet) (default: testnet)"
    echo "  -h, --help           Show this help message"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--count)
            COUNT="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check dependencies
if ! command -v jq &> /dev/null; then
    warn "jq is not installed. Installing jq..."
    sudo apt-get install -y jq
fi

if ! command -v node &> /dev/null; then
    warn "Node.js is not installed. Please install Node.js first."
    exit 1
fi

generate_keys $COUNT $NETWORK

log "Key generation completed!"
warn "Remember to secure your private keys and add the public keys to your NEAR account!"