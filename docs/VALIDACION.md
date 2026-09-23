# Validación de esta entrega

Base del instalador: `d3bb06085959f190b3dc9bc105f49bea58a3696c` del repositorio DevuelveloYa.

- Compilación de producción y comprobación de tipos del servidor, interfaz y librerías.
- 62 pruebas automatizadas de dominio, API HTTP, autenticación, aislamiento, documentos, importación, tareas, avisos e idempotencia. Utilizan PostgreSQL embebido con PGlite; no modifican la base de datos del proyecto.
- 24 pruebas del instalador: aplicación, repetición, conflictos, archivos protegidos, integridad, copias, restauración y fallos de compilación. Incluyen la adaptación de un lockfile diferente en una carpeta temporal y la conservación del original si falla la preparación.
- Recorrido real en Chromium: registro, compra de tres unidades por 89,97 EUR, devolución de una unidad, notas, seguimiento de estados, recepción de 29,99 EUR y cierre. Importación de texto con revisión y confirmación. Cambio de tema guardado.
- Revisión visual a 390 px, 320 px y 1360 px, en claro y oscuro. Formularios con campos de 16 px en móvil, navegación inferior y áreas seguras. Comprobación de ausencia de desbordamiento horizontal.

Los datos utilizados en estas pruebas pertenecen a una cuenta temporal local y no se incluyen como compras de ejemplo en la aplicación instalada.

No se han probado envíos reales con Postmark, consumo de OpenAI, búsqueda con Brave, ni el despliegue en tu cuenta de Replit. Necesitan tus credenciales y la comprobación descrita en [CONFIGURACION.md](CONFIGURACION.md). La comprobación visual usa un navegador con tamaños de iPhone; no sustituye una prueba física en Safari de iOS.
