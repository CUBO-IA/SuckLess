import {
  answerRequirement, approveRequirement, getRequirement, listRequirements, requirementQuestions, startRequirement,
} from '../../engine/requirements.js';
import { saveRequirementSnapshot } from '../../engine/service.js';
import { httpError, jsonResult, mapRequirementStatus, validateObject } from './shared.js';

const DECISION_IDS = new Set(['combinable', 'expired', 'taxOrder', 'persistCoupons']);

function documentOf(requirement) {
  return {
    objective: requirement.objective || '',
    actor: requirement.actor || '',
    behavior: requirement.expectedBehavior || '',
    inputs: requirement.inputs ?? [],
    rules: requirement.rules ?? [],
    errors: requirement.errors ?? [],
    acceptanceCriteria: requirement.acceptance ?? [],
    edgeCases: requirement.edgeCases ?? [],
  };
}

function responseOf(requirement) {
  const questions = requirementQuestions(requirement).map((q) => ({
    id: q.id,
    text: q.text,
    category: q.id === 'acceptance' ? 'acceptance' : q.id === 'edgeCases' ? 'scope' : 'business',
    answered: q.answered,
    answer: q.answered ? q.answer : null,
    type: q.type === 'choice' ? 'choice' : q.type === 'list' ? 'textarea' : 'input',
    ...(q.options ? { options: q.options } : {}),
  }));
  return {
    id: requirement.id,
    status: mapRequirementStatus(requirement.status),
    questions,
    missingFields: requirement.questions.map((q) => q.id),
    document: documentOf(requirement),
  };
}

function answerPatch(requirement, answers) {
  validateObject(answers, 'answers');
  const fields = new Set(['objective', 'actor', 'expectedBehavior', 'inputs', 'errors', 'acceptance', 'edgeCases', 'rules']);
  const patch = { decisions: {} };
  for (const [id, item] of Object.entries(answers)) {
    const answer = item && typeof item === 'object' && !Array.isArray(item) ? item.answer : item;
    if (answer === undefined || answer === null || String(answer).trim() === '') continue;
    if (fields.has(id)) patch[id] = answer;
    else if (DECISION_IDS.has(id)) patch.decisions[id] = answer;
    else {
      const q = requirement.questions.find((question) => question.id === id);
      if (q?.field.startsWith('decisions.')) patch.decisions[q.field.slice('decisions.'.length)] = answer;
      else throw httpError(400, 'VALIDATION', `Respuesta desconocida: ${id}.`);
    }
  }
  return patch;
}

export async function handle(req, url, body) {
  const { method } = req;
  if (method === 'GET' && url.pathname === '/api/requirements') {
    return jsonResult(listRequirements().map((r) => ({
      id: r.id,
      type: 'requirements',
      title: r.objective,
      status: mapRequirementStatus(r.status),
      createdAt: r.createdAt,
      approvedBy: r.approvedBy,
    })));
  }
  if (method === 'POST' && url.pathname === '/api/requirements/analyze') {
    validateObject(body);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 5000) throw httpError(400, 'VALIDATION', 'El requisito debe contener entre 1 y 5000 caracteres.');
    let requirement;
    if (body.id !== undefined) {
      if (typeof body.id !== 'string' || !/^REQ-[a-f0-9]{6}$/.test(body.id)) throw httpError(400, 'VALIDATION', 'Id de requisito inválido.');
      requirement = getRequirement(body.id);
      const answers = body.answers === undefined ? {} : answerPatch(requirement, body.answers);
      if (text !== requirement.objective) answers.objective = text;
      requirement = Object.keys(answers).some((key) => key !== 'decisions') || Object.keys(answers.decisions).length
        ? answerRequirement(body.id, answers)
        : requirement;
    } else {
      requirement = startRequirement(text);
      if (body.answers !== undefined) {
        const answers = answerPatch(requirement, body.answers);
        if (Object.keys(answers).some((key) => key !== 'decisions') || Object.keys(answers.decisions).length) {
          requirement = answerRequirement(requirement.id, answers);
        }
      }
    }
    return jsonResult(responseOf(requirement));
  }
  if (method === 'POST' && url.pathname === '/api/requirements/approve') {
    validateObject(body);
    if (typeof body.id !== 'string' || !/^REQ-[a-f0-9]{6}$/.test(body.id)) throw httpError(400, 'VALIDATION', 'Id de requisito inválido.');
    if (typeof body.approvedBy !== 'string' || body.approvedBy.trim().length < 2) {
      throw httpError(400, 'VALIDATION', 'approvedBy debe contener al menos dos caracteres.');
    }
    const requirement = approveRequirement(body.id, body.approvedBy.trim());
    saveRequirementSnapshot(requirement.id);
    return jsonResult({
      id: requirement.id,
      status: mapRequirementStatus(requirement.status),
      approvedAt: requirement.approval.at,
      approvedBy: requirement.approval.by,
      document: documentOf(requirement),
    });
  }
  throw httpError(404, 'NOT_FOUND', 'Ruta de requisitos no encontrada.');
}
