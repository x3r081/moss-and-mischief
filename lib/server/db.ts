import { env } from 'cloudflare:workers';
export function database(): D1DatabaseSession {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding)
    throw new Error(
      'Shared camps are not available on this server yet. Solo play is available.',
    );
  return binding.withSession('first-primary');
}
