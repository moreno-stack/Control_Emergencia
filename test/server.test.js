import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "../server.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

let server;
let directory;
let baseUrl;
let dataFile;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "control-emergencia-"));
  dataFile = join(directory, "data.json");
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;
  const previousAdminName = process.env.ADMIN_NAME;
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.ADMIN_PASSWORD = "admin-test-password-123";
  process.env.ADMIN_NAME = "Admin Test";
  server = createServer({ dataFile });
  if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = previousAdminEmail;
  if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = previousAdminPassword;
  if (previousAdminName === undefined) delete process.env.ADMIN_NAME;
  else process.env.ADMIN_NAME = previousAdminName;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(directory, { recursive: true, force: true });
});

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

test("registra ciudadanos, protege reportes y guarda los datos", async () => {
  assert.deepEqual(await request("/api/health"), { status: 200, data: { status: "ok" } });
  assert.equal((await request("/api/incidents")).status, 401);

  const registration = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Ana Ejemplo", email: "ANA@example.com", password: "emergencia-segura-123" },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.data.user.role, "citizen");
  assert.equal(registration.data.user.email, "ana@example.com");
  assert.equal("passwordHash" in registration.data.user, false);

  const duplicate = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Ana Ejemplo", email: "ana@example.com", password: "emergencia-segura-123" },
  });
  assert.equal(duplicate.status, 409);

  const created = await request("/api/incidents", {
    method: "POST",
    token: registration.data.token,
    body: {
      title: "Accidente de tránsito",
      category: "traffic",
      description: "Se necesita ayuda en la intersección principal.",
      address: "Av. Central 123, Santiago",
      latitude: -33.45,
      longitude: -70.66,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.incident.status, "new");
  assert.equal("createdBy" in created.data.incident, false);

  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@example.test", password: "admin-test-password-123" },
  });
  assert.equal(adminLogin.status, 200);
  const citizenDashboard = await request("/api/dashboard/summary", { token: registration.data.token });
  assert.equal(citizenDashboard.status, 403);
  const dashboard = await request("/api/dashboard/summary", { token: adminLogin.data.token });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.summary.total, 1);
  assert.equal(dashboard.data.summary.open, 1);
  assert.equal(dashboard.data.summary.byPriority.medium, 1);
  const forbiddenUsers = await request("/api/users", { token: registration.data.token });
  assert.equal(forbiddenUsers.status, 403);
  const operatorCreated = await request("/api/users", {
    method: "POST",
    token: adminLogin.data.token,
    body: {
      name: "Operador Uno",
      email: "operator@example.test",
      password: "operator-test-password-123",
      role: "operator",
    },
  });
  assert.equal(operatorCreated.status, 201);
  const operators = await request("/api/users", { token: adminLogin.data.token });
  assert.equal(operators.status, 200);
  assert.equal(operators.data.users.length, 2);
  assert.equal(operators.data.users.some((user) => "passwordHash" in user), false);
  assert.equal(operators.data.users.find((user) => user.role === "operator").activeIncidentCount, 0);

  const initialHistory = await request(`/api/incidents/${created.data.incident.id}/history`, { token: registration.data.token });
  assert.equal(initialHistory.status, 200);
  assert.equal(initialHistory.data.history.length, 1);
  assert.equal(initialHistory.data.history[0].action, "created");

  const comment = await request(`/api/incidents/${created.data.incident.id}/comments`, {
    method: "POST",
    token: registration.data.token,
    body: { message: "La unidad puede acceder por la calle principal." },
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.comment.author.name, "Ana Ejemplo");
  const comments = await request(`/api/incidents/${created.data.incident.id}/comments`, { token: registration.data.token });
  assert.equal(comments.data.comments.length, 1);

  const listed = await request("/api/incidents", { token: registration.data.token });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.pagination.total, 1);
  assert.equal(listed.data.incidents[0].id, created.data.incident.id);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const searched = await request(`/api/incidents?q=intersecci%C3%B3n&category=traffic&from=${today}&to=${today}`, {
    token: registration.data.token,
  });
  assert.equal(searched.status, 200);
  assert.equal(searched.data.pagination.total, 1);
  assert.equal((await request("/api/incidents?from=2026-02-31", { token: registration.data.token })).status, 400);
  assert.equal((await request("/api/incidents?to=9999-99-99", { token: registration.data.token })).status, 400);

  const edit = await request(`/api/incidents/${created.data.incident.id}`, {
    method: "PATCH",
    token: registration.data.token,
    body: { title: "Accidente grave" },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.incident.title, "Accidente grave");
  const history = await request(`/api/incidents/${created.data.incident.id}/history`, { token: registration.data.token });
  assert.equal(history.data.history.length, 2);
  assert.deepEqual(history.data.history[1].changedFields, ["title"]);

  const invalid = await request("/api/incidents", {
    method: "POST",
    token: registration.data.token,
    body: { title: "Inválido", role: "admin" },
  });
  assert.equal(invalid.status, 400);

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  server = createServer({ dataFile });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "ana@example.com", password: "emergencia-segura-123" },
  });
  assert.equal(login.status, 200);
  const persisted = await request("/api/incidents", { token: login.data.token });
  assert.equal(persisted.data.pagination.total, 1);
  const persistedHistory = await request(`/api/incidents/${created.data.incident.id}/history`, { token: login.data.token });
  assert.equal(persistedHistory.data.history.length, 2);
  const persistedComments = await request(`/api/incidents/${created.data.incident.id}/comments`, { token: login.data.token });
  assert.equal(persistedComments.data.comments.length, 1);

  const logout = await request("/api/auth/logout", { method: "POST", token: login.data.token });
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/auth/me", { token: login.data.token })).status, 401);
});

