import { Router } from 'express';
import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer
} from '../controllers/customers.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const customersRouter = Router();

customersRouter.get('/api/v1/customers', requireAuth, listCustomers);
customersRouter.get('/api/v1/customers/:id', requireAuth, getCustomer);
customersRouter.post('/api/v1/customers', requireAuth, createCustomer);
customersRouter.patch('/api/v1/customers/:id', requireAuth, updateCustomer);
customersRouter.delete('/api/v1/customers/:id', requireAuth, deleteCustomer);
