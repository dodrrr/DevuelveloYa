# Configuración de DevuélveloYa

## Arranque mínimo

Conecta una base de datos **PostgreSQL** al proyecto y comprueba que Replit facilita `DATABASE_URL`. Usa la conexión real del proyecto; no copies claves al código ni a GitHub. La aplicación crea sus tablas `dvy_*` al arrancar: esa conexión necesita permisos para crearlas y para leer y escribir sus datos. No hace falta ejecutar un comando de borrado ni sustituir la base de datos.

Después de aplicar el instalador, pulsa **Run**. También puedes iniciar desde Shell con `pnpm dev`. Si aparece «Falta DATABASE_URL», configura la base de datos y reinicia. Crea una cuenta y añade una compra manual para comprobar que vuelve a aparecer al recargar.

En **Tu espacio → Apariencia y región**, confirma tu zona horaria y país. Los plazos se guardan como fechas; deja vacío lo que aún no conoces o marca una estimación como tal.

## Variables opcionales

Añade las variables en los secretos del entorno que ejecutará la app. Usa tus credenciales reales de cada proveedor y reinicia después de cambiarlas.

| Variable | Para qué se usa |
| --- | --- |
| `APP_URL` | URL pública HTTPS de la app, sin usuario, contraseña ni parámetros. Debe coincidir con el origen desde el que abres la web; se usa en los emails y para proteger las operaciones de la sesión. |
| `POSTMARK_SERVER_TOKEN` | Token del servidor de Postmark que enviará los emails. |
| `POSTMARK_FROM` | Dirección remitente autorizada en Postmark. |
| `POSTMARK_MESSAGE_STREAM` | Stream de salida, si usas uno distinto de `outbound`. |
| `INBOUND_DOMAIN` | Dominio receptor de los correos reenviados, sin `@`. Debe estar configurado para recibir en Postmark. |
| `POSTMARK_WEBHOOK_USER` | Usuario que debe enviar Postmark en la autenticación HTTP Basic del webhook. |
| `POSTMARK_WEBHOOK_PASSWORD` | Contraseña de esa autenticación HTTP Basic. |
| `OPENAI_API_KEY` | Activa la extracción asistida de documentos y texto con la API de OpenAI. |
| `OPENAI_EXTRACTION_MODEL` | Opcional: modelo compatible con los tipos de archivo y la salida estructurada usados por la implementación. Si no se define, se usa el valor configurado en `import-parser.ts`. |
| `BRAVE_SEARCH_API_KEY` | Activa la búsqueda adicional de páginas de devolución de tiendas no registradas. |
| `CRON_SECRET` | Secreto propio para autorizar el endpoint de tareas programadas. No es una clave de un proveedor. |

Los secretos del editor y del despliegue deben configurarse en sus respectivos entornos. Si `APP_URL` apunta al despliegue y estás usando otra URL de vista previa, las operaciones pueden fallar con «El origen de la solicitud no es válido». Usa el valor correspondiente a cada entorno; no desactives esa comprobación.

## Correos salientes y avisos

Configura el servidor y el remitente en Postmark y añade `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` y `APP_URL`. En la app, entra en **Tu espacio**, pulsa **Verificar**, abre el enlace recibido y confirma. Después puedes activar **Avisos a tu medida → También por correo**.

Sin este servicio funcionan el registro, el acceso con contraseña y el seguimiento manual. La verificación y la recuperación de contraseña por email necesitan un envío operativo. Los avisos dentro de la app también necesitan que se ejecuten las tareas descritas en **Programador y despliegue**.

El estado «Activo» de un proveedor indica que se ha detectado su configuración; no acredita que el proveedor haya entregado un email. Comprueba un envío real y su resultado en Postmark. Las entregas de resultado incierto no se reenvían automáticamente para evitar duplicados.

## Reenvío de tickets por email

Configura la recepción del dominio indicado en `INBOUND_DOMAIN` y haz que Postmark envíe sus mensajes entrantes mediante `POST` a `/api/webhooks/postmark`, bajo la URL pública de la app. El webhook exige HTTP Basic con el usuario y la contraseña definidos arriba. Guarda esas credenciales en la configuración privada del proveedor.

Con un dominio válido configurado, cada cuenta dispone de una dirección personal en **Tu espacio → Automatizaciones**, también si se registró antes de añadir esa configuración. Verifica tu email y reenvía desde esa misma dirección a tu alias personal. El sistema identifica la cuenta mediante el destinatario, comprueba el remitente declarado y guarda el mensaje para revisarlo. El dominio configurado también debe funcionar en el proveedor; escribir la variable no crea el servicio de correo.

Si cambias `INBOUND_DOMAIN`, configura también la recepción del nuevo dominio en el proveedor. Al consultar la cuenta, la app adapta el dominio del alias conservando su parte aleatoria. Copia la nueva dirección y actualiza tus reglas de reenvío.

