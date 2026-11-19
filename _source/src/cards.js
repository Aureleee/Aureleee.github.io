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

/* ---------- top-down tank ---------- */
function drawTankTop(c, x, y, s, ang) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s)
  c.strokeRect(-40, -27, 80, 12); c.strokeRect(-40, 15, 80, 12)
  c.beginPath(); for (let i = -32; i <= 32; i += 8) { c.moveTo(i, -27); c.lineTo(i, -15); c.moveTo(i, 15); c.lineTo(i, 27) } c.stroke()
  c.strokeRect(-36, -15, 72, 30)
  c.beginPath(); c.arc(-4, 0, 13, 0, 7); c.stroke()
  c.strokeRect(8, -2.5, 46, 5)
  c.beginPath(); c.arc(-9, -5, 3.5, 0, 7); c.stroke()
  c.restore()
}
function tankTopPoints(s, ang) {
  const R = Math.ceil(60 * s) + 4, off = document.createElement('canvas'); off.width = off.height = 2 * R
  const o = off.getContext('2d'); o.strokeStyle = '#fff'; o.lineWidth = 2 / s
  drawTankTop(o, R, R, s, ang)
  const d = o.getImageData(0, 0, 2 * R, 2 * R).data, pts = []
  const st = Math.max(1, Math.round(s * 0.6))
  for (let y = 0; y < 2 * R; y += st) for (let x = 0; x < 2 * R; x += st) if (d[4 * (y * 2 * R + x) + 3] > 90) pts.push([x - R, y - R])
  return pts
}

