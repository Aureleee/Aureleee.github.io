import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/jetbrains-mono/400.css'
import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)
const ACC = '#c8ff00'
const isTouch = matchMedia('(hover: none)').matches
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
// cosine schedule
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
  let W, H, dpr, P = [], t = 1, scrollT = 0
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
    fs = Math.min(fs * (W * (W < 800 ? 0.86 : 0.84)) / widest, H * 0.3)
    o.font = `800 ${fs}px Syne`
    o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'
    const lh = fs * 0.95, y0 = H * 0.45 - (lines.length - 1) * lh / 2
    lines.forEach((l, i) => o.fillText(l, W / 2, y0 + i * lh))
    const data = o.getImageData(0, 0, W, H).data
    const step = Math.max(3, Math.round(W / 420))
    const targets = []
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step)
      if (data[4 * (y * W + x) + 3] > 128) targets.push([x, y])
    const s = Math.min(W, H) * 0.32
    P = targets.map(([x, y]) => ({
      tx: x, ty: y,
      ex: randn() * s, ey: randn() * s,      // fixed noise sample
      ox: 0, oy: 0, vx: 0, vy: 0,            // mouse offset spring
      acc: Math.random() < 0.06,
    }))
  }

  function frame() {
    const tt = Math.min(1, t + scrollT)
    const ab = alphaBar(tt), a = Math.sqrt(ab), b = Math.sqrt(1 - ab)
    tstep.textContent = `t = ${String(Math.round(tt * 1000)).padStart(4, '0')}`
    ctx.clearRect(0, 0, W, H)
    const cx = W / 2, cy = H * 0.45
    const r = Math.max(2, step()) - 0.6
    for (const p of P) {
      // mouse repulsion with spring back
      const x0 = cx + a * (p.tx - cx) + b * p.ex, y0 = cy + a * (p.ty - cy) + b * p.ey
      const dx = x0 + p.ox - mouse.x, dy = y0 + p.oy - mouse.y, d2 = dx * dx + dy * dy
      if (d2 < 12000) { const f = (12000 - d2) / 12000 * 2.2, d = Math.sqrt(d2) + 1e-3; p.vx += dx / d * f; p.vy += dy / d * f }
      p.vx += -p.ox * 0.06; p.vy += -p.oy * 0.06; p.vx *= 0.82; p.vy *= 0.82
      p.ox += p.vx; p.oy += p.vy
      ctx.fillStyle = p.acc ? ACC : `rgba(241,239,233,${0.55 + 0.45 * ab})`
      ctx.fillRect(x0 + p.ox, y0 + p.oy, r, r)
    }
  }
  const step = () => Math.max(3, Math.round(W / 420))

  cv.addEventListener('mousemove', e => { const rc = cv.getBoundingClientRect(); mouse.x = e.clientX - rc.left; mouse.y = e.clientY - rc.top })
  cv.addEventListener('mouseleave', () => { mouse.x = mouse.y = -1e4 })
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 200) })

  return {
    build, frame,
    setT: v => { t = v }, setScroll: v => { scrollT = v },
  }
})()

/* ---------- loader then intro ---------- */
document.body.classList.add('loading')
document.fonts.load('800 80px Syne').then(() => document.fonts.ready).then(() => {
  hero.build()
  gsap.ticker.add(hero.frame)
  const c = { v: 0 }, countEl = document.getElementById('count')
  const tl = gsap.timeline()
  tl.to(c, { v: 100, duration: 1.3, ease: 'power2.inOut', onUpdate: () => { countEl.textContent = Math.round(c.v) } })
    .to('.loader', { yPercent: -100, duration: 0.9, ease: 'expo.inOut' })
    .add(() => document.body.classList.remove('loading'))
    .to({ v: 1 }, { v: 0, duration: 2.6, ease: 'power3.out', onUpdate() { hero.setT(this.targets()[0].v) } }, '-=0.5')
    .from('.hero-meta > div, .top', { y: 30, opacity: 0, stagger: 0.08, duration: 1, ease: 'expo.out' }, '-=2')
})

