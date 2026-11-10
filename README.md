# API de Control de Emergencias

Backend para registrar y gestionar reportes de emergencias, construido con **NestJS**, **TypeORM** y **PostgreSQL**.

Integrantes: Leider Cadena, Samuel Moreno y Miguel Pantoja.

## Requisitos

- Node.js 22.12 o superior
- Docker Desktop (para la base de datos PostgreSQL)

## Iniciar

```bash
npm install
cp .env.example .env          # En PowerShell: Copy-Item .env.example .env
docker compose up -d postgres # Base de datos en localhost:5434
npm run start:dev
```

La API queda en `http://localhost:3000/api`. Para crear una cuenta de administrador al iniciar, define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 10 caracteres) en `.env`. pgAdmin está disponible con `docker compose up -d` en `http://localhost:5050`.

> PostgreSQL se publica en el puerto **5434** para no chocar con otras instalaciones de PostgreSQL en el equipo (que suelen usar 5432 o 5433).

## Estructura

```
src/
├── main.ts                 # Arranque: prefijo /api, CORS y ValidationPipe
├── app.module.ts           # ConfigModule + TypeORM (PostgreSQL)
├── common/                 # Enums, decoradores (@Public, @Roles, @CurrentUser)
├── health/                 # GET /api/health
├── auth/                   # Registro, login (JWT), logout, guards
├── users/                  # Entidad User, operadores, carga de trabajo
├── incidents/              # Entidades Incident e IncidentHistory, filtros y estados
├── comments/               # Entidad Comment (comentarios de cada reporte)
└── dashboard/              # Resumen para el personal operativo
```

### Relaciones entre entidades

- `User` 1 ─ N `Incident` (quién creó el reporte, `created_by`)
- `User` 1 ─ N `Incident` (responsable asignado, `assigned_to`)
- `Incident` 1 ─ N `Comment` y `Comment` N ─ 1 `User` (autor)
- `Incident` 1 ─ N `IncidentHistory` y `IncidentHistory` N ─ 1 `User` (actor)

## Rutas

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/api/health` | Público | Comprobar el servicio |
| POST | `/api/auth/register` | Público | Registrar ciudadano |
| POST | `/api/auth/login` | Público | Iniciar sesión |
| GET | `/api/auth/me` | Sesión | Ver la cuenta actual |
| POST | `/api/auth/logout` | Sesión | Cerrar la sesión actual |
| GET | `/api/dashboard/summary` | Operador/administrador | Ver conteos de reportes |
| POST | `/api/users` | Administrador | Crear operador |
| GET | `/api/users` | Operador/administrador | Listar equipo y carga activa |
| POST | `/api/incidents` | Sesión | Crear reporte |
| GET | `/api/incidents` | Sesión | Listar reportes |
| GET | `/api/incidents/:id` | Sesión | Consultar reporte |
| PATCH | `/api/incidents/:id` | Sesión | Actualizar reporte |
| GET | `/api/incidents/:id/history` | Sesión | Consultar el historial de cambios |
| GET | `/api/incidents/:id/comments` | Sesión | Ver comentarios del reporte |
| POST | `/api/incidents/:id/comments` | Sesión | Agregar comentario al reporte |

Envía el token devuelto al iniciar sesión con `Authorization: Bearer <token>`. Los tokens duran 8 horas (`JWT_EXPIRES_IN`). Tras 10 intentos fallidos de inicio de sesión desde la misma IP en 15 minutos, el login se bloquea temporalmente.

El reporte incluye título, categoría (`medical`, `fire`, `crime`, `traffic`, `natural_disaster`, `other`), descripción y dirección; `latitude`/`longitude` y `contactPhone` son opcionales. Los ciudadanos ven y editan únicamente sus reportes mientras están nuevos, y pueden cancelarlos con `{ "status": "cancelled" }`. Solo el personal operativo define la prioridad (`low`, `medium`, `high`, `critical`) y el responsable (`assignedToId`).

### Filtros de la lista de reportes

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `status`, `priority`, `category` | `?status=new` | Filtra por valor exacto |
| `q` | `?q=incendio` | Busca en título, descripción y dirección |
| `from`, `to` | `?from=2026-11-01&to=2026-11-05` | Fechas `YYYY-MM-DD` en la zona horaria `TIMEZONE` |
| `near`, `radius` | `?near=1.2142,-77.2811&radius=3` | Reportes a menos de `radius` km (por defecto 5), ordenados por cercanía |
| `page`, `limit` | `?page=2&limit=20` | Paginación (`limit` máximo 100) |

### Estados

```
new ──► assigned ──► in_progress ──► resolved
 │  ◄──    │      ◄──     │
 └─────────┴──────────────┴──────► cancelled
```

Los cambios no permitidos responden `409` con la lista de estados permitidos (`allowed`). Asignar un responsable a un reporte nuevo lo pasa a `assigned`; quitarlo lo devuelve a `new`.

## Pruebas

```bash
npm test          # Pruebas unitarias
npm run test:e2e  # Pruebas de punta a punta (requiere docker compose up -d postgres)
```

Las pruebas e2e usan la base de datos `control_emergencias_test`, que se crea sola la primera vez que se levanta el contenedor y se limpia en cada ejecución.
