#!/usr/bin/env python3
"""
build_site.py  -  reproduces every number in the report from the raw data.

  python3 scripts/build_site.py

Reads   data/atp_matches.csv          (the match file; no existing value is edited, one row was hand-added)
        scripts/report_template.html  (the report text, with {{placeholders}})
Writes  data/report_data.json         (every number and chart series)
        index.html                    (the report page)
"""
import json, re, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SLAMS = {"Australian Open": "AO", "French Open": "RG", "Wimbledon": "W", "US Open": "USO"}
SLAM_NAMES = {"AO": "Australian Open", "RG": "Roland Garros", "W": "Wimbledon", "USO": "US Open"}
ROUND_ORDER = {"1st Round": 1, "2nd Round": 2, "3rd Round": 3, "4th Round": 4, "Round Robin": 4,
               "Quarterfinals": 5, "Semifinals": 6, "The Final": 7}
MIN_BO5, MIN_BO3_LEADERS, MIN_BO3_GAP = 50, 200, 100
BIG3 = ["Djokovic N.", "Nadal R.", "Federer R."]


def disp(name):
    """'Del Potro J.M.' -> 'J.M. Del Potro'"""
    parts = name.rsplit(" ", 1)
    return f"{parts[1]} {parts[0]}" if len(parts) == 2 else name


def pct(x, d=1):
    return f"{x * 100:.{d}f}%"


def oxford(items):
    """['a', 'b', 'c'] -> 'a, b, and c'   ['a', 'b'] -> 'a and b'"""
    items = list(items)
    if len(items) <= 2:
        return " and ".join(items)
    return ", ".join(items[:-1]) + ", and " + items[-1]


# ---------------------------------------------------------------- load
raw = pd.read_csv(ROOT / "data/atp_matches.csv")
df = raw.copy()

# fold Player-name spelling variants (whitespace, punctuation, hyphenation) into one identity;
# see data/player_name_aliases.csv for the variant -> canonical mapping.
aliases = pd.read_csv(ROOT / "data/player_name_aliases.csv", keep_default_na=False)
alias_map = dict(zip(aliases["variant"], aliases["canonical"]))
for col in ["Player_1", "Player_2", "Winner"]:
    df[col] = df[col].replace(alias_map)

df["Date"] = pd.to_datetime(df["Date"])
df["Year"] = df["Date"].dt.year
df["Loser"] = df["Player_2"].where(df["Winner"] == df["Player_1"], df["Player_1"])
df["Slam"] = df["Tournament"].map(SLAMS).where(df["Series"] == "Grand Slam")
gs = df[df["Series"] == "Grand Slam"].copy()
gs["ro"] = gs["Round"].map(ROUND_ORDER)
gs = gs.sort_values(["Date", "ro"]).reset_index(drop=True)
fin = gs[gs["Round"] == "The Final"].copy()
assert set(gs["Tournament"]) == set(SLAMS), "unexpected Grand Slam tournament names"

R = {}
T = {}  # text snippets used in the report template

# ---------------------------------------------------------------- meta
R["meta"] = dict(
    rows_raw=len(raw), rows_total=len(df),
    columns=raw.shape[1], first_year=int(df.Year.min()), last_year=int(df.Year.max()),
    last_date=str(df.Date.max().date()), seasons=int(df.Year.nunique()),
    players=int(pd.concat([df.Player_1, df.Player_2]).nunique()),
    tournaments=int(df.Tournament.nunique()),
    slam_matches=len(gs), slam_titles=len(fin), champions=int(fin.Winner.nunique()),
)

# ---------------------------------------------------------------- titles
piv = fin.pivot_table(index="Winner", columns="Slam", values="Year", aggfunc="count", fill_value=0)
for s in SLAM_NAMES:
    if s not in piv: piv[s] = 0
piv["total"] = piv[list(SLAM_NAMES)].sum(axis=1)
piv["n_slams"] = (piv[list(SLAM_NAMES)] > 0).sum(axis=1)
piv = piv.sort_values(["total", "n_slams"], ascending=False)
titles = []
for p, r in piv.iterrows():
    titles.append(dict(player=p, name=disp(p), total=int(r.total), n_slams=int(r.n_slams),
                       **{s: int(r[s]) for s in SLAM_NAMES}))
