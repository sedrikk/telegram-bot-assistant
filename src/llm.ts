import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('WARNING: GEMINI_API_KEY is not defined in the environment variables.');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export interface ClassificationResult {
  category: 'reminder' | 'thought' | 'project_update' | 'general';
  title: string;
  tags: string[];
  isReminder: boolean;
  extractedReminderText?: string;
  projectName?: string;
}

/**
 * Helper to call Gemini with a fallback from 2.5-flash to 1.5-flash if the model is busy (503).
 */
async function generateContentWithFallback(params: {
  contents: string;
  config?: any;
}): Promise<any> {
  try {
    return await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      ...params
    });
  } catch (error: any) {
    console.warn(`[Gemini] gemini-2.5-flash failed or busy. Falling back to gemini-1.5-flash. Error: ${error.message || error}`);
    return await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      ...params
    });
  }
}

/**
 * Classifies an incoming message using Gemini's structured JSON output.
 */
export async function classifyMessage(content: string): Promise<ClassificationResult> {
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const prompt = `Analyze the following message sent to a personal assistant bot.
Categorize it, extract tags, detect if it requests a reminder, and suggest a title.

Message:
"""
${content}
"""`;

  try {
    const response = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction: 'You are a highly efficient assistant metadata parser. Extract the user\'s intent, classify, tag, and detect reminders accurately.',
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['reminder', 'thought', 'project_update', 'general'],
              description: 'The primary category. Use "reminder" if the user wants to be reminded of something, "project_update" if they mention updating or starting a specific project, "thought" for general ideas/thoughts, and "general" for other chats.'
            },
            title: {
              type: 'string',
              description: 'A 3-6 word summary title.'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '2-4 lowercase tag keywords.'
            },
            isReminder: {
              type: 'boolean',
              description: 'Set to true if this message is asking to schedule a reminder or task alert at a specific or relative time.'
            },
            extractedReminderText: {
              type: 'string',
              description: 'If isReminder is true, clean up the reminder message (e.g., from "remind me to check the oven in 5 mins" extract "Check the oven").'
            },
            projectName: {
              type: 'string',
              description: 'If category is "project_update" or it mentions a project, extract the project name.'
            }
          },
          required: ['category', 'title', 'tags', 'isReminder']
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Received empty response from Gemini.');
    }

    return JSON.parse(text) as ClassificationResult;
  } catch (error) {
    console.error('Error in Gemini classification:', error);
    return {
      category: content.toLowerCase().includes('remind') ? 'reminder' : 'thought',
      title: content.split('\n')[0].substring(0, 30) + '...',
      tags: ['fallback'],
      isReminder: content.toLowerCase().includes('remind')
    };
  }
}

/**
 * Generates analytical feedback and suggestions for thoughts/ideas or projects.
 */
export async function generateFeedback(
  content: string,
  category: string,
  existingContext?: string
): Promise<string> {
  if (!apiKey) {
    return 'Gemini API key is not configured. Stored thought/project without analytical feedback.';
  }

  let prompt = `You are Antigravity, a brilliant personal strategist and critical thinking assistant. 
Analyze the following user's entry (Category: ${category}) and provide:
1. A brief validation / constructive critique of the idea or update.
2. 2-3 specific, actionable next steps.
3. Suggest any interesting angles or potential pitfalls they might have missed.

Keep your response professional, engaging, structured, and under 250 words. Use bullet points for readability.

User Entry:
"""
${content}
"""`;

  if (existingContext) {
    prompt += `\n\nHere is some context about related thoughts or projects previously recorded:
"""
${existingContext}
"""
Please highlight any connections or synergies between this new entry and the existing context.`;
  }

  try {
    const response = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction: 'You are Antigravity, a proactive personal counselor and project planner. Provide critical analysis and connections to existing user ideas.'
      }
    });

    return response.text || 'No feedback generated.';
  } catch (error) {
    console.error('Error generating feedback:', error);
    return 'Failed to generate feedback due to API error. Thought saved successfully.';
  }
}

/**
 * Summarizes forwarded channel messages or external articles.
 */
export async function summarizeForwarded(
  content: string,
  sourceInfo: string
): Promise<string> {
  if (!apiKey) {
    return 'Gemini API key is not configured. Cannot summarize forwarded content.';
  }

  const prompt = `The user forwarded a message from a Telegram channel or chat: "${sourceInfo}".
Please:
1. Provide a concise 2-3 sentence executive summary of the content.
2. Extract the key takeaways (bullet points).
3. Suggest how this information might be useful for projects or personal knowledge.

Keep it very structured and concise.

Forwarded Content:
"""
${content}
"""`;

  try {
    const response = await generateContentWithFallback({
      contents: prompt,
      config: {
        systemInstruction: 'You are a knowledge manager. Summarize forwarded articles/messages concisely, focusing on utility and actionability.'
      }
    });

    return response.text || 'No summary generated.';
  } catch (error) {
    console.error('Error summarizing forwarded message:', error);
    return 'Failed to summarize forwarded message due to API error.';
  }
}
