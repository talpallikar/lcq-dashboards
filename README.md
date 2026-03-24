# MTGO Last Chance Results

A GitHub Pages dashboard tracking metagame data from Magic: The Gathering Online Last Chance events across Vintage, Legacy, Modern, and Standard.

**Live site:** [talpallikar.github.io/lcq-dashboards](https://talpallikar.github.io/lcq-dashboards/)

## Features

- **Overview page** with metagame breakdowns for all four formats at a glance
- **Per-format detail views** with full archetype distribution and event history
- **Expandable event cards** showing per-event meta and all 32 decklists
- **Direct links** to every decklist on [MTGGoldfish](https://www.mtggoldfish.com)
- Light/dark theme toggle
- Responsive layout

## How it works

Data is scraped from MTGGoldfish's tournament index, which provides pre-classified deck archetypes for each published decklist.

```
scrape.py          → searches MTGGoldfish for "Last Chance" events
                   → fetches each tournament page
                   → extracts placement, player, archetype, and deck URL
                   → deduplicates (MTGGoldfish sometimes double-indexes events)
                   → writes data.js

index.html + app.js + style.css → static dashboard that renders from data.js
```

A GitHub Actions workflow runs `scrape.py` every 4 hours and commits any new data. A separate workflow deploys to GitHub Pages on every push to `main`.

## Running locally

```bash
# Scrape and populate data.js
python3 scrape.py

# Preview without writing
python3 scrape.py --dry-run

# Serve locally
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000) to view the dashboard.

## File structure

```
index.html       Static dashboard page
app.js           Client-side rendering (tabs, metagame bars, event cards)
style.css        Styles with light/dark theme support
data.js          Auto-generated event data (do not edit manually)
scrape.py        MTGGoldfish scraper (stdlib only, no pip dependencies)
.github/
  workflows/
    update.yml   Cron job: scrape every 4 hours, commit if changed
    deploy.yml   Deploy to GitHub Pages on push
```
