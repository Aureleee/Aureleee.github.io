import gsap from 'gsap'

const ACC = '#c8ff00'
const FG = 'rgba(241,239,233,'
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const ease = x => 1 - (1 - x) ** 3

/* ---------- tank drawing (line art) ---------- */
function drawTank(c, x, y, s, dir = 1) {
  c.save(); c.translate(x, y); c.scale(s * dir, s)
  c.lineJoin = 'round'; c.lineCap = 'round'
  c.beginPath() // tracks
  c.moveTo(-95, -10); c.lineTo(95, -10); c.quadraticCurveTo(112, 6, 92, 22); c.lineTo(-92, 22); c.quadraticCurveTo(-112, 6, -95, -10)
  c.stroke()
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(i * 26, 7, 10, 0, 7); c.stroke() }
  c.beginPath() // hull
  c.moveTo(-100, -10); c.lineTo(-82, -34); c.lineTo(88, -34); c.lineTo(108, -10)
  c.stroke()
  c.beginPath() // turret
  c.moveTo(-50, -34); c.lineTo(-38, -62); c.lineTo(30, -62); c.lineTo(46, -34)
  c.stroke()
  c.beginPath(); c.moveTo(30, -52); c.lineTo(150, -56); c.lineTo(150, -46); c.lineTo(34, -44); c.stroke() // barrel
  c.beginPath(); c.arc(-10, -68, 7, Math.PI, 0); c.stroke() // hatch
  c.restore()
}

function tankPoints(s, dir) {
  const w = Math.ceil(300 * s) + 10, h = Math.ceil(120 * s) + 10
  const off = document.createElement('canvas'); off.width = w; off.height = h
  const o = off.getContext('2d'); o.strokeStyle = '#fff'; o.lineWidth = 3 / s
  drawTank(o, w / 2 - 25 * s * dir, h - 30 * s, s, dir)
  const d = o.getImageData(0, 0, w, h).data, pts = []
  for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2)
    if (d[4 * (yy * w + xx) + 3] > 100) pts.push([xx - w / 2, yy - h + 30 * s])
  return pts
}

