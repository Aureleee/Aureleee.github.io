import gsap from 'gsap'

const ACC = '#c8ff00'
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const ease = x => 1 - (1 - x) ** 3
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const clamp01 = x => Math.max(0, Math.min(1, x))
const seg = (p, a, b) => clamp01((p - a) / (b - a))

function sized(cv, onResize) {
  const st = { w: 0, h: 0 }
  const size = () => {
    const w = cv.clientWidth * 2, h = cv.clientHeight * 2
    if (w && h && (w !== st.w || h !== st.h)) { st.w = cv.width = w; st.h = cv.height = h; onResize?.(st) }
  }
  size(); addEventListener('resize', size)
  st.check = size
  return st
}

/* ---------- value noise ---------- */
function makeNoise(seed) {
  const N = 256, perm = new Uint8Array(512), val = new Float32Array(N)
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = rnd() }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[perm[i], perm[j]] = [perm[j], perm[i]] }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i]
  const sm = t => t * t * (3 - 2 * t)
  const v = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi)
    const g = (a, b) => val[perm[(perm[(xi + a) & 255] + yi + b) & 255]]
    const a = g(0, 0) + (g(1, 0) - g(0, 0)) * xf, b = g(0, 1) + (g(1, 1) - g(0, 1)) * xf
    return a + (b - a) * yf
  }
  return (x, y, oct = 4) => { let a = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * v(x * f, y * f); n += amp; amp *= 0.5; f *= 2 } return a / n }
}

