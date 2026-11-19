import gsap from 'gsap'

/*
  Toy latent diffusion, played as one continuous 60 fps sequence:
  encode (pixels fly into the latent) → forward noise, cell by cell → reverse, t sliding
  continuously from 1000 to 0 → decode.
  Forward / reverse use z_t = √ᾱ ẑ0 + √(1−ᾱ) ε with a fixed ε. The "network" is an oracle
  whose guess ẑ0 is z0 blurred by an amount that shrinks with the noise level.
*/
const ACC = '#c8ff00'
const S = 128, L = 32, G = 64
const alphaBar = t => Math.max(1e-4, Math.cos(t * Math.PI / 2) ** 2)
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const clamp01 = x => Math.max(0, Math.min(1, x))
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const blurAmt = t => 6.5 * Math.sqrt(1 - alphaBar(t)) ** 1.2          // in latent cells

// site palette colour map: black → olive → lime → cream
const LUT = (() => {
  const stops = [[0, [11, 11, 11]], [0.38, [38, 44, 14]], [0.68, [200, 255, 0]], [1, [241, 239, 233]]]
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const s = i / 255; let k = 0; while (k < stops.length - 2 && s > stops[k + 1][0]) k++
    const [s0, c0] = stops[k], [s1, c1] = stops[k + 1], u = (s - s0) / (s1 - s0)
    for (let c = 0; c < 3; c++) out[3 * i + c] = c0[c] + (c1[c] - c0[c]) * u
  }
  return out
})()
const cmapIdx = v => Math.round(clamp01((v + 1.25) / 2.5) * 255) * 3
const cmapRGB = v => { const i = cmapIdx(v); return [LUT[i] / 255, LUT[i + 1] / 255, LUT[i + 2] / 255] }

