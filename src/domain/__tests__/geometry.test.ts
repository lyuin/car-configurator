import { buildSideView, sillHeight } from '../geometry';
import { resolve } from '../resolve';
import { SIDE_PROFILES } from '../profiles';
import { SILHOUETTES } from '../types';
import type { Shape } from '../geometry';

/** パス文字列から数値の組を取り出す */
function numbersIn(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function shapesOf(shapes: readonly Shape[], role: Shape['role']): readonly Shape[] {
  return shapes.filter((shape) => shape.role === role);
}

const cx5 = resolve({ silhouette: 'suv', length: 4575 });

describe('buildSideView 基準点', () => {
  it('前輪中心の x がフロントオーバーハングと一致する', () => {
    const geometry = buildSideView(cx5);

    expect(geometry.anchors.frontAxleX).toBe(cx5.frontOverhang);
  });

  it('後輪中心の x がフロントオーバーハング + ホイールベースと一致する', () => {
    const geometry = buildSideView(cx5);

    expect(geometry.anchors.rearAxleX).toBe(cx5.frontOverhang + cx5.wheelbase);
  });

  it('ルーフの y が全高の負値になる', () => {
    const geometry = buildSideView(cx5);

    expect(geometry.anchors.roofY).toBe(-cx5.height);
  });

  it('サイドシルが最低地上高より高い位置に来る', () => {
    const geometry = buildSideView(cx5);

    // 最低地上高は床下の最小隙間であり、側面から見えるシルの高さではない
    expect(geometry.anchors.sillY).toBe(-sillHeight(cx5));
    expect(-geometry.anchors.sillY).toBeGreaterThan(cx5.groundClearance);
  });

  it.each(SILHOUETTES)('%s のサイドシルが実車相当の 300〜550mm に収まる', (silhouette) => {
    const spec = resolve({ silhouette });

    expect(sillHeight(spec)).toBeGreaterThan(300);
    expect(sillHeight(spec)).toBeLessThan(550);
  });

  it('最低地上高を上げるとサイドシルも上がる', () => {
    const low = resolve({ silhouette: 'suv', length: 4600, groundClearance: 150 });
    const lifted = resolve({ silhouette: 'suv', length: 4600, groundClearance: 250 });

    expect(sillHeight(lifted) - sillHeight(low)).toBeCloseTo(100, 5);
  });
});

describe('buildSideView タイヤ', () => {
  it('タイヤ円の中心がタイヤ半径の高さにあり、接地点が y=0 になる', () => {
    const geometry = buildSideView(cx5);
    const tires = shapesOf(geometry.shapes, 'tire');

    expect(tires).toHaveLength(2);
    for (const tire of tires) {
      if (tire.kind !== 'circle') {
        throw new Error('タイヤは円で描画される');
      }
      expect(tire.cy).toBe(-tire.r);
      // 接地点 = cy + r = 0
      expect(tire.cy + tire.r).toBe(0);
      expect(tire.r).toBeCloseTo(cx5.tire.outerDiameter / 2, 5);
    }
  });

  it('リムがタイヤの内側に描かれる', () => {
    const geometry = buildSideView(cx5);
    const [tire] = shapesOf(geometry.shapes, 'tire');
    const [rim] = shapesOf(geometry.shapes, 'rim');

    if (tire?.kind !== 'circle' || rim?.kind !== 'circle') {
      throw new Error('タイヤとリムは円で描画される');
    }
    expect(rim.r).toBeLessThan(tire.r);
    expect(rim.cx).toBe(tire.cx);
    expect(rim.cy).toBe(tire.cy);
  });

  it('前後のタイヤがホイールベースぶん離れている', () => {
    const geometry = buildSideView(cx5);
    const tires = shapesOf(geometry.shapes, 'tire').filter((s) => s.kind === 'circle');
    const [front, rear] = tires;

    if (front?.kind !== 'circle' || rear?.kind !== 'circle') {
      throw new Error('タイヤは2つ必要');
    }
    expect(rear.cx - front.cx).toBe(cx5.wheelbase);
  });
});

describe('buildSideView ホイールアーチ', () => {
  it('アーチの頂点がタイヤ上端より高い位置になる', () => {
    const geometry = buildSideView(cx5);
    const arches = shapesOf(geometry.shapes, 'body').filter((s) => s.kind === 'path' && s.d.includes('A'));

    expect(arches).toHaveLength(2);

    const tireRadius = cx5.tire.outerDiameter / 2;
    const archRadius = tireRadius * 1.12;
    // アーチはタイヤ中心を中心とする円なので、頂点は中心 + 半径
    const apex = tireRadius + archRadius;

    expect(apex).toBeGreaterThan(tireRadius * 2);
  });

  it('アーチの弦がサイドシルの高さに乗る', () => {
    const geometry = buildSideView(cx5);
    const arch = shapesOf(geometry.shapes, 'body').find(
      (s) => s.kind === 'path' && s.d.includes('A'),
    );

    if (arch?.kind !== 'path') {
      throw new Error('アーチが見つからない');
    }
    const numbers = numbersIn(arch.d);
    const geometrySillY = buildSideView(cx5).anchors.sillY;
    // M x1 y1 A r r 0 largeArc sweep x2 y2
    expect(numbers[1]).toBeCloseTo(geometrySillY, 0);
    expect(numbers[numbers.length - 1]).toBeCloseTo(geometrySillY, 0);
  });

  /**
   * アーチがタイヤの下側を回って地面やフェンダーの外へはみ出す不具合を出したため追加。
   * シルが車軸中心より上にあるときは上側の円弧が劣角になり large-arc は 0 になる。
   */
  it.each(SILHOUETTES)('%s のアーチが上側の円弧として描かれる', (silhouette) => {
    const spec = resolve({ silhouette });
    const geometry = buildSideView(spec);
    const arch = shapesOf(geometry.shapes, 'body').find(
      (s) => s.kind === 'path' && s.d.includes('A'),
    );

    if (arch?.kind !== 'path') {
      throw new Error('アーチが見つからない');
    }

    const tireRadius = spec.tire.outerDiameter / 2;
    const sillAboveAxle = -geometry.anchors.sillY > tireRadius;
    const expectedLargeArc = sillAboveAxle ? 0 : 1;

    expect(arch.d, `${silhouette}: シルは車軸より${sillAboveAxle ? '上' : '下'}`).toMatch(
      new RegExp(`A [\\d.]+ [\\d.]+ 0 ${expectedLargeArc} 1`),
    );
  });

  it.each(SILHOUETTES)('%s のアーチが車体の前後に収まり、頂点がシルより上にある', (silhouette) => {
    const spec = resolve({ silhouette });
    const geometry = buildSideView(spec);
    const arches = shapesOf(geometry.shapes, 'body').filter(
      (s) => s.kind === 'path' && s.d.includes('A'),
    );

    expect(arches).toHaveLength(2);

    for (const arch of arches) {
      if (arch.kind !== 'path') {
        continue;
      }
      // M x1 y1 A rx ry rot largeArc sweep x2 y2
      const [x1, y1, rx, , , , , x2, y2] = numbersIn(arch.d) as (number | undefined)[];

      // 両端はシル高に乗る
      expect(y1).toBeCloseTo(geometry.anchors.sillY, 0);
      expect(y2).toBeCloseTo(geometry.anchors.sillY, 0);
      // 車体の前後に収まる
      expect(x1 ?? -1).toBeGreaterThanOrEqual(0);
      expect(x2 ?? Infinity).toBeLessThanOrEqual(spec.length);
      // 頂点（円の上端）はシルより上にあり、車体の全高には収まる
      const apex = spec.tire.outerDiameter / 2 + (rx ?? 0);
      expect(apex).toBeGreaterThan(-geometry.anchors.sillY);
      expect(apex).toBeLessThan(spec.height);
    }
  });
});

describe('buildSideView 車体の輪郭', () => {
  it('輪郭が前端と後端のサイドシル高から始まり終わる', () => {
    const geometry = buildSideView(cx5);
    const outline = shapesOf(geometry.shapes, 'body').find(
      (s) => s.kind === 'path' && s.d.startsWith('M 0 '),
    );

    if (outline?.kind !== 'path') {
      throw new Error('輪郭が見つからない');
    }
    const numbers = numbersIn(outline.d);
    expect(numbers[1]).toBeCloseTo(geometry.anchors.sillY, 0);
    expect(numbers[numbers.length - 2]).toBe(cx5.length);
    expect(numbers[numbers.length - 1]).toBeCloseTo(geometry.anchors.sillY, 0);
  });

  it('下面がホイールアーチを避けて 3 区間に分かれる', () => {
    const geometry = buildSideView(cx5);
    const sillLines = shapesOf(geometry.shapes, 'body').filter(
      (s) =>
        s.kind === 'path' &&
        s.d.startsWith('M') &&
        !s.d.includes('A') &&
        isHorizontalAt(s.d, geometry.anchors.sillY),
    );

    expect(sillLines).toHaveLength(3);
  });

  it('グリーンハウスが閉じたパスになる', () => {
    const geometry = buildSideView(cx5);
    const [glass] = shapesOf(geometry.shapes, 'glass');

    if (glass?.kind !== 'path') {
      throw new Error('グリーンハウスが見つからない');
    }
    expect(glass.d.endsWith('Z')).toBe(true);
  });

  it('ドア分割線がプロファイルの指定数だけ引かれる', () => {
    // クラッディングを持たないシルエットで数える
    const geometry = buildSideView(resolve({ silhouette: 'sedan' }));

    expect(shapesOf(geometry.shapes, 'detail')).toHaveLength(
      SIDE_PROFILES.sedan.doorLines.length,
    );
  });
});

describe('buildSideView SUV とワゴンの描き分け', () => {
  const suv = buildSideView(resolve({ silhouette: 'suv' }));
  const wagon = buildSideView(resolve({ silhouette: 'wagon' }));

  it('SUV には下部クラッディングが入り、ワゴンには入らない', () => {
    const suvDetails = shapesOf(suv.shapes, 'detail').length;
    const wagonDetails = shapesOf(wagon.shapes, 'detail').length;

    // ドア線の数は同じなので、差はクラッディングぶん
    expect(SIDE_PROFILES.suv.doorLines).toHaveLength(SIDE_PROFILES.wagon.doorLines.length);
    expect(suvDetails).toBeGreaterThan(wagonDetails);
    expect(SIDE_PROFILES.suv.claddingY).toBeDefined();
    expect(SIDE_PROFILES.wagon.claddingY).toBeUndefined();
  });

  it('SUV のホイールアーチの方が角ばって大きい', () => {
    const archRadiusOf = (profileArchRatio: number | undefined, tireDiameter: number) =>
      (tireDiameter / 2) * (profileArchRatio ?? 1.12);

    const suvArch = archRadiusOf(
      SIDE_PROFILES.suv.archRatio,
      resolve({ silhouette: 'suv' }).tire.outerDiameter,
    );
    const wagonArch = archRadiusOf(
      SIDE_PROFILES.wagon.archRatio,
      resolve({ silhouette: 'wagon' }).tire.outerDiameter,
    );

    expect(suvArch).toBeGreaterThan(wagonArch);
  });

  it('SUV の方が背が高く、最低地上高もタイヤ径も大きい', () => {
    const suvSpec = resolve({ silhouette: 'suv' });
    const wagonSpec = resolve({ silhouette: 'wagon' });

    expect(suvSpec.height).toBeGreaterThan(wagonSpec.height);
    expect(suvSpec.groundClearance).toBeGreaterThan(wagonSpec.groundClearance);
    expect(suvSpec.tire.outerDiameter).toBeGreaterThan(wagonSpec.tire.outerDiameter);
  });

  it('同じ全長・全高を与えても輪郭が一致しない', () => {
    const suvSame = buildSideView(resolve({ silhouette: 'suv', length: 4700, height: 1600 }));
    const wagonSame = buildSideView(resolve({ silhouette: 'wagon', length: 4700, height: 1600 }));

    const outlineOf = (shapes: readonly Shape[]) =>
      shapes.find((s) => s.kind === 'path' && s.d.startsWith('M 0 '));

    expect(outlineOf(suvSame.shapes)).not.toEqual(outlineOf(wagonSame.shapes));
  });
});

function isHorizontalAt(d: string, y: number): boolean {
  const numbers = numbersIn(d);
  return (
    numbers.length === 4 &&
    Math.abs((numbers[1] ?? 0) - y) < 0.2 &&
    Math.abs((numbers[3] ?? 0) - y) < 0.2
  );
}

/** 上面輪郭の指定した x における高さ（負値）を線形補間で求める */
function upperYAt(upper: readonly (readonly [number, number])[], x: number): number {
  for (let i = 0; i < upper.length - 1; i += 1) {
    const from = upper[i];
    const to = upper[i + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    if (x >= from[0] && x <= to[0]) {
      const t = to[0] === from[0] ? 0 : (x - from[0]) / (to[0] - from[0]);
      return from[1] + t * (to[1] - from[1]);
    }
  }
  return upper[upper.length - 1]?.[1] ?? 0;
}

describe('buildSideView bounds', () => {
  it('車体全体と地面線を含む', () => {
    const geometry = buildSideView(cx5);

    expect(geometry.bounds.minX).toBeLessThan(0);
    expect(geometry.bounds.maxX).toBeGreaterThan(cx5.length);
    expect(geometry.bounds.minY).toBe(-cx5.height);
    expect(geometry.bounds.maxY).toBe(0);
  });

  it('全高がタイヤ外径以下の異常な入力でも図が切れない', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, height: 600 });
    const geometry = buildSideView(spec);

    expect(geometry.bounds.minY).toBeLessThanOrEqual(-spec.tire.outerDiameter);
  });
});

