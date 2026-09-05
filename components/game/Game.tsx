'use client';
import { type Gear } from '@/lib/game/frontier';
import { applyCommand, type GameCommand } from '@/lib/game/commands';
import { CampClient, mergeCamp, type CampUpdate } from '@/lib/game/camp';
import MultiplayerPanel from './MultiplayerPanel';
import type { FrontierAction } from './FrontierPanel';
import { interactionSnapshot } from '@/lib/game/interactions';
import {
  harvestedLabel,
  resourceRegrowthSeconds,
} from '@/lib/game/resource-status';
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
  TOOL_NAMES,
  requiredTool,
  CROPS,
  NPCS,
  REGIONS,
  ACT_NAMES,
  regionAt,
  addCount,
  type Crop,
  type Npc,
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
  ['spear', 'Hunt', ArrowUpRight],
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
  const campClient = useRef<CampClient | null>(null),
    solo = useRef<GameState | null>(null);
  const [camp, setCamp] = useState<CampUpdate | null>(null),
    [campBusy, setCampBusy] = useState(false),
    [campError, setCampError] = useState('');
  const pending = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<IslandAudio | null>(null);
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const refresh = () => {
    const complete = campClient.current?.code ? [] : updateQuests(data.current);
    if (complete.length && data.current.started) audio.current?.effect('build');
    world.current?.sync();
    setSnapshot(structuredClone(data.current));
  };
  const persist = () => {
    if (campClient.current?.code) return true;
    const saved = saveGame(data.current);
    setSaveOk(saved);
    if (!saved)
      notify(
        'Your browser could not save. Allow local storage to keep this adventure.',
      );
    return saved;
  };
  const selectTool = (tool: Tool, openPlans = true) => {
    data.current.tool = tool;
    world.current?.setBuild(null);
    setPlacing(null);
    if (tool === 'build' && openPlans) setPanel('build');
    refresh();
  };
  const acceptCamp = (update: CampUpdate) => {
    const client = campClient.current;
    if (
      !client ||
      update.code !== client.code ||
      update.revision < client.revision
    )
      return;
    if (update.state) data.current = mergeCamp(data.current, update.state);
    if (update.needs) data.current.frontier.needs = update.needs;
    if (update.rescued && update.position) {
      data.current.player = { x: update.position.x, z: update.position.z };
      world.current?.relocate();
      notify(
        'The goose ambulance brought you home. Group insurance covered the bill.',
      );
    }
    client.revision = update.revision;
    world.current?.setPeers(update.peers.filter((p) => p.id !== client.id));
    setCamp(update);
    setCampError('');
    refresh();
  };
  const perform = async (command: GameCommand) => {
    const client = campClient.current;
    const wasWon = data.current.won;
    if (command.type === 'drink' && data.current.frontier.needs.canteen < 1) {
      notify('Empty canteen. Refill at the village spring or a well.');
      return false;
    }
    pending.current++;
    setCampBusy(true);
    try {
      let changed: boolean, message: string;
      if (client?.code) {
        const result = await client.action(
          command,
          data.current,
          !world.current?.paused,
        );
        if (campClient.current !== client) return false;
        acceptCamp(result);
        changed = !!result.changed;
        message = result.message ?? '';
      } else {
        const before = JSON.stringify(data.current);
        message = applyCommand(data.current, command);
        changed = before !== JSON.stringify(data.current);
      }
      if (message) notify(message);
      refresh();
      persist();
      if (!wasWon && data.current.won) {
        setWin(true);
        audio.current?.effect('win');
      }
      return changed;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Camp connection lost. Please try again.';
      setCampError(message);
      notify(message);
      return false;
    } finally {
      pending.current--;
      setCampBusy(pending.current > 0);
    }
  };
  const enterCamp = async (
    op: 'create' | 'join',
    name: string,
    code: string,
  ) => {
    setCampBusy(true);
    setCampError('');
    try {
      persist();
      const client = new CampClient();
      const result = await client.enter(op, name, data.current, code);
      solo.current = structuredClone(data.current);
      if (world.current) world.current.multiplayer = true;
      campClient.current = client;
      data.current.player = result.position
        ? { x: result.position.x, z: result.position.z }
        : { x: 0, z: 7 };
      acceptCamp(result);
      world.current?.relocate();
      notify(
        'Camp connected. Your crew shares the pantry. Label your sandwiches.',
      );
    } catch (e) {
      setCampError(e instanceof Error ? e.message : 'Could not reach camp.');
    } finally {
      setCampBusy(false);
    }
  };
  const leaveCamp = async () => {
    if (pending.current) return;
    const client = campClient.current;
    campClient.current = null;
    if (solo.current) data.current = solo.current;
    solo.current = null;
    setCamp(null);
    if (world.current) world.current.multiplayer = false;
    world.current?.setPeers([]);
    world.current?.relocate();
    refresh();
    persist();
    try {
      await client?.leave();
    } catch {
      /* Presence expires automatically after 15 seconds. */
    }
    notify('Back on your solo island. Keep the camp code to rejoin your crew.');
  };
  const act = async (entity: Entity, actionTime?: number) => {
    const before = interactionSnapshot(data.current, entity.id);
    const changed = await perform({
      type: 'interact',
      id: entity.id,
      kind: entity.kind,
      x: entity.x,
      z: entity.z,
      actionTime,
    });
    if (entity.kind === 'npc' || entity.kind === 'goose') {
      const npc = entity.id as Npc,
        quest = QUESTS[currentQuest(data.current)];
      setSpeaker(NPCS[npc].name);
      const tips: Record<Npc, string> = {
        mayor:
          'The Department of Mild Peril is open (U). Bring a friend to camp (L). I shall supervise from a safe distance.',
        ranger:
          'Craft a spear at your workbench using Upgrades (U). Rabbits are easier than boars. Boars have lawyers. An upgraded shed improves hunting damage.',
        fisher:
          'Equip the rod (7). E casts one seed as bait; wait for BITE, then E reels. Fishing is just waiting with better trousers.',
        smith:
          'A level 2 forge makes steel. Upgrade your workbench for leather, rope and machinery. Your next axe deserves a promotion.',
        botanist:
          'Greenhouse upgrades water a wider area and speed growth. Forage berries, herbs and salt for meals. Please stop asking the lavender for career advice.',
        astronomer:
          'Find eight landmarks and inspect their caches. Field notes (U) give directions. The northern routes need a bridge and the ancient gate opened.',
        baker:
          'F eats a packed meal; G drinks from your canteen. Cook wild meat first. Tea quenches thirst. Your stomach has a strict complaints department.',
      };
      setDialogue(
        quest.npc === npc ? quest.quote + ' ' + quest.detail : tips[npc],
      );
    }
    if (['workbench', 'campfire', 'station'].includes(entity.kind))
      setPanel('craft');
    if (entity.kind === 'market') setPanel('market');
    if (entity.kind === 'cottage' && changed && world.current)
      world.current.stamina = 100;
    if (before !== interactionSnapshot(data.current, entity.id))
      audio.current?.effect(
        entity.kind === 'wood'
          ? 'chop'
          : ['stone', 'ore', 'clay'].includes(entity.kind)
            ? 'mine'
            : 'gather',
      );
    return changed;
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
        place: async (type, x, z, rotation) => {
          if (!instance.canPlace(type, x, z, rotation)) return false;
          const changed = await perform({
            type: 'build',
            structure: type,
            x,
            z,
            rotation,
          });
          if (changed) {
            audio.current?.effect('build');
            setPlacing(null);
          }
          return changed;
        },
        menu: (name) => {
          if (name === 'quick-eat') {
            const food = (
              [
                'trailration',
                'roast',
                'stew',
                'cookedmeat',
                'bread',
                'apple',
                'berries',
                'carrot',
              ] as Resource[]
            ).find((r) => data.current.inventory[r] > 0);
            if (food) void perform({ type: 'eat', food });
            else
              notify(
                'No snacks! Forage berries or cook a meal. F eats, G drinks.',
              );
          } else if (name === 'drink') {
            void perform({ type: 'drink' });
          } else if (name === 'rescued') {
            notify(
              'Rescued by the Department of Mild Peril. Back at camp; 5 acorns for the goose ambulance.',
            );
            refresh();
            persist();
          } else if (name === 'boar-warning') {
            notify('The boar has objected physically. Keep your distance!');
          } else if (name === 'cancel-build') {
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
          } else if (name.startsWith('tool:')) {
            const tool = toolset.find(([id]) => id === name.slice(5));
            if (tool) selectTool(tool[0], false);
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
          if (
            !campClient.current?.code &&
            !data.current.counters[`visit:${region}`]
          ) {
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
      if (data.current.started && !campClient.current?.code)
        setSaveOk(saveGame(data.current));
    }, 10000);
    const unload = () => {
      if (data.current.started && !campClient.current?.code)
        saveGame(data.current);
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
      async (recipe) => ({
        changed: await perform({ type: 'craft', recipe, amount: 1 }),
        inventory: { ...data.current.inventory },
      }),
    );
  }, []);
  useEffect(() => {
    let stopped = false,
      inFlight = false;
    const timer = setInterval(async () => {
      const client = campClient.current;
      if (!client?.code || inFlight || pending.current) return;
      inFlight = true;
      try {
        const update = await client.poll(data.current, !world.current?.paused);
        if (!stopped && campClient.current === client) acceptCamp(update);
      } catch (e) {
        if (!stopped)
          setCampError(
            e instanceof Error ? e.message : 'Reconnecting to camp…',
          );
      } finally {
        inFlight = false;
      }
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
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
    if (campClient.current?.code) {
      notify('Leave your shared camp before importing a solo island.');
      return;
    }
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
      className={`game-shell first-person ${lookMode === 'locked' || lookMode === 'follow' ? 'mouse-captured' : ''}`}
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
            {String(
              1 + Math.floor(snapshot.frontier.needs.activeTime / 600),
            ).padStart(2, '0')}
          </span>
          <i />
          <span>Spring</span>
          <span className="weather-word"> · A fine day for nonsense</span>
        </div>
        <div className="header-actions">
          {started && (
            <>
              <button
                className="icon-button"
                title="Equipment, workshops and expeditions · U"
                onClick={() => setPanel('adventure')}
              >
                <Compass />
              </button>
              <button
                className="icon-button"
                title="Co-op camp · L"
                onClick={() => setPanel('multiplayer')}
              >
                <Hand />
              </button>
            </>
          )}
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
              Hunt, cook, explore, upgrade. Bring snacks. Irritate a goose.
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
              className={`crosshair ${near ? (resourceRegrowthSeconds(snapshot.depleted, near) ? 'depleted' : 'on-target') : ''} ${placing ? (placementInfo.valid ? 'place-valid' : 'place-blocked') : ''}`}
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
                onClick={() => world.current?.useMouseLook()}
              >
                Use free mouse look
              </button>
            </div>
          )}
          {!panel &&
            !dialogue &&
            !win &&
            (lookMode === 'follow' || lookMode === 'touch') && (
              <div className="look-instruction">
                {lookMode === 'touch'
                  ? 'Drag to look · E or tap to use'
                  : 'Move mouse to look · At screen edge, keep turning · Tab frees cursor'}
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
          <div className="survival-hud" aria-label="Survival meters">
            <span
              className={snapshot.frontier.needs.hunger < 25 ? 'danger' : ''}
            >
              Food <b>{Math.ceil(snapshot.frontier.needs.hunger)}</b>
              <kbd>F</kbd>
            </span>
            <span
              className={snapshot.frontier.needs.thirst < 25 ? 'danger' : ''}
            >
              Water <b>{Math.ceil(snapshot.frontier.needs.thirst)}</b>
              <kbd>G</kbd>
            </span>
            <span>
              Health <b>{Math.ceil(snapshot.frontier.needs.health)}</b>
            </span>
            <small>
              Canteen {snapshot.frontier.needs.canteen} · Day{' '}
              {1 + Math.floor(snapshot.frontier.needs.activeTime / 600)}
            </small>
          </div>
          <div className="energy">
            <Leaf size={17} />
            <Progress value={stamina} aria-label="Stamina" />
            <span>{Math.round(stamina)}</span>
          </div>
          {near && !placing && (
            <button
              className={`interact-prompt ${resourceRegrowthSeconds(snapshot.depleted, near) ? 'depleted' : ''}`}
              disabled={resourceRegrowthSeconds(snapshot.depleted, near) > 0}
              onClick={() => world.current?.interact()}
            >
              <kbd>E</kbd>
              <span>
                {resourceRegrowthSeconds(snapshot.depleted, near)
                  ? harvestedLabel(near.kind)
                  : near.name}
                <small>
                  {resourceRegrowthSeconds(snapshot.depleted, near) > 0
                    ? `Harvested · regrows in ${resourceRegrowthSeconds(snapshot.depleted, near)}s`
                    : requiredTool(snapshot, near.kind, near.id)
                      ? snapshot.tool ===
                        requiredTool(snapshot, near.kind, near.id)
                        ? 'Ready · ' + TOOL_NAMES[snapshot.tool]
                        : 'Equip ' +
                          TOOL_NAMES[
                            requiredTool(snapshot, near.kind, near.id)!
                          ]
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
            {camp
              ? campError
                ? 'Camp reconnecting · open L for details'
                : 'Co-op camp · shared progress saved'
              : saveOk
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
          void perform({ type: 'pack', id });
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
        craft={(recipe: Craftable, amount = 1) => {
          void perform({ type: 'craft', recipe, amount });
        }}
        contract={(id) => {
          void perform({ type: 'contract', id });
        }}
        trade={(resource, sell) => {
          void perform({ type: 'trade', resource, sell });
        }}
        eat={(food) => {
          void perform({ type: 'eat', food });
        }}
        frontier={(action: FrontierAction) => {
          void perform(
            action.kind === 'gear'
              ? { type: 'gear', gear: action.id as Gear }
              : action.kind === 'eat'
                ? { type: 'eat', food: action.id as Resource }
                : action.kind === 'drink'
                  ? { type: 'drink' }
                  : { type: action.kind, id: action.id },
          );
        }}
        multiplayer={
          <MultiplayerPanel
            camp={camp}
            busy={campBusy}
            error={campError}
            enter={enterCamp}
            leave={leaveCamp}
          />
        }
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
          if (campClient.current?.code) {
            notify('Leave the shared camp before starting a new solo island.');
            return;
          }
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
