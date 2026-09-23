import { findPreset } from '../domain/presets';
import { OVERLAY_ORIGINS } from '../domain/scene';
import { parseTireSpec } from '../domain/tire';
import { SILHOUETTES, DIMENSION_KEYS } from '../domain/types';
import { VIEW_KINDS } from '../domain/geometry';
import type { CompareMode, OverlayOrigin } from '../domain/scene';
import type { CarInput, DimensionKey, Silhouette } from '../domain/types';
import type { ViewKind } from '../domain/geometry';

/**
 * URL のハッシュに状態を保存する。
 *
 * 明示指定された項目だけを載せるので、推定値は URL に入らない。
 * その結果 URL が短くなり、後で比率テーブルを改善したときに
 * 既存の URL も新しい推定へ追従する。
 *
 * 例: `#s1&v=front&d=1&p=mazda-cx-5&a=sil:suv,L:4575&b=sil:sedan,L:4885`
 *
 * 2台比較の追加時も版は上げていない。`b=` などのキーを足しただけで、
 * 1台だけの既存 URL はそのまま読める（`b` が無ければ比較オフ）。
 */

/** スキーマ版。形式を壊す変更をするときに上げる */
export const SCHEMA_VERSION = 's1';

export interface CarState {
  readonly car: CarInput;
  /** 読み込んでいるプリセットの ID。各項目が車種由来かの判定に使う */
  readonly presetId?: string;
}

export interface AppState {
  readonly a: CarState;
  /** 未設定なら比較オフ */
  readonly b?: CarState;
  /** 編集中の車。寸法線を描く対象でもある */
  readonly active: 'a' | 'b';
  readonly view: ViewKind;
  readonly compare: CompareMode;
  readonly origin: OverlayOrigin;
  readonly showGrid: boolean;
  readonly showDimensions: boolean;
}

export const DEFAULT_STATE: AppState = {
  a: { car: { silhouette: 'suv' } },
  active: 'a',
  view: 'side',
  compare: 'overlay',
  origin: 'front',
  showGrid: true,
  showDimensions: false,
};

/** 寸法項目の短縮キー。URL を短く保つ */
const DIMENSION_CODES: Record<DimensionKey, string> = {
  length: 'L',
  width: 'W',
  height: 'H',
  wheelbase: 'wb',
  frontOverhang: 'fo',
  rearOverhang: 'ro',
  trackFront: 'tf',
  trackRear: 'tr',
  groundClearance: 'gc',
};

const DIMENSION_BY_CODE = new Map<string, DimensionKey>(
  DIMENSION_KEYS.map((key) => [DIMENSION_CODES[key], key]),
);

/** 寸法として受け付ける範囲 (mm)。これを外れた値は無視する */
const DIMENSION_LIMIT = { min: 1, max: 20000 } as const;
const DOORS_LIMIT = { min: 1, max: 8 } as const;

const COMPARE_CODES: Record<CompareMode, string> = {
  overlay: 'ov',
  sideBySide: 'sbs',
};

export function encodeState(state: AppState): string {
  const parts: string[] = [SCHEMA_VERSION];

  // 既定値と同じ項目は省略して URL を短くする
  if (state.view !== DEFAULT_STATE.view) {
    parts.push(`v=${state.view}`);
  }
  if (state.showGrid !== DEFAULT_STATE.showGrid) {
    parts.push(`g=${state.showGrid ? 1 : 0}`);
  }
  if (state.showDimensions !== DEFAULT_STATE.showDimensions) {
    parts.push(`d=${state.showDimensions ? 1 : 0}`);
  }

  // 比較に関する設定は2台目があるときだけ意味を持つ
  if (state.b !== undefined) {
    if (state.compare !== DEFAULT_STATE.compare) {
      parts.push(`m=${COMPARE_CODES[state.compare]}`);
    }
    if (state.origin !== DEFAULT_STATE.origin) {
      parts.push(`o=${state.origin}`);
    }
    if (state.active !== DEFAULT_STATE.active) {
      parts.push(`act=${state.active}`);
    }
  }

  if (state.a.presetId !== undefined) {
    parts.push(`p=${state.a.presetId}`);
  }
  parts.push(`a=${encodeCar(state.a.car)}`);

  if (state.b !== undefined) {
    if (state.b.presetId !== undefined) {
      parts.push(`pb=${state.b.presetId}`);
    }
    parts.push(`b=${encodeCar(state.b.car)}`);
  }

  return parts.join('&');
}

