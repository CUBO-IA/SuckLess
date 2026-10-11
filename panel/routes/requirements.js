import {
  answerRequirement, approveRequirement, detectDomain, getRequirement, listRequirements, requirementQuestions, startRequirement,
} from '../../engine/requirements.js';
import { saveRequirementSnapshot } from '../../engine/service.js';
import { httpError, jsonResult, mapRequirementStatus, validateObject } from './shared.js';

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
  const questions = new Map(requirementQuestions(requirement).map((question) => [question.id, question]));
  const patch = { decisions: {} };
  for (const [id, item] of Object.entries(answers)) {
    const question = questions.get(id);
    if (!fields.has(id) && !question) throw httpError(400, 'VALIDATION', `Respuesta desconocida: ${id}.`);

    let answer = item;
    if (item !== null && typeof item === 'object') {
      if (Array.isArray(item)) throw httpError(400, 'VALIDATION', `La respuesta ${id} debe ser texto.`);
      if (Object.keys(item).some((key) => !['answered', 'answer'].includes(key))) {
        throw httpError(400, 'VALIDATION', `La respuesta ${id} solo admite answered y answer.`);
      }
      if (item.answered !== undefined && typeof item.answered !== 'boolean') {
        throw httpError(400, 'VALIDATION', `answered para ${id} debe ser booleano.`);
      }
      if (item.answered === false) continue;
      if (!Object.hasOwn(item, 'answer')) throw httpError(400, 'VALIDATION', `La respuesta ${id} debe incluir answer.`);
      answer = item.answer;
    }

    if (answer === undefined || answer === null || (typeof answer === 'string' && !answer.trim())) continue;
    if (typeof answer !== 'string') throw httpError(400, 'VALIDATION', `La respuesta ${id} debe ser texto.`);
    if (fields.has(id)) patch[id] = answer;
    else if (question.field.startsWith('decisions.')) patch.decisions[question.field.slice('decisions.'.length)] = answer;
    else patch[id] = answer;
  }
  return patch;
}

function newRequirementQuestions(text) {
  return {
    domain: detectDomain(text),
    actor: '',
    expectedBehavior: '',
    inputs: [],
    errors: [],
    acceptance: [],
    edgeCases: [],
    rules: [],
    decisions: {},
  };
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
      const answers = body.answers === undefined ? null : answerPatch(newRequirementQuestions(text), body.answers);
      requirement = startRequirement(text);
      if (answers && (Object.keys(answers).some((key) => key !== 'decisions') || Object.keys(answers.decisions).length)) {
        requirement = answerRequirement(requirement.id, answers);
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
