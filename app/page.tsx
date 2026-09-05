'use client';
import dynamic from 'next/dynamic';
const Game = dynamic(() => import('@/components/game/Game'), {
  ssr: false,
  loading: () => (
    <main className="game-loading">
      <span className="loading-sprout">✦</span>
      <h1>
        Moss <i>&</i> Mischief
      </h1>
      <p>Convincing the island to exist…</p>
    </main>
  ),
});
export default function Home() {
  return <Game />;
}
