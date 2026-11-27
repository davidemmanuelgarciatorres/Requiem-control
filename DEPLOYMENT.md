# Publicar REQUIEM CONTROL (producción)

Nada de esto se ha contratado ni activado. Cada paso con costo requiere tu autorización.

## 1. Qué se publica

| Servicio | Qué hace | Imagen |
|---|---|---|
| `web` | Página (React) servida por nginx con encabezados de seguridad; reenvía `/api` a la API (mismo dominio) | `frontend/Dockerfile` |
| `api` | FastAPI; `EXECUTION_MODE=worker` (solo encola) | `backend/Dockerfile` |
| `worker` | Ejecuta agentes, automatizaciones y recupera ejecuciones interrumpidas (`python -m app.worker`) | `backend/Dockerfile` |
| `migrate` | `alembic upgrade head` con el rol dueño (una vez por despliegue) | `backend/Dockerfile` |
| `db` | PostgreSQL 16 con dos roles: `requiem_owner` (migraciones) y `requiem_app` (sin superusuario ni BYPASSRLS) | `postgres:16-alpine` |

Todo está en `docker-compose.prod.yml` y se probó completo con Docker en desarrollo: compilación, migraciones, página,
API, CSP en un navegador real, cookie `Secure`, rechazo de orígenes ajenos, roles sin privilegios, usuario no-root,
respaldo y restauración.

## 2. Opciones de hosting (precios aproximados; verifícalos al contratar)

| Opción | Costo aprox. | Para quién |
|---|---|---|
| **VPS con Docker** (Hetzner, DigitalOcean, Linode…) + `docker compose` | US$5–12/mes + dominio | Lo más económico y simple de operar con este repositorio |
| **Render**: sitio estático + web service + background worker + PostgreSQL | US$7 por servicio de pago + base de datos | Sin administrar servidores |
| Base de datos administrada (Neon, Supabase, Render) | Capa gratuita con límites; de pago al crecer | Respaldos automáticos del proveedor |
| Dominio (`.mx` o `.com`) | US$10–25/año | Obligatorio para HTTPS y Google/Stripe |

HTTPS es obligatorio: la app se niega a arrancar en producción sin `COOKIE_SECURE=true`, con orígenes `http://` o con
contraseñas de desarrollo. En un VPS pon delante Caddy o Cloudflare (certificados gratis).

## 3. Pasos (VPS con Docker)
1. Instala Docker y clona el repositorio.
2. `cp .env.production.example .env.production` y complétalo (contraseñas largas y únicas, tu dominio en
   `PUBLIC_APP_URL` y `ALLOWED_ORIGINS`). **Nunca lo subas a Git.**
3. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
4. Apunta tu dominio al servidor y pon HTTPS delante del puerto 8080.
5. Abre `https://tu-dominio/`, crea tu cuenta y revisa **Configuración → Estado del sistema**.

## 4. Cobros con Stripe (Premium MXN $400/mes)
1. Crea tu cuenta en stripe.com (México). Trabaja primero en **modo de prueba**: no mueve dinero.
2. Productos → crea “REQUIEM Premium” con precio **recurrente mensual de 400 MXN**. Copia el ID del precio (`price_…`).
3. Desarrolladores → Claves API: copia la clave secreta de prueba (`sk_test_…`).
4. Desarrolladores → Webhooks → Agregar endpoint: `https://tu-dominio/api/billing/webhook/stripe` con los eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`. Copia el secreto de firma (`whsec_…`).
5. Configuración → Portal de clientes: activa cancelar suscripción y actualizar método de pago.
6. En `.env.production`: `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PREMIUM`.
7. Prueba con la tarjeta de prueba de Stripe `4242 4242 4242 4242`. Cuando todo funcione, repite con las claves reales.

Stripe cobra una comisión por transacción (consulta su tarifa vigente para México). REQUIEM nunca ve ni guarda datos de
tarjetas: el pago ocurre en la página de Stripe y el plan solo cambia con un webhook firmado y verificado.

## 5. Google en producción
Agrega en tu cliente OAuth el origen `https://tu-dominio` y la redirección
`https://tu-dominio/api/integrations/google/callback`. Para ofrecer Gmail a clientes externos, Google exige verificar la
app (permisos “restringidos”); mientras tanto funciona con los usuarios de prueba que registres.

## 6. Respaldos
- `deploy/backup.sh /ruta/respaldos 30` — respaldo comprimido, verificado y con retención de 30 días.
- Prográmalo cada noche (cron) y copia los archivos **fuera del servidor** (contienen datos de clientes).
- Ensaya la restauración cada mes: `deploy/restore.sh archivo.dump requiem_restore` (restaura en una base nueva).

## 7. Monitoreo
- Salud: `GET https://tu-dominio/api/health` (incluye la base de datos). Configura un monitor externo (hay gratuitos).
- Registros: `docker compose -f docker-compose.prod.yml logs -f api worker`.
- Los errores del servidor se registran sin datos sensibles; el cliente solo recibe un mensaje genérico.

## 8. Lista de verificación antes de lanzar
- [ ] HTTPS en el dominio; `COOKIE_SECURE=true`; `ENVIRONMENT=production` (la app valida lo demás al arrancar).
- [ ] Contraseñas de base de datos únicas; `.env.production` fuera de Git y con permisos restringidos.
- [ ] Stripe en modo real solo después de probar el flujo completo en modo de prueba.
- [ ] Respaldos nocturnos funcionando y una restauración ensayada.
- [ ] Monitor de `/api/health` y correo de alerta.
- [ ] Revisión de Estado del sistema (IA, Google, cobros, worker).
- [ ] Aviso de privacidad y términos de servicio publicados (requisito legal; no incluidos en este repositorio).
