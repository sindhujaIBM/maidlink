import type { Tool } from '@aws-sdk/client-bedrock-runtime';

export const AGENT_TOOLS: Tool[] = [
  {
    toolSpec: {
      name:        'request_angle',
      description: 'Ask the user to show a specific area or angle they have not covered yet. Use this when key areas are missing from the current view.',
      inputSchema: {
        json: {
          type:       'object',
          properties: {
            area:        { type: 'string', description: 'Short label for the area, e.g. "stovetop", "shower"' },
            instruction: { type: 'string', description: 'Natural spoken instruction for the user, e.g. "Now tilt down so I can see the burners"' },
          },
          required: ['area', 'instruction'],
        },
      },
    },
  },
  {
    toolSpec: {
      name:        'mark_room_complete',
      description: 'Declare the current room fully assessed. Call this once you have seen enough angles to confidently assess the room.',
      inputSchema: {
        json: {
          type:       'object',
          properties: {
            condition:        { type: 'string', enum: ['pristine', 'average', 'messy', 'very_messy'] },
            estimatedMinutes: { type: 'number', description: 'Base cleaning time in minutes for this room, before type/condition multipliers' },
            observations:     { type: 'string', description: '2-3 sentence summary of what was observed' },
            priorityTasks:    { type: 'array', items: { type: 'string' }, description: 'Top 3-4 tasks needed for this room' },
          },
          required: ['condition', 'estimatedMinutes', 'observations', 'priorityTasks'],
        },
      },
    },
  },
  {
    toolSpec: {
      name:        'generate_estimate',
      description: 'All rooms have been assessed. Generate the final cleaning estimate. Call this only after mark_room_complete has been called for every room.',
      inputSchema: {
        json: {
          type:       'object',
          properties: {
            overallCondition:     { type: 'string', enum: ['pristine', 'average', 'messy', 'very_messy'] },
            conditionAssessment:  { type: 'string', description: '2-3 sentence summary across all rooms' },
            oneCleanerHours:      { type: 'number' },
            twoCleanerHours:      { type: 'number' },
            upgradeRecommendation: {
              type: 'object',
              properties: {
                suggestedType: { type: 'string' },
                reason:        { type: 'string' },
                benefits:      { type: 'array', items: { type: 'string' } },
              },
              required: ['suggestedType', 'reason', 'benefits'],
            },
            generatedChecklist: {
              type:  'array',
              items: {
                type:       'object',
                properties: {
                  room:  { type: 'string' },
                  tasks: {
                    type:  'array',
                    items: {
                      type:       'object',
                      properties: {
                        task:     { type: 'string' },
                        priority: { type: 'string', enum: ['high', 'medium', 'standard'] },
                        aiNote:   { type: 'string' },
                      },
                      required: ['task', 'priority'],
                    },
                  },
                },
                required: ['room', 'tasks'],
              },
            },
          },
          required: ['overallCondition', 'conditionAssessment', 'oneCleanerHours', 'twoCleanerHours', 'generatedChecklist'],
        },
      },
    },
  },
];
