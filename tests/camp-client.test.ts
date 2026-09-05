import assert from 'node:assert/strict';
import test from 'node:test';
import { CampClient, type CampUpdate } from '../lib/game/camp';
import { initialState } from '../lib/game/state';

const campCode = '0123456789ABCDEF';

function update(overrides: Partial<CampUpdate> = {}): CampUpdate {
  return {
    code: campCode,
    id: 'explorer-1',
    revision: 1,
    peers: [],
    changed: true,
    message: 'Done.',
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function client() {
  const value = new CampClient();
  value.code = campCode;
  value.id = 'explorer-1';
  value.revision = 0;
  return value;
}

async function withFetch(replacement: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = replacement;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

function actionBodies(calls: Array<{ body: string }>) {
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body, 'retry must reuse exact body');
  const first = JSON.parse(calls[0].body) as Record<string, unknown>;
  const second = JSON.parse(calls[1].body) as Record<string, unknown>;
  assert.equal(typeof first.requestId, 'string');
  assert.equal(first.requestId, second.requestId, 'retry must reuse requestId');
  return first;
}

void test('action retries a transport failure with the identical request body', async () => {
  const calls: Array<{ body: string }> = [];
  let attempt = 0;
  await withFetch(
    (async (_input, init) => {
      calls.push({ body: init?.body as string });
      if (attempt++ === 0) throw new TypeError('Failed to fetch');
      return json(update());
    }) as typeof fetch,
    async () => {
      const result = await client().action({ type: 'drink' }, initialState());
      assert.equal(result.changed, true);
    },
  );
  assert.equal(actionBodies(calls).op, 'action');
});

void test('action retries a JSON 503 with the identical request body', async () => {
  const calls: Array<{ body: string }> = [];
  let attempt = 0;
  await withFetch(
    (async (_input, init) => {
      calls.push({ body: init?.body as string });
      if (attempt++ === 0)
        return json({ error: 'The camp radio is unavailable.' }, 503);
      return json(update());
    }) as typeof fetch,
    async () => {
      const result = await client().action({ type: 'drink' }, initialState());
      assert.equal(result.message, 'Done.');
    },
  );
  actionBodies(calls);
});

void test('action retries an HTML 502 with the identical request body', async () => {
  const calls: Array<{ body: string }> = [];
  let attempt = 0;
  await withFetch(
    (async (_input, init) => {
      calls.push({ body: init?.body as string });
      if (attempt++ === 0)
        return new Response('<h1>Bad gateway</h1>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        });
      return json(update());
    }) as typeof fetch,
    async () => {
      const result = await client().action({ type: 'drink' }, initialState());
      assert.equal(result.revision, 1);
    },
  );
  actionBodies(calls);
});

void test('action does not retry a client-side 400 response', async () => {
  let calls = 0;
  await withFetch(
    (async () => {
      calls++;
      return json({ error: 'Invalid camp action.' }, 400);
    }) as typeof fetch,
    async () => {
      await assert.rejects(
        client().action({ type: 'drink' }, initialState()),
        /Invalid camp action/,
      );
    },
  );
  assert.equal(calls, 1);
});

void test('lease contention keeps the same paid action until the lease clears', async () => {
  const calls: Array<{ body: string }> = [];
  await withFetch(
    (async (_input, init) => {
      calls.push({ body: init?.body as string });
      if (calls.length <= 3)
        return json({ error: 'Your previous action is finishing.' }, 429);
      return json(update());
    }) as typeof fetch,
    async () => {
      await client().action(
        { type: 'craft', recipe: 'plank', amount: 1 },
        initialState(),
      );
    },
  );
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.body === calls[0].body));
});

void test('leave waits for an in-flight action before sending its request', async () => {
  type ResolveResponse = (response: Response) => void;
  const calls: Array<Record<string, unknown>> = [];
  let resolveAction!: ResolveResponse;
  const actionResponse = new Promise<Response>((resolve) => {
    resolveAction = resolve;
  });

  await withFetch(
    (async (_input, init) => {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      calls.push(body);
      if (body.op === 'action') return actionResponse;
      assert.equal(body.op, 'leave');
      return json(
        update({ revision: 0, changed: undefined, message: undefined }),
      );
    }) as typeof fetch,
    async () => {
      const value = client();
      const acting = value.action({ type: 'drink' }, initialState());
      await Promise.resolve();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].op, 'action');

      const leaving = value.leave();
      await Promise.resolve();
      assert.equal(calls.length, 1, 'leave must remain behind queued action');

      resolveAction(json(update()));
      await acting;
      await leaving;

      assert.deepEqual(
        calls.map((body) => body.op),
        ['action', 'leave'],
      );
      assert.equal(calls[1].code, campCode);
      assert.equal(value.code, '');
    },
  );
});
