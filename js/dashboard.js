/* dashboard.js - loads data/atp_matches.csv in the browser, filters it, and recomputes every number,
   chart, leaderboard and table row on each change. No server-side code. */
(function () {
  'use strict';
  const { C, SLAM_COLOR } = Charts, $ = id => document.getElementById(id), int = Charts.int;
  const MIN_RATE = 20;                       // whole groups need this many matches before a rate is shown
  const MIN_CELL = 5;                        // points on the line chart / cells of the heat map need this many
  const TIERS = ['Grand Slam', 'Masters 1000', 'ATP 500', 'ATP 250', 'Tour Finals'];
  const TIER_OF = { 'Grand Slam': 0, 'Masters 1000': 1, 'Masters': 1, 'ATP500': 2, 'International Gold': 2, 'ATP250': 3, 'International': 3, 'Masters Cup': 4 };
  const ROUNDS = ['Round Robin', '1st Round', '2nd Round', '3rd Round', '4th Round', 'Quarterfinals', 'Semifinals', 'The Final'];
  const SLAM_KEY = { 'Australian Open': 'AO', 'French Open': 'RG', 'Wimbledon': 'W', 'US Open': 'USO' };
  const SLAM_NAMES = { AO: 'Australian Open', RG: 'Roland Garros', W: 'Wimbledon', USO: 'US Open' };
  const VENUES = [{ slam: 'AO', name: 'Australian Open', city: 'Melbourne', lat: -37.82, lon: 144.98 }, { slam: 'RG', name: 'Roland Garros', city: 'Paris', lat: 48.85, lon: 2.25 },
    { slam: 'W', name: 'Wimbledon', city: 'London', lat: 51.43, lon: -0.21 }, { slam: 'USO', name: 'US Open', city: 'New York', lat: 40.75, lon: -73.85 }];
  const disp = n => n.replace(/^(.*) ([A-Z.]+)$/, '$2 $1');

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const lines = text.split(/\r?\n/), head = lines[0].split(','), out = [];
    for (let k = 1; k < lines.length; k++) {
      const ln = lines[k]; if (!ln) continue;
      let f;
      if (ln.indexOf('"') < 0) f = ln.split(',');
      else { f = []; let cur = '', q = false; for (let i = 0; i < ln.length; i++) { const ch = ln[i];
        if (q) { if (ch === '"') { if (ln[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { f.push(cur); cur = ''; } else cur += ch; } f.push(cur); }
      out.push(f);
    }
    return { head, rows: out };
  }
  async function getText(url, optional) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.text(); }
    catch (e) { if (optional) return null; throw new Error(`Could not load ${url}. If you opened this file directly from disk, serve the folder instead (python3 -m http.server) or use the GitHub Pages address.`); }
  }

  /* ---------- data (column arrays) ---------- */
  let N, year, tour, tier, court, surf, round, bo, win, los, rw, rl, series, tourNames = [], courtNames = [], surfNames = [], plNames = [], plDisp = [], plIndex = new Map(), plMatches;
  let Y0, Y1, NY, FINAL, GS = 0, countryOf = new Map(), countryPos = new Map();

  function build(main) {
    const rows = main.rows; N = rows.length;
    const h = {}; main.head.forEach((c, i) => h[c] = i);
    year = new Uint16Array(N); tour = new Uint16Array(N); tier = new Uint8Array(N); court = new Uint8Array(N); surf = new Uint8Array(N); round = new Uint8Array(N);
    bo = new Uint8Array(N); win = new Uint16Array(N); los = new Uint16Array(N); series = new Uint8Array(N);
    rw = new Uint16Array(N); rl = new Uint16Array(N);   // ATP ranking of the winner and of the loser (0 = not listed)
    const tMap = new Map(), cMap = new Map(), sMap = new Map(), pMap = new Map(), rMap = new Map(ROUNDS.map((r, i) => [r, i]));
    const id = (m, arr, v) => { let k = m.get(v); if (k === undefined) { k = arr.length; arr.push(v); m.set(v, k); } return k; };
    for (let i = 0; i < N; i++) {
      const r = rows[i];
      year[i] = +r[h.Date].slice(0, 4); tour[i] = id(tMap, tourNames, r[h.Tournament]); tier[i] = TIER_OF[r[h.Series]] ?? 3;
      court[i] = id(cMap, courtNames, r[h.Court]); surf[i] = id(sMap, surfNames, r[h.Surface]);
      let rk = rMap.get(r[h.Round]); if (rk === undefined) { rk = ROUNDS.length; ROUNDS.push(r[h.Round]); rMap.set(r[h.Round], rk); } round[i] = rk;
      bo[i] = +r[h['Best of']]; const p1 = id(pMap, plNames, r[h.Player_1]), p2 = id(pMap, plNames, r[h.Player_2]);
      win[i] = r[h.Winner] === r[h.Player_1] ? p1 : p2; los[i] = win[i] === p1 ? p2 : p1; series[i] = r[h.Series] === 'Grand Slam' ? 1 : 0;
      const k1 = +r[h.Rank_1], k2 = +r[h.Rank_2], a1 = k1 > 0 ? k1 : 0, a2 = k2 > 0 ? k2 : 0;   // 0 or -1 in the file means not listed
      if (win[i] === p1) { rw[i] = a1; rl[i] = a2; } else { rw[i] = a2; rl[i] = a1; }
    }
    Y0 = Math.min(...year); Y1 = Math.max(...year); NY = Y1 - Y0 + 1; FINAL = ROUNDS.indexOf('The Final');
    plDisp = plNames.map(disp); plDisp.forEach((d, i) => plIndex.set(d, i));
    plMatches = new Uint32Array(plNames.length); for (let i = 0; i < N; i++) { plMatches[win[i]]++; plMatches[los[i]]++; }
  }

  /* ---------- filters ---------- */
  const DEF = () => ({ from: Y0, to: Y1, player: -1, tour: -1, tier: -1, surf: -1, court: -1, round: -1, bo: -1 });
  let F, measure = 'matches', dimKey = 'tier', sortSpec = null, showAll = false;
  const tourIndex = new Map();

  function select(pl = F.player) {
    const out = [];
    for (let i = 0; i < N; i++) {
      const y = year[i]; if (y < F.from || y > F.to) continue;
      if (F.tier >= 0 && tier[i] !== F.tier) continue; if (F.tour >= 0 && tour[i] !== F.tour) continue;
      if (F.surf >= 0 && surf[i] !== F.surf) continue; if (F.court >= 0 && court[i] !== F.court) continue;
      if (F.round >= 0 && round[i] !== F.round) continue; if (F.bo >= 0 && bo[i] !== F.bo) continue;
      if (pl >= 0 && win[i] !== pl && los[i] !== pl) continue;
      out.push(i);
    }
    return out;
  }

  /* ---------- dimensions and measures ---------- */
  const period = y => (y < 2005 ? 0 : y < 2010 ? 1 : y < 2015 ? 2 : y < 2020 ? 3 : 4), PERIODS = ['2000-04', '2005-09', '2010-14', '2015-19', '2020-26'];
  const DIMS = {
    year: { label: 'Year', n: () => NY, name: k => String(Y0 + k), key: i => year[i] - Y0, natural: true, vertical: true },
    tier: { label: 'Tier', n: () => TIERS.length, name: k => TIERS[k], key: i => tier[i], natural: true },
    surface: { label: 'Surface', n: () => surfNames.length, name: k => surfNames[k], key: i => surf[i] },
    court: { label: 'Court', n: () => courtNames.length, name: k => courtNames[k], key: i => court[i] },
    round: { label: 'Round', n: () => ROUNDS.length, name: k => ROUNDS[k], key: i => round[i], natural: true },
    bo: { label: 'Best of', n: () => 2, name: k => (k ? 'Best of 5' : 'Best of 3'), key: i => (bo[i] === 5 ? 1 : 0), natural: true },
    tournament: { label: 'Tournament', n: () => tourNames.length, name: k => tourNames[k], key: i => tour[i] },
    player: { label: 'Player', n: () => plNames.length, name: k => plDisp[k], key: null, player: true }
  };
  const perspective = () => (F.player >= 0 || dimKey === 'player' ? 'player' : 'match');
  const MEAS = {
    matches: { label: () => 'Matches', get: (A, g) => A.n[g], fmt: int, p: 'mp' },
    wins: { label: () => 'Wins', get: (A, g) => A.w[g], fmt: int, p: 'p' },
    winrate: { label: () => 'Win rate', get: (A, g) => (A.n[g] ? A.w[g] / A.n[g] : null), fmt: v => (v * 100).toFixed(1) + '%', p: 'p', rate: true, pct: true },
    titles: { label: () => 'Titles won (finals won)', get: (A, g) => A.tit[g], fmt: int, p: 'p' },
    finals: { label: ps => (ps === 'p' ? 'Finals reached' : 'Finals played (titles awarded)'), get: (A, g) => A.fin[g], fmt: int, p: 'mp' },
    players: { label: () => 'Distinct players', get: (A, g) => A.pl[g], fmt: int, p: 'm' },
    tourns: { label: () => 'Distinct tournaments', get: (A, g) => A.tn[g], fmt: int, p: 'mp' },
    bo5: { label: () => 'Best-of-five share', get: (A, g) => (A.n[g] ? A.bo5[g] / A.n[g] : null), fmt: v => (v * 100).toFixed(1) + '%', p: 'mp', rate: true, pct: true },
    avgrank: { label: () => 'Average ATP ranking', get: (A, g) => (A.rc[g] ? A.rs[g] / A.rc[g] : null), fmt: v => v.toFixed(1), p: 'mp', rate: true, asc: true }
  };
  const measOK = (m, ps) => MEAS[m].p.includes(ps === 'player' ? 'p' : 'm');

  /* generic aggregator: keyFn(i, pid) -> group index or -1 */
  function agg(sel, G, keyFn, ps, need) {
    const A = { n: new Uint32Array(G), w: new Uint32Array(G), fin: new Uint32Array(G), tit: new Uint32Array(G), bo5: new Uint32Array(G), pl: new Uint32Array(G), tn: new Uint32Array(G), rs: new Float64Array(G), rc: new Uint32Array(G) };
    const nP = plNames.length, nT = tourNames.length, sp = need.pl ? new Uint8Array(G * nP) : null, st = need.tn ? new Uint8Array(G * nT) : null;
    const mark = (g, p, t) => { if (sp && !sp[g * nP + p]) { sp[g * nP + p] = 1; A.pl[g]++; } if (st && !st[g * nT + t]) { st[g * nT + t] = 1; A.tn[g]++; } };
    for (let a = 0; a < sel.length; a++) {
      const i = sel[a], fin = round[i] === FINAL ? 1 : 0, b5 = bo[i] === 5 ? 1 : 0;
      if (ps === 'match') {
        const g = keyFn(i, -1); if (g < 0) continue;
        A.n[g]++; A.fin[g] += fin; A.bo5[g] += b5; if (rw[i]) { A.rs[g] += rw[i]; A.rc[g]++; } if (rl[i]) { A.rs[g] += rl[i]; A.rc[g]++; } mark(g, win[i], tour[i]); if (sp && !sp[g * nP + los[i]]) { sp[g * nP + los[i]] = 1; A.pl[g]++; }
      } else {
        for (let s = 0; s < 2; s++) {
          const pid = s ? los[i] : win[i]; if (F.player >= 0 && pid !== F.player) continue;
          const g = keyFn(i, pid); if (g < 0) continue; const won = s === 0 ? 1 : 0;
          A.n[g]++; A.w[g] += won; A.fin[g] += fin; A.tit[g] += fin & won; A.bo5[g] += b5; { const rk = won ? rw[i] : rl[i]; if (rk) { A.rs[g] += rk; A.rc[g]++; } } mark(g, -1, tour[i]);
        }
      }
    }
    return A;
  }

  /* ---------- update ---------- */
  let sel = [], scheduled = false, globe;
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; update(); }); } }

  function update() {
    sel = select();
    const ps = perspective(), dim = DIMS[dimKey];
    // keep the measure menu valid for the current perspective
    const ok = Object.keys(MEAS).filter(m => measOK(m, ps));
    if (!ok.includes(measure)) measure = ok[0];
    $('m-measure').innerHTML = ok.map(m => `<option value="${m}"${m === measure ? ' selected' : ''}>${MEAS[m].label(ps === 'player' ? 'p' : 'm')}</option>`).join('');
    const M = MEAS[measure], mLabel = M.label(ps === 'player' ? 'p' : 'm');
    const need = { pl: measure === 'players', tn: true };

    // main aggregate by the chosen breakdown
    const G = dim.n(), keyFn = dim.player ? (i, p) => p : (i) => dim.key(i);
    const A = agg(sel, G, keyFn, ps, need);
    const cats = []; for (let g = 0; g < G; g++) if (A.n[g] > 0) cats.push(g);
    const val = g => (M.rate && A.n[g] < MIN_RATE ? null : M.get(A, g));   // rates need MIN_RATE matches

    summary(ps);
    // ---- chart 1: bar
    $('t-bar').textContent = `${mLabel} by ${dim.label.toLowerCase()}`;
    let ranked = cats.filter(g => val(g) != null); const total = ranked.length;
    if (!dim.natural) ranked.sort((a, b) => (M.asc ? val(a) - val(b) : val(b) - val(a)));
    const TOPN = dim.vertical ? 99 : 12; if (!dim.natural) ranked = ranked.slice(0, TOPN);
    const rows1 = ranked.map(g => ({ label: dim.name(g), value: val(g), tip: `<b>${Charts.esc(dim.name(g))}</b><br>${mLabel}: ${M.fmt(val(g))}<br>Matches: ${int(A.n[g])}` }));
    const pctAxis = M.pct ? { fmt: M.fmt, axisFmt: v => Math.round(v * 100) + '%' } : {};
    if (dim.vertical) Charts.barV($('ch-bar'), rows1, Object.assign({ color: C.sage, label: `${mLabel} by ${dim.label}`, fmt: M.fmt }, pctAxis));
    else Charts.barH($('ch-bar'), rows1, Object.assign({ color: C.sage, fmt: M.fmt, label: `${mLabel} by ${dim.label}`, rpad: M.rate ? 66 : 58 }, pctAxis));
    $('n-bar').textContent = (!dim.natural && total > TOPN ? `Top ${TOPN} of ${int(total)} ${dim.label.toLowerCase()} groups. ` : '') + (M.rate ? `${measure === 'winrate' ? 'Win rates' : 'Averages'} need at least ${MIN_RATE} matches in the group. ` : '') + (M.asc ? 'Lower ranking numbers are better, so the best group is first. ' : '') + 'Hover a bar for details.';

    // top categories for the multi-series charts
    const topCats = (dim.natural ? cats.slice().sort((a, b) => (M.asc ? (val(a) ?? 1e9) - (val(b) ?? 1e9) : (val(b) ?? -1) - (val(a) ?? -1))) : ranked).slice(0, dim.natural && dimKey !== 'year' ? 6 : 5);
    // ---- chart 2: line over years
    $('t-line').textContent = `${mLabel} by year${dimKey === 'year' ? '' : `, top ${topCats.length} ${dim.label.toLowerCase()} groups`}`;
    const xs = Array.from({ length: NY }, (_, k) => String(Y0 + k));
    let series2;
    if (dimKey === 'year') {
      const A2 = agg(sel, NY, i => year[i] - Y0, ps, need); series2 = [{ name: mLabel, color: C.foliage, values: xs.map((_, k) => (A2.n[k] >= (M.rate ? MIN_CELL : 1) ? M.get(A2, k) : null)) }];
    } else if (topCats.length) {
      const rank = new Map(topCats.map((g, r) => [g, r]));
      const A2 = agg(sel, topCats.length * NY, (i, p) => { const r = rank.get(dim.player ? p : dim.key(i)); return r === undefined ? -1 : r * NY + (year[i] - Y0); }, ps, need);
      series2 = topCats.map((g, r) => ({ name: dim.name(g), values: xs.map((_, k) => (A2.n[r * NY + k] >= (M.rate ? MIN_CELL : 1) ? M.get(A2, r * NY + k) : null)) }));
    } else series2 = [];
    Charts.line($('ch-line'), xs, series2, Object.assign({ fmt: M.fmt, label: `${mLabel} by year`, min: 0, empty: `No group has enough matches in a single year to show ${mLabel.toLowerCase()}. Widen the filters or pick another measure.` }, pctAxis));
    $('n-line').textContent = M.rate ? `Rates are shown only when a group played at least ${MIN_CELL} matches in that year; gaps mean fewer.` : 'Gaps mean the group had no matches in that year.';

    // ---- chart 3: scatter
    const xm = measure === 'matches' ? 'tourns' : 'matches', XM = MEAS[xm];
    $('t-scatter').textContent = `${XM.label(ps === 'player' ? 'p' : 'm')} against ${mLabel.toLowerCase()}, by ${dim.label.toLowerCase()}`;
    let sc = cats.filter(g => val(g) != null && XM.get(A, g) != null && (!dim.player || A.n[g] >= MIN_RATE));
    sc.sort((a, b) => A.n[b] - A.n[a]); sc = sc.slice(0, 400);
    const labelSet = new Set(sc.slice().sort((a, b) => (M.asc ? val(a) - val(b) : val(b) - val(a))).slice(0, 6).concat(sc.slice(0, 3)));
    Charts.scatter($('ch-scatter'), sc.map(g => ({ x: XM.get(A, g), y: val(g), label: dim.name(g), show: labelSet.has(g) && sc.length <= 400, color: C.sage, r: 5.5,
      tip: `<b>${Charts.esc(dim.name(g))}</b><br>${XM.label(ps === 'player' ? 'p' : 'm')}: ${XM.fmt(XM.get(A, g))}<br>${mLabel}: ${M.fmt(val(g))}` })),
      { xlabel: XM.label(ps === 'player' ? 'p' : 'm'), ylabel: mLabel, xfmt: XM.fmt, yfmt: M.pct ? v => Math.round(v * 100) + '%' : M.fmt, label: 'Scatter plot', ymin: M.pct ? 0 : undefined, ymax: M.pct && measure === 'winrate' ? 1 : undefined });
    $('n-scatter').textContent = `Each dot is one ${dim.label.toLowerCase()} group${sc.length >= 400 ? ' (the 400 with the most matches)' : ''}. Hover a dot for details.`;

    // ---- chart 4: heat map
    $('t-heat').textContent = dimKey === 'year' ? `${mLabel} by period and surface` : `${mLabel} by ${dim.label.toLowerCase()} and period`;
    let rowLabels, colLabels, cell;
    if (dimKey === 'year') {
      rowLabels = PERIODS; colLabels = surfNames.slice(); const ns = surfNames.length;
      const A4 = agg(sel, 5 * ns, i => period(year[i]) * ns + surf[i], ps, need); cell = (r, c) => (A4.n[r * ns + c] >= (M.rate ? MIN_CELL : 1) ? M.get(A4, r * ns + c) : null);
    } else {
      const top = (dim.natural ? cats : ranked).slice(0, 10), rank = new Map(top.map((g, r) => [g, r])); rowLabels = top.map(g => dim.name(g)); colLabels = PERIODS;
      const A4 = agg(sel, Math.max(1, top.length) * 5, (i, p) => { const r = rank.get(dim.player ? p : dim.key(i)); return r === undefined ? -1 : r * 5 + period(year[i]); }, ps, need);
      cell = (r, c) => (A4.n[r * 5 + c] >= (M.rate ? MIN_CELL : 1) ? M.get(A4, r * 5 + c) : null);
    }
    Charts.heatmap($('ch-heat'), rowLabels, colLabels, rowLabels.map((_, r) => colLabels.map((_, c) => cell(r, c))), { fmt: M.fmt, label: 'Heat map' });
    $('n-heat').textContent = (M.rate ? `Darker cells are higher values. Dashed cells have fewer than ${MIN_CELL} matches.` : 'Darker cells are higher values. Dashed cells have no matches.') + (M.asc ? ' A higher ranking number is a lower rank.' : '');

    globeUpdate();
    table(A, cats, ps, dim);
    badge(); wlUpdate(); lbUpdate();
  }

  /* ---------- summary numbers ---------- */
  function summary(ps) {
    const n = sel.length, pl = new Uint8Array(plNames.length), tn = new Uint8Array(tourNames.length), wins = new Uint32Array(plNames.length);
    let fin = 0, b5 = 0, npl = 0, ntn = 0, w = 0, l = 0, rs = 0, rc = 0;
    for (const i of sel) {
      if (!pl[win[i]]) { pl[win[i]] = 1; npl++; } if (!pl[los[i]]) { pl[los[i]] = 1; npl++; } if (!tn[tour[i]]) { tn[tour[i]] = 1; ntn++; }
      if (round[i] === FINAL) fin++; if (bo[i] === 5) b5++; wins[win[i]]++;
      if (F.player >= 0) { if (win[i] === F.player) { w++; if (rw[i]) { rs += rw[i]; rc++; } } else { l++; if (rl[i]) { rs += rl[i]; rc++; } } }
      else { if (rw[i]) { rs += rw[i]; rc++; } if (rl[i]) { rs += rl[i]; rc++; } }
    }
    let last;
    if (F.player >= 0) last = [n ? ((w / n) * 100).toFixed(1) + '%' : '\u2013', `${plDisp[F.player]}'s win rate (${w} wins, ${l} losses)`];
    else { let bi = -1, bv = 0; for (let p = 0; p < wins.length; p++) if (wins[p] > bv) { bv = wins[p]; bi = p; } last = [bi >= 0 ? plDisp[bi] : '\u2013', bi >= 0 ? `most wins in this view (${bv})` : 'most wins in this view']; }
    const k = [[int(n), 'matches in this view'], [int(npl), 'different players'], [int(ntn), 'different tournaments'], [int(fin), 'finals played (titles awarded)'], [n ? ((b5 / n) * 100).toFixed(1) + '%' : '\u2013', 'of matches were best-of-five'], last,
      [rc ? (rs / rc).toFixed(1) : '\u2013', F.player >= 0 ? `${plDisp[F.player]}'s average ATP ranking (lower is better)` : 'average ATP ranking of the players (lower is better)']];
    $('kpis').innerHTML = k.map(([b, s]) => `<div class="kpi"><b${b.length > 9 ? ' style="font-size:1.35rem"' : ''}>${Charts.esc(b)}</b><span>${Charts.esc(s)}</span></div>`).join('');
    const parts = []; if (F.from !== Y0 || F.to !== Y1) parts.push(`${F.from}\u2013${F.to}`); if (F.player >= 0) parts.push(plDisp[F.player]); if (F.tour >= 0) parts.push(tourNames[F.tour]);
    if (F.tier >= 0) parts.push(TIERS[F.tier]); if (F.surf >= 0) parts.push(surfNames[F.surf]); if (F.court >= 0) parts.push(courtNames[F.court]); if (F.round >= 0) parts.push(ROUNDS[F.round]); if (F.bo >= 0) parts.push(`best of ${F.bo}`);
    $('view-line').textContent = `Showing ${int(n)} of ${int(N)} matches` + (parts.length ? ` \u00b7 ${parts.join(' \u00b7 ')}` : ' \u00b7 no filters applied');
  }

  /* ---------- globe ---------- */
  function globeUpdate() {
    const by = new Map(); let total = 0;
    for (const i of sel) {
      if (!series[i] || round[i] !== FINAL) continue;
      const nm = plNames[win[i]], c = countryOf.get(nm), sk = SLAM_KEY[tourNames[tour[i]]]; if (!c || !sk) continue;
      let o = by.get(c); if (!o) { const pos = countryPos.get(c); o = { country: c, lat: pos[0], lon: pos[1], titles: 0, by_slam: { AO: 0, RG: 0, W: 0, USO: 0 }, champs: new Map() }; by.set(c, o); }
      o.titles++; o.by_slam[sk]++; o.champs.set(disp(nm), (o.champs.get(disp(nm)) || 0) + 1); total++;
    }
    const list = [...by.values()].sort((a, b) => b.titles - a.titles).map(o => Object.assign(o, { champions: [...o.champs].sort((a, b) => b[1] - a[1]).map(([name, titles]) => ({ name, titles })) }));
    globe.setCountries(list);
    $('globe-summary').textContent = total ? `${total} Grand Slam title${total > 1 ? 's' : ''} in this view, won by players from ${list.length} countr${list.length > 1 ? 'ies' : 'y'}.` : 'No Grand Slam finals in this view.';
    $('globe-list').innerHTML = list.map(o => `<li><span>${o.country}</span><b>${o.titles}</b></li>`).join('');
  }
  function tipHtml(it) {
    if (it.venue) return `<b>${it.city}</b><br>${it.name}`;
    return `<b>${it.country}</b> \u00b7 ${it.titles} titles<br>` + Object.keys(SLAM_NAMES).filter(s => it.by_slam[s]).map(s => `${SLAM_NAMES[s]} ${it.by_slam[s]}`).join(' \u00b7 ') + '<br>' + it.champions.map(c => `${c.name} (${c.titles})`).join(', ');
  }

  /* ---------- table ---------- */
  let tableRows = [], tableCols = [];
  function table(A, cats, ps, dim) {
    const pm = ps === 'player', pct = v => (v == null ? '\u2013' : (v * 100).toFixed(1) + '%'), pctCsv = v => (v * 100).toFixed(2), r1 = v => (v == null ? '\u2013' : v.toFixed(1));
    tableCols = pm ? [['g', dim.label], ['n', 'Matches', g => A.n[g]], ['w', 'Wins', g => A.w[g]], ['l', 'Losses', g => A.n[g] - A.w[g]], ['wr', 'Win rate', g => (A.n[g] >= MIN_RATE ? A.w[g] / A.n[g] : null), pct, pctCsv], ['t', 'Titles', g => A.tit[g]], ['f', 'Finals', g => A.fin[g]], ['tn', 'Tournaments', g => A.tn[g]], ['b', 'Best-of-five %', g => (A.n[g] ? A.bo5[g] / A.n[g] : null), pct, pctCsv], ['ar', 'Avg. ATP ranking', g => (A.rc[g] ? A.rs[g] / A.rc[g] : null), r1, r1]]
      : [['g', dim.label], ['n', 'Matches', g => A.n[g]], ['p', 'Players', g => A.pl[g]], ['tn', 'Tournaments', g => A.tn[g]], ['f', 'Finals (titles awarded)', g => A.fin[g]], ['b', 'Best-of-five %', g => (A.n[g] ? A.bo5[g] / A.n[g] : null), pct, pctCsv], ['ar', 'Avg. ATP ranking', g => (A.rc[g] ? A.rs[g] / A.rc[g] : null), r1, r1]];
    if (!pm) { const A2 = agg(sel, DIMS[dimKey].n(), DIMS[dimKey].key, 'match', { pl: true, tn: true }); tableCols[2][2] = g => A2.pl[g]; }
    tableRows = cats.map(g => ({ g, cells: tableCols.map(c => (c[0] === 'g' ? dim.name(g) : c[2](g))) }));
    if (!sortSpec || sortSpec.dim !== dimKey + pm) { const mi = tableCols.findIndex(c => (measure === 'matches' && c[0] === 'n') || (measure === 'wins' && c[0] === 'w') || (measure === 'winrate' && c[0] === 'wr') || (measure === 'titles' && c[0] === 't') || (measure === 'finals' && c[0] === 'f') || (measure === 'players' && c[0] === 'p') || (measure === 'tourns' && c[0] === 'tn') || (measure === 'bo5' && c[0] === 'b') || (measure === 'avgrank' && c[0] === 'ar'));
      sortSpec = { dim: dimKey + pm, col: dim.natural ? 0 : Math.max(1, mi), dir: dim.natural || MEAS[measure].asc ? 1 : -1, auto: true }; }
    renderTable(dim);
  }
  function renderTable(dim) {
    const { col, dir } = sortSpec, natural = DIMS[dimKey].natural && col === 0;
    const rows = tableRows.slice().sort((a, b) => { if (col === 0) return natural ? (a.g - b.g) * dir : String(a.cells[0]).localeCompare(String(b.cells[0])) * dir;
      const x = a.cells[col], y = b.cells[col]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x - y) * dir; });
    const shown = showAll ? rows : rows.slice(0, 40);
    $('tbl').innerHTML = `<thead><tr>${tableCols.map((c, i) => `<th scope="col" data-col="${i}"${sortSpec.col === i ? ` aria-sort="${dir < 0 ? 'descending' : 'ascending'}"` : ''} tabindex="0" title="Sort by ${Charts.esc(c[1])}">${Charts.esc(c[1])}</th>`).join('')}</tr></thead><tbody>` +
      shown.map(r => `<tr>${r.cells.map((v, i) => `<td>${i === 0 ? Charts.esc(v) : tableCols[i][3] ? tableCols[i][3](v) : v == null ? '\u2013' : int(v)}</td>`).join('')}</tr>`).join('') + '</tbody>';
    $('t-table').textContent = `The numbers behind the charts: ${dim.label.toLowerCase()} groups`;
    $('tbl-info').textContent = `${int(rows.length)} row${rows.length === 1 ? '' : 's'}${rows.length > shown.length ? `, showing the first ${shown.length}` : ''}. Click a column heading to sort.`;
    $('btn-more').style.display = rows.length > 40 ? '' : 'none'; $('btn-more').textContent = showAll ? 'Show fewer rows' : 'Show all rows';
    renderTable.rows = rows;
  }
  function csv() {
    const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [tableCols.map(c => esc(c[1])).join(',')].concat(renderTable.rows.map(r => r.cells.map((v, i) => esc(tableCols[i][4] && v != null ? tableCols[i][4](v) : v)).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `slam-study-${dimKey}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  /* ---------- "Additional Filters" badge ---------- */
  function badge() {
    const k = [F.tier, F.surf, F.court, F.round, F.bo].filter(v => v >= 0).length, b = $('more-badge');
    b.textContent = k ? `${k} on` : ''; b.classList.toggle('on', k > 0);
  }

  /* ---------- win/loss averages for one player ----------
     Uses every filter except Player (the player is chosen in this panel).
     average per season = total / seasons in which the player played at least one match in this view
     average per tournament = total / tournament editions played (one tournament in one year counts once) */
  let wlPlayer = -1, wlResult = null;
  const f1 = v => v.toFixed(1);
  function wlUpdate() {
    const box = $('wl-body');
    if (wlPlayer < 0) { wlResult = null; box.innerHTML = '<div class="empty">Search for a player above to compare their average wins with their average losses. The panel uses the other filters, so you can compare seasons, surfaces, or tournaments.</div>'; return; }
    const rows = select(wlPlayer), yw = new Uint32Array(NY), yl = new Uint32Array(NY), ed = new Uint8Array(tourNames.length * NY);
    let W = 0, L = 0, T = 0, oWs = 0, oWc = 0, oLs = 0, oLc = 0, mS = 0, mC = 0;
    for (const i of rows) {
      const y = year[i] - Y0, k = tour[i] * NY + y; if (!ed[k]) { ed[k] = 1; T++; }
      if (win[i] === wlPlayer) { W++; yw[y]++; if (rl[i]) { oWs += rl[i]; oWc++; } if (rw[i]) { mS += rw[i]; mC++; } }
      else { L++; yl[y]++; if (rw[i]) { oLs += rw[i]; oLc++; } if (rl[i]) { mS += rl[i]; mC++; } }
    }
    const seasons = []; for (let y = 0; y < NY; y++) if (yw[y] + yl[y] > 0) seasons.push(y);
    const S = seasons.length, name = plDisp[wlPlayer];
    if (!S) { wlResult = null; box.innerHTML = `<div class="empty">${Charts.esc(name)} has no matches in the current filters. Widen the filters to see averages.</div>`; return; }
    wlResult = { player: name, wins: W, losses: L, seasons: S, tournaments: T, avgWinsSeason: W / S, avgLossesSeason: L / S, avgWinsTournament: W / T, avgLossesTournament: L / T,
      oppRankInWins: oWc ? oWs / oWc : null, oppRankInLosses: oLc ? oLs / oLc : null, ownRank: mC ? mS / mC : null };
    const R = wlResult, first = Y0 + seasons[0], last = Y0 + seasons[S - 1], rk = v => (v == null ? '\u2013' : f1(v));
    box.innerHTML = `<p class="view-line" style="margin:0 0 12px"><b>${Charts.esc(name)}</b> \u00b7 ${S} season${S > 1 ? 's' : ''} played (${first}\u2013${last}) \u00b7 ${int(W + L)} matches \u00b7 win rate ${((W / (W + L)) * 100).toFixed(1)}%</p>
      <div class="wl"><div>
        <div class="wl-tiles"><div class="wl-tile"><b>${f1(R.avgWinsSeason)}</b><span>average wins per season</span></div><div class="wl-tile loss"><b>${f1(R.avgLossesSeason)}</b><span>average losses per season</span></div></div>
        <table class="wl-table"><thead><tr><th></th><th>Wins</th><th>Losses</th></tr></thead><tbody>
          <tr><td>Total</td><td>${int(W)}</td><td>${int(L)}</td></tr>
          <tr><td>Average per season (${S} season${S > 1 ? 's' : ''})</td><td>${f1(R.avgWinsSeason)}</td><td>${f1(R.avgLossesSeason)}</td></tr>
          <tr><td>Average per tournament (${int(T)} tournament entries, one per year)</td><td>${f1(R.avgWinsTournament)}</td><td>${f1(R.avgLossesTournament)}</td></tr>
          <tr><td>Average ATP ranking of the opponent</td><td>${rk(R.oppRankInWins)}</td><td>${rk(R.oppRankInLosses)}</td></tr>
        </tbody></table>
        <p class="wl-def">Average per season = total \u00f7 seasons with at least one match in this view. Average per tournament = total \u00f7 tournament entries (one tournament in one year counts once, so this is not the same as the "different tournaments" count in the summary numbers above). The last row is the mean ATP ranking of the players beaten (Wins column) and of the players lost to (Losses column); lower numbers mean stronger opponents.${R.ownRank != null ? ` ${Charts.esc(name)}'s own average ranking in these matches is ${f1(R.ownRank)}.` : ''}</p>
      </div><div><div class="chart" id="wl-chart"></div><p class="chart-note">Wins and losses in each season played. Dashed lines mark the two averages (${f1(R.avgWinsSeason)} wins and ${f1(R.avgLossesSeason)} losses per season).</p></div></div>`;
    Charts.pairsV($('wl-chart'), seasons.map(y => String(Y0 + y)), seasons.map(y => yw[y]), seasons.map(y => yl[y]), { nameA: 'Wins', nameB: 'Losses', colorA: C.sage, colorB: C.pink, avgA: R.avgWinsSeason, avgB: R.avgLossesSeason, label: `${name}: wins and losses per season` });
  }

  /* ---------- leaderboard: players ranked on the current filters (the Player filter is ignored) ---------- */
  let lbMeasure = 'wins', lbTop = 10, lbFull = [];
  const LB = {
    wins: { label: 'total wins', get: p => p.w },
    winrate: { label: 'win rate', get: p => (p.n >= MIN_RATE ? p.w / p.n : null), note: `Win rate needs at least ${MIN_RATE} matches.` },
    titles: { label: 'titles won', get: p => (p.tit > 0 ? p.tit : null), note: 'Only players with at least one title are ranked. Titles are counted exactly as recorded in the file, which is missing a few Grand Slam matches (see About the data on the report page) — that is why Nadal shows 21 rather than 22.' },
    matches: { label: 'matches played', get: p => p.n },
    avgrank: { label: 'average ATP ranking (best first)', get: p => (p.rc >= MIN_RATE ? p.rs / p.rc : null), asc: true, note: `Lower ranking numbers are better. Needs at least ${MIN_RATE} matches with a listed ranking.` }
  };
  function lbUpdate() {
    const rows = select(-1), nP = plNames.length, n = new Uint32Array(nP), w = new Uint32Array(nP), tit = new Uint32Array(nP), rs = new Float64Array(nP), rc = new Uint32Array(nP);
    for (const i of rows) {
      const a = win[i], b = los[i], f = round[i] === FINAL ? 1 : 0;
      n[a]++; w[a]++; tit[a] += f; if (rw[i]) { rs[a] += rw[i]; rc[a]++; } n[b]++; if (rl[i]) { rs[b] += rl[i]; rc[b]++; }
    }
    const M = LB[lbMeasure], list = [];
    for (let q = 0; q < nP; q++) if (n[q]) { const o = { id: q, n: n[q], w: w[q], l: n[q] - w[q], tit: tit[q], rs: rs[q], rc: rc[q] }; o.v = M.get(o); if (o.v != null) list.push(o); }
    list.sort((a, b) => (M.asc ? a.v - b.v : b.v - a.v) || b.w - a.w || plNames[a.id].localeCompare(plNames[b.id]));   // ties: by surname
    list.forEach((o, k) => { o.rank = k > 0 && list[k - 1].v === o.v ? list[k - 1].rank : k + 1; });
    lbFull = list;
    const shown = list.slice(0, lbTop), sel = F.player, pinned = sel >= 0 && !shown.some(o => o.id === sel) ? list.find(o => o.id === sel) : null;
    const pct = o => (o.n >= MIN_RATE ? ((o.w / o.n) * 100).toFixed(1) + '%' : '\u2013'), ar = o => (o.rc ? (o.rs / o.rc).toFixed(1) : '\u2013');
    const row = o => `<tr${o.id === sel || o.id === wlPlayer ? ' class="me"' : ''}><td>${o.rank}</td><td>${Charts.esc(plDisp[o.id])}</td><td>${int(o.w)}</td><td>${int(o.l)}</td><td>${int(o.n)}</td><td>${pct(o)}</td><td>${int(o.tit)}</td><td>${ar(o)}</td></tr>`;
    const heads = ['Rank', 'Player', 'Wins', 'Losses', 'Matches', 'Win rate', 'Titles (finals won)', 'Avg. ATP ranking'];
    $('lb-tbl').innerHTML = `<thead><tr>${heads.map((h, i) => `<th scope="col" style="cursor:default">${h}</th>`).join('')}</tr></thead><tbody>` +
      (shown.length ? shown.map(row).join('') + (pinned ? `<tr class="gap-row"><td colspan="8">\u00b7 \u00b7 \u00b7</td></tr>` + row(pinned) : '') : `<tr><td colspan="8" style="text-align:center;padding:24px">No players match the current filters.</td></tr>`) + '</tbody>';
    $('t-lb').textContent = `Player leaderboard: top ${Math.min(lbTop, list.length) || lbTop} by ${M.label}`;
    const missing = sel >= 0 && !list.some(o => o.id === sel) ? ` ${plDisp[sel]} is not ranked on this measure in the current view.` : '';
    $('lb-info').textContent = `${int(list.length)} players ranked. Uses every filter above except Player, so anyone can appear; the selected player is highlighted. Players with equal values share a rank. ${M.note || ''}${missing}`.replace(/\s+/g, ' ');
  }

  /* ---------- controls ---------- */
  function fillSelect(el, opts, allLabel) { el.innerHTML = `<option value="-1">${allLabel}</option>` + opts.map((o, i) => `<option value="${i}">${Charts.esc(o)}</option>`).join(''); }
  function setup() {
    const years = Array.from({ length: NY }, (_, k) => Y0 + k);
    $('f-from').innerHTML = years.map(y => `<option>${y}</option>`).join(''); $('f-to').innerHTML = years.map(y => `<option>${y}</option>`).join('');
    fillSelect($('f-tier'), TIERS, 'All tiers'); fillSelect($('f-surface'), surfNames, 'All surfaces'); fillSelect($('f-court'), courtNames, 'All courts'); fillSelect($('f-round'), ROUNDS, 'All rounds');
    $('f-bo').innerHTML = '<option value="-1">All</option><option value="3">Best of 3</option><option value="5">Best of 5</option>';
    $('dl-players').innerHTML = plNames.map((_, i) => i).sort((a, b) => plMatches[b] - plMatches[a]).map(i => `<option value="${Charts.esc(plDisp[i])}">`).join('');
    $('dl-tours').innerHTML = tourNames.slice().sort().map(t => `<option value="${Charts.esc(t)}">`).join(''); tourNames.forEach((t, i) => tourIndex.set(t.toLowerCase(), i));
    $('m-dim').innerHTML = Object.keys(DIMS).map(k => `<option value="${k}">${DIMS[k].label}</option>`).join('');
    $('lb-measure').innerHTML = Object.keys(LB).map(k => `<option value="${k}">${LB[k].label.replace(' (best first)', '')}</option>`).join('');
    reset();
    const bind = (id, fn) => { $(id).addEventListener('change', () => { fn($(id).value); schedule(); }); };
    bind('f-from', v => { F.from = +v; if (F.to < F.from) { F.to = F.from; $('f-to').value = F.to; } }); bind('f-to', v => { F.to = +v; if (F.to < F.from) { F.from = F.to; $('f-from').value = F.from; } });
    bind('f-tier', v => F.tier = +v); bind('f-surface', v => F.surf = +v); bind('f-court', v => F.court = +v); bind('f-round', v => F.round = +v); bind('f-bo', v => F.bo = +v);
    bind('m-measure', v => measure = v); bind('m-dim', v => { dimKey = v; sortSpec = null; showAll = false; });
    const typed = (id, lookup, key) => { const el = $(id), apply = () => { const v = el.value.trim(); if (!v) { F[key] = -1; el.style.borderColor = ''; return true; } const k = lookup(v); if (k === undefined) { el.style.borderColor = C.pinkDeep; return false; } F[key] = k; el.style.borderColor = ''; return true; };
      el.addEventListener('input', () => { if (apply()) schedule(); }); el.addEventListener('change', () => { if (!apply()) { el.value = ''; F[key] = -1; el.style.borderColor = ''; } schedule(); }); };
    typed('f-player', v => plIndex.get(v), 'player'); typed('f-tour', v => tourIndex.get(v.toLowerCase()), 'tour');
    // picking a player in the top filter also fills the win/loss panel
    $('f-player').addEventListener('change', () => { if (F.player >= 0) { wlPlayer = F.player; $('wl-player').value = plDisp[F.player]; $('wl-player').style.borderColor = ''; schedule(); } });
    { const el = $('wl-player'), apply = () => { const v = el.value.trim(); if (!v) { wlPlayer = -1; el.style.borderColor = ''; return true; } const k = plIndex.get(v); if (k === undefined) { el.style.borderColor = C.pinkDeep; return false; } wlPlayer = k; el.style.borderColor = ''; return true; };
      el.addEventListener('input', () => { if (apply()) schedule(); }); el.addEventListener('change', () => { if (!apply()) { el.value = ''; wlPlayer = -1; el.style.borderColor = ''; } schedule(); }); }
    $('lb-measure').addEventListener('change', () => { lbMeasure = $('lb-measure').value; schedule(); }); $('lb-top').addEventListener('change', () => { lbTop = +$('lb-top').value; schedule(); });
    const moreBtn = $('more-btn'), morePanel = $('more-panel'), toggleMore = open => { morePanel.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); };
    moreBtn.addEventListener('click', () => toggleMore(morePanel.hidden));
    morePanel.addEventListener('keydown', e => { if (e.key === 'Escape') { toggleMore(false); moreBtn.focus(); } });
    $('btn-reset').addEventListener('click', () => { reset(); schedule(); });
    $('btn-slams').addEventListener('click', () => { F.tier = 0; $('f-tier').value = '0'; schedule(); });
    $('btn-more').addEventListener('click', () => { showAll = !showAll; renderTable(DIMS[dimKey]); });
    $('btn-csv').addEventListener('click', csv);
    $('tbl').addEventListener('click', e => { const th = e.target.closest('th'); if (!th) return; const c = +th.dataset.col; sortSpec = { dim: sortSpec.dim, col: c, dir: sortSpec.col === c ? -sortSpec.dir : (c === 0 ? 1 : -1) }; renderTable(DIMS[dimKey]); });
    $('tbl').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('th')) e.target.click(); });
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(schedule, 150); });
  }
  function reset() {
    F = DEF(); measure = 'matches'; dimKey = 'tier'; sortSpec = null; showAll = false; wlPlayer = -1; lbMeasure = 'wins'; lbTop = 10;
    $('wl-player').value = ''; $('wl-player').style.borderColor = ''; $('lb-measure').value = lbMeasure; $('lb-top').value = String(lbTop);
    $('f-from').value = F.from; $('f-to').value = F.to; $('f-player').value = ''; $('f-tour').value = ''; $('f-player').style.borderColor = ''; $('f-tour').style.borderColor = '';
    ['f-tier', 'f-surface', 'f-court', 'f-round', 'f-bo'].forEach(id => $(id).value = '-1'); $('m-dim').value = dimKey;
  }

  /* ---------- start ---------- */
  (async function () {
    try {
      const [a, c] = await Promise.all([getText('data/atp_matches.csv'), getText('data/champion_countries.csv', true)]);
      build(parseCSV(a));
      if (c) parseCSV(c).rows.forEach(r => { countryOf.set(r[0], r[1]); countryPos.set(r[1], [+r[2], +r[3]]); });
      $('load').hidden = true; $('app').hidden = false; setup();
      globe = new SlamGlobe($('dash-globe'), { venues: VENUES, countries: [], lon: -30, lat: 30, tip: $('dash-tip'), tipHtml, spin: false, aspect: .94, labelTop: 3 });
      update();
      window.__dash = { get state() { return { F, measure, dimKey, n: sel.length, N }; }, get wl() { return wlResult; }, get lb() { return lbFull.map(o => ({ rank: o.rank, player: plNames[o.id], wins: o.w, losses: o.l, matches: o.n, titles: o.tit, value: o.v })); } };
    } catch (e) { $('load').textContent = e.message; }
  })();
})();