La autenticación del webhook acredita la llamada con esas credenciales. **La coincidencia del remitente declarado no autentica el origen SMTP del correo**: el contenido sigue siendo no confiable. No se conecta toda la bandeja de Gmail u Outlook. Los correos entrantes y sus adjuntos tampoco disparan lecturas de pago con IA por sí solos; esa lectura necesita una solicitud explícita del usuario conectado.

Los mensajes en cola se procesan al ejecutar las tareas. Se admiten hasta cinco adjuntos compatibles por mensaje; los incompatibles se omiten. Conserva el correo original.

## Lectura de documentos y enlaces

TXT y EML tienen una extracción local básica. Para fotos y PDF, configura `OPENAI_API_KEY`: al pedir lectura asistida, el contenido se envía a OpenAI y puede generar consumo en tu cuenta. Comprueba los datos extraídos, corrige los importes, unidades y fechas y pulsa **Guardar**. Ninguna extracción registra automáticamente una devolución.

Sin IA, los PDF y las imágenes se guardan, pero no se leen: copia su texto o introduce la compra a mano. Una lectura vacía o fallida necesita corrección manual o un reintento explícito; añadir una clave no vuelve a procesar automáticamente documentos anteriores. Con IA configurada, abre **Importaciones recientes → Revisar** y, si no hay artículos extraídos, pulsa **Leer con IA**. Esto también autoriza la lectura asistida de un documento recibido por correo. Cuando la app indique que el documento ya no admite reintento, adjúntalo de nuevo.

La búsqueda prioriza enlaces de correos revisados que pertenezcan a dominios admitidos y fuentes de ayuda de Zara, Mango, H&M, IKEA y Decathlon en España. Distingue entre:

- **Ayuda o política oficial:** explica condiciones; no inicia la devolución ni confirma el plazo de tu pedido.
- **Enlace del correo:** puede llevar al portal de una devolución, pero su validez, pedido y caducidad requieren comprobación. No se abre automáticamente.
- **Resultado de búsqueda adicional:** usa Brave si está configurado y se presenta como pendiente de verificar. Comprueba el dominio desde tu pedido original antes de introducir datos.

El país, canal de compra y vendedor de un marketplace pueden cambiar el procedimiento. La aplicación no inicia sesión en las tiendas ni solicita devoluciones en tu nombre. El transporte, el dinero recibido y los cambios de estado se registran cuando tú los confirmas.

## Programador y despliegue

La configuración `.replit` sirve la app desplegada con `pnpm start`, después de `pnpm run build:dvy`. El servidor procesa tareas al arrancar y cada minuto, sin solapar sus propias ejecuciones, **mientras el proceso siga activo**. Esto permite procesar correos y avisos al usar la app, pero no mantiene despierto un alojamiento que se pause por inactividad.

Para cubrir esos periodos, programa además una de estas dos opciones con acceso a la misma base de datos y a sus secretos:

- Una tarea del servidor que ejecute `pnpm jobs` desde la raíz del proyecto. No necesita `CRON_SECRET` para ejecutarse por Shell.
- Un programador externo que llame por `POST` a `/api/internal/run-jobs`, con `Authorization: Bearer` seguido del valor real de `CRON_SECRET`. La URL debe ser accesible por HTTPS y el despliegue debe poder atenderla.

Para ejecutar una vez la primera opción:

```bash
pnpm jobs
```

Para comprobar la segunda desde un entorno que ya tenga los secretos configurados:

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL%/}/api/internal/run-jobs"
```

Ejecuta las tareas externas al menos cada hora; un intervalo de 5–15 minutos reduce la espera de los correos entrantes. Comprueba la última ejecución en **Tu espacio → Automatizaciones**: acredita una ejecución pasada, no que el servidor vaya a seguir disponible. Si el alojamiento duerme o se pausa, usa un despliegue que pueda ejecutar las tareas de forma continuada o un programador externo que lo active; verifica el funcionamiento con la vista previa cerrada. La cola persiste en PostgreSQL, pero una cola guardada no garantiza que se ejecute sola.

## Datos, límites y copias

Se admiten PDF, JPG, PNG, WebP, TXT y EML, con un máximo de 8 MB por archivo y 100 MB o 500 documentos por cuenta. Los documentos se guardan en PostgreSQL, no en el disco temporal del servidor.

**Exportar mis datos** descarga los datos y los metadatos en JSON; los archivos originales se descargan individualmente desde sus documentos. No es una exportación completa de la base de datos. Configura las copias de PostgreSQL con tu proveedor de alojamiento y conserva sus condiciones de recuperación.

La copia del instalador permite restaurar los archivos de código afectados. No restaura ni elimina compras, cuentas o documentos de la base de datos. Consulta [cómo volver atrás](INSTALACION.md).