// scroll on hero = forward diffusion
ScrollTrigger.create({
  trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
  onUpdate: s => hero.setScroll(s.progress * 0.9),
})

/* ---------- about ---------- */
const h2 = document.querySelector('.reveal-words')
h2.innerHTML = h2.textContent.split(' ').map(w => `<span class="w">${w}</span>`).join(' ')
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

/* ---------- work: horizontal pinned scroll ---------- */
const track = document.querySelector('.work-track')
const wp = document.getElementById('wp')
const dist = () => track.scrollWidth - innerWidth
gsap.to(track, {
  x: () => -dist(), ease: 'none',
  scrollTrigger: {
    trigger: '.work', pin: '.work-pin', start: 'top top', end: () => '+=' + dist(), scrub: 1, invalidateOnRefresh: true,
    onUpdate: s => { wp.textContent = '0' + Math.min(3, 1 + Math.floor(s.progress * 3)) },
  },
})

// mini visuals in project cards
function miniCanvas(cv) {
  const ctx = cv.getContext('2d'), kind = cv.dataset.kind
  let w, h
  const size = () => { w = cv.width = cv.clientWidth * 2; h = cv.height = cv.clientHeight * 2 }
  size(); addEventListener('resize', size)
  let ph = Math.random() * 10
  // fixed random content
  const pts = Array.from({ length: 900 }, () => [Math.random(), Math.random(), randn(), randn()])
  const boxes = Array.from({ length: 26 }, () => [Math.random(), Math.random(), 0.04 + Math.random() * 0.12, 0.3 + Math.random() * 1.6])
  gsap.ticker.add(() => {
    ph += 0.012
    ctx.fillStyle = '#070707'; ctx.fillRect(0, 0, w, h)
    if (kind === 'tiles') {
      // overlapping views converging: noise -> signal per tile, synced
      const n = 5, tw = w / (n - 1) * 0.9, k = (Math.sin(ph) + 1) / 2
      for (let i = 0; i < n; i++) {
        const x = i * (w - tw) / (n - 1)
        ctx.strokeStyle = i % 2 ? '#333' : '#555'; ctx.lineWidth = 2
        ctx.strokeRect(x + 4, 20 + i * 6, tw - 8, h - 40 - i * 12)
      }
      for (const [u, v, e1, e2] of pts) {
        const x = u * w, y = h / 2 + Math.sin(u * 12 + ph * 0.5) * h * 0.18 + (v - 0.5) * h * 0.08
        const px = x + e1 * 30 * (1 - k), py = y + e2 * h * 0.35 * (1 - k)
        ctx.fillStyle = v > 0.94 ? ACC : 'rgba(241,239,233,.7)'
        ctx.fillRect(px, py, 3, 3)
      }
    } else if (kind === 'insert') {
      // road perspective + inserted object box
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2
      for (let i = 0; i < 14; i++) { const y = h * 0.4 + (h * 0.6) * (i / 14) ** 1.6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      ctx.strokeStyle = '#555'
      ctx.beginPath(); ctx.moveTo(w * 0.47, h * 0.4); ctx.lineTo(w * 0.05, h); ctx.moveTo(w * 0.53, h * 0.4); ctx.lineTo(w * 0.95, h); ctx.stroke()
      const s = (ph * 0.15) % 1, yy = h * 0.42 + s * s * h * 0.5, sc = 0.15 + s * s * 1.1
      const bw = w * 0.16 * sc, bh = bw * 0.55
      ctx.fillStyle = 'rgba(241,239,233,.85)'; ctx.fillRect(w / 2 - bw / 2, yy - bh, bw, bh)
      ctx.strokeStyle = ACC; ctx.lineWidth = 3; ctx.strokeRect(w / 2 - bw / 2 - 8, yy - bh - 8, bw + 16, bh + 16)
      ctx.fillStyle = ACC; ctx.font = `${Math.max(18, w / 34)}px JetBrains Mono`
      ctx.fillText('vehicle 0.97', w / 2 - bw / 2 - 8, yy - bh - 16)
    } else {
      // anchors + focal-ish highlight
      boxes.forEach(([u, v, s, r], i) => {
        const bw = s * w, bh = s * w / r, on = Math.sin(ph * 2 + i) > 0.75
        ctx.strokeStyle = on ? ACC : '#333'; ctx.lineWidth = on ? 3 : 1.5
        ctx.strokeRect(u * w - bw / 2, v * h - bh / 2, bw, bh)
      })
    }
  })
}
document.querySelectorAll('canvas.mini').forEach(miniCanvas)

/* ---------- lab ---------- */
gsap.from('.big-title .line', {
  yPercent: 110, stagger: 0.12, duration: 1.2, ease: 'expo.out',
  scrollTrigger: { trigger: '.big-title', start: 'top 80%' },
})
gsap.from('.demo', { y: 80, opacity: 0, stagger: 0.15, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.lab-grid', start: 'top 85%' } })

// forward diffusion demo
;(() => {
  const cv = document.getElementById('diff'), ctx = cv.getContext('2d'), W = cv.width, N = 1500
  const slider = document.getElementById('tSlider'), tVal = document.getElementById('tVal')
  let shape = 'spiral', x0 = [], eps = []
  function sample() {
    x0 = []; eps = []
    for (let i = 0; i < N; i++) {
      let x, y
      if (shape === 'spiral') { const r = Math.sqrt(Math.random()) * 1.6, a = r * 4.5; x = r * Math.cos(a); y = r * Math.sin(a) }
      else if (shape === 'moons') { const a = Math.random() * Math.PI; if (i % 2) { x = Math.cos(a) - 0.5; y = Math.sin(a) - 0.25 } else { x = 0.5 - Math.cos(a); y = 0.25 - Math.sin(a) } }
      else { const a = Math.random() * 2 * Math.PI, r = i % 2 ? 0.6 : 1.4; x = r * Math.cos(a); y = r * Math.sin(a) }
      x0.push([x + 0.04 * randn(), y + 0.04 * randn()]); eps.push([randn(), randn()])
    }
    draw()
  }
  function draw() {
    const t = slider.value / 1000, ab = alphaBar(t), a = Math.sqrt(ab), s = Math.sqrt(1 - ab)
    tVal.textContent = `t = ${t.toFixed(2)}`
    ctx.fillStyle = '#060606'; ctx.fillRect(0, 0, W, W)
    ctx.strokeStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, W); ctx.moveTo(0, W / 2); ctx.lineTo(W, W / 2); ctx.stroke()
    const sc = W / 7
    for (let i = 0; i < N; i++) {
      const x = a * x0[i][0] + s * eps[i][0], y = a * x0[i][1] + s * eps[i][1]
      ctx.fillStyle = i % 17 ? 'rgba(241,239,233,.8)' : ACC
      ctx.fillRect(W / 2 + x * sc - 1.5, W / 2 - y * sc - 1.5, 3, 3)
    }
  }
  slider.oninput = draw
  document.querySelectorAll('#shape button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#shape button').forEach(x => x.classList.remove('on')); b.classList.add('on'); shape = b.dataset.v; sample()
  })
  sample()
})()

