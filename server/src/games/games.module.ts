import { Module, forwardRef } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module';
import { GamesController } from './games.controller';
import { GamesRepository } from './games.repository';
import { GamesService } from './games.service';

@Module({
  imports: [forwardRef(() => PresenceModule)],
  controllers: [GamesController],
  providers: [GamesRepository, GamesService],
  exports: [GamesService],
})
export class GamesModule {}
