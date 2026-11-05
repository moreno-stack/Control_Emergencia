import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function createDatabase(filename = process.env.DATABASE_PATH ?? "./data/emergency.sqlite") {
  const isMemoryDatabase = filename === ":memory:";
  const databasePath = isMemoryDatabase ? filename : resolve(filename);

  if (!isMemoryDatabase) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");

  if (!isMemoryDatabase) {
    db.pragma("journal_mode = WAL");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('citizen', 'operator', 'admin')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('medical', 'fire', 'crime', 'traffic', 'natural_disaster', 'other')),
      description TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      contact_phone TEXT,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'resolved', 'cancelled')),
      created_by TEXT NOT NULL REFERENCES users(id),
      assigned_to TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS incidents_created_by_idx ON incidents(created_by);
    CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
    CREATE INDEX IF NOT EXISTS incidents_created_at_idx ON incidents(created_at DESC);
  `);

  return db;
}
