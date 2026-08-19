import { Module } from '@nestjs/common';
import { OfficeModule } from '../office/office.module';
import { PresenceService } from './presence.service';
import { PresenceSocket } from './presence.socket';

@Module({
  imports: [OfficeModule],
  providers: [PresenceService, PresenceSocket],
})
export class PresenceModule {}
