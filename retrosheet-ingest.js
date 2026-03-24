/**
 * Mariners Watch — Retrosheet Ingestion Script (1977–2004)
 *
 * Downloads Retrosheet game log CSVs, parses them, computes cumulative
 * win-loss records, and upserts into the same Supabase `games` table
 * used by the MLB Stats API ingestion script.
 *
 * SETUP
 *   npm install @supabase/supabase-js adm-zip
 *
 * RUN (one-time)
 *   SUPABASE_SERVICE_KEY=your_service_role_key node retrosheet-ingest.js
 *
 * Safe to re-run — uses upsert with the same composite key (game_pk, team_id).
 */

import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';

// ── Config ────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bvaryucxwnngacigqoeo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SEA_ID       = 136;
const START_YEAR   = 1977;
const END_YEAR     = 2004;

if (!SUPABASE_KEY) {
  console.error('❌  SUPABASE_SERVICE_KEY env var is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Retrosheet team abbreviation → MLB team ID ───────────────
const RETRO_TO_ID = {
  SEA: 136, OAK: 133, CAL: 108, ANA: 108, LAA: 108,
  TEX: 140, MIN: 142, CHA: 145, KCA: 118, HOU: 117,
  NYA: 147, BOS: 111, BAL: 110, CLE: 114, DET: 116,
  TOR: 141, MIL: 158, TBA: 139, NYN: 121, PHI: 143,
  MON: 120, WAS: 120, ATL: 144, FLO: 146, MIA: 146,
  CHN: 112, SLN: 138, PIT: 134, CIN: 113, SDN: 135,
  SFN: 137, LAN: 119, COL: 115, ARI: 109,
};

// ── Retrosheet abbreviation → display abbreviation ───────────
const RETRO_TO_ABBR = {
  SEA: 'SEA', OAK: 'OAK', CAL: 'CAL', ANA: 'ANA', LAA: 'LAA',
  TEX: 'TEX', MIN: 'MIN', CHA: 'CHW', KCA: 'KC',  HOU: 'HOU',
  NYA: 'NYY', BOS: 'BOS', BAL: 'BAL', CLE: 'CLE', DET: 'DET',
  TOR: 'TOR', MIL: 'MIL', TBA: 'TB',  NYN: 'NYM', PHI: 'PHI',
  MON: 'MON', WAS: 'WSH', ATL: 'ATL', FLO: 'FLA', MIA: 'MIA',
  CHN: 'CHC', SLN: 'STL', PIT: 'PIT', CIN: 'CIN', SDN: 'SD',
  SFN: 'SF',  LAN: 'LAD', COL: 'COL', ARI: 'ARI',
};

// ── AL West composition by year ──────────────────────────────
function alWestTeamIds(year) {
  const base = [136, 133, 108, 140]; // SEA, OAK, CAL/ANA, TEX
  if (year >= 1994) return base;     // 4-team division after realignment
  return [...base, 142, 145, 118];   // + MIN, CHW, KC (pre-1994)
}

// ── Download and extract a Retrosheet zip ────────────────────
async function downloadZip(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  // Each zip has one .TXT file inside
  const entries = zip.getEntries();
  return entries.map(e => e.getData().toString('utf-8'));
}

// ── Parse one line of a game log CSV ─────────────────────────
// Fields are comma-separated, strings are double-quoted.
function parseLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++; // skip opening quote
      let val = '';
      while (i < line.length && line[i] !== '"') { val += line[i]; i++; }
      i++; // skip closing quote
      if (i < line.length && line[i] === ',') i++; // skip comma
      fields.push(val);
    } else {
      let val = '';
      while (i < line.length && line[i] !== ',') { val += line[i]; i++; }
      if (i < line.length) i++; // skip comma
      fields.push(val);
    }
  }
  return fields;
}

// ── Format YYYYMMDD → YYYY-MM-DD ────────────────────────────
function fmtDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ── Synthetic game_pk: YYYYMMDD * 10 + gameNumber ───────────
// Values are ~1.97B–2.00B, safely above MLB's real gamePk range.
function syntheticPk(dateStr, gameNum) {
  return parseInt(dateStr) * 10 + parseInt(gameNum || '0');
}

