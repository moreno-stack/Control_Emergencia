import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Usa la base de datos de pruebas y la limpia al empezar
process.env.POSTGRES_DB = 'control_emergencias_test';
process.env.DB_DROP_SCHEMA = 'true';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password-123';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

/** Levanta la aplicación igual que main.ts (prefijo /api y validación). */
async function startApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}

describe('Autenticación: perfil, contraseña y logout (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await startApp();
    const res = await api()
      .post('/api/auth/register')
      .send({
        name: 'Carla Perfil',
        email: 'carla@example.com',
        password: 'clave-inicial-123',
      })
      .expect(201);
    token = res.body.token;
  });

  afterAll(async () => {
    await app.close();
    process.env.DB_DROP_SCHEMA = 'true';
  });

  it('PATCH /api/auth/me cambia el nombre pero no el rol', async () => {
    const res = await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Carla Actualizada  ' })
      .expect(200);
    expect(res.body.user).toMatchObject({
      name: 'Carla Actualizada',
      role: 'citizen',
    });

    await api()
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carla', role: 'admin' })
      .expect(400);
  });

  it('PATCH /api/auth/password exige la contraseña actual', async () => {
    const res = await api()
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'no-es-la-clave',
        newPassword: 'clave-nueva-456',
      })
      .expect(400);
    expect(res.body.message).toBe('La contraseña actual no es correcta.');

    await api()
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'clave-inicial-123', newPassword: 'corta' })
      .expect(400);
  });

  it('después de cambiar la contraseña solo sirve la nueva', async () => {
    await api()
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'clave-inicial-123',
        newPassword: 'clave-nueva-456',
      })
      .expect(200, { message: 'Contraseña actualizada correctamente.' });

    await api()
      .post('/api/auth/login')
      .send({ email: 'carla@example.com', password: 'clave-inicial-123' })
      .expect(401);
    await api()
      .post('/api/auth/login')
      .send({ email: 'carla@example.com', password: 'clave-nueva-456' })
      .expect(200);
  });

  it('un token cerrado sigue cerrado después de reiniciar la API', async () => {
    await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Reinicia la aplicación sin borrar la base de datos
    await app.close();
    process.env.DB_DROP_SCHEMA = 'false';
    app = await startApp();

    const res = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(res.body.message).toBe('La sesión fue cerrada.');
  });
});
