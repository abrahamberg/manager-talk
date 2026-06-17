import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { StaleQuestionError } from '../services/coachService.js';

export function asyncRoute(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Invalid request body.', details: error.issues });
    return;
  }

  if (error instanceof StaleQuestionError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error.';

  console.error(error);
  response.status(500).json({ error: message });
}
