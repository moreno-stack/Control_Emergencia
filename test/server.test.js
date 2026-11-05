import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  const today = new Date().toISOString().slice(0, 10);
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
