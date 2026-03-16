/**
 * POST /users/me/scheduler/chat
 *
 * Stateless AI chat for booking intent collection.
 * Sends conversation history to Nova Lite (Bedrock).
 * When the AI has collected date, time, cleaningType, and postalCode
 * it appends BOOKING_INTENT:{...} to its reply; the backend parses
 * and returns it as a structured field.
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { withAuth, ok, ValidationError } from '@maidlink/shared';

const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });
const NOVA_LITE_MODEL = 'us.amazon.nova-lite-v1:0';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BookingIntent {
  date:         string;  // YYYY-MM-DD
  time:         string;  // HH:MM
  cleaningType: string;
  postalCode:   string;
}

function buildSystemPrompt(): string {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Edmonton',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return `You are a friendly booking assistant for MaidLink, a professional cleaning service in Calgary, Canada.

Your job is to help users book a cleaning by collecting these 4 details:
1. Date — when they need the cleaning (resolve relative dates like "Friday" or "next Monday" to YYYY-MM-DD)
2. Start time — what time to start (convert to 24-hour HH:MM format)
3. Cleaning type — one of: Standard Cleaning, Deep Cleaning, Move-Out/Move-In Cleaning
4. Postal code FSA — the first 3 characters of their Calgary postal code (e.g. T2P, T3A, T1Y)

Guidelines:
- Ask one or two questions at a time. Keep responses short and friendly (1-3 sentences max).
- If the user gives vague info ("morning", "afternoon") ask for a specific time.
- For cleaning type, briefly explain the difference if they seem unsure:
  Standard = regular maintenance clean; Deep = thorough scrub of everything; Move-Out = full empty-home clean.
- Always confirm what you understood before showing results.

When you have collected ALL 4 details, end your message with this exact format on its own line:
BOOKING_INTENT:{"date":"YYYY-MM-DD","time":"HH:MM","cleaningType":"Standard Cleaning","postalCode":"T2P"}

Today's date in Calgary is: ${today}`;
}

async function invokeNovaLite(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const payload = {
    system: [{ text: systemPrompt }],
    messages: messages.map(m => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: { max_new_tokens: 400, temperature: 0.7 },
  };

  const res = await bedrock.send(new InvokeModelCommand({
    modelId:     NOVA_LITE_MODEL,
    contentType: 'application/json',
    accept:      'application/json',
    body:        Buffer.from(JSON.stringify(payload)),
  }));

  const decoded = JSON.parse(Buffer.from(res.body).toString());
  return decoded.output?.message?.content?.[0]?.text ?? '';
}

export const handler = withAuth(async (event: APIGatewayProxyEvent) => {
  if (!event.body) throw new ValidationError('Request body is required');

  const { messages } = JSON.parse(event.body) as { messages: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages array is required');
  }
  if (messages.length > 30) {
    throw new ValidationError('Conversation too long');
  }

  const systemPrompt = buildSystemPrompt();

  // Bedrock requires conversations to start with a user message — drop any leading assistant messages
  const modelMessages = messages[0]?.role === 'assistant' ? messages.slice(1) : messages;
  if (modelMessages.length === 0) throw new ValidationError('No user message found');

  const rawReply = await invokeNovaLite(systemPrompt, modelMessages);

  // Extract BOOKING_INTENT if present
  let intent: BookingIntent | null = null;
  let reply = rawReply;

  const intentMatch = rawReply.match(/BOOKING_INTENT:(\{[^\n]+\})/);
  if (intentMatch) {
    try {
      intent = JSON.parse(intentMatch[1]) as BookingIntent;
      // Strip the BOOKING_INTENT line from the visible reply
      reply = rawReply.replace(/\n?BOOKING_INTENT:\{[^\n]+\}/, '').trim();
    } catch {
      // Malformed JSON — ignore, show full reply
    }
  }

  return ok({ reply, intent });
});
