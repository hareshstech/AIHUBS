import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseJsonResponse<T>(text: string | undefined, fallback: T): T {
  const cleaned = (text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!cleaned) return fallback;
  return JSON.parse(cleaned) as T;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('GEMINI_API_KEY') || raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 750));
    return await fn();
  }
}

function normalizeAiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  console.error('Gemini AI error:', raw);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 503, message: 'AI service is not configured yet. Please set GEMINI_API_KEY in Settings > Secrets.' };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    return { status: 502, message: 'Gemini API key appears invalid. Please verify GEMINI_API_KEY in Settings > Secrets.' };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return { status: 502, message: 'Gemini API permission denied. Please check your key configuration.' };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return { status: 429, message: 'AI quota reached temporarily. Please wait a moment and try again.' };
  }
  return { status: 502, message: `AI request failed: ${raw}` };
}

export interface GenerateDescriptionInput {
  title: string;
  categoryName: string;
  venue: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  roughNotes: string;
}

export async function generateEventDescription(input: GenerateDescriptionInput): Promise<{
  description: string;
  additionalInstructions: string;
}> {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Create a compelling, clear, well-structured campus event description and attendee instructions based on these organiser notes:
Title: ${input.title}
Category: ${input.categoryName || 'Campus Event'}
Venue: ${input.venue || 'Campus Venue'}
Date & Time: ${input.eventDate || 'Upcoming'} (${input.startTime || 'TBD'} - ${input.endTime || 'TBD'})
Organiser Notes: ${input.roughNotes || 'Standard campus session.'}

Keep the description concise (2-3 short paragraphs, plain text without markdown hashtags), accurate to the details provided, and engaging for university students. Do not invent prizes, sponsors, or unmentioned perks.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: 'You write crisp, practical university campus event listings. Never invent unstated facts, sponsors, or contact details.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: 'Clean 2-3 paragraph event description suitable for a campus event page.',
            },
            additionalInstructions: {
              type: Type.STRING,
              description: '1-2 practical sentences of attendee instructions (what to bring, arrival time, etc.).',
            },
          },
          required: ['description', 'additionalInstructions'],
        },
      },
    });

    const parsed = parseJsonResponse<{ description?: string; additionalInstructions?: string }>(response.text, {});
    return {
      description: String(parsed.description || '').trim(),
      additionalInstructions: String(parsed.additionalInstructions || '').trim(),
    };
  } catch (err) {
    throw normalizeAiError(err);
  }
}

export async function suggestEventCategory(
  title: string,
  description: string,
  categories: Array<{ id: string; name: string; description: string }>
): Promise<{ categoryId: string; categoryName: string; reason: string }> {
  try {
    const ai = getAiClient();
    const catList = categories.map((c) => `- id: "${c.id}", name: "${c.name}" (${c.description})`).join('\n');
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Select the single best category from the list below for this campus event.
Event Title: ${title}
Event Description: ${description}

Available Categories:
${catList}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: 'Choose strictly from the provided category IDs. Return concise reasoning.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categoryId: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ['categoryId', 'reason'],
        },
      },
    });

    const parsed = parseJsonResponse<{ categoryId?: string; reason?: string }>(response.text, {});
    const matched = categories.find((c) => c.id === parsed.categoryId) || categories[0];
    return {
      categoryId: matched.id,
      categoryName: matched.name,
      reason: String(parsed.reason || `Matches ${matched.name} focus.`),
    };
  } catch (err) {
    throw normalizeAiError(err);
  }
}

export async function summarizeEventDetails(event: {
  title: string;
  categoryName: string;
  description: string;
  additionalInstructions: string;
  venue: string;
  eventDate: string;
  startTime: string;
}): Promise<{ tldr: string; whoShouldAttend: string; takeaways: string[] }> {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Summarize this campus event for busy students scanning listings:
Title: ${event.title}
Category: ${event.categoryName}
When: ${event.eventDate} at ${event.startTime}
Where: ${event.venue}
Description: ${event.description}
Instructions: ${event.additionalInstructions}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: 'Produce an accurate, ultra-scannable summary strictly from the provided event details.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tldr: { type: Type.STRING, description: 'One crisp sentence summarizing the event.' },
            whoShouldAttend: { type: Type.STRING, description: 'Short phrase describing target student audience.' },
            takeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exactly 3 short bullet takeaways.',
            },
          },
          required: ['tldr', 'whoShouldAttend', 'takeaways'],
        },
      },
    });

    const parsed = parseJsonResponse<{ tldr?: string; whoShouldAttend?: string; takeaways?: unknown[] }>(response.text, {});
    return {
      tldr: String(parsed.tldr || '').trim(),
      whoShouldAttend: String(parsed.whoShouldAttend || '').trim(),
      takeaways: Array.isArray(parsed.takeaways)
        ? parsed.takeaways.slice(0, 4).map((t: unknown) => String(t))
        : [],
    };
  } catch (err) {
    throw normalizeAiError(err);
  }
}

