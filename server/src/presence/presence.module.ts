import { Module, forwardRef } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { OfficeModule } from '../office/office.module';
import { PresenceService } from './presence.service';
import { PresenceSocket } from './presence.socket';

@Module({
  imports: [OfficeModule, forwardRef(() => GamesModule)],
  providers: [PresenceService, PresenceSocket],
  exports: [PresenceService],
})
export class PresenceModule {}
