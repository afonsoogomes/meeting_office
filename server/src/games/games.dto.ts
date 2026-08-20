import { IsOptional, IsString, Length, Matches } from 'class-validator';

const GUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAME_ID = /^[a-z0-9-]{1,64}$/;
const ROOM_ID = /^[A-Za-z0-9_-]{4,80}$/;
const OFFICE = /^[a-z0-9-]{1,32}$/;

export class GuestIdDto {
  @Matches(GUEST_ID)
  guestId!: string;
}

export class CreateGameSessionDto extends GuestIdDto {
  @IsString()
  @Length(2, 18)
  name!: string;

  @Matches(GAME_ID)
  gameId!: string;

  @IsOptional()
  @Matches(OFFICE)
  officeSlug?: string;
}

export class JoinGameSessionDto extends GuestIdDto {
  @IsString()
  @Length(2, 18)
  name!: string;
}

export class NetplayRoomDto extends GuestIdDto {
  @Matches(ROOM_ID)
  roomId!: string;
}
