#!/usr/bin/env python3
"""
Scrape MTGO Last Chance event results and write data.js for the dashboard.

MTGO publishes decklists at https://www.mtgo.com/decklists. Each event page
embeds structured JSON in: window.MTGO.decklists.data = { ... }

Usage:
  python scrape.py           # scrape and write data.js
  python scrape.py --dry-run # print what would be written
"""

import json
import re
import sys
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError

MTGO_BASE = "https://www.mtgo.com"
LISTING_URL = f"{MTGO_BASE}/decklists"

LOOKBACK_DAYS = 180
HEADERS = {"User-Agent": "MTGO-LCQ-Dashboard/1.0"}

# Formats we care about
FORMATS = {"vintage", "legacy", "modern", "standard"}

# Map MTGO internal format codes to our labels
FORMAT_CODE_MAP = {
    "CVINTAGE": "vintage",
    "CLEGACY": "legacy",
    "CMODERN": "modern",
    "CSTANDARD": "standard",
    "VINTAGE": "vintage",
    "LEGACY": "legacy",
    "MODERN": "modern",
    "STANDARD": "standard",
}


def fetch(url: str) -> str:
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


# ---------------------------------------------------------------------------
# Archetype detection — identify deck archetypes from card names
# ---------------------------------------------------------------------------

