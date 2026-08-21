import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { parseOfficeSlug } from '../../../shared/office';
import { DEFAULT_OFFICE_SLUG } from '../../../shared/protocol';
import type { EmulatorSessionConfig, GameCatalogItem, GameSessionView } from '../../../shared/game-session';
import { CreateGameSessionDto, GuestIdDto, JoinGameSessionDto, NetplayRoomDto } from './games.dto';
import { GamesService, type GameResult } from './games.service';

@Controller('games')
export class GamesController {
  constructor(@Inject(GamesService) private readonly games: GamesService) {}

  @Get()
  catalog(): GameCatalogItem[] {
    return this.games.listCatalog();
  }

  @Get('sessions')
  list(@Query('office') office?: string): { sessions: GameSessionView[] } {
    const slug = parseOfficeSlug(office) ?? DEFAULT_OFFICE_SLUG;
    return { sessions: this.games.list(slug) };
  }

  @Get('sessions/current')
  current(@Query('office') office?: string): { session: GameSessionView | null; sessions: GameSessionView[] } {
    const slug = parseOfficeSlug(office) ?? DEFAULT_OFFICE_SLUG;
    const sessions = this.games.list(slug);
    return { session: sessions[0] ?? null, sessions };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  create(@Body() body: CreateGameSessionDto): GameSessionView {
    return unwrap(this.games.create(body));
  }

  @Post('sessions/:id/join')
  @HttpCode(HttpStatus.OK)
  join(@Param('id') id: string, @Body() body: JoinGameSessionDto): GameSessionView {
    return unwrap(this.games.join({ sessionId: id, guestId: body.guestId, name: body.name }));
  }

  @Post('sessions/:id/watch')
  @HttpCode(HttpStatus.OK)
  watch(@Param('id') id: string, @Body() body: JoinGameSessionDto): GameSessionView {
    return unwrap(this.games.watch({ sessionId: id, guestId: body.guestId, name: body.name }));
  }

  @Post('sessions/:id/ready')
  @HttpCode(HttpStatus.OK)
  ready(@Param('id') id: string, @Body() body: GuestIdDto): GameSessionView {
    return unwrap(this.games.ready({ sessionId: id, guestId: body.guestId }));
  }

  @Post('sessions/:id/start')
  @HttpCode(HttpStatus.OK)
  start(@Param('id') id: string, @Body() body: GuestIdDto): GameSessionView {
    return unwrap(this.games.start({ sessionId: id, guestId: body.guestId }));
  }

  @Post('sessions/:id/netplay')
  @HttpCode(HttpStatus.OK)
  netplay(@Param('id') id: string, @Body() body: NetplayRoomDto): GameSessionView {
    return unwrap(this.games.reportNetplay({ sessionId: id, guestId: body.guestId, roomId: body.roomId }));
  }

  @Post('sessions/:id/connected')
  @HttpCode(HttpStatus.OK)
  connected(@Param('id') id: string, @Body() body: GuestIdDto): GameSessionView {
    return unwrap(this.games.connected({ sessionId: id, guestId: body.guestId }));
  }

  @Post('sessions/:id/leave')
  @HttpCode(HttpStatus.OK)
  leave(@Param('id') id: string, @Body() body: GuestIdDto): { session: GameSessionView | null } {
    return { session: unwrap(this.games.leave({ sessionId: id, guestId: body.guestId })) };
  }

  @Post('sessions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Body() body: GuestIdDto): GameSessionView {
    return unwrap(this.games.cancel({ sessionId: id, guestId: body.guestId }));
  }

  @Post('sessions/:id/finish')
  @HttpCode(HttpStatus.OK)
  finish(@Param('id') id: string, @Body() body: GuestIdDto): GameSessionView {
    return unwrap(this.games.finish({ sessionId: id, guestId: body.guestId }));
  }

  @Get('sessions/:id/play')
  play(@Param('id') id: string, @Query() query: GuestIdDto): EmulatorSessionConfig {
    return unwrap(this.games.playConfig({ sessionId: id, guestId: query.guestId }));
  }

  @Get(':gameId/rom')
  rom(@Param('gameId') gameId: string, @Query() query: GuestIdDto): StreamableFile {
    const file = unwrap(this.games.romFileFor(query.guestId, gameId));
    return new StreamableFile(createReadStream(file.path), {
      type: 'application/octet-stream',
      disposition: `inline; filename="${file.name}"`,
    });
  }
}

function unwrap<T>(result: GameResult<T>): T {
  if (result.ok) return result.data;
  const body = { error: result.error, message: result.message };
  if (result.status === 400) throw new BadRequestException(body);
  if (result.status === 403) throw new ForbiddenException(body);
  if (result.status === 404) throw new NotFoundException(body);
  throw new ConflictException(body);
}
