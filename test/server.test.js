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
  server = createServer({ dataFile });
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

  const initialHistory = await request(`/api/incidents/${created.data.incident.id}/history`, { token: registration.data.token });
  assert.equal(initialHistory.status, 200);
  assert.equal(initialHistory.data.history.length, 1);
  assert.equal(initialHistory.data.history[0].action, "created");

  const listed = await request("/api/incidents", { token: registration.data.token });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.pagination.total, 1);
  assert.equal(listed.data.incidents[0].id, created.data.incident.id);

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

  const logout = await request("/api/auth/logout", { method: "POST", token: login.data.token });
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/auth/me", { token: login.data.token })).status, 401);
});
