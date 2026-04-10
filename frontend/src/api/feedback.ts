import { usersClient } from './client';

export interface AlphaFeedbackPayload {
  overallRating: 1 | 2 | 3 | 4 | 5;
  confusingPart: string;
  estimateAccuracy: string;
  oneChange: string;
  anythingElse: string;
}

export async function submitAlphaFeedback(payload: AlphaFeedbackPayload): Promise<void> {
  await usersClient.post('/users/me/alpha-feedback', payload);
}
