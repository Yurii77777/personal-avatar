import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SessionService } from './session.service';

class AskDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

@ApiTags('sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('ask')
  async ask(@Body() dto: AskDto) {
    return this.sessionService.ask(dto.question, dto.sessionId);
  }
}
