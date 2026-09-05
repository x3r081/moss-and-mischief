'use client';
import { useState } from 'react';
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
  Keyboard,
  Clock,
} from 'lucide-react';
import {
  QUESTS,
  RECIPES,
  RESOURCE_NAMES,
  currentQuest,
  canAfford,
  type GameState,
  type Resource,
  type Structure,
} from '@/lib/game/state';
import { shoreRadius } from '@/lib/game/terrain';

const resourceIcons = {
  wood: TreePine,
  stone: Mountain,
  fiber: Leaf,
  seed: Wheat,
  carrot: Carrot,
  plank: Package,
  bread: Heart,
  crystal: Star,
};
const buildIcons = {
  workbench: Hammer,
  campfire: Flame,
  cottage: House,
  fence: Package,
  garden: Sprout,
};
type Props = {
  panel: string;
  state: GameState;
  close: () => void;
  place: (type: Structure) => void;
  pack: (id: string) => void;
  craft: (type: 'plank' | 'bread') => void;
  eat: (type: 'bread' | 'carrot') => void;
  setting: (key: 'sound' | 'quality', value: boolean | 'high' | 'low') => void;
  save: () => void;
  exportSave: () => void;
  importSave: (file: File) => void;
  restart: () => void;
};

function IslandMap({ state }: { state: GameState }) {
  const d =
    Array.from({ length: 80 }, (_, i) => {
      const a = (i / 79) * Math.PI * 2,
        r = shoreRadius(a);
      return `${i ? 'L' : 'M'}${160 + Math.cos(a) * r * 4},${119 + Math.sin(a) * r * 3.6}`;
    }).join(' ') + ' Z';
  return (
    <div className="journal-map">
      <svg
        viewBox="0 0 320 235"

        aria-label="Island map with your position, homestead, northern ruins, and eastern lighthouse"
      >
        <defs>
          <pattern
            id="map-water"
            width="17"
            height="17"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M3 9 Q6 6 9 9"
              fill="none"
              stroke="#80bbae"
              strokeWidth=".7"
              opacity=".25"
            />
          </pattern>
        </defs>
        <rect width="320" height="235" fill="#214f49" />
        <rect width="320" height="235" fill="url(#map-water)" />
        <path d={d} fill="#879e65" stroke="#c2bf8b" strokeWidth="4" />
        <path
          d="M138 59 Q161 111 163 170 M138 122 Q185 171 225 87"
          fill="none"
          stroke="#d0c49a"
          strokeWidth="3"
          opacity=".7"
        />
        {[
          [-6, -17, 'Ruins'],
          [17, -9, 'Lighthouse'],
          [-7, 0, 'Homestead'],
          [6, 18, 'Shore'],
        ].map(([x, z, label]) => (
          <g key={label}>
            <circle
              cx={160 + Number(x) * 4}
              cy={119 + Number(z) * 3.6}
              r="4"
              fill="#314e38"
              stroke="#f6ebbb"
              strokeWidth="1.5"
            />
            <text
              x={160 + Number(x) * 4}
              y={109 + Number(z) * 3.6}
              textAnchor="middle"
              fill="#203d2d"
              fontSize="9"
              fontWeight="700"
            >
              {label}
            </text>
          </g>
        ))}
        <circle
          cx={160 + state.player.x * 4}
          cy={119 + state.player.z * 3.6}
          r="5"
          fill="#f9e9a4"
          stroke="#274d3b"
          strokeWidth="2"
        />
        <text x="293" y="25" fill="#d5dfb4" fontSize="10">
          N
        </text>
        <path d="M297 31L293 40H301Z" fill="#d5dfb4" />
      </svg>
      <span>
        <span /> You are here <i /> Hand-drawn by a goose. Mostly accurate.
      </span>
    </div>
  );
}
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
          Icon = resourceIcons[key];
        return (
          <span
            key={r}
            className={state.inventory[key] >= n! ? 'enough' : 'short'}
          >
            <Icon size={13} />
            {state.inventory[key]} / {n}
            <span>{RESOURCE_NAMES[key]}</span>
          </span>
        );
      })}
    </div>
  );
}
export default function Panels(props: Props) {
  const { panel, state, close } = props;
  const [confirm, setConfirm] = useState(false);
  const titles: Record<string, string> = {
    build: 'Make yourself at home.',
    craft: 'A little handmade magic.',
    inventory: 'A pocket full of possibilities.',
    journal: 'Your little big adventure.',
    pause: 'Take a breather.',
    help: 'The Bramblewick field guide.',
  };
  return (
    <>
      <Dialog
        open={!!panel}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent className={`game-dialog panel-${panel}`}>
          <div className="panel-heading">
            <span className="eyebrow">
              MOSS & MISCHIEF ·{' '}
              {panel === 'pause' ? 'ISLAND TIME' : panel.toUpperCase()}
            </span>
            <DialogTitle>{titles[panel]}</DialogTitle>
            <DialogDescription>
              {panel === 'build'
                ? 'Good things start with a little timber and unreasonable optimism.'
                : panel === 'craft'
                  ? 'Gather ingredients. Make useful things. Take all the credit.'
                  : panel === 'journal'
                    ? 'Six small steps. One island that needs you.'
                    : panel === 'inventory'
                      ? 'Travel light. Carry an entire forest anyway.'
                      : panel === 'help'
                        ? 'Everything you need to know. The goose will fill in the rest.'
                        : 'Your island will be right here.'}
            </DialogDescription>
          </div>
          {panel === 'build' && (
            <>
              <div className="recipe-grid">
                {(
                  [
                    'workbench',
                    'campfire',
                    'garden',
                    'fence',
                    'cottage',
                  ] as Structure[]
                ).map((type) => {
                  const recipe = RECIPES[type],
                    Icon = buildIcons[type],
                    enabled = canAfford(state, recipe.cost);
                  return (
                    <article className="recipe-card" key={type}>
                      <div className={`recipe-art art-${type}`}>
                        <Icon size={39} strokeWidth={1.3} />
                        {state.buildings.some((b) => b.type === type) && (
                          <span className="built-badge">
                            <Check size={10} /> BUILT
                          </span>
                        )}
                      </div>
                      <div className="recipe-info">
                        <h3>{recipe.name}</h3>
                        <p>{recipe.description}</p>
                        <Costs state={state} cost={recipe.cost} />
                        <button
                          className="recipe-button"
                          disabled={!enabled}
                          onClick={() => props.place(type)}
                        >
                          {enabled ? 'Choose a spot' : 'Gather materials'}
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <p className="panel-note">
                <Hammer size={14} /> Place on clear ground near your character.
                R rotates. Escape cancels. Materials are used only when placed.
              </p>
              {state.buildings.length > 0 && (
                <div className="homestead-list">
                  <h3>Your homestead</h3>
                  {state.buildings.map((b, i) => (
                    <div key={b.id}>
                      <span>
                        {RECIPES[b.type].name} <small>#{i + 1}</small>
                      </span>
                      <button onClick={() => props.pack(b.id)}>
                        Pack away · full refund <RotateCcw size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {panel === 'craft' && (
            <Tabs defaultValue="materials" className="craft-tabs">
              <TabsList>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="kitchen">Campfire kitchen</TabsTrigger>
              </TabsList>
              {(['materials', 'kitchen'] as const).map((tab, i) => {
                const type = i ? 'bread' : 'plank',
                  recipe = RECIPES[type],
                  station = i ? 'campfire' : 'workbench',
                  hasStation = state.buildings.some((b) => b.type === station);
                return (
                  <TabsContent value={tab} key={tab}>
                    <article className="craft-feature">
                      <div className={`craft-emblem ${i ? 'warm' : ''}`}>
                        {i ? (
                          <Heart size={72} strokeWidth={1} />
                        ) : (
                          <Package size={72} strokeWidth={1} />
                        )}
                        <span>SMALL BATCH · ISLAND MADE</span>
                      </div>
                      <div>
                        <span className="recipe-category">
                          {i ? 'SOMETHING DELICIOUS' : 'THE BUILDING BLOCKS'}
                        </span>
                        <h3>{recipe.name}</h3>
                        <p>{recipe.description}</p>
                        <Costs state={state} cost={recipe.cost} />
                        <div className="station-status">
                          {hasStation ? (
                            <Check size={14} />
                          ) : (
                            <Hammer size={14} />
                          )}{' '}
                          {hasStation
                            ? `${i ? 'Campfire' : 'Workbench'} ready`
                            : `Build a ${station} to unlock this recipe`}
                        </div>
                        <button
                          className="start-button"
                          disabled={
                            !hasStation || !canAfford(state, recipe.cost)
                          }
                          onClick={() => props.craft(type)}
                        >
                          Craft {recipe.name.toLowerCase()}
                          <ArrowRight size={17} />
                        </button>
                        <small className="owned-count">
                          In your backpack: {state.inventory[type]}
                        </small>
                      </div>
                    </article>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
          {panel === 'inventory' && (
            <>
              <div className="inventory-grid">
                {(Object.keys(RESOURCE_NAMES) as Resource[]).map((r) => {
                  const Icon = resourceIcons[r];
                  return (
                    <article
                      key={r}
                      className={`inventory-item ${state.inventory[r] ? '' : 'is-empty'}`}
                    >
                      <Icon size={28} strokeWidth={1.5} />
                      <b>{state.inventory[r]}</b>
                      <h3>{RESOURCE_NAMES[r]}</h3>
                      {(r === 'bread' || r === 'carrot') &&
                        state.inventory[r] > 0 && (
                          <button onClick={() => props.eat(r)}>
                            Eat · +{r === 'bread' ? 50 : 20} energy
                          </button>
                        )}
                      {r === 'crystal' && <span>Quest treasure</span>}
                    </article>
                  );
                })}
              </div>
              <p className="panel-note">
                <Sprout size={14} /> Timber, stone, and wildflowers regrow.
                Harvested carrots return extra seeds.
              </p>
            </>
          )}
          {panel === 'journal' && (
            <div className="journal-layout">
              <div className="quest-list">
                {QUESTS.map((q, i) => (
                  <article
                    className={`${state.completed.includes(i) ? 'done ' : ''}${currentQuest(state) === i ? 'active' : ''}`}
                    key={i}
                  >
                    <div className="chapter-index">
                      {state.completed.includes(i) ? (
                        <Check size={17} />
                      ) : (
                        String(i + 1).padStart(2, '0')
                      )}
                    </div>
                    <div>
                      <span>
                        {state.completed.includes(i)
                          ? 'A CHAPTER WELL SPENT'
                          : `CHAPTER ${i + 1}`}
                      </span>
                      <h3>{q.title}</h3>
                      {(currentQuest(state) === i ||
                        state.completed.includes(i)) && <p>{q.detail}</p>}
                    </div>
                  </article>
                ))}
              </div>
              <aside>
                <IslandMap state={state} />
                <blockquote>
                  {QUESTS[currentQuest(state)].quote}
                  <cite>Mayor Honk, allegedly in charge</cite>
                </blockquote>
                <div className="journal-stats">
                  <span>
                    <Clock size={15} />
                    {Math.floor(state.elapsed / 60)} min on island
                  </span>
                  <span>
                    <House size={15} />
                    {state.buildings.length} things built
                  </span>
                </div>
              </aside>
            </div>
          )}
          {panel === 'help' && (
            <div className="help-layout">
              <div>
                <h3>
                  <Keyboard size={19} /> Finding your feet
                </h3>
                <dl>
                  <dt>Walk</dt>
                  <dd>W A S D or arrow keys</dd>
                  <dt>Interact</dt>
                  <dd>E or click a nearby object</dd>
                  <dt>Run / hop</dt>
                  <dd>Shift / Space</dd>
                  <dt>Build / craft</dt>
                  <dd>B / C</dd>
                  <dt>Backpack / journal</dt>
                  <dd>I / J</dd>
                  <dt>Orbit / zoom</dt>
                  <dd>Right-drag / scroll</dd>
                  <dt>Rotate a building</dt>
                  <dd>R while placing</dd>
                  <dt>Pause / close</dt>
                  <dd>Escape</dd>
                </dl>
                <p>
                  Click the ground to walk there. On touchscreens, use the arrow
                  pad or tap the ground.
                </p>
              </div>
              <div>
                <h3>
                  <Sprout size={19} /> Growing a good life
                </h3>
                <p>
                  <b>Gather:</b> Walk up to trees, rocks, or wildflowers and
                  interact. Your tools are chosen automatically.
                </p>
                <p>
                  <b>Farm:</b> Interact with an empty garden bed to plant, again
                  to water, and once more when ripe. Watered carrots grow in 35
                  seconds.
                </p>
                <p>
                  <b>Build:</b> Pick a recipe, then click a clear spot close to
                  you. A green preview means it fits.
                </p>
                <p>
                  <b>Explore:</b> The ruins are north; the lighthouse is east.
                  Your journal has a map.
                </p>
                <p className="help-tip">
                  There is no death or hunger. Take your time. Even your stamina
                  grows back.
                </p>
              </div>
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
                Your progress autosaves on this device. Export a copy to take
                your island with you.
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
