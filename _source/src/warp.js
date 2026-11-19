/*
  The banner: a small sign hangs under it, each click speeds it up (no limit), holding the banner brakes.
  Past the screen's frame rate the motion breaks into frames (ghosts, wagon-wheel crawl), near c it
  contracts like a relativistic ruler, and at c a black hole swallows the page. Click: neutron star, big bang.
*/
const C = 280                                   // the banner speed multiplier that counts as the speed of light
const clamp01 = v => Math.max(0, Math.min(1, v))
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }

export function initWarp(lenis) {
  const wrap = document.querySelector('.mq-wrap'), mq = wrap?.querySelector('.marquee')
  const track = mq?.querySelector('.marquee-track'), sign = wrap?.querySelector('.mq-sign')
  if (!wrap || !mq || !track || !sign) return
  const label = sign.querySelector('.mq-x'), blurG = document.getElementById('mqblur-g')
  let x = 0, mult = 1, held = false, last = performance.now(), shown = '', busy = false
  // the sign is a pendulum hanging from the banner
  let th = 0.09, om = 0

  const fmt = m => {
    const b = m / C
    if (b >= 0.3) return b.toFixed(2).replace(/^0/, '') + 'c'
    return m < 10 ? '×' + m.toFixed(1).replace(/\.0$/, '') : '×' + Math.round(m)
  }
  sign.addEventListener('pointerdown', ev => ev.stopPropagation())
  sign.addEventListener('click', () => {
    if (busy) return
    mult *= 1.6
    om += (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random())   // a little knock
    if (mult >= C) blackHole()
  })
  mq.addEventListener('pointerdown', ev => { held = true; mq.classList.add('braking'); mq.setPointerCapture?.(ev.pointerId) })
  const up = () => { held = false; mq.classList.remove('braking') }
  mq.addEventListener('pointerup', up); mq.addEventListener('pointercancel', up); mq.addEventListener('lostpointercapture', up)

  let blurOn = false
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    if (held) mult *= Math.exp(-2.2 * dt)
    else if (mult < 1) mult += (1 - mult) * (1 - Math.exp(-1.5 * dt))
    const half = track.scrollWidth / 4, items = Math.max(1, track.children.length / 8)   // 4 copies, so the contracted track still fills the screen
    if (half > 0) {
      const v = (half / 22) * mult, dpf = v / 60                  // px per frame on a 60 Hz screen
      // past ~1/3 of a word per frame the eye only sees the frames: the apparent motion aliases (wagon wheel)
      const P = half / items, a = (((dpf + P / 2) % P) + P) % P - P / 2
      const w = smooth(P * 0.25, P * 0.6, dpf)
      x -= ((1 - w) * dpf + w * a) * 60 * dt
      x %= half
      const beta = Math.min(0.999, mult / C), gamma = Math.sqrt(1 - beta * beta)
      const lorentz = 1 - smooth(0.35, 1, beta) * (1 - Math.max(0.3, gamma))   // length contraction near c
      track.style.transform = `translate3d(${x - half}px,0,0) scaleX(${lorentz.toFixed(4)})`
      track.style.transformOrigin = `${half - x + mq.clientWidth / 2}px 50%`
      // ghosts of the previous frames, then a smear
      const g = smooth(P * 0.08, P * 0.5, dpf), n = Math.round(g * 4)
      if (n > 0) {
        const step = Math.max(8, Math.abs(a) * 0.5 + P * 0.06 * g)
        track.style.textShadow = Array.from({ length: n }, (_, k) => `${((k + 1) * step).toFixed(1)}px 0 rgba(11,11,11,${(0.32 / (k + 1)).toFixed(3)})`).join(',')
      } else track.style.textShadow = ''
      const sd = Math.min(7, dpf * 0.05) * (1 - 0.5 * w)
      if (sd > 0.25) { blurG.setAttribute('stdDeviation', `${sd.toFixed(2)} 0`); if (!blurOn) { track.style.filter = 'url(#mqblur)'; blurOn = true } }
      else if (blurOn) { track.style.filter = ''; blurOn = false }
      mq.style.boxShadow = beta > 0.5 ? `0 0 ${(60 * smooth(0.5, 1, beta)).toFixed(0)}px rgba(200,255,0,${(0.35 * smooth(0.5, 1, beta)).toFixed(3)})` : ''
      // the sign leans in the wind and swings
      const wind = Math.min(0.55, 0.08 * Math.log(Math.max(1, mult)))
      om += (-(th - 0.09 - wind) * 18 - om * 1.1) * dt + (mult > 8 ? (Math.random() - 0.5) * Math.min(6, mult / 30) * dt : 0)
      th += om * dt
      sign.style.transform = `rotate(${th.toFixed(4)}rad)`
    }
    const t = fmt(Math.max(0, mult)); if (t !== shown) { shown = t; label.textContent = t }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  /* ---------------- black hole ---------------- */
  function pickPieces(W, H) {
    const out = [], skip = new Set(['SCRIPT', 'STYLE', 'svg', 'SVG', 'NOSCRIPT'])
    const vis = r => r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W
    const walk = el => {
      if (skip.has(el.tagName) || el.classList.contains('sr-only')) return
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return
      const r = el.getBoundingClientRect()
      if (!vis(r)) return
      const kids = [...el.children]
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      const inlineKids = kids.some(k => getComputedStyle(k).display === 'inline')
      if (r.width * r.height < W * H * 0.06 || !kids.length || hasText || inlineKids) {
        if (cs.display !== 'inline') out.push({ el, r, op: +cs.opacity })
        return
      }
      kids.forEach(walk)
    }
    for (const el of document.body.children) {
      if (el.matches('.flow-layer, .game-layer, .bh-layer, .cursor, .loader, canvas')) continue
      walk(el)
    }
    return out.slice(0, 220)
  }

  function blackHole() {
    if (busy) return
    busy = true; held = false; mult = 1
    const W = innerWidth, H = innerHeight, hx = W / 2, hy = H / 2
    lenis?.stop(); document.documentElement.style.overflow = 'hidden'
    const layers = [...document.querySelectorAll('.flow-layer, .game-layer')]
    layers.forEach(l => l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' }))

    const pieces = pickPieces(W, H)
    const maxR = Math.hypot(W, H) / 2
    const anims = pieces.map(pc => {
      const cx = pc.r.left + pc.r.width / 2, cy = pc.r.top + pc.r.height / 2
      const r0 = Math.max(1, Math.hypot(cx - hx, cy - hy)), t0 = Math.atan2(cy - hy, cx - hx)
      const spin = 2.4 + 900 / (r0 + 120), frames = []
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, s = t ** 1.7, r = r0 * (1 - s), th = t0 + spin * s ** 1.3
        const tx = hx + r * Math.cos(th) - cx, ty = hy + r * Math.sin(th) - cy
        frames.push({
          offset: t, translate: `${tx.toFixed(1)}px ${ty.toFixed(1)}px`, rotate: `${(57.3 * (th - t0) * 0.8).toFixed(1)}deg`,
          scale: `${Math.max(0, (1 - s) ** 0.7 * (1 + 0.6 * s * (1 - s))).toFixed(3)} ${Math.max(0, (1 - s) ** 0.9).toFixed(3)}`,
          opacity: (pc.op * (1 - smooth(0.75, 1, t))).toFixed(3), filter: `blur(${(4 * s * s).toFixed(2)}px)`,
        })
      }
      const delay = 350 + (r0 / maxR) * 900 + Math.random() * 200
      return { pc, cx, cy, r0, a: pc.el.animate(frames, { duration: 1700 + Math.random() * 500, delay, easing: 'cubic-bezier(.5,0,.85,.6)', fill: 'forwards' }) }
    })

    // canvas: darkness, accretion disk, lensing ring, then the neutron star and the big bang
    const cv = document.createElement('canvas'); cv.className = 'bh-layer'
    const dpr = Math.min(2, devicePixelRatio || 1); cv.width = W * dpr; cv.height = H * dpr
    document.body.appendChild(cv)
    const g = cv.getContext('2d'); g.scale(dpr, dpr)
    const R = Math.min(W, H) * 0.075
    const disk = Array.from({ length: 1400 }, () => {
      const rr = R * (1.35 + 2.2 * Math.random() ** 1.6)
      return { rr, a: Math.random() * Math.PI * 2, w: 2.4 * (R / rr) ** 1.5, h: Math.random(), s: 0.6 + Math.random() * 1.4 }
    })
    let debris = [], phase = 'grow', t0 = performance.now(), tClick = 0, rings = []
    const start = performance.now()

    const drawDisk = (rad, front, alpha, tilt) => {
      for (const d of disk) {
        const sn = Math.sin(d.a)
        if ((sn > 0) !== front) continue
        const rr = d.rr * rad / R, x = hx + Math.cos(d.a) * rr, y = hy + sn * rr * tilt
        const dop = 0.55 + 0.45 * -Math.cos(d.a + 0.4)            // approaching side is brighter
        const hot = d.rr < R * 1.9
        g.fillStyle = hot ? `rgba(241,239,233,${(alpha * dop).toFixed(3)})` : `rgba(200,255,0,${(alpha * dop * 0.8).toFixed(3)})`
        const len = Math.min(10, d.w * rr * 0.05 + 1)
        g.save(); g.translate(x, y); g.rotate(Math.atan2(Math.cos(d.a) * tilt, -sn)); g.fillRect(-len / 2, 0, len, d.s * 0.8); g.restore()
      }
    }
    const lensRing = (rad, alpha) => {
      // light from the far side of the disk bent over and under the hole
      g.save(); g.translate(hx, hy)
      for (let k = 0; k < 3; k++) {
        g.beginPath(); g.ellipse(0, 0, rad * (1.28 + k * 0.18), rad * (1.12 + k * 0.16), 0, 0, Math.PI * 2)
        g.strokeStyle = `rgba(${k ? '200,255,0' : '241,239,233'},${(alpha * (0.5 - k * 0.14)).toFixed(3)})`; g.lineWidth = k ? 1 : 2; g.stroke()
      }
      const gr = g.createRadialGradient(0, 0, rad * 0.9, 0, 0, rad * 1.7)
      gr.addColorStop(0, `rgba(241,239,233,${(0.18 * alpha).toFixed(3)})`); gr.addColorStop(1, 'rgba(241,239,233,0)')
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad * 1.7, 0, Math.PI * 2); g.fill()
      g.restore()
    }

    const frame = now => {
      const t = (now - start) / 1000, dt = 1 / 60
      g.clearRect(0, 0, W, H)
      if (phase === 'grow' || phase === 'idle') {
        const dark = smooth(0.2, 2.6, t), rad = R * smooth(0, 1.4, t), tilt = 0.24
        g.fillStyle = `rgba(4,4,4,${dark})`; g.fillRect(0, 0, W, H)
        for (const d of disk) d.a += d.w * dt * (0.4 + smooth(0, 2, t))
        const al = smooth(0.1, 1.6, t)
        drawDisk(rad, false, al, tilt); lensRing(rad, al)
        g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, rad, 0, Math.PI * 2); g.fill()
        drawDisk(rad, true, al, tilt)
        if (t > 3.6) {
          phase = 'idle'
          const k = 0.18 + 0.12 * Math.sin(t * 2.2)
          g.fillStyle = `rgba(241,239,233,${k * smooth(3.6, 4.6, t)})`
          g.font = '10px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('CLICK', hx, hy + R * 3.4)
        }
      } else {
        const u = (now - tClick) / 1000
        g.fillStyle = `rgba(4,4,4,${1 - smooth(1.55, 2.6, u)})`; g.fillRect(0, 0, W, H)
        if (u < 0.55) {                                   // collapse: the hole and its disk fall to a point
          const k = 1 - smooth(0, 0.55, u), rad = R * k
          for (const d of disk) d.a += d.w * dt * (2 + 8 * (1 - k))
          drawDisk(rad, false, k, 0.24 * k); lensRing(rad, k)
          g.fillStyle = '#000'; g.beginPath(); g.arc(hx, hy, rad, 0, Math.PI * 2); g.fill(); drawDisk(rad, true, k, 0.24 * k)
        } else if (u < 1.5) {                             // neutron star: tiny, spinning, beaming, unstable
          const v = (u - 0.55) / 0.95, rs = 3 + 2 * v + Math.sin(u * 90) * v * 1.5
          const gl = g.createRadialGradient(hx, hy, 0, hx, hy, 40 + 50 * v)
          gl.addColorStop(0, 'rgba(255,255,255,.9)'); gl.addColorStop(0.2, `rgba(200,255,0,${0.35 + 0.3 * v})`); gl.addColorStop(1, 'rgba(200,255,0,0)')
          g.fillStyle = gl; g.beginPath(); g.arc(hx, hy, 40 + 50 * v, 0, Math.PI * 2); g.fill()
          const ang = u * (8 + 30 * v)
          g.save(); g.translate(hx, hy); g.rotate(ang)
          for (const sgn of [1, -1]) {
            const bl = g.createLinearGradient(0, 0, 0, sgn * Math.max(W, H))
            bl.addColorStop(0, `rgba(241,239,233,${0.5 * (0.4 + v)})`); bl.addColorStop(1, 'rgba(241,239,233,0)')
            g.fillStyle = bl; g.beginPath(); g.moveTo(-2, 0); g.lineTo(-30 - 40 * v, sgn * Math.max(W, H)); g.lineTo(30 + 40 * v, sgn * Math.max(W, H)); g.lineTo(2, 0); g.fill()
          }
          g.restore()
          g.fillStyle = '#fff'; g.beginPath(); g.arc(hx, hy, rs, 0, Math.PI * 2); g.fill()
        } else {
          if (phase !== 'bang') {                          // big bang
            phase = 'bang'
            debris = Array.from({ length: 900 }, () => {
              const a = Math.random() * Math.PI * 2, sp = 200 + 1600 * Math.random() ** 2
              return { x: hx, y: hy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, acc: Math.random() < 0.3, s: 1 + Math.random() * 2 }
            })
            rings = [0, 0.12, 0.3]
            reassemble()
          }
          const v = u - 1.5
          g.fillStyle = `rgba(255,255,255,${(1 - smooth(0, 0.5, v)) * 0.95})`; g.fillRect(0, 0, W, H)
          for (const d0 of rings) {
            const q = v - d0; if (q < 0) continue
            const rr = q * Math.max(W, H) * 1.1
            g.beginPath(); g.arc(hx, hy, rr, 0, Math.PI * 2)
            g.strokeStyle = `rgba(200,255,0,${Math.max(0, 0.6 - q * 0.6).toFixed(3)})`; g.lineWidth = 2 + 10 * Math.max(0, 0.6 - q); g.stroke()
          }
          for (const p of debris) {
            p.vx *= 0.975; p.vy *= 0.975; p.x += p.vx * dt; p.y += p.vy * dt
            const al = Math.max(0, 1 - v / 1.6)
            g.fillStyle = p.acc ? `rgba(200,255,0,${al})` : `rgba(241,239,233,${al})`; g.fillRect(p.x, p.y, p.s, p.s)
          }
          if (v > 1.9) return finish()
        }
      }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)

    cv.addEventListener('pointerdown', ev => {
      ev.stopPropagation()
      if (phase !== 'idle') return
      phase = 'collapse'; tClick = performance.now()
    })

    function reassemble() {
      for (const o of anims) {
        const { pc, cx, cy, r0 } = o
        const tx = hx - cx, ty = hy - cy
        o.b = pc.el.animate([
          { translate: `${tx}px ${ty}px`, rotate: `${(Math.random() - 0.5) * 720}deg`, scale: '0', opacity: 0, filter: 'blur(6px)' },
          { translate: '0px 0px', rotate: '0deg', scale: '1', opacity: pc.op, filter: 'blur(0px)' },
        ], { duration: 1100 + Math.random() * 500, delay: (r0 / maxR) * 250, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' })
        o.a.cancel()
      }
      layers.forEach(l => l.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 500, fill: 'forwards' }))
    }
    function finish() {
      setTimeout(() => {
        anims.forEach(o => o.b?.cancel())
        layers.forEach(l => l.getAnimations().forEach(a => a.cancel()))
        cv.remove()
        document.documentElement.style.overflow = ''; lenis?.start()
        mult = 1; th = 0.09; om = 3; busy = false
      }, 1700)
      g.clearRect(0, 0, W, H)
      cv.style.pointerEvents = 'none'
    }
  }
  // handy for testing from the console
  window.__warp = () => { mult = C; blackHole() }
  window.__mqSet = m => { mult = m }
}
