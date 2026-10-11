import './_env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../panel/server.js';

async function withServer(callback) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function json(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.json();
  return { response, body };
}

test('API HTTP: requirement interview, approval, async execution and history round-trip', async () => {
  await withServer(async (base) => {
    const start = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'El carrito debe aplicar descuentos' }),
    });
    assert.equal(start.response.status, 200);
    assert.equal(start.body.status, 'INCOMPLETE');
    assert.equal(start.body.questions.length, 10);
    assert.ok(start.body.questions.every((question) => question.answered === false && question.answer === null));

    const answers = {
      actor: { answered: true, answer: 'Cliente' },
      expectedBehavior: { answered: true, answer: 'Aplica el cupón al carrito' },
      inputs: { answered: true, answer: 'Código de cupón' },
      errors: { answered: true, answer: 'Rechazar cupón vencido' },
      acceptance: { answered: false, answer: 'El descuento coincide con el porcentaje' },
      edgeCases: { answered: false, answer: 'Carrito vacío' },
      combinable: { answered: true, answer: 'no' },
      expired: { answered: true, answer: 'reject' },
      taxOrder: { answered: true, answer: 'before_tax' },
      persistCoupons: { answered: true, answer: 'yes' },
    };
    const partial = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: start.body.id, text: start.body.document.objective, answers }),
    });
    assert.equal(partial.body.id, start.body.id);
    assert.equal(partial.body.status, 'INCOMPLETE');
    assert.ok(partial.body.missingFields.includes('acceptance'));
    assert.ok(partial.body.missingFields.includes('edgeCases'));

    const rejectedApproval = await json(base, '/api/requirements/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: start.body.id, approvedBy: 'QA' }),
    });
    assert.equal(rejectedApproval.response.status, 400);
    assert.equal(rejectedApproval.body.error.code, 'VALIDATION');

    const ready = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: partial.body.id,
        text: partial.body.document.objective,
        answers: {
          acceptance: { answered: true, answer: 'El descuento coincide con el porcentaje' },
          edgeCases: { answered: true, answer: 'Carrito vacío' },
        },
      }),
    });
    assert.equal(ready.body.id, start.body.id);
    assert.equal(ready.body.status, 'READY_FOR_REVIEW');
    assert.deepEqual(ready.body.missingFields, []);
    assert.deepEqual(ready.body.questions.map((question) => question.id), start.body.questions.map((question) => question.id));
    assert.ok(ready.body.questions.every((question) => question.answered));
    assert.equal(ready.body.questions.find((question) => question.id === 'actor').answer, 'Cliente');
    assert.equal(ready.body.questions.find((question) => question.id === 'combinable').answer, 'no');
    assert.equal(ready.body.document.edgeCases[0], 'Carrito vacío');
    assert.equal(ready.body.document.behavior, 'Aplica el cupón al carrito');
    assert.equal(Object.hasOwn(ready.body.document, 'expectedBehavior'), false);

    const invalidApprover = await json(base, '/api/requirements/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: start.body.id, approvedBy: 'Q' }),
    });
    assert.equal(invalidApprover.response.status, 400);
    assert.equal(invalidApprover.body.error.code, 'VALIDATION');

    const approved = await json(base, '/api/requirements/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: start.body.id, approvedBy: 'QA' }),
    });
    assert.equal(approved.body.status, 'APPROVED');
    const requirements = await json(base, '/api/requirements');
    assert.ok(requirements.body.some((item) => item.id === start.body.id && item.status === 'APPROVED'));

    const launched = await json(base, '/api/executor/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'fixed', requirementId: start.body.id }),
    });
    assert.equal(launched.response.status, 200);
    assert.equal(launched.body.status, 'QUEUED');
    assert.deepEqual(launched.body.checks, []);
    assert.equal(launched.body.durationMs, null);
    assert.deepEqual(launched.body.summary, { pass: 0, fail: 0, error: 0 });
    assert.deepEqual(launched.body.trace, { steps: [], downloadUrl: null });
    assert.deepEqual(launched.body.screenshots, []);
    assert.equal(launched.body.aiInterpretation, null);

    let run;
    const deadline = Date.now() + 20_000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const next = await json(base, `/api/executor/run/${launched.body.id}`);
      assert.equal(next.response.status, 200);
      run = next.body;
    } while (!['PASS', 'FAIL', 'EXECUTOR_ERROR'].includes(run.status) && Date.now() < deadline);
    assert.equal(run.status, 'PASS');
    assert.equal(run.summary.fail, 0);
    assert.equal(run.checks.length, 8);
    assert.ok(run.durationMs >= 0);
    assert.ok(run.checks.every((check) => ['PASS', 'FAIL', 'EXECUTOR_ERROR'].includes(check.status)));

    const latest = await json(base, '/api/executor/run/latest');
    assert.equal(latest.body.status, 'PASS');
    const history = await json(base, '/api/history?type=verify');
    assert.equal(history.body.length, 1);
    const requirementHistory = await json(base, '/api/history?type=requirements');
    assert.equal(requirementHistory.body[0].status, 'APPROVED');
    const detail = await json(base, `/api/history/${history.body[0].id}`);
    assert.equal(detail.body.data.runs[0].target, 'fixed');
    const exported = await fetch(`${base}/api/history/${history.body[0].id}/export`);
    assert.equal(exported.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.match(await exported.text(), /^# /);

    const removed = await json(base, `/api/history/${history.body[0].id}`, { method: 'DELETE' });
    assert.deepEqual(removed.body, { deleted: true, id: history.body[0].id });
  });

});

