// Run against the local development server with its D1 migrations applied.
import assert from 'node:assert/strict';
import targets from '../lib/game/targets.json';
import { placement } from '../lib/game/placement';
import type { CampUpdate } from '../lib/game/camp';
import { initialState, type GameState } from '../lib/game/state';
const endpoint =
  (process.env.CAMP_TEST_URL ?? 'http://localhost:3000') + '/api/camp';
class Explorer {
  cookie = '';
  code = '';
  state = initialState();
  revision = -1;
  async call(body: Record<string, unknown>, expected = 200) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
      body: JSON.stringify({ code: this.code, ...body }),
    });
    const result = (await r.json()) as CampUpdate & { error?: string };
    assert.equal(r.status, expected, JSON.stringify(result));
    if (r.headers.get('set-cookie'))
      this.cookie = r.headers.get('set-cookie')!.split(';')[0];
    if (result.code) this.code = result.code;
    if (result.state) this.state = result.state as GameState;
    if (typeof result.revision === 'number') this.revision = result.revision;
    return result;
  }
  action(command: unknown, requestId = crypto.randomUUID()) {
    return this.call({
      op: 'action',
      requestId,
      command,
      tool: 'axe',
      crop: 'carrot',
      pose: { x: -1, z: 7, yaw: 0 },
      activeTime: 0,
    });
  }
}
const a = new Explorer(),
  b = new Explorer(),
  c = new Explorer(),
  d = new Explorer(),
  e = new Explorer();
const seed = initialState();
seed.started = true;
seed.completed = Array.from({ length: 6 }, (_, i) => i);
seed.inventory.wood = 100;
seed.inventory.stone = 100;
seed.inventory.fiber = 100;
await a.call({ op: 'create', name: 'HTTP Carrot', state: seed });
console.log('Created isolated test camp');
await b.call({ op: 'join', code: a.code, name: 'HTTP Turnip' });
assert.equal(a.state.inventory.wood, b.state.inventory.wood);
const requestId = crypto.randomUUID();
const gathered = await a.action(
  {
    type: 'interact',
    id: targets.targets.find((t) => t.id.startsWith('tree-near'))!.id,
    kind: 'wood',
    x: -5,
    z: 10,
  },
  requestId,
);
assert.equal(gathered.changed, true);
const woodAfter = a.state.inventory.wood;
await a.action(
  {
    type: 'interact',
    id: targets.targets.find((t) => t.id.startsWith('tree-near'))!.id,
    kind: 'wood',
    x: -5,
    z: 10,
  },
  requestId,
);
assert.equal(
  a.state.inventory.wood,
  woodAfter,
  'retry must not duplicate wood',
);
await b.call({ op: 'poll', revision: -1, pose: { x: 1, z: 7, yaw: 1 } });
assert.equal(b.state.inventory.wood, woodAfter, 'second player sees harvest');
const blockers = [
  ...targets.blockers,
  ...targets.targets
    .filter((t) => !['wood', 'stone'].includes(t.kind))
    .map((t) => ({ x: t.x, z: t.z, r: t.r + 0.35 })),
];
const layout = structuredClone(a.state);
layout.player = { x: -1, z: 7 };
function spot(structure: 'workbench' | 'campfire') {
  for (let z = -5; z < 19; z++)
    for (let x = -13; x < 14; x++)
      if (placement(layout, structure, x, z, 0, blockers).ok) {
        layout.buildings.push({
          id: structure,
          type: structure,
          x,
          z,
          rotation: 0,
        });
        return { x, z };
      }
  throw Error('No building site found');
}
const benchSite = spot('workbench'),
  fireSite = spot('campfire');
