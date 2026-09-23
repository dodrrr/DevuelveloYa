# Actualizar la app en Replit

1. Sube `actualizar-devuelveloya-v2.sh` a **Files**, en la raíz del proyecto, junto a `package.json` y `pnpm-workspace.yaml`.
2. Abre **Shell** desde esa misma raíz y ejecuta:

   ```bash
   bash actualizar-devuelveloya-v2.sh
   ```

3. Espera a que termine la instalación de dependencias y la compilación. Si aparece **Actualización y compilación completadas**, comprueba que el proyecto tiene PostgreSQL conectado mediante `DATABASE_URL`. Detén y vuelve a pulsar **Run**. Abre la vista previa y crea una cuenta.

El archivo contiene los cambios reales y funciona sin Replit Agent. Necesita Python 3 y pnpm disponibles en Shell. Solo la instalación de dependencias necesita acceso a la red.

El seguimiento manual funciona sin servicios externos. Para activar correos, lectura de imágenes, búsqueda adicional y ejecución de avisos con la app cerrada, sigue [CONFIGURACION.md](CONFIGURACION.md). El instalador no crea cuentas en proveedores ni configura sus credenciales.

Para comprobar antes la compatibilidad sin escribir archivos:

```bash
bash actualizar-devuelveloya-v2.sh --check
```

La versión corregida admite que `pnpm-lock.yaml` sea diferente. Primero prepara las dependencias en una carpeta temporal, partiendo de tu lockfile y de los manifiestos de la actualización. Esta preparación no ejecuta scripts de paquetes. Después guarda una copia de tu archivo original, aplica el resultado e instala usando el lockfile ya preparado. No borres ni renombres `pnpm-lock.yaml` para resolver este mensaje.

Si hay diferencias en el código o en otros manifiestos de dependencias, se detiene antes de modificar la app. Comparte esos archivos o una versión nueva del repositorio para preparar una actualización compatible. La opción `--check` comprueba los archivos, pero no ejecuta la preparación de dependencias ni garantiza acceso al registro de paquetes.

Cada instalación que modifica archivos guarda una copia de los originales afectados en `.devuelveloya-backups/FECHA-ID/`. El comando exacto para volver atrás aparece en Shell:

```bash
python3 .devuelveloya-backups/FECHA-ID/restaurar.py
```

Sustituye `FECHA-ID` por la carpeta indicada. El restaurador comprueba la copia y se detiene si detecta ediciones posteriores; conserva los archivos ajenos a la actualización. Después ejecuta `pnpm install --frozen-lockfile` y reinicia **Run**. Restaura primero la copia más reciente si aplicaste varias actualizaciones.

Si falla `pnpm install` o la compilación, **la actualización no ha terminado**. Los cambios y su copia se conservan. Revisa el error, vuelve a ejecutar el instalador o usa el comando de restauración. Repetir el instalador no duplica los cambios; puede volver a intentar la instalación y compilación.

El paquete no incluye archivos de entorno, credenciales, dependencias instaladas ni código descargado desde otra URL. Conserva Git y su historial. La copia abarca los archivos que actualiza; no sustituye una copia de la base de datos ni de tus documentos.

## Mantenimiento del paquete

Desde el repositorio con los cambios finales sin hacer commit:

```bash
python3 scripts/build-installer.py --output /ruta/absoluta/actualizar-devuelveloya-v2.sh
python3 tests/test-installer.py
```

El builder toma los cambios respecto de `HEAD` y los archivos nuevos no ignorados. Rechaza eliminaciones; excluye rutas protegidas y artefactos temporales. `--skip-build` solo aplica los archivos, omite dependencias y compilación y sirve para pruebas locales; no acredita que la aplicación arranque. No está permitido si el lockfile necesita adaptación: utiliza la ejecución normal.
