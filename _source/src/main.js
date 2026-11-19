import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/jetbrains-mono/400.css'
import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { initWarp } from './warp.js'
import { initCards } from './cards.js'
import { initLab } from './lab.js'
import { initFlow } from './flow.js'

gsap.registerPlugin(ScrollTrigger)
const ACC = '#c8ff00'
const isTouch = matchMedia('(hover: none)').matches
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
// cosine schedule
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const alphaBar = t => Math.cos((t + 0.008) / 1.008 * Math.PI / 2) ** 2

/* ---------- smooth scroll ---------- */
const lenis = new Lenis({ lerp: 0.09 })
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add(time => lenis.raf(time * 1000))
gsap.ticker.lagSmoothing(0)
document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault()
  const id = a.getAttribute('href')
  lenis.scrollTo(id === '#' ? 0 : id, { duration: 1.4 })
}))

/* ---------- cursor ---------- */
const cursor = document.querySelector('.cursor')
if (!isTouch) {
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3' })
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3' })
  addEventListener('mousemove', e => { xTo(e.clientX); yTo(e.clientY) })
  document.querySelectorAll('[data-hover]').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('big'))
    el.addEventListener('mouseleave', () => cursor.classList.remove('big'))
  })
}

/* ---------- hero: particles denoise into the name ---------- */
const hero = (() => {
  const cv = document.getElementById('particles'), ctx = cv.getContext('2d')
  const tstep = document.getElementById('tstep')
  let W, H, dpr, P = [], F = [], M = 0, exits = [], rogue = null, hunters = [], shots = [], bursts = [], caught = false, WB = { y0: 0, h: 1 }, t = 1, scrollT = 0, lastT = performance.now()
  const mouse = { x: -1e4, y: -1e4 }, gm = { x: -1e4, y: -1e4 }
  const gcv = document.createElement('canvas'); gcv.className = 'game-layer'; document.body.appendChild(gcv)
  const gctx = gcv.getContext('2d')
  addEventListener('mousemove', e => { gm.x = e.clientX; gm.y = e.clientY })

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2)
    W = cv.clientWidth; H = cv.clientHeight
    cv.width = W * dpr; cv.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    gcv.width = W * dpr; gcv.height = H * dpr; gctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // draw name offscreen and sample pixels
    const off = document.createElement('canvas'); off.width = W; off.height = H
    const o = off.getContext('2d')
    const lines = W < 800 ? ['AURÈLE', 'HABBARD'] : ['AURÈLE HABBARD']
    let fs = 100
    o.font = `800 ${fs}px Syne`
    const widest = Math.max(...lines.map(l => o.measureText(l).width))
    fs = Math.min(fs * (W * (W < 800 ? 0.88 : 0.9)) / widest, H * 0.3)
    o.font = `800 ${fs}px Syne`
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'
    const lh = fs * 0.95, y0 = H * 0.45 - (lines.length - 1) * lh / 2
    lines.forEach((l, i) => o.fillText(l, W / 2, y0 + i * lh))
    const data = o.getImageData(0, 0, W, H).data
    const step = Math.max(2, Math.round(W / 520))
    const targets = []
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step)
      if (data[4 * (y * W + x) + 3] > 128) targets.push([x, y])
    const s = Math.min(W, H) * 0.32
    P = targets.map(([x, y]) => ({
      tx: x, ty: y,
      ex: randn() * s, ey: randn() * s,      // fixed noise sample
      ox: 0, oy: 0, vx: 0, vy: 0,            // mouse offset spring
      ph: Math.random() * 0.8,
      acc: Math.random() < 0.025,
      loose: Math.random() < 0.03, lp: Math.random() * 20,
    }))
    // free particles wandering around the name
    const band = (lines.length * lh) * 1.4 + H * 0.12
    WB = { y0: y0 - band / 2 - lh * 0.2, h: band + lh * (lines.length - 1) * 0.4 }
    computeX(targets.length, y0)
    window.__heroTargets = targets
    rogue = { x: W * 0.8, y: y0, vx: 0, vy: 0, trail: [], ph: Math.random() * 10, home: [W / 2, y0], span: [W * 0.42, lh * 1.4], hit: 0 }
    hunters = [{ x: -30, y: y0 - lh, vx: 0, vy: 0, cool: 2.5, side: 1 }, { x: W + 30, y: y0 + lh, vx: 0, vy: 0, cool: 3.4, side: -1 }]; shots = []; bursts = []
    F = Array.from({ length: W < 800 ? 160 : 380 }, () => ({
      x: Math.random() * W, s: 1 + Math.random() * 1.6,
      a: 0.18 + Math.random() * 0.45, acc: Math.random() < 0.12, ph: Math.random() * 10,
      // dense band around the name, then a tail whose density decays exponentially up to the hero edges
      ay: Math.random() < 0.75 ? WB.y0 + Math.random() * WB.h
        : (Math.random() < 0.5 ? WB.y0 + Math.log(Math.random()) * H * 0.09 : WB.y0 + WB.h - Math.log(Math.random()) * H * 0.09),
    })).filter(q => q.ay > 4 && q.ay < H - 4)
    F.forEach(q => { q.y = q.ay; const d = Math.max(0, WB.y0 - q.ay, q.ay - WB.y0 - WB.h); q.a *= Math.exp(-d / (H * 0.35)) })
  }

  // easter egg: the same particles can also draw the X
  const xImg = new Image(); xImg.src = 'x-mask.png'
  let lastN = 0, lastY = 0
  function computeX(n, yc) {
    lastN = n; lastY = yc
    const xo = document.createElement('canvas'); xo.width = W; xo.height = H
    const g = xo.getContext('2d'), xh = Math.min(H * 0.66, W * 0.85)
    if (xImg.complete && xImg.naturalWidth) {
      const xw = xh * xImg.naturalWidth / xImg.naturalHeight
      g.drawImage(xImg, W / 2 - xw / 2, H * 0.45 - xh / 2, xw, xh)
    } else { g.font = `800 ${xh}px Syne`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('X', W / 2, H * 0.45) }
    const xd = g.getImageData(0, 0, W, H).data, xt = []
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (xd[4 * (y * W + x) + 3] > 128) xt.push([x, y])
    for (let i = xt.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[xt[i], xt[j]] = [xt[j], xt[i]] }
    P.forEach((p, i) => { const q = xt[i % xt.length]; p.xx = q[0] + (Math.random() - 0.5) * 2; p.xy = q[1] + (Math.random() - 0.5) * 2; p.d = p.d ?? Math.random(); p.cr = p.cr ?? (40 + Math.random() * 220) * (W < 800 ? 0.5 : 1); p.ca = p.ca ?? Math.random() * 7 })
  }
  xImg.onload = () => { if (P.length) computeX(lastN, lastY) }

  function frame() {
    const tt = Math.min(1, t + scrollT)
    const ab = Math.cos(tt * Math.PI / 2) ** 2, a = Math.sqrt(ab), b = Math.sqrt(1 - ab)
    tstep.textContent = `t = ${String(Math.round(tt * 1000)).padStart(4, '0')}`
    ctx.clearRect(0, 0, W, H)
    const cx = W / 2, cy = H * 0.45
    const r = step() * 0.72
    const now = performance.now(), time = now / 1000, dt = Math.min(0.05, (now - lastT) / 1000); lastT = now
    // wanderers: drift sideways around their own height, wrap horizontally
    for (const q of F) {
      q.x += (26 * Math.sin(q.y * 0.012 + time * 0.45 + q.ph) + 12 * Math.cos(time * 0.3 + q.ph)) * dt
      q.y = q.ay + 14 * Math.sin(q.x * 0.006 + time * 0.5 + q.ph) + 6 * Math.sin(time * 0.9 + q.ph * 3)
      if (q.x < -10) q.x = W + 10; if (q.x > W + 10) q.x = -10
      ctx.fillStyle = q.acc ? `rgba(200,255,0,${q.a})` : `rgba(241,239,233,${q.a})`
      ctx.fillRect(q.x, q.y, q.s, q.s)
    }
    for (const p of P) {
      // mouse repulsion with spring back
      // slow fluid drift: a smooth flow field, same for neighbours
      let fx = 3.6 * Math.sin(p.ty * 0.009 + p.tx * 0.0045 + time * 1.1) + 0.5 * Math.sin(time * 1.7 + p.ph * 4)
      let fy = 3 * Math.cos(p.tx * 0.006 - p.ty * 0.003 + time * 0.85) + 0.5 * Math.cos(time * 1.4 + p.ph * 5)
      if (p.loose) { fx += 16 * Math.sin(time * 0.8 + p.lp) + 8 * Math.sin(time * 1.9 + p.lp * 2); fy += 11 * Math.cos(time * 0.65 + p.lp * 1.3) }
      const m = M <= 0 ? 0 : easeIO(Math.max(0, Math.min(1, M * 1.6 - p.d * 0.6)))
      const ch = Math.sin(Math.PI * m) * p.cr, ang = p.ca + m * 5 + time * 0.8
      let bx = p.tx + (p.xx - p.tx) * m + Math.cos(ang) * ch, by = p.ty + (p.xy - p.ty) * m + Math.sin(ang) * ch * 0.8
      const x0 = cx + a * (bx - cx) + b * p.ex + fx, y0 = cy + a * (by - cy) + b * p.ey + fy
      const dx = x0 + p.ox - mouse.x, dy = y0 + p.oy - mouse.y, d2 = dx * dx + dy * dy
      if (d2 < 12000) { const f = (12000 - d2) / 12000 * 2.2, d = Math.sqrt(d2) + 1e-3; p.vx += dx / d * f; p.vy += dy / d * f }
      p.vx += -p.ox * 0.06; p.vy += -p.oy * 0.06; p.vx *= 0.82; p.vy *= 0.82
      p.ox += p.vx; p.oy += p.vy
      ctx.fillStyle = p.acc ? ACC : `rgba(241,239,233,${0.5 + 0.5 * ab})`
      ctx.fillRect(x0 + p.ox, y0 + p.oy, r, r)
    }
    // ---- the chase lives on its own fixed layer, in viewport coordinates, so it follows the visitor down the page
    const heroTop = cv.getBoundingClientRect().top
    gctx.clearRect(0, 0, W, H)
    // full presence on the hero, a faint background game further down
    gctx.globalAlpha = 0.22 + 0.78 * Math.max(0, Math.min(1, 1 + heroTop / (H * 0.7)))
    // drones leaving after the catch: spin up, then warp out with a streak and pop
    exits = exits.filter(e => {
      e.t += dt
      if (e.t < 0.5) { e.spin += dt * (6 + e.t * 50); e.y -= dt * 20 }
      else if (!e.done) {
        const dir = e.ang + e.spin, a2 = 2600
        e.vx += Math.cos(dir) * a2 * dt; e.vy += Math.sin(dir) * a2 * dt; e.x += e.vx * dt; e.y += e.vy * dt
        const sp = Math.hypot(e.vx, e.vy)
        gctx.strokeStyle = 'rgba(241,239,233,.55)'; gctx.lineWidth = 1.5; gctx.beginPath(); gctx.moveTo(e.x, e.y); gctx.lineTo(e.x - e.vx / sp * Math.min(160, sp * 0.12), e.y - e.vy / sp * Math.min(160, sp * 0.12)); gctx.stroke()
        if (e.t > 0.85 || e.x < -40 || e.x > W + 40 || e.y < -40 || e.y > H + 40) {
          e.done = true
          for (let k = 0; k < 16; k++) { const a3 = Math.random() * 7, v3 = 80 + Math.random() * 220; bursts.push({ x: Math.max(4, Math.min(W - 4, e.x)), y: Math.max(4, Math.min(H - 4, e.y)), vx: Math.cos(a3) * v3, vy: Math.sin(a3) * v3, life: 0.6 }) }
        }
      }
      if (!e.done) {
        const st2 = e.t < 0.5 ? 1 : 1 + (e.t - 0.5) * 3
        gctx.save(); gctx.translate(e.x, e.y); gctx.rotate(e.ang + e.spin); gctx.scale(st2, 1 / st2)
        gctx.strokeStyle = 'rgba(241,239,233,.9)'; gctx.lineWidth = 1.3
        gctx.beginPath(); gctx.moveTo(8, 0); gctx.lineTo(-6, -5); gctx.lineTo(-3, 0); gctx.lineTo(-6, 5); gctx.closePath(); gctx.stroke(); gctx.restore()
      }
      return e.t < 1.6
    })
    if (caught) bursts = bursts.filter(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; gctx.fillStyle = `rgba(200,255,0,${b.life * 2})`; gctx.fillRect(b.x - 1, b.y - 1, 2, 2); return b.life > 0 })
    drawBow(dt, time, heroTop)
    // the escaping pixel
    if (rogue && !caught) {
      const q = rogue, hx = q.home[0], hy = Math.max(H * 0.25, Math.min(H * 0.7, q.home[1] + heroTop))
      const wx = hx + Math.sin(time * 0.37 + q.ph) * q.span[0] + Math.sin(time * 1.3) * 30, wy = hy + Math.cos(time * 0.53 + q.ph) * q.span[1]
      q.vx += (wx - q.x) * 0.9 * dt; q.vy += (wy - q.y) * 0.9 * dt
      const dx = q.x - gm.x, dy = q.y - gm.y, d = Math.hypot(dx, dy)
      if (d < 160) { const f = (160 - d) / 160 * 2600 * dt; q.vx += dx / (d + 1e-3) * f; q.vy += dy / (d + 1e-3) * f }
      q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt)
      q.x = Math.max(20, Math.min(W - 20, q.x + q.vx * dt)); q.y = Math.max(H * 0.08, Math.min(H * 0.92, q.y + q.vy * dt))
      q.trail.push([q.x, q.y]); if (q.trail.length > 14) q.trail.shift()
      q.trail.forEach(([x, y], i) => { gctx.fillStyle = `rgba(200,255,0,${(i / q.trail.length) * 0.35})`; gctx.fillRect(x - 1.5, y - 1.5, 3, 3) })
      const pulse = 1 + 0.35 * Math.sin(time * 6)
      gctx.strokeStyle = 'rgba(200,255,0,.35)'; gctx.lineWidth = 1; gctx.beginPath(); gctx.arc(q.x, q.y, 9 * pulse, 0, 7); gctx.stroke()
      // two micro hunters chase the pixel and shoot at it, the pixel dodges
      for (const s of shots) {
        const rx = q.x - s.x, ry = q.y - s.y, dd = Math.hypot(rx, ry)
        if (dd < 200 && rx * s.vx + ry * s.vy > 0) { const px = -s.vy, py = s.vx, n = Math.hypot(px, py), sg = Math.sign(rx * px + ry * py) || 1; q.vx += px / n * sg * 2600 * dt * (1 - dd / 200); q.vy += py / n * sg * 2600 * dt * (1 - dd / 200) }
      }
      for (const h of hunters) {
        const dx2 = q.x - h.x, dy2 = q.y - h.y, dist = Math.hypot(dx2, dy2) + 1e-3, ux = dx2 / dist, uy = dy2 / dist
        const want = W < 800 ? 90 : 150, pull = (dist - want) * 2.2
        h.vx += (ux * pull - uy * h.side * 90) * dt; h.vy += (uy * pull + ux * h.side * 90) * dt
        h.vx *= Math.pow(0.3, dt); h.vy *= Math.pow(0.3, dt)
        const sp = Math.hypot(h.vx, h.vy); if (sp > 230) { h.vx *= 230 / sp; h.vy *= 230 / sp }
        h.x += h.vx * dt; h.y += h.vy * dt
        h.cool -= dt
        if (h.cool <= 0 && dist < 420) {
          const v = 400, tt2 = dist / v, sp2 = (Math.random() - 0.5) * 0.3, ax0 = q.x + q.vx * tt2 * 0.5 - h.x, ay0 = q.y + q.vy * tt2 * 0.5 - h.y, ax = ax0 * Math.cos(sp2) - ay0 * Math.sin(sp2), ay = ax0 * Math.sin(sp2) + ay0 * Math.cos(sp2), an = Math.hypot(ax, ay) + 1e-3
          shots.push({ x: h.x, y: h.y, vx: ax / an * v, vy: ay / an * v, life: 99, age: 0 })
          h.cool = 1.3 + Math.random() * 1.2
        }
        const ang = Math.atan2(uy, ux)
        gctx.save(); gctx.translate(h.x, h.y); gctx.rotate(ang)
        gctx.strokeStyle = 'rgba(241,239,233,.9)'; gctx.lineWidth = 1.3
        gctx.beginPath(); gctx.moveTo(8, 0); gctx.lineTo(-6, -5); gctx.lineTo(-3, 0); gctx.lineTo(-6, 5); gctx.closePath(); gctx.stroke()
        gctx.fillStyle = `rgba(255,120,60,${0.5 + 0.5 * Math.sin(time * 30 + h.side)})`; gctx.fillRect(-8, -1, 2.5, 2)
        gctx.restore()
      }
      shots = shots.filter(s => {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.age += dt
        // blasts shove the particles of the name they fly through
        if (heroTop > -H) for (const p of P) {
          const bx = p.ox, dxp = s.x - (p.tx + bx), dyp = s.y - heroTop - (p.ty + p.oy)
          if (dxp * dxp + dyp * dyp < 220) { p.vx -= dxp * 0.08 + s.vx * 0.004; p.vy -= dyp * 0.08 + s.vy * 0.004 }
        }
        if (s.age < 1.4 && Math.hypot(s.x - q.x, s.y - q.y) < 6) {
          q.hit = 0.35; q.vx += s.vx * 0.9; q.vy += s.vy * 0.9
          for (let k = 0; k < 14; k++) { const a2 = Math.random() * 7, v2 = 60 + Math.random() * 160; bursts.push({ x: q.x, y: q.y, vx: Math.cos(a2) * v2, vy: Math.sin(a2) * v2, life: 0.5 }) }
          setTimeout(() => catchIt(), 250)
          return false
        }
        const n = Math.hypot(s.vx, s.vy)
        gctx.strokeStyle = 'rgba(255,140,90,.95)'; gctx.lineWidth = 2; gctx.beginPath(); gctx.moveTo(s.x, s.y); gctx.lineTo(s.x - s.vx / n * 9, s.y - s.vy / n * 9); gctx.stroke()
        return s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20
      })
      bursts = bursts.filter(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; gctx.fillStyle = `rgba(200,255,0,${b.life * 2})`; gctx.fillRect(b.x - 1, b.y - 1, 2, 2); return b.life > 0 })
      q.hit = Math.max(0, q.hit - dt)
      gctx.fillStyle = q.hit > 0 && Math.floor(time * 30) % 2 ? '#ffffff' : ACC; gctx.fillRect(q.x - 3, q.y - 3, 6, 6)
      document.documentElement.style.cursor = Math.hypot(q.x - gm.x, q.y - gm.y) < 26 ? 'pointer' : ''
    }
  }
  const step = () => Math.max(2, Math.round(W / 520))

  cv.addEventListener('mousemove', e => { const rc = cv.getBoundingClientRect(); mouse.x = e.clientX - rc.left; mouse.y = e.clientY - rc.top })
  cv.addEventListener('mouseleave', () => { mouse.x = mouse.y = -1e4 })
  addEventListener('pointerdown', e => {
    if (!rogue || caught) return
    if (Math.hypot(e.clientX - rogue.x, e.clientY - rogue.y) > (e.pointerType === 'touch' ? 40 : 26)) return startBow(e)
    catchIt()
  })

  /* ---------- on the hero: click, drag back like a bow, release → a laser shot the other way ---------- */
  let bow = null, lasers = []
  window.__rogue = () => rogue && !caught ? [rogue.x, rogue.y] : null
  function startBow(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (cv.getBoundingClientRect().top < -H * 0.35) return
    if (e.target.closest('a, button, input, .marquee, .mq-wrap')) return
    bow = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), sparks: [] }
    document.documentElement.classList.add('aiming')
  }
  addEventListener('pointermove', e => { if (bow) { bow.x = e.clientX; bow.y = e.clientY } })
  addEventListener('pointerup', () => {
    if (!bow) return
    const b = bow; bow = null; document.documentElement.classList.remove('aiming')
    const dx = b.x0 - b.x, dy = b.y0 - b.y, len = Math.hypot(dx, dy)
    if (len < 14) return
    const pw = Math.min(1, len / 170), ux = dx / len, uy = dy / len
    // the ray runs to the edge of the screen
    let tEnd = 1e5
    for (const [o, d, lim] of [[b.x0, ux, W], [b.y0, uy, H]]) { if (d > 0) tEnd = Math.min(tEnd, (lim - o) / d); else if (d < 0) tEnd = Math.min(tEnd, -o / d) }
    lasers.push({ x: b.x0, y: b.y0, ux, uy, tEnd, head: 0, age: 0, pw, hit: false })
  })
  addEventListener('blur', () => { bow = null; document.documentElement.classList.remove('aiming') })

  function drawBow(dt, time) {
    if (bow) {
      const dx = bow.x0 - bow.x, dy = bow.y0 - bow.y, len = Math.hypot(dx, dy), pw = Math.min(1, len / 170)
      const ux = len ? dx / len : 0, uy = len ? dy / len : 0, held = (performance.now() - bow.t0) / 1000
      // energy gathering at the muzzle
      if (Math.random() < 0.3 + pw) { const a = Math.random() * 7, r = 26 + Math.random() * 30; bow.sparks.push({ x: bow.x0 + Math.cos(a) * r, y: bow.y0 + Math.sin(a) * r, life: 1 }) }
      bow.sparks = bow.sparks.filter(s => { s.x += (bow.x0 - s.x) * 6 * dt; s.y += (bow.y0 - s.y) * 6 * dt; s.life -= dt * 2.2; gctx.fillStyle = `rgba(200,255,0,${s.life * 0.8})`; gctx.fillRect(s.x - 1, s.y - 1, 2, 2); return s.life > 0 })
      // the string, pulled back to the cursor
      gctx.strokeStyle = 'rgba(241,239,233,.25)'; gctx.lineWidth = 1; gctx.setLineDash([2, 4])
      gctx.beginPath(); gctx.moveTo(bow.x0, bow.y0); gctx.lineTo(bow.x, bow.y); gctx.stroke()
      // where it will go
      if (len > 14) {
        gctx.strokeStyle = `rgba(200,255,0,${0.25 + 0.35 * pw})`; gctx.setLineDash([6, 6]); gctx.lineDashOffset = -time * 40
        gctx.beginPath(); gctx.moveTo(bow.x0 + ux * 14, bow.y0 + uy * 14); gctx.lineTo(bow.x0 + ux * (60 + 260 * pw), bow.y0 + uy * (60 + 260 * pw)); gctx.stroke()
      }
      gctx.setLineDash([])
      const pulse = 1 + 0.15 * Math.sin(held * (10 + 20 * pw))
      gctx.strokeStyle = `rgba(200,255,0,${0.4 + 0.5 * pw})`; gctx.lineWidth = 1.2
      gctx.beginPath(); gctx.arc(bow.x0, bow.y0, (12 - 6 * pw) * pulse, 0, 7); gctx.stroke()
      gctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * pw})`; gctx.fillRect(bow.x0 - 1.5, bow.y0 - 1.5, 3, 3)
    }
    lasers = lasers.filter(L => {
      L.age += dt
      const prev = L.head; L.head = Math.min(L.tEnd, L.head + 6000 * dt)
      // hit test along the part of the beam drawn this frame
      if (!L.hit && rogue && !caught) {
        const rx = rogue.x - L.x, ry = rogue.y - L.y, along = rx * L.ux + ry * L.uy, off = Math.abs(rx * L.uy - ry * L.ux)
        if (along > 0 && along <= L.head + 8 && off < 7 + 5 * L.pw) {
          L.hit = true
          for (let k = 0; k < 30; k++) { const a = Math.random() * 7, v = 80 + Math.random() * 300; bursts.push({ x: rogue.x, y: rogue.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.7 }) }
          rogue.hit = 0.3; setTimeout(() => catchIt(), 120)
        }
      }
      if (prev < L.tEnd && L.head >= L.tEnd) for (let k = 0; k < 10; k++) { const a = Math.random() * 7, v = 60 + Math.random() * 180; bursts.push({ x: L.x + L.ux * L.tEnd, y: L.y + L.uy * L.tEnd, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 }) }
      const fade = Math.max(0, 1 - L.age / 0.45), tail = Math.max(0, L.head - (80 + 900 * L.age))
      const x1 = L.x + L.ux * tail, y1 = L.y + L.uy * tail, x2 = L.x + L.ux * L.head, y2 = L.y + L.uy * L.head
      gctx.save(); gctx.globalCompositeOperation = 'lighter'; gctx.lineCap = 'round'
      gctx.shadowColor = 'rgba(200,255,0,.9)'; gctx.shadowBlur = 12 * fade
      gctx.strokeStyle = `rgba(200,255,0,${0.55 * fade})`; gctx.lineWidth = 2.5 + 2 * L.pw
      gctx.beginPath(); gctx.moveTo(x1, y1); gctx.lineTo(x2, y2); gctx.stroke()
      gctx.shadowBlur = 0; gctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; gctx.lineWidth = 1
      gctx.beginPath(); gctx.moveTo(x1, y1); gctx.lineTo(x2, y2); gctx.stroke()
      if (L.age < 0.12) {                                  // muzzle flash
        const k = 1 - L.age / 0.12, gr = gctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, 26 * k + 4)
        gr.addColorStop(0, `rgba(255,255,255,${k})`); gr.addColorStop(1, 'rgba(200,255,0,0)')
        gctx.fillStyle = gr; gctx.beginPath(); gctx.arc(L.x, L.y, 26 * k + 4, 0, 7); gctx.fill()
      }
      gctx.restore()
      return L.age < 0.5
    })
  }
  // near the name: the X easter egg; further down the page: the pixel pops and comes back
  function catchIt() {
    if (caught) return
    if (cv.getBoundingClientRect().top > -H * 0.5) return triggerX()
    caught = true; shots = []; document.documentElement.style.cursor = ''
    exits = hunters.map(h => ({ x: h.x, y: h.y, ang: Math.atan2(h.vy, h.vx) || 0, spin: 0, t: 0, vx: 0, vy: 0, done: false })); hunters = []
    for (let k = 0; k < 40; k++) { const a2 = Math.random() * 7, v2 = 80 + Math.random() * 260; bursts.push({ x: rogue.x, y: rogue.y, vx: Math.cos(a2) * v2, vy: Math.sin(a2) * v2, life: 0.8 }) }
    setTimeout(respawn, 2600)
  }
  function respawn() {
    caught = false; rogue.x = W * (Math.random() < 0.5 ? 0.1 : 0.9); rogue.y = H * 0.5; rogue.vx = rogue.vy = 0
    hunters = [{ x: -30, y: rogue.y - 80, vx: 0, vy: 0, cool: 3, side: 1 }, { x: W + 30, y: rogue.y + 80, vx: 0, vy: 0, cool: 4, side: -1 }]
  }
  function triggerX() {
    if (caught) return
    caught = true; document.documentElement.style.cursor = ''; shots = []
    exits = hunters.map(h => ({ x: h.x, y: h.y, ang: Math.atan2(h.vy, h.vx) || 0, spin: 0, t: 0, vx: 0, vy: 0, done: false })); hunters = []
    tstep.textContent = 'caught'
    gsap.timeline()
      .to(hero.st, { m: 1, duration: 4.2, ease: 'sine.inOut' })
      .to(hero.st, { m: 0, duration: 4.2, ease: 'sine.inOut', delay: 2.2 })
      .add(respawn)
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 200) })

  return {
    build, frame,
    setT: v => { t = v }, setScroll: v => { scrollT = v },
    st: { get m() { return M }, set m(v) { M = v } }, rogue: () => (rogue ? { x: rogue.x, y: rogue.y } : null),
  }
})()

/* ---------- loader then intro ---------- */
document.body.classList.add('loading')
document.fonts.load('800 80px Syne').then(() => document.fonts.ready).then(() => {
  hero.build()
  gsap.ticker.add(hero.frame)
  initFlow()
  const c = { v: 0 }, countEl = document.getElementById('count')
  const tl = gsap.timeline()
  tl.to(c, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: () => { countEl.textContent = Math.round(c.v) } })
    .to('.loader', { yPercent: -100, duration: 0.9, ease: 'expo.inOut' })
    .add(() => document.body.classList.remove('loading'))
    .to({ v: 1 }, { v: 0.0025, duration: 2.6, ease: 'power3.out', onUpdate() { hero.setT(this.targets()[0].v) } }, '-=0.5')
    .from('.hero-meta > div, .top', { y: 30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out' }, '-=2')
})

// scroll on hero = forward diffusion
ScrollTrigger.create({
  trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
  onUpdate: s => hero.setScroll(s.progress * 0.9),
})

/* ---------- about ---------- */
const h2 = document.querySelector('.reveal-words')
h2.innerHTML = h2.textContent.split(' ').map((w, i) => `<span class="w${i >= 2 && i <= 8 ? ' hl' : ''}">${w}</span>`).join(' ')
gsap.to('.reveal-words .w', {
  opacity: 1, stagger: 0.1, ease: 'none',
  scrollTrigger: { trigger: '.about', start: 'top 70%', end: 'center 45%', scrub: true },
})
gsap.to('.about-photo', {
  clipPath: 'inset(0% 0 0 0)', duration: 1.4, ease: 'expo.inOut',
  scrollTrigger: { trigger: '.about', start: 'top 70%' },
})
gsap.from('.about .sub', { y: 40, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.about .sub', start: 'top 85%' } })

/* ---------- work: stacking cards ---------- */
const cards = [...document.querySelectorAll('.proj')]
const wp = document.getElementById('wp')
cards.forEach((card, i) => {
  card.style.setProperty('--i', i)
  gsap.from(card, { y: 120, rotate: i % 2 ? 1.5 : -1.5, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: card, start: 'top 92%' } })
  ScrollTrigger.create({ trigger: card, start: 'top 60%', onEnter: () => { wp.textContent = '0' + (i + 1) }, onLeaveBack: () => { wp.textContent = '0' + Math.max(1, i) } })
  const next = cards[i + 1]
  if (next) gsap.to(card, { scale: 0.92, filter: 'brightness(0.55)', ease: 'none', scrollTrigger: { trigger: next, start: 'top 65%', end: 'top 15%', scrub: true } })
})

initCards()

/* ---------- lab ---------- */
gsap.from('.big-title .line', {
  yPercent: 110, stagger: 0.12, duration: 1.2, ease: 'expo.out',
  scrollTrigger: { trigger: '.big-title', start: 'top 80%' },
})
gsap.from('.dmx', { y: 80, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.dmx', start: 'top 85%' } })

initLab()

/* ---------- path rows ---------- */
gsap.from('.rows li', { y: 50, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.rows', start: 'top 80%' } })

/* ---------- contact ---------- */
gsap.from('.huge-line', { yPercent: 100, opacity: 0, stagger: 0.12, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.huge', start: 'top 85%' } })
if (!isTouch) document.querySelectorAll('.magnet').forEach(m => {
  const span = m.querySelector('span')
  m.addEventListener('mousemove', e => {
    const r = m.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2
    gsap.to(m, { x: x * 0.35, y: y * 0.5, duration: 0.4, ease: 'power3' })
    gsap.to(span, { x: x * 0.15, y: y * 0.2, duration: 0.4, ease: 'power3' })
  })
  m.addEventListener('mouseleave', () => gsap.to([m, span], { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, .4)' }))
})
document.getElementById('yr').textContent = new Date().getFullYear()
const clock = document.getElementById('clock')
const tick = () => { clock.textContent = 'Paris ' + new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) }
tick(); setInterval(tick, 10000)

/* ---------- marquee: speed sign, hold to brake, and what happens past c ---------- */
initWarp(lenis)
