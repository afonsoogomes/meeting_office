import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { parseOfficeSlug } from '../../../shared/office';
import { CreateOfficeDto, UpdateOfficeDto } from './office.dto';
import { OfficeService } from './office.service';

@Controller('offices')
export class OfficeController {
  constructor(@Inject(OfficeService) private readonly offices: OfficeService) {}

  @Get()
  list() {
    return { offices: this.offices.list() };
  }

  @Post()
  create(@Body() body: CreateOfficeDto) {
    return this.offices.create(body);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    const clean = parseOfficeSlug(slug);
    if (!clean) throw new NotFoundException();
    const snapshot = this.offices.snapshot(clean);
    if (!snapshot) throw new NotFoundException();
    return snapshot;
  }

  @Patch(':slug')
  update(@Param('slug') slug: string, @Body() body: UpdateOfficeDto) {
    const clean = parseOfficeSlug(slug);
    if (!clean) throw new NotFoundException();
    return this.offices.rename(clean, body);
  }
}
