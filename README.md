# Who owns the Grand Slams? Men's tennis, 2000-2026

A two-page data website about men's Grand Slam tennis, built from ATP match results.

* **Report** (`index.html`): eleven findings, each with a chart, plus an "About the data" section. A decorative globe in the header shows the four real Grand Slam venues; a stylized court diagram near the end shows how Grand Slam matches split across hard, clay, and grass courts.
* **Dashboard** (`dashboard.html`): a head-to-head comparison, a player win/loss comparison, global filters by year, player, tournament, surface, and tier, a measure and break-down-by switch, and a set of win-rate, surface, upset-rate, and tournament-spotlight visualizations driven by those filters. All calculations run in the browser.

Neither page shows or claims any player nationality or geographic origin: the source data has no such column, so none is invented.

**Live site:** <https://abbygracemorrow.github.io/ATP-data/>  
**Author:** Abby Morrow

## Where the data came from

`data/atp_matches.csv` is a thirteen-column subset of the **ATP Tennis 2000-2023 Daily Pull** data set by dissfya on Kaggle:
<https://www.kaggle.com/datasets/dissfya/atp-tennis-2000-2023daily-pull>. The uploader refreshes that dataset daily, which is why this copy runs past the "2023" in its name.

It has 68,637 rows (one main-draw ATP match each) from January 3, 2000 to September 13, 2026, with the columns
`Tournament, Date, Series, Court, Surface, Round, Best of, Player_1, Player_2, Winner, Rank_1, Rank_2, Score`.
`Rank_1` and `Rank_2` are the two players' ATP rankings (1 is the best; 0 or -1 means not listed). I did not change any existing value in this file. The two exceptions are hand-added rows, cited under *Known data limits* below.

The only other file that feeds the site is `data/player_name_aliases.csv` (see below), which is not part of the match data.

**Player-name cleanup.** The same player is sometimes spelled multiple ways in the source file &mdash; trailing spaces (`"Nadal R. "`), inconsistent capitalization, punctuation (`"Herbert P.H"` vs. `"Herbert P-H."`), or a compound surname used only some of the time (`"Nadal-Parera R."` next to `"Nadal R."`). Left alone, this silently splits one player's matches across two or more entries everywhere &mdash; the player list, the leaderboard, win/loss averages, and head-to-head. `data/player_name_aliases.csv` maps every such spelling variant to one canonical form; `scripts/build_site.py` and `js/dashboard.js` both apply it when the data loads, so `data/atp_matches.csv` itself is never touched by the alias mapping (the "no existing value changed" promise above is about that file specifically; it's a separate thing from the two hand-added rows noted under *Known data limits*). Only variants I could confirm were the same real person were merged; cases where a shared surname and initial could plausibly be two different players (for example, two different Kuznetsovs, or two different Zhangs, who really are distinct ATP players) were left alone.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The report page. **Generated** by `scripts/build_site.py`, so do not edit it by hand. |
| `dashboard.html` | The dashboard page (hand written). |
| `css/style.css` | One stylesheet and color palette shared by both pages. |
| `js/charts.js` | Small SVG chart toolkit (bar, lollipop, paired bar, line, scatter, heat map, stacked bar, and checklist grid). No libraries. |
| `js/globe.js` | Dot-matrix globe drawn on a canvas. Used only for the report page's decorative header globe (the four Grand Slam venues, nothing player-related); the dashboard has no globe. |
| `js/land.js` | Hand-drawn coarse world outline used only to place the header globe's dots (works offline). |
| `js/report.js` | Draws the report's charts (and the surface-split court diagram) from the JSON embedded in `index.html`. |
| `js/dashboard.js` | Loads the CSV in the browser, applies the global filters (year, player, tournament, surface, tier), and recomputes every number, chart, and table. |
| `scripts/build_site.py` | Reads the data, computes **every number in the report**, writes `data/report_data.json`, and renders `index.html` from the template. |
| `scripts/report_template.html` | The report's text with `{{placeholders}}` for numbers. Edit the wording here. |
| `data/atp_matches.csv` | The match data (see above). |
| `data/player_name_aliases.csv` | Player-name spelling variant &rarr; canonical name (see above). |
| `data/report_data.json` | Output of the build script: every figure and chart series in the report. |
| `.gitignore` | Keeps Python cache files out of the repository. |

## Dashboard guide

