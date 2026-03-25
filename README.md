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

This project is open source. Fork this repo and follow the guide below to build a version for any MLB team.

**[Fork this repo →](https://github.com/jeremyperonto/MarinersMeter)**

### Quick start for your team

1. **Fork** this repo
2. **Find your team's MLB ID** — `statsapi.mlb.com/api/v1/teams?sportId=1` lists all 30 teams
3. **Find your division's teams** and their IDs (see the API reference below)
4. **Create a [Supabase](https://supabase.com) project** (free tier is sufficient) and run `schema.sql` in the SQL Editor
5. **Update `index.html`** — replace team IDs, division teams, colors, lore, and team name
6. **Run the one-time backfill**: `SUPABASE_SERVICE_KEY=... node ingest.js`
7. **Push to GitHub** and enable GitHub Pages (Settings → Pages → Deploy from branch → `main`)
8. **Add `SUPABASE_SERVICE_KEY`** to GitHub Secrets (Settings → Secrets → Actions)
9. The nightly GitHub Action keeps the current season fresh automatically

---

### How it was built

This entire project was built in a series of conversations with [Claude](https://claude.ai) (Claude Sonnet, Anthropic), starting from a blank file. No boilerplate was used. The approach was iterative: build a working version, review it, give specific feedback, repeat. Total sessions: approximately 15–20 rounds of refinement.

The development pattern that worked well:
- Claude writes a complete working version first, then refines
- Feedback is specific and actionable ("the card height changes when there's no game" rather than "fix the card")
- Claude proactively audits for factual errors in historical data
- Full rewrites are preferred over patches when a round of changes is substantial enough

---

### Prompts and instructions to build your own

The following prompts replicate what was used to build Mariners Watch. Adapt the team name, division, colors, and any team-specific lore.

**Session 1 — Research and architecture**

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

**Session 2 — First build**

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

**Session 3 — Game card and live data**

```
The game card needs these improvements:
1. Show the cursor date's game — both regular season and postseason
2. When there's no game, show "No game." with the next scheduled game below it
3. Show "FINAL" for completed games with the final score
4. Show "🔴 LIVE" with live score for in-progress games, polling every 20 seconds
5. Show the scheduled start time (in the user's local timezone) for future games
6. Filter out spring training games
7. The card height must stay fixed — use visibility:hidden on the score block 
   for no-score days, never display:none
```

**Session 4 — Mood meter**

```
Add a "Fan Feelings Meter" between the game card and the standings chart.
It should be a slim bar with a gradient from despair to euphoria, and a 
needle that moves based on:
- Current win percentage (relative to .500)
- Games back in the division
- Recent form (last 10 games)
- Playoff outcome if the cursor is at end of season

Define 7 mood zones with labels and emoji. The current zone label should 
appear next to the header. Keep it fun but not too cute — this is a 
feelings meter for a fanbase that has suffered.
```

**Session 5 — Postseason panel**

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

Put the panel between the Fan Feelings Meter and the standings chart, 
not at the bottom.
```

**Session 6 — Season lore**

```
Add a lore string for notable seasons that appears as an italic quote 
below the game card. Rules:
- Specific dates and verified stats, not clever editorializing
- Format single-event entries as "Month Day: [What happened]"
- Verify all facts — wrong win totals, wrong finish positions, and wrong 
  years are all real errors that have appeared in previous attempts
- Add entries for [LIST YOUR KEY SEASONS AND EVENTS]
```

**Session 7 — Supabase + ingestion**

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

---

### MLB Stats API quick reference

All endpoints are unauthenticated and return JSON.

```
Base URL: https://statsapi.mlb.com/api/v1

Regular season schedule (one team, one year):
GET /schedule?sportId=1&season=YEAR&teamId=TEAM_ID&gameType=R

Postseason schedule:
GET /schedule?sportId=1&season=YEAR&teamId=TEAM_ID&gameType=F,D,L,W

Live linescore (in-progress games):
GET /game/{gamePk}/linescore

Game types:
  R = Regular season
  S = Spring training (exclude these)
  F = Wild Card
  D = Division Series
  L = Championship Series
  W = World Series
```

**Key MLB team IDs for AL West:**

| Team | ID | Notes |
|---|---|---|
| Seattle Mariners | 136 | |
| Athletics | 133 | `OAK` through 2023, `ATH` from 2024 |
| Los Angeles Angels | 108 | `ANA` through 2004, `LAA` from 2005 |
| Texas Rangers | 140 | |
| Houston Astros | 117 | Joined AL West in 2013 |

Other divisions follow the same pattern — find team IDs at `statsapi.mlb.com/api/v1/teams?sportId=1`.

### Caveats

- **Data only goes back to 2005.** The MLB Stats API does not reliably cover earlier seasons. For older data, you need Retrosheet (see below).
- **No authentication required** — but there is also no documented SLA or rate limit. Be polite: add a delay between batch requests (the ingestion script uses 350ms).
- **Filter out spring training.** Use `gameType=R` for regular season. Spring training games (`gameType=S`) will pollute your data if you don't exclude them.
- **The Athletics changed abbreviations** from `OAK` to `ATH` in 2024 (Las Vegas era). Handle this in your team name display logic.
- **Doubleheaders** return two games for the same date. The app shows the last game played (`.at(-1)`); you may want different handling.
- **The 2020 season** was 60 games due to COVID. No special handling is needed, but charts look different and win totals are low.

---

### Extending to pre-2005 with Retrosheet

The MLB Stats API doesn't reliably cover seasons before 2005. To go back to a team's founding year, you'll need [Retrosheet](https://www.retrosheet.org).

Retrosheet distributes free game log CSV files covering every MLB game since the 19th century. The data is available at `retrosheet.org/downloads/` in a standardized format.

**The engineering work required:**
1. Download the game log CSV files for your target years
2. Write a parser that maps Retrosheet's team abbreviations to MLB team IDs
3. Calculate cumulative win-loss records from the raw game-by-game results
4. Normalize the data into the same schema as your Supabase `games` table
5. Ingest it alongside the MLB Stats API data

This is a meaningful engineering project on its own — roughly a day of work to do properly — but it unlocks the full franchise history for any team.

**Suggested prompt when you're ready:**

```
I want to extend [TEAM WATCH] to cover [TEAM]'s full history back to 
[FOUNDING YEAR]. The MLB Stats API only reliably covers 2005+. 
Retrosheet has game log CSVs covering everything before that.

Please:
1. Research the Retrosheet game log CSV format
2. Identify the relevant team abbreviations for [TEAM] and all 
   [DIVISION] teams across the relevant era(s)
3. Write a parser that reads the CSV files and outputs rows matching 
   our existing Supabase schema
4. Handle any division realignment — [DIVISION] had different members 
   in [RELEVANT ERA]
```

---

## Credits

Built by [Jeremy Peronto](https://jeremyperonto.com) · Built with [Claude](https://claude.ai) · Data from [MLB](https://www.mlb.com) and [Retrosheet](https://www.retrosheet.org)

*Retrosheet data notice: The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.*
