import {
  buildFrontView,
  buildTopView,
  buildView,
  expandBounds,
  sillHeight,
  unifiedViewExtent,
  VIEW_KINDS,
} from '../geometry';
import { resolve } from '../resolve';
import { SIDE_PROFILES } from '../profiles';
import { SILHOUETTES } from '../types';
import type { Shape } from '../geometry';

function numbersIn(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function shapesOf(shapes: readonly Shape[], role: Shape['role']): readonly Shape[] {
  return shapes.filter((shape) => shape.role === role);
}

/** パスに含まれる座標の範囲 */
function extentOf(shapes: readonly Shape[], role: Shape['role']) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const shape of shapes.filter((s) => s.role === role)) {
    if (shape.kind !== 'path') {
      continue;
    }
    const numbers = numbersIn(shape.d);
    for (let i = 0; i < numbers.length; i += 2) {
      xs.push(numbers[i] ?? 0);
      ys.push(numbers[i + 1] ?? 0);
    }
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

const cx5 = resolve({ silhouette: 'suv', length: 4575 });

describe('buildFrontView', () => {
  it('車体が中心線に対して左右対称になる', () => {
    const body = extentOf(buildFrontView(cx5).shapes, 'body');

    expect(body.minX).toBeCloseTo(-body.maxX, 1);
  });

  it('車体の最大幅が全幅と一致する', () => {
    const body = extentOf(buildFrontView(cx5).shapes, 'body');

    expect(body.maxX - body.minX).toBeCloseTo(cx5.width, 1);
  });

  it('ルーフが全高、下端がサイドシルになる', () => {
    const geometry = buildFrontView(cx5);
    const body = extentOf(geometry.shapes, 'body');

    expect(body.minY).toBeCloseTo(-cx5.height, 1);
    expect(body.maxY).toBeCloseTo(-sillHeight(cx5), 1);
  });

  it('タイヤが左右のトレッド位置にタイヤ幅で描かれる', () => {
    const tires = shapesOf(buildFrontView(cx5).shapes, 'tire');

    expect(tires).toHaveLength(2);

    const right = tires.find((s) => s.kind === 'path' && numbersIn(s.d)[0]! > 0);
    if (right?.kind !== 'path') {
      throw new Error('右タイヤが見つからない');
    }
    const xs = numbersIn(right.d).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(cx5.tire.width, 1);
    // タイヤ中心がトレッドの半分の位置に来る
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(cx5.trackFront / 2, 1);
  });

  it('タイヤが地面からサイドシルまでの高さで描かれる', () => {
    const tire = shapesOf(buildFrontView(cx5).shapes, 'tire')[0];
    if (tire?.kind !== 'path') {
      throw new Error('タイヤが見つからない');
    }
    const ys = numbersIn(tire.d).filter((_, i) => i % 2 === 1);

    expect(Math.max(...ys)).toBe(0);
    expect(Math.min(...ys)).toBeCloseTo(-sillHeight(cx5), 1);
  });

  it('トレッドが全幅の内側に収まる', () => {
    const geometry = buildFrontView(cx5);
    const tires = extentOf(geometry.shapes, 'tire');

    expect(tires.maxX).toBeLessThanOrEqual(cx5.width / 2);
    expect(tires.minX).toBeGreaterThanOrEqual(-cx5.width / 2);
  });

  it('ウインドシールドがベルトラインの高さから始まる', () => {
    const glass = shapesOf(buildFrontView(cx5).shapes, 'glass')[0];
    if (glass?.kind !== 'path') {
      throw new Error('ガラスが見つからない');
    }
    const ys = numbersIn(glass.d).filter((_, i) => i % 2 === 1);

    expect(Math.max(...ys)).toBeCloseTo(-SIDE_PROFILES.suv.beltline * cx5.height, 1);
  });

  it.each(SILHOUETTES)('%s のウインドシールドが車体の内側に収まる', (silhouette) => {
    const spec = resolve({ silhouette });
    const geometry = buildFrontView(spec);
    const glass = extentOf(geometry.shapes, 'glass');

    expect(glass.maxX).toBeLessThan(spec.width / 2);
    expect(glass.minX).toBeGreaterThan(-spec.width / 2);
  });

  it('全幅を広げると図も広がる', () => {
    const narrow = extentOf(buildFrontView(resolve({ silhouette: 'suv', width: 1700 })).shapes, 'body');
    const wide = extentOf(buildFrontView(resolve({ silhouette: 'suv', width: 1950 })).shapes, 'body');

    expect(wide.maxX - wide.minX).toBeGreaterThan(narrow.maxX - narrow.minX);
  });
});

describe('buildTopView', () => {
  it('車体が中心線に対して左右対称になる', () => {
    const body = extentOf(buildTopView(cx5).shapes, 'body');

    expect(body.minY).toBeCloseTo(-body.maxY, 1);
  });

  it('前端が 0、後端が全長になる', () => {
    const body = extentOf(buildTopView(cx5).shapes, 'body');

    expect(body.minX).toBe(0);
    expect(body.maxX).toBe(cx5.length);
  });

  it('最大幅が全幅と一致する', () => {
    const body = extentOf(buildTopView(cx5).shapes, 'body');

    expect(body.maxY - body.minY).toBeCloseTo(cx5.width, 1);
  });

  it('タイヤが4つ、前後の車軸位置に描かれる', () => {
    const tires = shapesOf(buildTopView(cx5).shapes, 'tire');

    expect(tires).toHaveLength(4);

    const centers = tires.map((s) => {
      if (s.kind !== 'path') {
        throw new Error('タイヤはパスで描画される');
      }
      const xs = numbersIn(s.d).filter((_, i) => i % 2 === 0);
      return (Math.max(...xs) + Math.min(...xs)) / 2;
    });

    const unique = [...new Set(centers.map((c) => Math.round(c)))].sort((a, b) => a - b);
    expect(unique).toEqual([cx5.frontOverhang, cx5.frontOverhang + cx5.wheelbase]);
  });

  it('上から見たタイヤの長さがタイヤ外径になる', () => {
    const tire = shapesOf(buildTopView(cx5).shapes, 'tire')[0];
    if (tire?.kind !== 'path') {
      throw new Error('タイヤが見つからない');
    }
    const xs = numbersIn(tire.d).filter((_, i) => i % 2 === 0);

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(cx5.tire.outerDiameter, 0);
  });

  it('前後でトレッドが違うと左右位置も変わる', () => {
    const spec = resolve({ silhouette: 'suv', length: 4575, trackFront: 1600, trackRear: 1500 });
    const tires = shapesOf(buildTopView(spec).shapes, 'tire');

    const lateral = tires.map((s) => {
      if (s.kind !== 'path') {
        throw new Error('タイヤはパスで描画される');
      }
      const ys = numbersIn(s.d).filter((_, i) => i % 2 === 1);
      return Math.round(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2));
    });

    expect(new Set(lateral).size).toBe(2);
  });

  it('キャビンが側面プロファイルのグリーンハウスの範囲に一致する', () => {
    const glass = shapesOf(buildTopView(cx5).shapes, 'glass')[0];
    if (glass?.kind !== 'path') {
      throw new Error('キャビンが見つからない');
    }
    const xs = numbersIn(glass.d).filter((_, i) => i % 2 === 0);

    expect(Math.min(...xs)).toBeCloseTo(SIDE_PROFILES.suv.greenhouse[0]![0] * cx5.length, 0);
    expect(Math.max(...xs)).toBeCloseTo(SIDE_PROFILES.suv.greenhouse[3]![0] * cx5.length, 0);
  });

  it.each(SILHOUETTES)('%s のキャビンが車体の内側に収まる', (silhouette) => {
    const spec = resolve({ silhouette });
    const geometry = buildTopView(spec);
    const glass = extentOf(geometry.shapes, 'glass');

    expect(glass.maxY).toBeLessThan(spec.width / 2);
    expect(glass.minX).toBeGreaterThanOrEqual(0);
    expect(glass.maxX).toBeLessThanOrEqual(spec.length);
  });
});

