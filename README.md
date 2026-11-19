# API de Control de Emergencias

API REST para registrar y gestionar reportes de emergencias (incendios, accidentes, emergencias médicas, etc.). Los ciudadanos reportan, el personal operativo asigna responsables y prioridades, y todos pueden seguir el historial y los comentarios de cada reporte.

Construida con **NestJS 12**, **TypeORM** y **PostgreSQL** como trabajo final de la Electiva I.

**Integrantes:** Leider Cadena, Samuel Moreno y Miguel Pantoja.

## Tecnologías

| Herramienta | Uso |
|---|---|
| NestJS 12 | Framework (módulos, controladores, servicios, inyección de dependencias) |
| TypeORM + PostgreSQL 15 | Persistencia con entidades y relaciones |
| class-validator / class-transformer | DTO y validación de los datos recibidos |
| @nestjs/config | Variables de entorno (`.env`) |
| @nestjs/jwt + bcryptjs | Autenticación con JWT y contraseñas cifradas |
| Jest + Supertest | Pruebas unitarias y de punta a punta (e2e) |
| oxlint + Prettier | Revisión y formato del código |
| Docker Compose | Base de datos PostgreSQL y pgAdmin |

## Requisitos

- Node.js 22.12 o superior y npm
- Docker Desktop (para PostgreSQL). También sirve un PostgreSQL instalado localmente.
- Postman o Insomnia para probar la API

## Configuración de la base de datos

La base de datos corre en Docker con `docker-compose.yml`:

```bash
docker compose up -d postgres   # PostgreSQL en localhost:5434
docker compose up -d            # PostgreSQL + pgAdmin (http://localhost:5050)
```

| Dato | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `5434` (se publica en 5434 para no chocar con otro PostgreSQL en 5432) |
| Base de datos | `control_emergencias_db` |
| Usuario / contraseña | `emergencias_user` / `emergencias_password` |
| Base de pruebas e2e | `control_emergencias_test` (la crea `docker/init.sql` la primera vez) |

Para conectarse desde pgAdmin (`admin@emergencias.com` / `admin_password`), registra un servidor con host `postgres`, puerto `5432` y el usuario de arriba.

Las tablas se crean solas: TypeORM está configurado con `autoLoadEntities: true` y `synchronize: true` (solo para desarrollo).

### Variables de entorno

Copia `.env.example` a `.env` (en PowerShell: `Copy-Item .env.example .env`).

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (por defecto 3000) |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |
| `TIMEZONE` | Zona horaria para filtros por fecha (`America/Bogota`) |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Conexión a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Secreto y duración del token |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Cuenta de administrador que se crea al iniciar (contraseña de 10 caracteres o más) |

## Ejecución

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run start:dev
```

La API queda en `http://localhost:3000/api`. Comprueba con `GET http://localhost:3000/api/health`.

Otros comandos:

```bash
npm run build && npm run start:prod   # Producción
npm test                              # Pruebas unitarias
npm run test:e2e                      # Pruebas e2e (requiere PostgreSQL)
npm run lint                          # oxlint
npm run format                        # Prettier
```

## Probar con Postman

Importa `postman/control-emergencia.postman_collection.json`. Ejecuta las peticiones en orden: los logins guardan los tokens (`citizenToken`, `operatorToken`, `adminToken`) y las creaciones guardan los ids (`operatorId`, `incidentId`) en las variables de la colección.

## Arquitectura

Cada funcionalidad es un **módulo** de NestJS con su **controlador** (recibe la petición HTTP), su **servicio** (lógica de negocio, inyectado por constructor) y sus **entidades** y **DTO**.

```
src/
├── main.ts                 # Arranque de la aplicación y CORS
├── app.setup.ts            # Prefijo /api, ValidationPipe y filtro de errores globales
├── app.module.ts           # Módulo raíz: ConfigModule + TypeORM + módulos
├── env.model.ts            # Tipos de las variables de entorno
├── common/                 # Código compartido
│   ├── decorators/         # @Public, @Roles, @CurrentUser
│   ├── enums/              # Roles, categorías, prioridades, estados
│   └── filters/            # HttpExceptionFilter (formato único de errores)
├── health/                 # GET /api/health
├── auth/                   # Registro, login JWT, logout y guards globales
├── users/                  # Entidad User, operadores y carga de trabajo
├── incidents/              # Entidades Incident e IncidentHistory, filtros, estados
├── comments/               # Entidad Comment
└── dashboard/              # Resumen para el personal operativo
```

