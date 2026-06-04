import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import type { Message } from '@aws-sdk/client-bedrock-runtime';
import { getPool } from '@maidlink/shared';
import { getSession, updateSession, type RoomSummary, type LiveSession } from '../lib/dynamo';
import { pushToConnection } from '../lib/apigw';
import { streamConverse, buildToolResultMessage } from '../lib/bedrock';
import { synthesizeSpeech } from '../lib/polly';

interface StartAction {
  action:      'start';
  rooms:       string[];
  cleaningType: string;
  bedrooms:    number;
  bathrooms:   number;
  sqftRange:   string;
}

interface FrameAction {
  action:    'frame';
  room:      string;
  data:      string;  // base64 JPEG
  mediaType: string;
}

interface SkipRoomAction {
  action: 'skip_room';
}

type ClientMessage = StartAction | FrameAction | SkipRoomAction;

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const endpoint     = process.env.APIGW_ENDPOINT
    ?? `https://${event.requestContext.apiId}.execute-api.ca-west-1.amazonaws.com/${event.requestContext.stage}`;

  const push = (data: unknown) => pushToConnection(connectionId, endpoint, data);

  let body: ClientMessage;
  try {
    body = JSON.parse(event.body ?? '{}') as ClientMessage;
  } catch {
    await push({ type: 'error', message: 'Invalid JSON' });
    return { statusCode: 200, body: 'ok' };
  }

  const session = await getSession(connectionId);
  if (!session) {
    await push({ type: 'error', message: 'Session not found — please reconnect' });
    return { statusCode: 200, body: 'ok' };
  }

  if (body.action === 'start') {
    await handleStart(body, session, connectionId, push);
  } else if (body.action === 'frame') {
    await handleFrame(body, session, connectionId, push);
  } else if (body.action === 'skip_room') {
    await handleSkipRoom(session, connectionId, push);
  }

  return { statusCode: 200, body: 'ok' };
};

// ── Start ─────────────────────────────────────────────────────────────────────

async function handleStart(
  msg: StartAction,
  session: LiveSession,
  connectionId: string,
  push: (d: unknown) => Promise<void>,
) {
  await updateSession(connectionId, {
    rooms:        msg.rooms,
    cleaningType: msg.cleaningType,
    bedrooms:     msg.bedrooms,
    bathrooms:    msg.bathrooms,
    sqftRange:    msg.sqftRange,
  });

  const firstRoom   = msg.rooms[0] ?? 'the first room';
  const welcomeText = `Hi! I'm your AI cleaning estimator. Let's walk through your home together. Start with your ${firstRoom} — hold your phone steady and show me an overview of the room.`;

  await push({ type: 'guidance_chunk', text: welcomeText });
  await push({ type: 'guidance_end' });

  const audioBase64 = await synthesizeSpeech(welcomeText).catch(() => null);
  if (audioBase64) await push({ type: 'audio', data: audioBase64, mimeType: 'audio/mpeg' });
}

// ── Frame ─────────────────────────────────────────────────────────────────────

async function handleFrame(
  msg: FrameAction,
  session: LiveSession,
  connectionId: string,
  push: (d: unknown) => Promise<void>,
) {
  // Append frame as image content block to conversation history
  const frameMessage: Message = {
    role:    'user',
    content: [
      { text: `Room: ${msg.room}` },
      {
        image: {
          format: (msg.mediaType.replace('image/', '') || 'jpeg') as 'jpeg' | 'png' | 'gif' | 'webp',
          source: { bytes: Buffer.from(msg.data, 'base64') },
        },
      },
    ],
  };

  const updatedHistory = [...session.conversationHistory, frameMessage] as Message[];
  let accumulatedText  = '';
  let toolResult: { name: string; summaryForHistory: string } | null = null;

  for await (const event of streamConverse(updatedHistory)) {
    if (event.type === 'text_chunk' && event.text) {
      accumulatedText += event.text;
      await push({ type: 'guidance_chunk', text: event.text });
    }

    if (event.type === 'tool_use' && event.tool) {
      await push({ type: 'guidance_end' });
      await handleToolUse(event.tool.name, event.tool.input, session, connectionId, push);
      toolResult = { name: event.tool.name, summaryForHistory: JSON.stringify(event.tool.input) };
    }

    if (event.type === 'error') {
      await push({ type: 'error', message: event.error });
    }
  }

  if (accumulatedText) {
    await push({ type: 'guidance_end' });
    // No per-frame Polly — frame guidance text is shown in the overlay.
    // Voice fires only for tool-use events (angle_request, room_complete) and lifecycle messages.
  }

  // Persist updated conversation history (trim to last 20 messages to stay within token limits)
  const assistantMessage: Message = {
    role:    'assistant',
    content: accumulatedText ? [{ text: accumulatedText }] : [{ text: '(tool use)' }],
  };
  const newHistory = [...updatedHistory, assistantMessage];
  const trimmed    = newHistory.length > 20 ? newHistory.slice(-20) : newHistory;

  await updateSession(connectionId, {
    conversationHistory: trimmed as LiveSession['conversationHistory'],
    frameCount:          session.frameCount + 1,
  });
}

// ── Skip room ─────────────────────────────────────────────────────────────────

