import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createDatabase } from "./db.js";

const adminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(10).max(72)
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72),
});

const result = adminSchema.safeParse({
  name: process.env.ADMIN_NAME,
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});

if (!result.success) {
  console.error("Configura ADMIN_NAME, ADMIN_EMAIL y ADMIN_PASSWORD válidos antes de crear el administrador.");
  process.exitCode = 1;
} else {
  const db = createDatabase();
  const { name, email, password } = result.data;

  try {
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'admin')
    `).run(randomUUID(), name, email, bcrypt.hashSync(password, 12));
    console.log(`Administrador creado: ${email}`);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      console.error("Ya existe una cuenta con ese correo.");
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    db.close();
  }
}
