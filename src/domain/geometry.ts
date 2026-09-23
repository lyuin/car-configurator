import { SIDE_PROFILES } from './profiles';
import type { ResolvedSpec } from './types';

/**
 * 図形の座標系（すべて mm）
 *
 * - x: 車の前端バンパーを 0 として後方へ正
 * - y: 地面を 0 として上方向へ負
 *
 * y を負にしておくと SVG のデフォルト（y は下向き）とそのまま噛み合うため、
 * グループ変換での上下反転が不要になり、寸法線の文字も鏡像にならない。
 */
export type Point = readonly [x: number, y: number];

/** 描画要素の役割。スタイル（線の太さ・色）はこの役割ごとに CSS で決める */
export type ShapeRole = 'body' | 'glass' | 'tire' | 'rim' | 'detail' | 'ground';

export type Shape =
  | { readonly kind: 'path'; readonly role: ShapeRole; readonly d: string }
  | {
      readonly kind: 'circle';
      readonly role: ShapeRole;
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    };

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** 寸法線（Task 7）とドラッグハンドル（将来）が参照する基準点 */
export interface SideViewAnchors {
  /** 前輪中心の x */
  readonly frontAxleX: number;
  /** 後輪中心の x */
  readonly rearAxleX: number;
  readonly tireRadius: number;
  /** ルーフの y（負値） */
  readonly roofY: number;
  /** サイドシル下端の y（負値） */
  readonly sillY: number;
}

export interface SideViewGeometry {
  readonly shapes: readonly Shape[];
  readonly bounds: Bounds;
  readonly anchors: SideViewAnchors;
}

/** ホイールアーチの半径。タイヤ半径に対する比。プロファイルで上書きできる */
const DEFAULT_ARCH_RATIO = 1.12;

/** 地面線をタイヤの前後にどれだけ延ばすか (mm) */
const GROUND_EXTENSION = 150;

/**
 * 目に見えるサイドシル（ロッカーパネル）の高さを求める係数。
 *
 * 最低地上高は床下の最小隙間であって、側面から見えるシルの高さではない。
 * 最低地上高をそのままシル高に使うと車体が極端に低い板になり、
 * タイヤが車体を突き抜けて見える。実車のシル高は 350〜450mm 程度。
 *
 * 最低地上高に全高比を加える形にすることで、リフトした SUV ではシルも
 * 高い位置に来るという関係を保つ。
 */
const SILL_RISE_RATIO = 0.165;

/** 側面から見えるサイドシルの地上高 (mm) */
export function sillHeight(spec: Pick<ResolvedSpec, 'groundClearance' | 'height'>): number {
  return spec.groundClearance + spec.height * SILL_RISE_RATIO;
}

/**
 * 側面図を組み立てる。
 *
 * 形状はシルエット別のプロファイル（全長比・全高比の点列）から作る。
 * 名前付きパラメータを並べるより、見た目を確認しながら数値を調整しやすい。
 */
export function buildSideView(spec: ResolvedSpec): SideViewGeometry {
  const profile = SIDE_PROFILES[spec.silhouette];
  const { length, height } = spec;

  const sillY = -sillHeight(spec);
  const roofY = -height;
  const tireRadius = spec.tire.outerDiameter / 2;
  const rimRadius = spec.tire.rimDiameter / 2;
  const frontAxleX = spec.frontOverhang;
  const rearAxleX = spec.frontOverhang + spec.wheelbase;
  const archRadius = tireRadius * (profile.archRatio ?? DEFAULT_ARCH_RATIO);

  // プロファイルの比率を mm に展開する
  const toPoint = ([xRatio, yRatio]: Point): Point => [xRatio * length, -yRatio * height];
  const upper = profile.upper.map(toPoint);
  const greenhouse = profile.greenhouse.map(toPoint);

  const shapes: Shape[] = [];

  // 地面
  shapes.push({
    kind: 'path',
    role: 'ground',
    d: linePath([-GROUND_EXTENSION, 0], [length + GROUND_EXTENSION, 0]),
  });

  // 車体の輪郭。前端のフェイスから上面をたどり、後端のフェイスで下りる
  shapes.push({
    kind: 'path',
    role: 'body',
    d: polylinePath([[0, sillY], ...upper, [length, sillY]]),
  });

  // 下面。ホイールアーチと重ならないよう区間を分けて引く
  for (const [from, to] of horizontalSegments(
    length,
    sillY,
    archRadius,
    tireRadius,
    frontAxleX,
    rearAxleX,
  )) {
    shapes.push({ kind: 'path', role: 'body', d: linePath([from, sillY], [to, sillY]) });
  }

  // 下部クラッディング。SUV・ピックアップの識別に効く
  if (profile.claddingY !== undefined) {
    const claddingY = -profile.claddingY * height;
    for (const [from, to] of horizontalSegments(
      length,
      claddingY,
      archRadius,
      tireRadius,
      frontAxleX,
      rearAxleX,
    )) {
      shapes.push({ kind: 'path', role: 'detail', d: linePath([from, claddingY], [to, claddingY]) });
    }
  }

  // ホイールアーチ
  for (const axleX of [frontAxleX, rearAxleX]) {
    shapes.push({ kind: 'path', role: 'body', d: archPath(axleX, archRadius, tireRadius, sillY) });
  }

  // タイヤとリム
  for (const axleX of [frontAxleX, rearAxleX]) {
    shapes.push({ kind: 'circle', role: 'tire', cx: axleX, cy: -tireRadius, r: tireRadius });
    shapes.push({ kind: 'circle', role: 'rim', cx: axleX, cy: -tireRadius, r: rimRadius });
  }

  // グリーンハウス（窓まわり）
  shapes.push({ kind: 'path', role: 'glass', d: closedPolylinePath(greenhouse) });

  // ドア分割線。ベルトラインからサイドシルまで
  const beltlineY = -profile.beltline * height;
  for (const xRatio of profile.doorLines) {
    shapes.push({
      kind: 'path',
      role: 'detail',
      d: linePath([xRatio * length, beltlineY], [xRatio * length, sillY]),
    });
  }

  return {
    shapes,
    bounds: {
      minX: -GROUND_EXTENSION,
      // 全高よりタイヤが高い異常な入力でも図が切れないようにする
      minY: Math.min(roofY, -tireRadius * 2),
      maxX: length + GROUND_EXTENSION,
      maxY: 0,
    },
    anchors: { frontAxleX, rearAxleX, tireRadius, roofY, sillY },
  };
}

