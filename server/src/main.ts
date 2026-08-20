import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PresenceSocket } from './presence/presence.socket';

const PORT = Number(process.env.PORT ?? 8787);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.get(PresenceSocket).attach(app.getHttpServer());
  await app.listen(PORT);
  Logger.log(`presence listening on http://localhost:${PORT} (ws /ws, GET /offices, /games)`, 'Bootstrap');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  Logger.error(message, 'Bootstrap');
  process.exit(1);
});
