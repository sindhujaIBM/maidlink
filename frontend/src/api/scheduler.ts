import { usersClient } from './client';

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

export interface ChatResponse {
  reply:  string;
  intent: BookingIntent | null;
}

export async function sendSchedulerMessage(messages: ChatMessage[]): Promise<ChatResponse> {
  const res = await usersClient.post('/users/me/scheduler/chat', { messages });
  return res.data.data as ChatResponse;
}
