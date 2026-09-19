# Who owns the Grand Slams? Men's tennis, 2000-2026

A two-page data website about men's Grand Slam tennis, built from ATP match results.

* **Report** (`index.html`): eleven findings, each with a chart, plus a globe and an "About the data" section.
* **Dashboard** (`dashboard.html`): filters, summary numbers, a player win/loss comparison, four charts with measure and breakdown switches, a globe, a player leaderboard, and a table. All calculations run in the browser.

**Live site:** <https://abbygracemorrow.github.io/ATP-data/>  
**Author:** Abby Morrow

## Where the data came from

`data/atp_matches.csv` is a thirteen-column subset of the **ATP Tennis 2000-2023 Daily Pull** data set by dissfya on Kaggle:
<https://www.kaggle.com/datasets/dissfya/atp-tennis-2000-2023daily-pull>

It has 68,635 rows (one main-draw ATP match each) from January 3, 2000 to August 29, 2026, with the columns
`Tournament, Date, Series, Court, Surface, Round, Best of, Player_1, Player_2, Winner, Rank_1, Rank_2, Score`.
`Rank_1` and `Rank_2` are the two players' ATP rankings (1 is the best; 0 or -1 means not listed). I did not change any value in this file, and every number on both pages is computed from it.

The only other file that feeds the site is `data/champion_countries.csv`, a small table typed by hand that says which country each Grand Slam champion is from. It is used only to place champions on the globes and is not part of the match data.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The report page. **Generated** by `scripts/build_site.py`, so do not edit it by hand. |
| `dashboard.html` | The dashboard page (hand written). |
| `css/style.css` | One stylesheet and color palette shared by both pages. |
| `js/charts.js` | Small SVG chart toolkit (bar, lollipop, paired bar, line, scatter, heat map, stacked bar, and checklist grid). No libraries. |
| `js/globe.js` | Dot-matrix globe drawn on a canvas, with arcs from champion countries to Slam venues. |
| `js/land.js` | Hand-drawn coarse world outline used only to place the globe's dots (works offline). |
| `js/report.js` | Draws the report's charts from the JSON embedded in `index.html`. |
| `js/dashboard.js` | Loads the CSV in the browser, applies filters, and recomputes the numbers, charts, win/loss panel, leaderboard, and table. |
| `scripts/build_site.py` | Reads the data, computes **every number in the report**, writes `data/report_data.json`, and renders `index.html` from the template. |
| `scripts/report_template.html` | The report's text with `{{placeholders}}` for numbers. Edit the wording here. |
| `data/atp_matches.csv` | The match data (see above). |
| `data/champion_countries.csv` | Champion-to-country table for the globes (see above). |
| `data/report_data.json` | Output of the build script: every figure and chart series in the report. |
| `.gitignore` | Keeps Python cache files out of the repository. |

## Dashboard guide

* **Always visible:** Year (from and to), Player, and Tournament. **Additional Filters** opens Tier, Surface, Court, Round, and Best of. A badge on the button shows how many of those are set. **Reset all filters** clears everything, including the win/loss player and the leaderboard settings.
* **Player win/loss averages:** search for a player to see average wins and average losses per season and per tournament, plus the average ATP ranking of the opponents beaten and lost to. It uses every filter except Player. Picking a player in the top filter fills it in automatically.
* **Player leaderboard:** ranks players by total wins, win rate, titles, matches played, or average ATP ranking, using the current filters (the Player filter is ignored so everyone can be ranked, and the selected player is highlighted). Players with equal values share a rank.
* **Charts and table:** the **Measure** switch includes matches, wins, win rate, titles, finals, distinct players, distinct tournaments, best-of-five share, and average ATP ranking. The **Break down by** switch changes the grouping.

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

* A full Slam draw has 127 matches, but the file is missing about 4.4% of Grand Slam matches, including the 2019 US Open final. Because of that, Nadal shows 21 titles here instead of 22. **I chose to leave the source file exactly as downloaded rather than add a correction row for the missing final**, so every title count, win rate, and streak on the report, the dashboard, and in `data/atp_matches.csv` itself is "as recorded" &mdash; not adjusted for this or any other known gap.
* Wimbledon 2020 was cancelled, and the 2026 US Open had not started when the data ends.
* The order of `Player_1` and `Player_2` carries no information (Player_1 wins 50.0% of matches).
* The `Score` column is not used.

## AI tools

The site was built with help from Claude. The data set, the questions, the findings, and every number are mine to check: run the build script and compare with the dashboard.
