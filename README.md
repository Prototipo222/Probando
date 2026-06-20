# ICA Digital Hub

## Autenticación

- El sitio incluye registro, login local, login con Google y edición de perfil.
- Para producción se recomienda usar una base de datos real como Supabase.
- El archivo `.env.example` contiene las variables necesarias para configuración futura.

## Despliegue recomendado

- Frontend: Netlify (sitio estático)
- Backend: Netlify Functions o un servidor Node compatible
- Base de datos: Supabase

## Cómo subirlo a Netlify

1. Crea un repositorio en GitHub con este proyecto.
2. En Netlify, selecciona **New site from Git**.
3. Conecta el repositorio y elige la rama principal.
4. En **Build settings**:
   - Build command: `npm install`
   - Publish directory: `.`
5. En **Site settings > Environment variables**, agrega:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_CLIENT_ID`
   - `NODE_ENV=production`
6. Haz deploy.

## Cómo conectarlo con Supabase

1. Crea un proyecto en Supabase.
2. Ve a **Project Settings > API** y copia:
   - `URL`
   - `service_role` key
3. Crea la tabla `users` con esta estructura:
   - `id` (uuid, primary key)
   - `fullName` (text)
   - `email` (text, unique)
   - `provider` (text)
   - `photoUrl` (text)
   - `passwordHash` (text)
   - `passwordSalt` (text)
   - `createdAt` (timestamp)
4. En Supabase, puedes dejar la tabla sin restricciones fuertes si el backend usa la service role key.

## Cómo habilitar Google Login

1. En Google Cloud Console crea un proyecto.
2. Activa **Google Identity Services**.
3. Crea un OAuth client ID.
4. Agrega tus dominios de Netlify y localhost en **Authorized JavaScript origins**.
5. Agrega las URLs correctas en **Authorized redirect URIs** si aplica.
6. Copia el Client ID en `GOOGLE_CLIENT_ID`.

## Seguridad recomendada

- Usa HTTPS siempre.
- Nunca expongas secretos en el frontend.
- Mantén la `service role key` solo en variables de entorno del backend.
- Usa una política de acceso segura si luego agregas datos sensibles.