### Entidades y relaciones

```
User 1 ──── N Incident
│             │
│             ├── 1 ── N Comment ── N ── 1 User (autor)
│             └── 1 ── N IncidentHistory ── N ── 1 User (actor)
└── 1 ── N Incident (asignados, assigned_to)
```

| Relación | Tipo | Dónde |
|---|---|---|
| `User` → `Incident` (creador y responsable) | OneToMany / ManyToOne | `incidents/entities/incident.entity.ts` |
| `Incident` → `Comment`, `IncidentHistory` | OneToMany / ManyToOne (`onDelete: CASCADE`) | `comments`, `incidents` |

## Rutas

Todas las rutas usan el prefijo `/api` y piden `Authorization: Bearer <token>`, excepto las públicas.

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/health` | Público | Comprobar el servicio |
| POST | `/auth/register` | Público | Registrar ciudadano |
| POST | `/auth/login` | Público | Iniciar sesión |
| GET | `/auth/me` | Sesión | Ver la cuenta actual |
| POST | `/auth/logout` | Sesión | Cerrar la sesión |
| POST | `/users` | Admin | Crear operador |
| GET | `/users` | Operador/admin | Listar equipo y carga activa |
| POST | `/incidents` | Sesión | Crear reporte |
| GET | `/incidents` | Sesión | Listar reportes con filtros y paginación |
| GET | `/incidents/:id` | Sesión | Consultar reporte |
| PATCH | `/incidents/:id` | Sesión | Actualizar reporte, estado, prioridad o responsable |
| GET | `/incidents/:id/history` | Sesión | Historial de cambios |
| GET | `/incidents/:id/comments` | Sesión | Ver comentarios |
| POST | `/incidents/:id/comments` | Sesión | Comentar |
| GET | `/dashboard/summary` | Operador/admin | Conteos de reportes |

### Reglas de negocio

- Roles: `citizen` (se registra solo), `operator` (lo crea el admin) y `admin` (se crea desde `.env`).
- Los ciudadanos ven y editan solo sus reportes mientras están en `new`, y solo pueden cancelarlos. La prioridad y el responsable los define el personal operativo.
- Asignar un responsable a un reporte nuevo lo pasa a `assigned`; quitarlo lo devuelve a `new`.
- Tras 10 intentos fallidos de login desde una IP en 15 minutos, el login se bloquea temporalmente.

```
new ──► assigned ──► in_progress ──► resolved
 │  ◄──    │      ◄──     │
 └─────────┴──────────────┴──────► cancelled
```

### Filtros de `GET /incidents`

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `status`, `priority`, `category` | `?status=new` | Filtra por valor exacto |
| `q` | `?q=incendio` | Busca en título, descripción y dirección |
| `from`, `to` | `?from=2026-11-01&to=2026-11-05` | Fechas `YYYY-MM-DD` |
| `near`, `radius` | `?near=1.2142,-77.2811&radius=3` | Reportes a menos de `radius` km, ordenados por cercanía |
| `page`, `limit` | `?page=2&limit=20` | Paginación (`limit` máximo 100) |

### Respuestas de error

Todos los errores tienen el mismo formato gracias al filtro global `HttpExceptionFilter`:

```json
{
  "statusCode": 404,
  "message": "No se encontró el reporte solicitado.",
  "error": "Not Found",
  "path": "/api/incidents/0b1c...",
  "timestamp": "2026-11-19T15:00:00.000Z"
}
```

| Código | Cuándo |
|---|---|
| 400 | Datos inválidos (DTO), propiedades no permitidas o id con formato incorrecto |
| 401 | Sin token, token inválido o sesión cerrada |
| 403 | El rol no tiene permiso |
| 404 | El registro no existe o no es visible para el usuario |
| 409 | Correo repetido o transición de estado no permitida |
| 429 | Demasiados intentos de login |

## Trabajo colaborativo (Git y GitHub)

- `main` contiene siempre una versión que funciona.
- Cada funcionalidad se desarrolla en su propia rama (`feature/...`, `docs/...`, `test/...`) y se integra con un **Pull Request** revisado por otro integrante.
- Los mensajes de commit siguen Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

| Rama | Responsable | Contenido |
|---|---|---|
| `feature/migracion-nestjs` | Todo el equipo | Migración a NestJS, autenticación, reportes |
| `feature/documentacion-y-errores` | Leider Cadena | Filtro de errores, lint, README y Postman |
