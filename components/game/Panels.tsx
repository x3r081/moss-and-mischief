'use client';
import FrontierPanel, { type FrontierAction } from './FrontierPanel';
import { FOOD, stationLevel } from '@/lib/game/frontier';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  TreePine,
  Mountain,
  Leaf,
  Wheat,
  Carrot,
  Package,
  Heart,
  Star,
  Flame,
  Hammer,
  House,
  Sprout,
  Check,
  ArrowRight,
  Volume2,
  Monitor,
  Download,
  Upload,
  RotateCcw,
  Maximize,
  Save,
  Fish,
  Egg,
  Flower2,
  LockKeyhole,
  CircleDot,
  MapPin,
} from 'lucide-react';
import {
  QUESTS,
  RECIPES,
  RESOURCE_NAMES,
  STRUCTURES,
  CRAFTABLES,
  CONTRACTS,
  PROJECT_COSTS,
  PROJECT_LOCATIONS,
  RELIC_LOCATIONS,
  NPCS,
  REGIONS,
  ACT_NAMES,
  count,
  currentQuest,
  canAfford,
  unlocked,
  type GameState,
  type Resource,
  type Structure,
  type Craftable,
  type Project,
  type Npc,
} from '@/lib/game/state';
import { shoreRadius } from '@/lib/game/terrain';
const resourceIcons: Partial<Record<Resource, typeof Package>> = {
  wood: TreePine,
  stone: Mountain,
  fiber: Leaf,
  seed: Wheat,
  carrot: Carrot,
  plank: Package,
  bread: Heart,
  crystal: Star,
  fish: Fish,
  egg: Egg,
  lavender: Flower2,
  wheat: Wheat,
  honey: Flower2,
};
const buildIcons: Partial<Record<Structure, typeof Hammer>> = {
  workbench: Hammer,
  campfire: Flame,
  cottage: House,
  garden: Sprout,
  greenhouse: Sprout,
  coop: Egg,
  beehive: Flower2,
  observatory: Star,
};
type Props = {
  panel: string;
  state: GameState;
  close: () => void;
  place: (type: Structure) => void;
  pack: (id: string) => void;
  craft: (type: Craftable, amount?: number) => void;
  eat: (type: Resource) => void;
  frontier: (action: FrontierAction) => void;
  multiplayer?: React.ReactNode;
  contract: (id: string) => void;
  trade: (type: Resource, sell: boolean) => void;
  viewSetting: (
    key: 'fov' | 'sensitivity' | 'bob',
    value: number | boolean,
  ) => void;
  setting: (key: 'sound' | 'quality', value: boolean | 'high' | 'low') => void;
  save: () => void;
  exportSave: () => void;
  importSave: (file: File) => void;
  restart: () => void;
};
function Costs({
  state,
  cost,
}: {
  state: GameState;
  cost: Partial<Record<Resource, number>>;
}) {
  return (
    <div className="recipe-costs">
      {Object.entries(cost).map(([r, n]) => {
        const key = r as Resource,
          Icon = resourceIcons[key] ?? Package;
        return (
          <span
            key={r}
            className={state.inventory[key] >= n! ? 'enough' : 'short'}
          >
            <Icon size={14} />
            <b>
              {state.inventory[key]} / {n}
            </b>
            <span>{RESOURCE_NAMES[key]}</span>
          </span>
        );
      })}
    </div>
  );
}
function IslandMap({ state }: { state: GameState }) {
  const X = (x: number) => 210 + x * 3.5,
    Z = (z: number) => 180 + z * 3.1;
  const d =
    Array.from({ length: 101 }, (_, i) => {
      const a = (i / 100) * Math.PI * 2,
        r = shoreRadius(a);
      return `${i ? 'L' : 'M'}${X(Math.cos(a) * r)},${Z(Math.sin(a) * r)}`;
    }).join(' ') + ' Z';
  return (
    <div className="expansion-map">
      <svg
        viewBox="0 0 420 360"
        aria-label="Map of all six island regions with residents, projects, relics and your location"
      >
        <rect width="420" height="360" rx="18" fill="#245c5d" />
        <path d={d} fill="#88a873" stroke="#d2c696" strokeWidth="5" />
        {Object.values(REGIONS).map((r) => (
          <path
            key={r.name}
            d={`M${X(0)} ${Z(7)} L${X(r.x)} ${Z(r.z)}`}
            stroke="#d4c292"
            strokeWidth="3"
            opacity=".8"
          />
        ))}
        <path
          d={`M${X(-42)} ${Z(-30)}H${X(42)}`}
          stroke="#617c70"
          strokeWidth="4"
          strokeDasharray="5 5"
        />
        {Object.entries(REGIONS).map(([key, r]) => (
          <g key={key}>
            <circle cx={X(r.x)} cy={Z(r.z)} r="5" fill="#315b41" />
            <text x={X(r.x)} y={Z(r.z) - 10} textAnchor="middle">
              {r.name}
            </text>
          </g>
        ))}
        {RELIC_LOCATIONS.filter((r) => !state.collected.includes(r.id)).map(
          (r) => (
            <text className="map-relic" key={r.id} x={X(r.x)} y={Z(r.z)}>
              ✦
            </text>
          ),
        )}
        {Object.entries(PROJECT_LOCATIONS).map(([key, r]) => (
          <rect
            key={key}
            x={X(r.x) - 3}
            y={Z(r.z) - 3}
            width="6"
            height="6"
            fill={state.projects[key as Project] ? '#fff4b6' : '#aa703b'}
          />
        ))}
        <circle
          cx={X(state.player.x)}
          cy={Z(state.player.z)}
          r="5.5"
          fill="#fff6ca"
          stroke="#214638"
          strokeWidth="2"
        />
      </svg>
      <p>● You · ✦ Lost relic · ■ Community project · North is up</p>
    </div>
  );
}
export default function Panels(props: Props) {
  const { panel, state, close } = props;
  const [confirm, setConfirm] = useState(false),
    [batch, setBatch] = useState(1);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const q = currentQuest(state),
    quest = QUESTS[q],
    titles: Record<string, string> = {
      adventure: 'A little more adventure.',
      multiplayer: 'A camp with company.',
      build: 'A village of your own.',
      craft: 'Good things, handmade.',
      inventory: 'A pocket full of possibilities.',
      journal: 'The great Bramblewick adventure.',
      pause: 'Take a breather.',
      help: 'The Bramblewick field guide.',
      market: 'The goose economy.',
    };
  return (
    <>
      <Dialog
        open={!!panel}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent className="game-dialog" showCloseButton>
          <div className="panel-heading">
            <span className="eyebrow">MOSS & MISCHIEF · BRAMBLEWICK</span>
            <DialogTitle>{titles[panel] ?? 'Your island'}</DialogTitle>
            <DialogDescription>
              {panel === 'journal'
                ? `${state.completed.length} / ${QUESTS.length} quests · ${state.xp} reputation · ${state.inventory.coins} acorns`
                : 'Grow roots. Make something. Leave room for a goose.'}
            </DialogDescription>
          </div>
          {panel === 'adventure' && (
            <FrontierPanel state={state} act={props.frontier} />
          )}
          {panel === 'multiplayer' && props.multiplayer}
          {panel === 'build' && (
            <Tabs defaultValue="plans">
              <TabsList>
                <TabsTrigger value="plans">Building plans</TabsTrigger>
                <TabsTrigger value="placed">
                  My village ({state.buildings.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="plans">
                <p className="panel-note">
                  Select a plan to see the placement grid. Green cells fit the
                  entire footprint; red cells explain what blocks it. R rotates.
                  Click or Enter places.
                </p>
                <div className="expansion-recipes">
                  {STRUCTURES.map((type) => {
                    const r = RECIPES[type],
                      Icon = buildIcons[type] ?? House,
                      open = unlocked(state, type);
                    return (
                      <article
                        className={`expansion-recipe ${!open ? 'locked' : ''}`}
                        key={type}
                      >
                        <div className="recipe-title">
                          <Icon size={27} />
                          <div>
                            <h3>{r.name}</h3>
                            <small>{r.size?.join(' × ')}m footprint</small>
                          </div>
                          {!open && <LockKeyhole size={16} />}
                        </div>
                        <p>{r.description}</p>
                        <Costs state={state} cost={r.cost} />
                        <button
                          className="recipe-action"
                          disabled={!open || !canAfford(state, r.cost)}
                          onClick={() => props.place(type)}
                        >
                          {!open
                            ? `After quest ${r.unlock}`
                            : canAfford(state, r.cost)
                              ? 'Choose location'
                              : 'More materials needed'}
                          <ArrowRight size={15} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="placed">
                <p className="panel-note">
                  Pack a building to move it. All construction materials are
                  returned; planted seeds and feed are refunded.
                </p>
                <div className="village-list">
                  {state.buildings.length === 0 && (
                    <p>Your first building is waiting in the plans tab.</p>
                  )}
                  {state.buildings.map((b) => (
                    <article key={b.id}>
                      <div>
                        <b>{RECIPES[b.type].name}</b>
                        <small>
                          {b.x.toFixed(0)}, {b.z.toFixed(0)}
                          {state.production[b.id]
                            ? ` · ${now >= state.production[b.id] ? 'Produce ready' : 'Producing…'}`
                            : ''}
                        </small>
                      </div>
                      <button onClick={() => props.pack(b.id)}>
                        Pack away
                      </button>
                    </article>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}
          {panel === 'craft' && (
            <>
              <div className="batch-select">
                <span>Batch size</span>
                {[1, 5, 10].map((n) => (
                  <button
                    key={n}
                    className={batch === n ? 'active' : ''}
                    onClick={() => setBatch(n)}
                  >
                    {n}
                  </button>
                ))}
                <small>
                  Build the required station anywhere on your island.
                </small>
              </div>
              <Tabs defaultValue="material">
                <TabsList>
                  <TabsTrigger value="material">Materials</TabsTrigger>
                  <TabsTrigger value="food">Kitchen</TabsTrigger>
                </TabsList>
                {(['material', 'food'] as const).map((category) => (
                  <TabsContent key={category} value={category}>
                    <div className="expansion-recipes">
                      {CRAFTABLES.filter(
                        (t) => RECIPES[t].category === category,
                      ).map((type) => {
                        const r = RECIPES[type],
                          open = unlocked(state, type),
                          station =
                            !r.station ||
                            stationLevel(state, r.station) >=
                              (r.stationLevel ?? 1),
                          cost = Object.fromEntries(
                            Object.entries(r.cost).map(([k, v]) => [
                              k,
                              v! * batch,
                            ]),
                          ),
                          Icon = resourceIcons[type] ?? Package;
                        return (
                          <article className="expansion-recipe" key={type}>
                            <div className="recipe-title">
                              <Icon size={26} />
                              <div>
                                <h3>
                                  {r.name} × {batch}
                                </h3>
                                <small>
                                  {r.station && RECIPES[r.station].name} Lv{' '}
                                  {r.stationLevel ?? 1} ·{' '}
                                  {state.inventory[type]} in backpack
                                </small>
                              </div>
                            </div>
                            <p>{r.description}</p>
                            <Costs state={state} cost={cost} />
                            <button
                              className="recipe-action"
                              disabled={
                                !open || !station || !canAfford(state, cost)
                              }
                              onClick={() => props.craft(type, batch)}
                            >
                              {!open
                                ? `After quest ${r.unlock}`
                                : !station
                                  ? `Need ${RECIPES[r.station!].name} level ${r.stationLevel ?? 1}`
                                  : canAfford(state, cost)
                                    ? `Craft ${batch}`
                                    : 'More ingredients needed'}
                              <Hammer size={15} />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
          {panel === 'inventory' && (
            <>
              <div className="backpack-summary">
                <Package size={24} />
                <span>
                  {state.inventory.coins} acorns · {state.xp} reputation ·{' '}
                  {state.collected.length}/4 relics
                </span>
              </div>
              <div className="expanded-inventory">
                {(Object.keys(RESOURCE_NAMES) as Resource[]).map((r) => {
                  const Icon = resourceIcons[r] ?? Package;
                  return (
                    <article
                      key={r}
                      className={!state.inventory[r] ? 'empty' : ''}
                    >
                      <Icon size={25} />
                      <b>{state.inventory[r]}</b>
                      <span>{RESOURCE_NAMES[r]}</span>
                      {FOOD[r] && state.inventory[r] > 0 && (
                        <button onClick={() => props.eat(r)}>
                          Eat · +{FOOD[r]!.hunger} food
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {panel === 'journal' && (
            <Tabs defaultValue="story">
              <TabsList>
                <TabsTrigger value="story">Story</TabsTrigger>
                <TabsTrigger value="map">Island map</TabsTrigger>
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="requests">Requests</TabsTrigger>
              </TabsList>
              <TabsContent value="story">
                <article className="active-quest">
                  <span className="eyebrow">
                    ACT {quest.act} · QUEST {q + 1} / {QUESTS.length}
                  </span>
                  <h3>{quest.title}</h3>
                  <p>{quest.detail}</p>
                  <ul>
                    {quest.objectives.map((o) => (
                      <li key={o.key}>
                        <span>
                          {count(state, o.key) >= o.target ? (
                            <Check size={16} />
                          ) : (
                            <CircleDot size={16} />
                          )}{' '}
                          {o.label}
                        </span>
                        <b>
                          {Math.min(count(state, o.key), o.target)} / {o.target}
                        </b>
                      </li>
                    ))}
                  </ul>
                  <blockquote>“{quest.quote}”</blockquote>
                  <small>
                    {NPCS[quest.npc as Npc]?.name} · Reward:{' '}
                    {quest.reward.coins} acorns + {quest.reward.xp} reputation
                  </small>
                </article>
                <div className="campaign-list">
                  {ACT_NAMES.map((name, act) => (
                    <details key={name} open={act === quest.act - 1}>
                      <summary>
                        Act {act + 1} · {name}
                        <small>
                          {
                            state.completed.filter(
                              (i) => QUESTS[i].act === act + 1,
                            ).length
                          }
                          /
                          {QUESTS.filter((item) => item.act === act + 1).length}{' '}
                          complete
                        </small>
                      </summary>
                      {QUESTS.map(
                        (item, i) =>
                          item.act === act + 1 && (
                            <div
                              key={item.id}
                              className={i === q ? 'current' : ''}
                            >
                              <span>
                                {state.completed.includes(i) ? (
                                  <Check size={16} />
                                ) : (
                                  <span className="quest-number">{i + 1}</span>
                                )}
                              </span>
                              <div>
                                <b>{item.title}</b>
                                <p>{item.short}</p>
                              </div>
                            </div>
                          ),
                      )}
                    </details>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="map">
                <IslandMap state={state} />
                <div className="resident-list">
                  {Object.entries(NPCS).map(([id, n]) => (
                    <div key={id}>
                      <MapPin size={16} />
                      <span>
                        <b>{n.name}</b>
                        <small>
                          {REGIONS[n.region].name} · {n.x}, {n.z}
                        </small>
                      </span>
                      {state.counters[`talk:${id}`] ? (
                        <Check size={16} />
                      ) : (
                        <small>Not yet met</small>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="projects">
                <p className="panel-note">
                  Bring these materials to the marked project site and press E.
                  Buildings alone do not complete community projects.
                </p>
                <div className="expansion-recipes">
                  {(Object.keys(PROJECT_LOCATIONS) as Project[]).map((type) => {
                    const r = PROJECT_LOCATIONS[type];
                    return (
                      <article className="expansion-recipe" key={type}>
                        <h3>
                          {r.name} {state.projects[type] && '✓'}
                        </h3>
                        <p>{RECIPES[type].description}</p>
                        <small>
                          Map coordinates {r.x}, {r.z}
                          {type === 'gate' ? ' · Requires all four relics' : ''}
                          {['observatory', 'festival'].includes(type)
                            ? ` · Build ${RECIPES[type].name} first`
                            : ''}
                        </small>
                        <Costs state={state} cost={PROJECT_COSTS[type]} />
                        <p className="project-status">
                          {state.projects[type]
                            ? 'Restored. Honk approved.'
                            : `Visit the site to contribute · after quest ${type === 'festival' ? 35 : RECIPES[type].unlock}`}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="requests">
                <p className="panel-note">
                  Meet each resident before delivering. Requests repeat after 90
                  seconds and reward acorns for the market. Story objectives
                  track your lifetime work, so selling produce keeps your
                  progress.
                </p>
                <div className="expansion-recipes">
                  {CONTRACTS.map((c) => {
                    const met = !!state.counters[`talk:${c.npc}`],
                      cooldown = (state.contracts[c.id] ?? 0) > now;
                    return (
                      <article className="expansion-recipe" key={c.id}>
                        <small>{NPCS[c.npc as Npc]?.name}</small>
                        <h3>{c.title}</h3>
                        <p>{c.description}</p>
                        <Costs state={state} cost={c.cost} />
                        <button
                          className="recipe-action"
                          disabled={
                            !met || cooldown || !canAfford(state, c.cost)
                          }
                          onClick={() => props.contract(c.id)}
                        >
                          {!met
                            ? 'Meet this resident first'
                            : cooldown
                              ? 'Resident is enjoying the delivery'
                              : `Deliver · +${c.reward.coins} acorns`}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          )}
          {panel === 'market' && (
            <>
              <p className="panel-note">
                Sell one item at a time. Save ingredients for your community
                projects. All acorns are earned in the game.
              </p>
              <button
                className="recipe-action"
                onClick={() => props.trade('seed', false)}
                disabled={
                  !state.buildings.some((b) => b.type === 'market') ||
                  state.inventory.coins < 5
                }
              >
                Buy 10 seeds · 5 acorns
              </button>
              <div className="expanded-inventory">
                {(
                  [
                    'carrot',
                    'wheat',
                    'pumpkin',
                    'lavender',
                    'fish',
                    'apple',
                    'mushroom',
                    'bread',
                    'jam',
                    'pie',
                    'honey',
                    'egg',
                  ] as Resource[]
                ).map((r) => (
                  <article key={r}>
                    <b>{state.inventory[r]}</b>
                    <span>{RESOURCE_NAMES[r]}</span>
                    <button
                      disabled={!state.inventory[r]}
                      onClick={() => props.trade(r, true)}
                    >
                      Sell · +
                      {r === 'pie'
                        ? 15
                        : ['bread', 'jam', 'honey'].includes(r)
                          ? 5
                          : 2}{' '}
                      acorns
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {panel === 'help' && (
            <div className="expansion-help">
              <h3>Welcome to eye level.</h3>
              <p>
                Click the scene to capture your mouse. Move the mouse to look
                around and use WASD to walk. Aim the crosshair at a nearby
                object; its name appears when it is within reach. E or
                left-click uses your equipped tool. The first click after a menu
                captures the mouse without using your tool.
              </p>
              <p>
                Tab releases the cursor for the toolbar. Escape pauses and frees
                the cursor. Closing a menu leaves the mouse free until you click
                the scene again. If mouse capture is unavailable, mouse movement
                still turns the view without holding a button. Move to the edge
                of the scene to keep turning; Tab frees the cursor. On touch
                screens, drag the scene to look and use the movement pad and Use
                button. Arrow keys also turn the view.
              </p>
              <h3>Your tools have jobs.</h3>
              <p>
                <b>1 Axe:</b> timber. <b>2 Pickaxe:</b> stone, clay, copper.{' '}
                <b>3 Seeds:</b> R cycles unlocked crops; plant empty beds.{' '}
                <b>4 Water:</b> water growing crops. <b>5 Build:</b> plans and
                placement. <b>6 Hands:</b> harvest crops, forage, collect
                relics. <b>7 Rod:</b> fish. <b>8 Spear:</b> hunt wildlife.
              </p>
              <p>
                <b>Mouse wheel or 1–8 selects tools. B opens building plans.</b>{' '}
                R rotates a build preview; scrolling switches tools and cancels
                placement. <b>E uses your equipped tool.</b> The interaction
                prompt tells you which tool is needed. Talk, refill water, use
                stations and contribute to projects with any tool. Aim at the
                object within reach and press E or left-click. Objects behind
                walls cannot be used.
              </p>
              <h3>Grow a little more.</h3>
              <p>
                Cut trees leave short stumps, deposits leave rubble, and forage
                leaves clipped patches. They cannot be harvested again until
                regrown. Aim at the remains to see how long is left.
              </p>
              <p>
                Watered carrots take 70 seconds, wheat 95, lavender 110, and
                pumpkins 140. Unwatered plants grow slowly. Harvests return
                produce and seeds. Gather wildflowers for free seeds. Refill at
                the spring near (1, 11), or build a well. A greenhouse speeds
                and waters new plantings within 9m.
              </p>
              <h3>Build with confidence.</h3>
              <p>
                The green grid shows where the entire selected building fits.
                Red cells are blocked. The preview explains the reason. Build
                within 14m, away from paths’ residents, shore, crops, and other
                structures. Harvested resource footprints stay reserved for
                regrowth. R rotates, Enter or click places, Esc cancels. Pack
                buildings from My Village to refund original construction
                materials; upgrade materials are not refunded.
              </p>
              <h3>Snacks are a survival strategy.</h3>
              <p>
                F eats a carried meal; G drinks from your canteen. Hunger and
                thirst drain while you play, and low supplies slow movement and
                recovery. Empty supplies damage health. The goose ambulance
                returns you to camp if you collapse. Menus pause your needs.
                Refill drinking water at the spring or a well; cook hunted meat
                before eating. Rabbits are easy prey; boars hurt if approached
                too closely.
              </p>
              <h3>Upgrade, explore, and bring a friend.</h3>
              <p>
                U opens equipment, workshop upgrades, repeatable expeditions,
                landmark clues, and provisions. Better stations unlock leather,
                steel, machinery and expedition meals. Find eight landmarks and
                revisit their caches. L opens four-player camps: create a shared
                copy of your island or join with a friend’s code. Materials,
                buildings, farms and quests are shared; hunger, thirst and
                health are personal. Leaving restores your solo island.
              </p>
              <h3>Workshops and wildlife.</h3>
              <p>
                Build a kiln to fire bricks, a forge for ingots, a windmill for
                flour, and a tavern for feasts. Your crafting panel shows each
                recipe and can make batches. Feed a coop 3 wheat or an apiary 3
                lavender, then return in two minutes to collect eggs or honey.
              </p>
              <p>
                <b>Fishing:</b> meet Captain Minnow in the marsh. At a fish
                marker, equip the rod, E to cast (1 seed), wait for the golden
                BITE prompt, then E again within five seconds. Keep close to the
                marker.
              </p>
              <h3>The wider adventure.</h3>
              <p>
                Six acts contain 36 story quests. The lighthouse ends Act I; the
                bridge opens the highlands, and four relics unlock the ancient
                gate. Your journal contains the map, residents, objective
                counts, recipes for projects, and 12 repeatable requests.
              </p>
              <p>
                <b>Controls:</b> WASD walk, mouse or arrows look, Shift sprint,
                Space hop, E / left-click use. Scroll switches tools; during
                building it rotates the plan. B build, C craft, I backpack, J
                journal, Tab cursor, Esc pause. Field of view, mouse sensitivity
                and optional head movement are in Settings.
              </p>
              <p className="help-tip">
                Progress autosaves on this device. Export a backup in Settings.
                The island keeps growing after the festival.
              </p>
            </div>
          )}
          {panel === 'pause' && (
            <div className="settings-content">
              <div className="setting-row">
                <div>
                  <Volume2 size={19} />
                  <span>
                    Island sounds
                    <small>Original music, birds, and occasional honking</small>
                  </span>
                </div>
                <Switch
                  checked={state.sound}
                  onCheckedChange={(v) => props.setting('sound', v)}
                  aria-label="Island sounds"
                />
              </div>
              <div className="setting-row">
                <div>
                  <Monitor size={19} />
                  <span>
                    Graphics<small>Soft shadows or a lighter touch</small>
                  </span>
                </div>
                <div className="quality-select">
                  <button
                    className={state.quality === 'high' ? 'active' : ''}
                    onClick={() => props.setting('quality', 'high')}
                  >
                    Beautiful
                  </button>
                  <button
                    className={state.quality === 'low' ? 'active' : ''}
                    onClick={() => props.setting('quality', 'low')}
                  >
                    Lightweight
                  </button>
                </div>
              </div>
              <div className="view-settings">
                <h3>First-person comfort</h3>
                <label htmlFor="view-fov">
                  <span>
                    Field of view <b>{state.view.fov}°</b>
                  </span>
                  <input
                    id="view-fov"
                    type="range"
                    min="60"
                    max="95"
                    step="1"
                    value={state.view.fov}
                    onChange={(e) =>
                      props.viewSetting('fov', Number(e.target.value))
                    }
                  />
                  <small>A wider view shows more of the island.</small>
                </label>
                <label htmlFor="view-sensitivity">
                  <span>
                    Mouse sensitivity{' '}
                    <b>{state.view.sensitivity.toFixed(1)}×</b>
                  </span>
                  <input
                    id="view-sensitivity"
                    type="range"
                    min="0.3"
                    max="2.5"
                    step="0.1"
                    value={state.view.sensitivity}
                    onChange={(e) =>
                      props.viewSetting('sensitivity', Number(e.target.value))
                    }
                  />
                </label>
                <div className="setting-row">
                  <span>
                    Gentle head movement
                    <small>Off keeps the camera steady while walking.</small>
                  </span>
                  <Switch
                    checked={state.view.bob}
                    onCheckedChange={(v) => props.viewSetting('bob', v)}
                    aria-label="Gentle head movement"
                  />
                </div>
                <p>
                  Mouse to look · WASD to walk · Tab to release the cursor.
                  Click the scene to resume looking after closing this menu.
                </p>
              </div>
              <div className="save-actions">
                <button onClick={props.save}>
                  <Save size={17} /> Save adventure
                </button>
                <button onClick={props.exportSave}>
                  <Download size={17} /> Export save
                </button>
                <label>
                  <Upload size={17} /> Import save
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        props.importSave(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen().catch(() => {});
                    else
                      void document.documentElement
                        .requestFullscreen?.()
                        .catch(() => {});
                  }}
                >
                  <Maximize size={17} /> Fullscreen
                </button>
              </div>
              <p className="panel-note">
                Solo progress saves on this device; co-op camps save online.
                Export a copy to take your island with you.
              </p>
              <div className="settings-footer">
                <button
                  className="reset-button"
                  onClick={() => setConfirm(true)}
                >
                  <RotateCcw size={14} /> A fresh beginning
                </button>
                <button className="start-button" onClick={close}>
                  Back to the island <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className="reset-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new adventure?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the save on this device. Export your current save
              first if you want to return to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my island</AlertDialogCancel>
            <AlertDialogAction onClick={props.restart}>
              Start fresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