test('API HTTP: both targets never report PASS when the buggy target fails', async () => {
  await withServer(async (base) => {
    const launched = await json(base, '/api/executor/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'both' }),
    });
    assert.equal(launched.body.status, 'QUEUED');
    let snapshot = launched.body;
    const deadline = Date.now() + 20_000;
    while (!['PASS', 'FAIL', 'EXECUTOR_ERROR'].includes(snapshot.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      snapshot = (await json(base, `/api/executor/run/${launched.body.id}`)).body;
    }
    assert.ok(['FAIL', 'EXECUTOR_ERROR'].includes(snapshot.status));
    assert.ok(snapshot.summary.fail + snapshot.summary.error > 0);
    assert.ok(snapshot.checks.some((check) => check.name.startsWith('buggy:') && check.status !== 'PASS'));
    assert.ok(!snapshot.checks.every((check) => check.status === 'PASS'));
  });
});

test('API HTTP: Code routes return contract shapes and cite indexed source locations', async () => {
  await withServer(async (base) => {
    const files = await json(base, '/api/files');
    assert.ok(files.body.files.includes('demo-store/src/cart.js'));
    assert.ok(files.body.symbols.includes('addItem'));

    const explain = await json(base, '/api/code/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'addItem' }),
    });
    assert.equal(explain.body.status, 'OK');
    assert.equal(explain.body.symbol, 'addItem');
    assert.match(explain.body.summary, /demo-store\/src\/cart\.js:\d+-\d+, \d+ puntos de flujo/);
    assert.ok(explain.body.steps.length > 0);
    assert.ok(explain.body.steps.every((step) => step.text && step.file && step.lines[0] > 0 && step.lines[1] >= step.lines[0]));

    const review = await json(base, '/api/code/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: ['demo-store/src/cart.js'] }),
    });
    assert.equal(review.body.status, 'FINDINGS');
    assert.ok(['ALTA', 'MEDIA', 'BAJA'].includes(review.body.findings[0].severity));
    assert.ok(['LOGICA', 'SEGURIDAD', 'CALIDAD'].includes(review.body.findings[0].category));
    assert.ok(review.body.findings.every((finding) => (
      finding.id && finding.evidence && finding.impact && finding.recommendation
      && typeof finding.proven === 'boolean'
      && (finding.file === null || (finding.file && finding.lines[0] > 0 && finding.lines[1] >= finding.lines[0]))
      && (finding.patch === null || (finding.patch.format && finding.patch.language && finding.patch.content))
    )));
  });
});

