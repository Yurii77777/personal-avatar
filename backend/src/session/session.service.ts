import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/drizzle.module';
import { sessions, sessionMessages } from '../db/schema';
import { RagService } from '../rag/rag.service';
import { LlmService } from '../llm/llm.service';
import { PREVIEW_LENGTH } from '../constants';

@Injectable()
export class SessionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly ragService: RagService,
    private readonly llmService: LlmService,
  ) {}

  async ask(question: string, existingSessionId?: string) {
    // Get or create session
    let sessionId: string;
    if (existingSessionId) {
      sessionId = existingSessionId;
    } else {
      const [session] = await this.db
        .insert(sessions)
        .values({})
        .returning();
      sessionId = session.id;
    }

    // Load conversation history
    const history = await this.db
      .select({ role: sessionMessages.role, content: sessionMessages.content })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(sessionMessages.createdAt);

    // Retrieve relevant chunks
    const chunks = await this.ragService.retrieveRelevantChunks(question);
    const context = chunks.map((c) => c.content).join('\n\n---\n\n');

    // Generate answer
    const { answer } = await this.llmService.generateAnswer(
      question,
      context,
      history,
    );

    // Persist messages
    await this.db.insert(sessionMessages).values([
      { sessionId, role: 'user', content: question },
      { sessionId, role: 'assistant', content: answer },
    ]);

    return {
      sessionId,
      answer,
      sources: chunks.map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        similarity: c.similarity,
        preview: c.content.slice(0, PREVIEW_LENGTH),
      })),
    };
  }
}
