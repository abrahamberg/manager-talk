import { Router } from 'express';
import { AnswerRequestSchema } from '../schemas/apiSchemas.js';
import { submitAnswer } from '../services/coachService.js';
import { asyncRoute } from './errorHandler.js';

export const answerRoutes = Router();

answerRoutes.post(
  '/answer',
  asyncRoute(async (request, response) => {
    const body = AnswerRequestSchema.parse(request.body);

    response.json(await submitAnswer(body));
  })
);
