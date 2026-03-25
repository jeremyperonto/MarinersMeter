# Mariners Meter

A Seattle Mariners fan dashboard tracking the AL West standings race — any day, any season, since 2005. Drag the cursor through any season and watch the standings, game results, playoff bracket, and fan mood meter update in real time.

**[View it live →](https://jeremyperonto.com/MarinersMeter/)** &nbsp;·&nbsp; **[Make one for your team →](#make-one-for-your-team)**

---

## What it does

- **AL West standings chart** — smooth Catmull-Rom curves tracking games back over an entire season, 2005 to present
- **Draggable time cursor** — scrub through any date in any season; the game card, standings table, and season record all update live
- **Game card** — shows the result (or upcoming time) for every regular season and postseason game on the cursor date
- **Fan Feelings Meter** — a mood score calculated from win percentage, games back, recent form, and playoff outcome
- **Postseason panel** — series-by-series results for every Mariners playoff run
- **Season lore** — a factual defining moment or milestone for notable years
- **Live game polling** — when today's game is in progress, scores update every 20 seconds via the MLB Stats API
- **2026 empty state** — *"There's always next year."*

---

## Stack

This is a single self-contained HTML file. No build step, no npm, no framework installation.

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + Babel (CDN) | No build toolchain, deploys as a static file |
| Data | MLB Stats API (unauthenticated) | Free, reliable, covers 2005–present |
| Storage | Supabase (Postgres) | One-time ingestion of 2005–present; nightly refresh for current season |
| Hosting | GitHub Pages | Free static hosting, deploys on push |
| Fonts | Exo 2, Barlow Condensed, Libre Baskerville (Google Fonts) | Sporty display + readable body + italic flavor text |

---

## Data architecture

### Source of truth: MLB Stats API

The MLB Stats API (`statsapi.mlb.com/api/v1`) is a free, unauthenticated public API that covers all regular season and postseason games from 2005 onward. All standings, scores, schedules, and linescore data come from here.

The app makes these calls:
- `schedule?sportId=1&season=YEAR&teamId=ID&gameType=R` — regular season games, per AL West team
- `schedule?sportId=1&season=YEAR&teamId=136&gameType=F,D,L,W` — Mariners postseason
- `game/{gamePk}/linescore` — live inning-by-inning data, polled every 20s during live games

### Caching layer: Supabase

All completed game data (2005 through end of last season) is stored in Supabase and served from there instead of the MLB API. This eliminates redundant upstream calls for historical seasons that will never change.

**Schema** (`schema.sql`):
```sql
games (
  game_pk, team_id,     -- composite primary key
  season, game_date, game_type,
  is_home, opp_team_id, opp_abbr,
  wins, losses,         -- cumulative regular season record
  score, opp_score, result
)
```

Row Level Security is enabled. Public reads are open; writes require the service role key.

### Ingestion workflow

**One-time backfill** (run locally, takes ~5 minutes):
```bash
npm install @supabase/supabase-js
SUPABASE_SERVICE_KEY=your_service_role_key node ingest.js
```

**Nightly refresh** (GitHub Actions, runs at 1am Pacific):
```bash
SUPABASE_SERVICE_KEY=your_service_role_key node ingest.js --current
```

The service role key is stored in GitHub Secrets (`SUPABASE_SERVICE_KEY`). The publishable key in the HTML file is safe to commit — it is rate-limited and RLS prevents writes.

### What's not in Supabase

Live linescore data is never cached — it's always fetched direct from the MLB API since it changes pitch by pitch. Pre-2005 data does not exist in this project; the MLB Stats API does not reliably cover years before 2005, and Retrosheet integration (which would unlock 1977–2004) was intentionally deferred as a future project.

---

## AL West composition by era

| Era | Teams |
|---|---|
| 1994–2012 | SEA, OAK, LAA, TEX |
| 2013–present | SEA, OAK/ATH, LAA, TEX, HOU |

The Athletics are abbreviated `ATH` for 2024 onward (Las Vegas era) and `OAK` for prior seasons.

---

## Project files

```
index.html              — the entire app; deploy this file
favicon.svg             — compass rose in teal on navy
schema.sql              — run once in Supabase SQL Editor
ingest.js               — MLB API → Supabase ingestion script
.github/
  workflows/
    refresh.yml         — nightly GitHub Actions job
README.md               — this file
```

---

## Deployment

1. Create a [Supabase](https://supabase.com) project (free tier is sufficient — the dataset is ~5MB)
2. Run `schema.sql` in the Supabase SQL Editor
3. Run the one-time backfill: `SUPABASE_SERVICE_KEY=... node ingest.js`
4. Push the repo to GitHub and enable GitHub Pages (Settings → Pages → Deploy from branch → `main`)
5. Add `SUPABASE_SERVICE_KEY` to GitHub Secrets (Settings → Secrets and variables → Actions)
6. The nightly Action will keep the current season fresh

The publishable Supabase key can live in `index.html` safely.

---

## Design decisions

**Single-file architecture.** The entire app — HTML, CSS, React components, API calls, data logic — lives in one `.html` file. This keeps deployment to GitHub Pages trivial and eliminates any build toolchain dependency. CDN-loaded React 18 + Babel handles JSX transpilation in the browser.

**Unified render path prevents layout jitter.** The game card always renders the score block — it's just `visibility: hidden` on no-game days. `display: none` causes the card to change height as the cursor crosses game/no-game boundaries, making the page jump. This was the correct fix; fighting `min-height` was not.

**Playoff timeline extension.** The standings chart is built from regular season data only, so the cursor's date range ends on the last game of the regular season. Postseason game dates are appended to the timeline with standings frozen at the regular season finale, giving the cursor physical positions to land on so playoff games show up in the game card.

**Catmull-Rom splines for chart curves.** Raw point-to-point lines look jagged. The SVG chart uses Catmull-Rom splines converted to cubic Bézier control points with a tension of 0.35 — smooth without being so loose that the curves misrepresent the actual standings movements.

**Factual lore over clever editorializing.** Season lore strings prioritize specific dates, verified records, and real events over witty takes. Errors in historical data (wrong year, wrong win total, wrong finish position) undermine trust in the whole dashboard.

---

## Known limitations

- **2005 onward only.** Pre-2005 Retrosheet integration was designed but never implemented.
- **No doubleheader disambiguation.** On days with two games, the card shows the last game played (`.at(-1)`).
- **2020 season is unannotated.** The COVID 60-game season has no special handling or visual asterisk.
- **Single-user cache.** localStorage was evaluated and rejected in favor of Supabase. Each visitor's browser was going to make the same MLB API calls anyway — a shared server-side cache is the right solution.

---

## Make one for your team

This project is open source. You can build a version for any MLB team. There are two approaches depending on how far back you want to go and how much infrastructure you want to set up.

**[Fork this repo →](https://github.com/jeremyperonto/MarinersMeter)**

---

### Choose your path

#### Option A: API-only (simplest)

Call the MLB Stats API directly from your HTML file. No database, no backend, no ingestion scripts. Every page load fetches fresh data from MLB.

**Pros:** Zero infrastructure. One HTML file, deploy anywhere.
**Cons:** Only covers 2005–present. Every visitor hits the MLB API on every page load (no caching). Slightly slower initial render.

**What you need:**
1. Fork this repo
2. Update `index.html` — replace team IDs, division teams, colors, lore, and team name
3. Remove the Supabase code and have all seasons fetch from the MLB API directly
4. Deploy to GitHub Pages

#### Option B: API + database (recommended)

Cache completed seasons in a database so only the current season hits the MLB API. This is how Mariners Meter works.

**Storage options:**
- **Supabase** (free Postgres) — what this project uses. Shared cache across all visitors. Requires a nightly GitHub Action to refresh the current season.
- **localStorage** — no server needed, but each visitor builds their own cache on first visit. Good enough for a personal project.

**What you need:**
1. Fork this repo
2. Find your team's MLB ID — `statsapi.mlb.com/api/v1/teams?sportId=1` lists all 30 teams
3. Find your division's teams and their IDs
4. Create a [Supabase](https://supabase.com) project (free tier is fine — the dataset is ~5MB) and run `schema.sql`
5. Update `index.html` — replace team IDs, division teams, colors, lore, and team name
6. Run the one-time backfill: `SUPABASE_SERVICE_KEY=... node ingest.js`
7. Push to GitHub and enable GitHub Pages
8. Add `SUPABASE_SERVICE_KEY` to GitHub Secrets
9. The nightly GitHub Action keeps the current season fresh automatically

#### Option C: API + Retrosheet + database (full history)

Combine MLB Stats API data (2005–present) with Retrosheet game logs (1977–2004 or earlier) for complete franchise history. Requires Option B's database setup plus a one-time Retrosheet ingestion.

See [Extending to pre-2005 with Retrosheet](#extending-to-pre-2005-with-retrosheet) below.

---

### Understanding the MLB Stats API

The MLB Stats API is a free, unauthenticated, public JSON API maintained by MLB. No API key required. No signup. Just make HTTP requests.

**Base URL:** `https://statsapi.mlb.com/api/v1`

#### Core concepts

| Term | What it means |
|---|---|
| **`sportId`** | Which sport. `1` = MLB (Major League Baseball). Always use `1`. |
| **`teamId`** | Unique numeric ID for each franchise. Never changes even when a team moves or rebrands. Example: the Athletics are `133` whether they're in Oakland or Las Vegas. |
| **`season`** | Four-digit year. Example: `2024`. |
| **`gameType`** | Single letter classifying the game. See table below. |
| **`gamePk`** | Unique numeric ID for a single game. Used to fetch live data. Example: `745623`. |

#### Game types

| Code | Meaning | Notes |
|---|---|---|
| `R` | Regular season | 162 games per team (60 in 2020). This is what you want for standings. |
| `S` | Spring training | **Exclude these.** They will pollute your data. |
| `F` | Wild Card | Single-elimination or best-of-3 depending on year. |
| `D` | Division Series | Best of 5. |
| `L` | League Championship Series | Best of 7 (ALCS / NLCS). |
| `W` | World Series | Best of 7. |

#### Endpoints you'll use

**Team schedule (one team, one year):**
```
GET /schedule?sportId=1&season=2024&teamId=136&gameType=R
```
Returns every regular season game for the Mariners in 2024. Each game includes: date, opponent, home/away, score, cumulative win-loss record, and game status (Final, Live, Preview).

**Postseason schedule:**
```
GET /schedule?sportId=1&season=2024&teamId=136&gameType=F,D,L,W
```
Returns all postseason games. Comma-separate multiple game types in one call.

**Live linescore (in-progress games):**
```
GET /game/745623/linescore
```
Returns inning-by-inning scores, current inning, outs, runners on base. Poll every ~20 seconds during a live game.

**All teams (find your team ID):**
```
GET /teams?sportId=1
```
Returns all 30 MLB teams with their `id`, `name`, `abbreviation`, `division`, and `league`.

#### What the API returns

A `/schedule` response looks like this (simplified):

```json
{
  "dates": [
    {
      "date": "2024-03-28",
      "games": [
        {
          "gamePk": 745623,
          "officialDate": "2024-03-28",
          "gameType": "R",
          "status": { "detailedState": "Final" },
          "teams": {
            "home": {
              "team": { "id": 136, "name": "Seattle Mariners" },
              "score": 5,
              "leagueRecord": { "wins": 1, "losses": 0 }
            },
            "away": {
              "team": { "id": 108, "name": "Los Angeles Angels" },
              "score": 3,
              "leagueRecord": { "wins": 0, "losses": 1 }
            }
          }
        }
      ]
    }
  ]
}
```

Key fields:
| Field | Where to find it | What it means |
|---|---|---|
| `gamePk` | `games[].gamePk` | Unique game ID. Use this to fetch live data. |
| `officialDate` | `games[].officialDate` | The calendar date of the game (`YYYY-MM-DD`). |
| `gameType` | `games[].gameType` | `R`, `F`, `D`, `L`, or `W` (see table above). |
| `detailedState` | `games[].status.detailedState` | `"Final"`, `"In Progress"`, `"Preview"`, `"Scheduled"`, etc. |
| `score` | `games[].teams.home.score` | Runs scored. Only present for Final or In Progress games. |
| `leagueRecord` | `games[].teams.home.leagueRecord` | Cumulative `{ wins, losses }` as of this game. This is how you build standings without computing them yourself. |
| `team.id` | `games[].teams.home.team.id` | The `teamId` of the home or away team. |

#### Games Back formula

```
GB = ((leader_wins - team_wins) + (team_losses - leader_losses)) / 2
```

The division leader always has `GB = 0`. A team that is 5-3 when the leader is 7-1 is `((7-5) + (3-1)) / 2 = 2.0` games back.

You can compute this from the `leagueRecord` fields in each game, or calculate it yourself from cumulative win-loss records.

#### Caveats

- **Data only goes back to 2005.** Earlier seasons have incomplete or unreliable data. For older history, use Retrosheet.
- **No authentication required** — but there is also no documented SLA or rate limit. Be polite: add a delay between batch requests (this project uses 350ms).
- **Filter out spring training.** Always specify `gameType=R` for regular season data. Spring training games (`gameType=S`) will appear in unfiltered queries.
- **The Athletics changed abbreviations** from `OAK` to `ATH` in 2024 (Las Vegas move). Their `teamId` (133) did not change.
- **Doubleheaders** return two games for the same date. This app shows the last game played (`.at(-1)`).
- **The 2020 season** was 60 games due to COVID. Charts look different and win totals are low. No special handling required.

#### All MLB team IDs

Find your division's teams at `statsapi.mlb.com/api/v1/teams?sportId=1`. Here are the AL West IDs as an example:

| Team | ID | Notes |
|---|---|---|
| Seattle Mariners | 136 | |
| Athletics | 133 | `OAK` through 2023, `ATH` from 2024 |
| Los Angeles Angels | 108 | `ANA` through 2004, `LAA` from 2005 |
| Texas Rangers | 140 | |
| Houston Astros | 117 | Joined AL West in 2013 |

---

### Extending to pre-2005 with Retrosheet

The MLB Stats API doesn't reliably cover seasons before 2005. To go back to a team's founding year, you need [Retrosheet](https://www.retrosheet.org).

Retrosheet distributes free game log CSV files covering every MLB game since the 19th century. The data is available at `retrosheet.org/downloads/` in a standardized format. Each row is one game with ~160 fields including date, teams, score, and attendance.

**What Retrosheet gives you that the MLB API doesn't:**
- Complete game-by-game results from 1871 to present
- Every team's score, opponent, and home/away status
- Enough data to compute cumulative win-loss records yourself

**What Retrosheet does NOT give you:**
- Cumulative records (you compute these from the game-by-game results)
- The same field names or structure as the MLB API (you normalize them)
- Live data (Retrosheet is updated after the season ends)

**The engineering work required:**
1. Download the game log CSV files for your target years (`gl{YEAR}.zip`)
2. Write a parser that maps Retrosheet's team abbreviations (e.g., `SEA`, `OAK`, `CHA`) to MLB team IDs
3. Calculate cumulative win-loss records from the raw game-by-game results
4. Normalize the data into the same schema as your database `games` table
5. Handle division realignment — most divisions changed composition over the decades
6. Ingest it alongside the MLB Stats API data

This repo includes `retrosheet-ingest.js` as a reference implementation for the Mariners and AL West (1977–2004).

**Suggested prompt when you're ready:**

```
I want to extend my team dashboard to cover [TEAM]'s full history back
to [FOUNDING YEAR]. The MLB Stats API only reliably covers 2005+.
Retrosheet has game log CSVs covering everything before that.

Please:
1. Research the Retrosheet game log CSV format
2. Identify the relevant team abbreviations for [TEAM] and all
   [DIVISION] teams across the relevant era(s)
3. Write a parser that reads the CSV files and outputs rows matching
   our existing database schema
4. Handle any division realignment — [DIVISION] had different members
   in [RELEVANT ERA]
```

---

### How it was built

This entire project was built in a series of conversations with [Claude](https://claude.ai) (Claude Sonnet, Anthropic), starting from a blank file. No boilerplate was used. The approach was iterative: build a working version, review it, give specific feedback, repeat. Total sessions: approximately 15–20 rounds of refinement.

The development pattern that worked well:
- Claude writes a complete working version first, then refines
- Feedback is specific and actionable ("the card height changes when there's no game" rather than "fix the card")
- Claude proactively audits for factual errors in historical data
- Full rewrites are preferred over patches when a round of changes is substantial enough

---

### Prompts to replicate this project

The following prompts replicate what was used to build Mariners Meter. Adapt the team name, division, colors, and any team-specific lore.

<details>
<summary><strong>Session 1 — Research and architecture</strong></summary>

```
I want to build a fan dashboard for the [TEAM NAME] that tracks the
[DIVISION NAME] standings race over time. I want to be able to scrub
through any season from 2005 to the present and see where [TEAM] stood
relative to the rest of the division on any given date.

Before building anything, please:
1. Research what free APIs exist for MLB historical data
2. Figure out which teams have been in [DIVISION] and when they joined/left
3. Identify each team's MLB team ID
4. Confirm how the Games Back formula works
5. Sketch out the data model and components we'll need

Don't write any code yet.
```
</details>

<details>
<summary><strong>Session 2 — First build</strong></summary>

```
Now build it as a single self-contained HTML file using React 18 and
Babel from CDN. No build step, no npm, no framework installation — it
should open directly in a browser.

Design it for a fan, not an analyst. Dark theme. The team's primary
color is [HEX CODE]. The background should feel like a stadium at night.

Include:
- A draggable cursor on the standings chart that updates everything on the page
- A game card widget showing the result for the cursor date
- A standings table and season record panel below the chart
- The team name as the page title in the header
- A footer crediting me by name: [YOUR NAME] at [YOUR URL]

Data comes from the MLB Stats API only for now.
```
</details>

<details>
<summary><strong>Session 3 — Game card and live data</strong></summary>

```
The game card needs these improvements:
1. Show the cursor date's game — both regular season and postseason
2. When there's no game, show "No game." with the next scheduled game below it
3. Show "FINAL" for completed games with the final score
4. Show "LIVE" with live score for in-progress games, polling every 20 seconds
5. Show the scheduled start time (in the user's local timezone) for future games
6. Filter out spring training games
7. The card height must stay fixed — use visibility:hidden on the score block
   for no-score days, never display:none
```
</details>

<details>
<summary><strong>Session 4 — Mood meter</strong></summary>

```
Add a "Fan Feelings Meter" between the game card and the standings chart.
It should be a slim bar with a gradient from despair to euphoria, and a
needle that moves based on:
- Current win percentage (relative to .500)
- Games back in the division
- Recent form (last 10 games)
- Playoff outcome if the cursor is at end of season

Define 7 mood zones with labels. The current zone label should appear
next to the header. Keep it fun but not too cute — this is a feelings
meter for a fanbase that has suffered.
```
</details>

<details>
<summary><strong>Session 5 — Postseason panel</strong></summary>

```
Add a postseason panel that shows the [TEAM]'s playoff results when a
postseason year is selected. Show each round with individual game W/L
boxes, the opponent, and a series result badge.

Important bug to avoid: the standings chart timeline only includes
regular season dates, so the cursor can't reach playoff game dates even
though they exist in the game card data. Fix this by appending playoff
dates to the timeline with standings frozen at the regular season final
snapshot — but null out the 'last' field on those frozen entries so
they don't pollute the Last 10 streak display.
```
</details>

<details>
<summary><strong>Session 6 — Season lore</strong></summary>

```
Add a lore string for notable seasons that appears as an italic quote
below the game card. Rules:
- Specific dates and verified stats, not clever editorializing
- Format single-event entries as "Month Day: [What happened]"
- Verify all facts — wrong win totals, wrong finish positions, and wrong
  years are all real errors that have appeared in previous attempts
- Add entries for [LIST YOUR KEY SEASONS AND EVENTS]
```
</details>

<details>
<summary><strong>Session 7 — Supabase + ingestion (Option B only)</strong></summary>

```
The app currently fetches everything from the MLB Stats API on every
page load. Let's add Supabase as a caching layer.

Design:
- A single 'games' table storing one row per team per game
- Row Level Security: public reads, service-role-only writes
- An ingest.js Node script that fetches from the MLB API and upserts to Supabase
- A --current flag for nightly refresh of just the active season
- A GitHub Actions workflow that runs the refresh at 1am Pacific nightly

The publishable key can live in the HTML. The service role key goes in
GitHub Secrets only.

My Supabase project URL is: [YOUR URL]
My publishable key is: [YOUR PUBLISHABLE KEY]
```
</details>

---

## Credits

Built by [Jeremy Peronto](https://jeremyperonto.com) · Built with [Claude](https://claude.ai) · Data from [MLB](https://www.mlb.com) and [Retrosheet](https://www.retrosheet.org)

*Retrosheet data notice: The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.*
