import { findPreset } from '../domain/presets';
import { parseTireSpec } from '../domain/tire';
import { SILHOUETTES, DIMENSION_KEYS } from '../domain/types';
import { VIEW_KINDS } from '../domain/geometry';
import type { CarInput, DimensionKey, Silhouette } from '../domain/types';
import type { ViewKind } from '../domain/geometry';

/**
 * URL のハッシュに状態を保存する。
 *
 * 明示指定された項目だけを載せるので、推定値は URL に入らない。
 * その結果 URL が短くなり、後で比率テーブルを改善したときに
 * 既存の URL も新しい推定へ追従する。
 *
 * 例: `#s1&v=front&d=1&a=sil:suv,L:4600,wb:2700,t:225/55R19`
 */

/** スキーマ版。形式を変えるときに上げる */
export const SCHEMA_VERSION = 's1';

export interface AppState {
  readonly car: CarInput;
  readonly view: ViewKind;
  readonly showGrid: boolean;
  readonly showDimensions: boolean;
  /** 読み込んでいるプリセットの ID。各項目が車種由来かの判定に使う */
  readonly presetId?: string;
}

export const DEFAULT_STATE: AppState = {
  car: { silhouette: 'suv' },
  view: 'side',
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
  if (state.presetId !== undefined) {
    parts.push(`p=${state.presetId}`);
  }

  parts.push(`a=${encodeCar(state.car)}`);

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
  let car = DEFAULT_STATE.car;
  let presetId: string | undefined;

  for (const token of tokens.slice(1)) {
    const separator = token.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);

    switch (key) {
      case 'v': {
        if (isViewKind(value)) {
          view = value;
        }
        break;
      }
      case 'g':
        showGrid = value === '1';
        break;
      case 'd':
        showDimensions = value === '1';
        break;
      case 'p':
        // 存在しないプリセット ID は無視する
        if (findPreset(value) !== undefined) {
          presetId = value;
        }
        break;
      case 'a':
        car = decodeCar(value);
        break;
      default:
        // 未知のキーは無視する（将来の形式追加に備える）
        break;
    }
  }

  return {
    car,
    view,
    showGrid,
    showDimensions,
    ...(presetId !== undefined ? { presetId } : {}),
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
    silhouette: DEFAULT_STATE.car.silhouette,
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
