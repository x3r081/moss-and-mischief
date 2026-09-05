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
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import Panels from './Panels';
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
const toolset: [Tool, string, typeof Axe][] = [
  ['axe', 'Axe', Axe],
  ['pickaxe', 'Pickaxe', Pickaxe],
  ['seeds', 'Plant', Sprout],
  ['water', 'Water', Droplets],
  ['build', 'Build', Hammer],
];
export default function Game() {
  const host = useRef<HTMLDivElement>(null),
    world = useRef<IslandWorld | null>(null),
    data = useRef<GameState>(initialState());
  const [snapshot, setSnapshot] = useState<GameState>(initialState()),
    [started, setStarted] = useState(false),
    [ready, setReady] = useState(false),
    [near, setNear] = useState<Entity | null>(null),
    [toast, setToast] = useState(''),
    [panel, setPanel] = useState(''),
    [tool, setTool] = useState<Tool>('axe'),
    [placing, setPlacing] = useState<Structure | null>(null),
    [stamina, setStamina] = useState(100),
    [error, setError] = useState(''),
    [hasSave, setHasSave] = useState(false),
    [dialogue, setDialogue] = useState(''),
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
  const act = (entity: Entity) => {
    const s = data.current;
    audio.current?.effect(
      entity.kind === 'goose'
        ? 'honk'
        : entity.kind === 'plot'
          ? 'farm'
          : 'gather',
    );
    let message = '';
    if (['wood', 'stone', 'fiber'].includes(entity.kind))
      message = gather(s, entity.id, entity.kind as 'wood' | 'stone' | 'fiber');
    else if (entity.kind === 'plot') message = farm(s, entity.id);
    else if (entity.kind === 'goose') {
      s.stats.talked = true;
      setDialogue(QUESTS[currentQuest(s)].quote);
    } else if (entity.kind === 'crystal') {
      if (!s.stats.explored) {
        s.inventory.crystal = 1;
        s.stats.explored = true;
        message = 'Sun crystal recovered! Suspiciously warm. Probably fine.';
      }
    } else if (entity.kind === 'lighthouse') {
      message = restoreLighthouse(s);
      if (s.won) {
        setWin(true);
        audio.current?.effect('win');
      }
    } else if (entity.kind === 'workbench' || entity.kind === 'campfire')
      setPanel('craft');
    else if (entity.kind === 'cottage') {
      world.current!.stamina = 100;
      message = 'Home sweet home. Energy restored.';
    } else if (entity.kind === 'chest') {
      if ((s.depleted.supplies ?? 0) < Date.now()) {
        s.inventory.wood += 2;
        s.inventory.stone += 2;
        s.inventory.fiber += 2;
        s.depleted.supplies = Date.now() + 60000;
        message =
          '+2 timber · +2 stone · +2 fiber. The sea has excellent delivery service.';
      } else message = 'More supplies wash up in a minute.';
    }
    if (message) notify(message);
    refresh();
    persist();
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
        interact: act,
        place: (type, x, z, rotation) => {
          if (!instance.canPlace(type, x, z)) return;
          notify(build(data.current, type, x, z, rotation));
          audio.current?.effect('build');
          setPlacing(null);
          setTool('axe');
          refresh();
          persist();
        },
        menu: (name) => {
          if (name === 'cancel-build') {
            setPlacing(null);
            setTool('axe');
          } else if (name === 'escape') {
            setPanel((v) => (v ? '' : 'pause'));
            setDialogue('');
            setPlacing(null);
          } else if (name.startsWith('Digit')) {
            const index = Number(name.slice(-1)) - 1;
            if (toolset[index]) {
              setTool(toolset[index][0]);
              if (index === 4) setPanel('build');
            }
          } else setPanel(name);
        },
        move: (_x, _z, e) => {
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
    refresh();
    persist();
    notify('Welcome to Bramblewick. Find the goose. He has opinions.');
  };
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
    <main className="game-shell">
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
              <span /> A COZY LITTLE ADVENTURE
            </span>
            <h1>
              Moss <i>&</i>
              <br />
              Mischief<span>™</span>
            </h1>
            <p>
              A little island. A grand misadventure.
              <br />
              Grow roots. Build something. Irritate a goose.
            </p>
            <button
              className="start-button"
              onClick={start}
              disabled={!ready || !!error}
            >
              <Play size={19} fill="currentColor" />
              {hasSave ? 'Continue adventure' : 'Make yourself at home'}
              <ArrowUpRight size={21} />
            </button>
            <div className="intro-foot">
              <span>
                <Leaf size={13} /> No rush. No wrong turns.
              </span>
              <span>Just one very opinionated goose.</span>
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
          <div className="resource-strip">
            {(['wood', 'stone', 'fiber', 'seed'] as Resource[]).map((r) => {
              const Icon = resourceIcons[r];
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
                <Flag size={13} /> THE LITTLE BIG ADVENTURE
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
                {snapshot.won ? 'ADVENTURE COMPLETE' : `CHAPTER ${q + 1} OF 6`}
              </span>
              <button onClick={() => setPanel('journal')}>
                Journal <kbd>J</kbd>
              </button>
            </div>
          </aside>
          <div className="location-label">
            <MapPin size={14} />
            {snapshot.player.z < -12
              ? 'The Forgotten Garden'
              : snapshot.player.x > 13
                ? 'Sunward Point'
                : snapshot.player.z > 16
                  ? 'Driftwood Shore'
                  : 'Bramblewick Homestead'}
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
              <span>{near.name}</span>
              <ChevronRight size={17} />
            </button>
          )}
          {placing && (
            <div className="build-hint">
              <Hammer size={17} />
              <span>Place {RECIPES[placing].name.toLowerCase()}</span>
              <span>Click clear ground nearby · R rotate · Esc cancel</span>
            </div>
          )}
          <nav className="hotbar" aria-label="Tools">
            <div className="tool-slots">
              {toolset.map(([id, label, Icon], i) => (
                <button
                  key={id}
                  className={tool === id ? 'selected' : ''}
                  aria-label={`${label} (${i + 1})`}
                  aria-pressed={tool === id}
                  onClick={() => {
                    setTool(id);
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
              <kbd>E</kbd> Interact
            </span>
            <span>Right-drag to orbit · Scroll to zoom</span>
          </div>
          <div className="save-indicator">
            <span />{' '}
            {saveOk
              ? 'Progress saved on this device'
              : 'Saving unavailable · export in Settings'}
          </div>
          <div className="touch-controls">
            <div className="touch-pad">
              <button
                aria-label="Move forward"
                onPointerDown={() => world.current?.setMovement(0, -1)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ↑
              </button>
              <button
                aria-label="Move left"
                onPointerDown={() => world.current?.setMovement(-1, 0)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ←
              </button>
              <button
                aria-label="Move back"
                onPointerDown={() => world.current?.setMovement(0, 1)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
                onPointerLeave={() => world.current?.setMovement(0, 0)}
              >
                ↓
              </button>
              <button
                aria-label="Move right"
                onPointerDown={() => world.current?.setMovement(1, 0)}
                onPointerUp={() => world.current?.setMovement(0, 0)}
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
              MAYOR HONK <small>SELF-APPOINTED, MOSTLY</small>
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
          setTool('build');
          world.current?.setBuild(type);
          notify(
            'Move your pointer over clear ground nearby. Green means it fits.',
          );
        }}
        craft={(type) => {
          notify(craft(data.current, type));
          audio.current?.effect('craft');
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
          if (persist()) notify('Adventure saved. Your carrots are in good hands.');
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
              the light home.
            </h2>
            <p>
              The lighthouse glows. Your garden grows.
              <br />
              And somewhere, a very proud goose is ordering a statue of himself.
            </p>
            <blockquote>
              “Citizens, we are officially illuminated!”
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
