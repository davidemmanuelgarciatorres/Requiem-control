# REQUIEM CONTROL en GitHub Codespaces (desde el teléfono)

Codespaces es una computadora en la nube de GitHub. Aquí corre la app completa (API, página y base de datos
PostgreSQL privada) y la abres desde el navegador del teléfono. No se publica nada: la dirección es privada y
solo entras tú con tu sesión de GitHub.

**Costo:** las cuentas personales de GitHub tienen horas gratis de Codespaces cada mes. Con el límite de gasto en
$0 (el valor por defecto en cuentas personales) GitHub no cobra: el Codespace simplemente se detiene si se
acaban las horas. Se apaga solo tras 30 minutos sin uso.

## 1. Guarda tus secretos en GitHub (una sola vez)
En el navegador del teléfono (si algo no aparece, en Chrome activa ⋮ → "Sitio de escritorio"):

1. github.com → tu foto → **Settings** → **Codespaces** → **Secrets** → **New secret**.
2. Crea estos secretos y en "Repository access" elige el repositorio **Requiem-control**:
   - `GOOGLE_OAUTH_CLIENT_ID` → tu ID de cliente de Google.
   - `GOOGLE_OAUTH_CLIENT_SECRET` → tu secreto de cliente de Google.
   - `GEMINI_API_KEY` → opcional, tu clave de Gemini (si no la pones, la IA queda en modo simulado).

Los secretos quedan cifrados en GitHub y no se escriben en el código. **Nunca los pegues en un chat.**

## 2. Crea el Codespace
1. Abre el repositorio en GitHub y cambia la rama a **`claude/requiem-control-spec-f0630a`**.
2. Botón verde **Code** → pestaña **Codespaces** → **Create codespace on claude/requiem-control-spec-f0630a**.
3. La primera vez tarda unos minutos: instala Python, Node, PostgreSQL y todo lo necesario.
4. Al terminar, la app arranca sola. En la terminal verás un recuadro con **la dirección** de tu app y la
   **URI de redireccionamiento** para Google. También la encuentras en la pestaña **Puertos** → puerto
   **5173** → ícono del globo (abrir en el navegador).

## 3. Registra la dirección en Google (una vez por Codespace)
Google Cloud → Google Auth Platform → **Clientes** → **requiem-web** y agrega las dos líneas del recuadro:
- Orígenes autorizados de JavaScript: `https://<tu-codespace>-5173.app.github.dev`
- URI de redireccionamiento: `https://<tu-codespace>-5173.app.github.dev/api/integrations/google/callback`

Toca **Guardar**. Google puede tardar unos minutos en aplicar el cambio. Mientras uses el mismo Codespace, la
dirección no cambia. Si creas uno nuevo, tendrás que agregar su nueva dirección.

## 4. Prueba la conexión real
1. Abre la dirección de tu app, crea tu cuenta y entra.
2. **Integraciones** → elige Sheets (y Drive/Gmail si quieres) → **Conectar con Google**.
3. Google mostrará "Google no verificó esta app": es normal mientras la app está en modo **Prueba**.
   Toca **Avanzado** → **Ir a REQUIEM CONTROL** y acepta los permisos (todos son de solo lectura).
4. Volverás a REQUIEM con el mensaje "Google quedó conectado". Busca una hoja e impórtala.

## Si algo falla
- Vuelve a arrancar: en la terminal escribe `bash scripts/codespace-start.sh`.
- Registros: `/tmp/requiem-api.log` (API) y `/tmp/requiem-web.log` (página).
- Si al conectar aparece `redirect_uri_mismatch`, la dirección registrada en Google no es exactamente la del
  recuadro (revisa `https`, el nombre del Codespace y que no sobre una `/` al final).
- Para ahorrar horas: GitHub → Codespaces → ⋯ → **Stop codespace** cuando termines.
