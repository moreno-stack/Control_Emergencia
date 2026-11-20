import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

// Usa una base de datos aparte y la limpia en cada ejecución
process.env.POSTGRES_DB = 'control_emergencias_test';
process.env.DB_DROP_SCHEMA = 'true';
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'admin-test-password-123';
process.env.ADMIN_NAME = 'Admin Test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

const TIMEZONE = process.env.TIMEZONE || 'America/Bogota';

/** Fecha YYYY-MM-DD en la zona horaria de la API, desplazada en días. */
function localDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

describe('Reportes: paginación, fechas, cancelación y bloqueo de login (e2e)', () => {
  let app: INestApplication<App>;
  let api: () => ReturnType<typeof request>;
  let citizenToken: string;
  let otherCitizenToken: string;
  let operatorToken: string;
  const titles: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    api = () => request(app.getHttpServer());

    const citizen = await api()
      .post('/api/auth/register')
      .send({
        name: 'Carla Ciudadana',
        email: 'carla@example.com',
        password: 'emergencia-segura-123',
      })
      .expect(201);
    citizenToken = citizen.body.token;

    const other = await api()
      .post('/api/auth/register')
      .send({
        name: 'Diego Ciudadano',
        email: 'diego@example.com',
        password: 'emergencia-segura-456',
      })
      .expect(201);
    otherCitizenToken = other.body.token;

    const admin = await api()
      .post('/api/auth/login')
      .send({
        email: 'admin@example.test',
        password: 'admin-test-password-123',
      })
      .expect(200);
    await api()
      .post('/api/users')
      .auth(admin.body.token, { type: 'bearer' })
      .send({
        name: 'Oscar Operador',
        email: 'oscar@example.com',
        password: 'operador-seguro-123',
        role: 'operator',
      })
      .expect(201);
    const operator = await api()
      .post('/api/auth/login')
      .send({ email: 'oscar@example.com', password: 'operador-seguro-123' })
      .expect(200);
    operatorToken = operator.body.token;

    // Cinco reportes creados uno tras otro: el último es el más reciente
    for (let i = 1; i <= 5; i++) {
      const title = `Reporte de prueba ${i}`;
      await api()
        .post('/api/incidents')
        .auth(citizenToken, { type: 'bearer' })
        .send({
          title,
          category: 'other',
          description: 'Descripción suficientemente larga del reporte.',
          address: `Calle ${i} # 10-20, Pasto`,
        })
        .expect(201);
      titles.push(title);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('paginación', () => {
    it('divide los reportes en páginas, del más reciente al más antiguo', async () => {
      const first = await api()
        .get('/api/incidents?page=1&limit=2')
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(first.body.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });
      expect(
        first.body.incidents.map(
          (incident: { title: string }) => incident.title,
        ),
      ).toEqual([titles[4], titles[3]]);

      const last = await api()
        .get('/api/incidents?page=3&limit=2')
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(last.body.incidents).toHaveLength(1);
      expect(last.body.incidents[0].title).toBe(titles[0]);
    });

    it('una página fuera de rango llega vacía', async () => {
      const res = await api()
        .get('/api/incidents?page=10&limit=2')
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.incidents).toEqual([]);
      expect(res.body.pagination.total).toBe(5);
    });

    it('usa page=1 y limit=20 por defecto', async () => {
      const res = await api()
        .get('/api/incidents')
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(res.body.incidents).toHaveLength(5);
    });

    it('rechaza valores de page y limit inválidos', async () => {
      for (const query of [
        'page=0',
        'page=-1',
        'page=abc',
        'limit=0',
        'limit=101',
      ]) {
        await api()
          .get(`/api/incidents?${query}`)
          .auth(operatorToken, { type: 'bearer' })
          .expect(400);
      }
    });
  });

  describe('filtro por fechas', () => {
    it('incluye los reportes creados hoy', async () => {
      const today = localDate();
      const res = await api()
        .get(`/api/incidents?from=${today}&to=${today}`)
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.pagination.total).toBe(5);
    });

    it('excluye los reportes fuera del rango', async () => {
      const fromTomorrow = await api()
        .get(`/api/incidents?from=${localDate(1)}`)
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(fromTomorrow.body.pagination.total).toBe(0);

      const untilYesterday = await api()
        .get(`/api/incidents?to=${localDate(-1)}`)
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(untilYesterday.body.pagination.total).toBe(0);
    });

    it('se combina con la paginación', async () => {
      const res = await api()
        .get(`/api/incidents?from=${localDate(-7)}&limit=3&page=2`)
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 3,
        total: 5,
        pages: 2,
      });
      expect(res.body.incidents).toHaveLength(2);
    });

    it('rechaza fechas inválidas o un rango invertido', async () => {
      for (const query of [
        'from=ayer',
        'from=2026-13-01',
        'to=2026-02-30',
        `from=${localDate(1)}&to=${localDate(-1)}`,
      ]) {
        await api()
          .get(`/api/incidents?${query}`)
          .auth(operatorToken, { type: 'bearer' })
          .expect(400);
      }
    });
  });

  describe('cancelación por el ciudadano', () => {
    let incidentId: string;

    beforeAll(async () => {
      const res = await api()
        .post('/api/incidents')
        .auth(citizenToken, { type: 'bearer' })
        .send({
          title: 'Fuga de gas',
          category: 'other',
          description: 'Huele a gas en la escalera del edificio.',
          address: 'Carrera 24 # 18-50, Pasto',
        })
        .expect(201);
      incidentId = res.body.incident.id;
    });

    it('otro ciudadano no puede cancelar el reporte', async () => {
      await api()
        .patch(`/api/incidents/${incidentId}`)
        .auth(otherCitizenToken, { type: 'bearer' })
        .send({ status: 'cancelled' })
        .expect(404);
    });

    it('el dueño cancela su reporte y queda en el historial', async () => {
      const res = await api()
        .patch(`/api/incidents/${incidentId}`)
        .auth(citizenToken, { type: 'bearer' })
        .send({ status: 'cancelled' })
        .expect(200);
      expect(res.body.incident.status).toBe('cancelled');

      const history = await api()
        .get(`/api/incidents/${incidentId}/history`)
        .auth(citizenToken, { type: 'bearer' })
        .expect(200);
      expect(history.body.history.at(-1)).toMatchObject({
        action: 'updated',
        details: { status: { from: 'new', to: 'cancelled' } },
      });
    });

    it('el reporte cancelado ya no se puede editar ni reabrir', async () => {
      await api()
        .patch(`/api/incidents/${incidentId}`)
        .auth(citizenToken, { type: 'bearer' })
        .send({ title: 'Otro título' })
        .expect(409);
      await api()
        .patch(`/api/incidents/${incidentId}`)
        .auth(operatorToken, { type: 'bearer' })
        .send({ status: 'new' })
        .expect(409);
    });

    it('el personal lo encuentra filtrando por estado cancelado', async () => {
      const res = await api()
        .get('/api/incidents?status=cancelled')
        .auth(operatorToken, { type: 'bearer' })
        .expect(200);
      expect(
        res.body.incidents.map((incident: { id: string }) => incident.id),
      ).toEqual([incidentId]);
    });
  });

  // Debe ir al final: el bloqueo es por IP y afecta a todos los logins siguientes
  describe('bloqueo por intentos de login', () => {
    it('responde 429 tras 10 intentos fallidos, incluso con la contraseña correcta', async () => {
      for (let i = 0; i < 10; i++) {
        await api()
          .post('/api/auth/login')
          .send({ email: 'carla@example.com', password: `incorrecta-${i}` })
          .expect(401);
      }
      const blocked = await api()
        .post('/api/auth/login')
        .send({
          email: 'carla@example.com',
          password: 'emergencia-segura-123',
        })
        .expect(429);
      expect(blocked.body.message).toBe(
        'Demasiados intentos fallidos. Inténtalo más tarde.',
      );
    });
  });
});
