import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { HttpError, parseInput } from "../http-error.js";
import { requireAuth } from "../middleware/require-auth.js";

const passwordSchema = z.string()
  .min(10, "La contraseña debe tener al menos 10 caracteres.")
  .max(72, "La contraseña no puede superar 72 caracteres.")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, "La contraseña es demasiado larga.");

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().max(254).transform((email) => email.toLowerCase()),
  password: passwordSchema,
}).strict();

const loginSchema = z.object({
  email: z.email().trim().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(72),
}).strict();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function issueToken(user, jwtSecret) {
  return jwt.sign({ sub: user.id }, jwtSecret, {
    algorithm: "HS256",
    expiresIn: "8h",
  });
}

export function createAuthRouter({ db, jwtSecret }) {
  const router = Router();
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      error: { code: "RATE_LIMITED", message: "Demasiados intentos. Inténtalo más tarde." },
    }),
  });

  router.use(authRateLimit);

  router.post("/register", (req, res) => {
    const input = parseInput(registrationSchema, req.body);
    const id = randomUUID();
    const passwordHash = bcrypt.hashSync(input.password, 12);

    try {
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role)
        VALUES (?, ?, ?, ?, 'citizen')
      `).run(id, input.name, input.email, passwordHash);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new HttpError(409, "EMAIL_IN_USE", "Ya existe una cuenta con ese correo.");
      }

      throw error;
    }

    const user = db.prepare(`
      SELECT id, name, email, role, created_at AS createdAt
      FROM users
      WHERE id = ?
    `).get(id);

    return res.status(201).json({ user: publicUser(user), token: issueToken(user, jwtSecret) });
  });

  router.post("/login", (req, res) => {
    const input = parseInput(loginSchema, req.body);
    const user = db.prepare(`
      SELECT id, name, email, role, password_hash, created_at AS createdAt
      FROM users
      WHERE email = ?
    `).get(input.email);

    if (!user || !bcrypt.compareSync(input.password, user.password_hash)) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
    }

    return res.json({ user: publicUser(user), token: issueToken(user, jwtSecret) });
  });

  router.get("/me", requireAuth(db, jwtSecret), (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}
