<div align="center">

# 🚨 API de Control de Emergencias

**API REST para reportar y atender emergencias**

![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

Trabajo final de la **Electiva I** · Leider Cadena · Samuel Moreno · Miguel Pantoja

</div>

---

## 📖 Descripción

API desarrollada con **NestJS**, **TypeORM** y **PostgreSQL** para registrar y gestionar reportes de emergencias (incendios, accidentes, emergencias médicas, etc.):

- 🔐 **Auth** – registro, inicio de sesión con JWT, cierre de sesión y control de acceso por roles (`citizen`, `operator`, `admin`).
- 👤 **Users** – cuentas de ciudadanos y operadores.
- 🚨 **Incidents** – reportes con categoría, dirección y coordenadas. El personal operativo asigna responsable y prioridad, y el estado avanza por un flujo validado. Cada cambio queda en el historial.
- 💬 **Comments** – comentarios de ciudadanos y operadores en cada reporte.
- 📊 **Dashboard** – resumen de reportes por estado y prioridad para el personal operativo.

Incluye validación de datos con DTOs, respuestas de error uniformes, pruebas automáticas y una colección de Postman.

## 🧰 Tecnologías

| Herramienta | Uso |
|-------------|-----|
| NestJS 12 | Módulos, controladores, servicios e inyección de dependencias |
| TypeORM + PostgreSQL 15 | Persistencia con entidades y relaciones |
| class-validator / class-transformer | DTOs y validación de los datos recibidos |
| @nestjs/config | Variables de entorno (`.env`) |
| @nestjs/jwt + bcryptjs | Autenticación con JWT y contraseñas cifradas |
| Jest + Supertest | Pruebas unitarias y de punta a punta (e2e) |
| oxlint + Prettier | Revisión y formato del código |

## ✅ Requisitos

| Herramienta | Versión |
|-------------|---------|
| [Node.js](https://nodejs.org/) | 22.12 o superior |
| [npm](https://www.npmjs.com/) | Incluido con Node.js |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Para levantar PostgreSQL |
| [Postman](https://www.postman.com/downloads/) | Para probar la API |

## 🗄️ Configuración de la base de datos

La base de datos corre en Docker, no necesitas instalar PostgreSQL.

**1. Crea el archivo `.env`** a partir del ejemplo:

```bash
cp .env.example .env          # En PowerShell: Copy-Item .env.example .env
```

**2. Revisa los valores** (coinciden con `docker-compose.yml`):

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_DB=control_emergencias_db
POSTGRES_USER=emergencias_user
POSTGRES_PASSWORD=emergencias_password

JWT_SECRET=cambia-este-secreto-por-uno-largo
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin-password-123
```

**3. Levanta PostgreSQL y pgAdmin:**

```bash
docker compose up -d
```

| Servicio | URL / Puerto |
|----------|--------------|
| 🐘 PostgreSQL | `localhost:5434` (no choca con otro PostgreSQL en 5432) |
| 🛠️ pgAdmin (opcional) | http://localhost:5050 — `admin@emergencias.com` / `admin_password` |
| 🧪 Base de pruebas e2e | `control_emergencias_test` (la crea `docker/init.sql` la primera vez) |

> Las tablas se crean solas al iniciar la API (`autoLoadEntities` y `synchronize: true`), no hay que ejecutar migraciones. En pgAdmin registra un servidor con host `postgres`, puerto `5432` y el usuario de arriba.

<details>
<summary><b>Todas las variables de entorno</b></summary>

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto de la API (por defecto 3000) |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma |
| `TIMEZONE` | Zona horaria para los filtros por fecha (`America/Bogota`) |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Conexión a PostgreSQL |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Secreto y duración del token |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador que se crea al iniciar (contraseña de 10 caracteres o más) |

</details>

## 🚀 Ejecutar el proyecto

```bash
# 1. Clonar el repositorio
git clone https://github.com/moreno-stack/Control_Emergencia.git
cd Control_Emergencia

# 2. Instalar dependencias
npm install

# 3. Iniciar en modo desarrollo
npm run start:dev
```

La API queda disponible en **http://localhost:3000/api** 🎉 (compruébalo con `GET /api/health`).

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | Desarrollo con recarga automática |
| `npm run build` y `npm run start:prod` | Compilar y ejecutar en producción |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas de punta a punta (requiere PostgreSQL) |
| `npm run lint` | Revisión del código con oxlint |
| `npm run format` | Formato con Prettier |

---

## 🏗️ Arquitectura

Cada funcionalidad es un **módulo** con su **controlador** (recibe la petición HTTP), su **servicio** (lógica de negocio, inyectado por constructor) y sus **entidades** y **DTOs**.

```
src/
├── main.ts                 # Arranque de la aplicación y CORS
├── app.setup.ts            # Prefijo /api, ValidationPipe y filtro de errores globales
├── app.module.ts           # Módulo raíz: ConfigModule + TypeORM + módulos
├── env.model.ts            # Tipos de las variables de entorno
├── common/                 # Decoradores (@Public, @Roles, @CurrentUser), enums y filtros
├── health/                 # GET /api/health
├── auth/                   # Registro, login JWT, logout y guards globales
├── users/                  # Entidad User, operadores y carga de trabajo
├── incidents/              # Entidades Incident e IncidentHistory, filtros y estados
├── comments/               # Entidad Comment
└── dashboard/              # Resumen para el personal operativo
```

### 🔗 Entidades y relaciones

| Relación | Tipo | Detalle |
|----------|------|---------|
| `User` → `Incident` | OneToMany / ManyToOne | Quién creó el reporte (`created_by`) y el responsable (`assigned_to`) |
| `Incident` → `Comment` | OneToMany / ManyToOne | `onDelete: CASCADE` |
| `Incident` → `IncidentHistory` | OneToMany / ManyToOne | Quién cambió qué y cuándo |

## 🛣️ Endpoints

Todas las rutas usan el prefijo `/api` y piden `Authorization: Bearer <token>`, excepto las públicas.

| Método | Ruta | Acceso | Función |
|--------|------|--------|---------|
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

### 📋 Reglas de negocio

- Roles: `citizen` (se registra solo), `operator` (lo crea el admin) y `admin` (se crea desde `.env`).
- Los ciudadanos ven y editan solo sus reportes mientras están en `new`, y solo pueden cancelarlos. La prioridad y el responsable los define el personal operativo.
- Asignar un responsable a un reporte nuevo lo pasa a `assigned`; quitarlo lo devuelve a `new`.
- Tras 10 intentos fallidos de login desde una IP en 15 minutos, el login se bloquea temporalmente.

```
new ──► assigned ──► in_progress ──► resolved
 │  ◄──    │      ◄──     │
 └─────────┴──────────────┴──────► cancelled
```

<details>
<summary><b>Filtros de <code>GET /incidents</code></b></summary>

| Parámetro | Ejemplo | Descripción |
|-----------|---------|-------------|
| `status`, `priority`, `category` | `?status=new` | Filtra por valor exacto |
| `q` | `?q=incendio` | Busca en título, descripción y dirección |
| `from`, `to` | `?from=2026-11-01&to=2026-11-05` | Fechas `YYYY-MM-DD` |
| `near`, `radius` | `?near=1.2142,-77.2811&radius=3` | Reportes a menos de `radius` km, ordenados por cercanía |
| `page`, `limit` | `?page=2&limit=20` | Paginación (`limit` máximo 100) |

</details>

### ⚠️ Respuestas de error

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
|--------|--------|
| 400 | Datos inválidos (DTO), propiedades no permitidas o id con formato incorrecto |
| 401 | Sin token, token inválido o sesión cerrada |
| 403 | El rol no tiene permiso |
| 404 | El registro no existe o no es visible para el usuario |
| 409 | Correo repetido o transición de estado no permitida |
| 429 | Demasiados intentos de login |

---

## 📮 Colección de Postman (Pruebas del Flujo Completo)

Se incluye la colección de Postman en formato JSON v2.1 con todas las peticiones:

- **Ruta de la colección**: `postman/control-emergencia.postman_collection.json`.

### Pasos para importar y ejecutar en Postman:
1. Abre **Postman**.
2. Haz clic en **Import** y selecciona el archivo `postman/control-emergencia.postman_collection.json`.
3. La variable de colección `baseUrl` viene preconfigurada en `http://localhost:3000/api`.
4. En `.env` deja `ADMIN_EMAIL=admin@example.com` y `ADMIN_PASSWORD=admin-password-123` (como en `.env.example`) para que funcione el login del administrador.
5. Puedes probar peticiones individuales o usar el **Collection Runner** para ejecutar todo el flujo. Los logins guardan los tokens y las creaciones guardan los ids en las variables de la colección:
   - **Salud y Autenticación**: health, registro, login del ciudadano y del administrador.
   - **Usuarios**: creación del operador.
   - **Reportes**: creación, filtros por texto y cercanía, asignación del operador, cambio de estado e historial.
   - **Comentarios y Dashboard**: conversación en el reporte y resumen operativo.
   - **Cierre de sesión**: logout.

---

## 🤝 Trabajo colaborativo

- `main` contiene siempre una versión que funciona.
- Cada funcionalidad se desarrolla en su propia rama y se integra con un **Pull Request** revisado por otro integrante.
- Los commits siguen Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

| Rama | Responsable | Contenido |
|------|-------------|-----------|
| `feature/migracion-nestjs` | Todo el equipo | Migración a NestJS, autenticación, reportes |
| `feature/documentacion-y-errores` | Leider Cadena | Filtro de errores, lint, README y Postman |

---

## 🎬 Video presentaciones de cada integrante

<!-- Reemplaza cada PEGAR_LINK_DRIVE_AQUI por el enlace del video en Google Drive (compartido como "Cualquier persona con el enlace") -->

<div align="center">

<table>
  <tr>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Leider Alexander<br>Cadena Cabrera</b><br><br>
      <a href="PEGAR_LINK_DRIVE_AQUI"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video de Leider en Google Drive" /></a>
    </td>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Samuel<br>Moreno</b><br><br>
      <a href="PEGAR_LINK_DRIVE_AQUI"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video de Samuel en Google Drive" /></a>
    </td>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Miguel<br>Pantoja</b><br><br>
      <a href="PEGAR_LINK_DRIVE_AQUI"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video de Miguel en Google Drive" /></a>
    </td>
  </tr>
</table>

</div>
