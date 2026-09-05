import type { GameState } from './state';
import type { GameCommand } from './commands';

export type Peer = {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
};
export type CampUpdate = {
  code: string;
  id: string;
  revision: number;
  peers: Peer[];
  state?: GameState;
  message?: string;
  changed?: boolean;
  needs?: GameState['frontier']['needs'];
  rescued?: boolean;
  position?: { x: number; z: number; yaw: number };
};
/** Room state is shared; camera, options and needs belong to this player. */
export function mergeCamp(local: GameState, shared: GameState): GameState {
  return {
    ...shared,
    player: local.player,
    elapsed: local.elapsed,
    view: local.view,
    sound: local.sound,
    quality: local.quality,
    tool: local.tool,
    crop: local.crop,
    started: true,
    frontier: { ...shared.frontier, needs: local.frontier.needs },
  };
}
export class CampClient {
  code = '';
  id = '';
  revision = -1;
  private queue: Promise<unknown> = Promise.resolve();
  async request(body: Record<string, unknown>): Promise<CampUpdate> {
    const response = await fetch('/api/camp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const result = (await response.json()) as CampUpdate & { error?: string };
    if (!response.ok)
      throw new Error(
        result.error || 'The camp radio is temporarily out of range.',
      );
    return result;
  }
  async enter(
    op: 'create' | 'join',
    name: string,
    state: GameState,
    code = '',
  ) {
    const result = await this.request({
      op,
      name,
      code,
      ...(op === 'create' ? { state } : {}),
    });
    this.code = result.code;
    this.id = result.id;
    this.revision = result.revision;
    return result;
  }
  poll(state: GameState, active = false) {
    const run = () =>
      this.request({
        op: 'poll',
        code: this.code,
        revision: this.revision,
        pose: { ...state.player, yaw: state.view.yaw },
        active,
      });
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  action(command: GameCommand, state: GameState, active = false) {
    const body = {
      op: 'action',
      active,
      code: this.code,
      requestId: crypto.randomUUID(),
      command,
      tool: state.tool,
      crop: state.crop,
      pose: { ...state.player, yaw: state.view.yaw },
    };
    const run = async () => {
      try {
        return await this.request(body);
      } catch (error) {
        if (
          error instanceof Error &&
          /fetch|timeout|network/i.test(error.message)
        )
          return this.request(body);
        throw error;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  async leave() {
    await this.request({ op: 'leave', code: this.code });
    this.code = '';
  }
}