let userCounter = 0;

async function loginAdmin() {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@example.test", password: "admin-test-password-123" },
  });
  return login.data;
}

async function registerCitizen() {
  userCounter += 1;
  const registration = await request("/api/auth/register", {
    method: "POST",
    body: { name: `Ciudadano ${userCounter}`, email: `ciudadano${userCounter}@example.test`, password: "ciudadano-password-123" },
  });
  return registration.data.token;
}

async function createIncident(token, extra = {}) {
  const created = await request("/api/incidents", {
    method: "POST",
    token,
    body: {
      title: "Incendio en vivienda",
      category: "fire",
      description: "Sale humo por las ventanas del segundo piso.",
      address: "Calle 18 # 25-40, Pasto",
      ...extra,
    },
  });
  return created;
}

test("controla las transiciones de estado y asigna automáticamente", async () => {
  const admin = await loginAdmin();
  const citizen = await registerCitizen();
  const { data } = await createIncident(citizen);
  const path = `/api/incidents/${data.incident.id}`;

  const assigned = await request(path, { method: "PATCH", token: admin.token, body: { assignedTo: admin.user.id } });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.data.incident.status, "assigned");

  const unassigned = await request(path, { method: "PATCH", token: admin.token, body: { assignedTo: null } });
  assert.equal(unassigned.data.incident.status, "new");

  const skipToResolved = await request(path, { method: "PATCH", token: admin.token, body: { status: "resolved" } });
  assert.equal(skipToResolved.status, 409);
  assert.equal(skipToResolved.data.error.code, "INVALID_STATUS_TRANSITION");

  assert.equal((await request(path, { method: "PATCH", token: admin.token, body: { status: "in_progress" } })).status, 200);
  assert.equal((await request(path, { method: "PATCH", token: admin.token, body: { status: "resolved" } })).status, 200);
  const reopen = await request(path, { method: "PATCH", token: admin.token, body: { status: "new" } });
  assert.equal(reopen.status, 409);
  assert.deepEqual(reopen.data.error.details.allowed, []);
});

