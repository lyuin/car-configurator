import type { CarInput, DimensionKey, Silhouette, SpecFieldKey } from '../domain/types';

/**
 * 入力状態の更新をここに集約する。
 *
 * ロックは「`CarInput` に値があるかどうか」で表現するため、
 * 値の更新とロックは常に同じ操作になる。将来の図のドラッグ操作も
 * `setDimension` を呼ぶだけで「寸法が変わり、同時にロックされる」が成立する。
 */

/** 寸法を更新し、同時にその項目をロックする */
export function setDimension(input: CarInput, key: DimensionKey, value: number): CarInput {
  return { ...input, [key]: value };
}

/** タイヤ規格表記を更新し、同時にロックする */
export function setTire(input: CarInput, notation: string): CarInput {
  return { ...input, tire: notation };
}

/** ドア数を更新し、同時にロックする */
export function setDoors(input: CarInput, doors: number): CarInput {
  return { ...input, doors };
}

/**
 * ロックを解除して自動補完に戻す。
 * フィールドを削除することがロック解除に対応する。
 */
export function unlockField(input: CarInput, key: SpecFieldKey): CarInput {
  const next = { ...input };
  delete next[key];
  return next;
}

/**
 * シルエットを変更する。ロック済みの項目は保持され、
 * 推定値だけが新しいシルエットの比率で再計算される。
 */
export function setSilhouette(input: CarInput, silhouette: Silhouette): CarInput {
  return { ...input, silhouette };
}

export function setName(input: CarInput, name: string): CarInput {
  if (name === '') {
    const next = { ...input };
    delete next.name;
    return next;
  }
  return { ...input, name };
}

/** その項目がロックされている（明示指定されている）か */
export function isLocked(input: CarInput, key: SpecFieldKey): boolean {
  return input[key] !== undefined;
}

/** ロックされている項目の数。UI で「いくつ自分で決めたか」を出すのに使う */
export function lockedCount(input: CarInput): number {
  return LOCKABLE_KEYS.filter((key) => isLocked(input, key)).length;
}

/** すべてのロックを解除して推定のみの状態に戻す */
export function unlockAll(input: CarInput): CarInput {
  return LOCKABLE_KEYS.reduce((acc, key) => unlockField(acc, key), input);
}

const LOCKABLE_KEYS: readonly SpecFieldKey[] = [
  'length',
  'width',
  'height',
  'wheelbase',
  'frontOverhang',
  'rearOverhang',
  'trackFront',
  'trackRear',
  'groundClearance',
  'tire',
  'doors',
];
