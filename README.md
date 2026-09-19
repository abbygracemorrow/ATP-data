# Who owns the Grand Slams? Men's tennis, 2000-2026

A two-page data website about men's Grand Slam tennis, built from ATP match results.

* **Report** (`index.html`): eleven findings, each with a chart, plus an "About the data" section. A decorative globe in the header shows the four real Grand Slam venues; a stylized court diagram near the end shows how Grand Slam matches split across hard, clay, and grass courts.
* **Dashboard** (`dashboard.html`): a head-to-head comparison, a player win/loss comparison, a filter by year(s), and a set of win-rate, surface, volume, upset-rate, and tournament-spotlight visualizations driven by that filter. All calculations run in the browser.

Neither page shows or claims any player nationality or geographic origin: the source data has no such column, so none is invented.

**Live site:** <https://abbygracemorrow.github.io/ATP-data/>  
**Author:** Abby Morrow

## Where the data came from

`data/atp_matches.csv` is a thirteen-column subset of the **ATP Tennis 2000-2023 Daily Pull** data set by dissfya on Kaggle:
<https://www.kaggle.com/datasets/dissfya/atp-tennis-2000-2023daily-pull>

It has 68,635 rows (one main-draw ATP match each) from January 3, 2000 to August 29, 2026, with the columns
`Tournament, Date, Series, Court, Surface, Round, Best of, Player_1, Player_2, Winner, Rank_1, Rank_2, Score`.
`Rank_1` and `Rank_2` are the two players' ATP rankings (1 is the best; 0 or -1 means not listed). I did not change any value in this file, and every number on both pages is computed from it.

The only other file that feeds the site is `data/player_name_aliases.csv` (see below), which is not part of the match data.

**Player-name cleanup.** The same player is sometimes spelled multiple ways in the source file &mdash; trailing spaces (`"Nadal R. "`), inconsistent capitalization, punctuation (`"Herbert P.H"` vs. `"Herbert P-H."`), or a compound surname used only some of the time (`"Nadal-Parera R."` next to `"Nadal R."`). Left alone, this silently splits one player's matches across two or more entries everywhere &mdash; the player list, the leaderboard, win/loss averages, and head-to-head. `data/player_name_aliases.csv` maps every such spelling variant to one canonical form; `scripts/build_site.py` and `js/dashboard.js` both apply it when the data loads, so `data/atp_matches.csv` itself is never touched (the "changed no values" promise above is about that file specifically). Only variants I could confirm were the same real person were merged; cases where a shared surname and initial could plausibly be two different players (for example, two different Kuznetsovs, or two different Zhangs, who really are distinct ATP players) were left alone.

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
| `js/dashboard.js` | Loads the CSV in the browser, applies the year filter, and recomputes every number, chart, and table. |
| `scripts/build_site.py` | Reads the data, computes **every number in the report**, writes `data/report_data.json`, and renders `index.html` from the template. |
| `scripts/report_template.html` | The report's text with `{{placeholders}}` for numbers. Edit the wording here. |
| `data/atp_matches.csv` | The match data (see above). |
| `data/player_name_aliases.csv` | Player-name spelling variant &rarr; canonical name (see above). |
| `data/report_data.json` | Output of the build script: every figure and chart series in the report. |
| `.gitignore` | Keeps Python cache files out of the repository. |

## Dashboard guide

* **Head to head** sits first on the page, above the filter, because it's the one section the filter below doesn't touch: pick two players (a swap button flips them; the same player can't be picked twice) to see their overall record, their record against each other by surface, every match they've played against each other (newest first), and a side-by-side comparison of their career numbers (win rate, wins, losses, Grand Slam titles, win rate by surface) with whichever player is ahead on each row highlighted. It always uses every match in the dataset, deliberately ignoring the filter below it. Neither player is pre-selected; search to populate it.
* **Player win/loss averages** comes right after, also above the filter: search for a player to see average wins and average losses per season and per tournament, plus the average ATP ranking of the opponents beaten and lost to. Unlike Head to head, this one *does* use the year filter below. No player is pre-selected.
* **Filter by year(s)** is the only filter on the page: a row of chips, one per season, all selected by default. Toggle any combination on or off; the selection applies to the summary numbers and every visualization below except Head to head (always the full dataset). **Reset all filters** re-selects every year and clears the win/loss player, the head-to-head players, and the tournament spotlight.
* **Win rate by player / Win rate by year:** the top players by win rate (minimum 20 matches in the selected years), and the same top five players' win rate trend across the selected years.
* **Surface breakdown:** a donut chart of how many (and what share) of the selected matches were played on each surface (Hard, Clay, Grass, Carpet), counted straight from the CSV's `Surface` column.
* **Tournaments and matches by year:** two bar charts, distinct tournament names and match rows per selected year, showing how tour volume has changed (the 2020 dip, and the partial 2026 season, are both visible here).
* **Upset rate by ranking gap:** for every match with a listed ATP ranking on both sides, buckets by the better-ranked (favorite) player's own ranking tier -- Top 10, 11-49, or 50+ -- and shows how often that favorite lost. About 0.04% of matches are excluded for a missing ranking.
* **Tournament spotlight:** search any tournament to rank its players by win rate, wins, appearances, finals reached, or titles, computed only from matches recorded under that tournament's name in the selected years. Six tournament names (see *Known data limits*) were each used for two distinct real ATP events in some shared year; the panel flags this when it applies.
* **The numbers behind the charts:** a full sortable table of every player's matches, wins, losses, win rate, titles, finals, tournaments, best-of-five share, and average ATP ranking, for the selected years.

There is no separate "measure" or "breakdown" switch; the year filter is the only control that changes what the charts, table, and tournament spotlight show.

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

* A full Slam draw has 127 matches, but the file is missing about 4.4% of Grand Slam matches, including the 2019 US Open final. Because of that, Nadal shows 21 titles here instead of 22. **I chose to leave the source file exactly as downloaded rather than add a correction row for the missing final**, so every title count, win rate, and streak on the report, the dashboard, and in `data/atp_matches.csv` itself is "as recorded" &mdash; not adjusted for this or any other known gap. The same gap applies dataset-wide, not just at Grand Slams: across all 1,715 tournament-year editions in the file, about 1.8% have no recorded "The Final" row, so the dashboard's Tournament spotlight can undercount titles and finals reached by the same margin.
* Six tournament names &mdash; AAPT Championships, BNP Paribas, European Open, Heineken Open, Qatar Open, and TATA Open &mdash; were each used for two distinct, unrelated ATP events held weeks apart in the same year (found by checking for tournament-years with more than one recorded final). The file gives no way to tell them apart by name alone, so the dashboard's Tournament spotlight flags these six rather than silently splitting or merging them.
* No column in the file gives a player's nationality, birthplace, or any other geographic information. Neither page shows or infers one.
* Wimbledon 2020 was cancelled, and the 2026 US Open had not started when the data ends.
* The order of `Player_1` and `Player_2` carries no information (Player_1 wins 50.0% of matches).
* The `Score` column is not used, and has no way to identify a retirement or walkover (no row contains "RET" or "W/O"), so every recorded match is treated as completed.

## AI tools

The site was built with help from Claude. The data set, the questions, the findings, and every number are mine to check: run the build script and compare with the dashboard.