/* ---------- Thales: drone view, zoom in, generate a tank, zoom out ---------- */
function thales(cv) {
  const ctx = cv.getContext('2d')
  let world = null, forestN = null, W = 0, H = 0
  let placed = [], cur = null, clock = 0
  const T = 7.5

  function buildWorld() {
    const K = 2, ww = W * K, wh = H * K
    const hN = makeNoise(7), fN = makeNoise(31)
    forestN = (x, y) => fN(x / W * 3.2, y / H * 3.2, 3)
    const height = (x, y) => hN(x / W * 1.6 + 3, y / H * 1.6 + 1, 4) + 0.35 * Math.exp(-(((x / W - 0.7) ** 2) + ((y / H - 0.3) ** 2)) * 9)
    world = document.createElement('canvas'); world.width = ww; world.height = wh
    const b = world.getContext('2d')
    const gw = Math.ceil(ww / 2), gh = Math.ceil(wh / 2), hm = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) hm[j * gw + i] = height(i * 2 / K, j * 2 / K) * 22
    const img = b.createImageData(ww, wh), D = img.data
    for (let k = 0; k < D.length; k += 4) { D[k] = 9; D[k + 1] = 9; D[k + 2] = 9; D[k + 3] = 255 }
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = Math.floor(hm[j * gw + i]), r = Math.floor(hm[j * gw + i + 1]), d = Math.floor(hm[(j + 1) * gw + i])
      if (a !== r || a !== d) {
        const v = Math.max(a, r, d) % 5 === 0 ? 70 : 44
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const k = 4 * ((j * 2 + dy) * ww + i * 2 + dx); D[k] = v; D[k + 1] = v; D[k + 2] = v - 4 }
      }
    }
    b.putImageData(img, 0, 0)
    b.scale(K, K)
    // river
    b.strokeStyle = '#1f2a30'; b.lineWidth = 7; b.lineCap = 'round'
    b.beginPath(); b.moveTo(-10, H * 0.78); b.bezierCurveTo(W * 0.3, H * 0.62, W * 0.45, H * 0.98, W + 10, H * 0.82); b.stroke()
    b.strokeStyle = '#2f4048'; b.lineWidth = 1.2; b.stroke()
    // dirt track
    b.setLineDash([6, 5]); b.strokeStyle = '#55554f'; b.lineWidth = 1.3
    b.beginPath(); b.moveTo(W * 0.05, -10); b.bezierCurveTo(W * 0.35, H * 0.35, W * 0.15, H * 0.55, W * 0.55, H * 0.7); b.bezierCurveTo(W * 0.8, H * 0.8, W * 0.75, H * 0.95, W * 0.9, H + 10); b.stroke()
    b.setLineDash([])
    // forest canopies seen from above
    const sp = Math.max(7, W / 110)
    for (let y = 0; y < H; y += sp) for (let x = 0; x < W; x += sp) {
      const jx = x + (Math.random() - 0.5) * sp, jy = y + (Math.random() - 0.5) * sp
      if (forestN(jx, jy) > 0.53 && Math.random() < 0.85) {
        const r = sp * (0.35 + Math.random() * 0.3)
        b.fillStyle = '#0c0c0b'; b.strokeStyle = '#3d3d38'; b.lineWidth = 0.9
        b.beginPath(); b.arc(jx, jy, r, 0, 7); b.fill(); b.stroke()
        b.fillStyle = '#2b2b27'; b.fillRect(jx - 0.6, jy - 0.6, 1.2, 1.2)
      }
    }
    b.fillStyle = '#6a6a64'; b.font = `${Math.max(9, W / 70)}px JetBrains Mono`
    b.fillText('▲ 1482', W * 0.7 - 10, H * 0.3)
    placed = []; spawn()
  }

  function spawn() {
    let best = null
    for (let k = 0; k < 40; k++) {
      const x = W * (0.15 + Math.random() * 0.7), y = H * (0.18 + Math.random() * 0.64)
      const far = Math.min(1, ...placed.map(t => Math.hypot(t.x - x, t.y - y) / (W * 0.3)))
      const score = (1 - forestN(x, y)) + far + Math.random() * 0.2
      if (forestN(x, y) < 0.47 && (!best || score > best.score)) best = { x, y, score }
    }
    best = best || { x: W * 0.5, y: H * 0.5 }
    const s = W / 1500, ang = Math.random() * Math.PI * 2
    cur = { x: best.x, y: best.y, s, ang, pts: tankTopPoints(s * 3.4, ang).map(([px, py]) => ({ tx: best.x + px / 3.4, ty: best.y + py / 3.4, ex: randn(), ey: randn() })) }
    clock = 0
  }

  const st = sized(cv, ({ w, h }) => { W = w; H = h; buildWorld() })

  gsap.ticker.add((_, dt) => {
    if (!world) { st.check(); return }
    clock += dt / 1000
    const p = clock / T, c = cur, Z = 3.4
    const k = easeIO(seg(p, 0.16, 0.34)) * (1 - easeIO(seg(p, 0.78, 0.94)))
    const z = 1 + (Z - 1) * k
    const camX = W / 2 + (c.x - W / 2) * k, camY = H / 2 + (c.y - H / 2) * k
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#090909'; ctx.fillRect(0, 0, W, H)
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-camX, -camY)
    ctx.drawImage(world, 0, 0, W, H)
    for (const t of placed) {
      ctx.lineWidth = 1.6 / z; ctx.strokeStyle = 'rgba(241,239,233,.9)'; drawTankTop(ctx, t.x, t.y, t.s, t.ang)
      const L = 34 * t.s; ctx.strokeStyle = ACC; ctx.lineWidth = 1.4 / z; ctx.strokeRect(t.x - L, t.y - L, 2 * L, 2 * L)
    }
    const R = 70 * c.s
    if (p > 0.34 && p < 0.5) {
      const m = ease(seg(p, 0.34, 0.42))
      ctx.strokeStyle = ACC; ctx.setLineDash([4 / z, 4 / z]); ctx.lineWidth = 1.5 / z
      ctx.beginPath(); ctx.arc(c.x, c.y, R * m, 0, 7); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = `rgba(200,255,0,${0.07 * m})`; ctx.fill()
    }
    if (p > 0.42 && p < 0.66) {
      const m = ease(seg(p, 0.42, 0.64)), a = Math.sin(m * Math.PI / 2), b = Math.cos(m * Math.PI / 2)
      ctx.strokeStyle = 'rgba(200,255,0,.45)'; ctx.setLineDash([4 / z, 4 / z]); ctx.lineWidth = 1.5 / z
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = m > 0.9 ? 'rgba(241,239,233,.95)' : ACC
      const sz = 1.7 / z
      for (const q of c.pts) ctx.fillRect(c.x + a * (q.tx - c.x) + b * q.ex * R * 0.42, c.y + a * (q.ty - c.y) + b * q.ey * R * 0.42, sz, sz)
    }
    if (p >= 0.64) {
      ctx.lineWidth = 1.6 / z; ctx.strokeStyle = 'rgba(241,239,233,.95)'; drawTankTop(ctx, c.x, c.y, c.s, c.ang)
      const L = 34 * c.s, m = ease(seg(p, 0.64, 0.7))
      ctx.strokeStyle = ACC; ctx.lineWidth = 1.4 / z; ctx.strokeRect(c.x - L * m, c.y - L * m, 2 * L * m, 2 * L * m)
    }
    ctx.restore()

    // drone HUD
    const fs = Math.max(15, W / 46)
    ctx.font = `${fs}px JetBrains Mono`; ctx.fillStyle = '#8b8b84'
    ctx.fillText(`ALT ${Math.round(50 / z)} m`, 24, 40); ctx.fillText(`ZOOM ×${z.toFixed(1)}`, 24, 40 + fs * 1.4)
    if ((clock % 1.2) < 0.7) { ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(W - 28, 34, 7, 0, 7); ctx.fill() }
    ctx.fillStyle = '#8b8b84'; ctx.textAlign = 'right'; ctx.fillText('REC', W - 44, 40); ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(241,239,233,.35)'; ctx.lineWidth = 2; const C = 26, mg = 14
    ;[[mg, mg, 1, 1], [W - mg, mg, -1, 1], [mg, H - mg, 1, -1], [W - mg, H - mg, -1, -1]].forEach(([x, y, sx, sy]) => { ctx.beginPath(); ctx.moveTo(x + sx * C, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * C); ctx.stroke() })
    const r = ease(seg(p, 0.02, 0.15)) * (1 - seg(p, 0.78, 0.82))
    const tx = W / 2 + (c.x - camX) * z, ty = H / 2 + (c.y - camY) * z
    const rx = W / 2 + (tx - W / 2) * r, ry = H / 2 + (ty - H / 2) * r
    ctx.strokeStyle = 'rgba(241,239,233,.6)'; ctx.beginPath()
    ctx.moveTo(rx - 18, ry); ctx.lineTo(rx - 6, ry); ctx.moveTo(rx + 6, ry); ctx.lineTo(rx + 18, ry); ctx.moveTo(rx, ry - 18); ctx.lineTo(rx, ry - 6); ctx.moveTo(rx, ry + 6); ctx.lineTo(rx, ry + 18); ctx.stroke()
    ctx.fillStyle = ACC
    const label = p < 0.34 ? 'target area' : p < 0.42 ? 'inpaint mask' : p < 0.64 ? `denoising t=${String(Math.round((1 - seg(p, 0.42, 0.64)) * 1000)).padStart(4, '0')}` : p < 0.78 ? `tank · coco #${placed.length + 1}` : 'new sample in dataset'
    ctx.fillText(label, 24, H - 28)
    ctx.strokeStyle = '#8b8b84'; ctx.beginPath(); ctx.moveTo(W - 114, H - 34); ctx.lineTo(W - 24, H - 34); ctx.moveTo(W - 114, H - 40); ctx.lineTo(W - 114, H - 28); ctx.moveTo(W - 24, H - 40); ctx.lineTo(W - 24, H - 28); ctx.stroke()
    ctx.fillStyle = '#8b8b84'; ctx.textAlign = 'right'; ctx.fillText(`${Math.round(40 / z)} m`, W - 24, H - 46); ctx.textAlign = 'left'

    if (p >= 1) {
      placed.push({ x: c.x, y: c.y, s: c.s, ang: c.ang })
      if (placed.length > 2) placed = []
      spawn()
    }
  })
}

