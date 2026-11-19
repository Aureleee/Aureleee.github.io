/*
  "Denoise": the hidden game. One shot at the escaping pixel opens it.
  You are the core in the middle of the arena. Left mouse: the cannon (hold for auto-fire).
  Right mouse, once bought: a charged laser (hold, release). Shift or charging slows time.
  Noise comes from the walls toward the core. Kills give ◆; the shop (B) is open at any time.
  Five levels, bosses from level 2. Clear level 5 and the name turns into the X.
*/
const LIME = '200,255,0', FG = '241,239,233', ORANGE = '255,140,90', RED = '255,90,70'
const rnd = (a, b) => a + Math.random() * (b - a)

const TYPES = {
  swarm:    { hp: 0.6, r: 2.5, sp: 68, coin: 1,  dmg: 2 },
  drift:    { hp: 1,   r: 3,  sp: 40, coin: 2,  dmg: 6 },
  zig:      { hp: 2,   r: 3,  sp: 64, coin: 4,  dmg: 7 },
  splitter: { hp: 3,   r: 5,  sp: 34, coin: 6,  dmg: 10, split: 3 },
  tank:     { hp: 7,   r: 6,  sp: 22, coin: 10, dmg: 16 },
  shooter:  { hp: 4,   r: 4,  sp: 32, coin: 8,  dmg: 8, gun: 2.4, keep: 220 },
  drone:    { hp: 3,   r: 5,  sp: 55, coin: 7,  dmg: 6, gun: 2.8, keep: 240, drone: true },
  mini:     { hp: 30,  r: 10, sp: 15, coin: 40, dmg: 30, gun: 1.7, boss: true, keep: 260 },
  boss:     { hp: 90,  r: 15, sp: 10, coin: 110, dmg: 60, gun: 1.2, boss: true, spawn: 2.2, keep: 300 },
}
// [time (s), type, count, extra hp, gap between units]
const LEVELS = [
  { name: 'warm-up', waves: [[0.5, 'drift', 4], [3, 'drone', 1], [5, 'swarm', 6, 0, 0.25], [8, 'drift', 5], [11, 'zig', 3], [13, 'drone', 1], [15, 'swarm', 8, 0, 0.2]] },
  { name: 'first boss', waves: [[0.5, 'zig', 4], [2, 'drone', 2], [4, 'swarm', 14, 0, 0.1], [7, 'splitter', 3], [10, 'drift', 6], [12, 'mini', 1], [15, 'swarm', 16, 0, 0.1]] },
  { name: 'they shoot back', waves: [[0.5, 'shooter', 2], [1.5, 'drone', 3], [3, 'swarm', 18, 0, 0.08], [6, 'tank', 2], [9, 'splitter', 4], [11, 'mini', 1], [11.5, 'mini', 1], [15, 'zig', 8, 1]] },
  { name: 'heavy noise', waves: [[0.5, 'tank', 3, 2], [2, 'swarm', 24, 0, 0.07], [4, 'drone', 4, 1], [6, 'shooter', 3], [8, 'boss', 1], [11, 'splitter', 5, 1], [14, 'swarm', 24, 0, 0.07]] },
  { name: 'the big one', waves: [[0.5, 'boss', 1, 30], [3, 'swarm', 30, 0, 0.06], [5, 'drone', 4, 2], [8, 'mini', 2], [11, 'shooter', 4, 2], [14, 'boss', 1], [16, 'splitter', 6, 2], [19, 'swarm', 30, 0, 0.06]] },
]
const DMG = [0, 1, 1.5, 2.2, 3.2], RATE = [0, 0.42, 0.32, 0.24, 0.17], KEEP = [0, 0.55, 0.72, 0.86], LDMG = [0, 4, 7, 11]
const SHOP = [
  { id: 'dmg',    name: 'Power',     desc: 'cannon damage', lvl: s => s.dl, max: 4, cost: l => [40, 100, 200][l - 1] },
  { id: 'rate',   name: 'Fire rate', desc: 'pof pof pof, faster', lvl: s => s.rl, max: 4, cost: l => [35, 90, 180][l - 1] },
  { id: 'multi',  name: 'Multishot', desc: '+1 shell in a fan', lvl: s => s.multi, max: 5, cost: l => [60, 130, 220, 340][l - 1] },
  { id: 'bounce', name: 'Rebound',   desc: 'shots bounce off the walls', lvl: s => s.bounce, max: 3, cost: l => [50, 120, 230][l] },
  { id: 'pierce', name: 'Pierce',    desc: 'goes through, weaker each hit', lvl: s => s.pierce, max: 3, cost: l => [55, 120, 210][l] },
  { id: 'laser',  name: 'Laser',     desc: 'right click: hold, release', lvl: s => s.laser, max: 3, cost: l => [120, 160, 260][l] },
  { id: 'turret', name: 'Turret',    desc: '+1 turret around the core', lvl: s => s.turrets, max: 6, cost: l => [50, 90, 140, 200, 270, 350][l] },
  { id: 'focus',  name: 'Focus',     desc: '+1 s of slow motion', lvl: s => s.focusMax, max: 5, cost: l => [35, 70, 120, 180][l - 1] },
  { id: 'repair', name: 'Repair',    desc: 'turrets + 35 signal', lvl: () => 0, max: 99, cost: () => 25 },
]

