import { sillHeight } from './geometry';
import { SILHOUETTE_LABELS } from './types';
import type { ResolvedSpec } from './types';

/**
 * スペック比較表の行。
 *
 * 数値の項目は差分（B − A）を持つ。シルエットやタイヤ表記のような
 * 文字の項目は差分を持たず、値が違うかどうかだけを示す。
 */
export interface SpecRow {
  readonly label: string;
  readonly a: string;
  readonly b?: string;
  /** B − A (mm)。数値の項目のみ */
  readonly diff?: number;
  /** 文字の項目で値が異なるか */
  readonly differs?: boolean;
}

export function buildSpecRows(a: ResolvedSpec, b?: ResolvedSpec): readonly SpecRow[] {
  const rows: SpecRow[] = [];

  const text = (label: string, pick: (spec: ResolvedSpec) => string) => {
    const valueA = pick(a);
    const valueB = b !== undefined ? pick(b) : undefined;
    rows.push({
      label,
      a: valueA,
      ...(valueB !== undefined ? { b: valueB, differs: valueA !== valueB } : {}),
    });
  };

  const number = (label: string, pick: (spec: ResolvedSpec) => number) => {
    const valueA = pick(a);
    const valueB = b !== undefined ? pick(b) : undefined;
    rows.push({
      label,
      a: formatMm(valueA),
      ...(valueB !== undefined
        ? { b: formatMm(valueB), diff: Math.round(valueB - valueA) }
        : {}),
    });
  };

  text('シルエット', (spec) => SILHOUETTE_LABELS[spec.silhouette]);
  number('全長', (spec) => spec.length);
  number('全幅', (spec) => spec.width);
  number('全高', (spec) => spec.height);
  number('ホイールベース', (spec) => spec.wheelbase);
  number('フロントオーバーハング', (spec) => spec.frontOverhang);
  number('リアオーバーハング', (spec) => spec.rearOverhang);
  number('フロントトレッド', (spec) => spec.trackFront);
  number('リアトレッド', (spec) => spec.trackRear);
  number('最低地上高', (spec) => spec.groundClearance);
  number('サイドシル高', (spec) => Math.round(sillHeight(spec)));
  text('タイヤ', (spec) => spec.tire.notation);
  number('タイヤ外径', (spec) => Math.round(spec.tire.outerDiameter));
  text('ドア数', (spec) => `${spec.doors}`);

  return rows;
}

function formatMm(value: number): string {
  return `${Math.round(value).toLocaleString('ja-JP')} mm`;
}

/** 差分の表示文字列。プラスにも符号を付けて向きが分かるようにする */
export function formatDiff(diff: number): string {
  if (diff === 0) {
    return '±0';
  }
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString('ja-JP')}`;
}
