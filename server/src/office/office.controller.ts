import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { parseOfficeSlug } from '../../../shared/office';
import { OfficeService } from './office.service';

@Controller('offices')
export class OfficeController {
  constructor(@Inject(OfficeService) private readonly offices: OfficeService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    const clean = parseOfficeSlug(slug);
    if (!clean) throw new NotFoundException();
    const snapshot = this.offices.snapshot(clean);
    if (!snapshot) throw new NotFoundException();
    return snapshot;
  }
}