export async function recommendCampusEvents(params: {
  studentInterests: string[];
  savedTitles: string[];
  registeredTitles: string[];
  candidateEvents: Array<{
    id: string;
    title: string;
    categoryName: string;
    eventDate: string;
    venue: string;
    seatsRemaining: number;
    registrationCount: number;
    description: string;
  }>;
}): Promise<Array<{ eventId: string; reason: string }>> {
  try {
    if (params.candidateEvents.length === 0) return [];
    const ai = getAiClient();
    const catalogText = params.candidateEvents
      .map(
        (e) =>
          `ID=${e.id} | Title="${e.title}" | Category=${e.categoryName} | Date=${e.eventDate} | Venue=${e.venue} | Registered=${e.registrationCount} | SeatsLeft=${e.seatsRemaining} | Summary=${e.description.slice(0, 180)}`
      )
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Recommend up to 3 upcoming campus events for this student from the catalog below.
Student Interests: ${params.studentInterests.join(', ') || 'General campus discovery'}
Previously Saved Events: ${params.savedTitles.join(', ') || 'None'}
Already Registered Events (prefer recommending new ones): ${params.registeredTitles.join(', ') || 'None'}

Available Events Catalog:
${catalogText}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'Return strictly valid event IDs from the provided catalog. Give a specific 1-sentence personalized reason referencing the student interests or event details.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  eventId: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['eventId', 'reason'],
              },
            },
          },
          required: ['recommendations'],
        },
      },
    });

    const parsed = parseJsonResponse<{ recommendations?: Array<{ eventId?: string; reason?: string }> }>(
      response.text,
      {}
    );
    const validIds = new Set(params.candidateEvents.map((e) => e.id));
    const list = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
    return list
      .filter((r): r is { eventId: string; reason: string } => Boolean(r.eventId && validIds.has(r.eventId)))
      .slice(0, 3)
      .map((r) => ({
        eventId: r.eventId,
        reason: String(r.reason || 'Matches your campus activity profile.'),
      }));
  } catch (err) {
    throw normalizeAiError(err);
  }
}

export async function askCampusAssistant(params: {
  question: string;
  todayDate: string;
  userInterests: string[];
  eventsSnapshot: Array<{
    id: string;
    title: string;
    categoryName: string;
    organiserClub: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    registrationDeadline: string;
    venue: string;
    seatsRemaining: number;
    capacity: number;
    isPast: boolean;
    isDeadlinePassed: boolean;
    description: string;
  }>;
}): Promise<{ answer: string; citedEventIds: string[] }> {
  try {
    const ai = getAiClient();
    const snapshotLines = params.eventsSnapshot
      .map(
        (e) =>
          `[${e.id}] "${e.title}" | Cat: ${e.categoryName} | Org: ${e.organiserClub} | Date: ${e.eventDate} ${e.startTime}-${e.endTime} | Venue: ${e.venue} | Deadline: ${e.registrationDeadline} (${e.isDeadlinePassed ? 'CLOSED' : 'OPEN'}) | SeatsLeft: ${e.seatsRemaining}/${e.capacity} | Past: ${e.isPast ? 'YES' : 'NO'} | Desc: ${e.description.slice(0, 220)}`
      )
      .join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Today's date on campus is ${params.todayDate}.
Student Interests: ${params.userInterests.join(', ') || 'Not specified'}
Student Question: ${params.question}

Published Campus Events Data:
${snapshotLines || 'No published events are currently available.'}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are the Quadline Campus Events Assistant. Answer ONLY using the Provided Published Campus Events Data. Cite exact dates, times, venues, registration deadlines, and remaining seats. If no matching event exists in the data, explicitly say so and never invent events or details. Include the IDs of referenced events in citedEventIds.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description: 'Helpful, concise, grounded answer in plain readable prose.',
              },
              citedEventIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of event IDs referenced in the answer.',
              },
            },
            required: ['answer', 'citedEventIds'],
          },
        },
      })
    );

    const parsed = parseJsonResponse<{ answer?: string; citedEventIds?: unknown[] }>(response.text, {});
    const validIds = new Set(params.eventsSnapshot.map((e) => e.id));
    const cited = Array.isArray(parsed.citedEventIds)
      ? parsed.citedEventIds.filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id))
      : [];

    return {
      answer: String(parsed.answer || 'I could not find an answer from the current campus schedule.'),
      citedEventIds: Array.from(new Set(cited)),
    };
  } catch (err) {
    throw normalizeAiError(err);
  }
}
