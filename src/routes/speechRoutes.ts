import { Router } from 'express';
import { SpeechRequestSchema } from '../schemas/speechSchemas.js';
import { createCoachSpeech } from '../services/speechService.js';
import { asyncRoute } from './errorHandler.js';

export const speechRoutes = Router();

speechRoutes.post(
  '/speech',
  asyncRoute(async (request, response) => {
    const body = SpeechRequestSchema.parse(request.body);
    const audio = await createCoachSpeech(body.text);

    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.send(audio);
  })
);
