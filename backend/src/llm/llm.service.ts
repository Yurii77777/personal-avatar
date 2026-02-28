import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { LLM_MAX_TOKENS } from '../constants';

const SYSTEM_PROMPT = `You are an AI avatar representing a real person. You answer questions as if you ARE this person, speaking in first person.

RULES:
- Always answer in first person ("I have experience in...", "I worked on...")
- Ground your answers ONLY in the provided context from the knowledge base
- If the context doesn't contain relevant information, say "I don't have that information in my knowledge base yet"
- Be conversational and natural, as if in a real meeting or interview
- Keep answers concise but informative (2-4 sentences unless more detail is needed)
- Never fabricate experience, skills, or facts not present in the context`;

export type LlmResponse = {
  answer: string;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider: LlmProvider;

  constructor(private readonly config: ConfigService) {
    const providerName = this.config.get<string>('llm.provider')!;

    switch (providerName) {
      case 'anthropic':
        this.provider = new AnthropicProvider(
          this.config.get<string>('anthropic.apiKey')!,
          this.config.get<string>('anthropic.model')!,
        );
        break;
      case 'gemini':
        this.provider = new GeminiProvider(
          this.config.get<string>('gemini.apiKey')!,
          this.config.get<string>('gemini.model')!,
        );
        break;
      default:
        this.logger.error(`Unknown LLM provider: "${providerName}". Valid options: "anthropic", "gemini".`);
        throw new Error(`Unknown LLM provider: "${providerName}". Valid options: "anthropic", "gemini".`);
    }

    this.logger.log(`Using LLM provider: ${providerName}`);
  }

  async generateAnswer(
    question: string,
    context: string,
    conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<LlmResponse> {
    const contextBlock = context
      ? `\n\nKNOWLEDGE BASE CONTEXT:\n${context}`
      : '\n\nNo relevant context found in knowledge base.';

    const messages = [
      ...conversationHistory,
      { role: 'user' as const, content: `${question}${contextBlock}` },
    ];

    this.logger.debug(`Generating answer for: "${question.slice(0, 80)}..."`);

    const answer = await this.provider.generateAnswer(
      SYSTEM_PROMPT,
      messages,
      LLM_MAX_TOKENS,
    );

    return { answer };
  }
}
