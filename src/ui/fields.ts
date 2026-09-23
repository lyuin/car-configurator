import type { DimensionKey } from '../domain/types';

export interface DimensionFieldConfig {
  readonly key: DimensionKey;
  readonly label: string;
  /** スライダーの下限 (mm) */
  readonly min: number;
  /** スライダーの上限 (mm) */
  readonly max: number;
  /** 刻み (mm) */
  readonly step: number;
}

/**
 * スライダーの範囲は実在する車の幅に少し余裕を持たせた値。
 * 超小型モビリティ（全長 2500 程度）からフルサイズピックアップ（6300 程度）までを想定。
 */
export const DIMENSION_FIELDS: readonly DimensionFieldConfig[] = [
  { key: 'length', label: '全長', min: 2000, max: 6500, step: 5 },
  { key: 'width', label: '全幅', min: 1200, max: 2300, step: 5 },
  { key: 'height', label: '全高', min: 1000, max: 2800, step: 5 },
  { key: 'wheelbase', label: 'ホイールベース', min: 1500, max: 4300, step: 5 },
  { key: 'frontOverhang', label: 'フロントオーバーハング', min: 200, max: 1600, step: 5 },
  { key: 'rearOverhang', label: 'リアオーバーハング', min: 200, max: 2300, step: 5 },
  { key: 'trackFront', label: 'フロントトレッド', min: 1000, max: 2100, step: 5 },
  { key: 'trackRear', label: 'リアトレッド', min: 1000, max: 2100, step: 5 },
  { key: 'groundClearance', label: '最低地上高', min: 80, max: 400, step: 5 },
];

/** 主要寸法（パネルの先頭にまとめる項目） */
export const PRIMARY_KEYS: readonly DimensionKey[] = [
  'length',
  'width',
  'height',
  'wheelbase',
  'frontOverhang',
];

export const DOOR_OPTIONS: readonly number[] = [2, 3, 4, 5];

/** スライダーに渡す値。範囲外の解決値でも React の警告を出さないよう丸める */
export function clampToField(config: DimensionFieldConfig, value: number): number {
  return Math.min(Math.max(value, config.min), config.max);
}