export function decodeState(hash: string): AppState {
  const body = hash.replace(/^#/, '');
  const tokens = body.split('&').filter((token) => token !== '');

  // 版が合わなければ既定値に戻す。共有された URL が壊れていても必ず何か表示する
  if (tokens[0] !== SCHEMA_VERSION) {
    return DEFAULT_STATE;
  }

  let view = DEFAULT_STATE.view;
  let showGrid = DEFAULT_STATE.showGrid;
  let showDimensions = DEFAULT_STATE.showDimensions;
  let compare = DEFAULT_STATE.compare;
  let origin = DEFAULT_STATE.origin;
  let active = DEFAULT_STATE.active;
  let carA = DEFAULT_STATE.a.car;
  let carB: CarInput | undefined;
  let presetA: string | undefined;
  let presetB: string | undefined;

  for (const token of tokens.slice(1)) {
    const separator = token.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);

    switch (key) {
      case 'v':
        if (isViewKind(value)) {
          view = value;
        }
        break;
      case 'g':
        showGrid = value === '1';
        break;
      case 'd':
        showDimensions = value === '1';
        break;
      case 'm':
        if (value === 'sbs') {
          compare = 'sideBySide';
        } else if (value === 'ov') {
          compare = 'overlay';
        }
        break;
      case 'o':
        if (isOverlayOrigin(value)) {
          origin = value;
        }
        break;
      case 'act':
        if (value === 'a' || value === 'b') {
          active = value;
        }
        break;
      case 'p':
        // 存在しないプリセット ID は無視する
        if (findPreset(value) !== undefined) {
          presetA = value;
        }
        break;
      case 'pb':
        if (findPreset(value) !== undefined) {
          presetB = value;
        }
        break;
      case 'a':
        carA = decodeCar(value);
        break;
      case 'b':
        carB = decodeCar(value);
        break;
      default:
        // 未知のキーは無視する（将来の形式追加に備える）
        break;
    }
  }

  // 2台目が無いのに active=b だと編集先が消える
  if (carB === undefined) {
    active = 'a';
  }

  return {
    a: { car: carA, ...(presetA !== undefined ? { presetId: presetA } : {}) },
    ...(carB !== undefined
      ? { b: { car: carB, ...(presetB !== undefined ? { presetId: presetB } : {}) } }
      : {}),
    active,
    view,
    compare,
    origin,
    showGrid,
    showDimensions,
  };
}

function encodeCar(car: CarInput): string {
  const fields: string[] = [`sil:${car.silhouette}`];

  for (const key of DIMENSION_KEYS) {
    const value = car[key];
    if (value !== undefined) {
      fields.push(`${DIMENSION_CODES[key]}:${value}`);
    }
  }
  if (car.tire !== undefined) {
    fields.push(`t:${escapeValue(car.tire)}`);
  }
  if (car.doors !== undefined) {
    fields.push(`dr:${car.doors}`);
  }
  if (car.name !== undefined) {
    fields.push(`n:${escapeValue(car.name)}`);
  }

  return fields.join(',');
}

function decodeCar(encoded: string): CarInput {
  const car: {
    silhouette: Silhouette;
    tire?: string;
    doors?: number;
    name?: string;
  } & Partial<Record<DimensionKey, number>> = {
    silhouette: DEFAULT_STATE.a.car.silhouette,
  };

  for (const field of encoded.split(',')) {
    const separator = field.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const code = field.slice(0, separator);
    const raw = field.slice(separator + 1);

    if (code === 'sil') {
      if (isSilhouette(raw)) {
        car.silhouette = raw;
      }
      continue;
    }

    if (code === 't') {
      // 解釈できないタイヤ表記は載せない。壊れた値を共有しても意味がない
      const notation = unescapeValue(raw);
      if (parseTireSpec(notation).ok) {
        car.tire = notation;
      }
      continue;
    }

    if (code === 'dr') {
      const doors = toInteger(raw, DOORS_LIMIT);
      if (doors !== undefined) {
        car.doors = doors;
      }
      continue;
    }

    if (code === 'n') {
      const name = unescapeValue(raw);
      if (name !== '') {
        car.name = name;
      }
      continue;
    }

    const dimension = DIMENSION_BY_CODE.get(code);
    if (dimension !== undefined) {
      const value = toInteger(raw, DIMENSION_LIMIT);
      if (value !== undefined) {
        car[dimension] = value;
      }
    }
  }

  return car;
}

function toInteger(raw: string, limit: { min: number; max: number }): number | undefined {
  if (!/^\d+$/.test(raw)) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
    return undefined;
  }
  return value;
}

function isSilhouette(value: string): value is Silhouette {
  return (SILHOUETTES as readonly string[]).includes(value);
}

function isViewKind(value: string): value is ViewKind {
  return (VIEW_KINDS as readonly string[]).includes(value);
}

function isOverlayOrigin(value: string): value is OverlayOrigin {
  return (OVERLAY_ORIGINS as readonly string[]).includes(value);
}

/** 区切り文字と衝突する文字だけを退避する。`/` はそのまま残して読みやすさを保つ */
function escapeValue(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/&/g, '%26')
    .replace(/,/g, '%2C')
    .replace(/:/g, '%3A')
    .replace(/=/g, '%3D')
    .replace(/ /g, '%20');
}

function unescapeValue(value: string): string {
  return value
    .replace(/%20/gi, ' ')
    .replace(/%3D/gi, '=')
    .replace(/%3A/gi, ':')
    .replace(/%2C/gi, ',')
    .replace(/%26/gi, '&')
    .replace(/%25/gi, '%');
}