test("solo el personal operativo define la prioridad", async () => {
  const admin = await loginAdmin();
  const citizen = await registerCitizen();

  const citizenCritical = await createIncident(citizen, { priority: "critical" });
  assert.equal(citizenCritical.status, 400);

  const { data } = await createIncident(citizen);
  assert.equal(data.incident.priority, "medium");
  const path = `/api/incidents/${data.incident.id}`;
  assert.equal((await request(path, { method: "PATCH", token: citizen, body: { priority: "critical" } })).status, 400);

  const raised = await request(path, { method: "PATCH", token: admin.token, body: { priority: "critical" } });
  assert.equal(raised.status, 200);
  assert.equal(raised.data.incident.priority, "critical");

  const staffCreated = await createIncident(admin.token, { priority: "high" });
  assert.equal(staffCreated.status, 201);
  assert.equal(staffCreated.data.incident.priority, "high");
});

test("el ciudadano puede cancelar su reporte mientras está nuevo", async () => {
  const admin = await loginAdmin();
  const citizen = await registerCitizen();

  const first = await createIncident(citizen);
  const firstPath = `/api/incidents/${first.data.incident.id}`;
  assert.equal((await request(firstPath, { method: "PATCH", token: citizen, body: { status: "resolved" } })).status, 400);
  const cancelled = await request(firstPath, { method: "PATCH", token: citizen, body: { status: "cancelled" } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.incident.status, "cancelled");
  const history = await request(`${firstPath}/history`, { token: citizen });
  assert.deepEqual(history.data.history.at(-1).details.status, { from: "new", to: "cancelled" });

  const second = await createIncident(citizen);
  const secondPath = `/api/incidents/${second.data.incident.id}`;
  await request(secondPath, { method: "PATCH", token: admin.token, body: { assignedTo: admin.user.id } });
  const locked = await request(secondPath, { method: "PATCH", token: citizen, body: { status: "cancelled" } });
  assert.equal(locked.status, 409);
  assert.equal(locked.data.error.code, "INCIDENT_LOCKED");
});

test("cada ciudadano solo puede consultar sus propios reportes", async () => {
  const admin = await loginAdmin();
  const owner = await registerCitizen();
  const otherCitizen = await registerCitizen();
  const created = await createIncident(owner);
  const incidentPath = `/api/incidents/${created.data.incident.id}`;

  assert.equal((await request(incidentPath, { token: otherCitizen })).status, 404);
  assert.equal((await request(`${incidentPath}/history`, { token: otherCitizen })).status, 404);
  assert.equal((await request(`${incidentPath}/comments`, { token: otherCitizen })).status, 404);
  assert.equal((await request(incidentPath, { token: admin.token })).status, 200);
});

test("busca reportes cercanos a una ubicación ordenados por distancia", async () => {
  const admin = await loginAdmin();
  const citizen = await registerCitizen();
  // Puntos de referencia en Pasto: plaza de Nariño, Unicentro y el aeropuerto (Chachagüí).
  const plaza = await createIncident(citizen, { title: "Caída en la plaza", latitude: 1.2142, longitude: -77.2811 });
  const unicentro = await createIncident(citizen, { title: "Choque en Unicentro", latitude: 1.2163, longitude: -77.2884 });
  const airport = await createIncident(citizen, { title: "Emergencia en el aeropuerto", latitude: 1.3962, longitude: -77.2915 });
  await createIncident(citizen, { title: "Sin ubicación GPS" });

  const nearby = await request("/api/incidents?near=1.2140,-77.2810&radius=3", { token: admin.token });
  assert.equal(nearby.status, 200);
  assert.deepEqual(nearby.data.incidents.map((incident) => incident.id), [plaza.data.incident.id, unicentro.data.incident.id]);
  assert.ok(nearby.data.incidents[0].distanceKm < nearby.data.incidents[1].distanceKm);
  assert.equal(nearby.data.incidents.some((incident) => incident.id === airport.data.incident.id), false);

  const wide = await request("/api/incidents?near=1.2140,-77.2810&radius=30", { token: admin.token });
  assert.equal(wide.data.incidents.at(-1).id, airport.data.incident.id);

  assert.equal((await request("/api/incidents?near=abc", { token: admin.token })).status, 400);
  assert.equal((await request("/api/incidents?near=1.2,-77.2&radius=500", { token: admin.token })).status, 400);
  assert.equal((await request("/api/incidents?radius=3", { token: admin.token })).status, 400);
});

test("filtra por fecha usando la zona horaria de Colombia", async () => {
  const seededFile = join(directory, "timezone.json");
  // 02:00 UTC del 10 de marzo equivale a las 9:00 p. m. del 9 de marzo en Bogotá.
  await writeFile(seededFile, JSON.stringify({
    users: [],
    incidents: [{
      id: "incidente-nocturno",
      title: "Reporte nocturno",
      category: "other",
      description: "Reporte creado en la noche en Colombia.",
      address: "Calle 18 # 25-40, Pasto",
      latitude: null,
      longitude: null,
      contactPhone: null,
      priority: "medium",
      status: "new",
      createdBy: "nadie",
      assignedTo: null,
      createdAt: "2026-03-10T02:00:00.000Z",
      updatedAt: "2026-03-10T02:00:00.000Z",
    }],
  }));
  process.env.ADMIN_EMAIL = "zona@example.test";
  process.env.ADMIN_PASSWORD = "zona-horaria-password-123";
  const localServer = createServer({ dataFile: seededFile });
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  await new Promise((resolve) => localServer.listen(0, "127.0.0.1", resolve));
  const localUrl = `http://127.0.0.1:${localServer.address().port}`;
  try {
    const login = await (await fetch(`${localUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "zona@example.test", password: "zona-horaria-password-123" }),
    })).json();
    const search = async (date) => (await (await fetch(`${localUrl}/api/incidents?from=${date}&to=${date}`, {
      headers: { Authorization: `Bearer ${login.token}` },
    })).json()).pagination.total;
    assert.equal(await search("2026-03-09"), 1);
    assert.equal(await search("2026-03-10"), 0);
  } finally {
    await new Promise((resolve) => localServer.close(resolve));
  }
  assert.throws(() => createServer({ dataFile: seededFile, timeZone: "Marte/Olympus" }), /zona horaria/);
});

test("el límite de login solo cuenta intentos fallidos y se reinicia al entrar", async () => {
  const limitFile = join(directory, "login-limit.json");
  process.env.ADMIN_EMAIL = "limite@example.test";
  process.env.ADMIN_PASSWORD = "limite-login-password-123";
  const limitServer = createServer({ dataFile: limitFile });
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  await new Promise((resolve) => limitServer.listen(0, "127.0.0.1", resolve));
  const limitUrl = `http://127.0.0.1:${limitServer.address().port}`;
  const login = async (password) => (await fetch(`${limitUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "limite@example.test", password }),
  })).status;
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) assert.equal(await login("limite-login-password-123"), 200);
    for (let attempt = 0; attempt < 9; attempt += 1) assert.equal(await login("contraseña-incorrecta"), 401);
    assert.equal(await login("limite-login-password-123"), 200);
    for (let attempt = 0; attempt < 10; attempt += 1) assert.equal(await login("contraseña-incorrecta"), 401);
    assert.equal(await login("limite-login-password-123"), 429);
  } finally {
    await new Promise((resolve) => limitServer.close(resolve));
  }
});

test("la limpieza periódica conserva las sesiones vigentes", async () => {
  const admin = await loginAdmin();
  const result = server.purgeExpired();
  assert.equal(result.removedSessions, 0);
  assert.equal((await request("/api/auth/me", { token: admin.token })).status, 200);
});

test("valida los datos del registro y rechaza campos no permitidos", async () => {
  const shortPassword = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Ana Ejemplo", email: "validacion@example.test", password: "corta" },
  });
  assert.equal(shortPassword.status, 400);
  assert.equal(shortPassword.data.error.code, "VALIDATION_ERROR");

  const extraField = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Ana Ejemplo",
      email: "validacion@example.test",
      password: "validacion-segura-123",
      role: "admin",
    },
  });
  assert.equal(extraField.status, 400);
  assert.equal(extraField.data.error.code, "VALIDATION_ERROR");
});

test("valida coordenadas y actualizaciones parciales de reportes", async () => {
  const citizen = await registerCitizen();
  const invalidCoordinates = await createIncident(citizen, { latitude: 1.2 });
  assert.equal(invalidCoordinates.status, 400);
  assert.equal(invalidCoordinates.data.error.code, "VALIDATION_ERROR");

  const created = await createIncident(citizen);
  const emptyUpdate = await request(`/api/incidents/${created.data.incident.id}`, {
    method: "PATCH",
    token: citizen,
    body: {},
  });
  assert.equal(emptyUpdate.status, 400);
  assert.equal(emptyUpdate.data.error.code, "VALIDATION_ERROR");
});

test("pagina los reportes y rechaza límites fuera de rango", async () => {
  const citizen = await registerCitizen();
  await createIncident(citizen, { title: "Primer reporte de prueba" });
  await createIncident(citizen, { title: "Segundo reporte de prueba" });
  await createIncident(citizen, { title: "Tercer reporte de prueba" });

  const page = await request("/api/incidents?page=2&limit=2", { token: citizen });
  assert.equal(page.status, 200);
  assert.equal(page.data.pagination.page, 2);
  assert.equal(page.data.pagination.limit, 2);
  assert.equal(page.data.pagination.total, 3);
  assert.equal(page.data.pagination.pages, 2);
  assert.equal(page.data.incidents.length, 1);
  assert.equal(page.data.incidents[0].title, "Primer reporte de prueba");

  const invalidLimit = await request("/api/incidents?page=1&limit=101", { token: citizen });
  assert.equal(invalidLimit.status, 400);
  assert.equal(invalidLimit.data.error.code, "VALIDATION_ERROR");
});

test("normaliza comentarios y rechaza campos adicionales", async () => {
  const citizen = await registerCitizen();
  const created = await createIncident(citizen);
  const commentsPath = `/api/incidents/${created.data.incident.id}/comments`;

  const comment = await request(commentsPath, {
    method: "POST",
    token: citizen,
    body: { message: "  Comentario con espacios  " },
  });
  assert.equal(comment.status, 201);
  assert.equal(comment.data.comment.message, "Comentario con espacios");

  const extraField = await request(commentsPath, {
    method: "POST",
    token: citizen,
    body: { message: "Comentario válido", author: "alterado" },
  });
  assert.equal(extraField.status, 400);
  assert.equal(extraField.data.error.code, "VALIDATION_ERROR");
});

test("aplica CORS solo a los orígenes permitidos", async () => {
  const corsServer = createServer({
    dataFile: join(directory, "cors.json"),
    corsOrigins: ["https://panel.example.test"],
  });
  await new Promise((resolve) => corsServer.listen(0, "127.0.0.1", resolve));
  const corsUrl = `http://127.0.0.1:${corsServer.address().port}`;
  try {
    const allowed = await fetch(`${corsUrl}/api/health`, {
      headers: { Origin: "https://panel.example.test" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://panel.example.test");
    assert.equal(allowed.headers.get("vary"), "Origin");

    const preflight = await fetch(`${corsUrl}/api/incidents`, {
      method: "OPTIONS",
      headers: { Origin: "https://panel.example.test" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, PATCH, OPTIONS");

    const denied = await fetch(`${corsUrl}/api/health`, {
      headers: { Origin: "https://untrusted.example.test" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((resolve) => corsServer.close(resolve));
  }
});

test("rechaza cuerpos con JSON inválido", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{\"name\":",
  });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, "INVALID_JSON");
});

test("devuelve errores consistentes para credenciales inválidas y tokens ausentes", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "no-existe@example.test", password: "contraseña-inválida-123" },
  });
  assert.equal(login.status, 401);
  assert.equal(login.data.error.code, "INVALID_CREDENTIALS");
  assert.equal(login.data.error.message, "Correo o contraseña incorrectos.");

  const protectedRequest = await request("/api/auth/me");
  assert.equal(protectedRequest.status, 401);
  assert.equal(protectedRequest.data.error.code, "AUTH_REQUIRED");
});
