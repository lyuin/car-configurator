import { sillHeight } from './geometry';
import { SIDE_PROFILES, TOP_PROFILES } from './profiles';
import type { Point } from './geometry';
import type { ResolvedSpec } from './types';

/**
 * 寸法から3Dのボディ形状を組み立てる。
 *
 * three.js に依存しない純粋なデータを返す。こうしておくとテストできるうえ、
 * オフラインで SVG に投影して目視確認ができる。2D版で「座標のテストは通るが
 * 図は破綻していた」を2度踏んでいるので、3Dでも実物を見る手段を確保しておく。
 *
 * 座標系（three.js の標準に合わせる）
 * - X: 車の前端バンパーを 0 として後方へ
 * - Y: 地面を 0 として上方向へ正（2D版は負だったので符号が逆）
 * - Z: 車両中心線を 0 として左右
 *
 * 形状は `SIDE_PROFILES`（上面の輪郭）と `TOP_PROFILES`（半幅）を x 方向の
 * ステーションごとに補間し、各断面を8頂点の多角形にして繋いで作る（ロフト）。
 * ステーションは2つのプロファイルの折れ点の和集合なので、面の割れ目が
 * 輪郭の特徴点と一致する。面数は約70で、狙っているローポリの粒度になる。
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MeshFace {
  /** 頂点インデックス。外向きになるよう順序を自動補正している */
  readonly indices: readonly number[];
  /** 面の法線（単位ベクトル）。フラットシェーディングと陰影計算に使う */
  readonly normal: Vec3;
}

export interface Wheel {
  readonly center: Vec3;
  /** タイヤ外径の半分 */
  readonly radius: number;
  /** タイヤ幅（Z 方向の厚み） */
  readonly width: number;
  readonly rimRadius: number;
}

export interface Bounds3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CarMesh {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly MeshFace[];
  readonly wheels: readonly Wheel[];
  /** 車体のみの範囲。タイヤは地面まで下がるので含めない */
  readonly bodyBounds: Bounds3;
  /** 断面の数。面の粗さの目安 */
  readonly stationCount: number;
}

/**
 * 断面の面取り比率。
 *
 * 単純な箱だと紙を折ったように見えるので、上下の角を落として光が乗る面を作る。
 * ルーフを絞るとキャビンらしく、フロアを絞ると接地面が軽く見える。
 */
const SECTION = {
  /** ルーフの半幅（断面の半幅に対する比） */
  roofInset: 0.82,
  /** ショルダー（側面の上端）を上端からどれだけ下げるか（断面高さに対する比） */
  shoulderDrop: 0.18,
  /** ロッカー（側面の下端）を下端からどれだけ上げるか */
  rockerRise: 0.12,
  /** フロアの半幅 */
  floorInset: 0.8,
  /**
   * 前後端の断面で下端を持ち上げる比率（断面高さに対する比）。
   *
   * 実車のバンパーは下側が内側に巻き込んでいる。前端から後端までシル高で
   * フラットにすると、鼻先が板のように見えて3Dで破綻する。
   * 全長・全幅・全高・シル高はどれも変わらない。
   */
  bumperTuck: 0.22,
} as const;

/** 1断面あたりの頂点数 */
const SECTION_VERTICES = 8;

export function buildCarMesh(spec: ResolvedSpec): CarMesh {
  const side = SIDE_PROFILES[spec.silhouette];
  const top = TOP_PROFILES[spec.silhouette];
  const bottom = sillHeight(spec);

  const stations = stationRatios(side.upper, top.outline);

  const vertices: Vec3[] = [];
  stations.forEach((ratio, index) => {
    const x = ratio * spec.length;
    const upper = interpolate(side.upper, ratio) * spec.height;
    const halfWidth = interpolate(top.outline, ratio) * spec.width;
    // 前後端はバンパーとして下端を持ち上げる
    const isEnd = index === 0 || index === stations.length - 1;
    const lift = isEnd ? (upper - bottom) * SECTION.bumperTuck : 0;
    vertices.push(...sectionVertices(x, halfWidth, bottom + lift, upper));
  });

  const centroid = averageOf(vertices);
  const faces: MeshFace[] = [];

  // 隣り合う断面を8枚のクアッドで繋ぐ（側面・上面・下面）
  for (let station = 0; station < stations.length - 1; station += 1) {
    const near = station * SECTION_VERTICES;
    const far = (station + 1) * SECTION_VERTICES;
    for (let corner = 0; corner < SECTION_VERTICES; corner += 1) {
      const next = (corner + 1) % SECTION_VERTICES;
      faces.push(
        orientOutward([near + corner, near + next, far + next, far + corner], vertices, centroid),
      );
    }
  }

  // 前後の蓋。前端は鼻先の面、後端はテールの面になる
  const firstSection = range(0, SECTION_VERTICES);
  const lastSection = range((stations.length - 1) * SECTION_VERTICES, SECTION_VERTICES);
  faces.push(orientOutward(firstSection, vertices, centroid));
  faces.push(orientOutward(lastSection, vertices, centroid));

  return {
    vertices,
    faces,
    wheels: wheelsOf(spec),
    bodyBounds: boundsOf(vertices),
    stationCount: stations.length,
  };
}

