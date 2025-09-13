import Joi from 'joi';

// NEAR account ID validation pattern
const NEAR_ACCOUNT_PATTERN = /^[a-z0-9_\-]+\.(testnet|near)$|^[a-z0-9_\-]{2,64}$/;

// Amount validation (supports both string numbers and scientific notation)
const AMOUNT_PATTERN = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

export const transferSchema = Joi.object({
  receiverId: Joi.string()
    .required()
    .pattern(NEAR_ACCOUNT_PATTERN)
    .min(2)
    .max(64)
    .messages({
      'string.pattern.base': 'receiverId must be a valid NEAR account ID (e.g., alice.testnet or alice.near)',
      'string.empty': 'receiverId is required',
      'any.required': 'receiverId is required'
    }),
  
  amount: Joi.string()
    .required()
    .pattern(AMOUNT_PATTERN)
    .custom((value, helpers) => {
      // Validate amount is positive and within reasonable bounds
      const numValue = parseFloat(value);
      
      if (numValue <= 0) {
        return helpers.error('amount.positive');
      }
      
      // Check for reasonable upper bound (1 trillion tokens)
      if (numValue > 1e12) {
        return helpers.error('amount.tooLarge');
      }
      
      // Check for too many decimal places (prevent precision issues)
      const decimalPlaces = (value.split('.')[1] || '').length;
      if (decimalPlaces > 24) {
        return helpers.error('amount.tooManyDecimals');
      }
      
      return value;
    })
    .messages({
      'amount.positive': 'amount must be a positive number',
      'amount.tooLarge': 'amount exceeds maximum allowed value (1 trillion)',
      'amount.tooManyDecimals': 'amount cannot have more than 24 decimal places',
      'string.pattern.base': 'amount must be a valid number string',
      'string.empty': 'amount is required',
      'any.required': 'amount is required'
    }),
  
  memo: Joi.string()
    .optional()
    .allow('')
    .max(256)
    .pattern(/^[\x20-\x7E\r\n\t]*$/) // Printable ASCII characters plus newlines and tabs
    .messages({
      'string.pattern.base': 'memo must contain only printable ASCII characters',
      'string.max': 'memo must be less than 256 characters'
    })
});

export const bulkTransferSchema = Joi.object({
  transfers: Joi.array()
    .items(transferSchema)
    .min(1)
    .max(1000)
    .required()
    .messages({
      'array.min': 'transfers must contain at least 1 transfer',
      'array.max': 'transfers cannot contain more than 1000 transfers per request',
      'any.required': 'transfers array is required'
    }),
    
  priority: Joi.number()
    .optional()
    .min(0.1)
    .max(10)
    .default(1)
    .messages({
      'number.min': 'priority must be between 0.1 and 10',
      'number.max': 'priority must be between 0.1 and 10'
    }),
    
  batchId: Joi.string()
    .optional()
    .min(1)
    .max(64)
    .pattern(/^[a-zA-Z0-9_\-]+$/)
    .messages({
      'string.pattern.base': 'batchId must contain only alphanumeric characters, underscores, and hyphens',
      'string.max': 'batchId must be less than 64 characters'
    })
});

export const metricsQuerySchema = Joi.object({
  period: Joi.string()
    .optional()
    .valid('1m', '5m', '15m', '1h', '24h')
    .default('5m')
    .messages({
      'any.only': 'period must be one of: 1m, 5m, 15m, 1h, 24h'
    }),
    
  detailed: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'detailed must be a boolean value'
    }),

  includeHistory: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'includeHistory must be a boolean value'
    })
});

export const healthCheckSchema = Joi.object({
  detailed: Joi.boolean()
    .optional()
    .default(false)
    .messages({
      'boolean.base': 'detailed must be a boolean value'
    })
});

// Performance testing schema for benchmark validation
export const benchmarkSchema = Joi.object({
  targetTPS: Joi.number()
    .optional()
    .min(1)
    .max(1000)
    .default(100)
    .messages({
      'number.min': 'targetTPS must be at least 1',
      'number.max': 'targetTPS cannot exceed 1000'
    }),
    
  durationMinutes: Joi.number()
    .optional()
    .min(1)
    .max(60)
    .default(10)
    .messages({
      'number.min': 'durationMinutes must be at least 1',
      'number.max': 'durationMinutes cannot exceed 60'
    }),
    
  networkId: Joi.string()
    .optional()
    .valid('testnet', 'mainnet')
    .default('testnet')
    .messages({
      'any.only': 'networkId must be either testnet or mainnet'
    })
});

// Custom validation helpers for enhanced security and performance
export const customValidators = {
  /**
   * Validates NEAR account ID format with additional security checks
   */
  isValidNearAccountId: (accountId: string): { isValid: boolean; error?: string } => {
    if (!accountId) {
      return { isValid: false, error: 'Account ID is required' };
    }

    if (!NEAR_ACCOUNT_PATTERN.test(accountId)) {
      return { isValid: false, error: 'Invalid NEAR account ID format' };
    }

    // Additional security checks
    if (accountId.includes('..')) {
      return { isValid: false, error: 'Account ID cannot contain consecutive dots' };
    }

    if (accountId.startsWith('.') || accountId.endsWith('.')) {
      return { isValid: false, error: 'Account ID cannot start or end with a dot' };
    }

    return { isValid: true };
  },

  /**
   * Validates and normalizes amount with precision handling
   */
  validateAndNormalizeAmount: (amount: string): { isValid: boolean; normalized?: string; error?: string } => {
    if (!amount || amount.trim() === '') {
      return { isValid: false, error: 'Amount is required' };
    }

    if (!AMOUNT_PATTERN.test(amount)) {
      return { isValid: false, error: 'Invalid amount format' };
    }

    try {
      const numValue = parseFloat(amount);
      
      if (numValue <= 0) {
        return { isValid: false, error: 'Amount must be positive' };
      }
      
      if (numValue > 1e12) {
        return { isValid: false, error: 'Amount too large' };
      }

      if (!isFinite(numValue)) {
        return { isValid: false, error: 'Amount must be a finite number' };
      }

      // Normalize the amount (remove leading zeros, etc.)
      const normalized = numValue.toString();
      
      return { isValid: true, normalized };
    } catch (error) {
      return { isValid: false, error: 'Invalid number format' };
    }
  },

  /**
   * Validates memo content for security and performance
   */
  
  validateMemo: (memo?: string): { isValid: boolean; error?: string } => {
    if (!memo) return { isValid: true };

    if (memo.length > 256) {
      return { isValid: false, error: 'Memo too long (max 256 characters)' };
    }

    // Check for suspicious patterns that might indicate injection attacks
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /on\w+\s*=/i, // onclick, onload, etc.
      /\\x[0-9a-f]{2}/i, // hex encoding
      /\\u[0-9a-f]{4}/i  // unicode encoding
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(memo)) {
        return { isValid: false, error: 'Memo contains potentially harmful content' };
      }
    }

    // Check for control characters (except allowed whitespace)
    const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    if (controlCharPattern.test(memo)) {
      return { isValid: false, error: 'Memo contains invalid control characters' };
    }

    return { isValid: true };
  }
};
