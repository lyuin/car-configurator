import {
  buildDimensions,
  buildGrid,
  buildView,
  DIMENSION_PADDING,
  expandBounds,
  unifiedViewExtent,
} from './geometry';
import type { Bounds, Shape, ViewKind } from './geometry';
import type { ResolvedSpec } from './types';

/**
 * 図の組み立て。1台のときも2台比較のときも同じ関数が扱う。
 *
 * 描画は「レイヤー」の配列として返す。1枚の SVG に2台を描くため、
 * 色分けと位置合わせをレイヤー単位の `<g>` で行う。`Shape` に色や
 * オフセットを持たせると型が汚れるうえ、位置合わせのたびにパス文字列を
 * 書き換えることになる。
 */

/** 2台を並べる方法 */
export type CompareMode = 'sideBySide' | 'overlay';

/** オーバーレイで2台を揃える基準点 */
export type OverlayOrigin = 'front' | 'axle' | 'center';

export const OVERLAY_ORIGINS: readonly OverlayOrigin[] = ['front', 'axle', 'center'];

export const OVERLAY_ORIGIN_LABELS: Record<OverlayOrigin, string> = {
  front: 'フロントバンパー',
  axle: '前輪中心',
  center: '車体中央',
};

export const COMPARE_MODE_LABELS: Record<CompareMode, string> = {
  sideBySide: '並置',
  overlay: '重ね',
};

export interface SceneLayer {
  readonly id: 'grid' | 'a' | 'b' | 'dimensions';
  /** 線の色を切り替えるための識別子 */
  readonly variant?: 'a' | 'b';
  readonly offsetX: number;
  readonly offsetY: number;
  readonly shapes: readonly Shape[];
}

export interface Scene {
  readonly layers: readonly SceneLayer[];
  readonly bounds: Bounds;
}

export interface SceneInput {
  readonly a: ResolvedSpec;
  /** 未指定なら1台表示 */
  readonly b?: ResolvedSpec | undefined;
  readonly view: ViewKind;
  readonly compare: CompareMode;
  readonly origin: OverlayOrigin;
  /** 寸法線を描く対象。編集中の車に合わせる */
  readonly active: 'a' | 'b';
  readonly showGrid: boolean;
  readonly showDimensions: boolean;
}

/** 並置したときの2台の間隔 (mm) */
const GAP = 600;

export function buildScene(input: SceneInput): Scene {
  const { a, b, view, compare, origin, active, showGrid, showDimensions } = input;

  const viewA = buildView(a, view);
  const viewB = b !== undefined ? buildView(b, view) : undefined;

  const placement = placeCars({ a, b, view, compare, origin, boundsA: viewA.bounds, boundsB: viewB?.bounds });

  // 2台分を含む範囲を求めてから、縮尺統一と寸法線の余白を適用する
  let bounds = shiftBounds(viewA.bounds, placement.a.x, placement.a.y);
  if (viewB !== undefined) {
    bounds = unionBounds(bounds, shiftBounds(viewB.bounds, placement.b.x, placement.b.y));
  }

  const extent = extentFor(a, b);
  bounds = expandBounds(
    bounds,
    showDimensions
      ? {
          width: extent.width * DIMENSION_PADDING.width,
          height: extent.height * DIMENSION_PADDING.height,
        }
      : extent,
  );

  const layers: SceneLayer[] = [];

  if (showGrid) {
    layers.push({ id: 'grid', offsetX: 0, offsetY: 0, shapes: buildGrid(bounds) });
  }

  layers.push({
    id: 'a',
    variant: 'a',
    offsetX: placement.a.x,
    offsetY: placement.a.y,
    shapes: viewA.shapes,
  });

  if (viewB !== undefined) {
    layers.push({
      id: 'b',
      variant: 'b',
      offsetX: placement.b.x,
      offsetY: placement.b.y,
      shapes: viewB.shapes,
    });
  }

  if (showDimensions) {
    // 寸法線は編集中の車の分だけ描く。2台分出すと線が倍になって読めない。
    // 数値はスペック表が差分付きで持つ。
    const target = active === 'b' && b !== undefined ? b : a;
    const offset = active === 'b' && b !== undefined ? placement.b : placement.a;
    layers.push({
      id: 'dimensions',
      offsetX: offset.x,
      offsetY: offset.y,
      // レイヤー側でずらすので、寸法線はその車のローカル座標で組み立てる
      shapes: buildDimensions(target, view, shiftBounds(bounds, -offset.x, -offset.y)),
    });
  }

  return { layers, bounds };
}

interface Offset {
  readonly x: number;
  readonly y: number;
}

/**
 * 2台の配置を決める。
 *
 * 並置では側面図・上面図を上下に積んで前端を揃える。車は横に長いので
 * 左右に並べると小さくなるうえ、上下に積んで前端を揃えた方が全長の差が
 * 直接読める。正面図は左右に並べる。
 */
function placeCars(params: {
  readonly a: ResolvedSpec;
  readonly b: ResolvedSpec | undefined;
  readonly view: ViewKind;
  readonly compare: CompareMode;
  readonly origin: OverlayOrigin;
  readonly boundsA: Bounds;
  readonly boundsB: Bounds | undefined;
}): { readonly a: Offset; readonly b: Offset } {
  const { a, b, view, compare, origin, boundsA, boundsB } = params;
  const none = { x: 0, y: 0 } as const;

  if (b === undefined || boundsB === undefined) {
    return { a: none, b: none };
  }

  if (compare === 'overlay') {
    if (view === 'front') {
      // 正面図は x が中心線なので基準点の選択は効かない。中心線と地面で揃う
      return { a: none, b: none };
    }
    return { a: none, b: { x: originX(a, origin) - originX(b, origin), y: 0 } };
  }

  if (view === 'front') {
    // 左右に並べる。それぞれの中心を間隔ぶん離す
    const halfA = (boundsA.maxX - boundsA.minX) / 2;
    const halfB = (boundsB.maxX - boundsB.minX) / 2;
    return {
      a: { x: -(halfA + GAP / 2), y: 0 },
      b: { x: halfB + GAP / 2, y: 0 },
    };
  }

  // 上下に積む。y は上方向が負なので、B を下（正の方向）に置く
  const heightA = boundsA.maxY - boundsA.minY;
  return { a: none, b: { x: 0, y: heightA + GAP } };
}

/** 基準点の x 座標 */
function originX(spec: ResolvedSpec, origin: OverlayOrigin): number {
  switch (origin) {
    case 'front':
      return 0;
    case 'axle':
      return spec.frontOverhang;
    case 'center':
      return spec.length / 2;
  }
}

/** 縮尺統一に使う広がり。2台あるときは大きい方に合わせる */
function extentFor(
  a: ResolvedSpec,
  b: ResolvedSpec | undefined,
): { width: number; height: number } {
  const extentA = unifiedViewExtent(a);
  if (b === undefined) {
    return extentA;
  }
  const extentB = unifiedViewExtent(b);
  return {
    width: Math.max(extentA.width, extentB.width),
    height: Math.max(extentA.height, extentB.height),
  };
}

export function shiftBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy,
  };
}

export function unionBounds(first: Bounds, second: Bounds): Bounds {
  return {
    minX: Math.min(first.minX, second.minX),
    minY: Math.min(first.minY, second.minY),
    maxX: Math.max(first.maxX, second.maxX),
    maxY: Math.max(first.maxY, second.maxY),
  };
}
