import { Router } from 'express';
import { getSession } from '../services/coachService.js';
import { asyncRoute } from './errorHandler.js';

export const sessionRoutes = Router();

sessionRoutes.get(
  '/session',
  asyncRoute(async (_request, response) => {
    response.json(await getSession());
  })
);
