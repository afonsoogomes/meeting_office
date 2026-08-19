import { Module } from '@nestjs/common';
import { OfficeController } from './office.controller';
import { OfficeRepository } from './office.repository';
import { OfficeService } from './office.service';

@Module({
  controllers: [OfficeController],
  providers: [OfficeRepository, OfficeService],
  exports: [OfficeService],
})
export class OfficeModule {}