* **Head to head** sits first on the page, above the filter, because it's the one section the filter below doesn't touch: pick two players (a swap button flips them; the same player can't be picked twice) to see their overall record, their record against each other by surface, every match they've played against each other (newest first), and a side-by-side comparison of their career numbers (win rate, wins, losses, Grand Slam titles, win rate by surface) with whichever player is ahead on each row highlighted. It always uses every match in the dataset, deliberately ignoring the filter below it. Neither player is pre-selected; search to populate it.
* **Player win/loss averages** comes right after, also above the filter: search for a player to see average wins and average losses per season and per tournament, plus the average ATP ranking of the opponents beaten and lost to. Unlike Head to head, this one *does* use the year filter below. No player is pre-selected.
* **Global filters** narrow everything below by five variables: **Year (from–to)**, **Player** (type to search; keeps only matches that player won or lost), **Tournament** (type to search), **Surface**, and **Tier** (event level). All five combine (AND), and all apply to the summary numbers, both charts, the table, the surface/upset/spotlight cards, and Win/Loss averages -- except Head to head, which always uses the full dataset regardless of these filters. **Reset all filters** clears all five (which also clears the tournament spotlight, since it has no filter of its own) plus the win/loss player and the head-to-head players.
* **Summary numbers:** matches in the current view, distinct players, distinct tournaments, and the average ATP ranking of both players across those matches -- all four update live with the filters above.
* **Measure** and **Break down by** are a pair of switches (not filters -- they don't narrow the data, they change how it's displayed): Measure picks the statistic (matches, wins, win rate, titles, finals, distinct players, distinct tournaments, best-of-five share, or average ATP ranking); Break down by picks what groups the bars, line series, and table rows into (year, tier, surface, court, round, best-of, tournament, or player). Together they drive the bar chart, the line-over-years chart, and the table below.
* **Surface breakdown:** a donut chart of how many (and what share) of the currently filtered matches were played on each surface (Hard, Clay, Grass, Carpet), counted straight from the CSV's `Surface` column.
* **Upset rate by ranking gap:** for every filtered match with a listed ATP ranking on both sides, buckets by the better-ranked (favorite) player's own ranking tier -- Top 10, 11-49, or 50+ -- and shows how often that favorite lost. About 0.04% of matches are excluded for a missing ranking.
* **Tournament spotlight:** pick a tournament in the global **Tournament** filter to rank its players by win rate (minimum 5 matches there), computed only from matches that pass every global filter above &mdash; there's no separate search box here, so the global filters are the only thing narrowing this card. Six tournament names (see *Known data limits*) were each used for two distinct real ATP events in some shared year; the panel flags this when it applies.
* **The numbers behind the charts:** a full sortable table, one row per group under the current Break-down-by choice, with matches, wins/losses or players/tournaments, win rate, titles, finals, best-of-five share, and average ATP ranking, for the current filters.

## Reproducing the report numbers

```bash
pip install pandas
python3 scripts/build_site.py      # rewrites data/report_data.json and index.html
```

Set the author name with `AUTHOR` near the bottom of `scripts/build_site.py`, then run the script again.

To view the site locally (the dashboard needs a web server because it loads the CSV):

```bash
python3 -m http.server 8000        # then open http://localhost:8000
```

## Publishing with GitHub Pages

Repository settings > Pages > "Deploy from a branch" > branch `main`, folder `/ (root)`.

## Definitions (also in the report's data section)

* **Grand Slam match:** `Series` = "Grand Slam" (Australian Open, French Open or Roland Garros, Wimbledon, and US Open).
* **Title:** the winner of a Grand Slam row whose `Round` is "The Final".
* **Career Grand Slam:** at least one title at each of the four Slams.
* **Win rate:** wins divided by matches played. **Conversion rate:** titles divided by finals played.
* **Streak:** consecutive Grand Slam match wins in date order; a loss resets it.
* **Higher-ranked player:** the player with the smaller ranking number. **Ranking gap:** the difference between the two ranking numbers. Matches with an unlisted ranking, or with equal rankings, are left out of the ranking statistics.
* **Average ATP ranking:** the sum of the listed rankings divided by how many are listed (lower is better).
* **Average wins (or losses) per season:** total wins (or losses) divided by the number of seasons with at least one match in the current view. **Per tournament:** divided by the number of tournament entries (one tournament in one year counts once) &mdash; not the same thing as the dashboard's "different tournaments" count, which counts each tournament name only once no matter how many years it appears.
* **Tier (dashboard):** `Series` names changed in 2009, so International = ATP 250, International Gold = ATP 500, Masters = Masters 1000, and Masters Cup = Tour Finals.

## Known data limits

* A full Slam draw has 127 matches, and the file is still missing some Grand Slam matches &mdash; almost all scattered early-round gaps, plus one edition (the 2026 US Open, below) that stops after its final &mdash; so every title count, win rate, and streak on the report and the dashboard is "as recorded" &mdash; not adjusted for that remaining gap. Dataset-wide, not just at Grand Slams: across all 1,715 tournament-year editions in the file, about 1.8% have no recorded "The Final" row, so the dashboard's Tournament spotlight can undercount titles and finals reached by the same margin.
* Two matches were missing outright, not just uncounted, so **I added both by hand**, sourced from the official ATP Tour match record, rather than leave a Grand Slam final unrecorded: the 2019 US Open final (Nadal d. Medvedev, 7&ndash;5, 6&ndash;3, 5&ndash;7, 4&ndash;6, 6&ndash;4) and the 2026 US Open final (Zverev d. Shelton, 6&ndash;3, 7&ndash;6, 5&ndash;7, 6&ndash;2). Those two rows are the only ones in `data/atp_matches.csv` that didn't come from the Kaggle download; every other number on both pages still comes only from that download.
* Six tournament names &mdash; AAPT Championships, BNP Paribas, European Open, Heineken Open, Qatar Open, and TATA Open &mdash; were each used for two distinct, unrelated ATP events held weeks apart in the same year (found by checking for tournament-years with more than one recorded final). The file gives no way to tell them apart by name alone, so the dashboard's Tournament spotlight flags these six rather than silently splitting or merging them.
* No column in the file gives a player's nationality, birthplace, or any other geographic information. Neither page shows or infers one.
* Wimbledon 2020 was cancelled. This copy of the Kaggle "Daily Pull" dataset was pulled on August 29, 2026, before the rest of the 2026 US Open was played &mdash; only its final (added by hand, above) is recorded here.
* The order of `Player_1` and `Player_2` carries no information (Player_1 wins 50.0% of matches).
* The `Score` column is not used, and has no way to identify a retirement or walkover (no row contains "RET" or "W/O"), so every recorded match is treated as completed.

## AI tools

The site was built with help from Claude. The data set, the questions, the findings, and every number are mine to check: run the build script and compare with the dashboard.
