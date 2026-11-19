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
  // photo sampled on a grid of N cells, brightness → alpha
  const photoImg = new Image(); photoImg.src = 'photo.jpg'
  let gcols = 1, grows = 1, gridN = 0, photoAR = 0, photoRGB = new Uint8Array(0), tileA = new Float32Array(0)
  function samplePhoto(ar) {
    photoAR = ar; gcols = Math.max(4, Math.round(Math.sqrt(N * ar))); grows = Math.max(4, Math.floor(N / gcols)); gridN = gcols * grows
    const c = document.createElement('canvas'); c.width = gcols; c.height = grows
    const g = c.getContext('2d'), iw = photoImg.naturalWidth, ih = photoImg.naturalHeight
    const s2 = Math.max(gcols / iw, grows / ih), dw = iw * s2, dh = ih * s2
    g.drawImage(photoImg, (gcols - dw) / 2, (grows - dh) / 2, dw, dh)
    const d = g.getImageData(0, 0, gcols, grows).data
    photoRGB = new Uint8Array(gridN * 3); tileA = new Float32Array(gridN); fullKey = ''
    for (let i = 0; i < gridN; i++) for (let ch = 0; ch < 3; ch++) photoRGB[3 * i + ch] = d[4 * i + ch]
  }
  // overlay canvas on the photo, used while it is being generated
  const gen = document.createElement('canvas'); gen.className = 'photo-gen'
  document.querySelector('.about-photo').appendChild(gen)
  const gctx = gen.getContext('2d'), full = document.createElement('canvas'), fctx = full.getContext('2d')
  const mask = document.createElement('canvas'), mctx = mask.getContext('2d')
  let fullKey = '', lastSig = -1, mw = 0, mh = 0, blkTile = new Int32Array(0), blkThr = new Float32Array(0), mdata = null
  // each point that lands on the photo paints its own patch of the real colour photo,
  // grain by grain, with grains the size of the particles, radiating from where it landed
  function renderPhotoGen(pr) {
    const img = document.querySelector('.about-photo img')
    if (!gridN || !photoImg.complete || !photoImg.naturalWidth) return
    let sum = 0, done = true
    for (let i = 0; i < gridN; i++) { sum += tileA[i] * (i + 1); if (tileA[i] < 1) done = false }
    if (done) { gen.style.opacity = 0; img.style.opacity = 1; lastSig = -1; return }
    img.style.opacity = 0; gen.style.opacity = 1
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(pr.width * dpr), h = Math.round(pr.height * dpr)
    const key = w + 'x' + h + ':' + gcols
    if (fullKey !== key) {
      fullKey = key; full.width = w; full.height = h; gen.width = w; gen.height = h
      const iw = photoImg.naturalWidth, ih = photoImg.naturalHeight, sc = Math.max(w / iw, h / ih)
      fctx.drawImage(photoImg, (w - iw * sc) / 2, (h - ih * sc) / 2, iw * sc, ih * sc)
      const grain = 2.2                                   // CSS px, same as a particle
      mw = Math.ceil(pr.width / grain); mh = Math.ceil(pr.height / grain)
      mask.width = mw; mask.height = mh; mdata = mctx.createImageData(mw, mh)
      blkTile = new Int32Array(mw * mh); blkThr = new Float32Array(mw * mh)
      for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
        const u = (i + 0.5) / mw * gcols, v = (j + 0.5) / mh * grows
        const ci = Math.min(gcols - 1, Math.floor(u)), cj = Math.min(grows - 1, Math.floor(v))
        const dist = Math.hypot(u - ci - 0.5, v - cj - 0.5) / 0.75
        blkTile[j * mw + i] = cj * gcols + ci
        blkThr[j * mw + i] = 0.02 + 0.55 * dist + 0.4 * Math.random()
      }
      lastSig = -1
    }
    if (Math.abs(sum - lastSig) < 1e-3) return
    lastSig = sum
    const md = mdata.data
    for (let k = 0; k < mw * mh; k++) md[4 * k + 3] = tileA[blkTile[k]] > blkThr[k] ? 255 : 0
    mctx.putImageData(mdata, 0, 0)
    gctx.globalCompositeOperation = 'source-over'
    gctx.clearRect(0, 0, w, h)
    gctx.imageSmoothingEnabled = false
    gctx.drawImage(mask, 0, 0, w, h)
    gctx.globalCompositeOperation = 'source-in'
    gctx.drawImage(full, 0, 0)
    gctx.globalCompositeOperation = 'source-over'
  }
  size(); addEventListener('resize', size)

  const P = Array.from({ length: N }, (_, i) => ({
    i, u: Math.random(), v: Math.random(), e1: randn(), e2: randn(), r: Math.random(),
    sx: randn(), sy: randn(), acc: Math.random() < 0.12, s: 1.4 + Math.random() * 1.3, hk: Math.floor(Math.random() * 1e9),
    tx: null, ty: null,
  }))

  const $ = s => document.querySelector(s)
  // lagged copy of the Thales camera: the cloud follows the camera with some inertia
  const camL = { x: null, y: 0, z: 1, vx: 0, vy: 0, vz: 0 }
  const els = {
    hero: $('#particles'), photo: $('.about-photo'), photoImg: $('.about-photo img'), hl: [...document.querySelectorAll('.reveal-words .hl')], about: $('.about'), cards: [...document.querySelectorAll('.proj')],
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
    // About: the points become a subtle dotted version of the photo, laid over it
    if (photoImg.complete && photoImg.naturalWidth && Math.abs(pr.width / pr.height - photoAR) > 0.01) samplePhoto(pr.width / pr.height)
    const st1 = p => {
      if (p.i >= gridN) return [pr.left + p.u * pr.width, pr.top + p.v * pr.height]
      const ci = p.i % gcols, cj = Math.floor(p.i / gcols)
      return [pr.left + (ci + 0.5) / gcols * pr.width + Math.sin(time * 0.8 + p.i) * 0.6, pr.top + (cj + 0.5) / grows * pr.height + Math.cos(time * 0.7 + p.i) * 0.6]
    }

    // SyncTweedies: synced most of the time, a short burst of noise now and then
    const cr = els.card1.getBoundingClientRect(), noise = Math.max(0, Math.sin(time * 0.55)) ** 4
    const st2 = p => {
      const x = cr.left + p.u * cr.width, yy = cr.top + cr.height / 2 + Math.sin(p.u * 12 + time * 0.36) * cr.height * 0.18 + (p.v - 0.5) * cr.height * 0.08
      return [x + p.e1 * 12 * noise, yy + p.e2 * cr.height * 0.3 * noise]
    }

    // Thales: the points gather around the inpainting mask, then become the generated tank
    const T = window.__thales
    const tr = T ? T.el.getBoundingClientRect() : null
    if (T) {
      if (camL.x === null) Object.assign(camL, { x: T.camX, y: T.camY, z: T.z })
      const K = 16, D = 2 * Math.sqrt(K) * 0.42                     // underdamped: overshoots a little, then settles
      camL.vx += ((T.camX - camL.x) * K - camL.vx * D) * fdt; camL.x += camL.vx * fdt
      camL.vy += ((T.camY - camL.y) * K - camL.vy * D) * fdt; camL.y += camL.vy * fdt
      camL.vz += ((T.z - camL.z) * K - camL.vz * D) * fdt; camL.z += camL.vz * fdt
    }
    const st3 = p => {
      if (!T) return [cr.left, cr.top]
      const sx = tr.width / T.W, sy = tr.height / T.H
      const map = (x, yy) => [tr.left + (T.W / 2 + (x - T.camX) * T.z) * sx, tr.top + (T.H / 2 + (yy - T.camY) * T.z) * sy]
      const q = T.pts[Math.floor(p.i / N * T.pts.length)] || { x: T.cx, y: T.cy }
      // between two tanks the points drift as a cloud over the whole drone view (screen space, so the zoom never throws them away)
      // the cloud lives (partly) in the scene: it pans and zooms with the camera, with momentum
      const bx = T.W * (0.04 + 0.92 * p.u) + Math.sin(time * 0.3 + p.i) * T.W * 0.02
      const by = T.H * (0.06 + 0.88 * p.v) + Math.cos(time * 0.27 + p.i * 1.7) * T.H * 0.02
      const cpl = 0.32, ze = 1 + (camL.z - 1) * cpl * (0.7 + 0.6 * p.r)
      const cxe = T.W / 2 + (camL.x - T.W / 2) * cpl, cye = T.H / 2 + (camL.y - T.H / 2) * cpl
      const cx0 = tr.left + (T.W / 2 + (bx - cxe) * ze) * sx, cy0 = tr.top + (T.H / 2 + (by - cye) * ze) * sy
      const lift = ease(clamp01((T.p - 0.78) / 0.14))                   // zoom out: tank → cloud
      const pull = ease(clamp01((T.p - 0.3) / 0.12)) * (1 - lift)       // zoom in: cloud → mask
      const m = ease(clamp01((T.p - 0.42) / 0.22)) * (1 - lift)         // mask → tank shape
      const [mx, my] = map(T.cx + p.e1 * T.R * 0.45, T.cy + p.e2 * T.R * 0.3), [qx, qy] = map(q.x, q.y)
      const ax = cx0 + (mx - cx0) * pull, ay = cy0 + (my - cy0) * pull
      return [ax + (qx - ax) * m, ay + (qy - ay) * m]
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
      // a cloud above the two sources (noise on the left, prompt on the right), waiting
      const x1 = lab.nb[0], x2 = lab.pb[0] + lab.pb[2], top = lab.nb[1]
      return [dr.left + x1 + (x2 - x1) * p.u + Math.sin(time * 0.9 + p.i) * 6, dr.top + top - lp * 0.12 + p.e2 * lp * 0.06 + Math.cos(time * 1.1 + p.i * 1.7) * 4]
    }
    // half of the cloud diffuses into the latent (the Gaussian noise), the other half encodes the prompt
    const cell = p => {
      if (p.i % 2 && lab.cvec) { const [cx, cy, cw, ch] = lab.cvec, k = p.hk % 24; return [dr.left + cx + ((k % 12) + 0.5) * cw / 12, dr.top + cy + (Math.floor(k / 12) + 0.5) * ch / 2] }
      const [lx, ly, lp] = lab.lat, c = p.hk % (32 * 32); return [dr.left + lx + ((c % 32) + 0.5) * lp / 32, dr.top + ly + (Math.floor(c / 32) + 0.5) * lp / 32]
    }

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
    if (fadeIn <= 0) { tileA.fill(0); renderPhotoGen(pr); return }

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
      let alpha = fadeIn * (0.55 + 0.45 * p.r), col = p.acc ? ACC : FG
      // on the photo: each point takes the colour of its tile and dissolves into it as it lands
      const onPhoto = stage === 1 ? ek : stage === 2 ? 1 - ek : 0
      if (p.i < gridN) tileA[p.i] = stage === 1 ? clamp01((ek - 0.8) / 0.2) : 1
      if (onPhoto > 0) {
        if (p.i < gridN) {
          const o = 3 * p.i, m = Math.min(1, onPhoto * 1.25)
          col = [col[0] + (photoRGB[o] - col[0]) * m, col[1] + (photoRGB[o + 1] - col[1]) * m, col[2] + (photoRGB[o + 2] - col[2]) * m].map(Math.round)
          if (stage === 1) alpha = alpha * (1 - onPhoto) + onPhoto * fadeIn * (1 - tileA[p.i])
        } else alpha *= 1 - onPhoto
      }

      // on the Thales card the targets jump between cycles: glide instead
      if ((stage === 3 && ek >= 1) || (stage === 4 && ek <= 0)) {
        if (p.tx === null) { p.tx = x; p.ty = yy; p.vx = 0; p.vy = 0 }
        const forming = T && T.p > 0.4 && T.p < 0.8, K = forming ? 70 : 6 + 10 * p.r, damp = 2 * Math.sqrt(K) * (forming ? 0.95 : 0.55)
        p.vx += ((x - p.tx) * K - p.vx * damp) * fdt; p.vy += ((yy - p.ty) * K - p.vy * damp) * fdt
        p.tx += p.vx * fdt; p.ty += p.vy * fdt; x = p.tx; yy = p.ty
        if (T) {
          const gather = Math.max(clamp01((T.p - 0.3) / 0.12) * (1 - clamp01((T.p - 0.78) / 0.14)), 0)
          alpha *= 0.18 + 0.82 * gather
        }
      } else { p.tx = x; p.ty = yy; p.vx = 0; p.vy = 0 }

      // in the lab: these particles are the noise falling into the latent
      if (stage === 5 && ek >= 1 && lab) {
        if (lab.phase === 'forward') {
          const fr = clamp01((lab.tau - p.r * 0.55) / 0.45)
          if (fr >= 1) continue
          // cloud → into its source → down its tunnel → into a cell (latent noise, or the prompt vector)
          const T = p.i % 2 && lab.cvec ? lab.tp : lab.tn, C = cell(p)
          const ex = dr.left + T[0], ey = dr.top + T[1], ox = dr.left + T[2], oy = dr.top + T[3]
          if (fr < 0.35) { const u = (fr / 0.35) ** 1.5; x += (ex - x) * u; yy += (ey - yy) * u }
          else if (fr < 0.85) {
            const u = (fr - 0.35) / 0.5, w = 1 - u, ym = (ey + oy) / 2, j = Math.sin(p.i * 7.1) * 6
            x = w * w * w * ex + 3 * w * w * u * ex + 3 * w * u * u * ox + u * u * u * ox + j
            yy = w * w * w * ey + 3 * w * w * u * ym + 3 * w * u * u * ym + u * u * u * oy
          } else { const u = (fr - 0.85) / 0.15; x = ox + (C[0] - ox) * u; yy = oy + (C[1] - oy) * u }
        } else if (lab.phase !== 'idle' && lab.phase !== 'encode') continue
      }
      if (alpha <= 0.01 || yy < -20 || yy > H + 20) continue
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`
      ctx.fillRect(x, yy, p.s, p.s)
    }
    renderPhotoGen(pr)
  })
}
