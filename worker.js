/**
 * Moonlander Global Leaderboard — Cloudflare Worker
 *
 * KV namespace binding: SCORES  (key: "leaderboard", value: JSON array)
 *
 * Deploy steps:
 *   1. Install Wrangler: npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler kv:namespace create SCORES
 *   4. Copy the id into wrangler.toml below
 *   5. wrangler deploy
 *
 * Routes:
 *   GET  /scores          → returns top-10 leaderboard JSON
 *   POST /scores          → submit { name, score } → returns updated leaderboard
 *   OPTIONS *             → CORS preflight
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_ENTRIES = 10;
const MAX_NAME_LEN = 16;
const MAX_SCORE = 9_999_999;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/scores') {
      if (request.method === 'GET') {
        return handleGet(env);
      }
      if (request.method === 'POST') {
        return handlePost(request, env);
      }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};

async function handleGet(env) {
  const leaderboard = await getLeaderboard(env);
  return new Response(JSON.stringify(leaderboard), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Validate
  let { name, score } = body;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return new Response(JSON.stringify({ error: 'Invalid score' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  score = Math.min(Math.floor(score), MAX_SCORE);

  if (typeof name !== 'string') name = 'AAA';
  // Strip non-printable / non-ASCII, trim, uppercase, clamp length
  name = name.replace(/[^\x20-\x7E]/g, '').trim().toUpperCase().slice(0, MAX_NAME_LEN) || 'AAA';

  // Update leaderboard
  const leaderboard = await getLeaderboard(env);
  leaderboard.push({ name, score, date: new Date().toISOString().slice(0, 10) });
  leaderboard.sort((a, b) => b.score - a.score);
  const updated = leaderboard.slice(0, MAX_ENTRIES);

  await env.SCORES.put('leaderboard', JSON.stringify(updated));

  return new Response(JSON.stringify(updated), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function getLeaderboard(env) {
  try {
    const raw = await env.SCORES.get('leaderboard');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