/* ---------- Thales: oblique drone view (~35°), zoom, generate a tank, zoom out ---------- */
function thales(cv) {
  const ctx = cv.getContext('2d')
  let W = 0, H = 0, bg = null, yh = 0, C = 0, f = 0
  let hN, fN
  let placed = [], cur = null, clock = 0
  const T = 7.5, K = 1.6

  const riverX = Z => 1.6 * Math.sin(Z * 0.55 + 0.8) + 0.5 * Math.sin(Z * 1.3)
  const trackX = Z => -1.2 + 0.9 * Math.sin(Z * 0.8 + 2) + 0.15 * Z
  const forest = (X, Z) => fN(X * 0.45 + 10, Z * 0.45 + 3, 3)
  const height = (X, Z) => hN(X * 0.22 + 5, Z * 0.22 + 2, 4) + 0.5 * Math.exp(-((X - 2.5) ** 2 + (Z - 7) ** 2) * 0.12)
  // projection: ground plane, camera pitched down, Y up
  const proj = (X, Y, Z) => [W / 2 + X * f / Z, yh + (C - Y * f * 0.85) / Z]

  let trees = [], patch = null
  function build() {
    hN = makeNoise(7); fN = makeNoise(31)
    yh = H * 0.16; C = H - yh; f = W * 0.5
    trees = []
    for (let Z = 1.05; Z < 12; Z += 0.07 * Math.max(1, Z * 0.4)) for (let X = -Z * 1.1; X < Z * 1.1; X += 0.07 * Math.max(1, Z * 0.4)) {
      const x = X + (Math.random() - 0.5) * 0.06, z = Z + (Math.random() - 0.5) * 0.06
      if (forest(x, z) > 0.53 && Math.abs(x - riverX(z)) > 0.25 && Math.abs(x - trackX(z)) > 0.1 && Math.random() < 0.8) trees.push([x, z, 0.8 + Math.random() * 0.4])
    }
    trees.sort((p, q) => q[1] - p[1])
    bg = renderScene(0, 0, W, H, K)
    patch = null; placed = []; spawn()
  }

  // renders the region [rx, ry, rw, rh] of the scene (base screen units) at scale K2
  function renderScene(rx, ry, rw, rh, K2) {
    const cnv = document.createElement('canvas'); cnv.width = Math.round(rw * K2); cnv.height = Math.round(rh * K2)
    const b = cnv.getContext('2d'), BW = cnv.width, BH = cnv.height
    b.fillStyle = '#090909'; b.fillRect(0, 0, BW, BH)
    // contour lines, computed per pixel through the inverse projection
    const img = b.getImageData(0, 0, BW, BH), D = img.data, st = 2
    const gw = Math.ceil(BW / st), gh = Math.ceil(BH / st), lev = new Int16Array(gw * gh).fill(-999), fog = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) {
      const sy = ry + j * st / K2
      if (sy < yh + 3) continue
      const Z = C / (sy - yh)
      if (Z > 14) continue
      for (let i = 0; i < gw; i++) {
        const X = (rx + i * st / K2 - W / 2) * Z / f
        lev[j * gw + i] = Math.floor(height(X, Z) * 26); fog[j * gw + i] = Math.max(0, 1 - (Z - 1) / 11)
      }
    }
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = lev[j * gw + i]; if (a === -999) continue
      const r = lev[j * gw + i + 1], d = lev[(j + 1) * gw + i]
      if ((r !== -999 && a !== r) || (d !== -999 && a !== d)) {
        const major = Math.max(a, r, d) % 5 === 0, v = 9 + (major ? 62 : 36) * fog[j * gw + i] ** 0.7
        for (let dy = 0; dy < st; dy++) for (let dx = 0; dx < st; dx++) { const k = 4 * ((j * st + dy) * BW + i * st + dx); D[k] = v; D[k + 1] = v; D[k + 2] = v - 3 }
      }
    }
    b.putImageData(img, 0, 0)
    b.scale(K2, K2); b.translate(-rx, -ry)
    // sky
    if (ry < yh + 2) {
      const sky = b.createLinearGradient(0, 0, 0, yh); sky.addColorStop(0, '#070707'); sky.addColorStop(1, '#141413')
      b.fillStyle = sky; b.fillRect(rx, ry, rw, yh + 2 - ry)
      for (let k = 0; k < 3; k++) {
        b.strokeStyle = ['#2a2a28', '#333331', '#3d3d3a'][k]; b.lineWidth = 1.2; b.beginPath()
        for (let x = 0; x <= W; x += 4) {
          const y = yh - 2 - (hN(x / W * (4 + k * 3) + k * 9, k * 3.3, 3) - 0.3) * H * (0.11 - k * 0.025)
          x ? b.lineTo(x, y) : b.moveTo(x, y)
        }
        b.stroke()
      }
    }
    const ribbon = (fx, wd, fill, line, dash) => {
      const L = [], R = []
      for (let Z = 1.0; Z < 14; Z *= 1.01) { L.push(proj(fx(Z) - wd, 0, Z)); R.push(proj(fx(Z) + wd, 0, Z)) }
      if (fill) { b.beginPath(); L.forEach((p, i) => i ? b.lineTo(...p) : b.moveTo(...p)); [...R].reverse().forEach(p => b.lineTo(...p)); b.closePath(); b.fillStyle = fill; b.fill() }
      b.strokeStyle = line; b.lineWidth = 1.1; b.setLineDash(dash || [])
      for (const S of [L, R]) { b.beginPath(); S.forEach((p, i) => i ? b.lineTo(...p) : b.moveTo(...p)); b.stroke() }
      b.setLineDash([])
    }
    ribbon(riverX, 0.16, '#121a1e', '#2f4048')
    ribbon(trackX, 0.05, null, '#4a4a45', [5, 4])
    for (const [x, z, sz] of trees) {
      const [px, py] = proj(x, 0, z), s = 0.11 * f / z * sz
      if (px < rx - s || px > rx + rw + s || py < ry - s || py > ry + rh + s) continue
      const fogA = Math.max(0.15, 1 - (z - 1) / 11)
      b.fillStyle = '#0a0a0a'; b.strokeStyle = `rgba(150,150,140,${0.55 * fogA})`; b.lineWidth = Math.max(0.6 / K2 * 1.6, s * 0.05)
      b.beginPath(); b.moveTo(px, py - s); b.lineTo(px - s * 0.32, py - s * 0.08); b.lineTo(px + s * 0.32, py - s * 0.08); b.closePath(); b.fill(); b.stroke()
      b.beginPath(); b.moveTo(px, py - s * 0.08); b.lineTo(px, py); b.stroke()
    }
    const hz = b.createLinearGradient(0, yh - 10, 0, yh + H * 0.12); hz.addColorStop(0, 'rgba(18,18,17,0)'); hz.addColorStop(0.3, 'rgba(18,18,17,.75)'); hz.addColorStop(1, 'rgba(18,18,17,0)')
    b.fillStyle = hz; b.fillRect(rx, yh - 10, rw, H * 0.13)
    return cnv
  }

  /* tank as projected 3D boxes */
  function tankBoxes(Xc, Zc, th) {
    const boxes = [
      [-0.08, 0.08, 0.03, 0.05, 0, 0.028], [-0.08, 0.08, -0.05, -0.03, 0, 0.028],  // tracks
      [-0.075, 0.075, -0.034, 0.034, 0.012, 0.04],                                    // hull
      [-0.04, 0.02, -0.024, 0.024, 0.04, 0.06],                                       // turret
      [0.02, 0.125, -0.004, 0.004, 0.046, 0.054],                                     // barrel
    ]
    const c = Math.cos(th), s = Math.sin(th), camH = C / (f * 0.85)
    return boxes.map(([x0, x1, l0, l1, y0, y1]) => {
      const P = []
      for (const x of [x0, x1]) for (const l of [l0, l1]) for (const y of [y0, y1]) P.push([Xc + x * c - l * s, y, Zc + x * s + l * c])
      // faces: indices in P (x major, l, y)
      const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]
      const ctr = P.reduce((a, p) => [a[0] + p[0] / 8, a[1] + p[1] / 8, a[2] + p[2] / 8], [0, 0, 0])
      const vis = faces.filter(fc => {
        const m = fc.reduce((a, i) => [a[0] + P[i][0] / 4, a[1] + P[i][1] / 4, a[2] + P[i][2] / 4], [0, 0, 0])
        const n = [m[0] - ctr[0], m[1] - ctr[1], m[2] - ctr[2]]
        return n[0] * (m[0]) + n[1] * (m[1] - camH) + n[2] * m[2] < 0
      })
      return { P: P.map(p => proj(...p)), vis, d: Math.hypot(ctr[0], ctr[2]) }
    }).sort((a, b) => b.d - a.d)
  }
  function drawTank(boxes, stroke, lw) {
    ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'
    for (const bx of boxes) for (const fc of bx.vis) {
      ctx.beginPath(); fc.forEach((i, k) => k ? ctx.lineTo(...bx.P[i]) : ctx.moveTo(...bx.P[i])); ctx.closePath()
      ctx.fillStyle = '#0c0c0c'; ctx.fill(); ctx.stroke()
    }
  }
  function tankPts(boxes, step) {
    const pts = []
    for (const bx of boxes) for (const fc of bx.vis) for (let k = 0; k < 4; k++) {
      const a = bx.P[fc[k]], b = bx.P[fc[(k + 1) % 4]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
      for (let j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n])
    }
    return pts
  }
  const bboxOf = boxes => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const b of boxes) for (const p of b.P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]) } return [x0, y0, x1, y1] }

  function spawn() {
    let best = null
    for (let k = 0; k < 60; k++) {
      const Z = 1.6 + Math.random() * 2.2, X = (Math.random() - 0.5) * 1.4 * Z
      if (forest(X, Z) > 0.46 || Math.abs(X - riverX(Z)) < 0.35) continue
      const far = Math.min(2, ...placed.map(t => Math.hypot(t.X - X, t.Z - Z)))
      const sc = far + Math.random() * 0.3
      if (!best || sc > best.sc) best = { X, Z, sc }
    }
    best = best || { X: 0.3, Z: 2.2 }
    const th = Math.random() * Math.PI * 2, boxes = tankBoxes(best.X, best.Z, th)
    const [x0, y0, x1, y1] = bboxOf(boxes), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    cur = { ...best, th, boxes, cx, cy, bb: [x0, y0, x1, y1], pts: tankPts(boxes, 0.35).map(([x, y]) => ({ x, y, ex: randn(), ey: randn() })) }
    clock = 0
    patch = null
    setTimeout(() => { const rw = W / 3.6 * 1.25, rh = H / 3.6 * 1.25, r = [cx - rw / 2, cy - rh / 2, rw, rh]; patch = { r, c: renderScene(...r, 3.6) } }, 30)
  }

  const st = sized(cv, ({ w, h }) => { W = w; H = h; build() })

  gsap.ticker.add((_, dt) => {
    if (!bg) { st.check(); return }
    clock += dt / 1000
    const p = clock / T, c = cur, Z = 3.6
    const k = easeIO(seg(p, 0.16, 0.34)) * (1 - easeIO(seg(p, 0.78, 0.94)))
    const z = 1 + (Z - 1) * k
    const camX = W / 2 + (c.cx - W / 2) * k, camY = H / 2 + (c.cy - H / 2) * k
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-camX, -camY)
    ctx.drawImage(bg, 0, 0, W, H)
    if (patch && z > 1.2) { ctx.globalAlpha = Math.min(1, (z - 1.2) / 0.8); ctx.drawImage(patch.c, ...patch.r); ctx.globalAlpha = 1 }
    for (const t of placed) {
      drawTank(t.boxes, 'rgba(241,239,233,.9)', 1.3 / z)
      const [x0, y0, x1, y1] = t.bb; ctx.strokeStyle = ACC; ctx.lineWidth = 1.3 / z; ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6)
    }
    const R = Math.max(c.bb[2] - c.bb[0], c.bb[3] - c.bb[1]) * 0.85
    const ell = (r) => { ctx.beginPath(); ctx.ellipse(c.cx, c.cy, r, r * 0.62, 0, 0, 7) }
    if (p > 0.34 && p < 0.5) {
      const m = ease(seg(p, 0.34, 0.42))
      ctx.strokeStyle = ACC; ctx.setLineDash([4 / z, 4 / z]); ctx.lineWidth = 1.4 / z
      ell(R * m); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = `rgba(200,255,0,${0.08 * m})`; ctx.fill()
    }
    if (p > 0.42 && p < 0.66) {
      const m = ease(seg(p, 0.42, 0.64)), a = Math.sin(m * Math.PI / 2), b = Math.cos(m * Math.PI / 2)
      ctx.strokeStyle = 'rgba(200,255,0,.45)'; ctx.setLineDash([4 / z, 4 / z]); ctx.lineWidth = 1.4 / z
      ell(R); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = m > 0.9 ? 'rgba(241,239,233,.95)' : ACC
      const sz = 1.6 / z
      for (const q of c.pts) ctx.fillRect(c.cx + a * (q.x - c.cx) + b * q.ex * R * 0.45, c.cy + a * (q.y - c.cy) + b * q.ey * R * 0.3, sz, sz)
    }
    if (p >= 0.64) {
      drawTank(c.boxes, 'rgba(241,239,233,.95)', 1.3 / z)
      const m = ease(seg(p, 0.64, 0.7)), [x0, y0, x1, y1] = c.bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      const hw = (x1 - x0) / 2 + 3, hh = (y1 - y0) / 2 + 3
      ctx.strokeStyle = ACC; ctx.lineWidth = 1.3 / z; ctx.strokeRect(cx - hw * m, cy - hh * m, 2 * hw * m, 2 * hh * m)
    }
    ctx.restore()

    // drone HUD
    const fs = Math.max(15, W / 46)
    ctx.font = `${fs}px JetBrains Mono`; ctx.fillStyle = '#8b8b84'
    ctx.fillText(`ALT 50 m · PITCH −35°`, 24, 40); ctx.fillText(`ZOOM ×${z.toFixed(1)}`, 24, 40 + fs * 1.4)
    if ((clock % 1.2) < 0.7) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(W - 28, 34, 7, 0, 7); ctx.fill() }
    ctx.fillStyle = '#8b8b84'; ctx.textAlign = 'right'; ctx.fillText('REC', W - 44, 40); ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(241,239,233,.35)'; ctx.lineWidth = 2; const CC = 26, mg = 14
    ;[[mg, mg, 1, 1], [W - mg, mg, -1, 1], [mg, H - mg, 1, -1], [W - mg, H - mg, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x + sx * CC, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * CC); ctx.stroke() })
    const r = ease(seg(p, 0.02, 0.15)) * (1 - seg(p, 0.78, 0.82))
    const tx = W / 2 + (c.cx - camX) * z, ty = H / 2 + (c.cy - camY) * z
    const rx = W / 2 + (tx - W / 2) * r, ry = H / 2 + (ty - H / 2) * r
    ctx.strokeStyle = 'rgba(241,239,233,.6)'; ctx.beginPath()
    ctx.moveTo(rx - 18, ry); ctx.lineTo(rx - 6, ry); ctx.moveTo(rx + 6, ry); ctx.lineTo(rx + 18, ry); ctx.moveTo(rx, ry - 18); ctx.lineTo(rx, ry - 6); ctx.moveTo(rx, ry + 6); ctx.lineTo(rx, ry + 18); ctx.stroke()
    ctx.fillStyle = ACC
    const label = p < 0.34 ? 'target area' : p < 0.42 ? 'inpaint mask' : p < 0.64 ? `denoising t=${String(Math.round((1 - seg(p, 0.42, 0.64)) * 1000)).padStart(4, '0')}` : p < 0.78 ? `tank · coco #${placed.length + 1}` : 'new sample in dataset'
    ctx.fillText(label, 24, H - 28)

    if (p >= 1) {
      placed.push({ boxes: c.boxes, bb: c.bb, X: c.X, Z: c.Z })
      if (placed.length > 2) placed = []
      spawn()
    }
  })
}