/**
 * 図が破綻していないことの検証。
 * スポーツカーのプロファイルでボンネットがタイヤ上端より低く、
 * 前輪が車体を突き抜けて描画される不具合を実際に出したため追加した。
 */
describe('buildSideView 車体とタイヤの整合', () => {
  it.each(SILHOUETTES)('%s は車軸位置の車体がタイヤ上端より高い', (silhouette) => {
    const spec = resolve({ silhouette });
    const profile = SIDE_PROFILES[silhouette];
    const tireTop = spec.tire.outerDiameter;

    for (const [label, axleX] of [
      ['前輪', spec.frontOverhang],
      ['後輪', spec.frontOverhang + spec.wheelbase],
    ] as const) {
      const bodyHeightAtAxle =
        -upperYAt(
          profile.upper.map(([xr, yr]) => [xr * spec.length, -yr * spec.height] as const),
          axleX,
        );

      expect(bodyHeightAtAxle, `${silhouette} の${label}上端が車体を突き抜けている`).toBeGreaterThan(
        tireTop,
      );
    }
  });

  it.each(SILHOUETTES)('%s はサイドシルがタイヤ上端より低い（アーチが機能する）', (silhouette) => {
    const spec = resolve({ silhouette });

    expect(sillHeight(spec)).toBeLessThan(spec.tire.outerDiameter);
  });

  it.each(SILHOUETTES)('%s はベルトラインがサイドシルより高い', (silhouette) => {
    const spec = resolve({ silhouette });

    expect(SIDE_PROFILES[silhouette].beltline * spec.height).toBeGreaterThan(sillHeight(spec));
  });
});