export function initLab() {
  const cv = document.getElementById('dm'), ctx = cv.getContext('2d')
  const runBtn = document.getElementById('dm-run'), info = document.getElementById('dm-info')

  let W = 0, H = 0, lay = null
  let hiRes = null, pyr = [], noiseTex = null, x = null, z0 = null, eps = null, blurs = [], cellR = null
  let zt = null, z2 = null, stream = [], emitAcc = 0, t = 0, phase = 'idle', pt = 0, parts = [], cellArrive = null
  let sparks = [], ripples = [], film = [], nextShot = 1, rippleT = 0
  let visible = false, autoplayed = false, scrubbing = false

  /* ---------- data ---------- */
  const photo = new Image(); photo.src = 'lab.jpg'
  function loadImage() {
    hiRes = document.createElement('canvas'); hiRes.width = hiRes.height = 512
    hiRes.getContext('2d').drawImage(photo, 0, 0, 512, 512)
    // image pyramid: continuous blur = cross-fade between two levels (works in every browser)
    pyr = [hiRes]
    for (let n = 256; n >= 4; n /= 2) { const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(pyr[pyr.length - 1], 0, 0, n, n); pyr.push(c) }
    const sm = document.createElement('canvas'); sm.width = sm.height = S
    sm.getContext('2d').drawImage(hiRes, 0, 0, S, S)
    const d = sm.getContext('2d').getImageData(0, 0, S, S).data
    x = new Float32Array(S * S * 3)
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) x[3 * i + k] = d[4 * i + k] / 255
    z0 = encode(x); eps = Float32Array.from(z0, () => randn()); zt = z0.slice(); z2 = z0.slice()
    blurs = Array.from({ length: 8 }, (_, r) => blur(z0, r))
    cellR = Float32Array.from({ length: L * L }, () => Math.random())
    noiseTex = document.createElement('canvas'); noiseTex.width = noiseTex.height = 96
    const nt = noiseTex.getContext('2d'), id = nt.createImageData(96, 96)
    for (let i = 0; i < 96 * 96; i++) { const v = clamp01(0.5 + 0.25 * randn()) * 255; id.data[4 * i] = v; id.data[4 * i + 1] = v; id.data[4 * i + 2] = v * 0.95; id.data[4 * i + 3] = 255 }
    nt.putImageData(id, 0, 0)
  }
  function encode(px) {
    const z = new Float32Array(L * L * 3), f = S / L
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      let r = 0, g = 0, b = 0
      for (let v = 0; v < f; v++) for (let u = 0; u < f; u++) { const q = 3 * ((j * f + v) * S + i * f + u); r += px[q]; g += px[q + 1]; b += px[q + 2] }
      r /= f * f; g /= f * f; b /= f * f
      const o = 3 * (j * L + i)
      z[o] = 2 * (r + g + b) / 3 - 1; z[o + 1] = 1.5 * (r - g); z[o + 2] = 1.5 * ((r + g) / 2 - b)
    }
    return z
  }
  const toRGB = (z, o) => { const lum = (z[o] + 1) / 2, rg = z[o + 1] / 1.5, yb = z[o + 2] / 1.5, s = (3 * lum + yb) / 1.5; return [(s + rg) / 2, (s - rg) / 2, s / 2 - yb] }
  function blur(z, R) {
    if (R === 0) return z.slice()
    const tmp = new Float32Array(z.length), out = new Float32Array(z.length)
    for (const [src, dst, hz] of [[z, tmp, true], [tmp, out, false]])
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) for (let k = 0; k < 3; k++) {
        let s = 0
        for (let d = -R; d <= R; d++) { const ii = hz ? Math.min(L - 1, Math.max(0, i + d)) : i, jj = hz ? j : Math.min(L - 1, Math.max(0, j + d)); s += src[3 * (jj * L + ii) + k] }
        dst[3 * (j * L + i) + k] = s / (2 * R + 1)
      }
    return out
  }
  // continuous guess of z0: interpolate between integer blur radii
  const guess = tt => {
    const r = Math.min(6.999, blurAmt(tt)), r0 = Math.floor(r), u = r - r0, A = blurs[r0], B = blurs[r0 + 1], out = new Float32Array(A.length)
    for (let i = 0; i < A.length; i++) out[i] = A[i] + (B[i] - A[i]) * u
    return out
  }
  const DT = 0.05
  const stateAt = (tt, out) => { const a = Math.sqrt(alphaBar(tt)), b = tt <= 0 ? 0 : Math.sqrt(1 - alphaBar(tt)), g = guess(tt); for (let i = 0; i < out.length; i++) out[i] = a * g[i] + b * eps[i] }
  const reverseState = tt => { t = tt; stateAt(t, zt) }
  const forwardState = tau => {
    t = tau
    for (let c = 0; c < L * L; c++) {
      const ti = easeIO(clamp01((tau - 0.55 * cellR[c]) / 0.45)), a = Math.sqrt(alphaBar(ti)), b = Math.sqrt(1 - alphaBar(ti))
      for (let k = 0; k < 3; k++) zt[3 * c + k] = a * z0[3 * c + k] + b * eps[3 * c + k]
    }
  }
  const latCs = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width: L, height: L }))
  function latentCanvas(z, reveal, slot = 0) {
    const latC = latCs[slot], g = latC.getContext('2d'), id = g.createImageData(L, L)
    for (let i = 0; i < L * L; i++) {
      const k = cmapIdx(z[3 * i]), a = reveal ? reveal[i] : 1
      id.data[4 * i] = LUT[k]; id.data[4 * i + 1] = LUT[k + 1]; id.data[4 * i + 2] = LUT[k + 2]; id.data[4 * i + 3] = a * 255
    }
    g.putImageData(id, 0, 0); return latC
  }
  // blurred, noisy decode of the current state, continuous in t
  function drawDecoded(box, tt, alpha = 1) {
    const [x0, y0, P] = box, lvl = Math.log2(Math.max(1, blurAmt(tt) * 16)), l0 = Math.min(pyr.length - 1, Math.floor(lvl)), u = lvl - l0
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, P, P); ctx.clip()
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = alpha; ctx.drawImage(pyr[l0], x0, y0, P, P)
    if (u > 0 && l0 + 1 < pyr.length) { ctx.globalAlpha = alpha * u; ctx.drawImage(pyr[l0 + 1], x0, y0, P, P) }
    const nb = Math.sqrt(1 - alphaBar(tt))
    if (nb > 0.01) { ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha * 0.85 * nb; ctx.drawImage(noiseTex, x0, y0, P, P) }
    ctx.restore(); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
  }

  /* ---------- layout ---------- */
  function layout() {
    const cw = cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1), mob = cw < 700
    W = Math.round(cw * dpr); H = Math.round(W * (mob ? 1.95 : 0.47))
    cv.width = W; cv.height = H; cv.style.height = H / dpr + 'px'
    if (!mob) {
      H = Math.round(W * 0.46); cv.height = H; cv.style.height = H / dpr + 'px'
      const P = W * 0.17, Pz = W * 0.12, top = H * 0.11, cy = top + P / 2
      lay = { img: [W * 0.1 - P / 2, top, P], lat: [W * 0.37 - Pz / 2, cy - Pz / 2, Pz], lat2: [W * 0.63 - Pz / 2, cy - Pz / 2, Pz], out: [W * 0.9 - P / 2, top, P],
        tl: [W * 0.07, top + P + H * 0.17, W * 0.86], film: [0, top + P + H * 0.25, 0, W * 0.86 / 21 * 0.9], fs: W / 100 }
    } else {
      H = Math.round(W * 1.85); cv.height = H; cv.style.height = H / dpr + 'px'
      const P = W * 0.56, Pz = W * 0.36, y1 = H * 0.04, y2 = y1 + P + H * 0.07, y3 = y2 + Pz + H * 0.13
      lay = { img: [W / 2 - P / 2, y1, P], lat: [W * 0.27 - Pz / 2, y2, Pz], lat2: [W * 0.73 - Pz / 2, y2, Pz], out: [W / 2 - P / 2, y3, P],
        tl: [W * 0.07, y3 + P + H * 0.06, W * 0.86], film: [0, y3 + P + H * 0.095, 0, W * 0.86 / 21 * 0.9], fs: W / 32 }
    }
  }

  /* ---------- phases ---------- */
  const DUR = { encode: 2.6, forward: 1.3, reverse: 3.25, decode: 2.2 }
  const say = s => { info.textContent = s }
  const highlight = () => {}
  const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
  const fly = (sx, sy, ex, ey, delay, fl, c0, c1, s0, s1) => { const bend = (Math.random() - 0.5) * W * 0.12; return { sx, sy, ex, ey, cx: (sx + ex) / 2 + bend * 0.3, cy: (sy + ey) / 2 + bend, delay, fl, c0, c1, s0, s1 } }

  function start() {
    if (!z0) return
    zt.set(z0); z2.set(z0); stream = []; t = 0; film = []; ripples = []; sparks = []; nextShot = 1.05; scrubbing = false
    phase = 'encode'; pt = 0; highlight(0); runBtn.disabled = true
    say('Encoding. Every pixel flies into a latent 16× smaller.')
    const [ix, iy, P] = lay.img, [lx, ly, Pz] = lay.lat
    parts = []; cellArrive = new Float32Array(L * L)
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const q = 3 * ((j * 2) * S + i * 2), c = (j >> 1) * L + (i >> 1)
      const delay = (i / G) * 0.9 + (j / G) * 0.35 + Math.random() * 0.25, fl = 0.85 + Math.random() * 0.3
      parts.push(fly(ix + (i + 0.5) * P / G, iy + (j + 0.5) * P / G, lx + ((i >> 1) + 0.25 + 0.5 * (i & 1)) * Pz / L, ly + ((j >> 1) + 0.25 + 0.5 * (j & 1)) * Pz / L,
        delay, fl, [x[q], x[q + 1], x[q + 2]], cmapRGB(z0[3 * c]), P / G, Pz / L * 0.5))
      cellArrive[c] = Math.max(cellArrive[c], delay + fl)
    }
  }
  function startDecode() {
    phase = 'decode'; pt = 0; highlight(3)
    say('Decoding. Only now do we leave latent space: the clean z₀ unfolds back into pixels.')
    stream = []
    const [lx, ly, Pz] = lay.lat2, [ox, oy, P] = lay.out
    parts = []
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const c = (j >> 1) * L + (i >> 1)
      parts.push(fly(lx + ((i >> 1) + 0.5) * Pz / L, ly + ((j >> 1) + 0.5) * Pz / L, ox + (i + 0.5) * P / G, oy + (j + 0.5) * P / G,
        (i / G) * 0.7 + (j / G) * 0.3 + Math.random() * 0.2, 0.75 + Math.random() * 0.25, cmapRGB(z0[3 * c]), toRGB(z0, 3 * c), Pz / L * 0.5, P / G))
    }
  }

  function update(dt) {
    pt += dt
    const [lx, ly, Pz] = lay.lat
    if (phase === 'encode' && pt > DUR.encode) {
      phase = 'forward'; pt = 0; highlight(1); parts = []
      say('Forward process. Noise seeps in, cell by cell, until nothing of the face is left.')
    } else if (phase === 'forward') {
      const tau = clamp01(pt / DUR.forward); forwardState(tau)
      if (tau < 0.95) for (let k = 0; k < 1; k++) { const c = Math.floor(Math.random() * L * L); sparks.push({ x: lx + (c % L + 0.5) * Pz / L, y: ly - Pz * 0.35, ty: ly + (Math.floor(c / L) + 0.5) * Pz / L, v: Pz * 1.6 }) }
      if (pt > DUR.forward) { reverseState(1); z2.set(zt); phase = 'reverse'; pt = 0; highlight(2); say('Reverse process. Start from pure Gaussian noise z_T and denoise, step by step, in latent space.') }
    } else if (phase === 'reverse') {
      const k = clamp01(pt / DUR.reverse)
      reverseState(1 - easeIO(k) * 0.35 - k * 0.65)
      rippleT += dt; if (rippleT > 0.3) { rippleT = 0; const [mx, my, mP] = lay.lat2; ripples.push({ x: mx + mP / 2, y: my + mP / 2, r: mP * 0.1, a: 0.45 }) }
      // the denoising step lives in latent space: cells of z_t travel to z_{t-Δ}, crossing paths
      emitAcc += dt * 700
      const [ax, ay, aP] = lay.lat, [bx, by, bP] = lay.lat2
      while (emitAcc > 1) {
        emitAcc--
        const c = Math.floor(Math.random() * L * L), ci = c % L, cj = Math.floor(c / L)
        const sx = ax + (ci + 0.5) * aP / L, sy = ay + (cj + 0.5) * aP / L, ex = bx + (ci + 0.5) * bP / L, ey = by + (cj + 0.5) * bP / L
        const sw = (Math.random() - 0.5) * aP * 1.4
        stream.push({ c, sx, sy, ex, ey, c1x: sx + (ex - sx) * 0.33 + sw * 0.3, c1y: sy + sw, c2x: sx + (ex - sx) * 0.66 - sw * 0.3, c2y: ey - sw, k: 0, fl: 0.55 + Math.random() * 0.4, s: aP / L })
      }
      if (t <= nextShot - 0.05 + 1e-9 || k >= 1) { nextShot = Math.round(t * 20) / 20; const c = document.createElement('canvas'); c.width = c.height = L; c.getContext('2d').drawImage(latentCanvas(zt, null, 1), 0, 0); film.push({ c, t: k >= 1 ? 0 : nextShot }) }
      if (k >= 1) { reverseState(0); startDecode() }
    } else if (phase === 'decode' && pt > DUR.decode + 0.6) {
      phase = 'done'; highlight(-1); runBtn.disabled = false; runBtn.querySelector('span').textContent = 'Replay'
      say('Done. Drag along the timeline to scrub t.')
    }
    stream = stream.filter(p => (p.k += dt / p.fl) < 1)
    sparks = sparks.filter(s => { s.y += s.v * dt; return s.y < s.ty })
    ripples = ripples.filter(r => (r.r += Pz * 0.45 * dt, r.a -= dt * 0.55) > 0)
  }

  /* ---------- drawing ---------- */
  function frame(box, label, sub, active) {
    const [x0, y0, P] = box, fs = lay.fs
    ctx.strokeStyle = active ? '#4a4a46' : '#242423'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 - 0.5, y0 - 0.5, P + 1, P + 1)
    ctx.font = `${fs}px JetBrains Mono`; ctx.fillStyle = active ? '#f1efe9' : '#6a6a64'; ctx.fillText(label, x0, y0 - fs * 0.9)
    ctx.fillStyle = '#5a5a55'; ctx.fillText(sub, x0, y0 + P + fs * 1.6)
  }
  function flowLine(a, b, on) {
    const [ax, ay, aP] = a, [bx, by, bP] = b, mob = Math.abs(by - ay) > Math.abs(bx - ax)
    const p0 = mob ? [ax + aP / 2, ay + aP + 8] : [ax + aP + 8, ay + aP / 2], p1 = mob ? [bx + bP / 2, by - 8] : [bx - 8, by + bP / 2]
    ctx.setLineDash([4, 7]); ctx.lineDashOffset = -performance.now() / 30
    ctx.strokeStyle = on ? ACC : '#2e2e2c'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke(); ctx.setLineDash([])
  }
  function drawParticles(now) {
    for (const p of parts) {
      const k = clamp01((now - p.delay) / p.fl)
      if (k <= 0) { if (phase === 'decode') continue; ctx.fillStyle = `rgb(${p.c0[0] * 255},${p.c0[1] * 255},${p.c0[2] * 255})`; ctx.fillRect(p.sx - p.s0 / 2, p.sy - p.s0 / 2, p.s0, p.s0); continue }
      if (k >= 1) continue
      const e = easeIO(k), u = 1 - e, col = lerp3(p.c0, p.c1, clamp01(k * 1.4 - 0.2))
      const px = u * u * p.sx + 2 * u * e * p.cx + e * e * p.ex, py = u * u * p.sy + 2 * u * e * p.cy + e * e * p.ey
      const s = p.s0 + (p.s1 - p.s0) * e + Math.sin(k * Math.PI) * 2
      ctx.fillStyle = `rgb(${col[0] * 255},${col[1] * 255},${col[2] * 255})`
      ctx.fillRect(px - s / 2, py - s / 2, s, s)
    }
  }
  function timeline() {
    const [x0, y0, w] = lay.tl, fs = lay.fs
    ctx.strokeStyle = '#2e2e2c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke()
    ctx.font = `${fs * 0.9}px JetBrains Mono`; ctx.fillStyle = '#5a5a55'; ctx.textAlign = 'center'
    for (let k = 0; k <= 20; k++) { const xx = x0 + w * k / 20, big = k % 5 === 0; ctx.fillRect(xx - 1, y0 - (big ? 6 : 3), 2, big ? 12 : 6); if (big) ctx.fillText(String(k * 50), xx, y0 + fs * 1.8) }
    const hx = x0 + w * t
    const g = ctx.createLinearGradient(x0, 0, Math.max(x0 + 1, hx), 0); g.addColorStop(0, 'rgba(200,255,0,0)'); g.addColorStop(1, 'rgba(200,255,0,.9)')
    ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, y0); ctx.stroke()
    ctx.fillStyle = 'rgba(200,255,0,.18)'; ctx.beginPath(); ctx.arc(hx, y0, fs * 1.1, 0, 7); ctx.fill()
    ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(hx, y0, fs * 0.55, 0, 7); ctx.fill()
    ctx.fillText(`t = ${Math.round(t * 1000)}`, hx, y0 - fs * 1.4)
    ctx.textAlign = 'left'; ctx.fillStyle = '#6a6a64'
    ctx.fillText(phase === 'forward' ? 'adding noise  →' : phase === 'reverse' ? '←  denoising' : '', x0, y0 - fs * 2.8)
    const ab = alphaBar(t)
    ctx.textAlign = 'right'; ctx.fillText(`ᾱ ${ab.toFixed(3)}   SNR ${t < 0.001 ? '∞' : (10 * Math.log10(ab / (1 - ab))).toFixed(1) + ' dB'}`, x0 + w, y0 - fs * 2.8); ctx.textAlign = 'left'
  }
  function filmstrip() {
    const [x0, y0, w] = lay.tl, th = lay.film[3], fy = lay.film[1]
    ctx.imageSmoothingEnabled = false
    film.forEach(f => {
      const cx = x0 + w * f.t
      ctx.drawImage(f.c, cx - th / 2, fy, th, th)
      ctx.strokeStyle = '#2e2e2c'; ctx.beginPath(); ctx.moveTo(cx, lay.tl[1] + lay.fs * 2.4); ctx.lineTo(cx, fy - 3); ctx.stroke()
    })
    ctx.imageSmoothingEnabled = true
    if (film.length) { ctx.font = `${lay.fs * 0.85}px JetBrains Mono`; ctx.fillStyle = '#5a5a55'; ctx.fillText('zₜ every 50 steps · denoising never leaves latent space', x0 - th / 2, fy + th + lay.fs * 1.6) }
  }
  function loopArrow(on) {
    const [bx, by, bP] = lay.lat2, cx = bx + bP / 2, top = by + bP + lay.fs * 2.2, r = bP * 0.22
    ctx.strokeStyle = on ? ACC : '#2e2e2c'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.lineDashOffset = performance.now() / 30
    const a0 = -0.3 * Math.PI, a1 = 1.55 * Math.PI, ey0 = top + r * 0.45
    ctx.beginPath(); ctx.ellipse(cx, ey0, r, r * 0.45, 0, a0, a1, false); ctx.stroke(); ctx.setLineDash([])
    const ex = cx + r * Math.cos(a1), ey = ey0 + r * 0.45 * Math.sin(a1)
    ctx.fillStyle = on ? ACC : '#2e2e2c'; ctx.beginPath(); ctx.moveTo(ex + 7, ey); ctx.lineTo(ex - 2, ey - 5); ctx.lineTo(ex - 2, ey + 5); ctx.fill()
    ctx.font = `${lay.fs * 0.9}px JetBrains Mono`; ctx.textAlign = 'center'; ctx.fillStyle = on ? ACC : '#4a4a46'
    ctx.fillText('t ← t − 1', cx, top + r * 0.45 + lay.fs * 0.35); ctx.textAlign = 'left'
  }
  function drawStream() {
    for (const p of stream) {
      const k = p.k, e = easeIO(k), u = 1 - e
      const x = u * u * u * p.sx + 3 * u * u * e * p.c1x + 3 * u * e * e * p.c2x + e * e * e * p.ex
      const y = u * u * u * p.sy + 3 * u * u * e * p.c1y + 3 * u * e * e * p.c2y + e * e * e * p.ey
      const c = cmapRGB(z2[3 * p.c] + (zt[3 * p.c] - z2[3 * p.c]) * e), s = p.s * (0.6 + 0.5 * Math.sin(k * Math.PI))
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.95
      ctx.fillStyle = `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`; ctx.fillRect(x - s / 2, y - s / 2, s, s)
    }
    ctx.globalAlpha = 1
  }

  function draw() {
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H)
    const { img, lat, lat2, out } = lay
    const rev = phase === 'reverse', latentOn = phase !== 'idle'
    flowLine(img, lat, phase === 'encode'); flowLine(lat, lat2, rev); flowLine(lat2, out, phase === 'decode')
    loopArrow(rev)
    frame(img, 'x · image', '128 × 128 × 3', true)
    const leftLab = phase === 'encode' ? 'z₀ · latent' : phase === 'forward' ? 'zₜ · adding noise' : phase === 'idle' ? 'z · latent' : 'z_T · Gaussian noise'
    frame(lat, leftLab, '32 × 32', latentOn)
    frame(lat2, `zₜ · t = ${Math.round(t * 1000)}`, rev ? 'denoised step by step' : '32 × 32', rev || phase === 'decode' || phase === 'done')
    frame(out, 'x̂ = D(z₀)', phase === 'reverse' ? 'waits for t = 0' : 'decoded pixels', phase === 'decode' || phase === 'done')
    if (hiRes) {
      const fade = phase === 'encode' ? 1 - clamp01((pt - 0.2) / 1.8) : phase === 'idle' || phase === 'done' ? 1 : 0.25
      ctx.globalAlpha = Math.max(0.12, fade); ctx.drawImage(hiRes, img[0], img[1], img[2], img[2]); ctx.globalAlpha = 1
    }
    ctx.imageSmoothingEnabled = false
    if (latentOn && z0) {
      let rv = null
      if (phase === 'encode') { rv = new Float32Array(L * L); for (let i = 0; i < L * L; i++) rv[i] = clamp01((pt - cellArrive[i]) / 0.25) }
      ctx.drawImage(latentCanvas(phase === 'encode' ? z0 : phase === 'forward' ? zt : z2, rv, 0), lat[0], lat[1], lat[2], lat[2])
    }
    if (z0 && (rev || phase === 'decode' || phase === 'done')) {
      ctx.globalAlpha = rev ? clamp01(pt / 0.6) : 1
      ctx.drawImage(latentCanvas(rev || scrubbing ? zt : z0, null, 1), lat2[0], lat2[1], lat2[2], lat2[2]); ctx.globalAlpha = 1
    }
    ctx.imageSmoothingEnabled = true
    if (phase === 'decode') { const k = clamp01((pt - 1.3) / 0.9); if (k > 0) drawDecoded(out, 0, k) }
    else if (phase === 'done') drawDecoded(out, 0)
    for (const s of sparks) { ctx.fillStyle = ACC; ctx.fillRect(s.x - 1, s.y, 2, 5) }
    for (const r of ripples) { ctx.strokeStyle = `rgba(200,255,0,${r.a})`; ctx.lineWidth = 1.2; ctx.strokeRect(r.x - r.r, r.y - r.r, 2 * r.r, 2 * r.r) }
    if (rev) drawStream()
    if (phase === 'encode' || phase === 'decode') drawParticles(pt)
    timeline(); filmstrip()
    if (phase === 'idle') { ctx.font = `${lay.fs}px JetBrains Mono`; ctx.fillStyle = '#6a6a64'; ctx.textAlign = 'center'; ctx.fillText('press run', lat[0] + lat[2] / 2, lat[1] + lat[2] / 2); ctx.textAlign = 'left' }
  }

  /* ---------- wiring ---------- */
  layout()
  let lastW = cv.clientWidth
  addEventListener('resize', () => { if (cv.clientWidth === lastW) return; lastW = cv.clientWidth; layout(); if (phase === 'encode') start(); else if (phase === 'decode') startDecode() })
  photo.onload = () => { loadImage(); draw() }
  if (photo.complete && photo.naturalWidth) loadImage()
  runBtn.onclick = start
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting
    if (visible && !autoplayed && z0) { autoplayed = true; setTimeout(start, 400) }
  }), { threshold: 0.45 }).observe(cv)
  gsap.ticker.add((_, dt) => { if (!visible || !lay) return; if (z0 && phase !== 'idle' && phase !== 'done') update(Math.min(dt, 50) / 1000); draw() })

  const scrub = e => { const r = cv.getBoundingClientRect(), xx = (e.clientX - r.left) * W / r.width, [x0, , w] = lay.tl; reverseState(clamp01((xx - x0) / w)); scrubbing = t > 0.001 }
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'done') return
    const r = cv.getBoundingClientRect(), yy = (e.clientY - r.top) * H / r.height
    if (Math.abs(yy - lay.tl[1]) > lay.fs * 3) return
    cv.setPointerCapture(e.pointerId); scrub(e)
    const mv = ev => scrub(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up) }
    cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up)
  })
  window.__dm = () => ({ phase, pt, t })
  window.__lab = () => { if (!lay) return null; const k = W / cv.clientWidth; return { phase, tau: phase === 'forward' ? clamp01(pt / DUR.forward) : 0, lat: lay.lat.map(v => v / k) } }
}
