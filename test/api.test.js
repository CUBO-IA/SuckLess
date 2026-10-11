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
      acceptance: { answered: true, answer: 'El descuento coincide con el porcentaje' },
      edgeCases: { answered: true, answer: 'Carrito vacío' },
      combinable: { answered: true, answer: 'no' },
      expired: { answered: true, answer: 'reject' },
      taxOrder: { answered: true, answer: 'before_tax' },
      persistCoupons: { answered: true, answer: 'yes' },
    };
    const ready = await json(base, '/api/requirements/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: start.body.id, text: start.body.document.objective, answers }),
    });
    assert.equal(ready.body.status, 'READY_FOR_REVIEW');
    assert.deepEqual(ready.body.missingFields, []);
    assert.equal(ready.body.questions.length, start.body.questions.length);
    assert.ok(ready.body.questions.every((question) => question.answered));
    assert.equal(ready.body.questions.find((question) => question.id === 'actor').answer, 'Cliente');
    assert.equal(ready.body.questions.find((question) => question.id === 'combinable').answer, 'no');
    assert.equal(ready.body.document.edgeCases[0], 'Carrito vacío');

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

test('API HTTP: adapters return contract shapes and errors use the uniform envelope', async () => {
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
    assert.ok(explain.body.steps[0].lines[0] > 0);

    const review = await json(base, '/api/code/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: ['demo-store/src/cart.js'] }),
    });
    assert.equal(review.body.status, 'FINDINGS');
    assert.ok(['ALTA', 'MEDIA', 'BAJA'].includes(review.body.findings[0].severity));

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

    const missing = await json(base, '/api/history/99999999');
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
