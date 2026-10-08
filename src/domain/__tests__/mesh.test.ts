import { averageOf, buildCarMesh, dot, subtract, toTriangles } from '../mesh';
import { sillHeight } from '../geometry';
import { resolve } from '../resolve';
import { SILHOUETTES } from '../types';
import type { CarMesh } from '../mesh';

const cx5 = resolve({ silhouette: 'suv', length: 4575 });

describe('buildCarMesh の寸法', () => {
  const mesh = buildCarMesh(cx5);

  it('前端が 0、後端が全長になる', () => {
    expect(mesh.bodyBounds.min.x).toBe(0);
    expect(mesh.bodyBounds.max.x).toBe(cx5.length);
  });

  it('最大幅が全幅と一致し、中心線に対して対称になる', () => {
    expect(mesh.bodyBounds.max.z).toBeCloseTo(cx5.width / 2, 6);
    expect(mesh.bodyBounds.min.z).toBeCloseTo(-cx5.width / 2, 6);
  });

  it('ルーフの高さが全高と一致する', () => {
    expect(mesh.bodyBounds.max.y).toBeCloseTo(cx5.height, 6);
  });

  it('車体の下端がサイドシルの高さになる', () => {
    expect(mesh.bodyBounds.min.y).toBeCloseTo(sillHeight(cx5), 6);
  });

  it('Y は上方向が正（2D版と符号が逆）', () => {
    expect(mesh.bodyBounds.max.y).toBeGreaterThan(0);
    expect(mesh.bodyBounds.min.y).toBeGreaterThan(0);
  });
});

describe('buildCarMesh の面', () => {
  const mesh = buildCarMesh(cx5);

  it('断面を8頂点で繋ぎ、前後に蓋をする', () => {
    expect(mesh.vertices).toHaveLength(mesh.stationCount * 8);
    expect(mesh.faces).toHaveLength(8 * (mesh.stationCount - 1) + 2);
  });

  it('ローポリの粒度に収まる（面数 40〜120）', () => {
    expect(mesh.faces.length).toBeGreaterThan(40);
    expect(mesh.faces.length).toBeLessThan(120);
  });

  /**
   * 頂点順を手で揃えるとミスが出るので計算で保証している。
   * 内向きの面が混ざるとフラットシェーディングで黒い面が現れる。
   */
  it.each(SILHOUETTES)('%s のすべての面が外を向く', (silhouette) => {
    const built = buildCarMesh(resolve({ silhouette }));
    const centroid = averageOf(built.vertices);

    for (const face of built.faces) {
      const center = averageOf(face.indices.map((index) => built.vertices[index]!));
      const outward = dot(face.normal, subtract(center, centroid));

      expect(outward).toBeGreaterThan(0);
    }
  });

  it('法線が単位ベクトルになる', () => {
    for (const face of mesh.faces) {
      const length = Math.hypot(face.normal.x, face.normal.y, face.normal.z);

      expect(length).toBeCloseTo(1, 6);
    }
  });

  it.each(SILHOUETTES)('%s で NaN が出ない', (silhouette) => {
    const built = buildCarMesh(resolve({ silhouette }));

    for (const vertex of built.vertices) {
      expect(Number.isFinite(vertex.x + vertex.y + vertex.z)).toBe(true);
    }
    for (const face of built.faces) {
      expect(Number.isFinite(face.normal.x + face.normal.y + face.normal.z)).toBe(true);
    }
  });
});

describe('buildCarMesh の断面の形', () => {
  const mesh = buildCarMesh(cx5);

  /** ルーフが絞られていないと紙を折ったような箱に見える */
  it('ルーフが断面の最大幅より絞られている', () => {
    const roofVertices = mesh.vertices.filter((v) => v.y === mesh.bodyBounds.max.y);

    expect(roofVertices.length).toBeGreaterThan(0);
    for (const vertex of roofVertices) {
      expect(Math.abs(vertex.z)).toBeLessThan(cx5.width / 2);
    }
  });

  it('フロアも絞られている', () => {
    const floorVertices = mesh.vertices.filter((v) => v.y === mesh.bodyBounds.min.y);

    for (const vertex of floorVertices) {
      expect(Math.abs(vertex.z)).toBeLessThan(cx5.width / 2);
    }
  });

  it('側面プロファイルの輪郭が高さに反映される', () => {
    // ルーフの区間（上面比 1.0）とテール側で高さが違う
    const atRoof = heightAt(mesh, cx5.length * 0.6);
    const atTail = heightAt(mesh, cx5.length * 0.99);

    expect(atRoof).toBeGreaterThan(atTail);
  });

  it('上面プロファイルの輪郭が幅に反映される', () => {
    // 前端は絞られ、中央は全幅になる
    const atNose = halfWidthAt(mesh, 0);
    const atMiddle = halfWidthAt(mesh, cx5.length * 0.5);

    expect(atNose).toBeLessThan(atMiddle);
    expect(atMiddle).toBeCloseTo(cx5.width / 2, 6);
  });
});

