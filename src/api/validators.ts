import Joi from 'joi';

export const transferSchema = Joi.object({
  receiverId: Joi.string()
    .required()
    .pattern(/^[a-z0-9_\-]+\.(testnet|near)$/)
    .message('receiverId must be a valid NEAR account ID'),
  
  amount: Joi.string()
    .required()
    .pattern(/^[0-9]+$/)
    .message('amount must be a string containing only digits'),
  
  memo: Joi.string()
    .optional()
    .max(100)
    .message('memo must be less than 100 characters')
});