import { IsString, Length, Matches } from 'class-validator';

export class VoiceTokenDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  guestId!: string;

  @IsString()
  @Length(2, 18)
  name!: string;
}
