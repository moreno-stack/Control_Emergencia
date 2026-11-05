# API de Control de Emergencias

Backend sencillo para registrar y gestionar reportes. Está hecho con Node.js puro: no usa Express, base de datos externa ni paquetes npm. Los datos se guardan en `data/emergency.json`.

## Iniciar

Requiere Node.js 18 o superior. No necesitas ejecutar `npm install`.

```powershell
Copy-Item .env.example .env
npm start
```

La API estará en `http://localhost:3000`. Puedes cambiar el puerto y archivo de datos en `.env`. Para habilitar una cuenta de administrador, define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 10 caracteres) antes de iniciar. El registro público siempre crea ciudadanos. Un administrador puede crear operadores mediante `POST /api/users`.

## Rutas

| Método | Ruta | Acceso | Función |
|---|---|---|---|
| GET | `/api/health` | Público | Comprobar el servicio |
| POST | `/api/auth/register` | Público | Registrar ciudadano |
| POST | `/api/auth/login` | Público | Iniciar sesión |
| GET | `/api/auth/me` | Sesión | Ver la cuenta actual |
| POST | `/api/auth/logout` | Sesión | Cerrar la sesión actual |
| POST | `/api/users` | Administrador | Crear operador |
| POST | `/api/incidents` | Sesión | Crear reporte |
| GET | `/api/incidents` | Sesión | Listar reportes |
| GET | `/api/incidents/:id` | Sesión | Consultar reporte |
| PATCH | `/api/incidents/:id` | Sesión | Actualizar reporte |

El registro incluye título, categoría, descripción y dirección; la ubicación GPS y teléfono son opcionales. Los ciudadanos ven y editan únicamente sus reportes nuevos. Operadores y administradores pueden gestionar todos. Estados: `new`, `assigned`, `in_progress`, `resolved`, `cancelled`. Prioridades: `low`, `medium`, `high`, `critical`.

Envía el token devuelto al iniciar sesión con `Authorization: Bearer <token>`. Los tokens duran 8 horas y se invalidan al reiniciar el servidor.

## Pruebas

```powershell
npm test
```