R["titles"] = titles
top3 = sum(t["total"] for t in titles[:3])
assert [t["player"] for t in titles[:3]] == ["Djokovic N.", "Nadal R.", "Federer R."]

# ---------------------------------------------------------------- career slam
career = []
for p, g in fin.sort_values("Date").groupby("Winner"):
    seen = set()
    for _, r in g.iterrows():
        seen.add(r.Slam)
        if len(seen) == 4:
            career.append(dict(player=p, name=disp(p), completed=str(r.Date.date()),
                               completed_year=int(r.Year), completed_at=SLAM_NAMES[r.Slam],
                               titles=int((fin.Winner == p).sum())))
            break
career.sort(key=lambda c: c["completed"])
R["career"] = career
R["slam_grid"] = [dict(t, career=t["n_slams"] == 4) for t in titles if t["n_slams"] >= 2]
missing = {}
for t in titles:
    if t["n_slams"] == 3:
        missing[t["player"]] = [SLAM_NAMES[s] for s in SLAM_NAMES if t[s] == 0][0]
R["missing_one"] = missing

# ---------------------------------------------------------------- by slam
R["by_slam"] = {}
for s in SLAM_NAMES:
    top = sorted([t for t in titles if t[s] > 0], key=lambda t: (-t[s], -t["total"]))[:6]
    R["by_slam"][s] = [dict(player=t["player"], name=disp(t["player"]), titles=t[s]) for t in top]
rg = gs[(gs.Slam == "RG") & ((gs.Winner == "Nadal R.") | (gs.Loser == "Nadal R."))]
T["nadal_rg_w"] = int((rg.Winner == "Nadal R.").sum()); T["nadal_rg_l"] = int((rg.Loser == "Nadal R.").sum())
T["nadal_rg_pct"] = pct(T["nadal_rg_w"] / len(rg))

# ---------------------------------------------------------------- champions by year + eras
cy = {}
for _, r in fin.iterrows():
    cy.setdefault(int(r.Year), {})[r.Slam] = r.Winner
R["champions_by_year"] = [dict(year=y, **{s: (dict(player=v[s], name=disp(v[s])) if s in v else None)
                                        for s in SLAM_NAMES}) for y, v in sorted(cy.items())]
periods = [("2000-04", 2000, 2004), ("2005-09", 2005, 2009), ("2010-14", 2010, 2014),
           ("2015-19", 2015, 2019), ("2020-26", 2020, 2026)]
eras = []
for lab, a, b in periods:
    f = fin[(fin.Year >= a) & (fin.Year <= b)]
    eras.append(dict(period=lab, titles=len(f), big3=int(f.Winner.isin(BIG3).sum()),
                     next_gen=int(f.Winner.isin(["Alcaraz C.", "Sinner J."]).sum()),
                     distinct=int(f.Winner.nunique())))
R["eras"] = eras
peak = eras[1:4]
T["peak_big3"] = sum(e["big3"] for e in peak); T["peak_titles"] = sum(e["titles"] for e in peak)
T["peak_pct"] = pct(T["peak_big3"] / T["peak_titles"], 0)
T["era0_big3"] = eras[0]["big3"]; T["era0_titles"] = eras[0]["titles"]; T["era0_distinct"] = eras[0]["distinct"]
T["era4_big3"] = eras[4]["big3"]; T["era4_titles"] = eras[4]["titles"]; T["era4_next"] = eras[4]["next_gen"]
T["era4_other"] = eras[4]["titles"] - eras[4]["big3"] - eras[4]["next_gen"]
T["era1_distinct"] = eras[1]["distinct"]; T["era1_big3"] = eras[1]["big3"]; T["era1_titles"] = eras[1]["titles"]

