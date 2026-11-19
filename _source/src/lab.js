import gsap from 'gsap'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/*
  Toy latent diffusion, played as one continuous sequence:
  encode (pixels fly into the latent) → forward noise → DDIM reverse steps → decode.
  Forward and DDIM updates are the real formulas. The denoiser is an oracle
  that returns a blurred z0, sharper as the noise level drops.
*/
const ACC = '#c8ff00'
const S = 128, L = 32, G = 64, NSTEPS = 40
const alphaBar = t => Math.max(1e-4, Math.cos(t * Math.PI / 2) ** 2)
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const clamp01 = x => Math.max(0, Math.min(1, x))
const ease = x => 1 - (1 - x) ** 3
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2

export function initLab() {
  const cv = document.getElementById('dm'), ctx = cv.getContext('2d')
  const runBtn = document.getElementById('dm-run'), info = document.getElementById('dm-info')
  const chips = [...document.querySelectorAll('.dm-eq')]
  chips.forEach(c => katex.render(c.dataset.tex, c.querySelector('.tex'), { throwOnError: false, displayMode: false }))

  let W = 0, H = 0, lay = null
  let hiRes = null, x = null, z0 = null, eps = null, zt = null, t = 0
  let phase = 'idle', pt = 0, parts = [], cellArrive = null, sparks = [], ripples = [], film = [], stepAcc = 0
  let visible = false, autoplayed = false, scrubbing = false

  /* ---------- data ---------- */
  const photo = new Image(); photo.src = 'photo.jpg'
  function loadImage() {
    hiRes = document.createElement('canvas'); hiRes.width = hiRes.height = 512
    const s = photo.naturalWidth, y0 = photo.naturalHeight * 0.06
    hiRes.getContext('2d').drawImage(photo, 0, y0, s, s, 0, 0, 512, 512)
    const sm = document.createElement('canvas'); sm.width = sm.height = S
    sm.getContext('2d').drawImage(hiRes, 0, 0, S, S)
    const d = sm.getContext('2d').getImageData(0, 0, S, S).data
    x = new Float32Array(S * S * 3)
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) x[3 * i + k] = d[4 * i + k] / 255
    z0 = encode(x); eps = Float32Array.from(z0, () => randn()); zt = z0.slice()
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
  const toRGB = (z, o) => {
    const lum = (z[o] + 1) / 2, rg = z[o + 1] / 1.5, yb = z[o + 2] / 1.5, s = (3 * lum + yb) / 1.5
    return [(s + rg) / 2, (s - rg) / 2, s / 2 - yb]
  }
  const falseCol = (z, o) => [0.5 + 0.45 * z[o], 0.5 + 0.6 * z[o + 2], 0.5 + 0.6 * z[o + 1]]
  function blur(z, r) {
    if (r < 0.5) return z.slice()
    const R = Math.round(r), tmp = new Float32Array(z.length), out = new Float32Array(z.length)
    for (const [src, dst, hz] of [[z, tmp, true], [tmp, out, false]])
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) for (let k = 0; k < 3; k++) {
        let s = 0, n = 0
        for (let d = -R; d <= R; d++) {
          const ii = hz ? Math.min(L - 1, Math.max(0, i + d)) : i, jj = hz ? j : Math.min(L - 1, Math.max(0, j + d))
          s += src[3 * (jj * L + ii) + k]; n++
        }
        dst[3 * (j * L + i) + k] = s / n
      }
    return out
  }
  const predict = tt => blur(z0, 5.5 * Math.sqrt(1 - alphaBar(tt)) ** 1.3)
  const setNoisy = tt => { t = tt; const a = Math.sqrt(alphaBar(t)), b = Math.sqrt(1 - alphaBar(t)); for (let i = 0; i < z0.length; i++) zt[i] = a * z0[i] + b * eps[i] }
  function ddimStep() {
    const tN = Math.max(0, t - 1 / NSTEPS), ab = alphaBar(t), abN = tN === 0 ? 1 : alphaBar(tN), xh = predict(t)
    for (let i = 0; i < zt.length; i++) { const e = (zt[i] - Math.sqrt(ab) * xh[i]) / Math.sqrt(1 - ab); zt[i] = Math.sqrt(abN) * xh[i] + Math.sqrt(1 - abN) * e }
    if (tN === 0) zt.set(z0)
    t = tN
    return xh
  }
  function gridCanvas(z, fc) {
    const c = document.createElement('canvas'); c.width = c.height = L
    const id = c.getContext('2d').createImageData(L, L)
    for (let i = 0; i < L * L; i++) { const col = fc ? falseCol(z, 3 * i) : toRGB(z, 3 * i); id.data[4 * i] = col[0] * 255; id.data[4 * i + 1] = col[1] * 255; id.data[4 * i + 2] = col[2] * 255; id.data[4 * i + 3] = 255 }
    c.getContext('2d').putImageData(id, 0, 0); return c
  }

  /* ---------- layout ---------- */
  function layout() {
    const cw = cv.clientWidth, dpr = Math.min(2, devicePixelRatio || 1), mob = cw < 700
    W = Math.round(cw * dpr); H = Math.round(W * (mob ? 1.95 : 0.47))
    cv.width = W; cv.height = H; cv.style.height = H / dpr + 'px'
    if (!mob) {
      const P = W * 0.22, Pz = P * 0.6, top = H * 0.1, cy = top + P / 2
      lay = {
        img: [W * 0.16 - P / 2, top, P], lat: [W * 0.5 - Pz / 2, cy - Pz / 2, Pz], out: [W * 0.84 - P / 2, top, P],
        tl: [W * 0.08, top + P + H * 0.13, W * 0.84], film: [W * 0.08, top + P + H * 0.2, W * 0.84, H * 0.11], fs: W / 95,
      }
    } else {
      const P = W * 0.62, Pz = P * 0.6, gap = H * 0.05
      const y1 = H * 0.03, y2 = y1 + P + gap, y3 = y2 + Pz + gap
      lay = {
        img: [W / 2 - P / 2, y1, P], lat: [W / 2 - Pz / 2, y2, Pz], out: [W / 2 - P / 2, y3, P],
        tl: [W * 0.06, y3 + P + H * 0.05, W * 0.88], film: [W * 0.06, y3 + P + H * 0.085, W * 0.88, H * 0.05], fs: W / 32,
      }
    }
  }

  /* ---------- phases ---------- */
  const DUR = { encode: 2.6, forward: 2.2, reverse: 5.2, decode: 2.2 }
  const say = s => { info.textContent = s }
  const highlight = i => chips.forEach((c, k) => c.classList.toggle('on', k === i))

  function start() {
    if (!z0) return
    setNoisy(0); film = []; ripples = []; sparks = []; stepAcc = 0
    phase = 'encode'; pt = 0; highlight(0); runBtn.disabled = true
    say('Encoding. Every pixel flies into a 16× smaller latent.')
    // pixel particles
    const [ix, iy, P] = lay.img, [lx, ly, Pz] = lay.lat
    parts = []; cellArrive = new Float32Array(L * L)
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const q = 3 * ((j * 2) * S + i * 2), col = [x[q], x[q + 1], x[q + 2]]
      const c = (j >> 1) * L + (i >> 1)
      const sx = ix + (i + 0.5) * P / G, sy = iy + (j + 0.5) * P / G
      const ex = lx + ((i >> 1) + 0.25 + 0.5 * (i & 1)) * Pz / L, ey = ly + ((j >> 1) + 0.25 + 0.5 * (j & 1)) * Pz / L
      const delay = (i / G) * 0.9 + (j / G) * 0.35 + Math.random() * 0.25, fl = 0.85 + Math.random() * 0.3
      const bend = (Math.random() - 0.5) * W * 0.12
      parts.push({ sx, sy, ex, ey, cx: (sx + ex) / 2 + bend * 0.3, cy: (sy + ey) / 2 + bend, delay, fl, col, s0: P / G, s1: Pz / L * 0.5 })
      cellArrive[c] = Math.max(cellArrive[c], delay + fl)
    }
  }
  function startDecode() {
    phase = 'decode'; pt = 0; highlight(3)
    say('Decoding. The latent unfolds back into pixels, and the decoder restores fine detail.')
    const [lx, ly, Pz] = lay.lat, [ox, oy, P] = lay.out
    parts = []
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const c = (j >> 1) * L + (i >> 1), col = toRGB(z0, 3 * c)
      const sx = lx + ((i >> 1) + 0.5) * Pz / L, sy = ly + ((j >> 1) + 0.5) * Pz / L
      const ex = ox + (i + 0.5) * P / G, ey = oy + (j + 0.5) * P / G
      const delay = (i / G) * 0.7 + (j / G) * 0.3 + Math.random() * 0.2, fl = 0.75 + Math.random() * 0.25
      const bend = (Math.random() - 0.5) * W * 0.12
      parts.push({ sx, sy, ex, ey, cx: (sx + ex) / 2 + bend * 0.3, cy: (sy + ey) / 2 + bend, delay, fl, col, s0: Pz / L * 0.5, s1: P / G })
    }
  }

  function update(dt) {
    pt += dt
    if (phase === 'encode' && pt > DUR.encode) {
      phase = 'forward'; pt = 0; highlight(1); parts = []
      say('Forward process. Gaussian noise is mixed in until nothing of the face is left.')
    } else if (phase === 'forward') {
      setNoisy(easeIO(clamp01(pt / DUR.forward)))
      const [lx, ly, Pz] = lay.lat
      for (let k = 0; k < 6; k++) sparks.push({ x: lx + Math.random() * Pz, y: ly - Pz * 0.4 - Math.random() * Pz * 0.3, v: Pz * (1.2 + Math.random()), life: 0.5 + Math.random() * 0.3 })
      if (pt > DUR.forward) {
        setNoisy(1); phase = 'reverse'; pt = 0; highlight(2)
        say('Reverse process. At each step the model guesses the clean latent, then takes a DDIM step toward it.')
      }
    } else if (phase === 'reverse') {
      stepAcc += dt
      const per = DUR.reverse / NSTEPS
      while (stepAcc > per && t > 0) {
        stepAcc -= per
        const xh = ddimStep()
        film.push(gridCanvas(xh, false))
        const [lx, ly, Pz] = lay.lat
        ripples.push({ x: lx + Pz / 2, y: ly + Pz / 2, r: 0, a: 0.6 })
      }
      if (t <= 0) { startDecode() }
    } else if (phase === 'decode' && pt > DUR.decode + 0.6) {
      phase = 'done'; highlight(-1); runBtn.disabled = false; runBtn.querySelector('span').textContent = 'Replay'
      say('Done. Drag along the timeline to scrub t and watch the model\'s guess change.')
    }
    sparks = sparks.filter(s => (s.y += s.v * dt, s.life -= dt) > 0)
    ripples = ripples.filter(r => (r.r += W * 0.12 * dt, r.a -= dt * 0.9) > 0)
  }

  /* ---------- drawing ---------- */
  function frame(box, label, sub, active) {
    const [x0, y0, P] = box, fs = lay.fs
    ctx.strokeStyle = active ? '#4a4a46' : '#242423'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 - 0.5, y0 - 0.5, P + 1, P + 1)
    ctx.font = `${fs}px JetBrains Mono`; ctx.fillStyle = active ? '#f1efe9' : '#6a6a64'; ctx.fillText(label, x0, y0 - fs * 0.9)
    ctx.fillStyle = '#5a5a55'; ctx.fillText(sub, x0, y0 + P + fs * 1.6)
  }
  function flowLine(a, b, on) {
    const [ax, ay, aP] = a, [bx, by, bP] = b, mob = W < H
    const p0 = mob ? [ax + aP / 2, ay + aP + 8] : [ax + aP + 8, ay + aP / 2], p1 = mob ? [bx + bP / 2, by - 8] : [bx - 8, by + bP / 2]
    ctx.setLineDash([4, 7]); ctx.lineDashOffset = -performance.now() / 30
    ctx.strokeStyle = on ? ACC : '#2e2e2c'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke(); ctx.setLineDash([])
  }
  const drawGrid = (c, box, smooth, alpha = 1) => { const [x0, y0, P] = box; ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = smooth; ctx.drawImage(c, x0, y0, P, P); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true }
  function drawParticles(now) {
    for (const p of parts) {
      const k = clamp01((now - p.delay) / p.fl)
      if (k <= 0) { if (phase === 'decode') continue; ctx.fillStyle = `rgb(${p.col[0] * 255},${p.col[1] * 255},${p.col[2] * 255})`; ctx.fillRect(p.sx - p.s0 / 2, p.sy - p.s0 / 2, p.s0, p.s0); continue }
      if (k >= 1) continue
      const e = easeIO(k), u = 1 - e
      const x = u * u * p.sx + 2 * u * e * p.cx + e * e * p.ex, y = u * u * p.sy + 2 * u * e * p.cy + e * e * p.ey
      const s = p.s0 + (p.s1 - p.s0) * e + Math.sin(k * Math.PI) * 2
      ctx.fillStyle = `rgba(${p.col[0] * 255},${p.col[1] * 255},${p.col[2] * 255},${0.95})`
      ctx.fillRect(x - s / 2, y - s / 2, s, s)
    }
  }
  function timeline() {
    const [x0, y0, w] = lay.tl, fs = lay.fs
    ctx.strokeStyle = '#2e2e2c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0); ctx.stroke()
    ctx.font = `${fs * 0.9}px JetBrains Mono`; ctx.fillStyle = '#5a5a55'; ctx.textAlign = 'center'
    for (let k = 0; k <= 4; k++) { const xx = x0 + w * k / 4; ctx.fillRect(xx - 1, y0 - 6, 2, 12); ctx.fillText(String(k * 250), xx, y0 + fs * 1.8) }
    const hx = x0 + w * t
    const g = ctx.createLinearGradient(x0, 0, hx, 0); g.addColorStop(0, 'rgba(200,255,0,0)'); g.addColorStop(1, 'rgba(200,255,0,.9)')
    ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(hx, y0); ctx.stroke()
    ctx.fillStyle = ACC; ctx.beginPath(); ctx.arc(hx, y0, fs * 0.55, 0, 7); ctx.fill()
    ctx.fillText(`t = ${Math.round(t * 1000)}`, hx, y0 - fs * 1.1)
    ctx.textAlign = 'left'; ctx.fillStyle = '#6a6a64'
    const dir = phase === 'forward' ? 'adding noise  →' : phase === 'reverse' ? '←  denoising' : ''
    ctx.fillText(dir, x0, y0 - fs * 2.6)
    const ab = alphaBar(t)
    ctx.textAlign = 'right'; ctx.fillText(`ᾱ ${ab.toFixed(3)}   SNR ${t < 0.001 ? '∞' : (10 * Math.log10(ab / (1 - ab))).toFixed(1) + ' dB'}`, x0 + w, y0 - fs * 2.6); ctx.textAlign = 'left'
  }
  function filmstrip() {
    const [x0, y0, w, th] = lay.film, n = Math.max(1, Math.floor(w / (th + 6)))
    const show = film.slice(-n)
    show.forEach((c, i) => { ctx.globalAlpha = 0.35 + 0.65 * (i + 1) / show.length; ctx.drawImage(c, x0 + i * (th + 6), y0, th, th); ctx.globalAlpha = 1 })
    if (film.length) { ctx.font = `${lay.fs * 0.85}px JetBrains Mono`; ctx.fillStyle = '#5a5a55'; ctx.fillText(`guesses of z₀ through time · ${film.length}/${NSTEPS}`, x0, y0 + th + lay.fs * 1.5) }
  }

  function draw() {
    ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H)
    const { img, lat, out } = lay
    flowLine(img, lat, phase === 'encode'); flowLine(lat, out, phase === 'decode' || phase === 'reverse')
    frame(img, 'x · image', '128 × 128 × 3', true)
    frame(lat, 'z_t · latent', '32 × 32 × 3', phase !== 'idle')
    frame(out, phase === 'reverse' ? 'ẑ₀ · model guess' : 'x̂ · output', phase === 'reverse' ? 'decoded live' : 'decoded pixels', phase === 'reverse' || phase === 'decode' || phase === 'done')
    // image panel
    if (hiRes) {
      const fade = phase === 'encode' ? 1 - clamp01((pt - 0.2) / 1.8) : phase === 'idle' || phase === 'done' ? 1 : 0.25
      ctx.globalAlpha = Math.max(0.12, fade); ctx.drawImage(hiRes, img[0], img[1], img[2], img[2]); ctx.globalAlpha = 1
    }
    // latent panel
    if (phase !== 'idle' && z0) {
      if (phase === 'encode') {
        const c = gridCanvas(z0, true), [x0, y0, P] = lat, cs = P / L
        ctx.imageSmoothingEnabled = false
        for (let i = 0; i < L * L; i++) {
          const a = clamp01((pt - cellArrive[i]) / 0.25)
          if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(c, i % L, Math.floor(i / L), 1, 1, x0 + (i % L) * cs, y0 + Math.floor(i / L) * cs, cs + 0.5, cs + 0.5) }
        }
        ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
      } else drawGrid(gridCanvas(zt, true), lat, false)
    }
    // output panel
    if (phase === 'reverse' || scrubbing) drawGrid(gridCanvas(predict(t), false), out, true, phase === 'reverse' ? clamp01(0.4 + pt / 1.5) : 1)
    else if (phase === 'decode') {
      const k = clamp01((pt - 1.4) / 0.8)
      if (k > 0) { drawGrid(gridCanvas(z0, false), out, true, k); ctx.globalAlpha = clamp01((pt - 1.9) / 0.6); ctx.drawImage(hiRes, out[0], out[1], out[2], out[2]); ctx.globalAlpha = 1 }
    } else if (phase === 'done') ctx.drawImage(hiRes, out[0], out[1], out[2], out[2])
    // fx
    for (const s of sparks) { ctx.fillStyle = `rgba(200,255,0,${clamp01(s.life * 2)})`; ctx.fillRect(s.x, s.y, 2.5, 6) }
    for (const r of ripples) { ctx.strokeStyle = `rgba(200,255,0,${r.a})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke() }
    if (phase === 'encode' || phase === 'decode') drawParticles(pt)
    timeline(); filmstrip()
    if (phase === 'idle') {
      ctx.font = `${lay.fs}px JetBrains Mono`; ctx.fillStyle = '#6a6a64'; ctx.textAlign = 'center'
      ctx.fillText('press run', lat[0] + lat[2] / 2, lat[1] + lat[2] / 2); ctx.textAlign = 'left'
    }
  }

  /* ---------- wiring ---------- */
  layout()
  let lastW = 0
  addEventListener('resize', () => { if (cv.clientWidth === lastW) return; lastW = cv.clientWidth; layout(); if (phase === 'encode') start(); else if (phase === 'decode') startDecode() })
  window.__dm = () => ({ phase, pt, t })
  photo.onload = () => { loadImage(); draw() }
  if (photo.complete && photo.naturalWidth) loadImage()
  runBtn.onclick = start
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting
    if (visible && !autoplayed && z0) { autoplayed = true; setTimeout(start, 400) }
  }), { threshold: 0.45 }).observe(cv)
  gsap.ticker.add((_, dt) => { if (!visible || !lay) return; if (z0 && phase !== 'idle' && phase !== 'done') update(Math.min(dt, 50) / 1000); draw() })

  // scrub on the timeline once done
  const scrub = e => {
    const r = cv.getBoundingClientRect(), k = W / r.width
    const xx = (e.clientX - r.left) * k, [x0, , w] = lay.tl
    setNoisy(clamp01((xx - x0) / w)); scrubbing = t > 0.001
  }
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'done') return
    const r = cv.getBoundingClientRect(), k = H / r.height, yy = (e.clientY - r.top) * k
    if (Math.abs(yy - lay.tl[1]) > lay.fs * 3) return
    cv.setPointerCapture(e.pointerId); scrub(e)
    const mv = ev => scrub(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up) }
    cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up)
  })
}
