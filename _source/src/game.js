/*
  "Denoise": the hidden game. Fire the orbital cannon once on the hero and it starts.
  Noise (lime squares) drifts toward the name; shoot it down before the signal is lost.
  Kills give ◆, ◆ buy upgrades between levels: multishot, rebounds, damage, drones, focus.
  Five levels, bosses on 3 and 5. Clear level 5 and the name turns into the X.
*/
const LIME = '200,255,0', FG = '241,239,233', ORANGE = '255,140,90', RED = '255,90,70'
const rnd = (a, b) => a + Math.random() * (b - a)

const TYPES = {
  drift:   { hp: 1, r: 3,  sp: 38, coin: 3,  dmg: 8 },
  zig:     { hp: 2, r: 3,  sp: 62, coin: 5,  dmg: 8 },
  tank:    { hp: 6, r: 6,  sp: 22, coin: 12, dmg: 18 },
  shooter: { hp: 4, r: 4,  sp: 30, coin: 9,  dmg: 10, gun: 2.6 },
  mini:    { hp: 26, r: 10, sp: 14, coin: 45, dmg: 35, gun: 1.8, boss: true },
  boss:    { hp: 90, r: 15, sp: 9,  coin: 120, dmg: 70, gun: 1.3, boss: true, spawn: 2.4 },
}
// [time (s), type, count, hp bonus]
const LEVELS = [
  { name: 'warm-up', waves: [[0.5, 'drift', 3], [4, 'drift', 3], [8, 'drift', 4]] },
  { name: 'faster', waves: [[0.5, 'drift', 4], [3, 'zig', 3], [7, 'drift', 5], [10, 'zig', 4]] },
  { name: 'heavy noise', waves: [[0.5, 'drift', 5, 1], [3, 'zig', 4], [6, 'tank', 2], [10, 'zig', 5], [14, 'mini', 1]] },
  { name: 'they shoot back', waves: [[0.5, 'zig', 5, 1], [3, 'shooter', 3], [6, 'tank', 3, 2], [9, 'zig', 6, 1], [12, 'shooter', 3]] },
  { name: 'the big one', waves: [[0.5, 'boss', 1], [2, 'shooter', 2], [8, 'tank', 2, 2], [14, 'shooter', 2]] },
]
const DMG = [0, 1, 1.5, 2, 3]
const SHOP = [
  { id: 'range',  name: 'Charge',    desc: 'longer range when fully drawn', lvl: s => s.range, max: 5, cost: l => [30, 60, 110, 180][l - 1] },
  { id: 'bounce', name: 'Rebound',   desc: 'the beam bounces off the walls', lvl: s => s.bounce, max: 3, cost: l => [45, 110, 220][l] },
  { id: 'pierce', name: 'Pierce',    desc: 'goes through, loses power on each hit', lvl: s => s.pierce, max: 3, cost: l => [50, 110, 200][l] },
  { id: 'multi',  name: 'Multishot', desc: '+1 beam', lvl: s => s.multi,  max: 5, cost: l => [70, 140, 240, 360][l - 1] },
  { id: 'dmg',    name: 'Power',     desc: 'more damage per beam', lvl: s => s.dl, max: 4, cost: l => [50, 120, 240][l - 1] },
  { id: 'drone',  name: 'Drone',     desc: '+1 turret', lvl: s => s.drones, max: 5, cost: l => [60, 100, 150, 220][l - 1] },
  { id: 'focus',  name: 'Focus',     desc: '+1 s slow-mo', lvl: s => s.focusMax, max: 5, cost: l => [35, 70, 120, 180][l - 1] },
  { id: 'repair', name: 'Repair',    desc: 'drones + 35 signal', lvl: () => 0, max: 99, cost: () => 25 },
]

