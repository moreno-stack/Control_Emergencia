import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const categories = ["medical", "fire", "crime", "traffic", "natural_disaster", "other"];
const priorities = ["low", "medium", "high", "critical"];
const statuses = ["new", "assigned", "in_progress", "resolved", "cancelled"];
const statusTransitions = {
  new: ["assigned", "in_progress", "cancelled"],
  assigned: ["new", "in_progress", "cancelled"],
  in_progress: ["assigned", "resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};
const sessions = new Map();
const maxFailedLogins = 10;
const failedLoginWindowMs = 15 * 60 * 1000;
const cleanupIntervalMs = 10 * 60 * 1000;

function loadEnv() {
  try {
    const lines = readFileSync(resolve(".env"), "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function loadStore(file) {
  try {
    const store = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(store.users) || !Array.isArray(store.incidents)) {
      throw new Error("El archivo de datos debe contener listas de usuarios y reportes.");
    }
    store.history ??= [];
    store.comments ??= [];
    return store;
  } catch (error) {
    if (error.code === "ENOENT") return { users: [], incidents: [], history: [], comments: [] };
    throw error;
  }
}

function saveStore(file, store) {
  mkdirSync(dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  renameSync(temporaryFile, file);
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function fail(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  throw error;
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) fail(413, "BODY_TOO_LARGE", "La solicitud supera el tamaño permitido.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    fail(400, "INVALID_JSON", "El cuerpo de la solicitud no contiene JSON válido.");
  }
}

function validate(condition, message) {
  if (!condition) fail(400, "VALIDATION_ERROR", message);
}

function validateIncident(body, partial = false, operator = false) {
  validate(body && typeof body === "object" && !Array.isArray(body), "Envía un objeto JSON.");
  const allowed = ["title", "category", "description", "address", "latitude", "longitude", "contactPhone"];
  if (operator) allowed.push("priority");
  if (operator && partial) allowed.push("status", "assignedTo");
  if (!operator && partial) allowed.push("status");
  const keys = Object.keys(body);
  validate(keys.every((key) => allowed.includes(key)), "El reporte contiene campos no permitidos.");
  if (partial) validate(keys.length > 0, "Debes enviar al menos un campo para actualizar.");

  if (!partial || "title" in body) validate(typeof body.title === "string" && body.title.trim().length >= 4 && body.title.trim().length <= 120, "El título debe tener entre 4 y 120 caracteres.");
  if (!partial || "category" in body) validate(categories.includes(body.category), "La categoría del reporte no es válida.");
  if (!partial || "description" in body) validate(typeof body.description === "string" && body.description.trim().length >= 10 && body.description.trim().length <= 2000, "La descripción debe tener entre 10 y 2000 caracteres.");
  if (!partial || "address" in body) validate(typeof body.address === "string" && body.address.trim().length >= 5 && body.address.trim().length <= 300, "La dirección debe tener entre 5 y 300 caracteres.");
  if ("latitude" in body) validate(Number.isFinite(body.latitude) && body.latitude >= -90 && body.latitude <= 90, "La latitud debe estar entre -90 y 90.");
  if ("longitude" in body) validate(Number.isFinite(body.longitude) && body.longitude >= -180 && body.longitude <= 180, "La longitud debe estar entre -180 y 180.");
  validate(("latitude" in body) === ("longitude" in body), "Debes enviar latitud y longitud juntas.");
  if ("contactPhone" in body) validate(typeof body.contactPhone === "string" && body.contactPhone.trim().length >= 7 && body.contactPhone.trim().length <= 25, "El teléfono de contacto no es válido.");
  if ("priority" in body) validate(priorities.includes(body.priority), "La prioridad no es válida.");
  if ("status" in body) validate(statuses.includes(body.status), "El estado no es válido.");
  if ("status" in body && !operator) validate(body.status === "cancelled", "Como ciudadano solo puedes cancelar tu reporte.");
  if ("assignedTo" in body) validate(body.assignedTo === null || typeof body.assignedTo === "string", "El responsable no es válido.");
}

function distanceKm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createLocalDateFormatter(timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    throw new Error(`La zona horaria ${timeZone} no es válida.`);
  }
  return (date) => formatter.format(new Date(date));
}

function sanitizeIncident(incident) {
  const { createdBy, ...publicIncident } = incident;
  return publicIncident;
}

function addHistoryEntry(store, incident, user, action, changedFields = [], details = {}) {
  store.history.push({
    id: randomUUID(),
    incidentId: incident.id,
    action,
    actorId: user.id,
    actorName: user.name,
    actorRole: user.role,
    changedFields,
    details,
    createdAt: new Date().toISOString(),
  });
}

export function createServer({
  dataFile = process.env.DATA_FILE ?? "./data/emergency.json",
  corsOrigins = [],
  timeZone = process.env.TIMEZONE || "America/Bogota",
} = {}) {
  const file = resolve(dataFile);
  const localDate = createLocalDateFormatter(timeZone);
  const failedLogins = new Map();
  const store = loadStore(file);
  const allowedOrigins = new Set(corsOrigins);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && !store.users.some((user) => user.email === adminEmail)) {
    validate(adminPassword.length >= 10 && Buffer.byteLength(adminPassword) <= 72, "ADMIN_PASSWORD debe tener entre 10 y 72 bytes.");
    store.users.push({
      id: randomUUID(),
      name: process.env.ADMIN_NAME?.trim() || "Administrador",
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    saveStore(file, store);
  }

  const server = createHttpServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    try {
      const url = new URL(req.url, "http://localhost");
      const route = url.pathname;
      if (req.method === "GET" && route === "/api/health") {
        return send(res, 200, { status: "ok" });
      }

      const body = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};

      if (req.method === "POST" && route === "/api/auth/register") {
        validate(body && typeof body.name === "string" && body.name.trim().length >= 2 && body.name.trim().length <= 100, "El nombre debe tener entre 2 y 100 caracteres.");
        validate(typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.email.length <= 254, "El correo no es válido.");
        validate(typeof body.password === "string" && body.password.length >= 10 && Buffer.byteLength(body.password) <= 72, "La contraseña debe tener entre 10 y 72 bytes.");
        validate(Object.keys(body).every((key) => ["name", "email", "password"].includes(key)), "El registro contiene campos no permitidos.");
        const email = body.email.trim().toLowerCase();
        if (store.users.some((user) => user.email === email)) fail(409, "EMAIL_IN_USE", "Ya existe una cuenta con ese correo.");
        const user = {
          id: randomUUID(),
          name: body.name.trim(),
          email,
          passwordHash: hashPassword(body.password),
          role: "citizen",
          createdAt: new Date().toISOString(),
        };
        store.users.push(user);
        saveStore(file, store);
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, { userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
        return send(res, 201, { user: publicUser(user), token });
      }

      if (req.method === "POST" && route === "/api/auth/login") {
        const ip = req.socket.remoteAddress ?? "unknown";
        const recentFailures = (failedLogins.get(ip) ?? []).filter((time) => Date.now() - time < failedLoginWindowMs);
        if (recentFailures.length >= maxFailedLogins) fail(429, "RATE_LIMITED", "Demasiados intentos fallidos. Inténtalo más tarde.");
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const user = store.users.find((account) => account.email === email);
        if (!user || typeof body.password !== "string" || !verifyPassword(body.password, user.passwordHash)) {
          recentFailures.push(Date.now());
          failedLogins.set(ip, recentFailures);
          fail(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
        }
        failedLogins.delete(ip);
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, { userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
        return send(res, 200, { user: publicUser(user), token });
      }

      const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
      const session = token && sessions.get(token);
      if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        fail(401, "AUTH_REQUIRED", "Debes iniciar sesión para acceder a este recurso.");
      }
      const user = store.users.find((account) => account.id === session.userId);
      if (!user) fail(401, "INVALID_TOKEN", "La cuenta asociada a esta sesión ya no existe.");

      if (req.method === "GET" && route === "/api/auth/me") {
        return send(res, 200, { user: publicUser(user) });
      }

      if (req.method === "GET" && route === "/api/dashboard/summary") {
        if (!["operator", "admin"].includes(user.role)) {
          fail(403, "FORBIDDEN", "El resumen está disponible solo para el personal operativo.");
        }
        const byStatus = Object.fromEntries(statuses.map((status) => [status, 0]));
        const byPriority = Object.fromEntries(priorities.map((priority) => [priority, 0]));
        const today = localDate(new Date());
        let open = 0;
        let createdToday = 0;
        let assignedToMe = 0;

        for (const incident of store.incidents) {
          byStatus[incident.status] += 1;
          byPriority[incident.priority] += 1;
          if (["new", "assigned", "in_progress"].includes(incident.status)) open += 1;
          if (localDate(incident.createdAt) === today) createdToday += 1;
          if (incident.assignedTo === user.id) assignedToMe += 1;
        }

        return send(res, 200, {
          summary: {
            total: store.incidents.length,
            open,
            createdToday,
            assignedToMe,
            byStatus,
            byPriority,
          },
        });
      }

      if (req.method === "POST" && route === "/api/auth/logout") {
        sessions.delete(token);
        return send(res, 200, { message: "Sesión cerrada correctamente." });
      }

      if (req.method === "POST" && route === "/api/users") {
        if (user.role !== "admin") fail(403, "FORBIDDEN", "Solo un administrador puede crear usuarios operativos.");
        validate(body && typeof body.name === "string" && body.name.trim().length >= 2 && body.name.trim().length <= 100, "El nombre debe tener entre 2 y 100 caracteres.");
        validate(typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.email.length <= 254, "El correo no es válido.");
        validate(typeof body.password === "string" && body.password.length >= 10 && Buffer.byteLength(body.password) <= 72, "La contraseña debe tener entre 10 y 72 bytes.");
        validate(body.role === "operator", "Solo se pueden crear cuentas de operador.");
        if (store.users.some((account) => account.email === body.email.trim().toLowerCase())) fail(409, "EMAIL_IN_USE", "Ya existe una cuenta con ese correo.");
        const operator = {
          id: randomUUID(),
          name: body.name.trim(),
          email: body.email.trim().toLowerCase(),
          passwordHash: hashPassword(body.password),
          role: "operator",
          createdAt: new Date().toISOString(),
        };
        store.users.push(operator);
        saveStore(file, store);
        return send(res, 201, { user: publicUser(operator) });
      }

      if (req.method === "GET" && route === "/api/users") {
        if (!["operator", "admin"].includes(user.role)) {
          fail(403, "FORBIDDEN", "Solo el personal operativo puede consultar las cuentas operativas.");
        }
        const users = store.users
          .filter((account) => ["operator", "admin"].includes(account.role))
          .sort((first, second) => first.name.localeCompare(second.name))
          .map((account) => ({
            ...publicUser(account),
            activeIncidentCount: store.incidents.filter((incident) =>
              incident.assignedTo === account.id
              && ["new", "assigned", "in_progress"].includes(incident.status)
            ).length,
          }));
        return send(res, 200, { users });
      }

      if (req.method === "POST" && route === "/api/incidents") {
        validateIncident(body, false, ["operator", "admin"].includes(user.role));
        const incident = {
          id: randomUUID(),
          title: body.title.trim(),
          category: body.category,
          description: body.description.trim(),
          address: body.address.trim(),
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          contactPhone: body.contactPhone?.trim() ?? null,
          priority: body.priority ?? "medium",
          status: "new",
          createdBy: user.id,
          assignedTo: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        store.incidents.push(incident);
        addHistoryEntry(store, incident, user, "created");
        saveStore(file, store);
        return send(res, 201, { incident: sanitizeIncident(incident) });
      }

      if (req.method === "GET" && route === "/api/incidents") {
        const page = Number(url.searchParams.get("page") ?? 1);
        const limit = Number(url.searchParams.get("limit") ?? 20);
        validate(Number.isInteger(page) && page >= 1 && Number.isInteger(limit) && limit >= 1 && limit <= 100, "La página o el límite no son válidos.");
        const allowedFilters = ["page", "limit", "status", "priority", "category", "q", "from", "to", "near", "radius"];
        validate([...url.searchParams.keys()].every((key) => allowedFilters.includes(key)), "La búsqueda contiene filtros no reconocidos.");
        let incidents = store.incidents.filter((incident) => user.role !== "citizen" || incident.createdBy === user.id);
        for (const field of ["status", "priority", "category"]) {
          const value = url.searchParams.get(field);
          if (value) {
            const choices = field === "status" ? statuses : field === "priority" ? priorities : categories;
            validate(choices.includes(value), `El filtro ${field} no es válido.`);
            incidents = incidents.filter((incident) => incident[field] === value);
          }
        }
        const search = url.searchParams.get("q")?.trim().toLocaleLowerCase();
        if (search) {
          validate(search.length <= 100, "La búsqueda no puede superar 100 caracteres.");
          incidents = incidents.filter((incident) =>
            [incident.title, incident.description, incident.address]
              .some((value) => value.toLocaleLowerCase().includes(search))
          );
        }
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        for (const date of [from, to]) {
          if (date !== null) {
            const parsedDate = new Date(`${date}T00:00:00.000Z`);
            const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
              && !Number.isNaN(parsedDate.getTime())
              && parsedDate.toISOString().slice(0, 10) === date;
            validate(validDate, "Las fechas deben tener el formato YYYY-MM-DD y ser válidas.");
          }
        }
        if (from && to) validate(from <= to, "La fecha inicial no puede ser posterior a la fecha final.");
        if (from) incidents = incidents.filter((incident) => localDate(incident.createdAt) >= from);
        if (to) incidents = incidents.filter((incident) => localDate(incident.createdAt) <= to);
        const near = url.searchParams.get("near");
        const radiusParam = url.searchParams.get("radius");
        validate(radiusParam === null || near !== null, "El filtro radius requiere el filtro near.");
        let distances = null;
        if (near !== null) {
          const [latitude, longitude, ...rest] = near.split(",").map((value) => (value.trim() === "" ? NaN : Number(value)));
          validate(rest.length === 0 && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
            && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180, "El filtro near debe tener el formato latitud,longitud.");
          const radius = radiusParam === null ? 5 : Number(radiusParam);
          validate(Number.isFinite(radius) && radius > 0 && radius <= 100, "El radio debe ser un número de kilómetros entre 0 y 100.");
          distances = new Map();
          incidents = incidents.filter((incident) => {
            if (incident.latitude === null || incident.longitude === null) return false;
            const distance = distanceKm(latitude, longitude, incident.latitude, incident.longitude);
            distances.set(incident.id, Math.round(distance * 100) / 100);
            return distance <= radius;
          });
        }
        if (distances) incidents.sort((first, second) => distances.get(first.id) - distances.get(second.id));
        else incidents.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
        const total = incidents.length;
        const results = incidents.slice((page - 1) * limit, page * limit).map((incident) => (
          distances ? { ...sanitizeIncident(incident), distanceKm: distances.get(incident.id) } : sanitizeIncident(incident)
        ));
        return send(res, 200, { incidents: results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
      }

      const incidentRoute = route.match(/^\/api\/incidents\/([^/]+)$/);
      const commentsRoute = route.match(/^\/api\/incidents\/([^/]+)\/comments$/);
      const historyRoute = route.match(/^\/api\/incidents\/([^/]+)\/history$/);
      if (commentsRoute && ["GET", "POST"].includes(req.method)) {
        const incident = store.incidents.find((item) => item.id === commentsRoute[1]);
        if (!incident || (user.role === "citizen" && incident.createdBy !== user.id)) {
          fail(404, "INCIDENT_NOT_FOUND", "No se encontró el reporte solicitado.");
        }
        if (req.method === "GET") {
          const comments = store.comments
            .filter((comment) => comment.incidentId === incident.id)
            .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
          return send(res, 200, { comments });
        }

        validate(body && typeof body.message === "string" && body.message.trim().length >= 2 && body.message.trim().length <= 1000, "El comentario debe tener entre 2 y 1000 caracteres.");
        validate(Object.keys(body).length === 1 && "message" in body, "El comentario solo admite el campo message.");
        const comment = {
          id: randomUUID(),
          incidentId: incident.id,
          author: { id: user.id, name: user.name, role: user.role },
          message: body.message.trim(),
          createdAt: new Date().toISOString(),
        };
        store.comments.push(comment);
        saveStore(file, store);
        return send(res, 201, { comment });
      }

      if (historyRoute && req.method === "GET") {
        const incident = store.incidents.find((item) => item.id === historyRoute[1]);
        if (!incident || (user.role === "citizen" && incident.createdBy !== user.id)) {
          fail(404, "INCIDENT_NOT_FOUND", "No se encontró el reporte solicitado.");
        }
        const history = store.history
          .filter((entry) => entry.incidentId === incident.id)
          .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
        return send(res, 200, { history });
      }

      if (incidentRoute && ["GET", "PATCH"].includes(req.method)) {
        const incident = store.incidents.find((item) => item.id === incidentRoute[1]);
        if (!incident || (user.role === "citizen" && incident.createdBy !== user.id)) {
          fail(404, "INCIDENT_NOT_FOUND", "No se encontró el reporte solicitado.");
        }
        if (req.method === "GET") return send(res, 200, { incident: sanitizeIncident(incident) });

        const operator = user.role === "operator" || user.role === "admin";
        if (!operator && incident.status !== "new") fail(409, "INCIDENT_LOCKED", "Solo puedes editar reportes que todavía estén nuevos.");
        validateIncident(body, true, operator);
        if (body.assignedTo) {
          const assignee = store.users.find((account) => account.id === body.assignedTo && ["operator", "admin"].includes(account.role));
          if (!assignee) fail(400, "INVALID_ASSIGNEE", "El responsable debe ser una cuenta operativa existente.");
        }
        if (!("status" in body) && "assignedTo" in body) {
          if (body.assignedTo && incident.status === "new") body.status = "assigned";
          if (body.assignedTo === null && incident.status === "assigned") body.status = "new";
        }
        if ("status" in body && body.status !== incident.status && !statusTransitions[incident.status].includes(body.status)) {
          fail(409, "INVALID_STATUS_TRANSITION", `No se puede cambiar el estado de ${incident.status} a ${body.status}.`, {
            from: incident.status,
            allowed: statusTransitions[incident.status],
          });
        }
        const changedFields = [];
        const details = {};
        for (const [field, value] of Object.entries(body)) {
          const normalizedValue = typeof value === "string" && field !== "status" && field !== "assignedTo" ? value.trim() : value;
          if (incident[field] !== normalizedValue) {
            changedFields.push(field);
            if (field === "status" || field === "priority" || field === "assignedTo") {
              details[field] = { from: incident[field], to: normalizedValue };
            }
            incident[field] = normalizedValue;
          }
        }
        if (changedFields.length > 0) {
          incident.updatedAt = new Date().toISOString();
          addHistoryEntry(store, incident, user, "updated", changedFields, details);
        }
        saveStore(file, store);
        return send(res, 200, { incident: sanitizeIncident(incident) });
      }

      fail(404, "ROUTE_NOT_FOUND", "No se encontró la ruta solicitada.");
    } catch (error) {
      if (error.status) {
        const response = { error: { code: error.code, message: error.message } };
        if (error.details) response.error.details = error.details;
        return send(res, error.status, response);
      }
      console.error("Error inesperado en la API:", error);
      return send(res, 500, { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error interno." } });
    }
  });

  server.purgeExpired = () => {
    const now = Date.now();
    let removedSessions = 0;
    let removedLoginRecords = 0;
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(token);
        removedSessions += 1;
      }
    }
    for (const [ip, failures] of failedLogins) {
      const recentFailures = failures.filter((time) => now - time < failedLoginWindowMs);
      if (recentFailures.length === 0) {
        failedLogins.delete(ip);
        removedLoginRecords += 1;
      } else {
        failedLogins.set(ip, recentFailures);
      }
    }
    return { removedSessions, removedLoginRecords };
  };
  const cleanupTimer = setInterval(server.purgeExpired, cleanupIntervalMs);
  cleanupTimer.unref();
  server.on("close", () => clearInterval(cleanupTimer));

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  loadEnv();
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT debe ser un número entre 1 y 65535.");
    process.exitCode = 1;
  } else {
    const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
      .split(",").map((origin) => origin.trim()).filter(Boolean);
    const server = createServer({ corsOrigins });
    server.listen(port, () => console.log(`API de emergencias escuchando en el puerto ${port}.`));
    const shutdown = () => server.close(() => process.exit(0));
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