/* ---------- Thales: a line-art scene where tanks get generated ---------- */
function thales(cv) {
  const ctx = cv.getContext('2d')
  let w, h, bg
  const vp = () => [w * 0.5, h * 0.4]
  function scene() {
    bg = document.createElement('canvas'); bg.width = w; bg.height = h
    const b = bg.getContext('2d'), [vx, vy] = vp()
    b.fillStyle = '#070707'; b.fillRect(0, 0, w, h)
    b.lineWidth = 1.5
    // sun + hills
    b.strokeStyle = '#2c2c2a'; b.beginPath(); b.arc(w * 0.78, h * 0.2, h * 0.08, 0, 7); b.stroke()
    for (let k = 0; k < 3; k++) {
      b.strokeStyle = ['#2a2a28', '#323230', '#3a3a37'][k]; b.beginPath()
      for (let x = 0; x <= w; x += 6) {
        const y = vy - 8 - k * -6 - (Math.sin(x / w * (3 + k * 2) + k * 1.7) * 0.5 + 0.5) * h * (0.12 - k * 0.03)
        x ? b.lineTo(x, y) : b.moveTo(x, y)
      }
      b.stroke()
    }
    b.strokeStyle = '#3a3a37'; b.beginPath(); b.moveTo(0, vy); b.lineTo(w, vy); b.stroke()
    // ground lines
    b.strokeStyle = '#1e1e1d'
    for (let i = 1; i < 12; i++) { const y = vy + (h - vy) * (i / 12) ** 1.7; b.beginPath(); b.moveTo(0, y); b.lineTo(w, y); b.stroke() }
    // road
    b.strokeStyle = '#4a4a46'; b.lineWidth = 2
    b.beginPath(); b.moveTo(vx - 6, vy); b.lineTo(w * 0.02, h); b.moveTo(vx + 6, vy); b.lineTo(w * 0.98, h); b.stroke()
    b.setLineDash([10, 14]); b.strokeStyle = '#3a3a37'; b.beginPath(); b.moveTo(vx, vy); b.lineTo(w * 0.5, h); b.stroke(); b.setLineDash([])
    // trees
    b.strokeStyle = '#33332f'; b.lineWidth = 1.5
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1, d = 0.15 + (i / 9) * 0.8, y = vy + (h - vy) * d * d
      const x = vx + side * (30 + (w * 0.55) * d * d + 20), s = 8 + 40 * d * d
      b.beginPath(); b.moveTo(x, y); b.lineTo(x, y - s * 1.6); b.moveTo(x - s * 0.5, y - s * 0.6); b.lineTo(x, y - s * 2.2); b.lineTo(x + s * 0.5, y - s * 0.6); b.closePath(); b.stroke()
    }
  }
  const size = () => { w = cv.width = cv.clientWidth * 2; h = cv.height = cv.clientHeight * 2; if (w && h) scene() }
  size(); addEventListener('resize', size)

  const placed = []
  let cur = null, clock = 0
  function spawn() {
    const [vx, vy] = vp()
    let best = null
    for (let k = 0; k < 12; k++) { // pick a spot away from tanks already generated
      const d = 0.55 + Math.random() * 0.4, lateral = (Math.random() - 0.5) * 0.7
      const cand = { y: vy + (h - vy) * d * d, x: vx + lateral * (w * 0.5) * d * d, s: (w / 900) * (0.3 + d * d * 0.85) }
      cand.score = Math.min(1e9, ...placed.map(t => Math.hypot(t.x - cand.x, (t.y - cand.y) * 2.5)))
      if (!best || cand.score > best.score) best = cand
    }
    const { x, y, s } = best, dir = Math.random() < 0.5 ? 1 : -1
    const pts = tankPoints(s, dir).map(([px, py]) => ({ tx: x + px, ty: y + py, ex: randn(), ey: randn() }))
    cur = { x, y, s, dir, pts, r: 150 * s + 20 }
    clock = 0
  }
  spawn()

  gsap.ticker.add((_, dt) => {
    if (!w || !h) return
    clock += dt / 1000
    const T = 3.4, p = clock / T
    ctx.drawImage(bg, 0, 0)
    // previously generated tanks
    ctx.lineWidth = 2
    placed.forEach((t, i) => {
      ctx.strokeStyle = FG + (0.25 + 0.12 * i) + ')'
      drawTank(ctx, t.x, t.y, t.s, t.dir)
    })
    const c = cur, [cx, cy] = [c.x, c.y - 45 * c.s]
    if (p < 0.18) { // inpainting mask appears
      const k = ease(p / 0.18)
      ctx.strokeStyle = ACC; ctx.setLineDash([8, 8]); ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, c.r * k, 0, 7); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = `rgba(200,255,0,${0.06 * k})`; ctx.fill()
    } else if (p < 0.68) { // reverse diffusion inside the mask
      const k = ease((p - 0.18) / 0.5), a = Math.sin(k * Math.PI / 2), bb = Math.cos(k * Math.PI / 2)
      ctx.strokeStyle = 'rgba(200,255,0,.5)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, c.r, 0, 7); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = k > 0.85 ? FG + '.95)' : ACC
      for (const q of c.pts) {
        const x = cx + a * (q.tx - cx) + bb * q.ex * c.r * 0.45, y = cy + a * (q.ty - cy) + bb * q.ey * c.r * 0.45
        ctx.fillRect(x, y, 2.4, 2.4)
      }
      ctx.fillStyle = ACC; ctx.font = `${Math.max(16, w / 50)}px JetBrains Mono`
      ctx.fillText(`denoising ${String(Math.round((1 - k) * 1000)).padStart(4, '0')}`, cx - c.r, cy - c.r - 10)
    } else { // crisp tank + annotation
      const k = Math.min(1, (p - 0.68) / 0.1)
      ctx.strokeStyle = FG + '.95)'; ctx.lineWidth = 2.5; drawTank(ctx, c.x, c.y, c.s, c.dir)
      const bw = 270 * c.s, bh = 110 * c.s, bx = c.x - bw / 2 + 15 * c.s * c.dir, by = c.y - bh + 28 * c.s, L = 14 * k
      ctx.strokeStyle = ACC; ctx.lineWidth = 3; ctx.beginPath()
      ;[[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L)
      })
      ctx.stroke()
      ctx.fillStyle = ACC; ctx.font = `${Math.max(16, w / 50)}px JetBrains Mono`
      ctx.globalAlpha = k; ctx.fillText(`tank · coco #${placed.length + 1}`, bx, by - 10); ctx.globalAlpha = 1
    }
    if (p >= 1) {
      placed.push({ x: c.x, y: c.y, s: c.s, dir: c.dir })
      if (placed.length > 3) placed.shift()
      spawn()
    }
  })
}

