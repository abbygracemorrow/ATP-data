#!/usr/bin/env python3
"""
crosscheck_report.py  -  independently recomputes the report's headline numbers
straight from data/atp_matches.csv and compares them to data/report_data.json.

This does NOT import build_site.py or reuse its helper functions: every figure
below is computed from scratch, using its own pandas logic, so that a bug in
build_site.py (or a report_data.json that's gone stale after an edit) shows up
as a mismatch here instead of silently agreeing with itself.

Usage:
    python3 scripts/crosscheck_report.py

Exits 0 and prints "All N headline numbers match." if everything agrees,
or exits 1 and lists every mismatch (computed value vs. report_data.json value).
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SLAMS = {"Australian Open": "AO", "French Open": "RG", "Wimbledon": "W", "US Open": "USO"}

df = pd.read_csv(ROOT / "data/atp_matches.csv")
aliases = pd.read_csv(ROOT / "data/player_name_aliases.csv", keep_default_na=False)
alias_map = dict(zip(aliases["variant"], aliases["canonical"]))
for col in ["Player_1", "Player_2", "Winner"]:
    df[col] = df[col].replace(alias_map)
df["Date"] = pd.to_datetime(df["Date"])
df["Year"] = df["Date"].dt.year
df["Loser"] = df["Player_2"].where(df["Winner"] == df["Player_1"], df["Player_1"])

report = json.loads((ROOT / "data/report_data.json").read_text())
T, R = report["T"], report

mismatches = []
checked = 0


def check(name, computed, expected, fmt=None):
    """Compare a freshly computed value to the one stored in report_data.json."""
    global checked
    checked += 1
    shown_computed = fmt(computed) if fmt else computed
    ok = (str(shown_computed) == str(expected)) if fmt else (shown_computed == expected)
    if not ok:
        mismatches.append((name, shown_computed, expected))


def pct(x, d=1):
    return f"{x * 100:.{d}f}%"


# ---------------------------------------------------------------- totals
check("rows_total", len(df), T["rows_total"], fmt=lambda v: f"{v:,}")
gs = df[df["Series"] == "Grand Slam"]
check("slam_matches", len(gs), T["slam_matches"], fmt=lambda v: f"{v:,}")
fin = gs[gs["Round"] == "The Final"]
check("slam_titles", len(fin), T["slam_titles"])
check("champions", fin["Winner"].nunique(), T["champions"])
check("players", pd.concat([df.Player_1, df.Player_2]).nunique(), T["players"], fmt=lambda v: f"{v:,}")
check("tournaments", df["Tournament"].nunique(), T["tournaments"])
check("seasons", df["Year"].nunique(), T["seasons"])
check("first_year", int(df["Year"].min()), T["first_year"])
check("last_year", int(df["Year"].max()), T["last_year"])

# ---------------------------------------------------------------- titles per player (full audit, not just top 6)
title_counts = fin["Winner"].value_counts()
report_titles = {t["player"]: t["total"] for t in R["titles"]}
for player, n in title_counts.items():
    check(f"titles[{player}]", int(n), report_titles.get(player), fmt=lambda v: v)
# any player report_data.json credits with titles that the raw data doesn't back up
for player, n in report_titles.items():
    if player not in title_counts.index and n:
        mismatches.append((f"titles[{player}] (report has, data doesn't)", 0, n))
        checked += 1

top3 = title_counts.reindex(["Djokovic N.", "Nadal R.", "Federer R."]).sum()
check("top3_titles", int(top3), T["top3_titles"])
check("top3_pct", float(top3) / len(fin), T["top3_pct"], fmt=lambda v: pct(v, 1))

# ---------------------------------------------------------------- career grand slam
slam_of = {t: SLAMS[t] for t in SLAMS}
fin = fin.copy(); fin["Slam"] = fin["Tournament"].map(slam_of)
career_players = set()
for p, g in fin.sort_values("Date").groupby("Winner"):
    if g["Slam"].nunique() == 4:
        career_players.add(p)
check("career_n", len(career_players), T["career_n"])

# ---------------------------------------------------------------- best of 3 / 5
bo5 = df[df["Best of"] == 5]
check("bo5_matches", len(bo5), T["bo5_matches"], fmt=lambda v: f"{v:,}")
check("bo5_share", len(bo5) / len(df), T["bo5_share"], fmt=lambda v: pct(v))
check("bo5_slam_share", (bo5["Series"] == "Grand Slam").sum() / len(bo5), T["bo5_slam_share"], fmt=lambda v: pct(v))

w5 = bo5["Winner"].value_counts()
n5 = pd.concat([bo5["Player_1"], bo5["Player_2"]]).value_counts()
r5 = (w5 / n5).dropna()
for row in R["bo5_top"]:
    p = row["player"]
    if p in n5.index:
        check(f"bo5_top[{p}].n5", int(n5[p]), row["n5"])
        check(f"bo5_top[{p}].w5", int(w5.get(p, 0)), row["w5"])
        check(f"bo5_top[{p}].r5", round(float(r5.get(p, 0)), 4), row["r5"])

# ---------------------------------------------------------------- Nadal at Roland Garros
rg = gs[(gs["Tournament"] == "French Open") & ((gs["Winner"] == "Nadal R.") | (gs["Loser"] == "Nadal R."))]
check("nadal_rg_w", int((rg["Winner"] == "Nadal R.").sum()), T["nadal_rg_w"])
check("nadal_rg_l", int((rg["Loser"] == "Nadal R.").sum()), T["nadal_rg_l"])

# ---------------------------------------------------------------- ATP rankings
rk_all = df[(df["Rank_1"] > 0) & (df["Rank_2"] > 0)]
rk = rk_all[rk_all["Rank_1"] != rk_all["Rank_2"]].copy()
rk["fav_won"] = ((rk["Rank_1"] < rk["Rank_2"]) & (rk["Winner"] == rk["Player_1"])) | \
                ((rk["Rank_2"] < rk["Rank_1"]) & (rk["Winner"] == rk["Player_2"]))
rk["slam"] = rk["Series"] == "Grand Slam"
check("rk_excluded", len(df) - len(rk), T["rk_excluded"])
check("rk_all", float(rk["fav_won"].mean()), T["rk_all"], fmt=lambda v: pct(round(v, 4)))
check("rk_slam", float(rk[rk["slam"]]["fav_won"].mean()), T["rk_slam"], fmt=lambda v: pct(round(v, 4)))
check("rk_other", float(rk[~rk["slam"]]["fav_won"].mean()), T["rk_other"], fmt=lambda v: pct(round(v, 4)))

champ_rank = fin.apply(lambda r: r["Rank_1"] if r["Winner"] == r["Player_1"] else r["Rank_2"], axis=1)
champ_rank = champ_rank[champ_rank > 0]
check("rk_champ_avg", round(float(champ_rank.mean()), 1), T["rk_champ_avg"], fmt=lambda v: f"{v:.1f}")
check("rk_champ_n", len(champ_rank), T["rk_champ_n"])
check("rk_champ_top10", int((champ_rank <= 10).sum()), T["rk_champ_top10"])

# ---------------------------------------------------------------- Player_1/Player_2 order
check("p1_wins", float((df["Winner"] == df["Player_1"]).mean()), T["p1_wins"], fmt=lambda v: pct(v))

# ---------------------------------------------------------------- missing Grand Slam finals
editions = gs.groupby(["Tournament", "Year"]).ngroups
check("slam_editions", editions, T["slam_editions"])
fin_editions = set(zip(fin["Tournament"], fin["Year"]))
all_editions = set(zip(gs["Tournament"], gs["Year"]))
check("missing_finals", len(all_editions - fin_editions), T["missing_finals"])

# ---------------------------------------------------------------- finals conversion for the players the report calls out
fa = pd.concat([fin["Winner"], fin["Loser"]]).value_counts()
tw = fin["Winner"].value_counts()
for full, key in [("Alcaraz C.", "alcaraz"), ("Murray A.", "murray"), ("Djokovic N.", "djokovic"),
                   ("Nadal R.", "nadal"), ("Federer R.", "federer"), ("Medvedev D.", "medvedev")]:
    finals_n = int(fa.get(full, 0)); titles_n = int(tw.get(full, 0))
    check(f"{key}_finals", finals_n, T[f"{key}_finals"])
    check(f"{key}_ftitles", titles_n, T[f"{key}_ftitles"])
    check(f"{key}_flost", finals_n - titles_n, T[f"{key}_flost"])
    if finals_n:
        check(f"{key}_conv", titles_n / finals_n, T[f"{key}_conv"], fmt=lambda v: pct(v, 0))

# ---------------------------------------------------------------- champion countries (globe totals)
cc = pd.read_csv(ROOT / "data/champion_countries.csv")
country_of = dict(zip(cc["Winner"], cc["Country"]))
fin["Country"] = fin["Winner"].map(country_of)
country_titles = fin["Country"].value_counts()
for i, c in enumerate(R["countries"][:4]):
    check(f"c{i}_name", c["country"], T[f"c{i}_name"])
    check(f"c{i}_n", int(country_titles.get(c["country"], 0)), T[f"c{i}_n"])

# ---------------------------------------------------------------- longest Grand Slam win streaks (top 3)
def longest_streak(player):
    m = gs[(gs["Winner"] == player) | (gs["Loser"] == player)].sort_values(["Date"])
    cur = best = 0
    for _, r in m.iterrows():
        if r["Winner"] == player:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


for i, s in enumerate(R["streaks"][:3]):
    check(f"st{i}_len ({s['player']})", longest_streak(s["player"]), s["length"])

# ---------------------------------------------------------------- report
print(f"Checked {checked} headline numbers against data/report_data.json.\n")
if mismatches:
    print(f"{len(mismatches)} MISMATCH(ES):\n")
    for name, computed, expected in mismatches:
        print(f"  {name}: recomputed from data/atp_matches.csv = {computed!r}, report_data.json = {expected!r}")
    sys.exit(1)
else:
    print(f"All {checked} headline numbers match. report_data.json is consistent with data/atp_matches.csv.")
