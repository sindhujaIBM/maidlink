/**
 * POST /users/me/alpha-feedback — submit alpha tester feedback for the estimator
 * Auth required (any logged-in user, no role guard)
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { withAuth, created, ValidationError } from '@maidlink/shared';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: 'us-east-1' }); // SES not available in ca-west-1

interface AlphaFeedbackPayload {
  overallRating: number;
  confusingPart: string;
  estimateAccuracy: string;
  oneChange: string;
  anythingElse?: string;
}

export const handler = withAuth(async (event: APIGatewayProxyEvent, auth) => {
  if (!event.body) throw new ValidationError('Request body is required');
  const body = JSON.parse(event.body) as AlphaFeedbackPayload;

  const { overallRating, confusingPart, estimateAccuracy, oneChange, anythingElse = '' } = body;

  // Validate
  if (!Number.isInteger(overallRating) || overallRating < 1 || overallRating > 5) {
    throw new ValidationError('overallRating must be an integer between 1 and 5');
  }
  if (!confusingPart?.trim()) throw new ValidationError('confusingPart is required');
  if (!estimateAccuracy?.trim()) throw new ValidationError('estimateAccuracy is required');
  if (!oneChange?.trim()) throw new ValidationError('oneChange is required');

  const truncate = (s: string) => s.trim().slice(0, 2000);
  const q2 = truncate(confusingPart);
  const q3 = truncate(estimateAccuracy);
  const q4 = truncate(oneChange);
  const q5 = truncate(anythingElse);

  const stars = '★'.repeat(overallRating) + '☆'.repeat(5 - overallRating);
  const submittedAt = new Date().toISOString();

  const emailBody = [
    'MaidLink Estimator Alpha Feedback',
    `Submitted by: ${auth.email} (userId: ${auth.userId})`,
    `Submitted at: ${submittedAt}`,
    '',
    `Q1 — Overall rating: ${overallRating} / 5 stars  ${stars}`,
    '',
    'Q2 — Most confusing or frustrating part:',
    `  ${q2}`,
    '',
    'Q3 — Did the estimate feel accurate? What felt off?',
    `  ${q3}`,
    '',
    'Q4 — One change that would most improve the experience:',
    `  ${q4}`,
    '',
    'Q5 — Anything else:',
    `  ${q5 || '(left blank)'}`,
  ].join('\n');

  ses.send(new SendEmailCommand({
    Source: 'noreply@maidlink.ca',
    Destination: { ToAddresses: ['muni@maidlink.ca'] },
    ...(process.env.SES_CONFIG_SET ? { ConfigurationSetName: process.env.SES_CONFIG_SET } : {}),
    Message: {
      Subject: { Data: `Alpha Feedback — ${overallRating}★ — ${auth.email}` },
      Body: { Text: { Data: emailBody } },
    },
  })).catch(err => console.error('SES alpha feedback notification failed', err));

  return created({ received: true });
});
