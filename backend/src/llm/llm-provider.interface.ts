export interface LlmProvider {
  generateAnswer(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens: number,
  ): Promise<string>;
}
