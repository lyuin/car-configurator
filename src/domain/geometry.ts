import { FRONT_PROFILES, SIDE_PROFILES, TOP_PROFILES } from './profiles';
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
export type ShapeRole =
  | 'body'
  | 'glass'
  | 'tire'
  | 'rim'
  | 'detail'
  | 'ground'
  | 'grid'
  | 'dimension'
  | 'label';

export type Shape =
  | { readonly kind: 'path'; readonly role: ShapeRole; readonly d: string }
  | {
      readonly kind: 'circle';
      readonly role: ShapeRole;
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    }
  | {
      readonly kind: 'text';
      readonly role: ShapeRole;
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly anchor: 'start' | 'middle' | 'end';
      /** フォントサイズ (mm)。SVG のテキストは viewBox に合わせて拡大縮小する */
      readonly fontSize: number;
      /** ラベルの回転角（度）。縦方向の寸法で使う */
      readonly rotate?: number;
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

/* ========================================================================
 * 正面図・上面図とビューの共通処理
 * ===================================================================== */

export type ViewKind = 'side' | 'front' | 'top';

export const VIEW_KINDS: readonly ViewKind[] = ['side', 'front', 'top'];

export const VIEW_LABELS: Record<ViewKind, string> = {
  side: '側面',
  front: '正面',
  top: '上面',
};

export interface ViewGeometry {
  readonly shapes: readonly Shape[];
  readonly bounds: Bounds;
}

/** ビューの種類に応じた図形を組み立てる */
export function buildView(spec: ResolvedSpec, kind: ViewKind): ViewGeometry {
  switch (kind) {
    case 'side':
      return buildSideView(spec);
    case 'front':
      return buildFrontView(spec);
    case 'top':
      return buildTopView(spec);
  }
}

/**
 * 正面図。
 *
 * x は車両中心線を 0 として左右、y は地面を 0 として上方向へ負。
 * 中心線を原点にしておくと、比較モードで2台を重ねるときに基準が自然に揃う。
 *
 * タイヤは地面からサイドシルまでの矩形として描く。タイヤ全体を描くと車体の線と
 * 重なって読めなくなるうえ、正面図で意味があるのはトレッドとタイヤ幅だから。
 * タイヤ径は側面図が担う。
 */
export function buildFrontView(spec: ResolvedSpec): ViewGeometry {
  const profile = FRONT_PROFILES[spec.silhouette];
  const sideProfile = SIDE_PROFILES[spec.silhouette];
  const { width, height } = spec;
  const sillY = -sillHeight(spec);
  const halfWidth = width / 2;

  const shapes: Shape[] = [];

  shapes.push({
    kind: 'path',
    role: 'ground',
    d: linePath([-halfWidth - GROUND_EXTENSION, 0], [halfWidth + GROUND_EXTENSION, 0]),
  });

  // 右半分の輪郭。サイドシルの高さから立ち上げる
  const firstHalf = profile.outline[0]?.[0] ?? 0.45;
  const right: Point[] = [
    [firstHalf * width, sillY],
    ...profile.outline.map(([halfRatio, yRatio]): Point => [halfRatio * width, -yRatio * height]),
  ];
  // 中心線でミラーして左半分を作り、閉じる
  const left: Point[] = [...right].reverse().map(([x, y]): Point => [-x, y]);

  shapes.push({ kind: 'path', role: 'body', d: closedPolylinePath([...right, ...left]) });

  // ウインドシールド。側面プロファイルのベルトライン高さで正面輪郭の半幅を補間する
  const glassBottomY = sideProfile.beltline;
  const glassTopY = 0.97;
  const pillarInset = 0.93;
  const glassBottomHalf = interpolateHalf(profile.outline, glassBottomY) * pillarInset * width;
  const glassTopHalf = interpolateHalf(profile.outline, glassTopY) * pillarInset * width;

  shapes.push({
    kind: 'path',
    role: 'glass',
    d: closedPolylinePath([
      [-glassBottomHalf, -glassBottomY * height],
      [-glassTopHalf, -glassTopY * height],
      [glassTopHalf, -glassTopY * height],
      [glassBottomHalf, -glassBottomY * height],
    ]),
  });

  // タイヤ。フロントトレッドの左右に、タイヤ幅の矩形として描く
  for (const sign of [-1, 1]) {
    const center = (sign * spec.trackFront) / 2;
    shapes.push({
      kind: 'path',
      role: 'tire',
      d: closedPolylinePath([
        [center - spec.tire.width / 2, 0],
        [center - spec.tire.width / 2, sillY],
        [center + spec.tire.width / 2, sillY],
        [center + spec.tire.width / 2, 0],
      ]),
    });
  }

  return {
    shapes,
    bounds: {
      minX: -halfWidth - GROUND_EXTENSION,
      minY: -height,
      maxX: halfWidth + GROUND_EXTENSION,
      maxY: 0,
    },
  };
}

/**
 * 上面図。
 *
 * x は前端バンパーを 0 として後方へ（側面図と同じ）、y は車両中心線を 0 として左右。
 * y は高さではないので符号に上下の意味はない。
 */
export function buildTopView(spec: ResolvedSpec): ViewGeometry {
  const profile = TOP_PROFILES[spec.silhouette];
  const sideProfile = SIDE_PROFILES[spec.silhouette];
  const { length, width } = spec;
  const halfWidth = width / 2;

  const shapes: Shape[] = [];

  // 中心線
  shapes.push({
    kind: 'path',
    role: 'ground',
    d: linePath([-GROUND_EXTENSION, 0], [length + GROUND_EXTENSION, 0]),
  });

  const nearSide: Point[] = profile.outline.map(
    ([xRatio, halfRatio]): Point => [xRatio * length, halfRatio * width],
  );
  const farSide: Point[] = [...nearSide].reverse().map(([x, y]): Point => [x, -y]);

  shapes.push({ kind: 'path', role: 'body', d: closedPolylinePath([...nearSide, ...farSide]) });

  // キャビン。側面プロファイルのグリーンハウスの x 範囲をそのまま使う
  const roofFrontX = (sideProfile.greenhouse[1]?.[0] ?? 0.4) * length;
  const roofRearX = (sideProfile.greenhouse[2]?.[0] ?? 0.7) * length;
  const cabinHalf = halfWidth * 0.82;
  const cowlX = (sideProfile.greenhouse[0]?.[0] ?? 0.3) * length;
  const rearGlassX = (sideProfile.greenhouse[3]?.[0] ?? 0.8) * length;

  shapes.push({
    kind: 'path',
    role: 'glass',
    d: closedPolylinePath([
      [cowlX, cabinHalf * 0.92],
      [roofFrontX, cabinHalf],
      [roofRearX, cabinHalf],
      [rearGlassX, cabinHalf * 0.92],
      [rearGlassX, -cabinHalf * 0.92],
      [roofRearX, -cabinHalf],
      [roofFrontX, -cabinHalf],
      [cowlX, -cabinHalf * 0.92],
    ]),
  });

  // タイヤ。上から見ると長さがタイヤ外径、幅がタイヤ幅の矩形になる
  const axles = [
    { x: spec.frontOverhang, track: spec.trackFront },
    { x: spec.frontOverhang + spec.wheelbase, track: spec.trackRear },
  ];
  for (const axle of axles) {
    for (const sign of [-1, 1]) {
      const center = (sign * axle.track) / 2;
      const inner = center - (sign * spec.tire.width) / 2;
      const outer = center + (sign * spec.tire.width) / 2;
      shapes.push({
        kind: 'path',
        role: 'tire',
        d: closedPolylinePath([
          [axle.x - spec.tire.outerDiameter / 2, inner],
          [axle.x - spec.tire.outerDiameter / 2, outer],
          [axle.x + spec.tire.outerDiameter / 2, outer],
          [axle.x + spec.tire.outerDiameter / 2, inner],
        ]),
      });
    }
  }

  return {
    shapes,
    bounds: {
      minX: -GROUND_EXTENSION,
      minY: -halfWidth,
      maxX: length + GROUND_EXTENSION,
      maxY: halfWidth,
    },
  };
}

/** 正面輪郭の指定した高さにおける半幅比を線形補間で求める */
function interpolateHalf(outline: readonly Point[], yRatio: number): number {
  const first = outline[0];
  const last = outline[outline.length - 1];
  if (first === undefined || last === undefined) {
    return 0.45;
  }
  if (yRatio <= first[1]) {
    return first[0];
  }
  if (yRatio >= last[1]) {
    return last[0];
  }
  for (let i = 0; i < outline.length - 1; i += 1) {
    const from = outline[i];
    const to = outline[i + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    if (yRatio >= from[1] && yRatio <= to[1]) {
      const span = to[1] - from[1];
      const t = span === 0 ? 0 : (yRatio - from[1]) / span;
      return from[0] + t * (to[0] - from[0]);
    }
  }
  return last[0];
}

/**
 * 3ビューで共通に使う表示範囲。
 *
 * ビューごとに範囲を合わせると、正面図に切り替えた瞬間に車が画面いっぱいに
 * 拡大されてスケール感が失われる。最大の広がり（全長方向）に揃えることで、
 * タブを切り替えても同じ縮尺のままになり「幅より遥かに長い」ことが読み取れる。
 */
export function unifiedViewExtent(spec: ResolvedSpec): { width: number; height: number } {
  return {
    width: spec.length + GROUND_EXTENSION * 2,
    // 上面図の横方向の広がりは全幅なので、全高と比べて大きい方に合わせる
    height: Math.max(spec.height, spec.width),
  };
}

/** 中心を保ったまま、指定した広がりを満たすように範囲を広げる */
export function expandBounds(bounds: Bounds, extent: { width: number; height: number }): Bounds {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const halfWidth = Math.max(extent.width, bounds.maxX - bounds.minX) / 2;
  const halfHeight = Math.max(extent.height, bounds.maxY - bounds.minY) / 2;

  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

/* ========================================================================
 * グリッドと寸法線
 *
 * どちらも独立した関数が図形を返し、App 側で車体の図形と結合する。
 * 将来の人物シルエット（スケール参照）も同じ形で並べられる。
 * ===================================================================== */

/** グリッドの間隔 (mm) */
export const GRID_STEP = 500;

/** 線が多すぎて描画が重くなるのを防ぐ上限 */
const MAX_GRID_LINES = 120;

/**
 * 背景のグリッド。
 *
 * 原点（地面・前端バンパー）が線上に来るよう間隔の倍数に合わせる。
 * 表示範囲に対して引くので、車体のジオメトリではなく最終的な bounds を渡す。
 */
export function buildGrid(bounds: Bounds, step: number = GRID_STEP): readonly Shape[] {
  const shapes: Shape[] = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;

  if (step <= 0 || spanX / step > MAX_GRID_LINES || spanY / step > MAX_GRID_LINES) {
    return shapes;
  }

  for (let x = Math.ceil(bounds.minX / step) * step; x <= bounds.maxX; x += step) {
    shapes.push({ kind: 'path', role: 'grid', d: linePath([x, bounds.minY], [x, bounds.maxY]) });
  }
  for (let y = Math.ceil(bounds.minY / step) * step; y <= bounds.maxY; y += step) {
    shapes.push({ kind: 'path', role: 'grid', d: linePath([bounds.minX, y], [bounds.maxX, y]) });
  }

  return shapes;
}

/**
 * 寸法線を表示するときに必要な余白の倍率。
 *
 * 寸法線は車体の外側に置くため、ON のときだけ表示範囲を広げる。
 * 先に広げた範囲を確定してからその内側に配置することで、
 * 3ビュー間の縮尺統一が崩れないようにする。
 */
export const DIMENSION_PADDING = { width: 1.08, height: 1.45 } as const;

/**
 * 車体が占める範囲。寸法線はこの外周を基準に、余白の内側へ配置する。
 *
 * 表示範囲の端を基準にすると、ビューによって車体の位置が違うため
 * 寸法線が車体に重なったり遠く離れたりする。
 */
interface ContentBox {
  readonly left: number;
  readonly right: number;
  /** 下端（正の方向）。側面図・正面図は地面、上面図は車体の右端 */
  readonly bottom: number;
}

function contentBoxOf(spec: ResolvedSpec, kind: ViewKind): ContentBox {
  switch (kind) {
    case 'side':
      return { left: 0, right: spec.length, bottom: 0 };
    case 'front':
      return { left: -spec.width / 2, right: spec.width / 2, bottom: 0 };
    case 'top':
      return { left: 0, right: spec.length, bottom: spec.width / 2 };
  }
}

/** 寸法値のフォントサイズ (mm)。図の幅に対する比率で決める */
export function dimensionFontSize(bounds: Bounds): number {
  return (bounds.maxX - bounds.minX) / 48;
}

/**
 * 寸法線を組み立てる。
 *
 * `bounds` は余白を広げたあとの最終的な表示範囲。その内側の余白部分に
 * 寸法線を配置する。
 */
export function buildDimensions(
  spec: ResolvedSpec,
  kind: ViewKind,
  bounds: Bounds,
): readonly Shape[] {
  const fontSize = dimensionFontSize(bounds);
  const tick = fontSize * 0.5;
  const content = contentBoxOf(spec, kind);

  // 車体の外周から表示範囲の端までの余白
  const bottomMargin = bounds.maxY - content.bottom;
  const leftMargin = content.left - bounds.minX;
  const rightMargin = bounds.maxX - content.right;

  // 水平寸法は2段に分ける。近い方が内訳、遠い方が全体
  const innerBandY = content.bottom + bottomMargin * 0.3;
  const outerBandY = content.bottom + bottomMargin * 0.62;

  const shapes: Shape[] = [];
  const horizontal = (y: number, from: number, to: number, label: string) => {
    shapes.push(...horizontalDimension(y, from, to, label, tick, fontSize));
  };
  const vertical = (
    x: number,
    from: number,
    to: number,
    label: string,
    labelSide: 'left' | 'right',
  ) => {
    shapes.push(...verticalDimension(x, from, to, label, tick, fontSize, labelSide));
  };

  switch (kind) {
    case 'side': {
      const frontAxleX = spec.frontOverhang;
      const rearAxleX = spec.frontOverhang + spec.wheelbase;
      horizontal(innerBandY, 0, frontAxleX, `前OH ${spec.frontOverhang}`);
      horizontal(innerBandY, frontAxleX, rearAxleX, `WB ${spec.wheelbase}`);
      horizontal(innerBandY, rearAxleX, spec.length, `後OH ${spec.rearOverhang}`);
      horizontal(outerBandY, 0, spec.length, `全長 ${spec.length}`);
      vertical(content.left - leftMargin * 0.45, 0, -spec.height, `全高 ${spec.height}`, 'left');
      vertical(
        content.right + rightMargin * 0.45,
        0,
        -spec.tire.outerDiameter,
        `タイヤ外径 ${Math.round(spec.tire.outerDiameter)}`,
        'right',
      );
      break;
    }
    case 'front': {
      horizontal(
        innerBandY,
        -spec.trackFront / 2,
        spec.trackFront / 2,
        `トレッド ${spec.trackFront}`,
      );
      horizontal(outerBandY, -spec.width / 2, spec.width / 2, `全幅 ${spec.width}`);
      vertical(content.left - leftMargin * 0.45, 0, -spec.height, `全高 ${spec.height}`, 'left');
      break;
    }
    case 'top': {
      const frontAxleX = spec.frontOverhang;
      const rearAxleX = spec.frontOverhang + spec.wheelbase;
      horizontal(innerBandY, frontAxleX, rearAxleX, `WB ${spec.wheelbase}`);
      horizontal(outerBandY, 0, spec.length, `全長 ${spec.length}`);
      vertical(
        content.left - leftMargin * 0.45,
        -spec.width / 2,
        spec.width / 2,
        `全幅 ${spec.width}`,
        'left',
      );
      break;
    }
  }

  return shapes;
}

/**
 * 水平方向の寸法線。両端に短い縦の目印を付ける。
 *
 * ラベルは線の下側に置く。上側に置くと車体やタイヤに重なる。
 */
function horizontalDimension(
  y: number,
  from: number,
  to: number,
  label: string,
  tick: number,
  fontSize: number,
): readonly Shape[] {
  return [
    { kind: 'path', role: 'dimension', d: linePath([from, y], [to, y]) },
    { kind: 'path', role: 'dimension', d: linePath([from, y - tick], [from, y + tick]) },
    { kind: 'path', role: 'dimension', d: linePath([to, y - tick], [to, y + tick]) },
    {
      kind: 'text',
      role: 'label',
      x: (from + to) / 2,
      y: y + fontSize * 0.85,
      text: label,
      anchor: 'middle',
      fontSize,
    },
  ];
}

/** 垂直方向の寸法線。ラベルは読みやすさのため反時計回りに 90 度回す */
function verticalDimension(
  x: number,
  from: number,
  to: number,
  label: string,
  tick: number,
  fontSize: number,
  labelSide: 'left' | 'right',
): readonly Shape[] {
  return [
    { kind: 'path', role: 'dimension', d: linePath([x, from], [x, to]) },
    { kind: 'path', role: 'dimension', d: linePath([x - tick, from], [x + tick, from]) },
    { kind: 'path', role: 'dimension', d: linePath([x - tick, to], [x + tick, to]) },
    {
      kind: 'text',
      role: 'label',
      x: labelSide === 'left' ? x - tick * 1.2 : x + fontSize * 0.9,
      y: (from + to) / 2,
      text: label,
      anchor: 'middle',
      fontSize,
      rotate: -90,
    },
  ];
}