/**
 * 指定した高さで水平線を引く区間を求める。ホイールアーチと交わる範囲は除く。
 * 下面とクラッディングの両方で使う。
 */
function horizontalSegments(
  length: number,
  y: number,
  archRadius: number,
  tireRadius: number,
  frontAxleX: number,
  rearAxleX: number,
): readonly (readonly [number, number])[] {
  const halfWidth = archHalfWidth(archRadius, tireRadius, y);
  const segments: (readonly [number, number])[] = [
    [0, frontAxleX - halfWidth],
    [frontAxleX + halfWidth, rearAxleX - halfWidth],
    [rearAxleX + halfWidth, length],
  ];

  // 区間が潰れている場合（アーチが車体端に達している等）は描かない
  return segments.filter(([from, to]) => to - from > 1);
}

/** ホイールアーチが指定した高さで持つ半幅 */
function archHalfWidth(archRadius: number, tireRadius: number, y: number): number {
  const dy = Math.abs(y - -tireRadius);
  if (dy >= archRadius) {
    // 指定高さがアーチの範囲外の場合は半円として扱う
    return archRadius;
  }
  return Math.sqrt(archRadius * archRadius - dy * dy);
}

/**
 * ホイールアーチの円弧。
 *
 * タイヤ中心を中心とする円のうちサイドシルより上の部分を描く。
 * sweep=1 は画面上で時計回り、つまり左端から右端へ上side を通る向き。
 */
function archPath(
  axleX: number,
  archRadius: number,
  tireRadius: number,
  sillY: number,
): string {
  const halfWidth = archHalfWidth(archRadius, tireRadius, sillY);
  const left: Point = [axleX - halfWidth, sillY];
  const right: Point = [axleX + halfWidth, sillY];

  return `M ${fmt(left[0])} ${fmt(left[1])} A ${fmt(archRadius)} ${fmt(archRadius)} 0 ${archLargeArcFlag(tireRadius, sillY)} 1 ${fmt(right[0])} ${fmt(right[1])}`;
}

/**
 * 上側の円弧を選ぶための large-arc フラグ。
 *
 * 弦（サイドシル）が車軸中心より下にあるときは上側の円弧が優角になるため 1、
 * 上にあるときは劣角になるため 0。シル高を最低地上高から独立させた結果
 * 後者が通常になり、1 固定だとアーチがタイヤの下側を回ってしまう。
 */
function archLargeArcFlag(tireRadius: number, sillY: number): 0 | 1 {
  return sillY > -tireRadius ? 1 : 0;
}

function linePath(from: Point, to: Point): string {
  return `M ${fmt(from[0])} ${fmt(from[1])} L ${fmt(to[0])} ${fmt(to[1])}`;
}

function polylinePath(points: readonly Point[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`)
    .join(' ');
}

function closedPolylinePath(points: readonly Point[]): string {
  return `${polylinePath(points)} Z`;
}

/** パス文字列の桁を抑える。スナップショットを安定させる意図もある */
function fmt(value: number): string {
  return Number(value.toFixed(1)).toString();
}
