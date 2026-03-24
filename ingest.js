/**
 * Mariners Watch — Supabase Ingestion Script
 *
 * Fetches game data from the MLB Stats API and upserts it into Supabase.
 * Safe to run repeatedly — uses upsert so it never creates duplicates.
 *
 * SETUP
 *   npm install @supabase/supabase-js
 *
 * ONE-TIME BACKFILL (2005–last year)
 *   SUPABASE_SERVICE_KEY=your_service_role_key node ingest.js
 *
 * NIGHTLY REFRESH (current season only — used by GitHub Actions)
 *   SUPABASE_SERVICE_KEY=your_service_role_key node ingest.js --current
 *
 * Get your service role key from:
 *   Supabase dashboard → Settings → API → service_role (secret)
 *   ⚠️  Never commit this key. Put it in GitHub Secrets instead.
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bvaryucxwnngacigqoeo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MLB          = 'https://statsapi.mlb.com/api/v1';
const SEA_ID       = 136;
const START_YEAR   = 2005;
const THIS_YEAR    = new Date().getFullYear();

if (!SUPABASE_KEY) {
  console.error('❌  SUPABASE_SERVICE_KEY env var is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Team ID → abbreviation lookup ─────────────────────────────
// The MLB Stats API schedule endpoint doesn't include abbreviations,
// so we maintain a static lookup.
const TEAM_ABBR = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

// ── AL West composition by year ───────────────────────────────
function teamsForYear(year) {
  // Base: SEA, OAK/ATH, LAA, TEX
  const base = [136, 133, 108, 140];
  if (year >= 2013) return [...base, 117]; // + HOU
  if (year >= 1994) return base;
  return [...base, 142, 145, 118]; // + MIN, CHW, KC (pre-1994 AL West)
}

// ── MLB API fetch ─────────────────────────────────────────────
async function fetchGames(teamId, year, gameTypes = 'R') {
  const url = `${MLB}/schedule?sportId=1&season=${year}&teamId=${teamId}&gameType=${gameTypes}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`MLB API ${res.status} for team ${teamId} / ${year}`);
  const data = await res.json();

  return (data.dates ?? [])
    .flatMap(({ games }) => games)
    .filter(g => g.status.abstractGameState === 'Final')
    .map(g => {
      const mine = g.teams.home.team.id === teamId ? g.teams.home : g.teams.away;
      const them = g.teams.home.team.id === teamId ? g.teams.away : g.teams.home;
      if (!mine.leagueRecord) return null;
      return {
        game_pk:     g.gamePk,
        team_id:     teamId,
        season:      year,
        game_date:   g.officialDate,
        game_type:   g.gameType,
        is_home:     g.teams.home.team.id === teamId,
        opp_team_id: them.team.id,
        opp_abbr:    TEAM_ABBR[them.team.id] ?? them.team.name?.slice(0, 3).toUpperCase() ?? 'UNK',
        wins:        mine.leagueRecord?.wins   ?? null,
        losses:      mine.leagueRecord?.losses ?? null,
        score:       mine.score    ?? null,
        opp_score:   them.score    ?? null,
        result:      mine.isWinner ? 'W' : 'L',
      };
    })
    .filter(Boolean);
}

// ── Supabase upsert (chunked, deduplicated) ───────────────────
async function upsert(rows) {
  if (!rows.length) return;
  // Deduplicate: keep last occurrence per (game_pk, team_id) to handle doubleheaders
  const map = new Map();
  for (const r of rows) map.set(`${r.game_pk}_${r.team_id}`, r);
  const deduped = [...map.values()];
  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const { error } = await supabase
      .from('games')
      .upsert(deduped.slice(i, i + CHUNK), { onConflict: 'game_pk,team_id' });
    if (error) throw error;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Ingest one season ─────────────────────────────────────────
async function ingestYear(year) {
  const teams = teamsForYear(year);
  console.log(`\n📅  ${year}  —  ${teams.length} AL West teams`);

  for (const teamId of teams) {
    try {
      // Regular season games for every division team (needed for standings chart)
      const regGames = await fetchGames(teamId, year, 'R');
      await upsert(regGames);
      console.log(`    ✓  team ${teamId}  ${regGames.length} regular season games`);

      // Playoff games — Mariners only (only SEA games are shown in the game card)
      if (teamId === SEA_ID) {
        const poGames = await fetchGames(teamId, year, 'F,D,L,W');
        await upsert(poGames);
        if (poGames.length) {
          console.log(`    ✓  SEA playoffs  ${poGames.length} games`);
        }
      }
    } catch (err) {
      console.warn(`    ⚠️   ${err.message} — skipping`);
    }

    await sleep(350); // be polite to the MLB API
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const currentOnly = process.argv.includes('--current');

  if (currentOnly) {
    console.log(`🔄  Refreshing ${THIS_YEAR} season data…`);
    await ingestYear(THIS_YEAR);
  } else {
    console.log(`🚀  Full backfill: ${START_YEAR} → ${THIS_YEAR}`);
    for (let year = START_YEAR; year <= THIS_YEAR; year++) {
      await ingestYear(year);
    }
  }

  console.log('\n✅  Done.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
