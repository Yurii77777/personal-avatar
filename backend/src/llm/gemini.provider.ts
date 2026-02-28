import { GoogleGenAI } from '@google/genai';
import { LlmProvider } from './llm-provider.interface';
import { EXTERNAL_API_TIMEOUT_MS } from '../constants';

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateAnswer(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens: number,
  ): Promise<string> {
    const contents = messages.map((msg) => ({
      role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.content }],
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          maxOutputTokens: maxTokens,
          systemInstruction: systemPrompt,
          abortSignal: controller.signal,
        },
      });

      return response.text ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }
}
