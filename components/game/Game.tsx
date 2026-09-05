'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Sprout,
  Sun,
  Volume2,
  VolumeX,
  Settings2,
  Compass,
  ArrowUpRight,
  Play,
  Leaf,
  Axe,
  Pickaxe,
  Droplets,
  Hammer,
  Backpack,
  TreePine,
  Mountain,
  Wheat,
  Carrot,
  MapPin,
  HelpCircle,
  ArrowRight,
  Star,
  Package,
  ChevronRight,
  Flag,
  Heart,
  Hand,
  Fish,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import Panels from './Panels';
import {
  compassName,
  viewHeading,
  type LookMode,
  type ViewSettings,
} from '@/lib/game/first-person';
import { IslandAudio } from '@/lib/game/audio';
import { registerGameTools, type Registry } from '@/lib/game/webmcp';
import { IslandWorld, type Entity } from '@/lib/game/world';
import {
  initialState,
  readSave,
  saveGame,
  parseSave,
  dismantle,
  gather,
  farm,
  build,
  craft,
  restoreLighthouse,
  talk,
  fish,
  collectRelic,
  tendProduction,
  completeContract,
  trade,
  performProject,
  requiredTool,
  toolError,
  TOOL_NAMES,
  CROPS,
  NPCS,
  REGIONS,
  ACT_NAMES,
  regionAt,
  addCount,
  type Crop,
  type Npc,
  type Project,
  type Craftable,
  updateQuests,
  currentQuest,
  QUESTS,
  RECIPES,
  RESOURCE_NAMES,
  type GameState,
  type Resource,
  type Structure,
  type Tool,
} from '@/lib/game/state';