# ---------------------------------------------------------------- best of 3 vs best of 5
w = df[["Best of", "Winner"]].rename(columns={"Winner": "P"}).assign(won=1)
l = df[["Best of", "Loser"]].rename(columns={"Loser": "P"}).assign(won=0)
long = pd.concat([w, l], ignore_index=True)
b = long.groupby(["P", "Best of"])["won"].agg(["size", "sum"]).unstack(fill_value=0)
b.columns = [f"{a}{c}" for a, c in b.columns]
b = b.rename(columns={"size3": "n3", "size5": "n5", "sum3": "w3", "sum5": "w5"})
b["r3"] = b.w3 / b.n3.where(b.n3 > 0); b["r5"] = b.w5 / b.n5.where(b.n5 > 0); b["gap"] = b.r5 - b.r3
bo5_share = float((df["Best of"] == 5).mean())
bo5_slam_share = float(((df["Best of"] == 5) & (df.Series == "Grand Slam")).sum() / (df["Best of"] == 5).sum())
R["bo"] = dict(bo5_matches=int((df["Best of"] == 5).sum()), bo5_slam_share=bo5_slam_share,
               min_bo5=MIN_BO5, min_bo3=MIN_BO3_LEADERS, min_bo3_gap=MIN_BO3_GAP)


def rows(frame, keys):
    return [dict(player=p, name=disp(p), **{k: (int(r[k]) if k in ("n3", "n5", "w3", "w5") else round(float(r[k]), 4)) for k in keys})
            for p, r in frame.iterrows()]


q5 = b[b.n5 >= MIN_BO5].sort_values("r5", ascending=False)
q3 = b[b.n3 >= MIN_BO3_LEADERS].sort_values("r3", ascending=False)
R["bo5_top"] = rows(q5.head(12), ["n5", "w5", "r5", "n3", "r3"])
R["bo3_top"] = rows(q3.head(12), ["n3", "w3", "r3", "n5", "r5"])
gq = b[(b.n5 >= MIN_BO5) & (b.n3 >= MIN_BO3_GAP)].sort_values("gap", ascending=False)
R["gap_points"] = rows(gq, ["n3", "r3", "n5", "r5", "gap"])
R["gap_up"] = R["gap_points"][:8]
R["gap_down"] = list(reversed(R["gap_points"][-6:]))
T["gap_n"] = len(gq); T["gap_pos"] = int((gq.gap > 0).sum()); T["gap_neg"] = int((gq.gap < 0).sum())
T["gap_median"] = f"{gq.gap.median() * 100:+.1f}"
slam_champs = set(fin.Winner)
T["gap_up_champs"] = sum(1 for g in R["gap_up"][:7] if g["player"] in slam_champs)
T["bo5_share"] = pct(bo5_share); T["bo5_slam_share"] = pct(bo5_slam_share)
T["n_q5"] = len(q5); T["n_q3"] = len(q3)

# ---------------------------------------------------------------- streaks
streaks = []
for p in pd.unique(pd.concat([gs.Winner, gs.Loser])):
    m = gs[(gs.Winner == p) | (gs.Loser == p)]
    cur = best = 0; cs = bs = be = None
    for _, r in m.iterrows():
        if r.Winner == p:
            if cur == 0: cs = r
            cur += 1
            if cur > best: best, bs, be = cur, cs, r
        else:
            cur = 0
    if best:
        streaks.append(dict(player=p, name=disp(p), length=best, active=cur,
                            start=f"{bs.Tournament} {bs.Year}", end=f"{be.Tournament} {be.Year}"))
streaks.sort(key=lambda s: -s["length"])
R["streaks"] = streaks[:10]

# ---------------------------------------------------------------- finals
fa = pd.concat([fin.Winner, fin.Loser]).value_counts()
tw = fin.Winner.value_counts()
ft = pd.DataFrame({"finals": fa, "titles": tw}).fillna(0).astype(int)
ft["lost"] = ft.finals - ft.titles
ft = ft.sort_values(["finals", "titles"], ascending=False)
R["finals"] = [dict(player=p, name=disp(p), finals=int(r.finals), titles=int(r.titles), lost=int(r.lost),
                    conv=round(r.titles / r.finals, 4)) for p, r in ft.head(10).iterrows()]
F = {f["player"]: f for f in R["finals"]}

