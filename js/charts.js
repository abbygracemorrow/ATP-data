/* charts.js - small SVG chart toolkit (no libraries). Every function draws into a container element
   and can be called again to redraw, so charts resize and update with the dashboard filters. */
(function (g) {
  'use strict';
  const C = { ink: '#2b4530', soft: '#557059', grid: '#e1e2d0', sage: '#80a47f', foliage: '#70905f', pink: '#ea96a4',
    pinkDeep: '#c95a72', lime: '#e5ee9f', limeMid: '#ccd582', ball: '#c6d445', teal: '#6fa8b0', cream: '#f2f4e9',
    blush: '#f8e3e7', olive: '#a3af64', white: '#fdfdfb', dust: '#e1e2d0' };
  const SLAM_COLOR = { AO: '#6fa8b0', RG: '#ea96a4', W: '#6f9a5f', USO: '#c6d445' };
  const SERIES = ['#70905f', '#ea96a4', '#6fa8b0', '#c6d445', '#a3af64', '#c95a72', '#2b4530', '#b9a7d4'];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const int = n => Math.round(n).toLocaleString('en-US');
  const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
  const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '\u2026' : String(s));

  function ensureTip() {
    if (document.getElementById('tt')) return;
    const t = document.createElement('div'); t.id = 'tt'; t.className = 'tt'; t.setAttribute('role', 'tooltip'); document.body.appendChild(t);
    document.addEventListener('pointermove', e => {
      const el = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) { t.style.display = 'none'; return; }
      t.innerHTML = el.getAttribute('data-tip'); t.style.display = 'block';
      const r = t.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > innerWidth - 6) x = e.clientX - r.width - 14;
      if (y + r.height > innerHeight - 6) y = e.clientY - r.height - 14;
      t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
    });
    document.addEventListener('scroll', () => { t.style.display = 'none'; }, true);
  }
  const tipAttr = h => (h ? ` data-tip="${esc(h)}"` : '');

  function niceTicks(lo, hi, n = 5) {
    if (hi === lo) hi = lo + 1;
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const width = (el, min = 300) => Math.max(min, Math.floor(el.clientWidth || el.getBoundingClientRect().width || 600));
  const wrap = (W, H, label, inner) => `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  const empty = (el, msg) => { el.innerHTML = `<div class="empty">${esc(msg || 'No data for the current filters.')}</div>`; };

  function legend(el, items) {
    el.insertAdjacentHTML('beforeend', `<div class="legend">${items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`);
  }

  /* horizontal bars, or lollipops when o.dot is true (used when the axis does not start at zero) */
  function barH(el, rows, o = {}) {
    ensureTip(); if (!rows.length) return empty(el, o.empty);
    const W = width(el), bh = o.barH || 22, gap = o.gap || 9, top = 6, axis = o.axis === false ? 4 : 30;
    const fmt = o.fmt || int, lw = o.labelW || Math.min(200, Math.max(70, Math.max(...rows.map(r => String(r.label).length)) * 7.1 + 10));
    const rp = o.rpad || 58, max = o.max != null ? o.max : Math.max(...rows.map(r => r.value), 1e-9), min = o.min != null ? o.min : 0;
    const iw = W - lw - rp, sx = v => lw + Math.max(0, (v - min) / (max - min)) * iw, H = top + rows.length * (bh + gap) + axis;
    let s = '';
    if (o.axis !== false) {
      const ticks = o.ticks || niceTicks(min, max, 5);
      ticks.forEach(t => { const x = sx(t); s += `<line x1="${x}" x2="${x}" y1="${top}" y2="${H - axis + 2}" stroke="${C.grid}"/><text class="ax" x="${x}" y="${H - 8}" text-anchor="middle">${esc((o.axisFmt || fmt)(t))}</text>`; });
    }
    rows.forEach((r, i) => {
      const y = top + i * (bh + gap), cy = y + bh / 2, x1 = sx(r.value), col = r.color || o.color || C.sage;
      s += `<g${tipAttr(r.tip || `<b>${esc(r.label)}</b><br>${esc(fmt(r.value))}`)}>`;
      s += `<rect x="0" y="${y - gap / 2}" width="${W}" height="${bh + gap}" fill="transparent"/>`;
      s += `<text class="lbl" x="${lw - 8}" y="${cy + 4.5}" text-anchor="end">${esc(clip(r.label, 26))}</text>`;
      if (o.dot) s += `<line x1="${sx(min)}" x2="${x1}" y1="${cy}" y2="${cy}" stroke="${col}" stroke-width="3" stroke-linecap="butt"/><circle cx="${x1}" cy="${cy}" r="8" fill="${col}" stroke="${C.ink}" stroke-width="1.5"/>`;
      else s += `<rect x="${lw}" y="${y}" width="${Math.max(2, x1 - lw)}" height="${bh}" rx="2" fill="${col}"/>`;
      s += `<text class="val" x="${x1 + (o.dot ? 15 : 8)}" y="${cy + 4.5}">${esc(r.valueLabel || fmt(r.value))}</text></g>`;
    });
    el.innerHTML = wrap(W, H, o.label || 'Bar chart', s);
  }

  /* vertical bars (used for chronological categories such as years) */
  function barV(el, rows, o = {}) {
    ensureTip(); if (!rows.length) return empty(el, o.empty);
    const W = width(el), H = o.h || 300, l = 44, r = 8, t = 12, b = 46, fmt = o.fmt || int;
    const max = o.max != null ? o.max : Math.max(...rows.map(x => x.value), 1e-9), ticks = niceTicks(0, max, 5), top = Math.max(max, ticks[ticks.length - 1]);
    const iw = W - l - r, ih = H - t - b, bw = iw / rows.length, every = Math.ceil(rows.length / Math.floor(iw / 44));
    let s = ticks.map(v => { const y = t + ih - v / top * ih; return `<line x1="${l}" x2="${W - r}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text class="ax" x="${l - 6}" y="${y + 4}" text-anchor="end">${esc((o.axisFmt || fmt)(v))}</text>`; }).join('');
    rows.forEach((d, i) => {
      const h = Math.max(1.5, d.value / top * ih), x = l + i * bw + bw * .14, y = t + ih - h;
      s += `<g${tipAttr(d.tip || `<b>${esc(d.label)}</b><br>${esc(fmt(d.value))}`)}><rect x="${l + i * bw}" y="${t}" width="${bw}" height="${ih}" fill="transparent"/><rect x="${x}" y="${y}" width="${bw * .72}" height="${h}" rx="1.5" fill="${d.color || o.color || C.sage}"/></g>`;
      if (i % every === 0) s += `<text class="ax" x="${l + i * bw + bw / 2}" y="${H - b + 16}" text-anchor="${rows.length > 8 ? 'end' : 'middle'}" ${rows.length > 8 ? `transform="rotate(-40 ${l + i * bw + bw / 2} ${H - b + 16})"` : ''}>${esc(clip(d.label, 14))}</text>`;
    });
    el.innerHTML = wrap(W, H, o.label || 'Bar chart', s);
  }

  /* stacked horizontal bars: rows [{label, parts:[{value,color,tip}]}] */
  function stackedH(el, rows, o = {}) {
    ensureTip(); if (!rows.length) return empty(el);
    const W = width(el), bh = 24, gap = 10, lw = o.labelW || 118, rp = 48, top = 6;
    const max = Math.max(...rows.map(r => r.parts.reduce((a, p) => a + p.value, 0))), H = top + rows.length * (bh + gap) + 6, sx = v => v / max * (W - lw - rp);
    let s = '';
    rows.forEach((r, i) => {
      const y = top + i * (bh + gap); let x = lw;
      s += `<text class="lbl" x="${lw - 8}" y="${y + bh / 2 + 4.5}" text-anchor="end">${esc(clip(r.label, 22))}</text>`;
      r.parts.forEach(p => { if (p.value <= 0) return; const w = sx(p.value);
        s += `<g${tipAttr(p.tip)}><rect x="${x}" y="${y}" width="${w}" height="${bh}" fill="${p.color}" stroke="${C.white}" stroke-width="1.5"/>${w > 11 ? `<text class="val" x="${x + w / 2}" y="${y + bh / 2 + 4.5}" text-anchor="middle">${p.value}</text>` : ''}</g>`; x += w; });
      s += `<text class="val" x="${x + 8}" y="${y + bh / 2 + 4.5}">${r.total != null ? r.total : ''}</text>`;
    });
    el.innerHTML = wrap(W, H, o.label || 'Stacked bar chart', s);
  }


  /* paired vertical bars (e.g. wins and losses per season) with a dashed average line for each series.
     a, b: arrays of numbers, one pair per x label. */
  function pairsV(el, xs, a, b, o = {}) {
    ensureTip(); if (!xs.length) return empty(el, o.empty);
    const W = width(el), H = o.h || 280, l = 40, r = 12, t = 18, bt = 34, fmt = o.fmt || int;
    const ca = o.colorA || C.sage, cb = o.colorB || C.pink, na = o.nameA || 'A', nb = o.nameB || 'B';
    const hi = Math.max(...a, ...b, o.avgA || 0, o.avgB || 0, 1), ticks = niceTicks(0, hi, 4), top = Math.max(hi, ticks[ticks.length - 1]);
    const iw = W - l - r, ih = H - t - bt, slot = iw / xs.length, bw = Math.min(22, slot * .38), every = Math.ceil(xs.length / Math.max(2, Math.floor(iw / 42)));
    const sy = v => t + ih - v / top * ih;
    let s = ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.grid}"/><text class="ax" x="${l - 6}" y="${sy(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
    xs.forEach((x, i) => {
      const cx = l + slot * i + slot / 2;
      [[a[i], ca, na, -bw], [b[i], cb, nb, 0]].forEach(([v, col, nm, dx]) => {
        const h = Math.max(v > 0 ? 1.5 : 0, v / top * ih);
        s += `<rect x="${cx + dx}" y="${t + ih - h}" width="${bw}" height="${h}" fill="${col}"${tipAttr(`<b>${esc(x)}</b><br>${esc(nm)}: ${esc(fmt(v))}`)}/>`;
      });
      if (i % every === 0) s += `<text class="ax" x="${cx}" y="${H - 12}" text-anchor="middle">${esc(x)}</text>`;
    });
    [o.avgA, o.avgB].forEach(v => {
      if (v == null) return;
      s += `<line x1="${l}" x2="${W - r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
    });
    el.innerHTML = wrap(W, H, o.label || 'Paired bar chart', s);
    legend(el, [{ label: na, color: ca }, { label: nb, color: cb }]);
  }

  /* line chart with several series. series [{name,color,values:[...|null]}] */
  function line(el, xs, series, o = {}) {
    ensureTip(); series = series.filter(s => s.values.some(v => v != null)); if (!series.length) return empty(el, o.empty);
    const W = width(el), H = o.h || 300, l = 48, r = 14, t = 12, b = 30, fmt = o.fmt || int;
    const all = series.flatMap(s => s.values.filter(v => v != null)), lo = o.min != null ? o.min : 0, hi = o.max != null ? o.max : Math.max(...all, 1e-9);
    const ticks = niceTicks(lo, hi, 5), top = Math.max(hi, ticks[ticks.length - 1]), iw = W - l - r, ih = H - t - b;
    const sx = i => l + (xs.length === 1 ? iw / 2 : i / (xs.length - 1) * iw), sy = v => t + ih - (v - lo) / (top - lo || 1) * ih;
    let s = ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.grid}"/><text class="ax" x="${l - 6}" y="${sy(v) + 4}" text-anchor="end">${esc((o.axisFmt || fmt)(v))}</text>`).join('');
    const every = Math.ceil(xs.length / Math.max(2, Math.floor(iw / 52)));
    xs.forEach((x, i) => { if (i % every === 0) s += `<text class="ax" x="${sx(i)}" y="${H - 8}" text-anchor="middle">${esc(x)}</text>`; });
    series.forEach((se, k) => {
      const col = se.color || SERIES[k % SERIES.length]; let d = '', pen = false;
      se.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`; pen = true; });
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      se.values.forEach((v, i) => { if (v == null) return;
        s += `<circle cx="${sx(i)}" cy="${sy(v)}" r="${xs.length > 30 ? 2.6 : 3.6}" fill="${col}" stroke="${C.white}" stroke-width="1.2"/><circle cx="${sx(i)}" cy="${sy(v)}" r="9" fill="transparent"${tipAttr(`<b>${esc(se.name)}</b> \u00b7 ${esc(xs[i])}<br>${esc(fmt(v))}`)}/>`; });
    });
    el.innerHTML = wrap(W, H, o.label || 'Line chart', s);
    if (series.length > 1 || o.legend) legend(el, series.map((se, k) => ({ label: se.name, color: se.color || SERIES[k % SERIES.length] })));
  }

  /* scatter plot. pts [{x,y,label,color,r,tip,show}] */
  function scatter(el, pts, o = {}) {
    ensureTip(); if (!pts.length) return empty(el, o.empty);
    const W = width(el), H = o.h || Math.min(520, Math.round(W * .82)), l = 68, r = 18, t = 14, b = 48;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    let x0 = o.xmin != null ? o.xmin : Math.min(...xs), x1 = o.xmax != null ? o.xmax : Math.max(...xs), y0 = o.ymin != null ? o.ymin : Math.min(...ys), y1 = o.ymax != null ? o.ymax : Math.max(...ys);
    if (o.xmin == null) { const p = (x1 - x0) * .06 || 1; x0 -= p; x1 += p; } if (o.ymin == null) { const p = (y1 - y0) * .06 || 1; y0 -= p; y1 += p; }
    const iw = W - l - r, ih = H - t - b, sx = v => l + (v - x0) / (x1 - x0) * iw, sy = v => t + ih - (v - y0) / (y1 - y0) * ih;
    const xf = o.xfmt || int, yf = o.yfmt || int; let s = '';
    niceTicks(x0, x1, 6).forEach(v => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${t}" y2="${t + ih}" stroke="${C.grid}"/><text class="ax" x="${sx(v)}" y="${t + ih + 17}" text-anchor="middle">${esc(xf(v))}</text>`; });
    niceTicks(y0, y1, 6).forEach(v => { s += `<line x1="${l}" x2="${l + iw}" y1="${sy(v)}" y2="${sy(v)}" stroke="${C.grid}"/><text class="ax" x="${l - 7}" y="${sy(v) + 4}" text-anchor="end">${esc(yf(v))}</text>`; });
    if (o.diagonal) { const a = Math.max(x0, y0), z = Math.min(x1, y1); s += `<line x1="${sx(a)}" y1="${sy(a)}" x2="${sx(z)}" y2="${sy(z)}" stroke="${C.pinkDeep}" stroke-width="2" stroke-dasharray="6 5"/>`; }
    s += `<text class="ax" x="${l + iw / 2}" y="${H - 6}" text-anchor="middle" style="font-size:13px">${esc(o.xlabel || '')}</text>`;
    s += `<text class="ax" transform="translate(12 ${t + ih / 2}) rotate(-90)" text-anchor="middle" style="font-size:13px">${esc(o.ylabel || '')}</text>`;
    const sorted = pts.slice().sort((a, b) => (a.show ? 1 : 0) - (b.show ? 1 : 0));
    sorted.forEach(p => { s += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${p.r || 5}" fill="${p.color || C.sage}" fill-opacity="${p.show ? 1 : .62}" stroke="${C.ink}" stroke-width="${p.show ? 1.8 : 1}"${tipAttr(p.tip)}/>`; });
    const boxes = [];
    pts.filter(p => p.show).forEach(p => {
      const w = p.label.length * 6.6 + 4, h = 14, px = sx(p.x), py = sy(p.y);
      const opts = [[px + 9, py + 4], [px - 9 - w, py + 4], [px - w / 2, py - 11], [px - w / 2, py + 20], [px + 9, py - 9], [px - 9 - w, py - 9]];
      let pick = opts.find(([x, y]) => x > 2 && x + w < W - 2 && !boxes.some(b => x < b[0] + b[2] && x + w > b[0] && y - h < b[1] && y > b[1] - b[3])) || opts[0];
      boxes.push([pick[0], pick[1], w, h]);
      s += `<text class="lbl" x="${pick[0]}" y="${pick[1]}" style="font-size:12px;font-weight:500;paint-order:stroke;stroke:#fff;stroke-width:3.5px">${esc(p.label)}</text>`;
    });
    el.innerHTML = wrap(W, H, o.label || 'Scatter plot', s);
  }

  /* heatmap. cells matrix[r][c] = number|null */
  function heatmap(el, rowLabels, colLabels, m, o = {}) {
    ensureTip(); const flat = m.flat().filter(v => v != null); if (!flat.length) return empty(el);
    const W = width(el), fmt = o.fmt || int, lw = Math.min(170, Math.max(60, Math.max(...rowLabels.map(x => String(x).length)) * 7 + 10)), top = 44;
    const cw = (W - lw - 6) / colLabels.length, ch = 30, H = top + rowLabels.length * ch + 6;
    const lo = Math.min(...flat), hi = Math.max(...flat); let s = '';
    colLabels.forEach((c, j) => { s += `<text class="ax" x="${lw + j * cw + cw / 2}" y="${top - 12}" text-anchor="middle">${esc(clip(c, 12))}</text>`; });
    rowLabels.forEach((rl, i) => {
      s += `<text class="lbl" x="${lw - 8}" y="${top + i * ch + ch / 2 + 4.5}" text-anchor="end">${esc(clip(rl, 24))}</text>`;
      colLabels.forEach((cl, j) => { const v = m[i][j], x = lw + j * cw, y = top + i * ch;
        if (v == null) { s += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="2" fill="none" stroke="${C.grid}" stroke-dasharray="3 3"/>`; return; }
        const t = hi === lo ? .6 : (v - lo) / (hi - lo);
        s += `<g${tipAttr(`<b>${esc(rl)}</b> \u00b7 ${esc(cl)}<br>${esc(fmt(v))}`)}><rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="2" fill="${mix('#f8e3e7', '#70905f', t)}"/>${cw > 44 ? `<text class="val" x="${x + cw / 2}" y="${y + ch / 2 + 4.5}" text-anchor="middle" style="fill:${t > .62 ? '#fff' : C.ink};font-size:11.5px">${esc(fmt(v))}</text>` : ''}</g>`; });
    });
    el.innerHTML = wrap(W, H, o.label || 'Heat map', s);
  }

  /* colors for the court icons only, taken directly from the "GRAND SLAM" reference poster the
     user provided -- deliberately its own palette, not SLAM_COLOR/the site's sage-pink-lime theme */
  const COURT_COLORS = {
    AO: { bg: '#4EA0D9', court: '#2D6E8E' },
    RG: { bg: '#E67E22', court: '#C36A1B' },
    USO: { bg: '#6FBE44', court: '#3E8FCB' },
    W: { bg: '#5B9950', a: '#5FA050', b: '#4C8A40' },
  };
  /* a small flat top-down court icon for a Slam: colored surround, a differently-colored court
     rectangle with the sideline/service/center lines, grass-mowing stripes for Wimbledon, a black
     frame, and a ball dot -- inline SVG, no image assets */
  function courtIcon(slam, w, h) {
    const cc = COURT_COLORS[slam], bg = cc.bg, court = cc.court || cc.a;
    const px = w * .13, py = h * .08, cw = w - px * 2, ch = h - py * 2;
    // regulation doubles court: 78ft x 36ft; singles sidelines 4.5ft inside each doubles sideline;
    // service lines 21ft from the net (39ft from each baseline, i.e. 18ft from each baseline); tick = a
    // short center mark at the middle of each baseline
    const singleIn = cw * (4.5 / 36), netY = py + ch * .5, svcTop = py + ch * (18 / 78), svcBot = py + ch * (60 / 78), tick = ch * .025;
    let base = `<rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="${bg}"/>`;
    if (slam === 'W') { const n = 5, sw = w / n; for (let i = 0; i < n; i++) base += `<rect x="${i * sw}" y="0" width="${sw}" height="${h}" fill="${i % 2 ? cc.b : cc.a}"/>`; }
    return base +
      `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${court}"/>` +
      `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="none" stroke="#fff" stroke-width="1.3"/>` +
      `<rect x="${px + singleIn}" y="${py}" width="${cw - singleIn * 2}" height="${ch}" fill="none" stroke="#fff" stroke-width=".9"/>` +
      `<line x1="${px + singleIn}" y1="${svcTop}" x2="${px + cw - singleIn}" y2="${svcTop}" stroke="#fff" stroke-width=".9"/>` +
      `<line x1="${px + singleIn}" y1="${svcBot}" x2="${px + cw - singleIn}" y2="${svcBot}" stroke="#fff" stroke-width=".9"/>` +
      `<line x1="${px + cw / 2}" y1="${svcTop}" x2="${px + cw / 2}" y2="${svcBot}" stroke="#fff" stroke-width=".9"/>` +
      `<line x1="${px}" y1="${netY}" x2="${px + cw}" y2="${netY}" stroke="#fff" stroke-width="1.1"/>` +
      `<line x1="${px + cw / 2}" y1="${py}" x2="${px + cw / 2}" y2="${py + tick}" stroke="#fff" stroke-width=".9"/>` +
      `<line x1="${px + cw / 2}" y1="${py + ch}" x2="${px + cw / 2}" y2="${py + ch - tick}" stroke="#fff" stroke-width=".9"/>` +
      `<circle cx="${px + cw * .74}" cy="${py + ch * .9}" r="${w * .055}" fill="#dde14a" stroke="#000" stroke-width=".6"/>` +
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="2.5" fill="none" stroke="#000" stroke-width="1.6"/>`;
  }
  function courtIconSvg(slam, size, o = {}) {
    const w = size, h = Math.round(size * 1.3);
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(o.label || slam)}" style="vertical-align:-4px;margin-right:6px">${courtIcon(slam, w, h)}</svg>`;
  }

  /* one big stylized court, split into horizontal bands sized by each slice's share of the total --
     used for a "surface split" diagram. slices: [{label, value, color, tip}] */
  function surfaceCourt(el, slices, o = {}) {
    ensureTip();
    const w = o.w || Math.min(420, width(el, 260)), h = o.h || Math.round(w * 1.25);
    const px = w * .1, py = h * .05, cw = w - px * 2, ch = h - py * 2;
    // regulation doubles court: 78ft x 36ft; singles sidelines 4.5ft inside each doubles sideline;
    // service lines 21ft from the net (39ft from each baseline, i.e. 18ft from each baseline); tick = a
    // short center mark at the middle of each baseline
    const singleIn = cw * (4.5 / 36), netY = py + ch * .5, svcTop = py + ch * (18 / 78), svcBot = py + ch * (60 / 78), tick = ch * .025;
    const total = slices.reduce((a, s) => a + s.value, 0) || 1;
    let y = py, bands = '';
    slices.filter(s => s.value > 0).forEach(s => {
      const bh = ch * (s.value / total), mid = y + bh / 2, big = bh > 34;
      bands += `<g${tipAttr(s.tip || `<b>${esc(s.label)}</b><br>${int(s.value)} matches (${pct(s.value / total)})`)}>` +
        `<rect x="${px}" y="${y}" width="${cw}" height="${bh}" fill="${s.color}"/>` +
        (big ? `<text x="${px + cw / 2}" y="${mid - 3}" text-anchor="middle" style="font-weight:700;font-size:16px;fill:#fff">${esc(s.label)}</text>` +
          `<text x="${px + cw / 2}" y="${mid + 16}" text-anchor="middle" style="font-size:12px;fill:#fff">${esc(pct(s.value / total))}</text>`
          : `<text x="${px + cw / 2}" y="${mid + 4}" text-anchor="middle" style="font-weight:700;font-size:12.5px;fill:#fff">${esc(s.label)} · ${esc(pct(s.value / total))}</text>`) +
        `</g>`;
      y += bh;
    });
    const lines = `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="none" stroke="#fff" stroke-width="2.2"/>` +
      `<rect x="${px + singleIn}" y="${py}" width="${cw - singleIn * 2}" height="${ch}" fill="none" stroke="#fff" stroke-width="1.5"/>` +
      `<line x1="${px + singleIn}" y1="${svcTop}" x2="${px + cw - singleIn}" y2="${svcTop}" stroke="#fff" stroke-width="1.5"/>` +
      `<line x1="${px + singleIn}" y1="${svcBot}" x2="${px + cw - singleIn}" y2="${svcBot}" stroke="#fff" stroke-width="1.5"/>` +
      `<line x1="${px + cw / 2}" y1="${svcTop}" x2="${px + cw / 2}" y2="${svcBot}" stroke="#fff" stroke-width="1.5"/>` +
      `<line x1="${px}" y1="${netY}" x2="${px + cw}" y2="${netY}" stroke="#fff" stroke-width="2"/>` +
      `<line x1="${px + cw / 2}" y1="${py}" x2="${px + cw / 2}" y2="${py + tick}" stroke="#fff" stroke-width="1.5"/>` +
      `<line x1="${px + cw / 2}" y1="${py + ch}" x2="${px + cw / 2}" y2="${py + ch - tick}" stroke="#fff" stroke-width="1.5"/>` +
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="4" fill="none" stroke="${C.ink}" stroke-width="2.2"/>`;
    el.innerHTML = wrap(w, h, o.label || 'Surface split', bands + lines);
    if (o.legend !== false) legend(el, slices.map(s => ({ label: `${s.label} — ${int(s.value)} (${pct(s.value / total)})`, color: s.color })));
  }

  /* checklist grid: who has won which Slam. rows [{name, AO,RG,W,USO, career}] */
  function titleGrid(el, rows, slams, names) {
    ensureTip(); const W = width(el), lw = Math.min(150, W * .3), rh = 40, top = 80, H = top + rows.length * rh + 4, cw = (W - lw - 8) / slams.length;
    let s = '';
    const iw = Math.min(30, cw * .5), ih = iw * 1.3;
    slams.forEach((k, j) => { const cx = lw + j * cw + cw / 2;
      s += `<g transform="translate(${cx - iw / 2},2)">${courtIcon(k, iw, ih)}</g><text class="ax" x="${cx}" y="${ih + 16}" text-anchor="middle" style="font-size:12.5px;fill:${C.ink}">${esc(names[k].replace('Australian Open', 'Aus. Open').replace('Roland Garros', 'Roland G.'))}</text>`; });
    rows.forEach((r, i) => { const y = top + i * rh, cy = y + rh / 2;
      if (r.career) s += `<rect x="0" y="${y + 2}" width="${W}" height="${rh - 4}" rx="2" fill="${C.lime}" stroke="${C.ink}" stroke-width="1"/>`;
      s += `<text class="lbl" x="10" y="${cy + 4.5}" style="font-weight:${r.career ? 600 : 400}">${esc(r.name)}</text>`;
      slams.forEach((k, j) => { const cx = lw + j * cw + cw / 2, n = r[k];
        if (n > 0) s += `<g${tipAttr(`<b>${esc(r.name)}</b><br>${n} ${esc(names[k])} title${n > 1 ? 's' : ''}`)}><circle cx="${cx}" cy="${cy}" r="14" fill="${SLAM_COLOR[k]}" stroke="${C.ink}" stroke-width="1.2"/><text class="val" x="${cx}" y="${cy + 4.5}" text-anchor="middle">${n}</text></g>`;
        else s += `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${C.sage}" stroke-width="1.6" stroke-dasharray="2.5 2.5"/>`; });
    });
    el.innerHTML = wrap(W, H, 'Which Grand Slams each player has won', s);
  }

  /* a ring split by share between two values (e.g. a head-to-head win split), with two lines of text in the middle */
  function vsRing(el, a, b, o = {}) {
    const size = o.size || 148, rad = size / 2 - 9, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * rad;
    const total = a + b, ca = o.colorA || C.sage, cb = o.colorB || C.pink;
    const lenA = total ? circ * (a / total) : 0;
    const ring = total
      ? `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${cb}" stroke-width="13"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${ca}" stroke-width="13" stroke-dasharray="${lenA} ${circ - lenA}" transform="rotate(-90 ${cx} ${cy})"/>`
      : `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${C.grid}" stroke-width="13"/>`;
    const s = ring + `<text x="${cx}" y="${cy - 5}" text-anchor="middle" style="font-weight:700;font-size:15px">${esc(o.centerTop || '')}</text>` +
      `<text x="${cx}" y="${cy + 15}" text-anchor="middle" style="font-size:12px;fill:${C.soft}">${esc(o.centerBottom || '')}</text>`;
    el.innerHTML = wrap(size, size, o.label || 'Head-to-head record', s);
  }

  /* donut chart with any number of slices. slices: [{label, value, color}] */
  function donut(el, slices, o = {}) {
    ensureTip();
    const size = o.size || 220, rad = size / 2 - 16, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * rad, sw = o.strokeWidth || 28;
    const total = slices.reduce((a, s) => a + s.value, 0);
    let ring, offset = 0;
    if (!total) ring = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${C.grid}" stroke-width="${sw}"/>`;
    else ring = slices.filter(s => s.value > 0).map(s => {
      const len = circ * (s.value / total);
      const seg = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"${tipAttr(`<b>${esc(s.label)}</b><br>${int(s.value)} (${pct(s.value / total)})`)}/>`;
      offset += len; return seg;
    }).join('');
    const centerText = `<text x="${cx}" y="${cy - 4}" text-anchor="middle" style="font-weight:700;font-size:22px">${esc(o.centerTop != null ? o.centerTop : int(total))}</text>` +
      `<text x="${cx}" y="${cy + 17}" text-anchor="middle" style="font-size:12.5px;fill:${C.soft}">${esc(o.centerBottom || '')}</text>`;
    el.innerHTML = wrap(size, size, o.label || 'Donut chart', ring + centerText);
    if (o.legend !== false) legend(el, slices.map(s => ({ label: `${s.label} — ${int(s.value)} (${total ? pct(s.value / total) : '0%'})`, color: s.color })));
  }

  g.Charts = { C, SLAM_COLOR, SERIES, esc, int, pct, clip, niceTicks, mix, legend, barH, barV, stackedH, pairsV, line, scatter, heatmap, titleGrid, vsRing, donut, courtIcon, courtIconSvg, surfaceCourt, ensureTip, empty };
})(window);
