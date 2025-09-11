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
    .message('receiverId must be a valid NEAR account ID (e.g., account.testnet or account.near)'),
  
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
      
      return value;
    })
    .messages({
      'amount.positive': 'amount must be a positive number',
      'amount.tooLarge': 'amount exceeds maximum allowed value',
      'string.pattern.base': 'amount must be a valid number string'
    }),
  
  memo: Joi.string()
    .optional()
    .allow('')
    .max(256)
    .pattern(/^[\x20-\x7E]*$/) // Printable ASCII characters only
    .message('memo must contain only printable ASCII characters and be less than 256 characters')
});

export const batchTransferSchema = Joi.object({
  transfers: Joi.array()
    .items(transferSchema)
    .min(1)
    .max(100)
    .required()
    .message('transfers must be an array of 1-100 transfer objects'),
    
  priority: Joi.number()
    .optional()
    .min(0.1)
    .max(10)
    .default(1)
    .message('priority must be between 0.1 and 10')
});

export const metricsQuerySchema = Joi.object({
  period: Joi.string()
    .optional()
    .valid('1m', '5m', '15m', '1h', '24h')
    .default('5m')
    .message('period must be one of: 1m, 5m, 15m, 1h, 24h'),
    
  detailed: Joi.boolean()
    .optional()
    .default(false)
    .message('detailed must be a boolean value')
});

export const healthCheckSchema = Joi.object({
  detailed: Joi.boolean()
    .optional()
    .default(false)
    .message('detailed must be a boolean value')
});

// Validation for webhook callbacks (if implemented)
export const webhookSchema = Joi.object({
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .message('url must be a valid HTTP or HTTPS URL'),
    
  events: Joi.array()
    .items(Joi.string().valid('transfer_success', 'transfer_failed', 'batch_completed'))
    .min(1)
    .required()
    .message('events must contain at least one valid event type'),
    
  secret: Joi.string()
    .optional()
    .min(8)
    .max(64)
    .message('secret must be between 8 and 64 characters')
});

// Rate limiting bypass schema (for authenticated requests)
export const rateLimitBypassSchema = Joi.object({
  apiKey: Joi.string()
    .required()
    .length(32)
    .pattern(/^[a-f0-9]{32}$/)
    .message('apiKey must be a valid 32-character hex string')
});

// Custom validation helpers
export const customValidators = {
  /**
   * Validates NEAR account ID format
   */
  isValidNearAccountId: (accountId: string): boolean => {
    return NEAR_ACCOUNT_PATTERN.test(accountId);
  },

  /**
   * Validates amount format and converts to yoctoNEAR if needed
   */
  validateAndFormatAmount: (amount: string): { isValid: boolean; formatted: string; error?: string } => {
    if (!AMOUNT_PATTERN.test(amount)) {
      return { isValid: false, formatted: '', error: 'Invalid amount format' };
    }

    try {
      const numValue = parseFloat(amount);
      
      if (numValue <= 0) {
        return { isValid: false, formatted: '', error: 'Amount must be positive' };
      }
      
      if (numValue > 1e12) {
        return { isValid: false, formatted: '', error: 'Amount too large' };
      }

      // If amount contains decimals, assume it's in NEAR and convert to yoctoNEAR
      if (amount.includes('.') && !amount.includes('e') && !amount.includes('E')) {
        const yoctoAmount = (numValue * 1e24).toString();
        return { isValid: true, formatted: yoctoAmount };
      }

      return { isValid: true, formatted: amount };
    } catch (error) {
      return { isValid: false, formatted: '', error: 'Invalid number format' };
    }
  },

  /**
   * Validates memo content for security
   */
  validateMemo: (memo?: string): { isValid: boolean; error?: string } => {
    if (!memo) return { isValid: true };

    if (memo.length > 256) {
      return { isValid: false, error: 'Memo too long (max 256 characters)' };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /<iframe/i,
      /<object/i,
      /<embed/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(memo)) {
        return { isValid: false, error: 'Memo contains potentially harmful content' };
      }
    }

    return { isValid: true };
  },

  /**
   * Rate limiting validation
   */
  validateRateLimit: (ip: string, userAgent?: string): { isValid: boolean; error?: string } => {
    // Check for suspicious user agents
    const suspiciousAgents = [
      /bot/i,
      /crawler/i,
      /scanner/i,
      /spider/i
    ];

    if (userAgent) {
      for (const pattern of suspiciousAgents) {
        if (pattern.test(userAgent)) {
          return { isValid: false, error: 'Automated requests not allowed' };
        }
      }
    }

    // Basic IP validation
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i;
    if (!ipPattern.test(ip)) {
      return { isValid: false, error: 'Invalid IP address format' };
    }

    return { isValid: true };
  }
};

// Schema validation middleware factory
export const createValidationMiddleware = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errorDetails
      });
    }

    // Additional custom validation
    if (value.receiverId && !customValidators.isValidNearAccountId(value.receiverId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid NEAR account ID format'
      });
    }

    if (value.amount) {
      const amountValidation = customValidators.validateAndFormatAmount(value.amount);
      if (!amountValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: amountValidation.error
        });
      }
      value.amount = amountValidation.formatted;
    }

    if (value.memo) {
      const memoValidation = customValidators.validateMemo(value.memo);
      if (!memoValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: memoValidation.error
        });
      }
    }

    req.body = value;
    next();
  };
};

// Enhanced error response formatter
export const formatValidationError = (error: Joi.ValidationError) => {
  const details = error.details.map(detail => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value,
    type: detail.type
  }));

  return {
    success: false,
    error: 'Request validation failed',
    code: 'VALIDATION_ERROR',
    details,
    timestamp: new Date().toISOString()
  };
};