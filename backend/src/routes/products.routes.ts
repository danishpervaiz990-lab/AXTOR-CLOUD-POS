import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct
} from '../controllers/products.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const productsRouter = Router();

productsRouter.get('/api/v1/products', requireAuth, listProducts);
productsRouter.get('/api/v1/products/:id', requireAuth, getProduct);
productsRouter.post('/api/v1/products', requireAuth, createProduct);
productsRouter.patch('/api/v1/products/:id', requireAuth, updateProduct);
productsRouter.delete('/api/v1/products/:id', requireAuth, deleteProduct);
