import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { VoiceTokenDto } from './voice-token.dto';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(@Inject(VoiceService) private readonly voice: VoiceService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  token(@Body() body: VoiceTokenDto): Promise<{ url: string; token: string; room: string }> {
    return this.voice.issue(body.guestId, body.name, body.office);
  }
}
