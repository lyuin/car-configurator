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
