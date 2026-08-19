import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}