export function initGame({ lenis, nameBand, onWin }) {
  const cv = document.createElement('canvas'); cv.className = 'game-fx'
  document.body.appendChild(cv)
  const g = cv.getContext('2d')
  let W = 0, H = 0, dpr = 1
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0) }
  size(); addEventListener('resize', size)

  // ---- HUD and shop (DOM) ----
  const hud = document.createElement('div'); hud.className = 'gm-hud mono'
  hud.innerHTML = `<span class="gm-lvl"></span><span class="gm-coin"></span><span class="gm-lab">signal</span><span class="gm-bar gm-sig"><i></i></span><span class="gm-lab">focus</span><span class="gm-bar gm-foc"><i></i></span><button class="gm-quit" type="button" aria-label="Quit">esc ✕</button>`
  const panel = document.createElement('div'); panel.className = 'gm-panel mono'
  const banner = document.createElement('div'); banner.className = 'gm-banner'
  document.body.append(hud, panel, banner)
  const $ = s => hud.querySelector(s)
  hud.querySelector('.gm-quit').addEventListener('click', () => quit())
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.active) quit() })
  for (const el of [hud, panel]) el.addEventListener('pointerdown', e => e.stopPropagation())

  const S = {
    active: false, phase: 'off', level: 0, coins: 0, signal: 100,
    stats: null, score: 0, pend: [],
    focus: 2, ts: 1, enemies: [], drones: [], bolts: [], foes: [], fx: [], texts: [], spawnQ: [], lt: 0, shake: 0,
  }

  const say = (big, small = '', dur = 1.8) => {
    banner.innerHTML = `<b>${big}</b>${small ? `<span class="mono">${small}</span>` : ''}`
    banner.classList.remove('on'); void banner.offsetWidth; banner.classList.add('on')
    clearTimeout(say.t); say.t = setTimeout(() => banner.classList.remove('on'), dur * 1000)
  }
  const updHud = () => {
    $('.gm-lvl').textContent = `LVL ${S.level}/5`
    $('.gm-coin').textContent = `◆ ${S.coins}`
    $('.gm-sig i').style.width = Math.max(0, S.signal) + '%'
    $('.gm-foc i').style.width = (100 * S.focus / S.stats.focusMax) + '%'
  }

  const makeDrones = () => {
    const n = S.stats.drones
    S.drones = Array.from({ length: n }, (_, i) => ({ i, hp: 6, max: 6, cool: rnd(0.5, 1.5), x: W / 2, y: H / 2, ang: 0, flash: 0 }))
  }
  const dronePos = (d, t) => {
    const n = S.drones.length, band = nameBand(), a = (d.i / Math.max(1, n)) * Math.PI * 2 + t * 0.25
    return [W / 2 + Math.cos(a) * W * 0.36, band.y + Math.sin(a) * Math.max(90, band.h * 0.9)]
  }

  // enemies appear inside the arena: a few dots converge, then the square materialises
  function spawn(type, extra = 0, at) {
    let x, y
    if (at) [x, y] = at
    else if (type === 'boss' || type === 'mini') { x = W / 2 + rnd(-W * 0.25, W * 0.25); y = 120 }
    else {
      const x0 = W * 0.04 + 24, y0 = 110, x1 = W * 0.96 - 24, y1 = H - 80, side = Math.random()
      if (side < 0.3) { x = rnd(x0, x1); y = y0 } else if (side < 0.5) { x = rnd(x0, x1); y = y1 } else if (side < 0.75) { x = x0; y = rnd(y0, y1) } else { x = x1; y = rnd(y0, y1) }
    }
    const big = TYPES[type].boss
    S.pend.push({ type, extra, x, y, t: big ? 1.1 : 0.6, T: big ? 1.1 : 0.6, dots: Array.from({ length: big ? 40 : 14 }, () => ({ a: Math.random() * 7, r: rnd(30, big ? 140 : 70) })) })
  }
  function materialise(type, extra, x, y) {
    const T = TYPES[type], band = nameBand()
    const hp = T.hp + extra
    S.enemies.push({ type, T, x, y, hp, max: hp, tx: W / 2 + rnd(-0.5, 0.5) * band.w, ty: band.y + rnd(-0.4, 0.4) * band.h, ph: rnd(0, 10), flash: 0, gun: T.gun ? rnd(1, T.gun) : 0, spawnT: T.spawn || 0, trail: [] })
  }

  function startLevel(n) {
    S.level = n; S.phase = 'play'; S.lt = 0; S.signal = Math.max(S.signal, 60)
    S.spawnQ = LEVELS[n - 1].waves.flatMap(([t, type, count, extra = 0]) => Array.from({ length: count }, (_, k) => ({ t: t + k * (type === 'boss' || type === 'mini' ? 0 : 0.55), type, extra })))
    panel.classList.remove('on')
    say(`LEVEL ${n}`, LEVELS[n - 1].name)
    updHud()
  }

  function start(x, y, hpLeft = 3) {
    if (S.active) return
    S.active = true; S.coins = 0; S.signal = 100; S.enemies = []; S.bolts = []; S.foes = []; S.fx = []; S.texts = []
    S.stats = { range: 1, bounce: 0, pierce: 0, multi: 1, dl: 1, dmg: 1, drones: 2, focusMax: 2 }; S.focus = 2; S.score = 0; S.pend = []
    window.__gameArena?.on()
    lenis?.scrollTo(0, { duration: 0.8 }); setTimeout(() => lenis?.stop(), 820)
    document.documentElement.classList.add('gaming')
    makeDrones()
    startLevel(1)
    // the escaping pixel becomes the first enemy, with its 3 lives
    materialise('zig', hpLeft - TYPES.zig.hp, x, y)
    say('DENOISE', 'drag back · release · hold to slow time', 2.6)
  }
  function quit(win = false) {
    S.active = false; S.phase = 'off'; S.enemies = []; S.bolts = []; S.foes = []; S.pend = []; window.__ts = 1
    panel.classList.remove('on'); banner.classList.remove('on')
    document.documentElement.classList.remove('gaming')
    lenis?.start()
    window.__gameEnded?.(win)
  }

  function openShop() {
    S.phase = 'shop'
    const bonus = 15 * S.level; S.coins += bonus
    const render = () => {
      panel.innerHTML = `<p class="gm-t">LEVEL ${S.level} CLEARED <span>+${bonus} ◆ bonus</span></p><div class="gm-grid">` +
        SHOP.map(it => {
          const l = it.lvl(S.stats), maxed = l >= it.max, c = maxed ? 0 : it.cost(l)
          return `<button class="gm-item" data-id="${it.id}" ${maxed || S.coins < c ? 'disabled' : ''}><b>${it.name}${it.id !== 'repair' ? ` <em>${'▮'.repeat(l)}${'▯'.repeat(Math.max(0, it.max - l))}</em>` : ''}</b><span>${it.desc}</span><i>${maxed ? 'max' : c + ' ◆'}</i></button>`
        }).join('') + `</div><button class="gm-next" type="button">${S.level < 5 ? `level ${S.level + 1} →` : 'finish'}</button>`
      panel.querySelectorAll('.gm-item').forEach(b => b.addEventListener('click', () => {
        const it = SHOP.find(i => i.id === b.dataset.id), l = it.lvl(S.stats), c = it.cost(l)
        if (S.coins < c) return
        S.coins -= c
        if (it.id === 'multi') S.stats.multi++
        if (it.id === 'bounce') S.stats.bounce++
        if (it.id === 'range') S.stats.range++
        if (it.id === 'pierce') S.stats.pierce++
        if (it.id === 'dmg') { S.stats.dl++; S.stats.dmg = DMG[S.stats.dl] }
        if (it.id === 'focus') { S.stats.focusMax++; S.focus = S.stats.focusMax }
        if (it.id === 'drone') { S.stats.drones++; S.drones.push({ i: 0, hp: 6, max: 6, cool: 1, x: W / 2, y: H / 2, ang: 0, flash: 0 }); S.drones.forEach((d, i) => d.i = i) }
        if (it.id === 'repair') { S.drones.forEach(d => d.hp = d.max); S.signal = Math.min(100, S.signal + 35); while (S.drones.length < S.stats.drones) S.drones.push({ i: 0, hp: 6, max: 6, cool: 1, flash: 0 }); S.drones.forEach((d, i) => d.i = i) }
        updHud(); render()
      }))
      panel.querySelector('.gm-next').addEventListener('click', () => S.level < 5 ? startLevel(S.level + 1) : win())
    }
    render(); panel.classList.add('on'); updHud()
  }
  function win() {
    panel.classList.remove('on')
    say('SIGNAL RESTORED', 'thanks for playing', 2.4)
    setTimeout(() => { quit(true); onWin?.() }, 1600)
  }
  function lose() {
    S.phase = 'lost'
    panel.innerHTML = `<p class="gm-t">SIGNAL LOST <span>level ${S.level}</span></p><div class="gm-row"><button class="gm-next" data-a="retry" type="button">retry level</button><button class="gm-next gm-ghost" data-a="quit" type="button">quit</button></div>`
    panel.querySelector('[data-a=retry]').addEventListener('click', () => { S.enemies = []; S.foes = []; S.pend = []; S.signal = 100; S.drones.forEach(d => d.hp = d.max); startLevel(S.level) })
    panel.querySelector('[data-a=quit]').addEventListener('click', () => quit())
    panel.classList.add('on')
  }

  // ---- beams from the cannon (called by the hero code) ----
  // a piece of beam: returns where it stopped (0..1) or null if it went through everything
  function hitBeam(x1, y1, x2, y2, width, L) {
    if (S.phase !== 'play') return null
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1, found = []
    for (const e of S.enemies) {
      if (L.hits.has(e)) continue
      const u = Math.max(0, Math.min(1, ((e.x - x1) * dx + (e.y - y1) * dy) / L2))
      if (Math.hypot(e.x - (x1 + dx * u), e.y - (y1 + dy * u)) < e.T.r + 3 + width) found.push([u, e])
    }
    found.sort((a, b) => a[0] - b[0])
    for (const [u, e] of found) {
      L.hits.add(e); damage(e, L.dmg)
      if (!L.pierce) return u
      L.dmg *= L.keep; if (L.dmg < 0.25) return u
    }
    return null
  }
  function damage(e, d) {
    e.hp -= d; e.flash = 0.12
    burst(e.x, e.y, LIME, 5, 120)
    if (e.hp <= 0.01) kill(e)
  }
  function kill(e) {
    const i = S.enemies.indexOf(e); if (i < 0) return
    S.enemies.splice(i, 1)
    S.coins += e.T.coin; S.score += e.T.coin * 10; window.__gameArena?.setScore(S.score)
    S.texts.push({ x: e.x, y: e.y - 10, s: `+${e.T.coin}`, life: 0.9 })
    burst(e.x, e.y, LIME, e.T.boss ? 80 : 18, e.T.boss ? 420 : 220)
    if (e.T.boss) S.shake = 10
    updHud()
  }
  function burst(x, y, col, n, sp) {
    for (let k = 0; k < n; k++) { const a = Math.random() * 7, v = rnd(0.3, 1) * sp; S.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.3, 0.7), col }) }
  }

  // ---- loop ----
  let last = performance.now()
  const loop = now => {
    const rdt = Math.min(0.05, (now - last) / 1000); last = now
    g.clearRect(0, 0, W, H)
    if (S.active) {
      // slow motion while aiming, as long as there is focus left
      const aiming = !!window.__aiming && S.phase === 'play' && S.focus > 0
      S.ts += ((aiming ? 0.28 : 1) - S.ts) * Math.min(1, rdt * 10)
      S.focus = aiming ? Math.max(0, S.focus - rdt) : Math.min(S.stats.focusMax, S.focus + rdt * 0.35)
      const dt = rdt * S.ts, t = now / 1000
      window.__ts = S.ts
      if (S.ts < 0.9) {                                   // slow-mo tint
        const k = (1 - S.ts) * 0.6, gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75)
        gr.addColorStop(0, `rgba(${LIME},0)`); gr.addColorStop(1, `rgba(${LIME},${0.07 * k})`); g.fillStyle = gr; g.fillRect(0, 0, W, H)
      }
      const sx = S.shake * (Math.random() - 0.5), sy = S.shake * (Math.random() - 0.5); S.shake *= Math.exp(-8 * rdt)
      g.save(); g.translate(sx, sy)

      if (S.phase === 'play') {
        S.lt += dt
        while (S.spawnQ.length && S.spawnQ[0].t <= S.lt) { const q = S.spawnQ.shift(); spawn(q.type, q.extra) }
        if (!S.spawnQ.length && !S.enemies.length && !S.pend.length) openShop()
      }
      // dots gathering where an enemy is about to appear
      for (let k = S.pend.length - 1; k >= 0; k--) {
        const q = S.pend[k]; q.t -= dt
        const u = 1 - Math.max(0, q.t) / q.T
        for (const d of q.dots) { const r = d.r * (1 - u) ** 1.5, a = d.a + u * 3; g.fillStyle = `rgba(${LIME},${0.3 + 0.7 * u})`; g.fillRect(q.x + Math.cos(a) * r - 1, q.y + Math.sin(a) * r - 1, 2, 2) }
        if (q.t <= 0) { S.pend.splice(k, 1); materialise(q.type, q.extra, q.x, q.y); burst(q.x, q.y, LIME, 8, 90) }
      }
      // enemies
      for (let k = S.enemies.length - 1; k >= 0; k--) {
        const e = S.enemies[k], T = e.T
        if (S.phase === 'play') {
          const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy) + 1e-3
          let vx = dx / d * T.sp, vy = dy / d * T.sp
          if (e.type === 'zig') { vx += -dy / d * Math.sin(t * 4 + e.ph) * 70; vy += dx / d * Math.sin(t * 4 + e.ph) * 70 }
          if (e.type === 'drift') { vx += Math.sin(t * 1.3 + e.ph) * 14; vy += Math.cos(t * 1.1 + e.ph) * 14 }
          if (T.boss) { vx += Math.sin(t * 0.6 + e.ph) * 50 }
          if (e.type === 'shooter' && d < H * 0.32) { vx *= 0.15; vy *= 0.15 }
          e.x += vx * dt; e.y += vy * dt
          // guns: shooters and bosses fire at the drones (or at the name if none is left)
          if (T.gun) {
            e.gun -= dt
            if (e.gun <= 0) {
              e.gun = T.gun * rnd(0.8, 1.2)
              const tgt = S.drones.length ? S.drones[(Math.random() * S.drones.length) | 0] : { x: e.tx, y: e.ty }
              const n = T.boss ? (e.type === 'boss' ? 5 : 3) : 1
              for (let j = 0; j < n; j++) {
                const a = Math.atan2(tgt.y - e.y, tgt.x - e.x) + (j - (n - 1) / 2) * 0.18
                S.foes.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 4 })
              }
            }
          }
          if (T.spawn) { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = T.spawn; spawn('drift', 1, [e.x + rnd(-20, 20), e.y + rnd(-20, 20)]) } }
          // reaching the name corrupts the signal
          if (d < 10 + T.r) {
            S.enemies.splice(k, 1); S.signal -= T.dmg; S.shake = Math.max(S.shake, T.boss ? 14 : 5)
            burst(e.x, e.y, RED, 24, 260); window.__heroHurt?.(T.boss ? 1 : 0.35); updHud()
            if (S.signal <= 0) lose()
            continue
          }
        }
        e.flash = Math.max(0, e.flash - rdt)
        e.trail.push([e.x, e.y]); if (e.trail.length > 8) e.trail.shift()
        e.trail.forEach(([x, y], i) => { g.fillStyle = `rgba(${LIME},${i / e.trail.length * 0.25})`; g.fillRect(x - T.r * 0.5, y - T.r * 0.5, T.r, T.r) })
        const s = T.r * 2
        g.fillStyle = e.flash > 0 ? '#fff' : `rgb(${LIME})`; g.fillRect(e.x - T.r, e.y - T.r, s, s)
        if (T.boss) { g.strokeStyle = `rgba(${LIME},${0.4 + 0.3 * Math.sin(t * 5)})`; g.lineWidth = 1; g.beginPath(); g.arc(e.x, e.y, T.r * 1.9, 0, 7); g.stroke() }
        if (e.max > 1) {                                    // health
          const bw = Math.max(12, s * 1.6)
          g.fillStyle = 'rgba(241,239,233,.15)'; g.fillRect(e.x - bw / 2, e.y - T.r - 7, bw, 2)
          g.fillStyle = `rgb(${LIME})`; g.fillRect(e.x - bw / 2, e.y - T.r - 7, bw * Math.max(0, e.hp / e.max), 2)
        }
      }
      // drones: orbit the name, shoot the nearest noise
      for (let k = S.drones.length - 1; k >= 0; k--) {
        const d = S.drones[k], [px, py] = dronePos(d, t)
        d.x = d.x === undefined || isNaN(d.x) ? px : d.x + (px - d.x) * Math.min(1, rdt * 3); d.y = d.y === undefined || isNaN(d.y) ? py : d.y + (py - d.y) * Math.min(1, rdt * 3)
        let best = null, bd = 1e9
        for (const e of S.enemies) { const dd = Math.hypot(e.x - d.x, e.y - d.y); if (dd < bd) { bd = dd; best = e } }
        if (best) d.ang = Math.atan2(best.y - d.y, best.x - d.x)
        d.cool -= dt
        if (best && d.cool <= 0 && bd < Math.max(W, H) * 0.6 && S.phase === 'play') {
          d.cool = 1.6; const v = 520
          S.bolts.push({ x: d.x, y: d.y, vx: Math.cos(d.ang) * v, vy: Math.sin(d.ang) * v, life: 2 })
        }
        d.flash = Math.max(0, d.flash - rdt)
        g.save(); g.translate(d.x, d.y); g.rotate(d.ang)
        g.strokeStyle = d.flash > 0 ? '#fff' : `rgba(${FG},.9)`; g.lineWidth = 1.3
        g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -5); g.lineTo(-3, 0); g.lineTo(-6, 5); g.closePath(); g.stroke(); g.restore()
        g.fillStyle = 'rgba(241,239,233,.15)'; g.fillRect(d.x - 8, d.y + 9, 16, 2)
        g.fillStyle = `rgb(${ORANGE})`; g.fillRect(d.x - 8, d.y + 9, 16 * d.hp / d.max, 2)
      }
      // drone bolts
      S.bolts = S.bolts.filter(b => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt
        for (const e of S.enemies) if (Math.hypot(e.x - b.x, e.y - b.y) < e.T.r + 3) { damage(e, 0.5); return false }
        const n = Math.hypot(b.vx, b.vy)
        g.strokeStyle = `rgba(${ORANGE},.95)`; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx / n * 9, b.y - b.vy / n * 9); g.stroke()
        return b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20
      })
      // enemy fire
      S.foes = S.foes.filter(f => {
        f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt
        for (const d of S.drones) if (Math.hypot(d.x - f.x, d.y - f.y) < 9) {
          d.hp -= 1; d.flash = 0.15; burst(f.x, f.y, ORANGE, 8, 160)
          if (d.hp <= 0) { burst(d.x, d.y, ORANGE, 30, 260); S.drones.splice(S.drones.indexOf(d), 1); S.drones.forEach((q, i) => q.i = i) }
          return false
        }
        g.fillStyle = `rgba(${RED},.95)`; g.fillRect(f.x - 2, f.y - 2, 4, 4)
        return f.life > 0
      })
      // particles and floating coins
      S.fx = S.fx.filter(p => { p.x += p.vx * rdt; p.y += p.vy * rdt; p.vx *= 0.96; p.vy *= 0.96; p.life -= rdt; g.fillStyle = `rgba(${p.col},${Math.min(1, p.life * 2)})`; g.fillRect(p.x - 1, p.y - 1, 2, 2); return p.life > 0 })
      g.font = '11px "JetBrains Mono", monospace'; g.textAlign = 'center'
      S.texts = S.texts.filter(x => { x.y -= 30 * rdt; x.life -= rdt; g.fillStyle = `rgba(${LIME},${Math.min(1, x.life * 2)})`; g.fillText(x.s + ' ◆', x.x, x.y); return x.life > 0 })
      g.restore()
      $('.gm-foc i').style.width = (100 * S.focus / S.stats.focusMax) + '%'
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  return {
    get active() { return S.active },
    get stats() { return S.stats },
    get playing() { return S.active && S.phase === 'play' },
    start, hitBeam, quit,
    get state() { return S },
  }
}
