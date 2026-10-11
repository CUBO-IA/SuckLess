// assets/js/api.js — capa única de datos para todo el panel.
// USE_MOCK=true sirve los JSON de /mock (Etapa 0). Al conectar el backend
// real, poner USE_MOCK=false y ajustar las rutas si cambian. Los módulos de
// UI solo importan de aquí; nunca llaman a fetch por su cuenta.
//
// Reglas del contrato (docs/contrato-api.md):
// - Toda respuesta de error HTTP >= 400 es { error: { code, message } }.
// - Todo rechazo de api() es un ApiError con code uniforme
//   (TIMEOUT | EMPTY_RESPONSE | NOT_FOUND | VALIDATION | OVERSIZED_BODY |
//    UPSTREAM_5XX | INTERNAL). Nunca TypeError ni SyntaxError crudos.
// - timeoutMs (default 15000): aborta y produce ApiError code=TIMEOUT.
// - Respuestas sin cuerpo útil o JSON vacío producen code=EMPTY_RESPONSE.

export const USE_MOCK = true;

const DEFAULT_TIMEOUT_MS = 15_000;

// Simulación de latencia de red para que los estados de loading sean reales.
const MOCK_DELAY_MS = 300;

const HTTP_TO_CODE = {
  400: 'VALIDATION',
  404: 'NOT_FOUND',
  409: 'VALIDATION',
  413: 'OVERSIZED_BODY',
  415: 'VALIDATION',
  422: 'VALIDATION',
  500: 'INTERNAL',
  502: 'UPSTREAM_5XX',
  503: 'UPSTREAM_5XX',
  504: 'TIMEOUT',
};