/* ---------- RetinaNet: ResNet bottom-up + FPN top-down + heads ---------- */
function retina(cv) {
  const ctx = cv.getContext('2d')
  let W = 0, H = 0, L = null
  const glow = {}
  let parts = [], clock = 0

  function layout() {
    const xl = W * 0.27, xr = W * 0.62, xh = W * 0.86, gap = H * 0.125, y2 = H * 0.8
    const C = { C2: [xl, y2, 0.30], C3: [xl, y2 - gap, 0.23], C4: [xl, y2 - 2 * gap, 0.16], C5: [xl, y2 - 3 * gap, 0.10] }
    const P = { P3: [xr, C.C3[1], 0.22], P4: [xr, C.C4[1], 0.16], P5: [xr, C.C5[1], 0.11], P6: [xr, y2 - 4 * gap, 0.08], P7: [xr, y2 - 5 * gap, 0.055] }
    for (const o of [C, P]) for (const k in o) o[k][2] *= W
    const right = n => [n[0] + n[2] / 2, n[1]], left = n => [n[0] - n[2] / 2, n[1]]
    const inp = [xl, H * 0.93]
    const paths = []
    const add = (group, pts, end) => paths.push({ group, pts, end, len: pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) })
    add(0, [inp, [xl, C.C2[1]]], 'C2'); add(0, [[xl, C.C2[1]], [xl, C.C3[1]]], 'C3'); add(0, [[xl, C.C3[1]], [xl, C.C4[1]]], 'C4'); add(0, [[xl, C.C4[1]], [xl, C.C5[1]]], 'C5')
    for (const l of [3, 4]) add(1, [right(C['C' + l]), [xr - P['P' + l][2] / 2 - 18, P['P' + l][1]]], 'S' + l)
    add(1, [right(C.C5), left(P.P5)], 'P5')
    add(2, [[xr, P.P5[1]], [xr - P.P4[2] / 2 - 18, P.P4[1]]], 'S4'); add(2, [[xr, P.P4[1]], [xr - P.P3[2] / 2 - 18, P.P3[1]]], 'S3')
    add(2, [[xl + C.C5[2] / 2, C.C5[1] - 6], [xr - 50, P.P6[1] + 20], left(P.P6)], 'P6'); add(2, [[xr, P.P6[1]], [xr, P.P7[1]]], 'P7')
    for (const l of [3, 4, 5, 6, 7]) add(3, [right(P['P' + l]), [xh - 16, P['P' + l][1]]], 'H' + l)
    L = { C, P, paths, inp, xh, xl, xr }
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
    ctx.fillText(name, isC ? x - w / 2 - 10 : x + w / 2 + sk + 8, y + 5); ctx.textAlign = 'left'
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
    const ph = (clock % 4.2) / 4.2
    const centers = [0.15, 0.38, 0.55, 0.76]
    for (const p of L.paths) {
      const rate = Math.max(0, 1 - Math.abs(ph - centers[p.group]) / 0.14) * 26
      if (Math.random() < rate * dt) parts.push({ p, d: 0, v: H * (0.45 + Math.random() * 0.25) })
    }
    for (const k in glow) glow[k] *= Math.exp(-dt * 2.2)

    ctx.fillStyle = '#070707'; ctx.fillRect(0, 0, W, H)
    ctx.setLineDash([5, 6]); ctx.lineDashOffset = -clock * 30; ctx.strokeStyle = '#2e2e2c'; ctx.lineWidth = 1.5
    for (const p of L.paths) { ctx.beginPath(); p.pts.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); ctx.stroke() }
    ctx.setLineDash([])
    const s = W * 0.07; ctx.strokeStyle = '#8b8b84'; ctx.lineWidth = 1.5; ctx.strokeRect(L.inp[0] - s / 2, L.inp[1] - s / 3, s, s * 0.66)
    ctx.beginPath(); ctx.moveTo(L.inp[0] - s / 2, L.inp[1] + s / 3); ctx.lineTo(L.inp[0] - s / 8, L.inp[1] - s / 8); ctx.lineTo(L.inp[0] + s / 6, L.inp[1] + s / 6); ctx.lineTo(L.inp[0] + s / 2, L.inp[1] - s / 6); ctx.stroke()
    for (const k in L.C) slab(L.C[k], k, glow[k] || 0)
    for (const k in L.P) slab(L.P[k], k, glow[k] || 0)
    for (const l of [3, 4]) {
      const n = L.P['P' + l], x = L.xr - n[2] / 2 - 18, y = n[1], g = glow['S' + l] || 0
      ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fillStyle = g > 0.1 ? `rgba(200,255,0,${0.4 * g})` : '#070707'; ctx.fill(); ctx.strokeStyle = g > 0.1 ? ACC : '#8b8b84'; ctx.lineWidth = 1.6; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke()
    }
    for (const l of [3, 4, 5, 6, 7]) {
      const y = L.P['P' + l][1], g = glow['H' + l] || 0, q = Math.max(10, W * 0.022)
      for (const i of [0, 1]) {
        const x = L.xh - 12 + i * (q + 6)
        ctx.strokeStyle = g > 0.1 ? ACC : '#4a4a46'; ctx.lineWidth = 1.4; ctx.strokeRect(x, y - q / 2, q, q)
        if (g > 0.05) { ctx.fillStyle = `rgba(200,255,0,${0.6 * g})`; ctx.fillRect(x, y - q / 2, q, q) }
      }
    }
    ctx.fillStyle = '#6a6a64'; ctx.font = `${Math.max(13, W / 58)}px JetBrains Mono`
    ctx.fillText('ResNet ↑', L.xl - W * 0.09, H * 0.05 + 10); ctx.fillText('FPN ↓', L.xr - W * 0.04, H * 0.05 + 10); ctx.fillText('cls box', L.xh - 14, H * 0.05 + 10)
    parts = parts.filter(pt => {
      pt.d += pt.v * dt
      if (pt.d >= pt.p.len) {
        const e = pt.p.end; glow[e] = Math.min(1, (glow[e] || 0) + 0.12)
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
    for (const [u, v, e1, e2] of pts) {
      const x = u * w, y = h / 2 + Math.sin(u * 12 + ph * 0.5) * h * 0.18 + (v - 0.5) * h * 0.08
      ctx.fillStyle = v > 0.94 ? ACC : 'rgba(241,239,233,.7)'
      ctx.fillRect(x + e1 * 30 * (1 - k), y + e2 * h * 0.35 * (1 - k), 3, 3)
    }
  })
}

export function initCards() {
  const map = { tiles, insert: thales, fpn: retina }
  document.querySelectorAll('canvas.mini').forEach(cv => map[cv.dataset.kind]?.(cv))
}