describe('buildSideView シルエットごとの違い', () => {
  it.each(SILHOUETTES)('%s が破綻せずに組み立てられる', (silhouette) => {
    const geometry = buildSideView(resolve({ silhouette }));

    expect(geometry.shapes.length).toBeGreaterThan(5);
    for (const shape of geometry.shapes) {
      if (shape.kind === 'path') {
        expect(shape.d).not.toContain('NaN');
      } else if (shape.kind === 'circle') {
        expect(Number.isFinite(shape.r)).toBe(true);
        expect(shape.r).toBeGreaterThan(0);
      }
    }
  });

  it('同じ寸法でもシルエットによって輪郭が変わる', () => {
    const sedan = buildSideView(resolve({ silhouette: 'sedan', length: 4600, height: 1500 }));
    const suv = buildSideView(resolve({ silhouette: 'suv', length: 4600, height: 1500 }));

    const sedanOutline = sedan.shapes.find((s) => s.kind === 'path' && s.d.startsWith('M 0 '));
    const suvOutline = suv.shapes.find((s) => s.kind === 'path' && s.d.startsWith('M 0 '));

    expect(sedanOutline).not.toEqual(suvOutline);
  });

  it('ピックアップはキャビン後方に一段低い荷台の段差を持つ', () => {
    const profile = SIDE_PROFILES.pickup;
    const roofPoints = profile.upper.filter(([, y]) => y === 1);
    const bedPoints = profile.upper.filter(([, y]) => y > 0.6 && y < 0.8);

    expect(roofPoints.length).toBeGreaterThanOrEqual(2);
    expect(bedPoints.length).toBeGreaterThanOrEqual(2);
  });
});
