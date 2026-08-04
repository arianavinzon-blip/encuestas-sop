# Backend de las encuestas (Netlify Function)

Este documento explica cómo dejar operativa la función `netlify/functions/submit-survey.js`,
que guarda cada respuesta de encuesta como un JSON en este repo de GitHub y
además envía un correo de notificación. Todo se configura desde el navegador,
sin necesidad de terminal local.

## 1. Generar un GitHub Personal Access Token

La función necesita un token para poder escribir archivos en este repo
(`respuestas/{encuesta}/{id}.json`) usando la API de GitHub.

1. Entrá a GitHub → hacé clic en tu foto de perfil (arriba a la derecha) →
   **Settings**.
2. En el menú de la izquierda, al final, andá a **Developer settings**.
3. Elegí **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
4. Completá:
   - **Token name**: algo descriptivo, ej. `encuestas-sop-netlify`.
   - **Expiration**: la que prefieras (podés poner una larga, ej. 1 año, y
     regenerarla cuando venza).
   - **Repository access**: elegí **Only select repositories** y seleccioná
     únicamente `MegaS-OP/encuestas-sop`.
   - **Permissions** → **Repository permissions** → buscá **Contents** y
     ponelo en **Read and write**. No hace falta ningún otro permiso.
5. Generá el token y **copialo** (solo se muestra una vez). Este es el valor
   de la variable de entorno `GITHUB_TOKEN`.

## 2. Generar un App Password de Gmail

La función envía el correo de notificación usando la cuenta de Gmail
`GMAIL_USER` vía SMTP, autenticada con un "App Password" (no la contraseña
normal de la cuenta).

1. La cuenta de Gmail que vayas a usar como remitente (`GMAIL_USER`) necesita
   tener la **verificación en dos pasos** activada. Andá a
   [myaccount.google.com/security](https://myaccount.google.com/security) y
   activala si no lo está.
2. Con la verificación en dos pasos activa, andá a
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Creá un nuevo App Password (podés ponerle un nombre como "Netlify
   encuestas-sop").
4. Google te va a mostrar una contraseña de 16 caracteres (sin espacios al
   usarla). Ese es el valor de `GMAIL_APP_PASSWORD`. Guardala en un lugar
   seguro — tampoco se vuelve a mostrar.

## 3. Cargar las variables de entorno en Netlify

Todo se hace desde el sitio en Netlify, sin terminal:

1. Entrá a [app.netlify.com](https://app.netlify.com) y abrí el sitio
   `encuestas-sop`.
2. Andá a **Site configuration** → **Environment variables** (o **Site
   settings** → **Environment variables**, según la versión de la UI).
3. Hacé clic en **Add a variable** y cargá una por una las siguientes:

   | Variable              | Valor                                                            |
   |------------------------|-------------------------------------------------------------------|
   | `GITHUB_TOKEN`         | El token generado en el paso 1                                    |
   | `GITHUB_OWNER`         | `MegaS-OP` (opcional, ya es el default)                          |
   | `GITHUB_REPO`          | `encuestas-sop` (opcional, ya es el default)                     |
   | `GITHUB_BRANCH`        | `main` (opcional, ya es el default)                               |
   | `GMAIL_USER`           | La dirección de Gmail remitente, ej. `tucuenta@gmail.com`         |
   | `GMAIL_APP_PASSWORD`   | El App Password de 16 caracteres generado en el paso 2            |
   | `NOTIFY_EMAIL`         | `avinzon@megalabs.global` (opcional, ya es el default)             |

   Las marcadas como "opcional" solo hace falta cargarlas si querés un valor
   distinto al default que ya tiene la función.

4. Guardá los cambios. Netlify va a re-desplegar el sitio automáticamente al
   agregar/cambiar variables (o podés forzar un **Trigger deploy** desde
   **Deploys** si no lo hace solo).

## 4. Verificar que funciona

Una vez desplegado, completá cualquiera de las dos encuestas
(`index.html` o `revision-suministro.html`) y enviala. Si todo está bien
configurado:

- Se va a crear un archivo nuevo en este repo, dentro de
  `respuestas/torres-control-sop/` o `respuestas/revision-suministro-sop/`
  según la encuesta.
- Vas a recibir un correo en `NOTIFY_EMAIL` con el resumen de la respuesta.

Si algo falla, revisá los logs de la función en Netlify:
**Site → Functions → submit-survey → Function log**.
