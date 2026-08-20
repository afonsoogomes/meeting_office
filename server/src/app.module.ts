import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { GamesModule } from './games/games.module';
import { OfficeModule } from './office/office.module';
import { PresenceModule } from './presence/presence.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [OfficeModule, PresenceModule, VoiceModule, GamesModule],
  controllers: [AppController],
})
export class AppModule {}
