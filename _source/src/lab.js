import gsap from 'gsap'

/*
  Toy latent diffusion pipeline.
  Image (128²) → encoder → latent z0 (32²×3) → forward noise → DDIM steps with a
  simulated denoiser → decoder. The maths of the forward/reverse updates is real,
  the "network" is an oracle that predicts a blurred version of z0.
*/
const S = 128, L = 32, NSTEPS = 20
const alphaBar = t => Math.max(1e-4, Math.cos(t * Math.PI / 2) ** 2)
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())

export function initLab() {
  const $ = id => document.getElementById(id)
  const cvs = { img: $('dm-img'), lat: $('dm-lat'), pred: $('dm-pred'), out: $('dm-out') }
  const ctx = Object.fromEntries(Object.entries(cvs).map(([k, c]) => [k, c.getContext('2d')]))
  const tSlider = $('dm-t'), info = $('dm-info'), rT = $('dm-rt'), rA = $('dm-ra'), rS = $('dm-rs')
  const btn = { enc: $('dm-enc'), noise: $('dm-noise'), step: $('dm-step'), run: $('dm-run'), dec: $('dm-dec'), reset: $('dm-reset') }

  let x = null                      // pixels, Float32 S*S*3 in [0,1]
  let z0 = null, eps = null, zt = null
  let t = 0, stage = 0, decoded = false, busy = false
  let hiRes = null                  // canvas with the original image, for decoder detail

  /* ---------- images ---------- */
  const photo = new Image(); photo.src = 'photo.jpg'
  function makeImage(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 512
    const g = c.getContext('2d')
    if (kind === 'portrait' && photo.complete && photo.naturalWidth) {
      const s = photo.naturalWidth, y0 = photo.naturalHeight * 0.06
      g.drawImage(photo, 0, y0, s, s, 0, 0, 512, 512)
    } else if (kind === 'sunset') {
      const sky = g.createLinearGradient(0, 0, 0, 300); sky.addColorStop(0, '#1b1446'); sky.addColorStop(0.55, '#d8456b'); sky.addColorStop(1, '#ffb347')
      g.fillStyle = sky; g.fillRect(0, 0, 512, 300)
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(256, 290, 70, 0, 7); g.fill()
      g.fillStyle = '#2a1a3a'; g.beginPath(); g.moveTo(0, 300)
      for (let i = 0; i <= 512; i += 32) g.lineTo(i, 300 - 60 * Math.abs(Math.sin(i / 90)) - 20); g.lineTo(512, 300); g.fill()
      const sea = g.createLinearGradient(0, 300, 0, 512); sea.addColorStop(0, '#5a2a5e'); sea.addColorStop(1, '#0d0b25')
      g.fillStyle = sea; g.fillRect(0, 300, 512, 212)
      g.fillStyle = 'rgba(255,220,150,.6)'; for (let i = 0; i < 14; i++) g.fillRect(256 - 60 + i * 3 - i * i * 0.4, 310 + i * 14, 120 - i * 6, 4)
    } else {
      g.fillStyle = '#f1efe9'; g.fillRect(0, 0, 512, 512)
      const cols = ['#c8ff00', '#0b0b0b', '#ff4d2e', '#2e5bff', '#f1efe9']
      ;[[0, 0, 300, 200, 2], [300, 0, 212, 120, 0], [300, 120, 212, 220, 4], [0, 200, 180, 312, 3], [180, 200, 120, 140, 0], [180, 340, 332, 172, 1], [300, 340, 212, 172, 2]]
        .forEach(([a, b, cw, ch, k]) => { g.fillStyle = cols[k]; g.fillRect(a, b, cw, ch) })
      g.strokeStyle = '#0b0b0b'; g.lineWidth = 12
      ;[[300, 0, 300, 512], [0, 200, 512, 200], [180, 200, 180, 512], [300, 120, 512, 120], [180, 340, 512, 340]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke() })
    }
    hiRes = c
    const sm = document.createElement('canvas'); sm.width = sm.height = S
    sm.getContext('2d').drawImage(c, 0, 0, S, S)
    const d = sm.getContext('2d').getImageData(0, 0, S, S).data
    x = new Float32Array(S * S * 3)
    for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) x[3 * i + k] = d[4 * i + k] / 255
  }

  /* ---------- encoder / decoder (colour transform + 4× pooling) ---------- */
  function encode(px) {
    const z = new Float32Array(L * L * 3), f = S / L
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      let r = 0, g = 0, b = 0
      for (let v = 0; v < f; v++) for (let u = 0; u < f; u++) {
        const q = 3 * ((j * f + v) * S + i * f + u); r += px[q]; g += px[q + 1]; b += px[q + 2]
      }
      r /= f * f; g /= f * f; b /= f * f
      const o = 3 * (j * L + i)
      z[o] = 2 * (r + g + b) / 3 - 1; z[o + 1] = 1.5 * (r - g); z[o + 2] = 1.5 * ((r + g) / 2 - b)
    }
    return z
  }
  function toRGB(z, o) {
    const lum = (z[o] + 1) / 2, rg = z[o + 1] / 1.5, yb = z[o + 2] / 1.5
    const s = (3 * lum + yb) / 1.5, b = s / 2 - yb
    return [(s + rg) / 2, (s - rg) / 2, b]
  }
  function blur(z, r) {
    if (r < 0.5) return z.slice()
    const R = Math.round(r), tmp = new Float32Array(z.length), out = new Float32Array(z.length)
    for (const [src, dst, horiz] of [[z, tmp, true], [tmp, out, false]])
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) for (let k = 0; k < 3; k++) {
        let s = 0, n = 0
        for (let d = -R; d <= R; d++) {
          const ii = horiz ? Math.min(L - 1, Math.max(0, i + d)) : i, jj = horiz ? j : Math.min(L - 1, Math.max(0, j + d))
          s += src[3 * (jj * L + ii) + k]; n++
        }
        dst[3 * (j * L + i) + k] = s / n
      }
    return out
  }
  // simulated network: the less noise, the sharper its guess of z0
  const predict = tt => blur(z0, 5 * Math.sqrt(1 - alphaBar(tt)) ** 1.3)

  /* ---------- rendering ---------- */
  function paintImg(c, px) {
    const id = c.createImageData(S, S)
    for (let i = 0; i < S * S; i++) { for (let k = 0; k < 3; k++) id.data[4 * i + k] = px[3 * i + k] * 255; id.data[4 * i + 3] = 255 }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S; tmp.getContext('2d').putImageData(id, 0, 0)
    c.imageSmoothingEnabled = true; c.drawImage(tmp, 0, 0, c.canvas.width, c.canvas.height)
  }
  function latentCanvas(z, falseColor, reveal = 1) {
    const id = new ImageData(L, L)
    const n = Math.floor(reveal * L * L)
    for (let i = 0; i < L * L; i++) {
      let r, g, b
      if (i >= n) { r = g = b = 0.03 }
      else if (falseColor) { r = 0.5 + 0.45 * z[3 * i]; g = 0.5 + 0.6 * z[3 * i + 2]; b = 0.5 + 0.6 * z[3 * i + 1] }
      else[r, g, b] = toRGB(z, 3 * i)
      id.data[4 * i] = r * 255; id.data[4 * i + 1] = g * 255; id.data[4 * i + 2] = b * 255; id.data[4 * i + 3] = 255
    }
    const c = document.createElement('canvas'); c.width = c.height = L; c.getContext('2d').putImageData(id, 0, 0)
    return c
  }
  function blank(c, label) {
    const W = c.canvas.width
    c.fillStyle = '#060606'; c.fillRect(0, 0, W, W)
    c.strokeStyle = '#1c1c1b'; c.lineWidth = 1
    for (let k = 1; k < 8; k++) { c.beginPath(); c.moveTo(k * W / 8, 0); c.lineTo(k * W / 8, W); c.moveTo(0, k * W / 8); c.lineTo(W, k * W / 8); c.stroke() }
    c.fillStyle = '#4a4a46'; c.font = `${W / 22}px JetBrains Mono`; c.textAlign = 'center'; c.fillText(label, W / 2, W / 2 + 6); c.textAlign = 'left'
  }
  function render(reveal = 1) {
    paintImg(ctx.img, x)
    const W = cvs.lat.width
    if (!z0) { blank(ctx.lat, 'waiting for encoder'); blank(ctx.pred, '—'); blank(ctx.out, '—'); return }
    ctx.lat.imageSmoothingEnabled = false
    ctx.lat.drawImage(latentCanvas(zt, true, reveal), 0, 0, W, W)
    if (t > 0.001 || stage >= 3) {
      ctx.pred.imageSmoothingEnabled = true
      ctx.pred.drawImage(latentCanvas(predict(t), false), 0, 0, W, W)
    } else blank(ctx.pred, 'add noise first')
    if (decoded) {
      ctx.out.imageSmoothingEnabled = true
      ctx.out.drawImage(latentCanvas(zt, false), 0, 0, W, W)
      // decoder adds high-frequency detail back when the latent is clean
      let err = 0; for (let i = 0; i < zt.length; i++) err += Math.abs(zt[i] - z0[i]); err /= zt.length
      ctx.out.globalAlpha = Math.max(0, 1 - err * 12); ctx.out.drawImage(hiRes, 0, 0, W, W); ctx.out.globalAlpha = 1
    } else blank(ctx.out, 'press decode')
    const ab = alphaBar(t)
    rT.textContent = Math.round(t * 1000); rA.textContent = ab.toFixed(3)
    rS.textContent = t < 0.001 ? '∞' : (10 * Math.log10(ab / (1 - ab))).toFixed(1) + ' dB'
    tSlider.value = Math.round(t * 1000)
  }

  /* ---------- state machine ---------- */
  function setStage(s) {
    stage = s
    btn.enc.disabled = busy || s !== 0
    btn.noise.disabled = busy || s < 1
    btn.step.disabled = busy || s < 2 || t <= 0.001
    btn.run.disabled = busy || s < 2 || t <= 0.001
    btn.dec.disabled = busy || s < 1
    tSlider.disabled = busy || s < 1
    document.querySelectorAll('.dm-stage').forEach((el, i) => el.classList.toggle('active', i <= Math.min(3, s + (decoded ? 1 : 0))))
  }
  const say = s => { info.textContent = s }
  const setNoisy = tt => {
    t = tt; const a = Math.sqrt(alphaBar(t)), b = Math.sqrt(1 - alphaBar(t))
    for (let i = 0; i < z0.length; i++) zt[i] = a * z0[i] + b * eps[i]
  }
  function ddimStep() {
    const tNext = Math.max(0, t - 1 / NSTEPS)
    const ab = alphaBar(t), abN = tNext === 0 ? 1 : alphaBar(tNext)
    const xh = predict(t)
    for (let i = 0; i < zt.length; i++) {
      const e = (zt[i] - Math.sqrt(ab) * xh[i]) / Math.sqrt(1 - ab)
      zt[i] = Math.sqrt(abN) * xh[i] + Math.sqrt(1 - abN) * e
    }
    if (tNext === 0) zt.set(z0)
    t = tNext
  }

  function reset(kind) {
    makeImage(kind || document.querySelector('#dm-pick .on').dataset.v)
    z0 = eps = zt = null; t = 0; decoded = false; busy = false
    setStage(0); render()
    say('Pick an image, then press Encode. Everything happens in latent space, like Stable Diffusion or FLUX.')
  }

  btn.enc.onclick = () => {
    z0 = encode(x); eps = Float32Array.from(z0, () => randn()); zt = z0.slice(); busy = true; setStage(0)
    const o = { r: 0 }
    gsap.to(o, { r: 1, duration: 1.1, ease: 'power2.inOut', onUpdate: () => render(o.r), onComplete: () => { busy = false; setStage(1); render() } })
    say('Encoder: 128×128×3 pixels → 32×32×3 latent. 16× fewer numbers. False colours, because a latent is not an image.')
  }
  btn.noise.onclick = () => {
    busy = true; decoded = false; setStage(stage)
    const o = { v: t }
    gsap.to(o, { v: 1, duration: 1.8, ease: 'power1.in', onUpdate: () => { setNoisy(o.v); render() }, onComplete: () => { busy = false; setStage(2); render() } })
    say('Forward process: z_t = √ᾱ·z₀ + √(1−ᾱ)·ε. At t = 1000, nothing of the image is left. Pure Gaussian.')
  }
  tSlider.oninput = () => {
    if (!z0) return
    setNoisy(tSlider.value / 1000); setStage(t > 0.001 ? 2 : 1); render()
    say('Scrub t. The middle panel is the network\'s guess of z₀ from z_t alone (the Tweedie estimate). Blurry at high noise, sharp near t = 0.')
  }
  btn.step.onclick = () => {
    ddimStep(); setStage(t > 0.001 ? 2 : 3); render()
    say(t > 0.001
      ? `DDIM step: predict ε̂, jump to t = ${Math.round(t * 1000)}. Coarse shapes first, details last.`
      : 'Done. Clean latent. Now decode it back to pixels.')
  }
  btn.run.onclick = () => {
    busy = true; setStage(stage)
    const loop = () => {
      if (t <= 0.001) { busy = false; setStage(3); render(); say('Sampled in 20 steps. Press Decode.'); return }
      ddimStep(); render(); gsap.delayedCall(0.13, loop)
    }
    loop(); say('Running the full reverse chain, step by step…')
  }
  btn.dec.onclick = () => {
    decoded = true; setStage(stage); render()
    say(t > 0.001
      ? 'Decoding a noisy latent gives a noisy image. Denoise first, then decode.'
      : 'Decoder: latent → pixels. It brings back the fine detail the latent threw away.')
  }
  btn.reset.onclick = () => reset()
  document.querySelectorAll('#dm-pick button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#dm-pick button').forEach(o => o.classList.remove('on')); b.classList.add('on'); reset(b.dataset.v)
  })

  photo.onload = () => { if (stage === 0 && !z0) reset() }
  reset()
}
