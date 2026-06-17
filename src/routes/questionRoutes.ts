import { Router } from 'express';
import { NextQuestionRequestSchema } from '../schemas/apiSchemas.js';
import { getNextQuestion } from '../services/coachService.js';
import { asyncRoute } from './errorHandler.js';

export const questionRoutes = Router();

questionRoutes.post(
  '/question/next',
  asyncRoute(async (request, response) => {
    const body = NextQuestionRequestSchema.parse(request.body);

    response.json(await getNextQuestion(body.forceNew));
  })
);
