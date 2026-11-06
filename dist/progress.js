// A chapter bookmark, never an in-combat snapshot. Old or malformed data is ignored.
export const CHECKPOINT_KEY = 'lingshan-checkpoint';
const chapters = new Set(['tutorial','journey','guardian','ascent','spirit','moonwood','emberpass','stoneking']);
export function validateCheckpoint(value) {
  if (!value || value.version !== 1 || !chapters.has(value.stage)) return null;
  if (!Number.isFinite(value.time) || value.time < 0 || value.time > 604800) return null;
  if (!['normal','hard'].includes(value.difficulty) || typeof value.practice !== 'boolean') return null;
  return {version:1,stage:value.stage,time:value.time,difficulty:value.difficulty,practice:value.practice,
    hits:Number.isSafeInteger(value.hits)&&value.hits>=0?value.hits:0,
    damage:Number.isFinite(value.damage)&&value.damage>=0?value.damage:0};
}
export function readCheckpoint(storage) {
  try { return validateCheckpoint(JSON.parse(storage.getItem(CHECKPOINT_KEY))); } catch { return null; }
}
export function writeCheckpoint(storage, value) {
  const valid=validateCheckpoint(value);
  if (!valid) return false;
  try { storage.setItem(CHECKPOINT_KEY, JSON.stringify(valid)); return true; } catch { return false; }
}
export function removeCheckpoint(storage) {
  try { storage.removeItem(CHECKPOINT_KEY); return true; } catch { return false; }
}
