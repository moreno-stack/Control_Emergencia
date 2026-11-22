<div align="center">

<img src="./logo/logo.svg" alt="Logo Control de Emergencias" width="200" />

# 🚨 Control de Emergencias API

**API REST para reportar y gestionar emergencias**

![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)

</div>

---

## 📖 Descripción

API desarrollada con **NestJS**, **TypeORM** y **PostgreSQL** como trabajo final de la Electiva I. Los ciudadanos reportan emergencias (incendios, accidentes, emergencias médicas, etc.) y el personal operativo las asigna, les pone prioridad y las sigue hasta resolverlas:

- 👤 **Users y Auth** – registro de ciudadanos, inicio de sesión con JWT, roles (`citizen`, `operator`, `admin`), cierre de sesión y guards que protegen todas las rutas.
- 🚨 **Incidents** – reportes de emergencia con categoría, prioridad, ubicación y estado. Filtros por texto, fechas y cercanía, transiciones de estado controladas e historial de cambios.
- 💬 **Comments** – comentarios en cada reporte, visibles solo para quien puede ver el reporte.
- 📊 **Dashboard** – conteos por estado y prioridad para el personal operativo.

Incluye validación de datos con DTOs, respuestas de error uniformes, pruebas unitarias y e2e, y una colección de Postman con el flujo completo.

## 👥 Integrantes

| Integrante | Módulo |
|---|---|
| Leider Cadena | Base del proyecto, configuración, manejo de errores y documentación |
| Samuel Moreno | Usuarios y autenticación |
| Miguel Pantoja | Reportes, comentarios, dashboard y pruebas |

## ✅ Requisitos

