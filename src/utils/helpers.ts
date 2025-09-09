import { KeyPair } from 'near-api-js';

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateKeyPairs(count: number): KeyPair[] {
  const keyPairs: KeyPair[] = [];
  for (let i = 0; i < count; i++) {
    keyPairs.push(KeyPair.fromRandom('ed25519'));
  }
  return keyPairs;
}

export function formatAmount(amount: string, decimals: number = 24): string {
  // Convert human-readable amount to yoctoNEAR format
  const [whole, fractional = ''] = amount.split('.');
  const fractionalPadded = fractional.padEnd(decimals, '0').substring(0, decimals);
  return whole + fractionalPadded;
}

export function parseAmount(yoctoAmount: string, decimals: number = 24): string {
  // Convert yoctoNEAR to human-readable format
  const whole = yoctoAmount.slice(0, -decimals) || '0';
  const fractional = yoctoAmount.slice(-decimals).replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : whole;
}

export function isValidAccountId(accountId: string): boolean {
  const pattern = /^[a-z0-9_\-]+\.(testnet|near)$/;
  return pattern.test(accountId);
}

export function shortenString(str: string, start: number = 6, end: number = 4): string {
  if (str.length <= start + end) {
    return str;
  }
  return `${str.substring(0, start)}...${str.substring(str.length - end)}`;
}