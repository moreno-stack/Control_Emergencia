import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API de emergencias escuchando en http://localhost:${port}/api`);
}
bootstrap();
