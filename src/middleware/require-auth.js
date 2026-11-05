import jwt from "jsonwebtoken";
import { HttpError } from "../http-error.js";

export function requireAuth(db, jwtSecret) {
  return (req, res, next) => {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      return next(new HttpError(401, "AUTH_REQUIRED", "Debes iniciar sesión para acceder a este recurso."));
    }

    let payload;
    try {
      payload = jwt.verify(match[1], jwtSecret, { algorithms: ["HS256"] });
    } catch {
      return next(new HttpError(401, "INVALID_TOKEN", "La sesión no es válida o ha expirado."));
    }

    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      return next(new HttpError(401, "INVALID_TOKEN", "La sesión no es válida o ha expirado."));
    }

    const user = db.prepare(`
      SELECT id, name, email, role, created_at AS createdAt
      FROM users
      WHERE id = ?
    `).get(payload.sub);

    if (!user) {
      return next(new HttpError(401, "INVALID_TOKEN", "La cuenta asociada a esta sesión ya no existe."));
    }

    req.user = user;
    return next();
  };
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "FORBIDDEN", "No tienes permisos para realizar esta acción."));
    }

    return next();
  };
}
