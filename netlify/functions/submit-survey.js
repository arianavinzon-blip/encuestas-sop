// netlify/functions/submit-survey.js
//
// Función serverless que recibe las respuestas de las encuestas
// (Torres de Control y S&OP / Revisión de Suministro), las guarda como
// JSON en este mismo repo de GitHub y envía un correo de notificación.
//
// Variables de entorno requeridas (ver README-BACKEND.md):
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
//   GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_EMAIL

const nodemailer = require('nodemailer');

// ---- Defaults / configuración ----
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'MegaS-OP';
const GITHUB_REPO = process.env.GITHUB_REPO || 'encuestas-sop';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'avinzon@megalabs.global';

// Nombres legibles de cada encuesta, usados en el asunto/cuerpo del correo.
const ENCUESTA_LABELS = {
  'torres-control-sop': 'Torres de Control y S&OP',
  'revision-suministro-sop': 'Revisión de Suministro',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { ok: false, error: 'Método no permitido' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return respond(400, { ok: false, error: 'JSON inválido en el body' });
  }

  // ---- Validación de campos ----
  const { encuesta, nombre, compania, planta } = data;

  if (!encuesta || !nombre) {
    return respond(400, { ok: false, error: 'Faltan campos requeridos: encuesta y nombre' });
  }
  if (encuesta === 'torres-control-sop' && !compania) {
    return respond(400, { ok: false, error: 'Falta el campo requerido: compania' });
  }
  if (encuesta === 'revision-suministro-sop' && !planta) {
    return respond(400, { ok: false, error: 'Falta el campo requerido: planta' });
  }
  if (!ENCUESTA_LABELS[encuesta]) {
    return respond(400, { ok: false, error: 'Valor de encuesta desconocido' });
  }

  // ---- Generar id único: timestamp ISO + slug del nombre ----
  const submittedAt = data.submittedAt || new Date().toISOString();
  const id = `${slugifyTimestamp(submittedAt)}_${slugify(nombre)}`;

  // ---- Parte 1: guardar en GitHub ----
  try {
    await saveToGitHub(encuesta, id, data);
  } catch (err) {
    console.error('Error guardando en GitHub:', err.message);
    return respond(500, { ok: false, error: 'No se pudo guardar la respuesta. Intentá nuevamente.' });
  }

  // ---- Parte 2: notificación por correo (no debe hacer fallar la respuesta) ----
  try {
    await sendNotificationEmail(data);
  } catch (err) {
    console.error('Error enviando el correo de notificación:', err.message);
  }

  return respond(200, { ok: true, id });
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// Convierte un ISO timestamp en un fragmento apto para nombre de archivo,
// ej: "2026-08-04T15:32:00.123Z" -> "2026-08-04T15-32-00"
function slugifyTimestamp(isoString) {
  const iso = new Date(isoString).toISOString();
  return iso.slice(0, 19).replace(/:/g, '-');
}

// Convierte un nombre de persona en un slug apto para nombre de archivo/URL.
function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'anonimo';
}

// Guarda la respuesta completa como JSON en el repo, vía la API de
// contenidos de GitHub (PUT /repos/{owner}/{repo}/contents/{path}).
async function saveToGitHub(encuesta, id, data) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN no está configurado');
  }

  const path = `respuestas/${encuesta}/${id}.json`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf-8').toString('base64');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'encuestas-sop-netlify-function',
    },
    body: JSON.stringify({
      message: `Nueva respuesta: ${encuesta} — ${id}`,
      content,
      branch: GITHUB_BRANCH,
    }),
  });

  if (!res.ok) {
    // No exponemos el detalle crudo (podría filtrar info del token/API) en la respuesta al cliente,
    // pero sí lo logueamos server-side para debug.
    const errBody = await res.text().catch(() => '');
    throw new Error(`GitHub API respondió ${res.status}: ${errBody.slice(0, 300)}`);
  }
}

// Envía el correo de notificación con el contenido de la encuesta en texto plano.
async function sendNotificationEmail(data) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD no están configurados');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  const label = ENCUESTA_LABELS[data.encuesta] || data.encuesta;
  const referencia = data.encuesta === 'revision-suministro-sop' ? data.planta : data.nombre;
  const subject = `Nueva respuesta — ${label} (${referencia})`;

  await transporter.sendMail({
    from: `"Encuestas S&OP" <${gmailUser}>`,
    to: process.env.NOTIFY_EMAIL || NOTIFY_EMAIL,
    subject,
    text: buildEmailBody(data, label),
  });
}

// Arma el cuerpo del correo en texto plano, agrupado por sección (igual que el formulario).
function buildEmailBody(data, label) {
  const fecha = new Date(data.submittedAt || Date.now()).toLocaleString('es-UY');
  let out = `ENCUESTA — ${label.toUpperCase()}\n`;
  out += `Nombre: ${data.nombre || '(sin nombre)'}\n`;
  if (data.compania) out += `Compañía: ${data.compania}\n`;
  if (data.planta) out += `Planta: ${data.planta}\n`;
  out += `Completada el: ${fecha}\n`;
  out += '='.repeat(46) + '\n\n';

  (data.sections || []).forEach((s) => {
    out += `${s.code} — ${s.title}\n${'-'.repeat(30)}\n`;
    (s.questions || []).forEach((q) => {
      out += `- ${q.question}: ${q.answer || '(sin responder)'}\n`;
    });
    out += '\n';
  });

  return out;
}