# ---------------------------------------------------------------- ATP rankings
# Rank_1 / Rank_2 are the two players' ATP rankings listed in the file (1 = best). A value of 0 or -1 means
# "not listed", so those matches are left out of every ranking statistic. Matches where both players share
# the same ranking have no higher-ranked player and are also left out.
rk_all = df[(df.Rank_1 > 0) & (df.Rank_2 > 0)]
rk = rk_all[rk_all.Rank_1 != rk_all.Rank_2].copy()
rk["fav_won"] = ((rk.Rank_1 < rk.Rank_2) & (rk.Winner == rk.Player_1)) | ((rk.Rank_2 < rk.Rank_1) & (rk.Winner == rk.Player_2))
rk["gap"] = (rk.Rank_1 - rk.Rank_2).abs()
rk["slam"] = rk.Series == "Grand Slam"
GAP_BINS = [(1, 9, "1\u20139 places"), (10, 24, "10\u201324 places"), (25, 49, "25\u201349 places"), (50, 99, "50\u201399 places"),
            (100, 199, "100\u2013199 places"), (200, 10**6, "200+ places")]
gap_rows = []
for lo, hi, lab in GAP_BINS:
    g = rk[(rk.gap >= lo) & (rk.gap <= hi)]
    gs_ = g[g.slam]
    gap_rows.append(dict(label=lab, n=len(g), fav_wins=int(g.fav_won.sum()), rate=round(float(g.fav_won.mean()), 4),
                         slam_rate=round(float(gs_.fav_won.mean()), 4), other_rate=round(float(g[~g.slam].fav_won.mean()), 4)))
R["rank_gap"] = gap_rows
champ_rank = fin.apply(lambda r: r.Rank_1 if r.Winner == r.Player_1 else r.Rank_2, axis=1)
champ_rank = champ_rank[champ_rank > 0]
R["rank"] = dict(matches=len(rk), excluded=len(df) - len(rk), fav_rate=round(float(rk.fav_won.mean()), 4),
                 slam_rate=round(float(rk[rk.slam].fav_won.mean()), 4), other_rate=round(float(rk[~rk.slam].fav_won.mean()), 4),
                 champ_avg=round(float(champ_rank.mean()), 1), champ_n=len(champ_rank), champ_top10=int((champ_rank <= 10).sum()))
T["rk_n"] = f"{len(rk):,}"; T["rk_excluded"] = len(df) - len(rk); T["rk_all"] = pct(R["rank"]["fav_rate"])
T["rk_slam"] = pct(R["rank"]["slam_rate"]); T["rk_other"] = pct(R["rank"]["other_rate"])
T["rk_first"] = pct(gap_rows[0]["rate"]); T["rk_last"] = pct(gap_rows[-1]["rate"])
T["rk_champ_avg"] = f"{R['rank']['champ_avg']:.1f}"; T["rk_champ_n"] = R["rank"]["champ_n"]; T["rk_champ_top10"] = R["rank"]["champ_top10"]
T["rk_champ_top10_pct"] = pct(R["rank"]["champ_top10"] / R["rank"]["champ_n"], 0)
assert all(gap_rows[i]["rate"] < gap_rows[i + 1]["rate"] for i in range(len(gap_rows) - 1)), "favorite edge should grow with the gap"
assert all(r["slam_rate"] > r["other_rate"] for r in gap_rows), "the template says the Slam edge holds at every gap size"

# a final is missing from the file when a Slam tournament has data but no "The Final" row -- the one
# instance of this (the 2019 US Open) was fixed by hand-adding that final's row (see build_site.py's
# caller docs / the report's "About the data" section), so none should remain
_fin_ed = set(zip(fin.Tournament, fin.Year)); _all_ed = set(zip(gs.Tournament, gs.Year))
missing_finals = sorted(_all_ed - _fin_ed)
assert missing_finals == [], f"every Slam edition should have a recorded final now; found missing {missing_finals}"
T["missing_finals"] = len(missing_finals)

# ---------------------------------------------------------------- surface split (Grand Slam matches only)
# Two of the four Slams share a surface (AO and USO are both Hard), so this is grouped by surface,
# not by tournament. Every Grand Slam surface value maps to exactly one or two tournaments -- verified
# below -- so no match is invented, dropped, or double-counted.
SURFACE_SLAMS = {"Hard": ["Australian Open", "US Open"], "Clay": ["French Open"], "Grass": ["Wimbledon"]}
assert set(gs["Surface"].unique()) == set(SURFACE_SLAMS), f"unexpected Grand Slam surface values: {set(gs['Surface'].unique())}"
for s, tours in SURFACE_SLAMS.items():
    assert set(gs.loc[gs.Surface == s, "Tournament"].unique()) == set(tours), f"{s} does not map 1:1 to {tours}"
