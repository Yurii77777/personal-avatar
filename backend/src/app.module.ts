import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DrizzleModule } from './db/drizzle.module';
import { HealthController } from './health/health.controller';
import { RagModule } from './rag/rag.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LlmModule } from './llm/llm.module';
import { SessionModule } from './session/session.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: '../.env' }),
    DrizzleModule,
    RagModule,
    KnowledgeModule,
    LlmModule,
    SessionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
