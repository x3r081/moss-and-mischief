'use client';
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="game-loading">
      <h1>A little island hiccup.</h1>
      <p>Your saved adventure is still on this device.</p>
      <button className="start-button" onClick={reset}>
        Return to Bramblewick
      </button>
    </main>
  );
}