// optimizers on Rosenbrock
;(() => {
  const cv = document.getElementById('opt'), ctx = cv.getContext('2d'), W = cv.width
  const xmin = -2, xmax = 2, ymin = -1, ymax = 3
  const lrS = document.getElementById('lr'), lrV = document.getElementById('lrVal')
  const f = (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2
  const g = (x, y) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)]
  const toPx = (x, y) => [(x - xmin) / (xmax - xmin) * W, (1 - (y - ymin) / (ymax - ymin)) * W]
  const toW = (px, py) => [xmin + px / W * (xmax - xmin), ymin + (1 - py / W) * (ymax - ymin)]
  const bg = document.createElement('canvas'); bg.width = bg.height = W
  {
    const b = bg.getContext('2d'), img = b.createImageData(W, W)
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const [x, y] = toW(i, j), L = Math.log(1 + f(x, y)), band = (L * 2.5) % 1 < 0.05 ? 1 : 0, k = 4 * (j * W + i)
      const v = 6 + L * 2.2
      img.data[k] = v + band * 40; img.data[k + 1] = v + band * 48; img.data[k + 2] = v + band * 10; img.data[k + 3] = 255
    }
    b.putImageData(img, 0, 0)
  }
  const opts = [{ name: 'SGD', color: '#7a7872' }, { name: 'Momentum', color: '#f1efe9' }, { name: 'Adam', color: ACC }]
  let runs = []
  const start = (x, y) => { const lr = 10 ** +lrS.value; runs = opts.map(o => ({ ...o, p: [x, y], path: [[x, y]], v: [0, 0], m: [0, 0], s: [0, 0], k: 0, lr })) }
  function step(r) {
    let [dx, dy] = g(...r.p); const n = Math.hypot(dx, dy); if (n > 1e3) { dx *= 1e3 / n; dy *= 1e3 / n }
    r.k++
    if (r.name === 'SGD') r.p = [r.p[0] - r.lr * dx, r.p[1] - r.lr * dy]
    else if (r.name === 'Momentum') { r.v = [0.9 * r.v[0] + dx, 0.9 * r.v[1] + dy]; r.p = [r.p[0] - r.lr * r.v[0], r.p[1] - r.lr * r.v[1]] }
    else {
      const b1 = 0.9, b2 = 0.999, lr = r.lr * 30
      r.m = [b1 * r.m[0] + (1 - b1) * dx, b1 * r.m[1] + (1 - b1) * dy]
      r.s = [b2 * r.s[0] + (1 - b2) * dx * dx, b2 * r.s[1] + (1 - b2) * dy * dy]
      const c1 = 1 - b1 ** r.k, c2 = 1 - b2 ** r.k
      r.p = [r.p[0] - lr * (r.m[0] / c1) / (Math.sqrt(r.s[0] / c2) + 1e-8), r.p[1] - lr * (r.m[1] / c1) / (Math.sqrt(r.s[1] / c2) + 1e-8)]
    }
    if (r.path.length < 4000 && r.p.every(Number.isFinite)) r.path.push([...r.p])
  }
  gsap.ticker.add(() => {
    ctx.drawImage(bg, 0, 0)
    const [ox, oy] = toPx(1, 1)
    ctx.strokeStyle = ACC; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, 7); ctx.stroke()
    ctx.font = '20px JetBrains Mono'
    runs.forEach((r, i) => {
      for (let s = 0; s < 5; s++) step(r)
      ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.beginPath()
      r.path.forEach((p, k) => { const [px, py] = toPx(...p); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py) }); ctx.stroke()
      ctx.fillStyle = r.color; ctx.fillText(`${r.name.padEnd(9)} f=${f(...r.p).toExponential(1)}`, 18, 36 + 28 * i)
    })
  })
  cv.addEventListener('click', e => { const rc = cv.getBoundingClientRect(); start(...toW((e.clientX - rc.left) / rc.width * W, (e.clientY - rc.top) / rc.height * W)) })
  lrS.oninput = () => { lrV.textContent = 'lr ' + (10 ** +lrS.value).toExponential(0); if (runs.length) start(...runs[0].path[0]) }
  lrV.textContent = 'lr ' + (10 ** +lrS.value).toExponential(0)
  start(-1.5, 2.5)
})()

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
