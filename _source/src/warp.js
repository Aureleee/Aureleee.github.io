/*
  The banner: "speed +" above it speeds it up (no limit), holding the banner brakes. The faster it goes,
  the more it smears, until the text is a single streak. At c the page breaks into its own pixels, a
  pinhole swallows them and a black hole shows up, a few leftover pixels orbiting it. Pixels shed by the
  cursor (move or click) feed it; at critical density it collapses, trembles, and the pixels burst out
  and rebuild the site.
*/
const C = 280                                    // the banner multiplier that counts as the speed of light
const DC = 520                                   // pixels to swallow before the hole collapses
const clamp01 = v => Math.max(0, Math.min(1, v))
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }

export function initWarp(lenis) {
  const wrap = document.querySelector('.mq-wrap'), mq = wrap?.querySelector('.marquee')
  const track = mq?.querySelector('.marquee-track'), btn = wrap?.querySelector('.mq-speed'), warn = wrap?.querySelector('.mq-warn')
  if (!wrap || !mq || !track || !btn) return
  const label = btn.querySelector('.mq-x'), blurG = document.getElementById('mqblur-g')
  let x = 0, mult = 1, held = false, last = performance.now(), shown = '', busy = false

  const fmt = m => {
    const b = m / C
    if (b >= 0.3) return b.toFixed(2).replace(/^0/, '') + 'c'
    return m < 10 ? '×' + m.toFixed(1).replace(/\.0$/, '') : '×' + Math.round(m)
  }
  btn.addEventListener('pointerdown', ev => ev.stopPropagation())
  btn.addEventListener('click', () => { if (busy) return; mult *= 1.6; if (mult >= C) blackHole() })
  mq.addEventListener('pointerdown', ev => { held = true; mq.classList.add('braking'); mq.setPointerCapture?.(ev.pointerId) })
  const up = () => { held = false; mq.classList.remove('braking') }
  mq.addEventListener('pointerup', up); mq.addEventListener('pointercancel', up); mq.addEventListener('lostpointercapture', up)

  let blurOn = false, warnOn = false
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    if (held) mult *= Math.exp(-2.2 * dt)
    else if (mult < 1) mult += (1 - mult) * (1 - Math.exp(-1.5 * dt))
    const half = track.scrollWidth / 4, items = Math.max(1, track.children.length / 8)   // 4 copies
    if (half > 0 && !busy) {
      const v = (half / 22) * mult, dpf = v / 60, P = half / items
      x -= v * dt; x %= half
      const beta = Math.min(0.999, mult / C), gamma = Math.sqrt(1 - beta * beta)
      const lorentz = 1 - smooth(0.35, 1, beta) * (1 - Math.max(0.3, gamma))   // length contraction near c
      const thin = 1 - 0.75 * smooth(0.12, 0.8, beta)                             // the text flattens into a streak
      track.style.transform = `translate3d(${x - half}px,0,0) scale(${lorentz.toFixed(4)},${thin.toFixed(4)})`
      track.style.transformOrigin = `${half - x + mq.clientWidth / 2}px 50%`
      // ghosts of the previous frames
      const g = smooth(P * 0.06, P * 0.4, dpf) * (1 - smooth(0.1, 0.4, beta)), n = Math.round(g * 4)
      track.style.textShadow = n > 0 ? Array.from({ length: n }, (_, k) => `${((k + 1) * (10 + 30 * g)).toFixed(1)}px 0 rgba(11,11,11,${(0.3 / (k + 1)).toFixed(3)})`).join(',') : ''
      // motion blur grows without bound: well before c the words are one dark line
      const sd = Math.min(90, dpf * 0.09 + 140 * smooth(0.05, 0.6, beta))
      if (sd > 0.25) { blurG.setAttribute('stdDeviation', `${sd.toFixed(2)} 0`); if (!blurOn) { track.style.filter = 'url(#mqblur)'; blurOn = true } }
      else if (blurOn) { track.style.filter = ''; blurOn = false }
      mq.style.boxShadow = beta > 0.4 ? `0 0 ${(70 * smooth(0.4, 1, beta)).toFixed(0)}px rgba(200,255,0,${(0.4 * smooth(0.4, 1, beta)).toFixed(3)})` : ''
      const w = beta > 0.45
      if (warn && w !== warnOn) { warnOn = w; warn.classList.toggle('on', w) }
    }
    const t = fmt(Math.max(0, mult)); if (t !== shown) { shown = t; label.textContent = t }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  /* ---------------- rasterise what is on screen ---------------- */
  function rasterise(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })
    g.fillStyle = getComputedStyle(document.body).backgroundColor || '#0b0b0b'; g.fillRect(0, 0, W, H)
    const inView = r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W
    const opac = el => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o }
    const angle = el => { let a = 0; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const t = getComputedStyle(e).transform; if (t && t !== 'none') { const m = new DOMMatrix(t); a += Math.atan2(m.b, m.a) } } return a }
    const skip = el => el.closest('.flow-layer, .game-layer, .cursor, .loader, .bh-layer, svg, script, style, .sr-only')
    document.querySelectorAll('.game-layer').forEach(cv => { try { g.drawImage(cv, 0, 0, W, H) } catch {} })
    for (const el of document.body.querySelectorAll('*')) {
      if (skip(el)) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const r = el.getBoundingClientRect(); if (!inView(r)) continue
      const o = opac(el); if (o < 0.02) continue
      g.globalAlpha = o
      if (cs.backgroundColor && !/rgba\(.*, 0\)$|transparent/.test(cs.backgroundColor)) {
        const a = angle(el), w = el.offsetWidth || r.width, h = el.offsetHeight || r.height
        g.save(); g.translate(r.left + r.width / 2, r.top + r.height / 2); g.rotate(a); g.fillStyle = cs.backgroundColor; g.fillRect(-w / 2, -h / 2, w, h); g.restore()
      }
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth) {
        const iw = el.naturalWidth, ih = el.naturalHeight, sc = Math.max(r.width / iw, r.height / ih)
        const sw = r.width / sc, sh = r.height / sc
        try { g.drawImage(el, (iw - sw) / 2, (ih - sh) / 2, sw, sh, r.left, r.top, r.width, r.height) } catch {}
      } else if (el.tagName === 'CANVAS') {
        try { g.drawImage(el, r.left, r.top, r.width, r.height) } catch {}
      }
    }
    // text, character by character, where the browser actually laid it out
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; if (!el || skip(el) || !n.textContent.trim()) continue
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const er = el.getBoundingClientRect(); if (!inView(er)) continue
      const o = opac(el); if (o < 0.02) continue
      const a = angle(el), upc = cs.textTransform === 'uppercase', txt = n.textContent
      g.globalAlpha = o; g.fillStyle = cs.color; g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      g.textAlign = 'center'; g.textBaseline = 'middle'
      for (let i = 0; i < txt.length; i++) {
        const ch = txt[i]; if (!ch.trim()) continue
        range.setStart(n, i); range.setEnd(n, i + 1)
        const rr = range.getBoundingClientRect(); if (!inView(rr)) continue
        g.save(); g.translate(rr.left + rr.width / 2, rr.top + rr.height / 2); g.rotate(a); g.fillText(upc ? ch.toUpperCase() : ch, 0, 0); g.restore()
      }
    }
    g.globalAlpha = 1
    document.querySelectorAll('.flow-layer').forEach(cv => { try { g.drawImage(cv, 0, 0, W, H) } catch {} })
    return c
  }

  /* ---------------- black hole ---------------- */
  function blackHole() {
    if (busy) return
    busy = true; held = false; mult = 1
    const W = innerWidth, H = innerHeight, hx = W / 2, hy = H / 2, maxD = Math.hypot(W, H) / 2
    lenis?.stop(); document.documentElement.style.overflow = 'hidden'

    // 1. the page, as pixels
    const sd = rasterise(W, H).getContext('2d').getImageData(0, 0, W, H).data
    const STEP = 3, bgR = sd[0], bgG = sd[1], bgB = sd[2]
    const px = []
    for (let y = 0; y < H - 2; y += STEP) for (let x = 0; x < W - 2; x += STEP) {
      const k = 4 * ((y + 1) * W + x + 1), r = sd[k], gg = sd[k + 1], b = sd[k + 2]
      if (Math.abs(r - bgR) + Math.abs(gg - bgG) + Math.abs(b - bgB) < 14) continue
      const dx = x - hx, dy = y - hy, d = Math.hypot(dx, dy)
      px.push({
        hx: x, hy: y, col: (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0, d, a0: Math.atan2(dy, dx),
        ts: 0.35 + 1.7 * (d / maxD) ** 0.85 + Math.random() * 0.35, T: 0.55 + 0.6 * (d / maxD) + Math.random() * 0.3,
        spin: (2 + Math.random() * 1.5) * (1 + 120 / (d + 60)), keep: false, gone: false,
      })
    }
    // a few leftover pixels stay behind: the hole catches them afterwards
    const ORBN = Math.min(1400, Math.round(px.length * 0.03))
    for (let i = 0; i < ORBN; i++) { const p = px[(Math.random() * px.length) | 0]; if (p && p.d > maxD * 0.25) p.keep = true }
    let tAppear = 2
    for (const p of px) if (!p.keep) tAppear = Math.max(tAppear, p.ts + p.T)
    tAppear += 0.05

    // 2. canvases: pixels written into a buffer at CSS resolution, effects drawn on top
    const cv = document.createElement('canvas'); cv.className = 'bh-layer'
    const dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr
    document.body.appendChild(cv)
    document.documentElement.classList.add('bh-on')
    const g = cv.getContext('2d'); g.scale(dpr, dpr)
    const buf = document.createElement('canvas'); buf.width = W; buf.height = H
    const bctx = buf.getContext('2d'), img = bctx.createImageData(W, H), u32 = new Uint32Array(img.data.buffer)
    const put = (x, y, col, s = 2) => {
      x |= 0; y |= 0; if (x < 0 || y < 0 || x > W - s || y > H - s) return
      for (let j = 0; j < s; j++) { const o = (y + j) * W + x; for (let i = 0; i < s; i++) u32[o + i] = col }
    }
    const blit = () => { bctx.putImageData(img, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(buf, 0, 0, W, H) }
    const fade = (col, a) => (0xff000000 | ((((col >>> 16) & 255) * a) << 16) | ((((col >>> 8) & 255) * a) << 8) | ((col & 255) * a)) >>> 0

    const R0 = Math.min(W, H) * 0.07, TILT = 0.26
    const ACCs = 'rgba(200,255,0,', FGs = 'rgba(241,239,233,'
    let phase = 'eat', tPhase = 0, density = 0, shake = 0, rb = null
    const orb = [], sparks = []
    const mouse = { x: -1e4, y: -1e4, px: -1e4, py: -1e4 }
    const SPC = [0xff00ffc8, 0xffe9eff1]               // lime, off-white (ABGR)
    const spark = (x, y) => {
      const dx = x - hx, dy = (y - hy) / TILT
      sparks.push({ r: Math.hypot(dx, dy), a: Math.atan2(dy, dx), vr: -R0 * 2, col: SPC[(Math.random() < 0.55) | 0] })
    }
    cv.addEventListener('pointermove', e => {
      mouse.x = e.clientX; mouse.y = e.clientY
      const sp = Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py)
      if (phase === 'idle' && mouse.px > -1e3) for (let k = 0; k < Math.min(5, sp / 5); k++) spark(mouse.x + (Math.random() - 0.5) * 6, mouse.y + (Math.random() - 0.5) * 6)
      mouse.px = mouse.x; mouse.py = mouse.y
    })
    cv.addEventListener('pointerdown', e => {
      e.stopPropagation()
      if (phase === 'idle') for (let k = 0; k < 45; k++) spark(e.clientX + (Math.random() - 0.5) * 30, e.clientY + (Math.random() - 0.5) * 30)
    })

    const proj = (r, a) => [hx + Math.cos(a) * r, hy + Math.sin(a) * r * TILT]
    const Rnow = () => R0 * (1 + 0.35 * Math.min(1, density / DC))     // it grows as it feeds
    const orbit = (o, dt, R, pull) => {
      o.a += 2.8 * (R / Math.max(o.r, R * 0.6)) ** 1.5 * dt * (1 + pull)
      o.vr *= Math.exp(-3 * dt); o.r += (o.vr - R * 0.03 * (1 + 6 * pull)) * dt
      const [x, y] = proj(o.r, o.a), d = Math.hypot(x - mouse.x, y - mouse.y)
      if (d < 60) o.vr += (60 - d) * 2.4 * dt                          // the cursor stirs the disk
    }
    const lensRing = (R, al) => {
      g.save(); g.translate(hx + shake * (Math.random() - 0.5), hy + shake * (Math.random() - 0.5))
      for (let k = 0; k < 3; k++) {
        g.beginPath(); g.ellipse(0, 0, R * (1.22 + k * 0.17), R * (1.08 + k * 0.15), 0, 0, Math.PI * 2)
        g.strokeStyle = (k ? ACCs : FGs) + (al * (0.55 - k * 0.15)).toFixed(3) + ')'; g.lineWidth = k ? 1 : 2; g.stroke()
      }
      const gr = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.9)
      gr.addColorStop(0, FGs + (0.16 * al).toFixed(3) + ')'); gr.addColorStop(1, FGs + '0)')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.9, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill()
      g.restore()
    }

    const start = performance.now(); let lastNow = start
    const frame = now => {
      const t = (now - start) / 1000, dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now
      const darkA = phase === 'rebuild' ? 1 - smooth(0.2, 1.4, t - tPhase) : smooth(0.2, tAppear, t)
      const bgv = Math.round(11 - 7 * darkA), BG = (0xff000000 | (bgv << 16) | (bgv << 8) | bgv) >>> 0
      u32.fill(BG)
      g.clearRect(0, 0, W, H)

      if (phase === 'eat') {
        // every pixel holds, trembles, then spirals into the pinhole; the nearest go first
        for (const p of px) {
          if (p.gone) continue
          const u = t - p.ts
          if (p.keep && u > 0) {                          // leftovers come loose and drift
            const k = smooth(0, 1, u)
            put(p.hx + Math.sin(t * 1.3 + p.d) * 6 * k, p.hy + Math.cos(t * 1.1 + p.a0) * 6 * k, p.col)
            continue
          }
          if (u < 0) { const j = u > -0.25 ? (u + 0.25) * 6 : 0; put(p.hx + (Math.random() - 0.5) * j, p.hy + (Math.random() - 0.5) * j, p.col, STEP); continue }
          const v = Math.min(1, u / p.T), e = v ** 1.8
          const r = p.d * (1 - e), a = p.a0 + p.spin * v * v
          if (v >= 1 || r < 2) { p.gone = true; continue }
          put(hx + Math.cos(a) * r, hy + Math.sin(a) * r, fade(p.col, 1 - 0.4 * v))
        }
        blit()
        const pr = 1.5 + 3 * smooth(0, tAppear, t)       // the pinhole
        const gl = g.createRadialGradient(hx, hy, pr, hx, hy, pr * 8)
        gl.addColorStop(0, FGs + (0.4 * smooth(0, 0.5, t)).toFixed(3) + ')'); gl.addColorStop(1, FGs + '0)')
        g.fillStyle = gl; g.beginPath(); g.arc(hx, hy, pr * 8, 0, Math.PI * 2); g.fill()
        g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, pr, 0, Math.PI * 2); g.fill()
        if (t >= tAppear) {
          phase = 'idle'; tPhase = t
          for (const p of px) if (p.keep) {                // the leftovers get caught and fall into orbit, keeping their colour
            const x0 = p.hx + Math.sin(t * 1.3 + p.d) * 6, y0 = p.hy + Math.cos(t * 1.1 + p.a0) * 6
            const dx = x0 - hx, dy = (y0 - hy) / TILT
            orb.push({ r: Math.min(Math.hypot(dx, dy), maxD * 1.4), a: Math.atan2(dy, dx), vr: 0, rt: R0 * (1.35 + 2.6 * Math.random() ** 1.4), col: p.col, x0, y0, c: 0 })
          }
        }
      } else if (phase === 'idle') {
        const u = t - tPhase, R = Rnow()
        const pop = u < 0.3 ? 1 - (1 - u / 0.3) ** 3 : 1    // the hole appears all at once around the pinhole
        const Rv = R * (pop + 0.08 * Math.sin(Math.min(u, 1.2) * 9) * Math.exp(-u * 4))
        shake = 3 * smooth(0.7, 1, density / DC)
        for (const o of orb) {
          o.c = Math.min(1, o.c + dt / 1.6)
          o.r += (o.rt - o.r) * (1 - Math.exp(-2.2 * dt)) * (1 - o.c * 0.6)
          orbit(o, dt, R, 0)
        }
        for (let k = orb.length - 1; k >= 0; k--) if (orb[k].r < R) { orb.splice(k, 1); density++ }
        for (let k = sparks.length - 1; k >= 0; k--) {
          const o = sparks[k]; orbit(o, dt, R, 3.5); o.vr -= R * 6 * dt
          if (o.r < R * 1.02) { sparks.splice(k, 1); density++ }
        }
        const front = []
        for (const o of orb) {
          const [ox, oy] = proj(o.r, o.a), k = smooth(0, 1, o.c), cx = o.x0 + (ox - o.x0) * k, cy = o.y0 + (oy - o.y0) * k
          if (Math.sin(o.a) > 0 || o.c < 0.6) front.push(cx, cy, o.col); else put(cx, cy, o.col)
        }
        for (const o of sparks) { const [sx, sy] = proj(o.r, o.a); if (Math.sin(o.a) > 0) front.push(sx, sy, o.col); else put(sx, sy, o.col) }
        blit()
        if (u < 0.4) { g.fillStyle = FGs + ((1 - u / 0.4) * 0.18).toFixed(3) + ')'; g.fillRect(0, 0, W, H) }
        lensRing(Rv, smooth(0, 0.4, u))
        u32.fill(0); for (let i = 0; i < front.length; i += 3) put(front[i], front[i + 1], front[i + 2]); blit()
        const pct = Math.min(99, Math.floor(100 * density / DC))   // a very discreet readout
        g.fillStyle = FGs + (0.3 * smooth(1, 2, u)).toFixed(3) + ')'
        g.font = '10px "JetBrains Mono", monospace'; g.textAlign = 'center'
        g.fillText(`DENSITY ${String(pct).padStart(2, '0')}%`, hx, hy + R0 * 5)
        if (density >= DC) { phase = 'collapse'; tPhase = t }
      } else if (phase === 'collapse') {
        // critical density: it shrinks, gathers power, trembles harder and harder
        const u = t - tPhase, R = Rnow(), v = clamp01(u / 1.5), Rv = R * (1 - 0.85 * smooth(0, 1, v))
        shake = 3 + 14 * v * v
        for (const arr of [orb, sparks]) {
          for (const o of arr) { orbit(o, dt, R, 8); o.vr -= R * 5 * dt }
          for (let k = arr.length - 1; k >= 0; k--) if (arr[k].r < Rv) arr.splice(k, 1)
          for (const o of arr) { const [sx, sy] = proj(o.r, o.a); put(sx, sy, o.col) }
        }
        blit()
        const jx = hx + shake * (Math.random() - 0.5), jy = hy + shake * (Math.random() - 0.5), gR = R * (1.2 + 2.5 * v)
        const gr = g.createRadialGradient(jx, jy, 0, jx, jy, gR)
        gr.addColorStop(0, `rgba(255,255,255,${(0.2 + 0.7 * v).toFixed(3)})`); gr.addColorStop(0.25, ACCs + (0.5 * v).toFixed(3) + ')'); gr.addColorStop(1, ACCs + '0)')
        g.fillStyle = gr; g.beginPath(); g.arc(jx, jy, gR, 0, Math.PI * 2); g.fill()
        g.fillStyle = '#000'; g.beginPath(); g.arc(jx, jy, Math.max(1.5, Rv), 0, Math.PI * 2); g.fill()
        if (u >= 1.55) {
          phase = 'rebuild'; tPhase = t
          document.documentElement.classList.remove('bh-on')       // the real page is back underneath, still covered
          rb = px.map(p => ({ d: Math.random() * 0.25 + (p.d / maxD) * 0.3, T: 0.9 + Math.random() * 0.7, bend: (Math.random() - 0.5) * 0.9 }))
        }
      } else if (phase === 'rebuild') {
        // pouf: every pixel of the site bursts out of the point and lands back where it belongs
        const u = t - tPhase
        let done = true
        for (let i = 0; i < px.length; i++) {
          const p = px[i], q = rb[i], v = clamp01((u - q.d) / q.T)
          if (v < 1) done = false
          if (v <= 0) continue
          const e = 1 - (1 - v) ** 3, b = Math.sin(Math.PI * e) * q.bend, dx = p.hx - hx, dy = p.hy - hy
          put(hx + dx * e - dy * b, hy + dy * e + dx * b, p.col, v > 0.97 ? STEP : 2)
        }
        const veil = 1 - smooth(0, 0.3, u - 2.05)            // once everything has landed, hand over to the real page
        if (veil > 0) {
          bctx.putImageData(img, 0, 0); g.imageSmoothingEnabled = false
          g.globalAlpha = veil; g.drawImage(buf, 0, 0, W, H); g.globalAlpha = 1
          if (u < 0.3) { const k = 1 - u / 0.3, gr = g.createRadialGradient(hx, hy, 0, hx, hy, 160 * (1 + u * 5)); gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H) }
        }
        if (done && veil <= 0) return finish()
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)

    function finish() {
      cv.remove()
      document.documentElement.classList.remove('bh-on')
      document.documentElement.style.overflow = ''; lenis?.start()
      mult = 1; busy = false
    }
    window.__bhFeed = n => { density += n }
  }
  // handy for testing from the console
  window.__warp = () => { mult = C; blackHole() }
  window.__mqSet = m => { mult = m }
}
