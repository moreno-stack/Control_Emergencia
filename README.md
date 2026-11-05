# API de Control de Emergencias

Backend sencillo para registrar y gestionar reportes. Está hecho con Node.js puro: no usa Express, base de datos externa ni paquetes npm. Los datos se guardan en `data/emergency.json`.

## Iniciar

Requiere Node.js 18 o superior. No necesitas ejecutar `npm install`.

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
npm start
```

```bash
# Linux / macOS
cp .env.example .env
npm start
```

La API estará en `http://localhost:3000`. Puedes cambiar el puerto, el archivo de datos y la zona horaria (`TIMEZONE`, por defecto `America/Bogota`) en `.env`. Para habilitar una cuenta de administrador, define `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 10 caracteres) antes de iniciar. El registro público siempre crea ciudadanos. Un administrador puede crear operadores mediante `POST /api/users`.

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

El registro incluye título, categoría, descripción y dirección; la ubicación GPS y teléfono son opcionales. Los ciudadanos ven y editan únicamente sus reportes mientras están nuevos, y pueden cancelarlos enviando `{ "status": "cancelled" }` (por ejemplo, ante una falsa alarma). Operadores y administradores pueden gestionar todos. Prioridades: `low`, `medium`, `high`, `critical`; solo el personal operativo puede definirlas (los reportes de ciudadanos inician en `medium`).

### Filtros de la lista de reportes

| Parámetro | Ejemplo | Descripción |
|---|---|---|
| `status`, `priority`, `category` | `?status=new` | Filtra por valor exacto |
| `q` | `?q=incendio` | Busca en título, descripción y dirección |
| `from`, `to` | `?from=2026-11-01&to=2026-11-05` | Fechas `YYYY-MM-DD` en la zona horaria configurada |
| `near`, `radius` | `?near=1.2142,-77.2811&radius=3` | Reportes a menos de `radius` km (por defecto 5, máximo 100), ordenados por cercanía e incluyen `distanceKm` |
| `page`, `limit` | `?page=2&limit=20` | Paginación (`limit` máximo 100) |

### Estados

```
new ──► assigned ──► in_progress ──► resolved
 │  ◄──    │      ◄──     │
 └─────────┴──────────────┴──────► cancelled
```

Los cambios no permitidos (por ejemplo, de `new` a `resolved`, o reabrir un reporte resuelto) responden `409 INVALID_STATUS_TRANSITION` con la lista de estados permitidos. Al asignar un responsable a un reporte nuevo pasa automáticamente a `assigned`, y al quitarlo vuelve a `new`.

El historial registra quién creó o modificó cada reporte y qué campos cambiaron. Los archivos de datos existentes se amplían automáticamente al guardar nuevos cambios.

Envía el token devuelto al iniciar sesión con `Authorization: Bearer <token>`. Los tokens duran 8 horas y se invalidan al reiniciar el servidor. Tras 10 intentos de inicio de sesión fallidos desde la misma IP en 15 minutos, el login se bloquea temporalmente; un inicio de sesión correcto reinicia el contador.

## Pruebas

```powershell
npm test
```