# Each entry: (archetype_name, format_or_None, set_of_signature_cards, min_matches)
# format=None means the rule applies to any format.
ARCHETYPE_RULES: list[tuple[str, str | None, set[str], int]] = [
    # -- Vintage --
    ("Dredge", "vintage", {"Bazaar of Baghdad", "Golgari Grave-Troll", "Stinkweed Imp", "Cabal Therapy", "Narcomoeba"}, 3),
    ("Jewel Shops", "vintage", {"Mishra's Workshop", "Mystic Forge", "Karn, the Great Creator", "Urza's Saga"}, 3),
    ("Shops", "vintage", {"Mishra's Workshop", "Lodestone Golem", "Trinisphere", "Sphere of Resistance", "Chalice of the Void"}, 3),
    ("Oath of Druids", "vintage", {"Oath of Druids", "Forbidden Orchard"}, 2),
    ("Doomsday", "vintage", {"Doomsday", "Thassa's Oracle"}, 2),
    ("PO Storm", "vintage", {"Paradoxical Outcome", "Tendrils of Agony"}, 2),
    ("Paradoxical Outcome", "vintage", {"Paradoxical Outcome", "Tolarian Academy", "Mox Opal"}, 2),
    ("Beseech Storm", "vintage", {"Beseech the Mirror", "Dark Petition", "Tendrils of Agony", "Necropotence"}, 2),
    ("Bazaar Aggro", "vintage", {"Bazaar of Baghdad", "Hollow One", "Vengevine"}, 2),

    # -- Legacy --
    ("Tron", "legacy", {"Urza's Tower", "Urza's Mine", "Urza's Power Plant", "Karn, the Great Creator"}, 3),
    ("Reanimator", "legacy", {"Reanimate", "Entomb", "Animate Dead", "Griselbrand"}, 2),
    ("Sneak & Show", "legacy", {"Sneak Attack", "Show and Tell", "Emrakul, the Aeons Torn", "Griselbrand"}, 2),
    ("Death & Taxes", "legacy", {"Thalia, Guardian of Thraben", "Aether Vial", "Stoneforge Mystic", "Rishadan Port", "Flickerwisp"}, 2),
    ("Lands", "legacy", {"Thespian's Stage", "Dark Depths", "Life from the Loam", "Exploration", "Maze of Ith"}, 3),
    ("Painter", "legacy", {"Painter's Servant", "Grindstone"}, 2),
    ("Elves", "legacy", {"Glimpse of Nature", "Heritage Druid", "Nettle Sentinel", "Natural Order", "Craterhoof Behemoth"}, 3),
    ("Doomsday", "legacy", {"Doomsday", "Thassa's Oracle"}, 2),
    ("Storm", "legacy", {"Dark Ritual", "Ad Nauseam", "Tendrils of Agony", "Past in Flames", "Lion's Eye Diamond"}, 3),
    ("Eldrazi", "legacy", {"Thought-Knot Seer", "Reality Smasher", "Eldrazi Temple", "Chalice of the Void"}, 3),
    ("Cephalid Breakfast", "legacy", {"Cephalid Illusionist", "Nomads en-Kor", "Shuko"}, 2),
    ("Beanstalk Control", "legacy", {"Up the Beanstalk", "Orcish Bowmasters", "Force of Will"}, 2),
    ("Mono-Red Prison", "legacy", {"Blood Moon", "Goblin Rabblemaster", "Chrome Mox", "Chalice of the Void", "Trinisphere"}, 3),
    ("8-Cast", "legacy", {"Thought Monitor", "Thoughtcast", "Urza's Saga", "Emry, Lurker of the Loch"}, 2),

    # -- Modern --
    ("Amulet Titan", "modern", {"Amulet of Vigor", "Primeval Titan", "Dryad of the Ilysian Grove"}, 2),
    ("Tron", "modern", {"Urza's Tower", "Urza's Mine", "Urza's Power Plant"}, 3),
    ("Burn", "modern", {"Goblin Guide", "Lava Spike", "Eidolon of the Great Revel", "Lightning Bolt"}, 3),
    ("Hammer Time", "modern", {"Colossus Hammer", "Sigarda's Aid", "Puresteel Paladin"}, 2),
    ("Living End", "modern", {"Living End", "Shardless Agent", "Violent Outburst"}, 2),
    ("Yawgmoth", "modern", {"Yawgmoth, Thran Physician", "Young Wolf", "Geralf's Messenger"}, 2),
    ("Mill", "modern", {"Hedron Crab", "Archive Trap", "Fractured Sanity"}, 2),
    ("Scam", "modern", {"Grief", "Not Dead After All"}, 2),
    ("Merfolk", "modern", {"Lord of Atlantis", "Master of the Pearl Trident", "Aether Vial"}, 2),
    ("Esper Blink", "modern", {"Ephemerate", "Phelia, Exuberant Shepherd", "Solitude", "Teferi, Time Raveler"}, 2),
    ("Blink", "modern", {"Ephemerate", "Flickerwisp", "Phelia, Exuberant Shepherd"}, 2),
    ("Energy", "modern", {"Galvanic Discharge", "Guide of Souls", "Amped Raptor", "Phlage, Titan of Fire's Fury"}, 2),
    ("Domain Zoo", "modern", {"Territorial Kavu", "Scion of Draco", "Leyline Binding"}, 2),
    ("Goryo's Vengeance", "modern", {"Goryo's Vengeance", "Griselbrand", "Through the Breach"}, 2),
    ("Murktide", "modern", {"Murktide Regent", "Dragon's Rage Channeler", "Counterspell"}, 2),
    ("Hardened Scales", "modern", {"Hardened Scales", "Arcbound Ravager", "Walking Ballista"}, 2),
    ("Storm", "modern", {"Baral, Chief of Compliance", "Gifts Ungiven", "Past in Flames", "Grapeshot"}, 2),
    ("Death's Shadow", "modern", {"Death's Shadow", "Thoughtseize", "Street Wraith"}, 2),
    ("Jeskai Control", "modern", {"Teferi, Time Raveler", "Prismatic Ending", "Counterspell", "Solitude"}, 3),
    ("Cascade Crash", "modern", {"Crashing Footfalls", "Shardless Agent", "Violent Outburst"}, 2),
    ("Infect", "modern", {"Glistener Elf", "Blighted Agent", "Mutagenic Growth"}, 2),

    # -- Standard --
    ("Bant Elves", "standard", {"Llanowar Elves", "Craterhoof Behemoth", "Breeding Pool"}, 2),
    ("Green Ramp", "standard", {"Llanowar Elves", "Craterhoof Behemoth"}, 2),
    ("Dimir Control", "standard", {"Go for the Throat", "Memory Deluge", "Dissipate"}, 2),
    ("Azorius Control", "standard", {"Dovin's Veto", "Teferi", "Absorb", "Supreme Verdict"}, 2),
    ("Red Deck Wins", "standard", {"Monastery Swiftspear", "Lightning Strike", "Kumano Faces Kakkazan", "Play with Fire"}, 2),
    ("Boros Convoke", "standard", {"Venerated Loxodon", "Knight-Errant of Eos", "Gleeful Demolition"}, 2),
    ("Golgari Midrange", "standard", {"Mosswood Dreadknight", "Sheoldred, the Apocalypse", "Go for the Throat"}, 2),
    ("Orzhov Midrange", "standard", {"Sheoldred, the Apocalypse", "Wedding Announcement", "Cut Down"}, 2),
    ("Esper Midrange", "standard", {"Raffine, Scheming Seer", "Obscura Interceptor", "Make Disappear"}, 2),
    ("Simic Ramp", "standard", {"Ouroboroid", "Quantum Riddler", "Mockingbird", "Breeding Pool"}, 2),
    ("Temur Ramp", "standard", {"Lumbering Worldwagon", "Stomping Ground", "Steam Vents", "Analyze the Pollen"}, 2),

    # -- Cross-format fallbacks (checked last) --
    ("Izzet Delver", None, {"Delver of Secrets", "Lightning Bolt"}, 2),
    ("Delver", None, {"Delver of Secrets"}, 1),
    ("Reanimator", None, {"Reanimate", "Animate Dead"}, 2),
    ("Control", None, {"Force of Will", "Jace, the Mind Sculptor", "Snapcaster Mage", "Counterspell"}, 3),
]


def classify_deck(card_names: set[str], fmt: str) -> str:
    """Classify a deck archetype from its card names."""
    for archetype, rule_fmt, sig_cards, min_hits in ARCHETYPE_RULES:
        if rule_fmt and rule_fmt != fmt:
            continue
        hits = len(card_names & sig_cards)
        if hits >= min_hits:
            return archetype
    return "Unknown"


