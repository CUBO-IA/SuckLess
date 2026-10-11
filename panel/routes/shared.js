export function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function jsonResult(data, status = 200) {
  return { status, data };
}

export function mapRequirementStatus(status) {
  return ({
    INCOMPLETO: 'INCOMPLETE',
    LISTO_PARA_REVISAR: 'READY_FOR_REVIEW',
    APROBADO: 'APPROVED',
  })[status] ?? status;
}

export function validateObject(value, label = 'El cuerpo') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'VALIDATION', `${label} debe ser un objeto JSON.`);
  }
}

export function idFromHistory(value) {
  if (!/^\d+$/.test(String(value))) throw httpError(404, 'NOT_FOUND', 'No existe el análisis solicitado.');
  return String(value);
}

export function normalizeError(error) {
  if (Number.isInteger(error?.status)) return error;
  const message = String(error?.message ?? 'Error interno del servidor.');
  if (/^No existe (el requisito|el análisis|la corrida)|^No encontré la función|^No existe la prueba/.test(message)) {
    return httpError(404, 'NOT_FOUND', message);
  }
  if (/^(?:Id de requisito inválido|Requisito .* no está aprobado|.*No se puede aprobar|.*ya está aprobado|.*al menos|El símbolo|Target desconocido|Archivo de pruebas no permitido|Solo se revisan|Decisión desconocida|Valor inválido|Describe el requisito|La aprobación requiere|No encontré una línea de error)/i.test(message)) {
    return httpError(400, 'VALIDATION', message);
  }
  return httpError(500, 'INTERNAL', message);
}