/* ---------- RetinaNet: feature pyramid, isometric ---------- */
function fpn(cv) {
  const ctx = cv.getContext('2d')
  let w, h
  const size = () => { w = cv.width = cv.clientWidth * 2; h = cv.height = cv.clientHeight * 2 }
  size(); addEventListener('resize', size)
  const levels = [ // bottom (P3) to top (P7)
    { n: 16, name: 'P3' }, { n: 12, name: 'P4' }, { n: 8, name: 'P5' }, { n: 5, name: 'P6' }, { n: 3, name: 'P7' },
  ]
  // fixed "object" responses
  const hot = levels.map(L => Array.from({ length: Math.max(2, Math.round(L.n * L.n * 0.08)) }, () => [Math.floor(Math.random() * L.n), Math.floor(Math.random() * L.n), Math.random()]))
  let ph = 0
  gsap.ticker.add((_, dt) => {
    if (!w || !h) return
    ph += dt / 1000
    ctx.fillStyle = '#070707'; ctx.fillRect(0, 0, w, h)
    const cx = w * 0.5, base = h * 0.86, gap = h * 0.155
    const sweep = (ph * 0.45) % 1.4 // top-down pathway pulse
    levels.forEach((L, i) => {
      const size = w * (0.62 - i * 0.1), cy = base - i * gap
      const iso = (u, v) => [cx + (u - v) * size * 0.5, cy + (u + v - 1) * size * 0.22]
      const lvlPos = 1 - i / (levels.length - 1) // top = 0
      const lit = Math.max(0, 1 - Math.abs(sweep - lvlPos) * 4)
      // plane
      ctx.beginPath(); [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], k) => { const [x, y] = iso(u, v); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.closePath()
      ctx.fillStyle = `rgba(16,16,16,.92)`; ctx.fill()
      ctx.strokeStyle = lit > 0.05 ? `rgba(200,255,0,${0.3 + 0.7 * lit})` : '#3a3a37'; ctx.lineWidth = 2; ctx.stroke()
      // grid
      ctx.strokeStyle = `rgba(241,239,233,${0.06 + 0.1 * lit})`; ctx.lineWidth = 1; ctx.beginPath()
      for (let k = 1; k < L.n; k++) {
        let [x1, y1] = iso(k / L.n, 0), [x2, y2] = iso(k / L.n, 1); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ;[x1, y1] = iso(0, k / L.n); [x2, y2] = iso(1, k / L.n); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
      }
      ctx.stroke()
      // activations
      hot[i].forEach(([a, b, r]) => {
        const [x, y] = iso((a + 0.5) / L.n, (b + 0.5) / L.n)
        const glow = 0.25 + 0.75 * Math.max(lit, (Math.sin(ph * 2 + r * 9) + 1) / 2 * 0.4)
        ctx.fillStyle = `rgba(200,255,0,${glow})`
        ctx.beginPath(); ctx.ellipse(x, y, size / L.n * 0.32, size / L.n * 0.14, 0, 0, 7); ctx.fill()
      })
      // label
      const [lx, ly] = iso(1, 0)
      ctx.fillStyle = lit > 0.3 ? ACC : '#7a7872'; ctx.font = `${Math.max(16, w / 48)}px JetBrains Mono`
      ctx.fillText(L.name, lx + 14, ly + 6)
    })
    // focal loss curve, bottom left
    const gx = w * 0.05, gy = h * 0.06, gw = w * 0.24, gh = h * 0.2, gamma = 2 + 2 * Math.sin(ph * 0.8)
    ctx.strokeStyle = '#2c2c2a'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, gw, gh)
    ctx.strokeStyle = ACC; ctx.lineWidth = 2.5; ctx.beginPath()
    for (let k = 0; k <= 60; k++) {
      const p = 0.02 + 0.97 * k / 60, fl = -((1 - p) ** gamma) * Math.log(p)
      const x = gx + gw * (k / 60), y = gy + gh - gh * Math.min(1, fl / 4)
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = '#7a7872'; ctx.font = `${Math.max(14, w / 56)}px JetBrains Mono`
    ctx.fillText(`focal loss  γ=${gamma.toFixed(1)}`, gx, gy + gh + 22)
  })
}

/* ---------- SyncTweedies: overlapping views converging together ---------- */
function tiles(cv) {
  const ctx = cv.getContext('2d')
  let w, h
  const size = () => { w = cv.width = cv.clientWidth * 2; h = cv.height = cv.clientHeight * 2 }
  size(); addEventListener('resize', size)
  const pts = Array.from({ length: 900 }, () => [Math.random(), Math.random(), randn(), randn()])
  let ph = Math.random() * 10
  gsap.ticker.add(() => {
    if (!w || !h) return
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
  const map = { tiles, insert: thales, fpn }
  document.querySelectorAll('canvas.mini').forEach(cv => map[cv.dataset.kind]?.(cv))
}