const resourceIcons: Partial<Record<Resource, typeof Axe>> = {
  wood: TreePine,
  stone: Mountain,
  fiber: Leaf,
  seed: Wheat,
  carrot: Carrot,
  plank: Package,
  bread: Heart,
  crystal: Star,
};
const toolset: [Tool, string, typeof Axe][] = [
  ['axe', 'Axe', Axe],
  ['pickaxe', 'Pickaxe', Pickaxe],
  ['seeds', 'Plant', Sprout],
  ['water', 'Water', Droplets],
  ['build', 'Build', Hammer],
  ['hands', 'Hands', Hand],
  ['rod', 'Fish', Fish],
];
export default function Game() {
  const host = useRef<HTMLDivElement>(null),
    world = useRef<IslandWorld | null>(null),
    data = useRef<GameState>(initialState());
  const [snapshot, setSnapshot] = useState<GameState>(initialState()),
    [started, setStarted] = useState(false),
    [ready, setReady] = useState(false),
    [near, setNear] = useState<Entity | null>(null),
    [lookMode, setLookMode] = useState<LookMode>('free'),
    [toast, setToast] = useState(''),
    [panel, setPanel] = useState(''),
    [placementInfo, setPlacementInfo] = useState({ valid: false, message: '' }),
    [placing, setPlacing] = useState<Structure | null>(null),
    [stamina, setStamina] = useState(100),
    [error, setError] = useState(''),
    [hasSave, setHasSave] = useState(false),
    [dialogue, setDialogue] = useState(''),
    [speaker, setSpeaker] = useState('Mayor Honk'),
    [win, setWin] = useState(false),
    [saveOk, setSaveOk] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<IslandAudio | null>(null);
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const refresh = () => {
    const complete = updateQuests(data.current);
    if (complete.length && data.current.started) audio.current?.effect('build');
    world.current?.sync();
    setSnapshot(structuredClone(data.current));
  };
  const persist = () => {
    const saved = saveGame(data.current);
    setSaveOk(saved);
    if (!saved)
      notify(
        'Your browser could not save. Allow local storage to keep this adventure.',
      );
    return saved;
  };
  const selectTool = (tool: Tool) => {
    data.current.tool = tool;
    world.current?.setBuild(null);
    setPlacing(null);
    if (tool === 'build') setPanel('build');
    refresh();
  };
  const act = (entity: Entity) => {
    const s = data.current,
      needed = requiredTool(s, entity.kind, entity.id);
    if (needed && s.tool !== needed) {
      notify(toolError(s, needed));
      return;
    }
    let message = '';
    const wasWon = s.won;
    audio.current?.effect(
      entity.kind === 'goose'
        ? 'honk'
        : entity.kind === 'plot'
          ? 'farm'
          : 'gather',
    );
    if (
      ['wood', 'stone', 'fiber', 'ore', 'clay', 'mushroom', 'apple'].includes(
        entity.kind,
      )
    )
      message = gather(
        s,
        entity.id,
        entity.kind as Parameters<typeof gather>[2],
      );
    else if (entity.kind === 'plot') message = farm(s, entity.id);
    else if (entity.kind === 'goose' || entity.kind === 'npc') {
      const npc = entity.id as Npc;
      talk(s, npc);
      const quest = QUESTS[currentQuest(s)];
      setSpeaker(NPCS[npc].name);
      const advice: Record<Npc, string> = {
        mayor: quest.quote,
        ranger:
          'Build a ranger’s shed, then pick mushrooms with your hands. If one introduces itself, leave it alone.',
        fisher:
          'Equip the rod (7) at a fishing marker. E casts one seed as bait. Wait for BITE, then E reels it in. My doctorate is in standing near water.',
        smith:
          'Clay and copper ore surround the quarry. Pickaxe first. Build a kiln for bricks, then a forge for ingots. Please stop calling it spicy furniture.',
        botanist:
          'Pick apples in the orchard. Your seed pouch can also grow wheat, pumpkin and lavender as you progress. A greenhouse waters nearby crops.',
        astronomer:
          'Repair the highland bridge, recover four relics, and open the ancient gate. An observatory needs starglass. Yes, the stars have a materials budget.',
        baker:
          'Flour, pumpkin, eggs, honey: the four food groups of pie. Meet residents and deliver their requests from your journal. I pay in acorns; banks remain confused.',
      };
      setDialogue(
        quest.npc === npc ? quest.quote + ' ' + quest.detail : advice[npc],
      );
    } else if (entity.kind === 'crystal') {
      if (!s.stats.explored) {
        s.inventory.crystal++;
        s.stats.explored = true;
        addCount(s, 'gather:crystal');
        message =
          'Sun crystal recovered. An excellent start to a suspicious collection.';
      }
    } else if (entity.kind === 'lighthouse') message = restoreLighthouse(s);
    else if (entity.kind === 'project')
      message = performProject(s, entity.id as Project);
    else if (entity.kind === 'fish') message = fish(s, entity.id);
    else if (entity.kind === 'relic') message = collectRelic(s, entity.id);
    else if (entity.kind === 'spring') {
      s.water = 24;
      message =
        'Watering can refilled · 24 uses. Please do not water the mayor.';
    } else if (entity.kind === 'production')
      message = tendProduction(s, entity.id);
    else if (['workbench', 'campfire', 'station'].includes(entity.kind))
      setPanel('craft');
    else if (entity.kind === 'market') setPanel('market');
    else if (entity.kind === 'cottage') {
      world.current!.stamina = 100;
      message = 'Home sweet home. Energy restored.';
    } else if (entity.kind === 'chest') {
      if ((s.depleted.supplies ?? 0) < Date.now()) {
        for (const r of ['wood', 'stone', 'fiber'] as const)
          s.inventory[r] += 2;
        s.depleted.supplies = Date.now() + 60000;
        message =
          '+2 timber · +2 stone · +2 fiber. The sea has excellent delivery service.';
      } else message = 'More supplies arrive in a minute.';
    }
    if (message) notify(message);
    refresh();
    persist();
    if (!wasWon && s.won) {
      setWin(true);
      audio.current?.effect('win');
    }
  };
  useEffect(() => {
    audio.current = new IslandAudio();
    data.current = readSave();
    audio.current.setEnabled(data.current.sound);
    setHasSave(data.current.started);
    setSnapshot(structuredClone(data.current));
    let instance: IslandWorld;
    try {
      instance = new IslandWorld(host.current!, () => data.current, {
        near: setNear,
        look: setLookMode,
        placement: (valid, message) => setPlacementInfo({ valid, message }),
        interact: act,
        place: (type, x, z, rotation) => {
          if (!instance.canPlace(type, x, z, rotation)) return;
          notify(build(data.current, type, x, z, rotation));
          audio.current?.effect('build');
          setPlacing(null);
          data.current.tool = 'axe';
          refresh();
          persist();
        },
        menu: (name) => {
          if (name === 'cancel-build') {
            setPlacing(null);
            data.current.tool = 'axe';
          } else if (name === 'cycle-crop') {
            const crops = (Object.keys(CROPS) as Crop[]).filter(
              (c) => data.current.completed.length >= CROPS[c].unlock,
            );
            data.current.crop =
              crops[(crops.indexOf(data.current.crop) + 1) % crops.length];
            refresh();
          } else if (name === 'pause') {
            setPanel('pause');
            setDialogue('');
          } else if (name === 'escape') {
            setPanel((v) => (v ? '' : 'pause'));
            setDialogue('');
            setPlacing(null);
          } else if (name.startsWith('Digit')) {
            const index = Number(name.slice(-1)) - 1;
            if (toolset[index]) {
              selectTool(toolset[index][0]);
              if (index === 4) setPanel('build');
            }
          } else setPanel(name);
        },
        move: (x, z, e) => {
          const region = regionAt(x, z);
          if (!data.current.counters[`visit:${region}`]) {
            addCount(data.current, `visit:${region}`);
            updateQuests(data.current);
          }
          setStamina(e);
          setSnapshot({ ...data.current });
        },
        ready: () => setReady(true),
        error: setError,
      });
      world.current = instance;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'This browser could not start 3D graphics. Try a browser with WebGL enabled.',
      );
    }
    const saveInterval = setInterval(() => {
      if (data.current.started) setSaveOk(saveGame(data.current));
    }, 10000);
    const unload = () => {
      if (data.current.started) saveGame(data.current);
    };
    window.addEventListener('pagehide', unload);
    return () => {
      clearInterval(saveInterval);
      window.removeEventListener('pagehide', unload);
      unload();
      instance?.dispose();
      audio.current?.dispose();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    world.current?.setPaused(!started || !!panel || !!dialogue || win);
  }, [started, panel, dialogue, win]);
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    return registerGameTools(
      registry,
      () => data.current,
      () => {
        refresh();
        persist();
      },
    );
  }, []);
  const start = () => {
    audio.current?.start();
    data.current.started = true;
    setStarted(true);
    world.current?.setPaused(false);
    world.current?.requestLook();
    refresh();
    persist();
    notify(
      data.current.migrated
        ? 'Your homestead is safe. The lighthouse was only the beginning—open your journal for the wider island.'
        : 'Welcome to eye level. Mouse to look, WASD to walk, aim and E to interact. Tab frees the cursor.',
    );
  };
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const q = currentQuest(snapshot),
    quest = QUESTS[q];
  const exportSave = () => {
    persist();
    const blob = new Blob([JSON.stringify(data.current, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'bramblewick-adventure.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify('A little island, safely packed. Save exported.');
  };
  const importSave = async (file: File) => {
    if (file.size > 1_000_000) {
      notify('That save is too large. Choose a Bramblewick save file.');
      return;
    }
    const parsed = parseSave(await file.text());
    if (!parsed) {
      notify('That file is not a valid Bramblewick save. Your island is safe.');
      return;
    }
    if (saveGame(parsed)) location.reload();
    else notify('Your browser could not store that save.');
  };
  return (
    <main
      className={`game-shell first-person ${lookMode === 'locked' ? 'mouse-captured' : ''}`}
    >
      <div ref={host} className="world" />
      <div className="vignette" />
      <header className="game-header">
        <div className="island-brand">
          <span className="brand-mark">
            <Sprout size={25} />
          </span>
          <div>
            <span className="eyebrow">THE VERDANT ISLES</span>
            <strong>Bramblewick</strong>
          </div>
        </div>
        <div className="day-pill">
          <Sun size={19} />
          <span>
            Day{' '}
            {String(1 + Math.floor(snapshot.elapsed / 480)).padStart(2, '0')}
          </span>
          <i />
          <span>Spring</span>
          <span className="weather-word"> · A fine day for nonsense</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={snapshot.sound ? 'Mute sound' : 'Enable sound'}
            onClick={() => {
              data.current.sound = !data.current.sound;
              audio.current?.setEnabled(data.current.sound);
              if (data.current.sound) audio.current?.start();
              refresh();
              persist();
            }}
          >
            {snapshot.sound ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => setPanel('help')}
          >
            <HelpCircle />
          </button>
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setPanel('pause')}
          >
            <Settings2 />
          </button>
        </div>
      </header>
      {!started ? (
        <>
          <section className="intro">
            <span className="intro-label">
              <span /> BRAMBLEWICK · THROUGH YOUR EYES
            </span>
            <h1>
              Moss <i>&</i>
              <br />
              Mischief<span>™</span>
            </h1>
            <p>
              Your boots. Your garden. One very opinionated goose.
              <br />
              Grow roots. Build something. Irritate a goose.
            </p>
            <button
              className="start-button"
              onClick={start}
              disabled={!ready || !!error}
            >
              <Play size={19} fill="currentColor" />
              {hasSave ? 'Step back onto the island' : 'Step onto the island'}
              <ArrowUpRight size={21} />
            </button>
            <div className="intro-foot">
              <span>
                <Leaf size={13} /> No rush. No wrong turns.
              </span>
              <span>Mouse to look · WASD to walk · E to interact</span>
            </div>
          </section>
          <div className="island-caption">
            <Compass size={34} strokeWidth={1} />
            <div>
              <span>YOUR NEXT CHAPTER</span>
              <strong>Somewhere wonderfully off the map.</strong>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="compass-heading" aria-label="Facing direction">
            <Compass size={15} />
            <b>{compassName(snapshot.view.yaw)}</b>
            <span>{viewHeading(snapshot.view.yaw)}°</span>
          </div>
          {!panel && !dialogue && !win && (
            <div
              className={`crosshair ${near ? 'on-target' : ''} ${placing ? (placementInfo.valid ? 'place-valid' : 'place-blocked') : ''}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
              <i />
              <span />
            </div>
          )}
          {!panel && !dialogue && !win && lookMode === 'free' && (
            <div className="look-banner">
              <button onClick={() => world.current?.requestLook()}>
                Click to look around{' '}
                <span>WASD move · Tab releases the mouse</span>
              </button>
              <button
                className="drag-choice"
                onClick={() => world.current?.useDragLook()}
              >
                Use drag look
              </button>
            </div>
          )}
          {!panel &&
            !dialogue &&
            !win &&
            (lookMode === 'drag' || lookMode === 'touch') && (
              <div className="look-instruction">
                Drag the scene to look · Aim at the crosshair · E or tap to use
              </div>
            )}
          <div className="resource-strip">
            {(['wood', 'stone', 'fiber', 'seed'] as Resource[]).map((r) => {
              const Icon = resourceIcons[r] ?? Package;
              return (
                <button
                  key={r}
                  onClick={() => setPanel('inventory')}
                  title={RESOURCE_NAMES[r]}
                >
                  <Icon size={19} />
                  <b>{snapshot.inventory[r]}</b>
                  <span>{RESOURCE_NAMES[r]}</span>
                </button>
              );
            })}
          </div>
          <aside className="quest-card">
            <div className="quest-overline">
              <span>
                <Flag size={13} /> ACT {quest.act} · {ACT_NAMES[quest.act - 1]}
              </span>
              <button
                aria-label="Open journal"
                onClick={() => setPanel('journal')}
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
            <h2>{snapshot.won ? 'A brighter Bramblewick' : quest.title}</h2>
            <p>
              {snapshot.won
                ? 'The island is yours. Keep growing.'
                : quest.short}
            </p>
            <Progress
              value={
                snapshot.won
                  ? 100
                  : (quest.progress(snapshot) / quest.target) * 100
              }
              aria-label="Current quest progress"
            />
            <div className="quest-bottom">
              <span>
                {snapshot.won
                  ? 'ADVENTURE COMPLETE'
                  : `QUEST ${q + 1} OF ${QUESTS.length}`}
              </span>
              <button onClick={() => setPanel('journal')}>
                Journal <kbd>J</kbd>
              </button>
            </div>
          </aside>
          <div className="location-label">
            <MapPin size={14} />
            {REGIONS[regionAt(snapshot.player.x, snapshot.player.z)].name}
          </div>
          <div className="energy">
            <Leaf size={17} />
            <Progress value={stamina} aria-label="Stamina" />
            <span>{Math.round(stamina)}</span>
          </div>
          {near && !placing && (
            <button
              className="interact-prompt"
              onClick={() => world.current?.interact()}
            >
              <kbd>E</kbd>
              <span>
                {near.name}
                <small>
                  {requiredTool(snapshot, near.kind, near.id)
                    ? snapshot.tool ===
                      requiredTool(snapshot, near.kind, near.id)
                      ? 'Ready · ' + TOOL_NAMES[snapshot.tool]
                      : 'Equip ' +
                        TOOL_NAMES[requiredTool(snapshot, near.kind, near.id)!]
                    : 'Interact with any tool'}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          )}
          {placing && (
            <div
              className={`build-hint ${placementInfo.valid ? 'valid' : 'invalid'}`}
            >
              <Hammer size={17} />
              <span>Place {RECIPES[placing].name.toLowerCase()}</span>
              <span>{placementInfo.message}</span>
              <button onClick={() => world.current?.rotateBuild()}>
                Rotate · R
              </button>
              <button
                disabled={!placementInfo.valid}
                onClick={() => world.current?.confirmBuild()}
              >
                Place · Enter
              </button>
              <button
                onClick={() => {
                  selectTool('axe');
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {snapshot.tool === 'seeds' && !placing && (
            <div
              className="crop-selector"
              aria-label="Choose crop · R to cycle"
            >
              <span className="crop-cycle">
                R<br />
                crop
              </span>
              {(Object.keys(CROPS) as Crop[]).map((c) => (
                <button
                  key={c}
                  className={snapshot.crop === c ? 'active' : ''}
                  disabled={snapshot.completed.length < CROPS[c].unlock}
                  onClick={() => {
                    data.current.crop = c;
                    refresh();
                  }}
                >
                  {CROPS[c].name}
                  <small>
                    {snapshot.completed.length < CROPS[c].unlock
                      ? `Quest ${CROPS[c].unlock}`
                      : `${CROPS[c].seedCost} seed · ${CROPS[c].time / 1000}s`}
                  </small>
                </button>
              ))}
            </div>
          )}
          {snapshot.tool === 'water' && !placing && (
            <div className="tool-status">
              <Droplets size={16} /> {snapshot.water}/24 water · refill at the
              village spring or a well
            </div>
          )}
          {snapshot.fishing && !placing && (
            <div
              className={`tool-status ${now >= snapshot.fishing.biteAt ? 'bite' : ''}`}
            >
              {now > snapshot.fishing.expiresAt
                ? 'Fish escaped · E to reset'
                : now >= snapshot.fishing.biteAt
                  ? 'BITE! Press E at the fishing marker to reel!'
                  : 'Waiting for a bite… keep the fishing rod equipped'}
            </div>
          )}
          <nav className="hotbar" aria-label="Tools">
            <div className="tool-slots">
              {toolset.map(([id, label, Icon], i) => (
                <button
                  key={id}
                  className={snapshot.tool === id ? 'selected' : ''}
                  aria-label={`${label} (${i + 1})`}
                  aria-pressed={snapshot.tool === id}
                  onClick={() => {
                    selectTool(id);
                    if (id === 'build') setPanel('build');
                    else {
                      world.current?.setBuild(null);
                      setPlacing(null);
                    }
                  }}
                >
                  <kbd>{i + 1}</kbd>
                  <Icon size={25} strokeWidth={1.6} />
                  <span>{label}</span>
                  {id === 'seeds' && <small>{snapshot.inventory.seed}</small>}
                </button>
              ))}
            </div>
            <span className="hotbar-divider" />
            <button
              className="bag-button"
              aria-label="Inventory"
              onClick={() => setPanel('inventory')}
            >
              <Backpack size={24} />
              <kbd>I</kbd>
            </button>
            <button
              className="bag-button"
              aria-label="Crafting"
              onClick={() => setPanel('craft')}
            >
              <Hammer size={23} />
              <kbd>C</kbd>
            </button>
          </nav>
          <div className="controls-footer">
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> Move
            </span>
            <span>
              <kbd>E</kbd> Use tool
            </span>
            <span>Mouse look · Tab cursor · Esc pause</span>
          </div>
          <div className="save-indicator">
            <span />{' '}
            {saveOk
              ? 'Progress saved on this device'
              : 'Saving unavailable · export in Settings'}
          </div>
          <div className="touch-actions">
            <button
              aria-label={placing ? 'Place building' : 'Use equipped tool'}
              onClick={() => {
                if (placing) world.current?.confirmBuild();
                else world.current?.interact();
              }}
            >
              {placing ? 'Build' : 'Use · E'}
            </button>
            <button aria-label="Jump" onClick={() => world.current?.hop()}>
              Hop
            </button>
          </div>
          <div className="touch-controls">
            <div className="touch-pad">
              <button
                aria-label="Move forward"
                onPointerDown={() => world.current?.setMovement(0, -1)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerCancel={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ↑
              </button>
              <button
                aria-label="Move left"
                onPointerDown={() => world.current?.setMovement(-1, 0)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerCancel={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ←
              </button>
              <button
                aria-label="Move back"
                onPointerDown={() => world.current?.setMovement(0, 1)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerCancel={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ↓
              </button>
              <button
                aria-label="Move right"
                onPointerDown={() => world.current?.setMovement(1, 0)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerCancel={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                →
              </button>
            </div>
          </div>
        </>
      )}
      {toast && (
        <output className="game-toast">
          <Sprout size={18} />
          {toast}
        </output>
      )}
      {dialogue && (
        <div className="dialogue">
          <div className="goose-avatar">H</div>
          <div>
            <span>
              {speaker.toUpperCase()} <small>LOCAL EXPERT, ALLEGEDLY</small>
            </span>
            <p>{dialogue}</p>
          </div>
          <button
            className="round-button"
            aria-label="Continue"
            onClick={() => setDialogue('')}
          >
            <ArrowRight />
          </button>
        </div>
      )}
      <Panels
        pack={(id) => {
          notify(dismantle(data.current, id));
          refresh();
          persist();
        }}
        panel={panel}
        state={snapshot}
        close={() => setPanel('')}
        place={(type) => {
          if (!started) return;
          setPanel('');
          setPlacing(type);
          data.current.tool = 'build';
          refresh();
          world.current?.setBuild(type);
          notify(
            'Aim down at clear ground. The crosshair places the footprint. R rotates; E, Enter or click builds.',
          );
        }}
        craft={(type: Craftable, amount = 1) => {
          notify(craft(data.current, type, amount));
          audio.current?.effect('craft');
          refresh();
          persist();
        }}
        contract={(id) => {
          notify(completeContract(data.current, id));
          refresh();
          persist();
        }}
        trade={(type, sell) => {
          notify(trade(data.current, type, sell));
          refresh();
          persist();
        }}
        eat={(type) => {
          if (data.current.inventory[type] < 1) return;
          data.current.inventory[type]--;
          if (world.current)
            world.current.stamina = Math.min(
              100,
              world.current.stamina + (type === 'bread' ? 50 : 20),
            );
          notify(
            type === 'bread'
              ? 'A wholesome snack. The goose is jealous.'
              : 'Crunch. A delicious agricultural achievement.',
          );
          refresh();
          persist();
        }}
        viewSetting={(key, value) => {
          data.current.view = {
            ...data.current.view,
            [key]: value,
          } as ViewSettings;
          world.current?.updateView();
          refresh();
          persist();
        }}
        setting={(key, value) => {
          if (key === 'sound') {
            data.current.sound = Boolean(value);
            audio.current?.setEnabled(Boolean(value));
            if (value) audio.current?.start();
          } else {
            data.current.quality = value as 'high' | 'low';
            world.current?.setQuality(data.current.quality);
          }
          refresh();
          persist();
        }}
        save={() => {
          if (persist())
            notify('Adventure saved. Your carrots are in good hands.');
        }}
        exportSave={exportSave}
        importSave={importSave}
        restart={() => {
          const fresh = initialState();
          if (saveGame(fresh)) location.reload();
          else
            notify(
              'Could not save a new island. Your current adventure remains open.',
            );
        }}
      />
      {win && (
        <section className="win-screen">
          <div className="win-content">
            <div className="win-icon">
              <Sun size={45} strokeWidth={1.2} />
            </div>
            <span className="eyebrow">A SMALL ISLAND. A BIG DIFFERENCE.</span>
            <h2>
              You brought
              <br />
              the island together.
            </h2>
            <p>
              The stars are charted. The festival is ready.
              <br />
              And somewhere, a very proud goose is ordering a statue of himself.
            </p>
            <blockquote>
              “Citizens, we are officially well fed!”
              <cite>MAYOR HONK · TAKING ALL THE CREDIT</cite>
            </blockquote>
            <button className="start-button" onClick={() => setWin(false)}>
              Stay a little longer <ArrowRight size={18} />
            </button>
            <small>
              Your adventure is complete. Your island is just beginning.
            </small>
          </div>
        </section>
      )}
      {error && (
        <div className="graphics-error" role="alert">
          <Mountain size={36} />
          <h2>A small bump in the landscape</h2>
          <p>{error}</p>
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      )}
    </main>
  );
}