surfaces = []
for s, tours in SURFACE_SLAMS.items():
    n = int((gs["Surface"] == s).sum())
    surfaces.append(dict(surface=s, matches=n, pct=round(n / len(gs), 4), tournaments=tours))
assert sum(s["matches"] for s in surfaces) == len(gs), "surface split must cover every Grand Slam match"
R["surfaces"] = surfaces
R["venues"] = [dict(slam="AO", name="Australian Open", city="Melbourne", lat=-37.82, lon=144.98),
               dict(slam="RG", name="Roland Garros", city="Paris", lat=48.85, lon=2.25),
               dict(slam="W", name="Wimbledon", city="London", lat=51.43, lon=-0.21),
               dict(slam="USO", name="US Open", city="New York", lat=40.75, lon=-73.85)]
R["slam_names"] = SLAM_NAMES
T["surf_hard_n"] = f"{surfaces[0]['matches']:,}"; T["surf_hard_pct"] = pct(surfaces[0]["pct"], 1)
T["surf_clay_n"] = f"{surfaces[1]['matches']:,}"; T["surf_clay_pct"] = pct(surfaces[1]["pct"], 1)
T["surf_grass_n"] = f"{surfaces[2]['matches']:,}"; T["surf_grass_pct"] = pct(surfaces[2]["pct"], 1)

# ---------------------------------------------------------------- template text
def nm(p): return disp(p)
T.update(
    rows_raw=f"{len(raw):,}", rows_total=f"{len(df):,}", slam_matches=f"{len(gs):,}", slam_titles=len(fin),
    champions=fin.Winner.nunique(), first_year=R["meta"]["first_year"], last_year=R["meta"]["last_year"],
    last_date=df.Date.max().strftime("%B %-d, %Y"), seasons=R["meta"]["seasons"],
    players=f"{R['meta']['players']:,}", tournaments=R["meta"]["tournaments"],
    career_n=len(career), top3_titles=top3, top3_pct=pct(top3 / len(fin), 1),
    bo5_matches=f"{R['bo']['bo5_matches']:,}",
)
T["career_names"] = oxford(c["name"] for c in career)
T["career_lastname"] = career[-1]["name"]
for i, c in enumerate(career):
    T[f"career{i}_name"] = c["name"]; T[f"career{i}_year"] = c["completed_year"]; T[f"career{i}_at"] = c["completed_at"]
    T[f"career{i}_titles"] = c["titles"]
for i, t in enumerate(titles[:6]):
    T[f"t{i}_name"] = t["name"]; T[f"t{i}_total"] = t["total"]
T["alcaraz_total"] = next(t["total"] for t in titles if t["player"] == "Alcaraz C.")
T["sinner_total"] = next(t["total"] for t in titles if t["player"] == "Sinner J.")
T["sinner_missing"] = missing.get("Sinner J."); T["wawrinka_missing"] = missing.get("Wawrinka S.")
mur = next(t for t in titles if t["player"] == "Murray A.")
T["murray_missing"] = oxford(SLAM_NAMES[s] for s in SLAM_NAMES if mur[s] == 0)
for s in SLAM_NAMES:
    lead = R["by_slam"][s][0]; T[f"lead_{s}_name"] = lead["name"]; T[f"lead_{s}_n"] = lead["titles"]
    T[f"lead_{s}_total"] = sum(1 for _, r in fin.iterrows() if r.Slam == s)
for i in range(3):
    x = R["bo5_top"][i]; T[f"b5_{i}_name"] = x["name"]; T[f"b5_{i}_r"] = pct(x["r5"]); T[f"b5_{i}_n"] = x["n5"]
    y = R["bo3_top"][i]; T[f"b3_{i}_name"] = y["name"]; T[f"b3_{i}_r"] = pct(y["r3"]); T[f"b3_{i}_n"] = y["n3"]
for i in range(4):
    g = R["gap_up"][i]; T[f"gu{i}_name"] = g["name"]; T[f"gu{i}_gap"] = f"{g['gap'] * 100:.1f}"
    T[f"gu{i}_r3"] = pct(g["r3"]); T[f"gu{i}_r5"] = pct(g["r5"])
