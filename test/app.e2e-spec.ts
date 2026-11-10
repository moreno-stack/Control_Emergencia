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

describe('API Control de Emergencias (e2e)', () => {
  let app: INestApplication<App>;
  let api: () => ReturnType<typeof request>;
  let citizenToken: string;
  let otherCitizenToken: string;
  let adminToken: string;
  let operatorToken: string;
  let operatorId: string;
  let incidentId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health es público', () =>
    api().get('/api/health').expect(200, { status: 'ok' }));

  it('rechaza peticiones sin token', () =>
    api().get('/api/incidents').expect(401));

  it('registra ciudadanos sin exponer la contraseña', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({
        name: 'Ana Ejemplo',
        email: 'ANA@example.com',
        password: 'emergencia-segura-123',
      })
      .expect(201);
    expect(res.body.user.role).toBe('citizen');
    expect(res.body.user.email).toBe('ana@example.com');
    expect(res.body.user.password).toBeUndefined();
    citizenToken = res.body.token;

    const other = await api()
      .post('/api/auth/register')
      .send({
        name: 'Beto',
        email: 'beto@example.com',
        password: 'emergencia-segura-456',
      })
      .expect(201);
    otherCitizenToken = other.body.token;
  });

  it('valida el registro y evita correos repetidos', async () => {
    await api()
      .post('/api/auth/register')
      .send({ name: 'A', email: 'malo', password: 'corta' })
      .expect(400);
    await api()
      .post('/api/auth/register')
      .send({
        name: 'Ana Dos',
        email: 'ana@example.com',
        password: 'emergencia-segura-123',
      })
      .expect(409);
    await api()
      .post('/api/auth/register')
      .send({
        name: 'Ana',
        email: 'x@example.com',
        password: 'emergencia-segura-123',
        role: 'admin',
      })
      .expect(400);
  });

  it('inicia sesión con el administrador creado desde .env', async () => {
    await api()
      .post('/api/auth/login')
      .send({ email: 'admin@example.test', password: 'incorrecta-123' })
      .expect(401);
    const res = await api()
      .post('/api/auth/login')
      .send({
        email: 'admin@example.test',
        password: 'admin-test-password-123',
      })
      .expect(200);
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  it('solo el administrador crea operadores', async () => {
    const operator = {
      name: 'Olga Operadora',
      email: 'olga@example.com',
      password: 'operadora-segura-123',
      role: 'operator',
    };
    await api()
      .post('/api/users')
      .auth(citizenToken, { type: 'bearer' })
      .send(operator)
      .expect(403);
    const res = await api()
      .post('/api/users')
      .auth(adminToken, { type: 'bearer' })
      .send(operator)
      .expect(201);
    operatorId = res.body.user.id;
    const login = await api()
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password })
      .expect(200);
    operatorToken = login.body.token;
  });

  it('un ciudadano crea un reporte con prioridad media', async () => {
    const res = await api()
      .post('/api/incidents')
      .auth(citizenToken, { type: 'bearer' })
      .send({
        title: 'Incendio en bodega',
        category: 'fire',
        description: 'Sale humo negro de una bodega del barrio.',
        address: 'Calle 18 # 25-30, Pasto',
        latitude: 1.2142,
        longitude: -77.2811,
      })
      .expect(201);
    expect(res.body.incident.priority).toBe('medium');
    expect(res.body.incident.status).toBe('new');
    incidentId = res.body.incident.id;

    await api()
      .post('/api/incidents')
      .auth(citizenToken, { type: 'bearer' })
      .send({
        title: 'Otro reporte',
        category: 'fire',
        description: 'Descripción suficientemente larga.',
        address: 'Calle 1 # 2-3',
        priority: 'critical',
      })
      .expect(403);
  });

  it('los ciudadanos no ven reportes ajenos', async () => {
    await api()
      .get(`/api/incidents/${incidentId}`)
      .auth(otherCitizenToken, { type: 'bearer' })
      .expect(404);
    const res = await api()
      .get('/api/incidents')
      .auth(otherCitizenToken, { type: 'bearer' })
      .expect(200);
    expect(res.body.pagination.total).toBe(0);
  });

  it('filtra por texto y por cercanía', async () => {
    const byText = await api()
      .get('/api/incidents?q=bodega')
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(byText.body.incidents).toHaveLength(1);
    const near = await api()
      .get('/api/incidents?near=1.2150,-77.2800&radius=3')
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(near.body.incidents[0].distanceKm).toBeLessThan(3);
    await api()
      .get('/api/incidents?filtro=raro')
      .auth(operatorToken, { type: 'bearer' })
      .expect(400);
    await api()
      .get('/api/incidents?radius=3')
      .auth(operatorToken, { type: 'bearer' })
      .expect(400);
  });

  it('asignar un operador cambia el estado y valida transiciones', async () => {
    const assigned = await api()
      .patch(`/api/incidents/${incidentId}`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ assignedToId: operatorId, priority: 'high' })
      .expect(200);
    expect(assigned.body.incident.status).toBe('assigned');

    const invalid = await api()
      .patch(`/api/incidents/${incidentId}`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ status: 'resolved' })
      .expect(409);
    expect(invalid.body.allowed).toEqual(['new', 'in_progress', 'cancelled']);

    // El ciudadano ya no puede editarlo porque dejó de estar nuevo
    await api()
      .patch(`/api/incidents/${incidentId}`)
      .auth(citizenToken, { type: 'bearer' })
      .send({ status: 'cancelled' })
      .expect(409);
  });

  it('registra el historial de cambios', async () => {
    const res = await api()
      .get(`/api/incidents/${incidentId}/history`)
      .auth(citizenToken, { type: 'bearer' })
      .expect(200);
    expect(
      res.body.history.map((entry: { action: string }) => entry.action),
    ).toEqual(['created', 'updated']);
    expect(res.body.history[1].details.status).toEqual({
      from: 'new',
      to: 'assigned',
    });
  });

  it('permite comentar los reportes', async () => {
    await api()
      .post(`/api/incidents/${incidentId}/comments`)
      .auth(operatorToken, { type: 'bearer' })
      .send({ message: 'Unidad en camino.' })
      .expect(201);
    await api()
      .post(`/api/incidents/${incidentId}/comments`)
      .auth(citizenToken, { type: 'bearer' })
      .send({ message: 'x' })
      .expect(400);
    const res = await api()
      .get(`/api/incidents/${incidentId}/comments`)
      .auth(citizenToken, { type: 'bearer' })
      .expect(200);
    expect(res.body.comments[0].author.name).toBe('Olga Operadora');
  });

  it('muestra el resumen y la carga del equipo solo al personal', async () => {
    await api()
      .get('/api/dashboard/summary')
      .auth(citizenToken, { type: 'bearer' })
      .expect(403);
    const summary = await api()
      .get('/api/dashboard/summary')
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    expect(summary.body.summary).toMatchObject({
      total: 1,
      open: 1,
      createdToday: 1,
      assignedToMe: 1,
    });
    const users = await api()
      .get('/api/users')
      .auth(operatorToken, { type: 'bearer' })
      .expect(200);
    const olga = users.body.users.find(
      (user: { id: string }) => user.id === operatorId,
    );
    expect(olga.activeIncidentCount).toBe(1);
  });

  it('el logout invalida el token', async () => {
    await api()
      .post('/api/auth/logout')
      .auth(citizenToken, { type: 'bearer' })
      .expect(200);
    await api()
      .get('/api/auth/me')
      .auth(citizenToken, { type: 'bearer' })
      .expect(401);
  });
});