/** 断面の8頂点。Z-Y 平面で上下の角を面取りした閉じた輪 */
function sectionVertices(x: number, halfWidth: number, bottom: number, top: number): Vec3[] {
  const height = top - bottom;
  const roof = halfWidth * SECTION.roofInset;
  const floor = halfWidth * SECTION.floorInset;
  const shoulder = top - height * SECTION.shoulderDrop;
  const rocker = bottom + height * SECTION.rockerRise;

  return [
    { x, y: top, z: -roof },
    { x, y: top, z: roof },
    { x, y: shoulder, z: halfWidth },
    { x, y: rocker, z: halfWidth },
    { x, y: bottom, z: floor },
    { x, y: bottom, z: -floor },
    { x, y: rocker, z: -halfWidth },
    { x, y: shoulder, z: -halfWidth },
  ];
}

/**
 * 断面を置く x の位置（全長比）。
 *
 * 2つのプロファイルの折れ点を両方含めることで、側面の輪郭と上面の輪郭の
 * どちらの特徴も面の割れ目として残る。
 */
function stationRatios(upper: readonly Point[], outline: readonly Point[]): readonly number[] {
  const ratios = new Set<number>([0, 1]);
  for (const [ratio] of upper) {
    ratios.add(clamp01(ratio));
  }
  for (const [ratio] of outline) {
    ratios.add(clamp01(ratio));
  }
  return [...ratios].sort((a, b) => a - b);
}

/** プロファイルの点列から、指定した位置の値を線形補間で求める */
function interpolate(points: readonly Point[], at: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (at <= first[0]) {
    return first[1];
  }
  if (at >= last[0]) {
    return last[1];
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    if (at >= from[0] && at <= to[0]) {
      const span = to[0] - from[0];
      const t = span === 0 ? 0 : (at - from[0]) / span;
      return from[1] + t * (to[1] - from[1]);
    }
  }
  return last[1];
}

/**
 * 面の頂点順を外向きに揃える。
 *
 * 手で巻き方向を揃えるとミスが出るので、法線が重心から外を向いていなければ
 * 順序を反転させる。車体はおおむね凸なのでこの判定で足りる。
 */
function orientOutward(
  indices: readonly number[],
  vertices: readonly Vec3[],
  centroid: Vec3,
): MeshFace {
  const outward = normalOf(indices, vertices);
  const center = averageOf(indices.map((index) => vertices[index]!));
  const toOutside = subtract(center, centroid);

  if (dot(outward, toOutside) >= 0) {
    return { indices, normal: outward };
  }

  const reversed = [...indices].reverse();
  return { indices: reversed, normal: normalOf(reversed, vertices) };
}

/** 多角形の法線。最初の3点から求める（断面も蓋も平面なので十分） */
function normalOf(indices: readonly number[], vertices: readonly Vec3[]): Vec3 {
  const a = vertices[indices[0]!]!;
  const b = vertices[indices[1]!]!;
  const c = vertices[indices[2]!]!;
  return normalize(cross(subtract(b, a), subtract(c, a)));
}

function wheelsOf(spec: ResolvedSpec): readonly Wheel[] {
  const radius = spec.tire.outerDiameter / 2;
  const rimRadius = spec.tire.rimDiameter / 2;
  const axles = [
    { x: spec.frontOverhang, track: spec.trackFront },
    { x: spec.frontOverhang + spec.wheelbase, track: spec.trackRear },
  ];

  return axles.flatMap((axle) =>
    [-1, 1].map((side) => ({
      center: { x: axle.x, y: radius, z: (side * axle.track) / 2 },
      radius,
      width: spec.tire.width,
      rimRadius,
    })),
  );
}

/**
 * 三角形の配列に展開する。
 *
 * three.js には頂点を共有しない形（non-indexed）で渡す。面ごとに法線が
 * 独立するのでフラットシェーディングになり、狙っているローポリの見た目になる。
 */
export function toTriangles(mesh: CarMesh): {
  readonly positions: readonly number[];
  readonly normals: readonly number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const face of mesh.faces) {
    // 多角形を扇状に三角形へ分割する
    for (let i = 1; i < face.indices.length - 1; i += 1) {
      for (const index of [face.indices[0]!, face.indices[i]!, face.indices[i + 1]!]) {
        const vertex = mesh.vertices[index]!;
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
      }
    }
  }

  return { positions, normals };
}

/* --- ベクトルの小道具 --------------------------------------------------- */

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

export function averageOf(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: total.x / points.length, y: total.y / points.length, z: total.z / points.length };
}

function boundsOf(vertices: readonly Vec3[]): Bounds3 {
  const xs = vertices.map((v) => v.x);
  const ys = vertices.map((v) => v.y);
  const zs = vertices.map((v) => v.z);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
    max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
  };
}

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