export function initGame({ lenis }) {
  const cv = document.createElement('canvas'); cv.className = 'game-fx'
  document.body.appendChild(cv)
  const g = cv.getContext('2d')
  let W = 0, H = 0
  const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0) }
  size(); addEventListener('resize', size)
  const arena = () => ({ x0: W * 0.04, y0: 86, x1: W * 0.96, y1: H - 56 })
  const core = () => ({ x: W / 2, y: (86 + H - 56) / 2 })

  // ---- HUD (bottom right), shop, banner ----
  const hud = document.createElement('div'); hud.className = 'gm-hud mono'
  hud.innerHTML = `<div class="gm-score"><span>score</span><b>0</b></div>
    <div class="gm-line"><span class="gm-lvl"></span><span class="gm-coin"></span><span class="gm-combo"></span></div>
    <div class="gm-line"><span class="gm-lab">signal</span><span class="gm-bar gm-sig"><i></i></span><span class="gm-lab">focus</span><span class="gm-bar gm-foc"><i></i></span></div>
    <div class="gm-line"><button class="gm-btn gm-shop" type="button">shop · B</button><button class="gm-btn gm-quit" type="button">quit · esc</button></div>`
  const panel = document.createElement('div'); panel.className = 'gm-panel mono'
  const banner = document.createElement('div'); banner.className = 'gm-banner'
  document.body.append(hud, panel, banner)
  const $ = s => hud.querySelector(s)
  $('.gm-quit').addEventListener('click', () => quit())
  $('.gm-shop').addEventListener('click', () => toggleShop())
  addEventListener('keydown', e => {
    if (!S.active) return
    if (e.key === 'Escape') { if (S.phase === 'pause') toggleShop(); else quit() }
    if (e.key === 'b' || e.key === 'B') toggleShop()
  })
  for (const el of [hud, panel]) el.addEventListener('pointerdown', e => e.stopPropagation())

  const S = {
    active: false, phase: 'off', level: 0, coins: 0, signal: 100, score: 0, combo: 0, comboT: 0,
    stats: null, focus: 2, ts: 1, reload: 0,
    enemies: [], pend: [], drones: [], bolts: [], foes: [], fx: [], texts: [], spawnQ: [], lt: 0, shake: 0,
  }

  const say = (big, small = '', dur = 1.8) => {
    banner.innerHTML = `<b>${big}</b>${small ? `<span class="mono">${small}</span>` : ''}`
    banner.classList.remove('on'); void banner.offsetWidth; banner.classList.add('on')
    clearTimeout(say.t); say.t = setTimeout(() => banner.classList.remove('on'), dur * 1000)
  }
  const updHud = () => {
    $('.gm-score b').textContent = S.score.toLocaleString('en-US').replace(/,/g, ' ')
    $('.gm-lvl').textContent = `lvl ${S.level}/5`
    $('.gm-coin').textContent = `◆ ${S.coins}`
    $('.gm-combo').textContent = S.combo > 1 ? `×${S.combo}` : ''
    $('.gm-sig i').style.width = Math.max(0, S.signal) + '%'
  }

  const newDrone = () => ({ i: 0, hp: 6, max: 6, cool: rnd(0.3, 1.2), x: NaN, y: NaN, ang: 0, flash: 0 })
  const dronePos = (d, t) => {
    const c = core(), n = S.drones.length, a = (d.i / Math.max(1, n)) * Math.PI * 2 + t * 0.35
    return [c.x + Math.cos(a) * 120, c.y + Math.sin(a) * 120 * 0.8]
  }

  // enemies appear on the arena walls: a few dots converge, then the square materialises
  function spawn(type, extra = 0, at) {
    const A = arena()
    let x, y
    if (at) [x, y] = at
    else {
      const side = Math.random(), m = 26
      if (side < 0.3) { x = rnd(A.x0 + m, A.x1 - m); y = A.y0 + m } else if (side < 0.55) { x = rnd(A.x0 + m, A.x1 - m); y = A.y1 - m }
      else if (side < 0.78) { x = A.x0 + m; y = rnd(A.y0 + m, A.y1 - m) } else { x = A.x1 - m; y = rnd(A.y0 + m, A.y1 - m) }
    }
    const big = TYPES[type].boss
    S.pend.push({ type, extra, x, y, t: big ? 1.1 : 0.55, T: big ? 1.1 : 0.55, dots: Array.from({ length: big ? 40 : 10 }, () => ({ a: Math.random() * 7, r: rnd(25, big ? 140 : 60) })) })
  }
  function materialise(type, extra, x, y) {
    const T = TYPES[type], hp = T.hp + extra
    S.enemies.push({ type, T, x, y, hp, max: hp, ph: rnd(0, 10), flash: 0, gun: T.gun ? rnd(2, 2 + T.gun) : 0, spawnT: T.spawn || 0, trail: [], ox: rnd(-22, 22), oy: rnd(-18, 18) })
  }

  function startLevel(n) {
    S.level = n; S.phase = 'play'; S.lt = 0
    S.spawnQ = LEVELS[n - 1].waves.flatMap(([t, type, count, extra = 0, gap]) => Array.from({ length: count }, (_, k) => ({ t: t + k * (gap ?? (TYPES[type].boss ? 0 : 0.5)), type, extra }))).sort((a, b) => a.t - b.t)
    panel.classList.remove('on')
    say(`LEVEL ${n}`, LEVELS[n - 1].name)
    updHud()
  }

  function start(x, y, hpLeft = 3) {
    if (S.active) return
    Object.assign(S, { active: true, coins: 0, signal: 100, score: 0, combo: 0, enemies: [], pend: [], bolts: [], foes: [], fx: [], texts: [], focus: 2, reload: 0 })
    S.stats = { dl: 1, dmg: 1, rl: 1, multi: 1, bounce: 0, pierce: 0, laser: 0, turrets: 1, focusMax: 2 }
    lenis?.scrollTo(0, { duration: 0.8 }); setTimeout(() => lenis?.stop(), 820)
    document.documentElement.classList.add('gaming')
    window.__gameArena?.on()
    S.drones = [newDrone()]; S.shells = []; S.beams = []
    startLevel(1)
    materialise('zig', hpLeft - TYPES.zig.hp, x, y)       // the escaping pixel is the first enemy, with its 3 lives
    say('DENOISE', 'aim · click or hold to fire · B for the shop', 2.8)
  }
  function quit(win = false) {
    Object.assign(S, { active: false, phase: 'off', enemies: [], pend: [], bolts: [], foes: [] })
    window.__ts = 1
    panel.classList.remove('on'); banner.classList.remove('on')
    document.documentElement.classList.remove('gaming')
    lenis?.start()
    window.__gameEnded?.(win)
  }

  // ---- shop: between levels, or any time with B (the game pauses) ----
  function toggleShop() {
    if (!S.active) return
    if (S.phase === 'pause') { S.phase = 'play'; panel.classList.remove('on'); return }
    if (S.phase === 'play') { S.phase = 'pause'; renderShop(false) }
  }
  function renderShop(cleared, bonus = 0) {
    panel.innerHTML = `<p class="gm-t">${cleared ? `level ${S.level} cleared <span>+${bonus} ◆</span>` : `shop <span>◆ ${S.coins}</span>`}</p><div class="gm-grid">` +
      SHOP.map(it => {
        const l = it.lvl(S.stats), maxed = l >= it.max, c = maxed ? 0 : it.cost(l)
        return `<button class="gm-item" data-id="${it.id}" ${maxed || S.coins < c ? 'disabled' : ''}><b>${it.name}${it.id !== 'repair' ? ` <em>${'▮'.repeat(l)}${'▯'.repeat(Math.max(0, it.max - l))}</em>` : ''}</b><span>${it.desc}</span><i>${maxed ? 'max' : c + ' ◆'}</i></button>`
      }).join('') + `</div><button class="gm-next" type="button">${cleared ? (S.level < 5 ? `level ${S.level + 1} →` : 'finish') : 'resume · B'}</button>`
    panel.querySelectorAll('.gm-item').forEach(b => b.addEventListener('click', () => {
      const it = SHOP.find(i => i.id === b.dataset.id), c = it.cost(it.lvl(S.stats))
      if (S.coins < c) return
      S.coins -= c
      const st = S.stats
      if (it.id === 'dmg') { st.dl++; st.dmg = DMG[st.dl] }
      if (it.id === 'rate') st.rl++
      if (it.id === 'laser') st.laser++
      if (it.id === 'multi') st.multi++
      if (it.id === 'bounce') st.bounce++
      if (it.id === 'pierce') st.pierce++
      if (it.id === 'focus') { st.focusMax++; S.focus = st.focusMax }
      if (it.id === 'turret') { st.turrets++; S.drones.push(newDrone()) }
      if (it.id === 'repair') { S.drones.forEach(d => d.hp = d.max); while (S.drones.length < st.turrets) S.drones.push(newDrone()); S.signal = Math.min(100, S.signal + 35) }
      S.drones.forEach((d, i) => d.i = i)
      updHud(); renderShop(cleared, bonus)
    }))
    panel.querySelector('.gm-next').addEventListener('click', () => {
      if (!cleared) return toggleShop()
      S.level < 5 ? startLevel(S.level + 1) : win()
    })
    panel.classList.add('on')
  }
  function levelCleared() {
    S.phase = 'shop'
    const bonus = 20 * S.level; S.coins += bonus
    updHud(); renderShop(true, bonus)
  }
  function win() {
    panel.classList.remove('on')
    say('SIGNAL RESTORED', `score ${S.score}`, 2.4)
    setTimeout(() => quit(true), 1700)
  }
  function lose() {
    S.phase = 'lost'
    panel.innerHTML = `<p class="gm-t">signal lost <span>level ${S.level} · score ${S.score}</span></p><div class="gm-row"><button class="gm-next" data-a="retry" type="button">retry level</button><button class="gm-next gm-ghost" data-a="quit" type="button">quit</button></div>`
    panel.querySelector('[data-a=retry]').addEventListener('click', () => { Object.assign(S, { enemies: [], foes: [], pend: [], signal: 100 }); S.drones.forEach(d => d.hp = d.max); startLevel(S.level) })
    panel.querySelector('[data-a=quit]').addEventListener('click', () => quit())
    panel.classList.add('on')
  }

  // ---- the cannon (the hero code draws the beams and asks us for hits) ----
  // ---- input: left = cannon, right = laser (once bought), shift = slow motion ----
  const M = { x: -1e4, y: -1e4, fire: false, laser: false, lt0: 0, shift: false }
  addEventListener('pointermove', e => { M.x = e.clientX; M.y = e.clientY })
  addEventListener('pointerdown', e => {
    if (!S.active || e.pointerType !== 'mouse' || e.target.closest('.gm-hud, .gm-panel, a, button')) return
    M.x = e.clientX; M.y = e.clientY
    if (e.button === 0) M.fire = true
    if (e.button === 2 && S.stats.laser) { M.laser = true; M.lt0 = performance.now() }
  })
  addEventListener('pointerup', e => {
    if (e.button === 0) M.fire = false
    if (e.button === 2 && M.laser) { fireLaser(); M.laser = false }
  })
  addEventListener('contextmenu', e => { if (S.active) e.preventDefault() })
  addEventListener('keydown', e => { if (e.key === 'Shift') M.shift = true })
  addEventListener('keyup', e => { if (e.key === 'Shift') M.shift = false })
  addEventListener('blur', () => { M.fire = M.laser = M.shift = false })
  const charge = () => M.laser ? Math.min(1, (performance.now() - M.lt0) / 900) : 0

  function fireCannon() {
    const C = core(), base = Math.atan2(M.y - C.y, M.x - C.x), n = S.stats.multi, spread = n > 1 ? Math.min(0.7, 0.12 * (n - 1)) : 0
    for (let k = 0; k < n; k++) {
      const a = base + (n > 1 ? -spread / 2 + spread * k / (n - 1) : 0)
      S.shells.push({ x: C.x + Math.cos(a) * 24, y: C.y + Math.sin(a) * 24, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg: S.stats.dmg, bounces: S.stats.bounce, pierce: S.stats.pierce, hits: new Set(), life: 2.2 })
    }
    S.recoil = 1
    S.reload = RATE[S.stats.rl]
  }
  // the laser: a straight beam to the wall, rebounding inside the arena
  function trace(x, y, ux, uy, bounces) {
    const A = arena(), pts = [[x, y]]
    for (let k = 0; k <= bounces; k++) {
      let tw = 1e9, axis = 0
      if (ux > 0) { const q = (A.x1 - x) / ux; if (q < tw) { tw = q; axis = 0 } } else if (ux < 0) { const q = (A.x0 - x) / ux; if (q < tw) { tw = q; axis = 0 } }
      if (uy > 0) { const q = (A.y1 - y) / uy; if (q < tw) { tw = q; axis = 1 } } else if (uy < 0) { const q = (A.y0 - y) / uy; if (q < tw) { tw = q; axis = 1 } }
      x += ux * tw; y += uy * tw; pts.push([x, y])
      if (axis === 0) ux = -ux; else uy = -uy
    }
    return pts
  }
  function fireLaser() {
    const c = charge(); if (c < 0.15 || S.phase !== 'play') return
    const C = core(), a = Math.atan2(M.y - C.y, M.x - C.x), pts = trace(C.x, C.y, Math.cos(a), Math.sin(a), S.stats.bounce)
    const L = { pts, dmg: LDMG[S.stats.laser] * (0.35 + 0.65 * c), pierce: 3, hits: new Set(), age: 0, w: 1 + 3 * c }
    for (let i = 1; i < pts.length; i++) { if (hitBeam(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], L.w, L) !== null) { pts.length = i + 1; break } }
    S.beams.push(L); S.shake = Math.max(S.shake, 3 + 5 * c)
  }
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
      L.dmg *= L.pierce >= 3 && L.w ? 0.9 : KEEP[L.pierce]; if (L.dmg < 0.25) return u
    }
    return null
  }
  function damage(e, d) {
    e.hp -= d; e.flash = 0.12
    burst(e.x, e.y, LIME, 4, 110)
    if (e.hp <= 0.01) kill(e)
  }
  function kill(e) {
    const i = S.enemies.indexOf(e); if (i < 0) return
    S.enemies.splice(i, 1)
    S.combo = S.comboT > 0 ? S.combo + 1 : 1; S.comboT = 1.4
    const mult = 1 + 0.25 * Math.min(8, S.combo - 1), coin = Math.round(e.T.coin * mult)
    S.coins += coin; S.score += Math.round(e.T.coin * 10 * mult)
    S.texts.push({ x: e.x, y: e.y - 10, s: `+${coin} ◆${S.combo > 1 ? ` ×${S.combo}` : ''}`, life: 0.9 })
    burst(e.x, e.y, LIME, e.T.boss ? 90 : 16, e.T.boss ? 440 : 220)
    if (e.T.boss) S.shake = 12
    if (e.T.split) for (let k = 0; k < e.T.split; k++) materialise('swarm', 0, e.x + rnd(-8, 8), e.y + rnd(-8, 8))
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
      const playing = S.phase === 'play'
      const aiming = (M.shift || M.laser) && playing && S.focus > 0
      S.ts += ((playing ? (aiming ? 0.3 : 1) : 0) - S.ts) * Math.min(1, rdt * 10)
      S.focus = aiming ? Math.max(0, S.focus - rdt) : Math.min(S.stats.focusMax, S.focus + rdt * 0.35)
      window.__ts = S.ts
      const dt = rdt * S.ts, t = now / 1000, C = core()
      S.reload = Math.max(0, S.reload - dt); S.recoil = Math.max(0, (S.recoil || 0) - rdt * 8)
      if (playing && M.fire && S.reload <= 0) fireCannon()
      S.comboT -= dt; if (S.comboT <= 0 && S.combo) { S.combo = 0; updHud() }
      if (S.ts < 0.9 && playing) {
        const k = (1 - S.ts) * 0.6, gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
        gr.addColorStop(0, `rgba(${LIME},0)`); gr.addColorStop(1, `rgba(${LIME},${0.08 * k})`); g.fillStyle = gr; g.fillRect(0, 0, W, H)
      }
      const sx = S.shake * (Math.random() - 0.5), sy = S.shake * (Math.random() - 0.5); S.shake *= Math.exp(-8 * rdt)
      g.save(); g.translate(sx, sy)

      if (playing) {
        S.lt += dt
        while (S.spawnQ.length && S.spawnQ[0].t <= S.lt) { const q = S.spawnQ.shift(); spawn(q.type, q.extra) }
        if (!S.spawnQ.length && !S.enemies.length && !S.pend.length) levelCleared()
      }
      // dots gathering where an enemy is about to appear
      for (let k = S.pend.length - 1; k >= 0; k--) {
        const q = S.pend[k]; q.t -= dt
        const u = 1 - Math.max(0, q.t) / q.T
        for (const d of q.dots) { const r = d.r * (1 - u) ** 1.5, a = d.a + u * 3; g.fillStyle = `rgba(${LIME},${0.3 + 0.7 * u})`; g.fillRect(q.x + Math.cos(a) * r - 1, q.y + Math.sin(a) * r - 1, 2, 2) }
        if (q.t <= 0) { S.pend.splice(k, 1); materialise(q.type, q.extra, q.x, q.y); burst(q.x, q.y, LIME, 6, 80) }
      }
      // enemies
      for (let k = S.enemies.length - 1; k >= 0; k--) {
        const e = S.enemies[k], T = e.T
        if (playing) {
          const tx = C.x + e.ox, ty = C.y + e.oy, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) + 1e-3
          let sp = T.sp
          if (T.keep && d < T.keep) sp *= -0.4                   // gunners keep their distance and circle
          let vx = dx / d * sp, vy = dy / d * sp
          if (T.keep) { vx += -dy / d * 30; vy += dx / d * 30 }
          if (e.type === 'zig' || e.type === 'swarm') { const w = e.type === 'zig' ? 70 : 40; vx += -dy / d * Math.sin(t * 4 + e.ph) * w; vy += dx / d * Math.sin(t * 4 + e.ph) * w }
          if (e.type === 'drift') { vx += Math.sin(t * 1.3 + e.ph) * 14; vy += Math.cos(t * 1.1 + e.ph) * 14 }
          e.x += vx * dt; e.y += vy * dt
          if (T.gun) {
            e.gun -= dt
            if (e.gun <= 0) {
              e.gun = T.gun * rnd(0.8, 1.2)
              const tgt = S.drones.length && Math.random() < (T.drone ? 0.25 : 0.6) ? S.drones[(Math.random() * S.drones.length) | 0] : C
              const n = T.boss ? (e.type === 'boss' ? 7 : 3) : 1
              for (let j = 0; j < n; j++) {
                const a = Math.atan2(tgt.y - e.y, tgt.x - e.x) + (j - (n - 1) / 2) * 0.16
                S.foes.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 6, dmg: T.boss ? 5 : 3 })
              }
            }
          }
          if (T.spawn) { e.spawnT -= dt; if (e.spawnT <= 0) { e.spawnT = T.spawn; for (let j = 0; j < 3; j++) materialise('swarm', 0, e.x + rnd(-20, 20), e.y + rnd(-20, 20)) } }
          if (d < 14 + T.r && !T.keep) {                         // reached the core
            S.enemies.splice(k, 1); S.signal -= T.dmg; S.shake = Math.max(S.shake, T.boss ? 14 : 5); S.combo = 0
            burst(e.x, e.y, RED, 22, 240); window.__heroHurt?.(T.boss ? 1 : 0.3); updHud()
            if (S.signal <= 0) lose()
            continue
          }
        }
        e.flash = Math.max(0, e.flash - rdt)
        e.trail.push([e.x, e.y]); if (e.trail.length > 7) e.trail.shift()
        e.trail.forEach(([x, y], i) => { g.fillStyle = `rgba(${LIME},${i / e.trail.length * 0.22})`; g.fillRect(x - T.r * 0.5, y - T.r * 0.5, T.r, T.r) })
        const s = T.r * 2
        if (T.drone) {                                     // hostile drones keep the look of the hunters
          const a = Math.atan2(C.y - e.y, C.x - e.x)
          g.save(); g.translate(e.x, e.y); g.rotate(a); g.strokeStyle = e.flash > 0 ? '#fff' : `rgba(${ORANGE},.95)`; g.lineWidth = 1.4
          g.beginPath(); g.moveTo(9, 0); g.lineTo(-7, -6); g.lineTo(-3, 0); g.lineTo(-7, 6); g.closePath(); g.stroke(); g.restore()
        } else { g.fillStyle = e.flash > 0 ? '#fff' : e.type === 'shooter' ? `rgb(${ORANGE})` : `rgb(${LIME})`; g.fillRect(e.x - T.r, e.y - T.r, s, s) }
        if (e.type === 'splitter') { g.fillStyle = '#0b0b0b'; g.fillRect(e.x - 1, e.y - 1, 2, 2) }
        if (T.boss) { g.strokeStyle = `rgba(${LIME},${0.4 + 0.3 * Math.sin(t * 5)})`; g.lineWidth = 1; g.beginPath(); g.arc(e.x, e.y, T.r * 1.9, 0, 7); g.stroke() }
        if (e.max > 1) {
          const bw = Math.max(12, s * 1.6)
          g.fillStyle = 'rgba(241,239,233,.15)'; g.fillRect(e.x - bw / 2, e.y - T.r - 7, bw, 2)
          g.fillStyle = `rgb(${LIME})`; g.fillRect(e.x - bw / 2, e.y - T.r - 7, bw * Math.max(0, e.hp / e.max), 2)
        }
      }
      // drones around the core shoot the nearest noise
      for (const d of S.drones) {
        const [px, py] = dronePos(d, t)
        if (isNaN(d.x)) { d.x = px; d.y = py }
        d.x += (px - d.x) * Math.min(1, rdt * 3); d.y += (py - d.y) * Math.min(1, rdt * 3)
        let best = null, bd = 1e9
        for (const e of S.enemies) { const dd = Math.hypot(e.x - d.x, e.y - d.y); if (dd < bd) { bd = dd; best = e } }
        if (best) d.ang = Math.atan2(best.y - d.y, best.x - d.x)
        d.cool -= dt
        if (best && d.cool <= 0 && bd < 420 && playing) { d.cool = 1.5; S.bolts.push({ x: d.x, y: d.y, vx: Math.cos(d.ang) * 520, vy: Math.sin(d.ang) * 520, life: 1.2 }) }
        d.flash = Math.max(0, d.flash - rdt)
        g.save(); g.translate(d.x, d.y); g.rotate(d.ang)                      // a turret: a ring and a barrel
        g.strokeStyle = d.flash > 0 ? '#fff' : `rgba(${FG},.9)`; g.lineWidth = 1.3
        g.beginPath(); g.arc(0, 0, 5, 0, 7); g.stroke(); g.beginPath(); g.moveTo(5, 0); g.lineTo(11, 0); g.stroke(); g.restore()
        g.fillStyle = 'rgba(241,239,233,.15)'; g.fillRect(d.x - 8, d.y + 9, 16, 2)
        g.fillStyle = `rgb(${ORANGE})`; g.fillRect(d.x - 8, d.y + 9, 16 * d.hp / d.max, 2)
      }
      S.bolts = S.bolts.filter(b => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt
        for (const e of S.enemies) if (Math.hypot(e.x - b.x, e.y - b.y) < e.T.r + 3) { damage(e, 0.5); return false }
        const n = Math.hypot(b.vx, b.vy)
        g.strokeStyle = `rgba(${ORANGE},.95)`; g.lineWidth = 2; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx / n * 9, b.y - b.vy / n * 9); g.stroke()
        return b.life > 0
      })
      S.foes = S.foes.filter(f => {
        f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt
        for (const d of S.drones) if (Math.hypot(d.x - f.x, d.y - f.y) < 9) {
          d.hp -= 1; d.flash = 0.15; burst(f.x, f.y, ORANGE, 8, 160)
          if (d.hp <= 0) { burst(d.x, d.y, ORANGE, 30, 260); S.drones.splice(S.drones.indexOf(d), 1); S.drones.forEach((q, i) => q.i = i) }
          return false
        }
        if (Math.hypot(C.x - f.x, C.y - f.y) < 18) { S.signal -= f.dmg; S.shake = Math.max(S.shake, 4); burst(f.x, f.y, RED, 10, 160); updHud(); if (S.signal <= 0 && S.phase === 'play') lose(); return false }
        g.fillStyle = `rgba(${RED},.95)`; g.fillRect(f.x - 2, f.y - 2, 4, 4)
        return f.life > 0
      })
      // cannon shells: bounce off the arena walls if upgraded, pierce if upgraded
      const A = arena()
      S.shells = S.shells.filter(b => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt
        if (b.x < A.x0 || b.x > A.x1) { if (b.bounces-- > 0) { b.vx = -b.vx; b.x = Math.max(A.x0, Math.min(A.x1, b.x)); b.hits.clear(); burst(b.x, b.y, FG, 4, 90) } else { burst(b.x, b.y, FG, 5, 90); return false } }
        if (b.y < A.y0 || b.y > A.y1) { if (b.bounces-- > 0) { b.vy = -b.vy; b.y = Math.max(A.y0, Math.min(A.y1, b.y)); b.hits.clear(); burst(b.x, b.y, FG, 4, 90) } else { burst(b.x, b.y, FG, 5, 90); return false } }
        for (let k = S.foes.length - 1; k >= 0; k--) { const f = S.foes[k]; if (Math.hypot(f.x - b.x, f.y - b.y) < 7) { S.foes.splice(k, 1); burst(f.x, f.y, RED, 6, 100); return false } }
        for (const e of S.enemies) if (!b.hits.has(e) && Math.hypot(e.x - b.x, e.y - b.y) < e.T.r + 6) {
          b.hits.add(e); damage(e, b.dmg)
          if (!b.pierce) return false
          b.dmg *= KEEP[b.pierce]; if (b.dmg < 0.25) return false
        }
        const n = Math.hypot(b.vx, b.vy)
        g.strokeStyle = `rgba(${FG},.95)`; g.lineWidth = 2.5; g.lineCap = 'round'
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx / n * 7, b.y - b.vy / n * 7); g.stroke()
        return b.life > 0
      })
      // laser beams
      S.beams = S.beams.filter(L => {
        L.age += rdt; const f = Math.max(0, 1 - L.age / 0.35)
        g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'
        const path = () => { g.beginPath(); L.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)) }
        g.shadowColor = `rgba(${LIME},.9)`; g.shadowBlur = 14 * f; g.strokeStyle = `rgba(${LIME},${0.6 * f})`; g.lineWidth = L.w + 2; path(); g.stroke()
        g.shadowBlur = 0; g.strokeStyle = `rgba(255,255,255,${f})`; g.lineWidth = 1; path(); g.stroke(); g.restore()
        return f > 0
      })
      // the core and its cannon, pointing at the mouse; a ring shows the reload, another the laser charge
      const aim = Math.atan2(M.y - C.y, M.x - C.x), rl = 1 - S.reload / RATE[S.stats.rl], ch = charge()
      g.strokeStyle = `rgba(${FG},.14)`; g.lineWidth = 2; g.beginPath(); g.arc(C.x, C.y, 16, 0, 7); g.stroke()
      g.strokeStyle = rl >= 1 ? `rgba(${LIME},.85)` : `rgba(${FG},.5)`; g.beginPath(); g.arc(C.x, C.y, 16, -Math.PI / 2, -Math.PI / 2 + Math.min(1, rl) * Math.PI * 2); g.stroke()
      g.save(); g.translate(C.x, C.y); g.rotate(aim); g.fillStyle = `rgb(${FG})`; g.fillRect(10 - 4 * (S.recoil || 0), -2.5, 16, 5); g.restore()
      g.fillStyle = `rgb(${LIME})`; g.fillRect(C.x - 3, C.y - 3, 6, 6)
      if (ch > 0) {
        g.strokeStyle = ch >= 1 ? '#fff' : `rgba(${LIME},.9)`; g.lineWidth = 1.5; g.beginPath(); g.arc(C.x, C.y, 26 - 6 * ch, -Math.PI / 2, -Math.PI / 2 + ch * Math.PI * 2); g.stroke()
        const P = trace(C.x, C.y, Math.cos(aim), Math.sin(aim), Math.min(1, S.stats.bounce))
        g.strokeStyle = `rgba(${LIME},${0.2 + 0.3 * ch})`; g.setLineDash([5, 7]); g.lineDashOffset = -t * 50; g.lineWidth = 1
        g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([])
      }
      S.fx = S.fx.filter(p => { p.x += p.vx * rdt; p.y += p.vy * rdt; p.vx *= 0.96; p.vy *= 0.96; p.life -= rdt; g.fillStyle = `rgba(${p.col},${Math.min(1, p.life * 2)})`; g.fillRect(p.x - 1, p.y - 1, 2, 2); return p.life > 0 })
      g.font = '11px "JetBrains Mono", monospace'; g.textAlign = 'center'
      S.texts = S.texts.filter(x => { x.y -= 30 * rdt; x.life -= rdt; g.fillStyle = `rgba(${LIME},${Math.min(1, x.life * 2)})`; g.fillText(x.s, x.x, x.y); return x.life > 0 })
      g.restore()
      $('.gm-foc i').style.width = (100 * S.focus / S.stats.focusMax) + '%'
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  return {
    get active() { return S.active },
    get playing() { return S.active && S.phase === 'play' },
    get stats() { return S.stats },
    get state() { return S },
    core, arena, start, quit,
  }
}
