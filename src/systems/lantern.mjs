// Balance proposals from the implementation specification; all units are seconds/pixels.
export const LANTERN_CONFIG = Object.freeze({
  maxFuel: 100, initialFuel: 100, defaultMode: 'normal',
  modes: Object.freeze({
    dim: Object.freeze({radius: 80, burnPerSecond: .45}),
    normal: Object.freeze({radius: 125, burnPerSecond: 1}),
    bright: Object.freeze({radius: 180, burnPerSecond: 1.7})
  }),
  lowThreshold: 30, criticalThreshold: 10, exhaustedRadius: 38,
  pickupRestore: 25, pickupInterval: 20, pickupLifetime: 80, maxPickups: 4,
  pickupDistance: 140, pickupAttempts: 24, pickupCollectRadius: 22,
  shadowChapter: 1, shadowType: 0, litSpeedMultiplier: .72, hungrySpeedMultiplier: 1.18
});
const modes = Object.keys(LANTERN_CONFIG.modes);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export function createLanternState() {
  return {version: 1, fuel: LANTERN_CONFIG.initialFuel, mode: LANTERN_CONFIG.defaultMode,
    elapsed: 0, pickupClock: 0, serial: 0, collected: 0, restored: 0, drained: 0, pickups: []};
}
export function validLanternState(s) {
  if (!s || s.version !== 1 || !modes.includes(s.mode)) return false;
  if(s.drained!==undefined&&(!Number.isFinite(s.drained)||s.drained<0||s.drained>1e12))return false;
  for (const key of ['fuel','elapsed','pickupClock','serial','collected','restored']) {
    if (!Number.isFinite(s[key]) || s[key] < 0 || s[key] > 1e12) return false;
  }
  if (s.fuel > LANTERN_CONFIG.maxFuel || s.pickupClock > LANTERN_CONFIG.pickupInterval ||
      !Number.isSafeInteger(s.serial) || !Number.isSafeInteger(s.collected)) return false;
  if (!Array.isArray(s.pickups) || s.pickups.length > LANTERN_CONFIG.maxPickups) return false;
  const ids = new Set();
  return s.pickups.every(p => {
    if (!p || !Number.isSafeInteger(p.id) || p.id < 1 || p.id > s.serial || ids.has(p.id)) return false;
    ids.add(p.id);
    return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 &&
      p.x <= 2400 && p.y <= 1500 && Number.isFinite(p.life) && p.life > 0 && p.life <= LANTERN_CONFIG.pickupLifetime&&
      (p.restore===undefined||Number.isFinite(p.restore)&&p.restore>0&&p.restore<=LANTERN_CONFIG.pickupRestore);
  });
}
export function cycleLanternMode(s) {
  s.mode = modes[(modes.indexOf(s.mode) + 1) % modes.length];
  return s.mode;
}
export function lanternRadius(s) {
  return s.fuel > 0 ? LANTERN_CONFIG.modes[s.mode].radius : LANTERN_CONFIG.exhaustedRadius;
}
export function lanternStatus(s) {
  return s.fuel <= 0 ? 'empty' : s.fuel < LANTERN_CONFIG.criticalThreshold ? 'critical' :
    s.fuel < LANTERN_CONFIG.lowThreshold ? 'low' : 'steady';
}
export function lanternMessage(s) {
  return {steady:'Collect oil flasks to refill. Light slows Wisps in the Woods.',
    low:'Low fuel — Wisps move faster outside the light. Find an oil flask.',
    critical:'Critical fuel — switch to Dim to conserve oil. Find a flask.',
    empty:'Lantern exhausted — you can still fight, dash and collect oil.'}[lanternStatus(s)];
}
export function shadowSpeedMultiplier(s, enemy, player) {
  if (!s || enemy.boss || enemy.chapter !== LANTERN_CONFIG.shadowChapter || enemy.type !== LANTERN_CONFIG.shadowType) return 1;
  if (s.fuel > 0 && Math.hypot(enemy.x-player.x, enemy.y-player.y) <= lanternRadius(s)) return LANTERN_CONFIG.litSpeedMultiplier;
  return s.fuel < LANTERN_CONFIG.lowThreshold ? LANTERN_CONFIG.hungrySpeedMultiplier : 1;
}
export function collectLanternPickup(s, id) {
  const index = s.pickups.findIndex(p => p.id === id);
  // Full tanks leave the flask on the ground for later, rather than wasting it.
  if (index < 0 || s.fuel >= LANTERN_CONFIG.maxFuel) return 0;
  const gained = Math.min(s.pickups[index].restore??LANTERN_CONFIG.pickupRestore, LANTERN_CONFIG.maxFuel-s.fuel);
  s.fuel += gained; s.pickups.splice(index,1); s.collected++; s.restored += gained;
  return gained;
}
export function drainLanternFuel(s,amount){
  if(!s||!Number.isFinite(amount)||amount<=0)return 0;
  const drained=Math.min(s.fuel,amount);s.fuel=Math.max(0,s.fuel-drained);s.drained=(s.drained||0)+drained;return drained;
}
export function dropLanternPickup(s,point,restore){
  if(s.pickups.length>=LANTERN_CONFIG.maxPickups||!Number.isFinite(restore)||restore<=0||restore>LANTERN_CONFIG.pickupRestore||
    !Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>2400||point.y<0||point.y>1500)return null;
  const pickup={x:point.x,y:point.y,id:++s.serial,life:LANTERN_CONFIG.pickupLifetime,restore};s.pickups.push(pickup);return pickup;
}
export function resetLanternMap(s) {
  s.pickups = []; s.pickupClock = 0; // Fuel and mode carry across chapters.
}
/** Pure placement candidates: no ambient RNG, bounded work and no frame-dependent rolls. */
export function placeLanternPickup(s, player, canPlace) {
  if (s.pickups.length >= LANTERN_CONFIG.maxPickups) return null;
  for (let i=0; i<LANTERN_CONFIG.pickupAttempts; i++) {
    const angle = s.serial*2.399963229728653 + i*Math.PI/6;
    const distance = LANTERN_CONFIG.pickupDistance - Math.floor(i/12)*50;
    const point = {x: player.x+Math.cos(angle)*distance, y: player.y+Math.sin(angle)*distance};
    if (!canPlace(point) || s.pickups.some(p => Math.hypot(p.x-point.x,p.y-point.y)<32)) continue;
    const pickup = {...point, id: ++s.serial, life: LANTERN_CONFIG.pickupLifetime};
    s.pickups.push(pickup); return pickup;
  }
  return null; // Retry at the next interval instead of spawning into cover.
}
export function tickLantern(s, dt, player, canPlace, canCollect = canPlace) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  s.fuel = clamp(s.fuel-LANTERN_CONFIG.modes[s.mode].burnPerSecond*dt,0,LANTERN_CONFIG.maxFuel);
  s.elapsed += dt;
  for (const p of s.pickups) p.life -= dt;
  s.pickups = s.pickups.filter(p => p.life>0);
  // The runtime calls this only during active simulation; no independent timers.
  s.pickupClock += dt;
  if (s.pickupClock >= LANTERN_CONFIG.pickupInterval) {
    s.pickupClock %= LANTERN_CONFIG.pickupInterval;
    placeLanternPickup(s,player,canPlace);
  }
  let gained = 0;
  for (const p of [...s.pickups]) if (Math.hypot(p.x-player.x,p.y-player.y)<LANTERN_CONFIG.pickupCollectRadius && canCollect(p)) gained += collectLanternPickup(s,p.id);
  return gained;
}