class ApiError extends Error {
  /**
   * @param {string} code  código uniforme del contrato (§1.2)
   * @param {string} message  texto listo para mostrar (role=alert)
   * @param {number|null} httpStatus  status HTTP si lo hubo
   * @param {unknown|null} body  cuerpo crudo si lo hubo
   */
  constructor(code, message, httpStatus = null, body = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

/** Mapea un status HTTP a un code del contrato. */
export function mapHttpStatusToCode(status) {
  if (status >= 400 && status < 500 && !(status in HTTP_TO_CODE)) return 'VALIDATION';
  return HTTP_TO_CODE[status] ?? 'UPSTREAM_5XX';
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Delay abortable: resuelve a los ms o rechaza en cuanto llegue el abort. */
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/** Corre fn con timeout: resuelve el resultado o lanza ApiError TIMEOUT. */
async function withTimeout(fn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (e) {
    if (controller.signal.aborted) throw new ApiError('TIMEOUT', `La petición excedió ${timeoutMs / 1000} s.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Modo MOCK
// ---------------------------------------------------------------------------

const MOCK_ROUTES = [
  // [method, RegExp de la ruta, archivo o función que resuelve el mock]
  ['POST', /^\/api\/requirements\/analyze$/, (url, body) => {
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      return { status: 400, file: 'requirements-analyze.validation.json', body: { error: { code: 'VALIDATION', message: 'El texto del requisito es obligatorio.' } } };
    }
    if (body.text.trim() === '{TIMEOUT}') return { status: 504, file: 'requirements-analyze.timeout.json' };
    return { status: 200, file: 'requirements-analyze.ok.json' };
  }],
  ['POST', /^\/api\/requirements\/approve$/, (url, body) => {
    if (!body || typeof body.id !== 'string' || !body.id) return { status: 404, file: 'requirements-approve.error.json' };
    return { status: 200, file: 'requirements-approve.ok.json' };
  }],
  ['POST', /^\/api\/debug\/analyze$/, (url, body) => {
    if (!body || typeof body.log !== 'string' || !body.log.trim()) return { status: 400, file: 'debug-analyze.validation.json' };
    return { status: 200, file: 'debug-analyze.ok.json' };
  }],
  ['POST', /^\/api\/executor\/run$/, () => ({ status: 200, file: 'executor-run.ok.json' })],
  ['GET', /^\/api\/executor\/run\/[^/]+$/, (_url, _body, url) => (url.endsWith('404') ? { status: 404, file: 'executor-run.get.404.json' } : { status: 200, file: 'executor-run.get.ok.json' })],
  ['POST', /^\/api\/code\/explain$/, (url, body) => {
    if (!body || typeof body.symbol !== 'string' || !body.symbol.trim()) return { status: 404, file: 'code-explain.404.json' };
    return { status: 200, file: 'code-explain.ok.json' };
  }],
  ['POST', /^\/api\/code\/review$/, (url, body) => {
    if (!Array.isArray(body?.files) || body.files.length === 0) return { status: 400, file: 'code-review.validation.json', body: { error: { code: 'VALIDATION', message: 'Selecciona al menos un archivo.' } } };
    return { status: 200, file: 'code-review.ok.json' };
  }],
  ['GET', /^\/api\/history\/[^/]+\/export$/, () => ({ status: 200, file: 'history-export.md', raw: true })],
  ['GET', /^\/api\/history\/[^/]+$/, (_url, _body, url) => {
    if (url.includes('404')) return { status: 404, file: 'history-detail.404.json' };
    if (url.includes('verify')) return { status: 200, file: 'history-detail.verify.json' };
    if (url.includes('requirements')) return { status: 200, file: 'history-detail.requirements.json' };
    return { status: 200, file: 'history-detail.debug.json' };
  }],
  ['DELETE', /^\/api\/history\/[^/]+$/, () => ({ status: 200, file: 'history-delete.ok.json' })],
  ['GET', /^\/api\/history$/, (url, _body, fullUrl) => (new URL(fullUrl, 'http://x').searchParams.has('empty') ? { status: 200, file: 'history.empty.json' } : { status: 200, file: 'history.ok.json' })],
];

let mockCache = null;

// Base para resolver /mock/*: en navegador es el origin actual; en Node
// (smoke tests) se puede inyectar globalThis.MOCK_BASE.
const MOCK_BASE = globalThis.MOCK_BASE ?? globalThis.location?.origin ?? 'http://127.0.0.1:4173';

function loadMock(file) {
  if (!mockCache) mockCache = new Map();
  if (!mockCache.has(file)) {
    const url = new URL(`/mock/${file}`, MOCK_BASE);
    mockCache.set(file, fetch(url).then(async (r) => {
      if (!r.ok) throw new ApiError('NOT_FOUND', `Mock ${file} no disponible (HTTP ${r.status}).`);
      return r.text();
    }));
  }
  return mockCache.get(file);
}

async function mockFetch(method, fullUrl, body, signal) {
  const qIdx = fullUrl.indexOf('?');
  const url = qIdx === -1 ? fullUrl : fullUrl.slice(0, qIdx);
  const query = new URL(fullUrl, 'http://x').searchParams;
  // ?delay=NNN simula latencia prolongada (p. ej. ?delay=9999 fuerza un
  // timeout de cliente). No es parte del contrato; solo para probar errores.
  const requestedDelay = Number(query.get('delay')) || MOCK_DELAY_MS;
  for (const [m, re, resolve] of MOCK_ROUTES) {
    if (m !== method || !re.test(url)) continue;
    const out = resolve(url, body, fullUrl);
    // Delay abortable: si el timeout del cliente llega primero, cortamos aquí
    // y conTimeout mapea el abort a ApiError TIMEOUT sin esperar el resto.
    await abortableDelay(requestedDelay + Math.random() * MOCK_DELAY_MS, signal).catch(() => {
      if (signal?.aborted) throw new ApiError('TIMEOUT', 'La petición excedió el tiempo de espera.');
      throw new Error('aborted');
    });
    return out;
  }
  throw new ApiError('NOT_FOUND', `No hay mock para ${method} ${url}. El contrato en docs/contrato-api.md aún no lo define.`);
}
// ---------------------------------------------------------------------------
// Modo REAL (USE_MOCK=false)
// ---------------------------------------------------------------------------

async function realFetch(method, fullUrl, body, signal) {
  const res = await fetch(fullUrl, {
    method,
    signal,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Endpoints de export devuelven texto/Markdown, no JSON.
  if (res.status === 200 && fullUrl.endsWith('/export')) return { status: 200, text: await res.text(), raw: true };

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Un proxy que cayó puede devolver HTML. No lo parseamos como JSON.
    throw new ApiError(mapHttpStatusToCode(res.status), 'El servidor respondió un formato inesperado.', res.status);
  }
  if (res.status >= 400) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(
      errBody?.error?.code ?? mapHttpStatusToCode(res.status),
      errBody?.error?.message ?? `Error HTTP ${res.status}.`,
      res.status,
      errBody,
    );
  }
  const text = await res.text();
  if (!text.trim()) throw new ApiError('EMPTY_RESPONSE', 'El servidor respondió sin contenido.', res.status);
  let data;
  try { data = JSON.parse(text); } catch { throw new ApiError('EMPTY_RESPONSE', 'El servidor respondió JSON malformado.', res.status); }
  if (data?.error) throw new ApiError(data.error.code ?? 'INTERNAL', data.error.message ?? 'Error del servidor.', res.status, data);
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Llamada única a la capa de datos.
 * @param {string} path  ruta relativa
 * @param {{ method?: string, body?: object, timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, data: object|string } | { status: number, text: string, raw: true }>}
 *   Resuelve con la data cruda. Rechaza con ApiError siempre.
 */
export async function api(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new ApiError('VALIDATION', `Ruta inválida: ${path}. Debe empezar por /api/.`);
  }
  if (body !== undefined && (method === 'GET' || method === 'HEAD')) {
    throw new ApiError('VALIDATION', `${method} no admite body.`);
  }
  if (!USE_MOCK && method !== 'GET' && body !== undefined && JSON.stringify(body).length > 1_000_000) {
    throw new ApiError('OVERSIZED_BODY', 'El cuerpo de la petición supera el límite de 1 MB.');
  }

  return withTimeout(async (signal) => {
    if (USE_MOCK) {
      const out = await mockFetch(method, path, body, signal);
      if (out.status >= 400) {
        const errBody = out.body ?? await loadMock(out.file);
        throw new ApiError(errBody.error?.code ?? mapHttpStatusToCode(out.status), errBody.error?.message ?? `Error HTTP ${out.status}.`, out.status, errBody);
      }
      if (out.raw) {
        //Export: es texto/Markdown, no JSON. Devolvemos el contenido crudo.
        return { status: out.status, text: await loadMock(out.file), raw: true };
      }
      const text = await loadMock(out.file);
      return { status: out.status, data: JSON.parse(text) };
    }
    return realFetch(method, path, body, signal);
  }, timeoutMs);
}

/** Atajo para GET. */
export const apiGet = (path, opts = {}) => api(path, { ...opts, method: 'GET' });

/** Atajo para POST con JSON. */
export const apiPost = (path, body, opts = {}) => api(path, { ...opts, method: 'POST', body });

/** Atajo para DELETE. */
export const apiDelete = (path, opts = {}) => api(path, { ...opts, method: 'DELETE' });

/**
 * Envuelve una promise de api() para renderizado declarativo con
 * loading / error / empty / data. No renderiza por sí mismo.
 *
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<{ loading: boolean, error: ApiError|null, data: T|null, isEmpty: boolean }>}
 */
export async function wrap(promise) {
  try {
    const data = await promise;
    const payload = data?.data ?? data;
    const isEmpty = Array.isArray(payload) ? payload.length === 0
      : payload !== null && typeof payload === 'object' && Object.keys(payload).length === 0;
    return { loading: false, error: null, data, isEmpty };
  } catch (e) {
    const error = e instanceof ApiError ? e : new ApiError('INTERNAL', e?.message ?? 'Error inesperado.');
    return { loading: false, error, data: null, isEmpty: false };
  }
}

/** ¿La data es un array/listado vacío? (pinta empty-state, NO error) */
export function isEmptyList(data) {
  const payload = data?.data ?? data;
  return Array.isArray(payload) && payload.length === 0;
}

export { ApiError };
