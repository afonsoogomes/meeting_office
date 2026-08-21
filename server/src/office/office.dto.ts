import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { OFFICE_SLUG_RE } from '../../../shared/protocol';

export class CreateOfficeDto {
  @IsString()
  @Length(2, 48)
  name!: string;

  @Matches(OFFICE_SLUG_RE)
  slug!: string;
}

export class UpdateOfficeDto {
  @IsOptional()
  @IsString()
  @Length(2, 48)
  name?: string;

  @IsOptional()
  @Matches(OFFICE_SLUG_RE)
  slug?: string;
}
