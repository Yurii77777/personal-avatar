import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { DRIZZLE } from '../db/drizzle.module';
import { knowledgeDocuments, knowledgeChunks } from '../db/schema';
import { EmbeddingService } from '../rag/embedding.service';
import { CHUNK_SIZE, CHUNK_OVERLAP, INSERT_BATCH_SIZE } from '../constants';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly embeddingService: EmbeddingService,
  ) {}

  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ['\n\n', '\n', '. ', '? ', '! ', ' ', ''],
  });

  async ingestDocument(
    file: Express.Multer.File,
  ): Promise<{ documentId: string; chunksCreated: number }> {
    const text = await this.parseFile(file);
    const chunks = await this.splitter.splitText(text);

    this.logger.log(
      `Parsed "${file.originalname}": ${text.length} chars → ${chunks.length} chunks`,
    );

    const embeddings = await this.embeddingService.embedBatch(chunks);

    return this.db.transaction(async (tx: any) => {
      const [doc] = await tx
        .insert(knowledgeDocuments)
        .values({
          filename: file.originalname,
          mimeType: file.mimetype,
          chunksCount: chunks.length,
        })
        .returning();

      const chunkRows = chunks.map((content, i) => ({
        documentId: doc.id,
        content,
        chunkIndex: i,
        embedding: embeddings[i],
      }));

      for (let i = 0; i < chunkRows.length; i += INSERT_BATCH_SIZE) {
        await tx
          .insert(knowledgeChunks)
          .values(chunkRows.slice(i, i + INSERT_BATCH_SIZE));
      }

      return { documentId: doc.id, chunksCreated: chunks.length };
    });
  }

  async listDocuments(limit = 50, offset = 0) {
    return this.db
      .select()
      .from(knowledgeDocuments)
      .orderBy(knowledgeDocuments.createdAt)
      .limit(limit)
      .offset(offset);
  }

  async deleteDocument(id: string) {
    const [deleted] = await this.db
      .delete(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .returning();
    return deleted;
  }

  private async parseFile(file: Express.Multer.File): Promise<string> {
    const mime = file.mimetype;
    const name = file.originalname.toLowerCase();

    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const result = await pdfParse(file.buffer);
        return result.text;
      } catch (error) {
        throw new BadRequestException(`Failed to parse PDF: ${error.message}`);
      }
    }

    if (
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
      } catch (error) {
        throw new BadRequestException(`Failed to parse DOCX: ${error.message}`);
      }
    }

    if (mime === 'text/markdown' || name.endsWith('.md')) {
      return file.buffer.toString('utf-8');
    }

    if (mime === 'text/plain' || name.endsWith('.txt')) {
      return file.buffer.toString('utf-8');
    }

    throw new BadRequestException(`Unsupported file type: ${mime}`);
  }

}