function verticesNear(mesh: CarMesh, x: number) {
  const nearest = mesh.vertices.reduce(
    (best, vertex) => (Math.abs(vertex.x - x) < Math.abs(best - x) ? vertex.x : best),
    Infinity,
  );
  return mesh.vertices.filter((vertex) => vertex.x === nearest);
}

function heightAt(mesh: CarMesh, x: number): number {
  return Math.max(...verticesNear(mesh, x).map((vertex) => vertex.y));
}

function halfWidthAt(mesh: CarMesh, x: number): number {
  return Math.max(...verticesNear(mesh, x).map((vertex) => Math.abs(vertex.z)));
}

describe('buildCarMesh のタイヤ', () => {
  const mesh = buildCarMesh(cx5);

  it('4輪ある', () => {
    expect(mesh.wheels).toHaveLength(4);
  });

  it('前輪がフロントオーバーハングの位置にある', () => {
    const front = mesh.wheels.filter((wheel) => wheel.center.x === cx5.frontOverhang);

    expect(front).toHaveLength(2);
  });

  it('後輪がフロントオーバーハング + ホイールベースの位置にある', () => {
    const rear = mesh.wheels.filter(
      (wheel) => wheel.center.x === cx5.frontOverhang + cx5.wheelbase,
    );

    expect(rear).toHaveLength(2);
  });

  it('タイヤ半径とタイヤ幅が規格から来ている', () => {
    for (const wheel of mesh.wheels) {
      expect(wheel.radius).toBeCloseTo(cx5.tire.outerDiameter / 2, 6);
      expect(wheel.width).toBe(cx5.tire.width);
      expect(wheel.rimRadius).toBeCloseTo(cx5.tire.rimDiameter / 2, 6);
    }
  });

  it('タイヤ中心の高さが半径と一致する（接地する）', () => {
    for (const wheel of mesh.wheels) {
      expect(wheel.center.y).toBeCloseTo(wheel.radius, 6);
    }
  });

  it('左右がトレッドの位置に分かれる', () => {
    const front = mesh.wheels.filter((wheel) => wheel.center.x === cx5.frontOverhang);
    const offsets = front.map((wheel) => wheel.center.z).sort((a, b) => a - b);

    expect(offsets).toEqual([-cx5.trackFront / 2, cx5.trackFront / 2]);
  });

  it.each(SILHOUETTES)('%s でタイヤ上端が車体の上端を越えない', (silhouette) => {
    const built = buildCarMesh(resolve({ silhouette }));

    for (const wheel of built.wheels) {
      expect(wheel.radius * 2).toBeLessThan(built.bodyBounds.max.y);
    }
  });
});

describe('toTriangles', () => {
  const mesh = buildCarMesh(cx5);
  const { positions, normals } = toTriangles(mesh);

  it('位置と法線の数が揃う', () => {
    expect(positions.length).toBe(normals.length);
  });

  it('3頂点ずつの三角形になる', () => {
    expect(positions.length % 9).toBe(0);
  });

  it('クアッドは2枚、8角形の蓋は6枚の三角形になる', () => {
    const quads = 8 * (mesh.stationCount - 1);
    const expected = quads * 2 + 2 * 6;

    expect(positions.length / 9).toBe(expected);
  });

  it('NaN が混ざらない', () => {
    for (const value of [...positions, ...normals]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('寸法を変えると形も変わる', () => {
  it('全長を伸ばすと後端が伸びる', () => {
    const short = buildCarMesh(resolve({ silhouette: 'suv', length: 4200 }));
    const long = buildCarMesh(resolve({ silhouette: 'suv', length: 5000 }));

    expect(long.bodyBounds.max.x).toBeGreaterThan(short.bodyBounds.max.x);
  });

  it('全幅を広げると断面も広がる', () => {
    const narrow = buildCarMesh(resolve({ silhouette: 'suv', length: 4575, width: 1700 }));
    const wide = buildCarMesh(resolve({ silhouette: 'suv', length: 4575, width: 1950 }));

    expect(wide.bodyBounds.max.z).toBeGreaterThan(narrow.bodyBounds.max.z);
  });

  it('シルエットを変えると断面の数や高さが変わる', () => {
    const suv = buildCarMesh(resolve({ silhouette: 'suv', length: 4600 }));
    const sports = buildCarMesh(resolve({ silhouette: 'sports', length: 4600 }));

    expect(sports.bodyBounds.max.y).toBeLessThan(suv.bodyBounds.max.y);
  });
});