describe('buildView', () => {
  it.each(VIEW_KINDS)('%s ビューが破綻せずに組み立てられる', (kind) => {
    for (const silhouette of SILHOUETTES) {
      const geometry = buildView(resolve({ silhouette }), kind);

      expect(geometry.shapes.length).toBeGreaterThan(2);
      for (const shape of geometry.shapes) {
        if (shape.kind === 'path') {
          expect(shape.d, `${silhouette}/${kind}`).not.toContain('NaN');
        }
      }
    }
  });
});

describe('3ビューの縮尺統一', () => {
  it('どのビューでも同じ広がりになる', () => {
    const extent = unifiedViewExtent(cx5);
    const widths = VIEW_KINDS.map((kind) => {
      const bounds = expandBounds(buildView(cx5, kind).bounds, extent);
      return bounds.maxX - bounds.minX;
    });

    expect(new Set(widths.map((w) => Math.round(w)))).toHaveProperty('size', 1);
  });

  it('全長方向の広がりに合わせるので正面図は枠の中で小さくなる', () => {
    const extent = unifiedViewExtent(cx5);

    expect(extent.width).toBeGreaterThan(cx5.length);
    expect(extent.width).toBeGreaterThan(cx5.width * 2);
  });

  it('上面図の横幅は全幅なので、全高より大きければそちらに合わせる', () => {
    // SUV は全幅 1845 > 全高 1690
    expect(unifiedViewExtent(cx5).height).toBe(cx5.width);

    // セダンは全高より全幅が大きい
    const sedan = resolve({ silhouette: 'sedan' });
    expect(unifiedViewExtent(sedan).height).toBe(Math.max(sedan.height, sedan.width));
  });

  it('expandBounds は中心を保つ', () => {
    const before = buildFrontView(cx5).bounds;
    const after = expandBounds(before, { width: 8000, height: 4000 });

    expect((after.minX + after.maxX) / 2).toBeCloseTo((before.minX + before.maxX) / 2, 5);
    expect(after.maxX - after.minX).toBe(8000);
  });

  it('expandBounds は元の範囲を縮めない', () => {
    const before = buildSideViewBounds();
    const after = expandBounds(before, { width: 10, height: 10 });

    expect(after.maxX - after.minX).toBe(before.maxX - before.minX);
  });
});

function buildSideViewBounds() {
  return buildView(cx5, 'side').bounds;
}
