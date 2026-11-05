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

El registro incluye título, categoría, descripción y dirección; la ubicación GPS y teléfono son opcionales. La lista de reportes admite filtros `status`, `priority`, `category`, búsqueda de texto `q`, fechas `from`/`to` (`YYYY-MM-DD`), y paginación con `page`/`limit`. Los ciudadanos ven y editan únicamente sus reportes nuevos. Operadores y administradores pueden gestionar todos. Estados: `new`, `assigned`, `in_progress`, `resolved`, `cancelled`. Prioridades: `low`, `medium`, `high`, `critical`.

El historial registra quién creó o modificó cada reporte y qué campos cambiaron. Los archivos de datos existentes se amplían automáticamente al guardar nuevos cambios.

Envía el token devuelto al iniciar sesión con `Authorization: Bearer <token>`. Los tokens duran 8 horas y se invalidan al reiniciar el servidor.

## Pruebas

```powershell
npm test
```
