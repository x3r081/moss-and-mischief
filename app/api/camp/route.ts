import { database } from '@/lib/server/db';
import {
  initialState,
  parseSave,
  updateQuests,
  CROPS,
  regionAt,
  type GameState,
} from '@/lib/game/state';
import { applyCommand, validCommand, validTool } from '@/lib/game/commands';
import {
  initialFrontier,
  advanceSurvival,
  ANIMALS,
  animalPosition,
  type FrontierState,
} from '@/lib/game/frontier';
import { onLand } from '@/lib/game/terrain';

type Camp = { code: string; state: string; revision: number; created: number };
type Member = {
  token: string;
  id: string;
  room: string;
  name: string;
  pose: string;
  seen: number;
  needs: string;
  last_hurt: number;
  last_action: string | null;
  last_result: string | null;
  fishing: string;
  lock_id: string | null;
  lock_until: number;
};
const cookieName = 'bramblewick_camp';
const reply = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
    },
  });
const random = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
function pose(value: unknown) {
  const p = value as { x?: number; z?: number; yaw?: number } | null;
  return p &&
    typeof p.x === 'number' &&
    typeof p.z === 'number' &&
    typeof p.yaw === 'number' &&
    Number.isFinite(p.yaw) &&
    Math.abs(p.yaw) < 1e6 &&
    onLand(p.x, p.z, 0.2)
    ? { x: p.x, z: p.z, yaw: p.yaw }
    : null;
}
export async function POST(request: Request) {
  let lease: { db: D1DatabaseSession; token: string; id: string } | undefined;
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return reply({ error: 'Open your camp on this site.' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json'))
      return reply({ error: 'JSON required.' }, 415);
    if (Number(request.headers.get('content-length')) > 600000)
      return reply({ error: 'That camp is too large.' }, 413);
    const raw = await request.text();
    if (raw.length > 600000)
      return reply({ error: 'That camp is too large.' }, 413);
    const input = JSON.parse(raw) as Record<string, unknown>;
    if (!input || typeof input !== 'object')
      return reply({ error: 'Invalid request.' }, 400);
    const db = database(),
      now = Date.now();
    const rawToken =
      request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1) ?? '';
    const token = /^[a-f0-9]{64}$/.test(rawToken) ? await hash(rawToken) : '';
    let member = token
      ? await db
          .prepare('SELECT * FROM campers WHERE token = ?')
          .bind(token)
          .first<Member>()
      : null;
    let code =
      typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
    let setCookie: string | undefined;
    if (input.op === 'create' || input.op === 'join') {
      const name =
        typeof input.name === 'string'
          ? input.name
              .trim()
              .split('')
              .filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>')
              .join('')
              .slice(0, 20)
          : '';
      if (!name)
        return reply(
          { error: 'Give your explorer a name (1–20 characters).' },
          400,
        );
      if (input.op === 'create') {
        const state = parseSave(JSON.stringify(input.state));
        if (!state)
          return reply(
            {
              error:
                'This island could not be copied. Export your save and try again.',
            },
            400,
          );
        code = random(8).toUpperCase();
        state.started = true;
        state.fishing = null;
        await db
          .prepare(
            'INSERT INTO camps (code, state, revision, created, updated) VALUES (?, ?, 0, ?, ?)',
          )
          .bind(code, JSON.stringify(state), now, now)
          .run();
      }
      if (!/^[A-F0-9]{16}$/.test(code))
        return reply({ error: 'Enter the 16-character camp code.' }, 400);
      if (
        !(await db
          .prepare('SELECT code FROM camps WHERE code = ?')
          .bind(code)
          .first())
      )
        return reply(
          { error: 'Camp not found. Check the invitation code.' },
          404,
        );
      if (!member || member.room !== code) {
        const secret = random(32),
          memberToken = await hash(secret),
          id = crypto.randomUUID();
        const inserted = await db.batch([
          db
            .prepare(
              'INSERT INTO campers (token,id,room,name,pose,seen) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM campers WHERE room = ? AND seen > ?) < 4',
            )
            .bind(
              memberToken,
              id,
              code,
              name,
              JSON.stringify({ ...initialState().player, yaw: 0 }),
              now,
              code,
              now - 15000,
            ),
          db
            .prepare(
              'DELETE FROM campers WHERE token = ? AND EXISTS (SELECT 1 FROM campers WHERE token = ?)',
            )
            .bind(member?.token ?? '', memberToken),
        ]);
        if (!inserted[0].meta.changes)
          return reply(
            {
              error:
                'This camp has four explorers. Ask someone to leave or try another camp.',
            },
            409,
          );
        member = await db
          .prepare('SELECT * FROM campers WHERE token = ?')
          .bind(memberToken)
          .first<Member>();
        setCookie = `${cookieName}=${secret}; Path=/api/camp; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
      } else
        await db
          .prepare('UPDATE campers SET name = ? WHERE token = ?')
          .bind(name, member.token)
          .run();
    }
    if (!member || member.room !== code)
      return reply(
        { error: 'Join this camp first. Your solo island is safe.' },
        401,
      );
    // Serialize personal needs and fishing for this membership; other players
    // remain independent and compete only on the shared world's revision.
    const lockId = crypto.randomUUID();
    const locked = await db
      .prepare(
        'UPDATE campers SET lock_id = ?, lock_until = ? WHERE token = ? AND lock_until <= ?',
      )
      .bind(lockId, now + 30000, member.token, now)
      .run();
    if (!locked.meta.changes)
      return reply(
        { error: 'Your previous camp action is finishing. Try again shortly.' },
        429,
      );
    lease = { db, token: member.token, id: lockId };
    member = await db
      .prepare('SELECT * FROM campers WHERE token = ?')
      .bind(member.token)
      .first<Member>();
    if (!member) return reply({ error: 'Join this camp first.' }, 401);
    if (input.op === 'leave') {
      await db
        .prepare('DELETE FROM campers WHERE token = ? AND lock_id = ?')
        .bind(member.token, lockId)
        .run();
      return reply(
        { code, id: member.id, revision: 0, peers: [] },
        200,
        `${cookieName}=; Path=/api/camp; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
    }
    const previousPose = pose(JSON.parse(member.pose))!;
    let position = pose(input.pose) ?? previousPose;
    const elapsed = Math.max(0, Math.min(5, (now - member.seen) / 1000));
    if (
      Math.hypot(position.x - previousPose.x, position.z - previousPose.z) >
      2 + Math.max(0.1, (now - member.seen) / 1000) * 12
    )
      return reply(
        {
          error: 'Movement is resynchronizing. Please slow down for a moment.',
        },
        409,
      );
    const room = await db
      .prepare('SELECT * FROM camps WHERE code = ?')
      .bind(code)
      .first<Camp>();
    if (!room) return reply({ error: 'Camp unavailable.' }, 404);
    const personalState = JSON.parse(room.state) as GameState;
    const personal: FrontierState['needs'] = member.needs
      ? JSON.parse(member.needs)
      : initialFrontier().needs;
    personalState.frontier.needs = personal;
    personalState.player = { x: position.x, z: position.z };
    if (
      (position.z < -29 && !personalState.projects.bridge) ||
      (position.z < -41 && !personalState.projects.gate)
    )
      return reply({ error: 'Open the highland route first.' }, 409);
    if (
      input.active === true &&
      now - member.last_hurt > 2000 &&
      ANIMALS.some(
        (a) =>
          a.kind === 'boar' &&
          !(personalState.depleted[a.id] > now) &&
          Math.hypot(
            animalPosition(a, now).x - position.x,
            animalPosition(a, now).z - position.z,
          ) < 1.3,
      )
    ) {
      personal.health = Math.max(0, personal.health - 8);
      member.last_hurt = now;
    }
    const rescued =
      input.active === true &&
      advanceSurvival(personalState, elapsed, input.sprinting === true);
    if (rescued) position = { ...personalState.player, yaw: position.yaw };

    // Expired clients may resume only when a slot remains available.
    const presence = await db
      .prepare(
        'UPDATE campers SET pose = ?, seen = ?, needs = ?, last_hurt = ? WHERE token = ? AND lock_id = ? AND (seen > ? OR (SELECT COUNT(*) FROM campers WHERE room = ? AND seen > ?) < 4)',
      )
      .bind(
        JSON.stringify(position),
        now,
        JSON.stringify(personal),
        member.last_hurt,
        member.token,
        lockId,
        now - 15000,
        code,
        now - 15000,
      )
      .run();
    if (!presence.meta.changes)
      return reply(
        { error: 'Camp is full. Leave and rejoin when a space opens.' },
        409,
      );
    let message: string | undefined, changed: boolean | undefined;
    if (input.op === 'action') {
      if (
        !validCommand(input.command) ||
        input.command.type === 'rescue' ||
        !validTool(input.tool) ||
        !Object.hasOwn(CROPS, String(input.crop)) ||
        typeof input.requestId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(input.requestId)
      )
        return reply({ error: 'Invalid camp action.' }, 400);
      const commandKey = JSON.stringify({
        command: input.command,
        tool: input.tool,
        crop: input.crop,
      });
      const receipt = await db
        .prepare(
          'SELECT command,result FROM camp_actions WHERE token = ? AND request_id = ?',
        )
        .bind(member.token, input.requestId)
        .first<{ command: string; result: string }>();
      if (receipt && receipt.command !== commandKey)
        return reply(
          { error: 'That action receipt belongs to a different command.' },
          409,
        );
      if (receipt) ({ message, changed } = JSON.parse(receipt.result));
      // Keep the last pre-migration action safe for clients already in flight.
      else if (member.last_action === input.requestId && member.last_result)
        ({ message, changed } = JSON.parse(member.last_result));
      else {
        let applied = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const camp = await db
            .prepare('SELECT * FROM camps WHERE code = ?')
            .bind(code)
            .first<Camp>();
          if (!camp) return reply({ error: 'Camp unavailable.' }, 404);
          const state = JSON.parse(camp.state) as GameState;
          state.player = { x: position.x, z: position.z };
          state.tool = input.tool as GameState['tool'];
          state.crop = input.crop as GameState['crop'];
          state.frontier.needs = structuredClone(personal);
          state.fishing = JSON.parse(member.fishing);
          const before = JSON.stringify(state);
          message = applyCommand(state, input.command, now);
          changed = before !== JSON.stringify(state);
          state.counters[`visit:${regionAt(position.x, position.z)}`] = 1;
          state.counters['survival:days'] = Math.max(
            state.counters['survival:days'] ?? 0,
            Math.floor(personal.activeTime / 600),
          );
          updateQuests(state);
          const fishing = JSON.stringify(state.fishing);
          state.fishing = null;
          const resultJson = JSON.stringify({ message, changed });
          const result = await db.batch([
            db
              .prepare(
                'UPDATE camps SET state = ?, revision = revision + 1, mutation = ?, updated = ? WHERE code = ? AND revision = ? AND EXISTS (SELECT 1 FROM campers WHERE token = ? AND lock_id = ?)',
              )
              .bind(
                JSON.stringify(state),
                lockId,
                now,
                code,
                camp.revision,
                member.token,
                lockId,
              ),
            db
              .prepare(
                'UPDATE campers SET last_action = ?, last_result = ?, needs = ?, fishing = ? WHERE token = ? AND lock_id = ? AND EXISTS (SELECT 1 FROM camps WHERE code = ? AND mutation = ?)',
              )
              .bind(
                input.requestId,
                resultJson,
                JSON.stringify(state.frontier.needs),
                fishing,
                member.token,
                lockId,
                code,
                lockId,
              ),
            db
              .prepare(
                'INSERT INTO camp_actions (token,request_id,command,result) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM camps WHERE code = ? AND mutation = ?) AND EXISTS (SELECT 1 FROM campers WHERE token = ? AND lock_id = ?)',
              )
              .bind(
                member.token,
                input.requestId,
                commandKey,
                resultJson,
                code,
                lockId,
                member.token,
                lockId,
              ),
          ]);
          if (result[0].meta.changes) {
            applied = true;
            break;
          }
        }
        if (!applied)
          return reply(
            {
              error:
                'Everyone reached for the same clipboard. Please try again.',
            },
            409,
          );
      }
    } else if (!['create', 'join', 'poll'].includes(String(input.op)))
      return reply({ error: 'Unknown camp request.' }, 400);
    if (input.op === 'poll') {
      // Exploration and survived days advance even without clicking an object.
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await db
          .prepare('SELECT * FROM camps WHERE code = ?')
          .bind(code)
          .first<Camp>();
        if (!latest) break;
        const state = JSON.parse(latest.state) as GameState,
          visit = `visit:${regionAt(position.x, position.z)}`,
          days = Math.floor(personal.activeTime / 600);
        if (
          state.counters[visit] &&
          (state.counters['survival:days'] ?? 0) >= days
        )
          break;
        state.counters[visit] = 1;
        state.counters['survival:days'] = Math.max(
          state.counters['survival:days'] ?? 0,
          days,
        );
        updateQuests(state);
        const updated = await db
          .prepare(
            'UPDATE camps SET state = ?, revision = revision + 1, updated = ? WHERE code = ? AND revision = ? AND EXISTS (SELECT 1 FROM campers WHERE token = ? AND lock_id = ?)',
          )
          .bind(
            JSON.stringify(state),
            now,
            code,
            latest.revision,
            member.token,
            lockId,
          )
          .run();
        if (updated.meta.changes) break;
      }
    }
    const camp = await db
      .prepare('SELECT * FROM camps WHERE code = ?')
      .bind(code)
      .first<Camp>();
    if (!camp) return reply({ error: 'Camp unavailable.' }, 404);
    const savedPersonal = await db
      .prepare('SELECT needs,fishing FROM campers WHERE token = ?')
      .bind(member.token)
      .first<{ needs: string; fishing: string }>();
    const players = await db
      .prepare(
        'SELECT id,name,pose FROM campers WHERE room = ? AND seen > ? ORDER BY id LIMIT 4',
      )
      .bind(code, now - 15000)
      .all<Member>();
    return reply(
      {
        code,
        id: member.id,
        revision: camp.revision,
        needs: savedPersonal?.needs
          ? JSON.parse(savedPersonal.needs)
          : personal,
        rescued,
        fishing: savedPersonal ? JSON.parse(savedPersonal.fishing) : null,
        position,
        peers: players.results.map((p) => ({
          id: p.id,
          name: p.name,
          ...JSON.parse(p.pose),
        })),
        ...(camp.revision !== input.revision
          ? { state: JSON.parse(camp.state) }
          : {}),
        message,
        changed,
      },
      200,
      setCookie,
    );
  } catch (error) {
    console.error(
      'Camp request failed',
      error instanceof Error ? error.message : 'unknown error',
    );
    return reply(
      {
        error:
          'The camp radio is unavailable. Your solo save is safe; try again shortly.',
      },
      error instanceof SyntaxError ? 400 : 503,
    );
  } finally {
    if (lease) {
      try {
        await lease.db
          .prepare(
            'UPDATE campers SET lock_id = NULL, lock_until = 0 WHERE token = ? AND lock_id = ?',
          )
          .bind(lease.token, lease.id)
          .run();
      } catch {
        console.warn('Camp membership lease will expire automatically.');
      }
    }
  }
}