const built = await Promise.all([
  a.action({
    type: 'build',
    structure: 'workbench',
    ...benchSite,
    rotation: 0,
  }),
  b.action({ type: 'build', structure: 'campfire', ...fireSite, rotation: 0 }),
]);
console.log(built.map((r) => r.message));
await a.call({ op: 'poll', revision: -1 });
assert.equal(a.state.buildings.length, 2, 'concurrent builds both survive');
assert.ok(a.state.buildings.some((v) => v.type === 'workbench'));
assert.ok(a.state.buildings.some((v) => v.type === 'campfire'));
await Promise.all([
  a.action({ type: 'craft', recipe: 'plank', amount: 2 }),
  b.action({ type: 'craft', recipe: 'plank', amount: 3 }),
]);
await a.call({ op: 'poll', revision: -1 });
assert.equal(
  a.state.inventory.plank,
  5,
  'concurrent crafting preserves both outputs',
);
const craftId = crypto.randomUUID();
// Client IDs are only unique within a membership; two players may reuse one.
const sharedRequestId = crypto.randomUUID();
await Promise.all([
  a.action({ type: 'craft', recipe: 'plank', amount: 1 }, sharedRequestId),
  b.action({ type: 'craft', recipe: 'plank', amount: 1 }, sharedRequestId),
]);
await a.call({ op: 'poll', revision: -1 });
assert.equal(
  a.state.inventory.plank,
  7,
  'two members may safely use the same client request ID',
);
await a.action({ type: 'craft', recipe: 'plank', amount: 1 }, craftId);
await a.action({ type: 'craft', recipe: 'plank', amount: 1 });
await a.action({ type: 'craft', recipe: 'plank', amount: 1 }, craftId);
assert.equal(
  a.state.inventory.plank,
  9,
  'older paid craft retries apply once after a newer action',
);
await a.call(
  {
    op: 'action',
    requestId: craftId,
    command: { type: 'craft', recipe: 'plank', amount: 2 },
    tool: 'axe',
    crop: 'carrot',
  },
  409,
);
const previous = a.state.inventory.plank;
await a.call(
  {
    op: 'action',
    requestId: crypto.randomUUID(),
    command: { type: 'craft', recipe: 'plank', amount: 1000 },
    tool: 'axe',
    crop: 'carrot',
  },
  400,
);
await a.call({ op: 'poll', revision: -1 });
assert.equal(a.state.inventory.plank, previous);
await e.call({ op: 'poll', code: a.code }, 401);
await c.call({ op: 'join', code: a.code, name: 'HTTP Radish' });
await d.call({ op: 'join', code: a.code, name: 'HTTP Potato' });
await e.call({ op: 'join', code: a.code, name: 'HTTP Fifth' }, 409);
const beforeSpoof = a.state.inventory.wood;
const spoof = await a.action({
  type: 'interact',
  id: 'tree-imaginary',
  kind: 'wood',
  x: 0,
  z: 8,
});
assert.equal(spoof.changed, false);
assert.equal(a.state.inventory.wood, beforeSpoof);
await a.action({ type: 'eat', food: 'bread' });
const days = a.state.counters['survival:days'] ?? 0;
await a.call({
  op: 'action',
  requestId: crypto.randomUUID(),
  command: { type: 'drink' },
  tool: 'hands',
  crop: 'carrot',
  activeTime: 1e9,
});
assert.equal(
  a.state.counters['survival:days'] ?? 0,
  days,
  'client clock cannot fast-forward campaign',
);
const drinks = await a.call({ op: 'poll', revision: -1 });
assert.equal(drinks.needs?.canteen, 2);
const bob = await b.call({ op: 'poll', revision: -1 });
assert.equal(bob.needs?.canteen, 3, 'canteens are personal');
const roster = await a.call({ op: 'poll', revision: -1 });
assert.equal(roster.peers.length, 4);
assert.ok(roster.peers.every((p: Record<string, unknown>) => !('token' in p)));
for (const player of [a, b, c, d]) await player.call({ op: 'leave' });
await e.call({ op: 'join', code: a.code, name: 'HTTP Return' });
assert.equal(e.state.buildings.length, 2, 'camp survives everyone leaving');
assert.equal(e.state.inventory.plank, previous);
await e.call({ op: 'leave' });
// Each explorer owns a line while catches and bait still use the shared pantry.
const fishingSeed = initialState();
fishingSeed.started = true;
fishingSeed.counters['talk:fisher'] = 1;
await a.call({ op: 'create', name: 'HTTP Angler A', state: fishingSeed });
await b.call({ op: 'join', code: a.code, name: 'HTTP Angler B' });
const fishingPose = { x: 31.5, z: 27.5, yaw: 0 };
for (let step = 1; step <= 18; step++) {
  const pose = {
    x: (fishingPose.x * step) / 18,
    z: 7 + ((fishingPose.z - 7) * step) / 18,
    yaw: 0,
  };
  await Promise.all([
    a.call({ op: 'poll', pose }),
    b.call({ op: 'poll', pose }),
  ]);
}
const cast = (player: Explorer, id: string) => {
  const target = targets.targets.find((t) => t.id === id)!;
  return player.call({
    op: 'action',
    requestId: crypto.randomUUID(),
    command: { type: 'interact', id, kind: 'fish', x: target.x, z: target.z },
    tool: 'rod',
    crop: 'carrot',
    pose: fishingPose,
  });
};
const lineA = await cast(a, 'fish-0');
assert.equal(lineA.fishing?.id, 'fish-0');
assert.equal(
  (await b.call({ op: 'poll', revision: -1 })).fishing,
  null,
  'other player does not inherit a line',
);
const lineB = await cast(b, 'fish-1');
assert.equal(lineB.fishing?.id, 'fish-1');
assert.deepEqual(
  (await a.call({ op: 'poll', revision: -1 })).fishing,
  lineA.fishing,
  'another cast cannot cancel your line',
);
assert.equal(
  a.state.fishing,
  null,
  'shared world never contains personal fishing',
);
await new Promise((resolve) => setTimeout(resolve, 2800));
assert.match((await cast(a, 'fish-0')).message ?? '', /silverfin/);
assert.deepEqual(
  (await b.call({ op: 'poll', revision: -1 })).fishing,
  lineB.fishing,
  'another catch cannot reel your line',
);
assert.match((await cast(b, 'fish-1')).message ?? '', /silverfin/);
assert.equal(b.state.inventory.fish, 4, 'both catches reach the shared pantry');
await a.call({ op: 'leave' });
await b.call({ op: 'leave' });

