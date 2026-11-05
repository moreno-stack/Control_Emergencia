# Control de Emergencias — API

Backend REST para registrar y dar seguimiento a reportes de emergencia. Incluye autenticación con JWT, roles de ciudadano/operador/administrador y almacenamiento SQLite.

## Requisitos

- Node.js 22 o superior
- npm

## Instalación y ejecución

```powershell
npm install
Copy-Item .env.example .env
```

Configura `JWT_SECRET` en `.env` con un valor aleatorio de al menos 32 caracteres. No compartas ni subas ese archivo. Luego inicia el servidor:

```powershell
npm run dev
```

La API escucha en `http://localhost:3000` por defecto. La base de datos se crea automáticamente en `DATABASE_PATH`.

Para crear un administrador, configura temporalmente las variables `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` y ejecuta:

```powershell
npm run create-admin
```

La contraseña debe tener al menos 10 caracteres. El comando crea una cuenta administrativa y falla si el correo ya está registrado.

## Autenticación

Registra ciudadanos en `POST /api/auth/register` y obtén un token en `POST /api/auth/login`. Envía el token en las rutas protegidas:

```http
Authorization: Bearer <token>
```

El registro público siempre crea cuentas de ciudadano; los roles operativos se crean fuera del registro público.

## Rutas principales

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/health` | Público | Estado del servicio |
| POST | `/api/auth/register` | Público | Crear cuenta de ciudadano |
| POST | `/api/auth/login` | Público | Iniciar sesión |
| GET | `/api/auth/me` | Autenticado | Consultar la cuenta actual |
| POST | `/api/incidents` | Autenticado | Crear reporte |
| GET | `/api/incidents` | Autenticado | Listar reportes (ciudadano: propios) |
| GET | `/api/incidents/:id` | Autenticado | Consultar reporte |
| PATCH | `/api/incidents/:id` | Autenticado | Editar reporte o gestionar su estado |

Los operadores y administradores pueden consultar y gestionar todos los reportes. Los ciudadanos pueden editar sus propios reportes mientras estén nuevos. No se permite borrar reportes, para preservar el historial operativo.

Los estados son `new`, `assigned`, `in_progress`, `resolved` y `cancelled`; las prioridades son `low`, `medium`, `high` y `critical`.

## Pruebas

```powershell
npm test
```
