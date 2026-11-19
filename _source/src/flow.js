import gsap from 'gsap'

/*
  One layer of particles over the whole page, driven by scroll.
  hero name → orbit around the photo → wave of the SyncTweedies card → the tank generated in the
  Thales card → the data flowing through RetinaNet → noise falling into the lab latent → a few words.
  Every station is computed from live element rects, so scrolling back up rewinds it.
*/
const ACC = [200, 255, 0], FG = [241, 239, 233]
const clamp01 = x => Math.max(0, Math.min(1, x))
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const ease = x => 1 - (1 - x) ** 3
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const seg = (v, a, b) => clamp01((v - a) / Math.max(1, b - a))

export function initFlow() {
  const cv = document.createElement('canvas')
  cv.className = 'flow-layer'
  document.body.appendChild(cv)
  const ctx = cv.getContext('2d')
  const mob = innerWidth < 800, N = mob ? 320 : 520
  let W = 0, H = 0, dpr = 1, words = []
  const size = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    words = sampleWords()
  }

  // a compact line of words drawn with the same points at the very end
  function sampleWords() {
    const text = 'MATHS · ML', fs = Math.min(W * (mob ? 0.16 : 0.075), 110)
    const o = document.createElement('canvas'), g = o.getContext('2d')
    g.font = `800 ${fs}px Syne`; const tw = Math.ceil(g.measureText(text).width)
    o.width = tw + 4; o.height = Math.ceil(fs * 1.3)
    g.font = `800 ${fs}px Syne`; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 2, o.height / 2)
    const d = g.getImageData(0, 0, o.width, o.height).data, pts = []
    // outline only: sparse points read much better on edges than spread over a fill
    const A = (x, y) => x >= 0 && y >= 0 && x < o.width && y < o.height && d[4 * (y * o.width + x) + 3] > 128
    for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) if (A(x, y) && (!A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1))) pts.push([x - o.width / 2, y - o.height / 2])
    const out = []
    for (let i = 0; i < N; i++) out.push(pts[Math.floor((i + Math.random() * 0.9) / N * pts.length) % pts.length])
    return out.sort(() => Math.random() - 0.5)
  }
  // École Polytechnique, written compactly with the same points under the photo
  function sampleSchool(width) {
    const lines = ['ÉCOLE', 'POLYTECHNIQUE'], o = document.createElement('canvas'), g = o.getContext('2d')
    let fs = 40; g.font = `800 ${fs}px Syne`
    fs = Math.min(fs * width / g.measureText(lines[1]).width, 54)
    o.width = Math.ceil(width) + 4; o.height = Math.ceil(fs * 2.1)
    g.font = `800 ${fs}px Syne`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(lines[0], o.width / 2, fs * 0.55); g.fillText(lines[1], o.width / 2, fs * 1.55)
    const d = g.getImageData(0, 0, o.width, o.height).data, pts = []
    for (let y = 0; y < o.height; y += 1) for (let x = 0; x < o.width; x += 1) if (d[4 * (y * o.width + x) + 3] > 140) pts.push([x - o.width / 2, y])
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pts[i], pts[j]] = [pts[j], pts[i]] }
    // spread the N points evenly over the glyphs
    const out = [], cell = Math.sqrt(pts.length / N) * 0.9, seen = new Set()
    for (const q of pts) { const k = Math.round(q[0] / cell) + ',' + Math.round(q[1] / cell); if (!seen.has(k)) { seen.add(k); out.push(q) } if (out.length >= N) break }
    while (out.length < N) out.push(pts[out.length % pts.length])
    return out
  }
  let school = [], schoolW = 0
  size(); addEventListener('resize', size)

  const P = Array.from({ length: N }, (_, i) => ({
    i, u: Math.random(), v: Math.random(), e1: randn(), e2: randn(), r: Math.random(),
    sx: randn(), sy: randn(), acc: Math.random() < 0.12, s: 1.4 + Math.random() * 1.3, hk: Math.floor(Math.random() * 1e9),
    tx: null, ty: null,
  }))

  const $ = s => document.querySelector(s)
  const els = {
    hero: $('#particles'), photo: $('.about-photo'), sub: $('.about .sub'), about: $('.about'), cards: [...document.querySelectorAll('.proj')],
    card1: $('canvas[data-kind=tiles]'), dm: $('#dm'), contact: $('.contact'),
  }
  const absTop = el => el.getBoundingClientRect().top + scrollY
  const stickTop = el => parseFloat(getComputedStyle(el).top) || 0
  const arrive = el => { const r = el.getBoundingClientRect(), s = stickTop(el); return clamp01((H * 0.95 - r.top) / Math.max(1, H * 0.95 - s)) }

  gsap.ticker.add((_, dtm) => {
    const fdt = Math.min(0.033, dtm / 1000), time = performance.now() / 1000, y = scrollY
    ctx.clearRect(0, 0, W, H)
    const heroT = window.__heroTargets
    if (!heroT || !heroT.length) return

    // ---- stations (screen coordinates) ----
    const hr = els.hero.getBoundingClientRect()
    const st0 = p => { const q = heroT[p.hk % heroT.length]; return [hr.left + q[0], hr.top + q[1]] }

    const pr = els.photo.getBoundingClientRect()
    const sr = els.sub.getBoundingClientRect(), sw = Math.min(sr.width, mob ? W * 0.8 : 440)
    if (Math.abs(sw - schoolW) > 2) { schoolW = sw; school = sampleSchool(sw) }
    const st1 = p => { const q = school[p.i]; return [sr.left + sw / 2 + q[0] + Math.sin(time * 1.4 + p.i) * 0.5, sr.bottom + 34 + q[1] + Math.cos(time * 1.1 + p.i) * 0.5] }

    // SyncTweedies: synced most of the time, a short burst of noise now and then
    const cr = els.card1.getBoundingClientRect(), noise = Math.max(0, Math.sin(time * 0.55)) ** 4
    const st2 = p => {
      const x = cr.left + p.u * cr.width, yy = cr.top + cr.height / 2 + Math.sin(p.u * 12 + time * 0.36) * cr.height * 0.18 + (p.v - 0.5) * cr.height * 0.08
      return [x + p.e1 * 12 * noise, yy + p.e2 * cr.height * 0.3 * noise]
    }

    // Thales: the points gather around the inpainting mask, then become the generated tank
    const T = window.__thales
    const tr = T ? T.el.getBoundingClientRect() : null
    const st3 = p => {
      if (!T) return [cr.left, cr.top]
      const sx = tr.width / T.W, sy = tr.height / T.H
      const map = (x, yy) => [tr.left + (T.W / 2 + (x - T.camX) * T.z) * sx, tr.top + (T.H / 2 + (yy - T.camY) * T.z) * sy]
      const q = T.pts[Math.floor(p.i / N * T.pts.length)] || { x: T.cx, y: T.cy }
      // loose orbit, each point on its own radius and speed
      const ang = p.r * 40 + time * (0.25 + p.r * 0.5), orb = T.R * (1.4 + 2.2 * p.u)
      const gx = T.cx + Math.cos(ang) * orb, gy = T.cy + Math.sin(ang) * orb * 0.55
      const pull = ease(clamp01((T.p - 0.3) / 0.12))                    // gravitate → inside the mask
      const mx = gx + (T.cx + p.e1 * T.R * 0.45 - gx) * pull, my = gy + (T.cy + p.e2 * T.R * 0.3 - gy) * pull
      const m = ease(clamp01((T.p - 0.42) / 0.22))                      // mask → tank shape
      const lift = ease(clamp01((T.p - 0.94) / 0.06))                   // next cycle: leave the tank
      const k = m * (1 - lift)
      return map(mx + (q.x - mx) * k, my + (q.y - my) * k)
    }

    // RetinaNet: one point per data packet travelling through the network, the rest wait at the input
    const RN = window.__retina
    const rr = RN ? RN.el.getBoundingClientRect() : null, rk = RN ? rr.width / RN.W() : 1
    const st4 = p => {
      if (!RN) return [cr.left, cr.top]
      const k = rk
      const q = RN.route(p.i, (time * 0.22 + p.r) % 1)
      return [rr.left + q[0] * k, rr.top + q[1] * k]
    }
    const lab = window.__lab?.()
    const dr = els.dm.getBoundingClientRect()
    const st5 = p => {
      if (!lab) return [dr.left + dr.width / 2, dr.top]
      const [lx, ly, lp] = lab.lat
      return [dr.left + lx + lp / 2 + p.e1 * lp * 0.45, dr.top + ly - lp * 0.45 + p.e2 * lp * 0.14 + Math.sin(time * 2 + p.i) * 3]
    }
    const cell = p => { const [lx, ly, lp] = lab.lat, c = p.hk % (32 * 32); return [dr.left + lx + ((c % 32) + 0.5) * lp / 32, dr.top + ly + (Math.floor(c / 32) + 0.5) * lp / 32] }

    const ctr = els.contact.getBoundingClientRect()
    const st6 = p => { const q = words[p.i % words.length]; return [W / 2 + q[0] + Math.sin(time * 1.2 + p.i) * 0.6, ctr.top + H * 0.07 + q[1]] }

    // ---- progress between stations ----
    const heroH = hr.height, aboutTop = absTop(els.about)
    const a = seg(y, heroH * 0.12, aboutTop - H * 0.15)
    const [c1, c2, c3] = els.cards
    const b = arrive(c1), c = arrive(c2), d = arrive(c3)
    const e = clamp01((H * 0.95 - dr.top) / (H * 0.6))
    const f = clamp01((H - ctr.top) / (H * 0.55))
    const fadeIn = seg(y, heroH * 0.08, heroH * 0.3)
    if (fadeIn <= 0) return

    for (const p of P) {
      let A, B, k, scatter, stage
      if (e > 0) { A = st4(p); B = st5(p); k = e; scatter = 60; stage = 5 }
      else if (d > 0) { A = st3(p); B = st4(p); k = d; scatter = 50; stage = 4 }
      else if (c > 0) { A = st2(p); B = st3(p); k = c; scatter = 50; stage = 3 }
      else if (b > 0) { A = st1(p); B = st2(p); k = b; scatter = 40; stage = 2 }
      else { A = st0(p); B = st1(p); k = a; scatter = 220; stage = 1 }
      const ek = easeIO(clamp01(k * 1.12 - p.r * 0.12))
      let x = A[0] + (B[0] - A[0]) * ek + Math.sin(Math.PI * ek) * p.sx * scatter
      let yy = A[1] + (B[1] - A[1]) * ek + Math.sin(Math.PI * ek) * p.sy * scatter * 0.6
      let alpha = fadeIn * (0.55 + 0.45 * p.r)

      // on the Thales card the targets jump between cycles: glide instead
      if ((stage === 3 && ek >= 1) || (stage === 4 && ek <= 0)) {
        if (p.tx === null) { p.tx = x; p.ty = yy; p.vx = 0; p.vy = 0 }
        const forming = T && T.p > 0.4 && T.p < 0.95, K = forming ? 70 : 6 + 10 * p.r, damp = 2 * Math.sqrt(K) * (forming ? 0.95 : 0.55)
        p.vx += ((x - p.tx) * K - p.vx * damp) * fdt; p.vy += ((yy - p.ty) * K - p.vy * damp) * fdt
        p.tx += p.vx * fdt; p.ty += p.vy * fdt; x = p.tx; yy = p.ty
        if (T && T.p > 0.66 && T.p < 0.94) alpha *= 0.55
      } else { p.tx = x; p.ty = yy; p.vx = 0; p.vy = 0 }

      // in the lab: these particles are the noise falling into the latent
      if (stage === 5 && ek >= 1 && lab) {
        if (lab.phase === 'forward') {
          const fr = clamp01((lab.tau - p.r * 0.75) / 0.25)
          if (fr >= 1) continue
          const C = cell(p), ef = fr * fr
          x += (C[0] - x) * ef; yy += (C[1] - yy) * ef
        } else if (lab.phase !== 'idle' && lab.phase !== 'encode') continue
      }
      const col = p.acc ? ACC : FG
      if (alpha <= 0.01 || yy < -20 || yy > H + 20) continue
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`
      ctx.fillRect(x, yy, p.s, p.s)
    }
  })
}
