import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider } from './llm-provider.interface';
import { EXTERNAL_API_TIMEOUT_MS } from '../constants';

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateAnswer(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_API_TIMEOUT_MS);

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
        },
        { signal: controller.signal },
      );

      return response.content[0].type === 'text' ? response.content[0].text : '';
    } finally {
      clearTimeout(timeout);
    }
  }
}