# ---------------------------------------------------------------------------
# Listing page parser
# ---------------------------------------------------------------------------

def parse_events_from_listing(html: str) -> list[dict]:
    """
    Find Last Chance event links on the MTGO decklists listing page.
    Links look like: /decklist/vintage-last-chance-2026-03-2312836027
    """
    events = []
    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    seen = set()

    # Match href="/decklist/{slug}" where slug contains "last-chance" and a format
    pattern = re.compile(
        r'href="(/decklist/((?:vintage|legacy|modern|standard)-last-chance-[^"]+))"',
        re.IGNORECASE,
    )

    for match in pattern.finditer(html):
        path = match.group(1)
        slug = match.group(2).lower()

        if path in seen:
            continue
        seen.add(path)

        # Determine format from slug prefix
        fmt = slug.split("-")[0]
        if fmt not in FORMATS:
            continue

        # Extract date (YYYY-MM-DD) from slug
        date_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", slug)
        if date_match:
            event_date = datetime(
                int(date_match.group(1)),
                int(date_match.group(2)),
                int(date_match.group(3)),
            )
            if event_date < cutoff:
                continue
            date_str = event_date.strftime("%Y-%m-%d")
        else:
            date_str = None

        events.append({
            "path": path,
            "slug": slug,
            "format": fmt,
            "date": date_str,
        })

    return events


# ---------------------------------------------------------------------------
# Event detail page parser
# ---------------------------------------------------------------------------

def parse_event_detail(html: str, event: dict) -> dict | None:
    """
    Parse an event page by extracting window.MTGO.decklists.data JSON.
    The first entry in the decklists array is the winner.
    """
    # Extract the embedded JSON
    json_match = re.search(
        r"window\.MTGO\.decklists\.data\s*=\s*(\{.*?\})\s*;",
        html,
        re.DOTALL,
    )
    if not json_match:
        return None

    try:
        data = json.loads(json_match.group(1))
    except json.JSONDecodeError:
        return None

    decklists = data.get("decklists", [])
    if not decklists:
        return None

    # Resolve format from the JSON (more reliable than slug)
    fmt_code = data.get("format", "").upper()
    fmt = FORMAT_CODE_MAP.get(fmt_code, event["format"])

    # Winner is the first player listed
    winner_entry = decklists[0]
    winner = winner_entry.get("player", "Unknown")

    # Gather card names for archetype detection
    card_names = set()
    for card in winner_entry.get("main_deck", []):
        attrs = card.get("card_attributes", {})
        name = attrs.get("card_name")
        if name:
            card_names.add(name)

    deck = classify_deck(card_names, fmt)

    # Event name from description field
    event_name = data.get("description", event["slug"].replace("-", " ").title())

    # Player count = number of decklists published
    player_count = len(decklists)

    return {
        "date": event.get("date") or data.get("starttime", "")[:10],
        "format": fmt,
        "event": event_name,
        "players": player_count,
        "winner": winner,
        "deck": deck,
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_data_js(events: list[dict], path: str = "data.js"):
    """Write the data.js file that the dashboard consumes."""
    events.sort(key=lambda e: e.get("date", ""), reverse=True)

    lines = [
        "// Auto-generated by scrape.py — do not edit manually",
        f"// Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}",
        "const LCQ_DATA = " + json.dumps(events, indent=2) + ";",
    ]

    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Wrote {len(events)} events to {path}")


def load_existing(path: str = "data.js") -> list[dict]:
    """Load existing data.js entries for merge."""
    try:
        with open(path) as f:
            text = f.read()
        match = re.search(r"const LCQ_DATA = (\[.*?\]);", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"Fetching event listing from {LISTING_URL}...")
    try:
        listing_html = fetch(LISTING_URL)
    except URLError as e:
        print(f"Could not fetch listing: {e}")
        print("Keeping existing data.js unchanged.")
        return

    events_meta = parse_events_from_listing(listing_html)
    print(f"Found {len(events_meta)} Last Chance event links")

    if not events_meta:
        print("No Last Chance events found on listing page.")
        print("The MTGO site structure may have changed — check scrape.py patterns.")
        return

    results = []
    for meta in events_meta:
        url = MTGO_BASE + meta["path"]
        print(f"  Fetching {url}...")
        try:
            detail_html = fetch(url)
            result = parse_event_detail(detail_html, meta)
            if result:
                results.append(result)
                print(f"    ✓ {result['winner']} on {result['deck']}")
            else:
                print(f"    ✗ Could not parse {meta['slug']}")
        except URLError as e:
            print(f"    ✗ Error: {e}")

    if dry_run:
        print("\n--- DRY RUN ---")
        print(json.dumps(results, indent=2))
        return

    # Merge with existing data (keep manually-added or older entries)
    existing = load_existing()
    new_keys = {(e["date"], e["format"], e.get("event", "")) for e in results}
    for old in existing:
        key = (old["date"], old["format"], old.get("event", ""))
        if key not in new_keys:
            results.append(old)

    write_data_js(results)


if __name__ == "__main__":
    main()