// Rejected expired reconnects must not steal slots, even for a moment.
await a.call({ op: 'create', name: 'HTTP Expiring', state: seed });
for (const [index, player] of [b, c, d].entries())
  await player.call({ op: 'join', code: a.code, name: `HTTP Keeper ${index}` });
console.log('Checking expired slot recovery (16 seconds)');
for (let tick = 0; tick < 4; tick++) {
  await new Promise((resolve) => setTimeout(resolve, 4100));
  await Promise.all([b, c, d].map((player) => player.call({ op: 'poll' })));
}
await e.call({ op: 'join', code: a.code, name: 'HTTP Replacement' });
await a.call({ op: 'join', name: 'HTTP Expired return' }, 409);
assert.equal((await b.call({ op: 'poll' })).peers.length, 4);
await d.call({ op: 'leave' });
await a.call({ op: 'join', name: 'HTTP Return after vacancy' });
assert.equal(
  (await b.call({ op: 'poll' })).peers.length,
  4,
  'a real vacancy can be filled immediately',
);
const originalRoom = a.code;
await b.call({ op: 'create', name: 'HTTP Moved camp', state: seed });
await d.call({ op: 'join', code: originalRoom, name: 'HTTP New neighbor' });
assert.equal(
  (await a.call({ op: 'poll' })).peers.length,
  4,
  'switching rooms releases old slot immediately',
);
for (const player of [a, b, c, d, e]) await player.call({ op: 'leave' });
console.log(
  'PASS: shared harvest, durable receipts, concurrent paid builds/crafts, personal fishing/canteens, slot expiry/recovery, room switching, auth and durable rejoin',
);