// ── Supabase upsert (chunked) ────────────────────────────────
async function upsert(rows) {
  if (!rows.length) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('games')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_pk,team_id' });
    if (error) throw error;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Ingest regular season for one year ───────────────────────
async function ingestRegularSeason(year) {
  const url = `https://www.retrosheet.org/gamelogs/gl${year}.zip`;
  const [csv] = await downloadZip(url);
  const lines = csv.split('\n').filter(l => l.trim());
  const alWest = new Set(alWestTeamIds(year));

  // Parse all games, keep only those involving an AL West team
  const allGames = lines.map(parseLine).filter(f => f.length >= 11);

  // Build rows for each AL West team
  const rowsByTeam = {};
  for (const teamId of alWest) rowsByTeam[teamId] = [];

  for (const f of allGames) {
    const visRetro = f[3];
    const homeRetro = f[6];
    const visId = RETRO_TO_ID[visRetro];
    const homeId = RETRO_TO_ID[homeRetro];
    const visScore = parseInt(f[9]);
    const homeScore = parseInt(f[10]);
    const date = fmtDate(f[0]);
    const gameNum = f[1];
    const pk = syntheticPk(f[0], gameNum);

    if (!visId || !homeId) {
      // Unknown team abbreviation — log and skip
      if (alWest.has(visId) || alWest.has(homeId)) {
        console.warn(`    ⚠️  Unknown team: ${visRetro} or ${homeRetro}`);
      }
      continue;
    }

    const visWon = visScore > homeScore;

    // If visitor is in AL West, create a row for them
    if (alWest.has(visId)) {
      rowsByTeam[visId].push({
        game_pk: pk, team_id: visId, season: year,
        game_date: date, game_type: 'R', is_home: false,
        opp_team_id: homeId, opp_abbr: RETRO_TO_ABBR[homeRetro] ?? homeRetro,
        score: visScore, opp_score: homeScore,
        result: visWon ? 'W' : 'L',
        // wins/losses filled in below after sorting
        wins: null, losses: null,
      });
    }

    // If home team is in AL West, create a row for them
    if (alWest.has(homeId)) {
      rowsByTeam[homeId].push({
        game_pk: pk, team_id: homeId, season: year,
        game_date: date, game_type: 'R', is_home: true,
        opp_team_id: visId, opp_abbr: RETRO_TO_ABBR[visRetro] ?? visRetro,
        score: homeScore, opp_score: visScore,
        result: visWon ? 'L' : 'W',
        wins: null, losses: null,
      });
    }
  }

  // Compute cumulative W-L for each team
  let totalRows = 0;
  for (const teamId of alWest) {
    const games = rowsByTeam[teamId].sort((a, b) =>
      a.game_date.localeCompare(b.game_date) || a.game_pk - b.game_pk
    );
    let w = 0, l = 0;
    for (const g of games) {
      if (g.result === 'W') w++; else l++;
      g.wins = w;
      g.losses = l;
    }
    totalRows += games.length;
  }

  // Flatten and upsert
  const allRows = Object.values(rowsByTeam).flat();
  await upsert(allRows);
  return totalRows;
}

// ── Ingest postseason games for SEA ──────────────────────────
async function ingestPostseason() {
  // Mariners playoff years pre-2005: 1995, 1997, 2000, 2001
  const postFiles = [
    { url: 'https://www.retrosheet.org/gamelogs/gldv.zip', gameType: 'D' }, // Division Series
    { url: 'https://www.retrosheet.org/gamelogs/gllc.zip', gameType: 'L' }, // League Championship
  ];
  // No Wild Card games pre-2012, no World Series for SEA

  let totalRows = 0;

  for (const { url, gameType } of postFiles) {
    const csvFiles = await downloadZip(url);
    const rows = [];

    for (const csv of csvFiles) {
      const lines = csv.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const f = parseLine(line);
        if (f.length < 11) continue;

        const visRetro = f[3];
        const homeRetro = f[6];
        const visId = RETRO_TO_ID[visRetro];
        const homeId = RETRO_TO_ID[homeRetro];
        const year = parseInt(f[0].slice(0, 4));

        // Only pre-2005 SEA games
        if (year > END_YEAR) continue;
        if (visId !== SEA_ID && homeId !== SEA_ID) continue;

        const visScore = parseInt(f[9]);
        const homeScore = parseInt(f[10]);
        const date = fmtDate(f[0]);
        const pk = syntheticPk(f[0], f[1]);
        const isHome = homeId === SEA_ID;
        const seaScore = isHome ? homeScore : visScore;
        const oppScore = isHome ? visScore : homeScore;
        const oppRetro = isHome ? visRetro : homeRetro;
        const oppId = isHome ? visId : homeId;

        rows.push({
          game_pk: pk, team_id: SEA_ID, season: year,
          game_date: date, game_type: gameType, is_home: isHome,
          opp_team_id: oppId, opp_abbr: RETRO_TO_ABBR[oppRetro] ?? oppRetro,
          score: seaScore, opp_score: oppScore,
          result: seaScore > oppScore ? 'W' : 'L',
          wins: null, losses: null, // postseason — no cumulative record
        });
      }
    }

    await upsert(rows);
    totalRows += rows.length;
    if (rows.length) {
      console.log(`    ✓  SEA postseason (${gameType === 'D' ? 'ALDS' : 'ALCS'})  ${rows.length} games`);
    }
  }

  return totalRows;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log(`🚀  Retrosheet backfill: ${START_YEAR} → ${END_YEAR}\n`);

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    const teamCount = alWestTeamIds(year).length;
    console.log(`📅  ${year}  —  ${teamCount} AL West teams`);
    try {
      const count = await ingestRegularSeason(year);
      console.log(`    ✓  ${count} regular season games ingested`);
    } catch (err) {
      console.warn(`    ⚠️  ${err.message} — skipping ${year}`);
    }
    await sleep(500); // be polite to Retrosheet
  }

  console.log(`\n🏆  Ingesting SEA postseason games (1995, 1997, 2000, 2001)…`);
  try {
    await ingestPostseason();
  } catch (err) {
    console.warn(`    ⚠️  Postseason: ${err.message}`);
  }

  console.log('\n✅  Retrosheet ingestion complete.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
