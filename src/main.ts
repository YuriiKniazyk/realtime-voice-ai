import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const { port } = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));
  app.enableShutdownHooks();
  await app.listen(port);
  new Logger('Bootstrap').log(`Open http://localhost:${port} and hold the button to talk`);
}

void bootstrap();
