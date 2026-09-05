'use client';
import { useState } from 'react';
import type { CampUpdate } from '@/lib/game/camp';
export default function MultiplayerPanel({
  camp,
  busy,
  error,
  enter,
  leave,
}: {
  camp: CampUpdate | null;
  busy: boolean;
  error: string;
  enter: (op: 'create' | 'join', name: string, code: string) => void;
  leave: () => void;
}) {
  const [name, setName] = useState('Garden Goblin'),
    [code, setCode] = useState(
      typeof window === 'undefined'
        ? ''
        : (new URLSearchParams(window.location.search).get('camp') ?? ''),
    ),
    [copied, setCopied] = useState(false);
  return (
    <div className="coop-panel">
      <p className="panel-intro">
        Up to four explorers. One pantry. An alarming number of opinions about
        fence placement.
      </p>
      {error && (
        <p role="alert" className="coop-error">
          {error}
        </p>
      )}
      {camp ? (
        <>
          <div className="frontier-card">
            <span className="eyebrow">YOUR SHARED CAMP</span>
            <h3>{camp.code}</h3>
            <p>
              {camp.peers.length}/4 explorers ·{' '}
              {busy
                ? 'Saving your action…'
                : 'Shared progress saves to the server'}
            </p>
            <ul>
              {camp.peers.map((p) => (
                <li key={p.id}>
                  {p.name}
                  {p.id === camp.id ? ' (you)' : ''}
                </li>
              ))}
            </ul>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/?camp=${camp.code}`,
                  );
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Invitation copied' : 'Copy invitation link'}
            </button>
            <p className="muted">
              The code is the key. Share it only with your crew. Friends also
              need access to this hosted site.
            </p>
          </div>
          <button className="subtle" disabled={busy} onClick={leave}>
            Leave camp & return to my solo island
          </button>
          <p>
            Your camp persists after everyone leaves. Keep this code to rejoin.
          </p>
        </>
      ) : (
        <>
          <label className="coop-label">
            Explorer name
            <input
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="frontier-card">
            <h3>Start a co-op camp</h3>
            <p>
              Create a shared copy of your current island. Your solo save stays
              safely at home, judging your packing.
            </p>
            <button
              className="primary"
              disabled={busy || !name.trim()}
              onClick={() => enter('create', name, '')}
            >
              {busy ? 'Tuning the camp radio…' : 'Create a shared camp'}
            </button>
          </div>
          <div className="frontier-card">
            <h3>Join your friends</h3>
            <label className="coop-label">
              Camp code
              <input
                maxLength={16}
                placeholder="16 characters from your friend"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/\s/g, ''))
                }
              />
            </label>
            <button
              className="primary"
              disabled={busy || !name.trim() || code.length !== 16}
              onClick={() => enter('join', name, code)}
            >
              Join camp
            </button>
          </div>
        </>
      )}
      <p className="muted">
        Shared: materials, buildings, crops, upgrades, quests, and expeditions.
        Personal: position, hunger, thirst, health, and canteen. Camp
        interactions require a connection; solo play works offline after
        loading. No chat, accounts, purchases, or subscriptions.
      </p>
    </div>
  );
}