async function handleSkipRoom(
  session: LiveSession,
  connectionId: string,
  push: (d: unknown) => Promise<void>,
) {
  const skippedRoom = session.rooms[session.currentRoomIndex];
  if (!skippedRoom) return;

  const summary: RoomSummary = {
    room:             skippedRoom,
    condition:        'average',
    estimatedMinutes: 25,
    observations:     'Room skipped by user',
    priorityTasks:    ['General cleaning'],
  };

  const updatedSummaries = [...session.roomSummaries, summary];
  const nextIndex        = session.currentRoomIndex + 1;
  const nextRoom         = session.rooms[nextIndex];

  await updateSession(connectionId, {
    roomSummaries:    updatedSummaries,
    currentRoomIndex: nextIndex,
  });

  const msg = nextRoom
    ? `Got it — skipped ${skippedRoom}. Let's move to the ${nextRoom}. Show me an overview when you're ready.`
    : `Skipped ${skippedRoom}. That's all rooms! Give me a moment to put together your estimate.`;

  await push({ type: 'room_complete', room: skippedRoom, summary });
  await push({ type: 'guidance_chunk', text: msg });
  await push({ type: 'guidance_end' });
  const audio = await synthesizeSpeech(msg).catch(() => null);
  if (audio) await push({ type: 'audio', data: audio, mimeType: 'audio/mpeg' });
}

// ── Tool use dispatcher ───────────────────────────────────────────────────────

async function handleToolUse(
  toolName: string,
  input: Record<string, unknown>,
  session: LiveSession,
  connectionId: string,
  push: (d: unknown) => Promise<void>,
) {
  if (toolName === 'request_angle') {
    const instruction = input.instruction as string;
    await push({ type: 'angle_request', area: input.area, instruction });
    const audio = await synthesizeSpeech(instruction).catch(() => null);
    if (audio) await push({ type: 'audio', data: audio, mimeType: 'audio/mpeg' });
  }

  if (toolName === 'mark_room_complete') {
    const summary: RoomSummary = {
      room:             session.rooms[session.currentRoomIndex] ?? 'Unknown',
      condition:        input.condition as string,
      estimatedMinutes: input.estimatedMinutes as number,
      observations:     input.observations as string,
      priorityTasks:    input.priorityTasks as string[],
    };
    const updatedSummaries = [...session.roomSummaries, summary];
    const nextIndex        = session.currentRoomIndex + 1;
    const nextRoom         = session.rooms[nextIndex];

    await updateSession(connectionId, {
      roomSummaries:    updatedSummaries,
      currentRoomIndex: nextIndex,
    });

    const msg = nextRoom
      ? `Great — ${summary.room} is done! Now let's move to the ${nextRoom}. Show me an overview when you're ready.`
      : `Perfect — that's all the rooms! Give me a moment to put together your estimate.`;

    await push({ type: 'room_complete', room: summary.room, summary });
    await push({ type: 'guidance_chunk', text: msg });
    await push({ type: 'guidance_end' });
    const audio = await synthesizeSpeech(msg).catch(() => null);
    if (audio) await push({ type: 'audio', data: audio, mimeType: 'audio/mpeg' });
  }

  if (toolName === 'generate_estimate') {
    await persistAndEmitEstimate(input, session, connectionId, push);
  }
}

// ── Final estimate ────────────────────────────────────────────────────────────

async function persistAndEmitEstimate(
  input: Record<string, unknown>,
  session: LiveSession,
  connectionId: string,
  push: (d: unknown) => Promise<void>,
) {
  const result = {
    overallCondition:      input.overallCondition,
    matchesSelfReport:     true,
    conditionAssessment:   input.conditionAssessment,
    roomBreakdown:         session.roomSummaries.map(r => ({
      room:             r.room,
      condition:        r.condition,
      estimatedMinutes: r.estimatedMinutes,
      notes:            r.observations,
      priorityTasks:    r.priorityTasks,
    })),
    oneCleanerHours:       input.oneCleanerHours,
    twoCleanerHours:       input.twoCleanerHours,
    upgradeRecommendation: input.upgradeRecommendation ?? undefined,
    generatedChecklist:    input.generatedChecklist,
  };

  const homeDetails = {
    bedrooms:     session.bedrooms,
    bathrooms:    session.bathrooms,
    sqftRange:    session.sqftRange,
    condition:    (input.overallCondition as string) ?? 'average',
    extras:       [],
    cleaningType: session.cleaningType,
    source:       'live',
    rooms:        session.rooms.map(r => ({ room: r, photoCount: 0 })),
  };

  const pool = getPool();
  await pool.query(
    `INSERT INTO estimator_analyses (user_id, home_details, photo_s3_keys, result, source)
     VALUES ($1, $2, $3, $4, 'live')`,
    [session.userId, homeDetails, [], result],
  );

  await push({ type: 'estimate_ready', result });

  const doneText = `Your estimate is ready! Here's a summary of what I found.`;
  await push({ type: 'guidance_chunk', text: doneText });
  await push({ type: 'guidance_end' });
  const audio = await synthesizeSpeech(doneText).catch(() => null);
  if (audio) await push({ type: 'audio', data: audio, mimeType: 'audio/mpeg' });
}
