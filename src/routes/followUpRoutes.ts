import { Router } from 'express';
import { FollowUpRequestSchema } from '../schemas/apiSchemas.js';
import { submitFollowUp } from '../services/coachService.js';
import { asyncRoute } from './errorHandler.js';

export const followUpRoutes = Router();

followUpRoutes.post(
  '/follow-up',
  asyncRoute(async (request, response) => {
    const body = FollowUpRequestSchema.parse(request.body);

    response.json(await submitFollowUp(body));
  })
);
