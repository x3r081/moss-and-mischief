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
  fishing?: GameState['fishing'];
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
    fishing: local.fishing,
    started: true,
    frontier: { ...shared.frontier, needs: local.frontier.needs },
  };
}
export class CampRequestError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status = 0,
  ) {
    super(message);
    this.name = 'CampRequestError';
  }
}
export class CampClient {
  code = '';
  id = '';
  revision = -1;
  private queue: Promise<unknown> = Promise.resolve();
  async request(body: Record<string, unknown>): Promise<CampUpdate> {
    let response: Response;
    try {
      response = await fetch('/api/camp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new CampRequestError(
        'The camp radio lost contact. Please try again.',
        true,
      );
    }
    let result: CampUpdate & { error?: string };
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;
    try {
      result = await response.json();
    } catch {
      throw new CampRequestError(
        'The camp radio received static. Please try again.',
        retryable || response.ok,
        response.status,
      );
    }
    if (!response.ok)
      throw new CampRequestError(
        result.error || 'The camp radio is temporarily out of range.',
        retryable,
        response.status,
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
      const deadline = Date.now() + 45000;
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.request(body);
        } catch (error) {
          if (
            !(error instanceof CampRequestError) ||
            !error.retryable ||
            Date.now() >= deadline ||
            (error.status !== 429 && attempt >= 2)
          )
            throw error;
          // An uncertain response may still own the server lease. Keep its
          // request ID while waiting, so recovery cannot purchase twice.
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(2000, 300 * 2 ** attempt)),
          );
        }
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  async leave() {
    const run = async () => {
      await this.request({ op: 'leave', code: this.code });
      this.code = '';
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    await next;
  }
}