test('API HTTP: Code routes validate requests and map missing symbols to NOT_FOUND', async () => {
  await withServer(async (base) => {
    const invalidExplain = await json(base, '/api/code/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: ' ' }),
    });
    assert.equal(invalidExplain.response.status, 400);
    assert.equal(invalidExplain.body.error.code, 'VALIDATION');

    const missingSymbol = await json(base, '/api/code/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'notARealFunction' }),
    });
    assert.equal(missingSymbol.response.status, 404);
    assert.equal(missingSymbol.body.error.code, 'NOT_FOUND');

    for (const files of [[], Array(21).fill('demo-store/src/cart.js'), ['../panel/server.js']]) {
      const invalidReview = await json(base, '/api/code/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      assert.equal(invalidReview.response.status, 400);
      assert.equal(invalidReview.body.error.code, 'VALIDATION');
    }
  });
});

test('API HTTP: other adapters return contract shapes and errors use the uniform envelope', async () => {
  await withServer(async (base) => {

    const debug = await json(base, '/api/debug/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: "TypeError: Cannot read properties of undefined (reading 'find')\n    at addItem (cart.js:27:31)" }),
    });
    assert.equal(debug.body.status, 'CORRECTION_VERIFIED');
    assert.equal(debug.body.ladderLevel, 3);
    assert.ok(debug.body.hypotheses[0].evidence[0].lines[0] > 0);

    const invalid = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(Object.keys(invalid.body.error).sort(), ['code', 'message']);
    assert.equal(invalid.body.error.code, 'VALIDATION');

    const invalidAnswer = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Un proceso válido',
        answers: { actor: { answered: true, answer: { name: 'Cliente' } } },
      }),
    });
    assert.equal(invalidAnswer.response.status, 400);
    assert.equal(invalidAnswer.body.error.code, 'VALIDATION');
    const afterInvalidAnswer = await json(base, '/api/requirements');
    assert.ok(afterInvalidAnswer.body.every((requirement) => requirement.title !== 'Un proceso válido'));

    const invalidId = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'invalid', text: 'Un proceso válido' }),
    });
    assert.equal(invalidId.response.status, 400);
    assert.equal(invalidId.body.error.code, 'VALIDATION');

    const unknownId = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'REQ-000000', text: 'Un proceso válido' }),
    });
    assert.equal(unknownId.response.status, 404);
    assert.equal(unknownId.body.error.code, 'NOT_FOUND');

    const missing = await json(base, '/api/history/99999999');
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  });
});

test('API HTTP: debug and executor validate input and return missing-run errors', async () => {
  await withServer(async (base) => {
    const headers = { 'Content-Type': 'application/json' };
    const requests = [
      ['/api/debug/analyze', { log: '' }],
      ['/api/debug/analyze', { log: 'TypeError: boom', requirementId: 12 }],
      ['/api/executor/run', { target: 'unknown' }],
      ['/api/executor/run', { target: 'fixed', requirementId: 'invalid' }],
    ];
    for (const [route, body] of requests) {
      const result = await json(base, route, { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(result.response.status, 400);
      assert.equal(result.body.error.code, 'VALIDATION');
      assert.equal(typeof result.body.error.message, 'string');
    }
    const missing = await json(base, '/api/executor/run/run_missing');
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  });
});

test('API HTTP: browser CORS is restricted to the configured local frontend origins', async () => {
  await withServer(async (base) => {
    const allowed = await fetch(`${base}/api/requirements`, { headers: { Origin: 'http://localhost:8083' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:8083');
    const denied = await fetch(`${base}/api/requirements`, { headers: { Origin: 'https://example.invalid' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${base}/api/requirements/analyze`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:8083', 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
  });
});

test('API client: real mode targets the configured backend and returns its payload', async () => {
  await withServer(async (base) => {
    globalThis.SUCKLESS_USE_MOCK = false;
    globalThis.SUCKLESS_API_BASE = base;
    const { api, USE_MOCK } = await import('../assets/js/api.js?real-api-integration-test');
    assert.equal(USE_MOCK, false);
    const { data } = await api('/api/requirements');
    assert.ok(Array.isArray(data));
    assert.equal(data[0].status, 'APPROVED');
    delete globalThis.SUCKLESS_USE_MOCK;
    delete globalThis.SUCKLESS_API_BASE;
  });
});