/* ---------- RetinaNet: ResNet bottom-up + FPN top-down + heads + NMS ---------- */
function retina(cv) {
  const ctx = cv.getContext('2d')
  let W = 0, H = 0, L = null
  const glow = {}
  let parts = [], clock = 0
  const bars = [3, 4, 5, 6, 7].map(() => [0.3 + Math.random() * 0.7, 0.2 + Math.random() * 0.5, 0.1 + Math.random() * 0.4])

  function layout() {
    const xl = W * 0.22, xr = W * 0.52, xc = W * 0.72, xb = W * 0.8, xbus = W * 0.94, gap = H * 0.12, y2 = H * 0.76
    const C = { C2: [xl, y2, 0.28], C3: [xl, y2 - gap, 0.21], C4: [xl, y2 - 2 * gap, 0.15], C5: [xl, y2 - 3 * gap, 0.095] }
    const P = { P3: [xr, C.C3[1], 0.2], P4: [xr, C.C4[1], 0.145], P5: [xr, C.C5[1], 0.1], P6: [xr, y2 - 4 * gap, 0.07], P7: [xr, y2 - 5 * gap, 0.05] }
    for (const o of [C, P]) for (const k in o) o[k][2] *= W
    const right = n => [n[0] + n[2] / 2, n[1]], left = n => [n[0] - n[2] / 2, n[1]]
    const inp = [xl, H * 0.9], out = [W * 0.8, H * 0.9]
    const paths = []
    const add = (group, pts, end) => paths.push({ group, pts, end, len: pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) })
    add(0, [inp, [xl, C.C2[1]]], 'C2'); add(0, [[xl, C.C2[1]], [xl, C.C3[1]]], 'C3'); add(0, [[xl, C.C3[1]], [xl, C.C4[1]]], 'C4'); add(0, [[xl, C.C4[1]], [xl, C.C5[1]]], 'C5')
    for (const l of [3, 4]) add(1, [right(C['C' + l]), [xr - P['P' + l][2] / 2 - 18, P['P' + l][1]]], 'S' + l)
    add(1, [right(C.C5), left(P.P5)], 'P5')
    add(2, [[xr, P.P5[1]], [xr - P.P4[2] / 2 - 18, P.P4[1]]], 'S4'); add(2, [[xr, P.P4[1]], [xr - P.P3[2] / 2 - 18, P.P3[1]]], 'S3')
    add(2, [[xl + C.C5[2] / 2, C.C5[1] - 6], [xr - 40, P.P6[1] + 16], left(P.P6)], 'P6'); add(2, [[xr, P.P6[1]], [xr, P.P7[1]]], 'P7')
    const q = Math.max(12, W * 0.03)
    for (const l of [3, 4, 5, 6, 7]) {
      const y = P['P' + l][1]
      add(3, [right(P['P' + l]), [xc - q, y]], 'H' + l)
      add(4, [[xb + q, y], [xbus, y], [xbus, out[1]], [out[0] + W * 0.06, out[1]]], 'OUT')
    }
    L = { C, P, paths, inp, out, xl, xr, xc, xb, xbus, q }
  }
  const st = sized(cv, ({ w, h }) => { W = w; H = h; layout() })

  function slab(n, name, lit) {
    const [x, y, w] = n, h = Math.max(10, H * 0.03), sk = h * 0.9
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x + w / 2 + sk, y - h / 2); ctx.lineTo(x - w / 2 + sk, y - h / 2); ctx.closePath()
    ctx.fillStyle = '#131313'; ctx.fill()
    if (lit > 0.02) { ctx.fillStyle = `rgba(200,255,0,${0.55 * lit})`; ctx.fill() }
    ctx.strokeStyle = lit > 0.05 ? ACC : '#4a4a46'; ctx.lineWidth = 1.6; ctx.stroke()
    ctx.fillStyle = lit > 0.3 ? ACC : '#8b8b84'; ctx.font = `${Math.max(14, W / 52)}px JetBrains Mono`
    const isC = name[0] === 'C'
    ctx.textAlign = isC ? 'right' : 'left'
    ctx.fillText(name, isC ? x - w / 2 - 10 : x + w / 2 + sk + 6, y - h * 0.9); ctx.textAlign = 'left'
  }
  const at = (path, d) => {
    let r = d
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (r <= l) return [a[0] + (b[0] - a[0]) * r / l, a[1] + (b[1] - a[1]) * r / l]
      r -= l
    }
    return path.pts[path.pts.length - 1]
  }

  gsap.ticker.add((_, dtm) => {
    if (!L) { st.check(); return }
    const dt = dtm / 1000; clock += dt
    const ph = (clock % 5) / 5
    const centers = [0.1, 0.3, 0.45, 0.62, 0.78]
    for (const p of L.paths) {
      const rate = Math.max(0, 1 - Math.abs(ph - centers[p.group]) / 0.12) * (p.group === 4 ? 10 : 26)
      if (Math.random() < rate * dt) parts.push({ p, d: 0, v: H * (0.5 + Math.random() * 0.25) })
    }
    for (const k in glow) glow[k] *= Math.exp(-dt * (k === 'OUT' ? 0.9 : 2.2))

    ctx.fillStyle = '#070707'; ctx.fillRect(0, 0, W, H)
    ctx.setLineDash([5, 6]); ctx.lineDashOffset = -clock * 30; ctx.strokeStyle = '#2e2e2c'; ctx.lineWidth = 1.5
    for (const p of L.paths) { ctx.beginPath(); p.pts.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); ctx.stroke() }
    ctx.setLineDash([])
    const fs = Math.max(13, W / 58)
    ctx.font = `${fs}px JetBrains Mono`
    // input image
    const s = W * 0.08, [ix, iy] = L.inp
    ctx.strokeStyle = '#8b8b84'; ctx.lineWidth = 1.5; ctx.strokeRect(ix - s / 2, iy - s / 3, s, s * 0.66)
    ctx.beginPath(); ctx.moveTo(ix - s / 2, iy + s / 3); ctx.lineTo(ix - s / 8, iy - s / 8); ctx.lineTo(ix + s / 6, iy + s / 6); ctx.lineTo(ix + s / 2, iy - s / 6); ctx.stroke()
    ctx.fillStyle = '#6a6a64'; ctx.textAlign = 'center'; ctx.fillText('image', ix, iy + s / 3 + fs * 1.3)
    // output with detections after NMS
    const [ox, oy] = L.out, g = glow.OUT || 0
    ctx.strokeStyle = '#8b8b84'; ctx.strokeRect(ox - s / 2, oy - s / 3, s, s * 0.66)
    ctx.beginPath(); ctx.moveTo(ox - s / 2, oy + s / 3); ctx.lineTo(ox - s / 8, oy - s / 8); ctx.lineTo(ox + s / 6, oy + s / 6); ctx.lineTo(ox + s / 2, oy - s / 6); ctx.stroke()
    if (g > 0.05) { ctx.strokeStyle = `rgba(200,255,0,${Math.min(1, g * 1.5)})`; ctx.lineWidth = 2; ctx.strokeRect(ox - s * 0.28, oy - s * 0.22, s * 0.3, s * 0.36); ctx.strokeRect(ox + s * 0.08, oy - s * 0.26, s * 0.3, s * 0.28) }
    ctx.fillStyle = g > 0.3 ? ACC : '#6a6a64'; ctx.fillText('NMS → boxes', ox, oy + s / 3 + fs * 1.3); ctx.textAlign = 'left'
    for (const k in L.C) slab(L.C[k], k, glow[k] || 0)
    for (const k in L.P) slab(L.P[k], k, glow[k] || 0)
    for (const l of [3, 4]) {
      const n = L.P['P' + l], x = L.xr - n[2] / 2 - 18, y = n[1], gg = glow['S' + l] || 0
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = gg > 0.1 ? `rgba(200,255,0,${0.4 * gg})` : '#070707'; ctx.fill(); ctx.strokeStyle = gg > 0.1 ? ACC : '#8b8b84'; ctx.lineWidth = 1.6; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke()
    }
    // heads: class scores (bars) and box regression (box + offsets)
    const q = L.q
    ;[3, 4, 5, 6, 7].forEach((l, i) => {
      const y = L.P['P' + l][1], gg = glow['H' + l] || 0, on = gg > 0.1
      ctx.strokeStyle = on ? ACC : '#4a4a46'; ctx.lineWidth = 1.3
      ctx.strokeRect(L.xc - q, y - q / 2, 2 * q, q)
      bars[i].forEach((v, k) => {
        const bw = (2 * q - 8) / 3, bh = (q - 6) * v * (on ? 1 : 0.5)
        ctx.fillStyle = on ? (k === 0 ? ACC : 'rgba(200,255,0,.45)') : '#2e2e2c'
        ctx.fillRect(L.xc - q + 3 + k * (bw + 1), y + q / 2 - 3 - bh, bw, bh)
      })
      ctx.strokeRect(L.xb - q, y - q / 2, 2 * q, q)
      ctx.setLineDash([3, 3]); ctx.strokeRect(L.xb - q * 0.55, y - q * 0.3, q * 1.1, q * 0.6); ctx.setLineDash([])
      if (on) { ctx.beginPath(); ctx.moveTo(L.xb - q * 0.55, y - q * 0.3); ctx.lineTo(L.xb - q * 0.85, y - q * 0.45); ctx.moveTo(L.xb + q * 0.55, y + q * 0.3); ctx.lineTo(L.xb + q * 0.85, y + q * 0.45); ctx.stroke() }
      ctx.strokeStyle = '#2e2e2c'; ctx.beginPath(); ctx.moveTo(L.xc + q, y); ctx.lineTo(L.xb - q, y); ctx.stroke()
    })
    ctx.fillStyle = '#6a6a64'; ctx.textAlign = 'center'
    const ty = H * 0.045 + 6
    ctx.fillText('ResNet ↑', L.xl, ty); ctx.fillText('FPN ↓', L.xr, ty); ctx.fillText('class', L.xc, ty); ctx.fillText('box', L.xb, ty)
    ctx.textAlign = 'left'
    parts = parts.filter(pt => {
      pt.d += pt.v * dt
      if (pt.d >= pt.p.len) {
        const e = pt.p.end; glow[e] = Math.min(1, (glow[e] || 0) + (e === 'OUT' ? 0.2 : 0.12))
        if (e[0] === 'S') glow['P' + e[1]] = Math.min(1, (glow['P' + e[1]] || 0) + 0.08)
        return false
      }
      for (let k = 3; k >= 0; k--) {
        const [x, y] = at(pt.p, Math.max(0, pt.d - k * 7))
        ctx.fillStyle = k ? `rgba(200,255,0,${0.18 * (4 - k)})` : ACC; ctx.fillRect(x - 2, y - 2, 4, 4)
      }
      return true
    })
  })
}

/* ---------- SyncTweedies: overlapping views converging together ---------- */
function tiles(cv) {
  const ctx = cv.getContext('2d')
  const st = sized(cv)
  const pts = Array.from({ length: 900 }, () => [Math.random(), Math.random(), randn(), randn()])
  let ph = Math.random() * 10
  gsap.ticker.add(() => {
    const { w, h } = st
    if (!w || !h) { st.check(); return }
    ph += 0.012
    ctx.fillStyle = '#070707'; ctx.fillRect(0, 0, w, h)
    const n = 5, tw = w / (n - 1) * 0.9, k = (Math.sin(ph) + 1) / 2
    for (let i = 0; i < n; i++) {
      const x = i * (w - tw) / (n - 1)
      ctx.strokeStyle = i % 2 ? '#333' : '#555'; ctx.lineWidth = 2
      ctx.strokeRect(x + 4, 20 + i * 6, tw - 8, h - 40 - i * 12)
    }
    // the points of the wave come from the page-wide particle flow (flow.js)
  })
}

export function initCards() {
  const map = { tiles, insert: thales, fpn: retina }
  document.querySelectorAll('canvas.mini').forEach(cv => map[cv.dataset.kind]?.(cv))
}
