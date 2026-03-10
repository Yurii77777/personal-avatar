import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { RagModule } from '../rag/rag.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [RagModule, LlmModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
