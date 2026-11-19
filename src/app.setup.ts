import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Configuración global de la aplicación. Se usa en main.ts y en las pruebas
 * e2e para que ambas trabajen exactamente igual.
 */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // convierte el JSON en instancias de los DTO
      whitelist: true, // elimina propiedades que no están en el DTO
      forbidNonWhitelisted: true, // y responde 400 si llegan propiedades extra
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}
