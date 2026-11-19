import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/jetbrains-mono/400.css'
import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
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
  const mouse = { x: -1e4, y: -1e4 }

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2)
    W = cv.clientWidth; H = cv.clientHeight
    cv.width = W * dpr; cv.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
    // drones leaving after the catch: spin up, then warp out with a streak and pop
    exits = exits.filter(e => {
      e.t += dt
      if (e.t < 0.5) { e.spin += dt * (6 + e.t * 50); e.y -= dt * 20 }
      else if (!e.done) {
        const dir = e.ang + e.spin, a2 = 2600
        e.vx += Math.cos(dir) * a2 * dt; e.vy += Math.sin(dir) * a2 * dt; e.x += e.vx * dt; e.y += e.vy * dt
        const sp = Math.hypot(e.vx, e.vy)
        ctx.strokeStyle = 'rgba(241,239,233,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x - e.vx / sp * Math.min(160, sp * 0.12), e.y - e.vy / sp * Math.min(160, sp * 0.12)); ctx.stroke()
        if (e.t > 0.85 || e.x < -40 || e.x > W + 40 || e.y < -40 || e.y > H + 40) {
          e.done = true
          for (let k = 0; k < 16; k++) { const a3 = Math.random() * 7, v3 = 80 + Math.random() * 220; bursts.push({ x: Math.max(4, Math.min(W - 4, e.x)), y: Math.max(4, Math.min(H - 4, e.y)), vx: Math.cos(a3) * v3, vy: Math.sin(a3) * v3, life: 0.6 }) }
        }
      }
      if (!e.done) {
        const st2 = e.t < 0.5 ? 1 : 1 + (e.t - 0.5) * 3
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang + e.spin); ctx.scale(st2, 1 / st2)
        ctx.strokeStyle = 'rgba(241,239,233,.9)'; ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.stroke(); ctx.restore()
      }
      return e.t < 1.6
    })
    if (caught) bursts = bursts.filter(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; ctx.fillStyle = `rgba(200,255,0,${b.life * 2})`; ctx.fillRect(b.x - 1, b.y - 1, 2, 2); return b.life > 0 })
    // the escaping pixel
    if (rogue && !caught && tt < 0.3) {
      const q = rogue, [hx, hy] = q.home
      const wx = hx + Math.sin(time * 0.37 + q.ph) * q.span[0] + Math.sin(time * 1.3) * 30, wy = hy + Math.cos(time * 0.53 + q.ph) * q.span[1]
      q.vx += (wx - q.x) * 0.9 * dt; q.vy += (wy - q.y) * 0.9 * dt
      const dx = q.x - mouse.x, dy = q.y - mouse.y, d = Math.hypot(dx, dy)
      if (d < 160) { const f = (160 - d) / 160 * 2600 * dt; q.vx += dx / (d + 1e-3) * f; q.vy += dy / (d + 1e-3) * f }
      q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt)
      q.x = Math.max(20, Math.min(W - 20, q.x + q.vx * dt)); q.y = Math.max(H * 0.12, Math.min(H * 0.8, q.y + q.vy * dt))
      q.trail.push([q.x, q.y]); if (q.trail.length > 14) q.trail.shift()
      q.trail.forEach(([x, y], i) => { ctx.fillStyle = `rgba(200,255,0,${(i / q.trail.length) * 0.35})`; ctx.fillRect(x - 1.5, y - 1.5, 3, 3) })
      const pulse = 1 + 0.35 * Math.sin(time * 6)
      ctx.strokeStyle = 'rgba(200,255,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, 9 * pulse, 0, 7); ctx.stroke()
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
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang)
        ctx.strokeStyle = 'rgba(241,239,233,.9)'; ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.stroke()
        ctx.fillStyle = `rgba(255,120,60,${0.5 + 0.5 * Math.sin(time * 30 + h.side)})`; ctx.fillRect(-8, -1, 2.5, 2)
        ctx.restore()
      }
      shots = shots.filter(s => {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.age += dt
        // blasts shove the particles of the name they fly through
        for (const p of P) {
          const bx = p.ox, dxp = s.x - (p.tx + bx), dyp = s.y - (p.ty + p.oy)
          if (dxp * dxp + dyp * dyp < 220) { p.vx -= dxp * 0.08 + s.vx * 0.004; p.vy -= dyp * 0.08 + s.vy * 0.004 }
        }
        if (s.age < 1.4 && Math.hypot(s.x - q.x, s.y - q.y) < 6) {
          q.hit = 0.35; q.vx += s.vx * 0.9; q.vy += s.vy * 0.9
          for (let k = 0; k < 14; k++) { const a2 = Math.random() * 7, v2 = 60 + Math.random() * 160; bursts.push({ x: q.x, y: q.y, vx: Math.cos(a2) * v2, vy: Math.sin(a2) * v2, life: 0.5 }) }
          setTimeout(() => triggerX(), 250)
          return false
        }
        const n = Math.hypot(s.vx, s.vy)
        ctx.strokeStyle = 'rgba(255,140,90,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx / n * 9, s.y - s.vy / n * 9); ctx.stroke()
        return s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20
      })
      bursts = bursts.filter(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; ctx.fillStyle = `rgba(200,255,0,${b.life * 2})`; ctx.fillRect(b.x - 1, b.y - 1, 2, 2); return b.life > 0 })
      q.hit = Math.max(0, q.hit - dt)
      ctx.fillStyle = q.hit > 0 && Math.floor(time * 30) % 2 ? '#ffffff' : ACC; ctx.fillRect(q.x - 3, q.y - 3, 6, 6)
      // tiny hint: shown for a few seconds, then only when the cursor gets close
      q.h0 = q.h0 ?? time
      const near = Math.hypot(q.x - mouse.x, q.y - mouse.y)
      const ha = (near < 220 ? 1 - near / 220 : 0) * 0.75
      if (ha > 0.02) { ctx.font = '11px JetBrains Mono'; ctx.fillStyle = `rgba(200,255,0,${ha})`; ctx.fillText('catch me', q.x + 12, q.y - 10) }
      cv.style.cursor = Math.hypot(q.x - mouse.x, q.y - mouse.y) < 26 ? 'pointer' : ''
    }
  }
  const step = () => Math.max(2, Math.round(W / 520))

  cv.addEventListener('mousemove', e => { const rc = cv.getBoundingClientRect(); mouse.x = e.clientX - rc.left; mouse.y = e.clientY - rc.top })
  cv.addEventListener('mouseleave', () => { mouse.x = mouse.y = -1e4 })
  cv.addEventListener('pointerdown', e => {
    if (!rogue || caught) return
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top
    if (Math.hypot(x - rogue.x, y - rogue.y) > (e.pointerType === 'touch' ? 40 : 26)) return
    triggerX()
  })
  function triggerX() {
    if (caught) return
    caught = true; cv.style.cursor = ''; shots = []
    exits = hunters.map(h => ({ x: h.x, y: h.y, ang: Math.atan2(h.vy, h.vx) || 0, spin: 0, t: 0, vx: 0, vy: 0, done: false })); hunters = []
    tstep.textContent = 'caught'
    gsap.timeline()
      .to(hero.st, { m: 1, duration: 4.2, ease: 'sine.inOut' })
      .to(hero.st, { m: 0, duration: 4.2, ease: 'sine.inOut', delay: 5 })
      .add(() => { caught = false; rogue.x = W * (Math.random() < 0.5 ? 0.1 : 0.9); hunters = [{ x: -30, y: rogue.home[1] - 80, vx: 0, vy: 0, cool: 3, side: 1 }, { x: W + 30, y: rogue.home[1] + 80, vx: 0, vy: 0, cool: 4, side: -1 }] })
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
gsap.fromTo('.about-photo img', { yPercent: -10 }, {
  yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true },
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
