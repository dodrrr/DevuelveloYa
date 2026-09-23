# DevuélveloYa

App web de compras y seguimiento de devoluciones. Diseño adaptado a iPhone, datos reales por cuenta en PostgreSQL y automatizaciones opcionales que muestran su estado de configuración.

## Ejecutar y validar

- `pnpm dev`: comando de **Run**. Inicia Vite en 5000 y la API interna en 3001.
- `pnpm run build:dvy`: comprueba los paquetes utilizados y compila web y servidor.
- `pnpm start`: sirve la compilación web y la API en el mismo origen, puerto 5000 salvo `PORT`.
- `pnpm jobs`: procesa una tanda de importaciones, genera avisos y tramita la cola de emails.
- `pnpm run test:dvy`: pruebas de dominio, backend y automatizaciones con fixtures aisladas.
- `python3 tests/test-installer.py`: pruebas del instalador y restaurador con repositorios temporales.

Node.js 24 y pnpm 10.26 o posterior. Se requiere `DATABASE_URL`; el arranque crea las tablas `dvy_*` necesarias. Las instrucciones de usuario están en [README.md](README.md), [instalación](docs/INSTALACION.md) y [configuración](docs/CONFIGURACION.md).

## Mapa del código

| Ruta | Responsabilidad |
| --- | --- |
| `artifacts/mockup-sandbox/src/dvy/` | Interfaz React: compras, devoluciones, formularios y cuenta. |
| `artifacts/mockup-sandbox/src/dvy/app.css` | Diseño, modo oscuro y adaptación a móvil de DevuélveloYa. |
| `lib/domain/src/index.ts` | Tipos, fechas, monedas, cantidades y reglas compartidas. |
| `artifacts/api-server/src/dvy/store.ts` | Persistencia PostgreSQL, cuentas, sesiones, documentos y operaciones por propietario. |
| `artifacts/api-server/src/dvy/auth.ts` | Contraseñas, sesiones, protección de operaciones y recuperación de acceso. |
| `artifacts/api-server/src/dvy/core.ts` | Compras, devoluciones, preferencias, exportación y borrado de cuenta. |
| `artifacts/api-server/src/dvy/automation.ts` | Cola de importaciones, revisión, webhooks, búsqueda y estado de capacidades. |
| `artifacts/api-server/src/dvy/import-parser.ts` | Extracción local y asistida; validación de archivos. |
| `artifacts/api-server/src/dvy/merchants.ts` | Registro de fuentes oficiales por país y búsqueda adicional. |
| `artifacts/api-server/src/dvy/safe-fetch.ts` | Restricciones de destinos y consulta de páginas públicas registradas. |
| `artifacts/api-server/src/dvy/reminders.ts` | Avisos según zona horaria y cola persistente de emails. |
| `artifacts/api-server/src/index.ts` | Arranque y ejecución periódica de tareas mientras el servidor permanece activo. |
| `scripts/build-installer.py` | Genera un instalador autocontenido con cambios respecto de `HEAD`. |

## Decisiones que hay que conservar

- Separar cada cuenta y documento por propietario. PostgreSQL es el almacenamiento de la aplicación; no sustituirlo por datos ficticios ni por memoria del servidor.
- Exigir revisión antes de convertir una extracción en compras. Un plazo desconocido permanece vacío; una estimación debe identificarse.
- Distinguir ayuda oficial, portal del correo y resultados pendientes de verificar. No presentar una URL como autorización ni abrir automáticamente enlaces personales.
- El webhook autenticado no convierte el remitente declarado en prueba de identidad SMTP. Los correos entrantes no autorizan llamadas de pago a IA; requieren acción del usuario conectado.
- Una devolución creada en la app es un seguimiento. No ejecuta acciones en tiendas, transportistas ni bancos. Reembolso emitido y recibido son comprobaciones distintas.
- La cola persiste y se procesa mientras el servidor está activo. Para avisos cuando el alojamiento duerma, configurar además una tarea externa. Una ejecución reciente no demuestra disponibilidad futura.
- No introducir credenciales en código, documentación ni paquetes. El instalador excluye rutas protegidas, preserva Git y guarda una copia de los archivos afectados; las copias de la base de datos corresponden al alojamiento.

## Variables

Obligatoria: `DATABASE_URL`. Opcionales: `APP_URL`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM`, `POSTMARK_MESSAGE_STREAM`, `INBOUND_DOMAIN`, `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_EXTRACTION_MODEL`, `BRAVE_SEARCH_API_KEY` y `CRON_SECRET`. Sus condiciones y pasos reales están en [CONFIGURACION.md](docs/CONFIGURACION.md).