for i in range(2):
    g = R["gap_down"][i]; T[f"gd{i}_name"] = g["name"]; T[f"gd{i}_gap"] = f"{abs(g['gap']) * 100:.1f}"
    T[f"gd{i}_r3"] = pct(g["r3"]); T[f"gd{i}_r5"] = pct(g["r5"])
dj = next(x for x in R["bo5_top"] if x["player"] == "Djokovic N."); T["dj_bo5_n"] = dj["n5"]
for i in range(3):
    s = streaks[i]; T[f"st{i}_name"] = s["name"]; T[f"st{i}_len"] = s["length"]
    T[f"st{i}_start"] = s["start"]; T[f"st{i}_end"] = s["end"]
sin = next(s for s in streaks if s["player"] == "Sinner J."); T["sinner_streak"] = sin["length"]; T["sinner_active"] = sin["active"]
for k in ["Alcaraz C.", "Murray A.", "Djokovic N.", "Nadal R.", "Federer R.", "Medvedev D."]:
    key = k.split()[0].lower()
    T[f"{key}_finals"] = F[k]["finals"]; T[f"{key}_ftitles"] = F[k]["titles"]; T[f"{key}_flost"] = F[k]["lost"]
    T[f"{key}_conv"] = pct(F[k]["conv"], 0)
T["sinner_streak_end"] = sin["end"]; T["sinner_streak_start"] = sin["start"]
alc = next(s for s in streaks if s["player"] == "Alcaraz C."); assert sin["length"] > alc["length"], "template says Sinner has the best run of the two newest champions"


# ---------------------------------------------------------------- extra text values
AUTHOR = "Abby Morrow"
T["author"] = AUTHOR
T["career_n_word"] = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}.get(len(career), str(len(career)))
T["nadal_rg_total"] = len(rg)
T["min_bo5"] = MIN_BO5; T["min_bo3"] = MIN_BO3_LEADERS; T["min_bo3_gap"] = MIN_BO3_GAP
T["b3_gap_pts"] = f"{(R['bo3_top'][0]['r3'] - R['bo3_top'][2]['r3']) * 100:.1f}"
T["gu2_gap_floor"] = int(R["gap_up"][2]["gap"] * 100)
_gc = [re.sub(r"^[A-Z.]+\s+", "", g["name"]) for g in R["gap_up"][:7] if g["player"] in slam_champs]
T["gu_champ_list"] = oxford(_gc)
editions = gs.groupby(["Tournament", "Year"]).ngroups
T["slam_editions"] = editions; T["slam_expected"] = f"{editions * 127:,}"
T["slam_missing"] = f"{editions * 127 - len(gs):,}"; T["slam_missing_pct"] = pct((editions * 127 - len(gs)) / (editions * 127))
per = gs.groupby(["Tournament", "Year"]).size(); T["slam_min_draw"] = int(per.min()); T["slam_max_draw"] = int(per.max())
T["career_sn_list"] = oxford(re.sub(r"^[A-Z.]+\s+", "", c["name"]) for c in career)
T["p1_wins"] = pct(float((df.Winner == df.Player_1).mean()))
for k in list(T):
    if k.endswith("_name") and isinstance(T[k], str):
        T[k[:-5] + "_sn"] = re.sub(r"^[A-Z.]+\s+", "", T[k])
for key in ["alcaraz", "murray", "djokovic", "nadal", "federer", "medvedev", "sinner", "wawrinka"]:
    T[f"{key}_sn"] = key.capitalize()

(ROOT / "data/report_data.json").write_text(json.dumps(dict(R, T={k: v for k, v in T.items()}), indent=1))

# ---------------------------------------------------------------- render index.html
tpl_path = ROOT / "scripts/report_template.html"
if tpl_path.exists():
    tpl = tpl_path.read_text()
    def look(m):
        key = m.group(1)
        if key == "report_json":
            return json.dumps(dict(R, T=T), separators=(",", ":")).replace("</", "<\\/")
        if key not in T: sys.exit(f"template placeholder not found: {key}")
        return str(T[key])
    (ROOT / "index.html").write_text(re.sub(r"\{\{\s*([\w]+)\s*\}\}", look, tpl))
    print("wrote index.html")
print("wrote data/report_data.json")
for k in sorted(T): print(f"  {k} = {T[k]}")
