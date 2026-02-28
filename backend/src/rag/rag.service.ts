import { Inject, Injectable, Logger } from '@nestjs/common';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/drizzle.module';
import { knowledgeChunks } from '../db/schema';
import { EmbeddingService } from './embedding.service';
import { SIMILARITY_TOP_K, SIMILARITY_THRESHOLD } from '../constants';

export type RetrievedChunk = {
  id: string;
  content: string;
  documentId: string;
  similarity: number;
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async retrieveRelevantChunks(
    query: string,
    limit = SIMILARITY_TOP_K,
    minSimilarity = SIMILARITY_THRESHOLD,
  ): Promise<RetrievedChunk[]> {
    const queryEmbedding = await this.embeddingService.embed(query);

    const similarity = sql<number>`1 - (${cosineDistance(knowledgeChunks.embedding, queryEmbedding)})`;

    const results = await this.db
      .select({
        id: knowledgeChunks.id,
        content: knowledgeChunks.content,
        documentId: knowledgeChunks.documentId,
        similarity,
      })
      .from(knowledgeChunks)
      .where(gt(similarity, minSimilarity))
      .orderBy(desc(similarity))
      .limit(limit);

    this.logger.debug(
      `RAG search for "${query.slice(0, 50)}": ${results.length} chunks (top: ${results[0]?.similarity?.toFixed(3) ?? 'none'})`,
    );

    return results;
  }
}
