'use client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Waypoint } from '@/lib/game/navigation';
import { Progress } from '@/components/ui/progress';
import {
  ArrowUpRight,
  Compass,
  Hammer,
  Utensils,
  Footprints,
  LockKeyhole,
} from 'lucide-react';
import {
  FOOD,
  GEAR_NAMES,
  gearCost,
  upgradeCost,
  UPGRADABLE,
  EXPEDITIONS,
  expeditionProgress,
  LANDMARKS,
  stationLevel,
  type Gear,
} from '@/lib/game/frontier';
import {
  RECIPES,
  RESOURCE_NAMES,
  canAfford,
  type GameState,
  type Inventory,
  type Resource,
} from '@/lib/game/state';

export type FrontierAction = {
  kind:
    | 'upgrade'
    | 'gear'
    | 'expedition'
    | 'eat'
    | 'drink'
    | 'abandon-expedition';
  id: string;
};
function Price({
  cost,
  state,
}: {
  cost: Partial<Inventory>;
  state: GameState;
}) {
  return (
    <div className="frontier-price">
      {Object.entries(cost).map(([r, n]) => (
        <span
          key={r}
          className={state.inventory[r as Resource] < n! ? 'short' : ''}
        >
          {n} {RESOURCE_NAMES[r as Resource]}
        </span>
      ))}
    </div>
  );
}
export default function FrontierPanel({
  state,
  act,
  track,
  cooperative,
  now,
}: {
  state: GameState;
  act: (action: FrontierAction) => void;
  track: (target: Waypoint) => void;
  cooperative: boolean;
  now: number;
}) {
  const n = state.frontier.needs,
    run = state.frontier.expedition;
  return (
    <div className="frontier-panel">
      <div className="frontier-heading">
        <Compass size={30} />
        <div>
          <h3>Department of Mild Peril</h3>
          <p>
            Prepare at camp. Follow a new trail. Come back with a better story.
          </p>
        </div>
      </div>
      <Tabs defaultValue="equipment">
        <TabsList>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="workshops">Workshops</TabsTrigger>
          <TabsTrigger value="expeditions">Expeditions</TabsTrigger>
          <TabsTrigger value="atlas">Field notes</TabsTrigger>
          <TabsTrigger value="provisions">Provisions</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment">
          <p className="panel-note">
            Axes and pickaxes yield more per hit. Spears deal more damage. Boots
            improve movement. Larger canteens hold more and slow thirst. Craft
            your first spear here.
          </p>
          <div className="frontier-cards">
            {(Object.keys(GEAR_NAMES) as Gear[]).map((g) => {
              const level = state.frontier.gear[g],
                cost = gearCost(state, g),
                needed = level === 0 ? 1 : level === 1 ? 2 : 3,
                station = stationLevel(state, 'workbench');
              return (
                <article key={g}>
                  <Footprints />
                  <h3>{GEAR_NAMES[g]}</h3>
                  <strong>
                    {level === 0 ? 'Not crafted' : `Level ${level} / 3`}
                  </strong>
                  <p>
                    Requires workbench level {needed}
                    {station < needed ? ` · current ${station}` : ''}
                  </p>
                  <Price cost={cost} state={state} />
                  <button
                    disabled={
                      level >= 3 || station < needed || !canAfford(state, cost)
                    }
                    onClick={() => act({ kind: 'gear', id: g })}
                  >
                    {level >= 3
                      ? 'Masterwork'
                      : level === 0
                        ? 'Craft equipment'
                        : 'Upgrade equipment'}{' '}
                    <ArrowUpRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="workshops">
          <p className="panel-note">
            Level 2 unlocks advanced recipes. Level 3 workstations craft double
            output for the same ingredients. Gold ornaments mark upgraded
            buildings. Packed buildings return their original construction
            materials; upgrade materials are not refunded.
          </p>
          <div className="frontier-cards">
            {state.buildings
              .filter((b) => UPGRADABLE.includes(b.type))
              .map((b) => {
                const level = b.level ?? 1;
                return (
                  <article key={b.id}>
                    <Hammer />
                    <h3>{RECIPES[b.type].name}</h3>
                    <strong>
                      Level {level} / 3 · {Math.round(b.x)}, {Math.round(b.z)}
                    </strong>
                    <p>
                      {b.type === 'workbench'
                        ? 'L2: leather and rope. L3: clockwork parts and trail rations.'
                        : b.type === 'campfire'
                          ? 'L2: roast, broth, berry tea. L3: smoked jerky.'
                          : b.type === 'forge'
                            ? 'L2: steel. L3: double smelting output.'
                            : b.type === 'kiln'
                              ? 'L2: double brick output. L3: masterwork distinction.'
                              : b.type === 'shed'
                                ? 'Each upgrade adds one hunting damage.'
                                : b.type === 'cottage'
                                  ? 'Rest restores health; upgrades extend the comfort bonus.'
                                  : b.type === 'well'
                                    ? 'Refills add 60 seconds of comfort per upgrade.'
                                    : b.type === 'greenhouse'
                                      ? 'Each upgrade extends automatic watering by 3m and accelerates growth.'
                                      : 'Meals restore 10% more hunger per upgrade.'}
                    </p>
                    <Price cost={upgradeCost(b)} state={state} />
                    <button
                      disabled={level >= 3 || !canAfford(state, upgradeCost(b))}
                      onClick={() => act({ kind: 'upgrade', id: b.id })}
                    >
                      {level >= 3
                        ? 'Masterwork'
                        : `Upgrade to level ${level + 1}`}
                    </button>
                  </article>
                );
              })}
          </div>
          {!state.buildings.some((b) => UPGRADABLE.includes(b.type)) && (
            <p>
              Build a workbench or campfire first. Even ambition needs a table.
            </p>
          )}
        </TabsContent>
        <TabsContent value="expeditions">
          <p className="panel-note">
            Optional, repeatable outings with fresh objectives each time. You
            can pursue one alongside the main story.
          </p>
          <div className="frontier-cards">
            {run && (
              <div className="expedition-dismiss">
                <p>
                  {cooperative
                    ? 'This is your whole crew’s shared expedition. Abandoning clears its progress for everyone.'
                    : 'Changed your plans? Abandon without losing supplies, then choose a fresh expedition.'}
                </p>
                <button
                  onClick={() => act({ kind: 'abandon-expedition', id: '' })}
                >
                  Abandon expedition · no reward
                </button>
              </div>
            )}
            {EXPEDITIONS.map((e) => (
              <article
                key={e.id}
                className={run?.id === e.id ? 'selected' : ''}
              >
                <Compass />
                <h3>{e.name}</h3>
                <p>{e.detail}</p>
                <strong>
                  +{e.coins} acorns · +1 ancient acorn · +35 reputation
                </strong>
                {run?.id === e.id && (
                  <>
                    <Progress
                      value={(100 * expeditionProgress(state)) / e.target}
                    />
                    <span>
                      {expeditionProgress(state)} / {e.target}
                    </span>
                  </>
                )}
                <button
                  disabled={
                    !!run &&
                    (run.id !== e.id || expeditionProgress(state) < e.target)
                  }
                  onClick={() => act({ kind: 'expedition', id: e.id })}
                >
                  {run?.id === e.id
                    ? 'Claim expedition reward'
                    : run
                      ? 'One expedition at a time'
                      : 'Take this expedition'}
                </button>
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="atlas">
          <p className="panel-note">
            Eight hidden places, renewable caches, and no map-reading exam.
            Inspect a landmark with your hands before searching its cache.
          </p>
          <div className="frontier-cards">
            {LANDMARKS.map((l) => (
              <article key={l.id}>
                {state.frontier.discoveries.includes(l.id) ? (
                  <Compass />
                ) : (
                  <LockKeyhole />
                )}
                <h3>
                  {state.frontier.discoveries.includes(l.id)
                    ? l.name
                    : 'Uncharted place'}
                </h3>
                <p>{l.clue}</p>
                <strong>
                  {state.frontier.discoveries.includes(l.id)
                    ? `Discovered · ${l.x}, ${l.z}`
                    : 'Follow the clue to reveal this place'}
                </strong>
                {state.frontier.discoveries.includes(l.id) && (
                  <>
                    <small>
                      {!now
                        ? 'Checking cache supplies…'
                        : (state.frontier.treasures[`cache-${l.id}`] ?? 0) > now
                          ? `Cache refills in ${Math.ceil(((state.frontier.treasures[`cache-${l.id}`] ?? 0) - now) / 1000)}s`
                          : 'Cache ready to search'}
                    </small>
                    <button
                      disabled={
                        (state.frontier.treasures[`cache-${l.id}`] ?? 0) > now
                      }
                      onClick={() =>
                        track({
                          name: `${l.name} · cache`,
                          x: l.x + 2.3,
                          z: l.z + 2.2,
                        })
                      }
                    >
                      {(state.frontier.treasures[`cache-${l.id}`] ?? 0) > now
                        ? 'Cache restocking'
                        : 'Guide to cache'}
                    </button>
                  </>
                )}
              </article>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="provisions">
          <p className="panel-note">
            Food {Math.ceil(n.hunger)} · Water {Math.ceil(n.thirst)} · Health{' '}
            {Math.ceil(n.health)}. Hunger and thirst drain while playing, faster
            when sprinting. Empty meters cost health. A rescue brings you home
            {cooperative
              ? 'with the bill covered by group insurance'
              : 'for 5 acorns'}
            . Raw meat needs cooking.
          </p>
          <button
            className="frontier-drink"
            disabled={!n.canteen || n.thirst >= 99.5}
            onClick={() => act({ kind: 'drink', id: '' })}
          >
            Drink from canteen · {n.canteen} sips left · G
          </button>
          <div className="frontier-cards">
            {(Object.keys(FOOD) as Resource[])
              .filter((r) => state.inventory[r] > 0)
              .map((r) => (
                <article key={r}>
                  <Utensils />
                  <h3>
                    {RESOURCE_NAMES[r]} × {state.inventory[r]}
                  </h3>
                  <p>
                    Food +{FOOD[r]!.hunger} · water{' '}
                    {FOOD[r]!.thirst >= 0 ? '+' : ''}
                    {FOOD[r]!.thirst} · health +{FOOD[r]!.health}
                  </p>
                  <button onClick={() => act({ kind: 'eat', id: r })}>
                    Eat / drink
                  </button>
                </article>
              ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
