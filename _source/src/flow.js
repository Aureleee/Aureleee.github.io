import gsap from 'gsap'

/*
  One layer of particles over the whole page, driven by scroll.
  They leave the name in the hero, orbit the photo in About, become the wave of the
  SyncTweedies card, turn into a progress line while the work cards slide, then rain
  into the latent of the diffusion lab as its noise.
  Every station is computed from live element rects, so scrolling back up rewinds it.
*/
const ACC = [200, 255, 0], FG = [241, 239, 233]
const clamp01 = x => Math.max(0, Math.min(1, x))
const easeIO = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
const randn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
const seg = (v, a, b) => clamp01((v - a) / Math.max(1, b - a))

export function initFlow() {
  const cv = document.createElement('canvas')
  cv.className = 'flow-layer'
  document.body.appendChild(cv)
  const ctx = cv.getContext('2d')
  const mob = innerWidth < 800, N = mob ? 140 : 260
  let W = 0, H = 0, dpr = 1
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
  size(); addEventListener('resize', size)

  const P = Array.from({ length: N }, (_, i) => ({
    i, u: Math.random(), v: Math.random(), e1: randn(), e2: randn(), r: Math.random(),
    sx: randn(), sy: randn(), acc: Math.random() < 0.12, s: 1.4 + Math.random() * 1.3, hk: Math.floor(Math.random() * 1e9),
  }))

  const $ = s => document.querySelector(s)
  const els = { hero: $('#particles'), photo: $('.about-photo'), about: $('.about'), work: $('.work'), pin: $('.work-pin'), card1: $('canvas[data-kind=tiles]'), dm: $('#dm') }
  const absTop = el => el.getBoundingClientRect().top + scrollY

  gsap.ticker.add(() => {
    const time = performance.now() / 1000, y = scrollY, vh = H
    ctx.clearRect(0, 0, W, H)
    const heroT = window.__heroTargets
    if (!heroT || !heroT.length) return

    // ---- stations (screen coordinates) ----
    const hr = els.hero.getBoundingClientRect()
    const st0 = p => { const q = heroT[p.hk % heroT.length]; return [hr.left + q[0], hr.top + q[1]] }

    const pr = els.photo.getBoundingClientRect()
    const st1 = p => {
      const a = 2 * Math.PI * p.i / N + time * 0.22, wob = 1 + 0.05 * Math.sin(time * 1.3 + p.i)
      return [pr.left + pr.width / 2 + Math.cos(a) * pr.width * 0.66 * wob + p.e1 * 4, pr.top + pr.height / 2 + Math.sin(a) * pr.height * 0.58 * wob + p.e2 * 4]
    }

    const cr = els.card1.getBoundingClientRect(), kk = (Math.sin(time * 0.72) + 1) / 2   // same wave as the card
    const st2 = p => {
      const x = cr.left + p.u * cr.width, yy = cr.top + cr.height / 2 + Math.sin(p.u * 12 + time * 0.36) * cr.height * 0.18 + (p.v - 0.5) * cr.height * 0.08
      return [x + p.e1 * 15 * (1 - kk), yy + p.e2 * cr.height * 0.35 * (1 - kk)]
    }

    const wr = els.pin.getBoundingClientRect(), wp = window.__workProgress || 0
    const st3 = p => {
      const x0 = wr.left + W * 0.04, w = wr.width - W * 0.08, x = x0 + (p.i / (N - 1)) * w
      return [x, wr.bottom - (mob ? 28 : 40) + Math.sin(x * 0.02 + time * 2) * 2 + p.e2 * 1.2]
    }

    const lab = window.__lab?.()
    const dr = els.dm.getBoundingClientRect()
    const st4 = p => {
      if (!lab) return [dr.left + dr.width / 2, dr.top]
      const [lx, ly, lp] = lab.lat
      return [dr.left + lx + lp / 2 + p.e1 * lp * 0.45, dr.top + ly - lp * 0.45 + p.e2 * lp * 0.14 + Math.sin(time * 2 + p.i) * 3]
    }
    const st4cell = p => { const [lx, ly, lp] = lab.lat, c = p.hk % (32 * 32); return [dr.left + lx + ((c % 32) + 0.5) * lp / 32, dr.top + ly + (Math.floor(c / 32) + 0.5) * lp / 32] }

    // ---- scroll anchors ----
    const heroH = hr.height, aboutTop = absTop(els.about), aboutH = els.about.offsetHeight
    const workTop = window.__workStart ?? absTop(els.work), workEnd = window.__workEnd ?? workTop + vh
    const dmTop = absTop(els.dm)
    const a = seg(y, heroH * 0.12, aboutTop - vh * 0.15)                         // hero → about
    const b = seg(y, aboutTop + aboutH - vh * 0.75, workTop)                    // about → card 1
    const c = seg(wp, 0.18, 0.42)                                               // card 1 → progress line
    const d = seg(y, workEnd, dmTop - vh * 0.35)                                // line → lab
    const fadeIn = seg(y, heroH * 0.08, heroH * 0.3)

    for (const p of P) {
      let A, B, k, scatter
      if (d > 0) { A = st3(p); B = st4(p); k = d; scatter = 70 }
      else if (c > 0) { A = st2(p); B = st3(p); k = c; scatter = 60 }
      else if (b > 0) { A = st1(p); B = st2(p); k = b; scatter = 110 }
      else { A = st0(p); B = st1(p); k = a; scatter = 220 }
      const e = easeIO(clamp01(k * 1.25 - p.r * 0.25))
      let x = A[0] + (B[0] - A[0]) * e + Math.sin(Math.PI * e) * p.sx * scatter
      let yy = A[1] + (B[1] - A[1]) * e + Math.sin(Math.PI * e) * p.sy * scatter * 0.6
      let alpha = fadeIn * (0.55 + 0.45 * p.r)

      // in the lab: these particles are the noise falling into the latent
      if (d >= 1 && lab) {
        if (lab.phase === 'forward') {
          const f = clamp01((lab.tau - p.r * 0.75) / 0.25)
          if (f >= 1) continue
          const C = st4cell(p), ef = f * f
          x += (C[0] - x) * ef; yy += (C[1] - yy) * ef
        } else if (lab.phase !== 'idle' && lab.phase !== 'encode') continue
      }
      // the line lights up with the horizontal progress
      let col = p.acc ? ACC : FG
      if (c >= 1 && d === 0) { const on = p.i / N < wp; col = on ? ACC : FG; alpha *= on ? 1 : 0.35 }
      if (alpha <= 0.01 || yy < -20 || yy > H + 20) continue
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`
      ctx.fillRect(x, yy, p.s, p.s)
    }
  })
}