| Herramienta | Versión |
|-------------|---------|
| [Node.js](https://nodejs.org/) | 22.12 o superior |
| [npm](https://www.npmjs.com/) | Incluido con Node.js |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Para levantar PostgreSQL |
| [Postman](https://www.postman.com/) | Para probar la API |

## 🗄️ Configuración de la base de datos

La base de datos corre en Docker, no necesitas instalar PostgreSQL.

**1. Crea el archivo `.env`** a partir del ejemplo:

```bash
cp .env.example .env            # En PowerShell: Copy-Item .env.example .env
```

**2. Revisa los valores** (coinciden con `docker-compose.yml`):

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_DB=control_emergencias_db
POSTGRES_USER=emergencias_user
POSTGRES_PASSWORD=emergencias_password

JWT_SECRET=cambia-este-secreto-por-uno-largo
JWT_EXPIRES_IN=8h

ADMIN_NAME=Administrador
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin-password-123
```

**3. Levanta PostgreSQL y pgAdmin:**

```bash
docker compose up -d
```

| Servicio | URL / Puerto |
|----------|--------------|
| 🐘 PostgreSQL | `localhost:5434` (se publica en 5434 para no chocar con otro PostgreSQL en 5432) |
| 🧪 Base de pruebas e2e | `control_emergencias_test` (la crea `docker/init.sql` la primera vez) |
| 🛠️ pgAdmin (opcional) | http://localhost:5050 — `admin@emergencias.com` / `admin_password` |

> Las tablas se crean solas al iniciar la API (`synchronize: true`), no hay que ejecutar migraciones. Al arrancar, la API crea la cuenta de administrador definida en el `.env`.

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

La API queda disponible en **http://localhost:3000/api** 🎉 Compruébalo con `GET http://localhost:3000/api/health`.

| Comando | Descripción |
|---------|-------------|
| `npm run start:dev` | Desarrollo con recarga automática |
| `npm run build` y `npm run start:prod` | Compilar y ejecutar en producción |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas de punta a punta (requiere PostgreSQL) |
| `npm run lint` | Revisión del código con oxlint |
| `npm run format` | Formato con Prettier |

> **¿Error `password authentication failed`?** Otro PostgreSQL ocupa el puerto. Cambia `5434` en `docker-compose.yml` y `POSTGRES_PORT` en `.env` por un puerto libre y vuelve a ejecutar `docker compose up -d`.

---

## 📮 Colección de Postman (pruebas del flujo completo)

Se incluye la colección de Postman en formato JSON v2.1 con todas las rutas de la API:

- **Ruta de la colección**: `postman/control-emergencia.postman_collection.json`.

### Pasos para importar y ejecutar en Postman:
1. Abre **Postman**.
2. Haz clic en **Import** y selecciona el archivo `postman/control-emergencia.postman_collection.json`.
3. La variable de colección `baseUrl` viene preconfigurada en `http://localhost:3000/api`.
4. Ejecuta las peticiones en orden, o usa el **Collection Runner** para correr todo el flujo. Los logins guardan los tokens (`citizenToken`, `operatorToken`, `adminToken`) y las creaciones guardan los ids (`operatorId`, `incidentId`):
   - **0. Salud**: comprobar que la API responde.
   - **1. Autenticación**: registro de ciudadano, login de ciudadano y administrador, y consulta de la cuenta.
   - **2. Usuarios**: el administrador crea un operador y se lista el personal con su carga de trabajo.
   - **3. Reportes (Incidents)**: crear, listar con filtros, asignar operador y prioridad, cambiar el estado y ver el historial.
   - **4. Comentarios**: comentar un reporte y ver sus comentarios.
   - **5. Dashboard**: resumen de reportes para el personal operativo.
   - **6. Cierre de sesión**: logout y verificación de que el token ya no sirve.

---

## 🏗️ Arquitectura

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

### 🔗 Entidades y relaciones

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

## 🛣️ Rutas

Todas las rutas usan el prefijo `/api` y piden `Authorization: Bearer <token>`, excepto las públicas.

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/health` | Público | Comprobar el servicio |
| POST | `/auth/register` | Público | Registrar ciudadano |
| POST | `/auth/login` | Público | Iniciar sesión |
| GET | `/auth/me` | Sesión | Ver la cuenta actual |
| PATCH | `/auth/me` | Sesión | Cambiar el nombre de la cuenta |
| PATCH | `/auth/password` | Sesión | Cambiar la contraseña (pide la actual) |
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
- Un token cerrado con logout queda guardado en la base de datos y no vuelve a servir, aunque la API se reinicie.

```
new ──► assigned ──► in_progress ──► resolved
 │  ◄──    │      ◄──     │
 └─────────┴──────────────┴──────► cancelled
```

### 🔎 Filtros de `GET /incidents`

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `status`, `priority`, `category` | `?status=new` | Filtra por valor exacto |
| `q` | `?q=incendio` | Busca en título, descripción y dirección |
| `from`, `to` | `?from=2026-11-01&to=2026-11-05` | Fechas `YYYY-MM-DD` |
| `near`, `radius` | `?near=1.2142,-77.2811&radius=3` | Reportes a menos de `radius` km, ordenados por cercanía |
| `page`, `limit` | `?page=2&limit=20` | Paginación (`limit` máximo 100) |

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
|---|---|
| 400 | Datos inválidos (DTO), propiedades no permitidas o id con formato incorrecto |
| 401 | Sin token, token inválido o sesión cerrada |
| 403 | El rol no tiene permiso |
| 404 | El registro no existe o no es visible para el usuario |
| 409 | Correo repetido o transición de estado no permitida |
| 429 | Demasiados intentos de login |

---

## 🌿 Trabajo colaborativo (Git y GitHub)

- `main` contiene siempre una versión que funciona.
- Cada funcionalidad se desarrolla en su propia rama (`feature/...`, `docs/...`, `test/...`) y se integra con un **Pull Request** revisado por otro integrante.
- Los mensajes de commit siguen Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

| Rama | Responsable | Contenido |
|---|---|---|
| `feature/migracion-nestjs` | Todo el equipo | Migración a NestJS, autenticación, reportes |
| `feature/documentacion-y-errores` | Leider Cadena | Filtro de errores, lint, README y Postman |
| `feature/mejoras-autenticacion` | Samuel Moreno | Logout persistente, perfil, contraseña y pruebas de autenticación |
| `feature/bloquear-edicion-cerrados`, `feature/pruebas-reportes`, `feature/pruebas-e2e-reportes`, `feature/diagrama-casos-uso` | Miguel Pantoja | Reportes cerrados, pruebas de reportes y diagrama de casos de uso |

---

## 🎬 Video presentaciones de cada integrante

<!-- Cada integrante reemplaza su PEGAR_LINK_DRIVE_AQUI por el enlace de su video en Google Drive
     (Compartir → "Cualquier persona con el enlace" → Lector) y lo sube en su propia rama con un Pull Request. -->

<div align="center">

<table>
  <tr>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Leider<br>Cadena</b><br>
      <sub>Base del proyecto y documentación</sub><br><br>
      <a href="PEGAR_LINK_DRIVE_AQUI"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video en Google Drive" /></a>
    </td>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Samuel<br>Moreno</b><br>
      <sub>Usuarios y autenticación</sub><br><br>
      <a href="https://drive.google.com/file/d/1lyMhqWux3eIHlVcKZ1vPzuRpl-fP7YFH/view?usp=sharing"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video en Google Drive" /></a>
    </td>
    <td align="center" width="33%">
      <h3>🎥</h3>
      <b>Miguel<br>Pantoja</b><br>
      <sub>Reportes, comentarios y pruebas</sub><br><br>
      <a href="https://drive.google.com/file/d/1IYYzGXDw7K02prggktS5I5WMvHdwgXf5/view?usp=sharing"><img src="https://img.shields.io/badge/Google%20Drive-Ver%20video-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Ver video en Google Drive" /></a>
    </td>
  </tr>
</table>

</div>
