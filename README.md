# DevuélveloYa

Una app web para guardar compras, revisar sus plazos y seguir devoluciones y reembolsos, con una interfaz adaptada a iPhone y escritorio.

## Actualizar tu proyecto en Replit

Sube `actualizar-devuelveloya-v2.sh` a **Files**, junto a `package.json`. En **Shell**, desde esa carpeta:

```bash
bash actualizar-devuelveloya-v2.sh
```

Cuando termine correctamente, comprueba que el proyecto tiene una base de datos PostgreSQL conectada mediante `DATABASE_URL`. Detén y vuelve a pulsar **Run**. Crea una cuenta desde la app; la contraseña necesita al menos 12 caracteres.

El instalador guarda una copia de los archivos afectados y se detiene si encuentra cambios incompatibles. Consulta [instalación y restauración](docs/INSTALACION.md).

## Qué puedes hacer

- Guardar y editar compras, unidades, vendedor, fechas y documentos; buscar y filtrar lo pendiente.
- Revisar artículos extraídos de un texto o email antes de guardarlos. Con la lectura asistida configurada, también de fotos y PDF.
- Consultar fuentes oficiales de devoluciones y enlaces encontrados en tus propios correos, con su procedencia y las comprobaciones pendientes visibles.
- Registrar devoluciones parciales, fechas de envío, notas y justificantes; distinguir el reembolso emitido del dinero recibido.
- Ajustar modo claro u oscuro, país, zona horaria y anticipación de los avisos. Exportar los datos en JSON o eliminar la cuenta.

La cuenta y los documentos se guardan en PostgreSQL. No necesitas claves de servicios externos para registrar compras manualmente y usar el seguimiento. La lectura avanzada, la recepción de emails y los avisos por correo necesitan configuración adicional.

La app no inicia por sí sola devoluciones en las tiendas, no crea etiquetas de transporte ni comprueba movimientos bancarios. Una página de ayuda oficial no equivale a una autorización de devolución. Los estados, importes y plazos necesitan tu comprobación.

## Activar las automatizaciones

Sigue la [guía de configuración](docs/CONFIGURACION.md) para Postmark, OpenAI, Brave y las tareas programadas. Los avisos y las importaciones se procesan mientras el servidor está activo. **Para cubrir los periodos en que el alojamiento duerma**, configura también una tarea externa que ejecute `pnpm jobs` o llame al endpoint protegido. En **Tu espacio → Automatizaciones** puedes consultar la configuración detectada y la última ejecución.

## Desarrollo

Requiere Node.js 24, pnpm 10.26 o posterior y PostgreSQL. Python 3 solo se utiliza para el instalador y sus pruebas.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` sirve la web en el puerto 5000 y la API interna en el 3001. Para validar y compilar:

```bash
pnpm run test:dvy
python3 tests/test-installer.py
pnpm run build:dvy
```

`pnpm start` sirve la compilación web y la API juntas. El mapa del proyecto está en [replit.md](replit.md).
