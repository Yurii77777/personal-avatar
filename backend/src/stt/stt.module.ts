import { Module } from '@nestjs/common';
import { SttService } from './stt.service';
import { SttGateway } from './stt.gateway';
import { SessionModule } from '../session/session.module';
import { TtsModule } from '../tts/tts.module';
import { AudioModule } from '../audio/audio.module';

@Module({
  imports: [SessionModule, TtsModule, AudioModule],
  providers: [SttService, SttGateway],
  exports: [SttService],
})
export class SttModule {}
