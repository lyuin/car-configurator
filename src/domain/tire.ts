import type { ParseResult, TireSpec } from './types';

/** 1 inch = 25.4 mm */
export const MM_PER_INCH = 25.4;

/** 受け付ける値の範囲。実在するタイヤから大きく外れた入力を弾くためのガード */
const LIMITS = {
  width: { min: 100, max: 400 },
  aspectRatio: { min: 15, max: 95 },
  rimDiameterInch: { min: 10, max: 30 },
} as const;

/**
 * タイヤ規格表記のパターン。
 *
 * - `P` / `LT` などのサービスプレフィックスは読み捨てる
 * - `225/55R18` `225/55 R18` `245/35ZR20` を受け付ける
 * - リム径の 0.5 刻み（`14.5` など）も受け付ける
 * - 末尾のロードインデックスと速度記号（`95V`）は読み捨てる
 */
const TIRE_PATTERN = /^(?:P|LT|ST)?\s*(\d{2,3})\s*\/\s*(\d{1,3})\s*(?:Z)?R\s*(\d{2}(?:\.5)?)\b/i;

/**
 * タイヤ外径を求める。
 *
 * 外径 = リム径(mm) + サイドウォール高 × 2
 * サイドウォール高 = タイヤ幅 × 扁平率 / 100
 */
export function tireOuterDiameter(
  width: number,
  aspectRatio: number,
  rimDiameterInch: number,
): number {
  return rimDiameterInch * MM_PER_INCH + 2 * ((width * aspectRatio) / 100);
}

/** `TireSpec` を正規化した表記に戻す */
export function formatTireSpec(spec: TireSpec): string {
  return `${spec.width}/${spec.aspectRatio}R${spec.rimDiameterInch}`;
}

/**
 * タイヤ規格表記を解析する。
 *
 * 入力は NFKC 正規化してから解析するため、iPad の日本語キーボードで
 * 全角になった `２２５／５５Ｒ１８` も受け付ける。
 */
export function parseTireSpec(input: string): ParseResult<TireSpec> {
  const normalized = input.normalize('NFKC').trim();

  if (normalized === '') {
    return { ok: false, error: 'タイヤサイズを入力してください' };
  }

  const matched = TIRE_PATTERN.exec(normalized);
  if (!matched) {
    return {
      ok: false,
      error: 'タイヤサイズは 225/55R18 の形式で入力してください',
    };
  }

  // 正規表現がマッチした時点で 3 つのキャプチャグループは必ず存在する
  const width = Number(matched[1]);
  const aspectRatio = Number(matched[2]);
  const rimDiameterInch = Number(matched[3]);

  const rangeError =
    checkRange('タイヤ幅', width, LIMITS.width, 'mm') ??
    checkRange('扁平率', aspectRatio, LIMITS.aspectRatio, '%') ??
    checkRange('リム径', rimDiameterInch, LIMITS.rimDiameterInch, 'inch');

  if (rangeError) {
    return { ok: false, error: rangeError };
  }

  const sidewallHeight = (width * aspectRatio) / 100;

  return {
    ok: true,
    value: {
      notation: `${width}/${aspectRatio}R${rimDiameterInch}`,
      width,
      aspectRatio,
      rimDiameterInch,
      rimDiameter: rimDiameterInch * MM_PER_INCH,
      sidewallHeight,
      outerDiameter: tireOuterDiameter(width, aspectRatio, rimDiameterInch),
    },
  };
}

function checkRange(
  label: string,
  value: number,
  limit: { min: number; max: number },
  unit: string,
): string | null {
  if (value < limit.min || value > limit.max) {
    return `${label}は ${limit.min}〜${limit.max}${unit} の範囲で入力してください（入力値: ${value}${unit}）`;
  }
  return null;
}
