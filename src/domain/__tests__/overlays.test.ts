import {
  buildDimensions,
  buildGrid,
  buildView,
  DIMENSION_PADDING,
  dimensionFontSize,
  expandBounds,
  GRID_STEP,
  unifiedViewExtent,
  VIEW_KINDS,
} from '../geometry';
import { resolve } from '../resolve';
import { SILHOUETTES } from '../types';
import type { Bounds, Shape, ViewKind } from '../geometry';

const cx5 = resolve({ silhouette: 'suv', length: 4575 });

function numbersIn(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function labelsOf(shapes: readonly Shape[]): string[] {
  return shapes.filter((s) => s.kind === 'text').map((s) => (s.kind === 'text' ? s.text : ''));
}

/** 寸法線 ON のときの最終的な表示範囲 */
function dimensionBounds(kind: ViewKind): Bounds {
  const extent = unifiedViewExtent(cx5);
  return expandBounds(buildView(cx5, kind).bounds, {
    width: extent.width * DIMENSION_PADDING.width,
    height: extent.height * DIMENSION_PADDING.height,
  });
}

describe('buildGrid', () => {
  const bounds: Bounds = { minX: -700, minY: -1800, maxX: 4800, maxY: 300 };

  it('グリッド線がすべて grid の役割を持つ', () => {
    for (const shape of buildGrid(bounds)) {
      expect(shape.role).toBe('grid');
    }
  });

  it('原点が線上に来る', () => {
    const shapes = buildGrid(bounds);
    const verticalXs = shapes
      .filter((s) => s.kind === 'path')
      .map((s) => (s.kind === 'path' ? numbersIn(s.d) : []))
      .filter((n) => n[0] === n[2])
      .map((n) => n[0]);

    expect(verticalXs).toContain(0);
  });

  it('間隔が 500mm になる', () => {
    const shapes = buildGrid(bounds);
    const verticalXs = shapes
      .filter((s) => s.kind === 'path')
      .map((s) => (s.kind === 'path' ? numbersIn(s.d) : []))
      .filter((n) => n[0] === n[2])
      .map((n) => n[0] ?? 0)
      .sort((a, b) => a - b);

    for (let i = 1; i < verticalXs.length; i += 1) {
      expect((verticalXs[i] ?? 0) - (verticalXs[i - 1] ?? 0)).toBe(GRID_STEP);
    }
  });

  it('表示範囲の外には引かない', () => {
    for (const shape of buildGrid(bounds)) {
      if (shape.kind !== 'path') {
        continue;
      }
      const [x1, y1, x2, y2] = numbersIn(shape.d);
      for (const x of [x1, x2]) {
        expect(x ?? 0).toBeGreaterThanOrEqual(bounds.minX);
        expect(x ?? 0).toBeLessThanOrEqual(bounds.maxX);
      }
      for (const y of [y1, y2]) {
        expect(y ?? 0).toBeGreaterThanOrEqual(bounds.minY);
        expect(y ?? 0).toBeLessThanOrEqual(bounds.maxY);
      }
    }
  });

  it('間隔が細かすぎる場合は線を引かない（描画負荷の保護）', () => {
    expect(buildGrid(bounds, 1)).toHaveLength(0);
    expect(buildGrid(bounds, 0)).toHaveLength(0);
  });
});

describe('buildDimensions 側面図', () => {
  const shapes = buildDimensions(cx5, 'side', dimensionBounds('side'));

  it('全長・WB・前後OH・全高・タイヤ外径のラベルが出る', () => {
    const labels = labelsOf(shapes).join(' ');

    expect(labels).toContain(`全長 ${cx5.length}`);
    expect(labels).toContain(`WB ${cx5.wheelbase}`);
    expect(labels).toContain(`前OH ${cx5.frontOverhang}`);
    expect(labels).toContain(`後OH ${cx5.rearOverhang}`);
    expect(labels).toContain(`全高 ${cx5.height}`);
    expect(labels).toContain(`タイヤ外径 ${Math.round(cx5.tire.outerDiameter)}`);
  });

  it('前後OHとWBの寸法線が繋がって全長になる', () => {
    const spans = shapes
      .filter((s) => s.kind === 'path')
      .map((s) => (s.kind === 'path' ? numbersIn(s.d) : []))
      // 水平線のみ
      .filter((n) => n[1] === n[3] && (n[2] ?? 0) - (n[0] ?? 0) > 1)
      .map((n) => [n[0] ?? 0, n[2] ?? 0] as const);

    expect(spans).toContainEqual([0, cx5.frontOverhang]);
    expect(spans).toContainEqual([cx5.frontOverhang, cx5.frontOverhang + cx5.wheelbase]);
    expect(spans).toContainEqual([cx5.frontOverhang + cx5.wheelbase, cx5.length]);
    expect(spans).toContainEqual([0, cx5.length]);
  });

  it('寸法線が車体の外側（地面より下）に置かれる', () => {
    const horizontalYs = shapes
      .filter((s) => s.kind === 'path')
      .map((s) => (s.kind === 'path' ? numbersIn(s.d) : []))
      // 端点マークの短い線は除き、寸法を示す本体の線だけを見る
      // （端点マークの長さはフォントサイズ由来で 100mm を超えるため閾値は 300mm）
      .filter((n) => n[1] === n[3] && Math.abs((n[2] ?? 0) - (n[0] ?? 0)) > 300)
      .map((n) => n[1] ?? 0);

    expect(horizontalYs.length).toBeGreaterThan(0);
    for (const y of horizontalYs) {
      expect(y).toBeGreaterThan(0);
    }
  });

  it('全高の寸法線が車体の左側に置かれる', () => {
    const vertical = shapes
      .filter((s) => s.kind === 'path')
      .map((s) => (s.kind === 'path' ? numbersIn(s.d) : []))
      .find((n) => n[0] === n[2] && Math.abs((n[3] ?? 0) - (n[1] ?? 0)) === cx5.height);

    expect(vertical?.[0]).toBeLessThan(0);
  });

  it('縦の寸法ラベルは回転させる', () => {
    const rotated = shapes.filter((s) => s.kind === 'text' && s.rotate !== undefined);

    expect(rotated.length).toBeGreaterThan(0);
    for (const shape of rotated) {
      expect(shape.kind === 'text' ? shape.rotate : 0).toBe(-90);
    }
  });
});

describe('buildDimensions 正面図・上面図', () => {
  it('正面図はトレッド・全幅・全高を出す', () => {
    const labels = labelsOf(buildDimensions(cx5, 'front', dimensionBounds('front'))).join(' ');

    expect(labels).toContain(`トレッド ${cx5.trackFront}`);
    expect(labels).toContain(`全幅 ${cx5.width}`);
    expect(labels).toContain(`全高 ${cx5.height}`);
  });

  it('上面図は WB・全長・全幅を出す', () => {
    const labels = labelsOf(buildDimensions(cx5, 'top', dimensionBounds('top'))).join(' ');

    expect(labels).toContain(`WB ${cx5.wheelbase}`);
    expect(labels).toContain(`全長 ${cx5.length}`);
    expect(labels).toContain(`全幅 ${cx5.width}`);
  });

  it.each(VIEW_KINDS)('%s ビューの寸法線が表示範囲に収まる', (kind) => {
    const bounds = dimensionBounds(kind);

    for (const shape of buildDimensions(cx5, kind, bounds)) {
      if (shape.kind === 'path') {
        const [x1, y1, x2, y2] = numbersIn(shape.d);
        for (const x of [x1, x2]) {
          expect(x ?? 0).toBeGreaterThanOrEqual(bounds.minX);
          expect(x ?? 0).toBeLessThanOrEqual(bounds.maxX);
        }
        for (const y of [y1, y2]) {
          expect(y ?? 0).toBeGreaterThanOrEqual(bounds.minY);
          expect(y ?? 0).toBeLessThanOrEqual(bounds.maxY);
        }
      }
    }
  });

  it.each(SILHOUETTES)('%s でも寸法線が破綻しない', (silhouette) => {
    const spec = resolve({ silhouette });
    const extent = unifiedViewExtent(spec);

    for (const kind of VIEW_KINDS) {
      const bounds = expandBounds(buildView(spec, kind).bounds, {
        width: extent.width * DIMENSION_PADDING.width,
        height: extent.height * DIMENSION_PADDING.height,
      });

      for (const shape of buildDimensions(spec, kind, bounds)) {
        if (shape.kind === 'path') {
          expect(shape.d).not.toContain('NaN');
        } else if (shape.kind === 'text') {
          expect(shape.text).not.toContain('NaN');
          expect(shape.fontSize).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('dimensionFontSize', () => {
  it('図が大きいほどフォントも大きくなる（見た目の比率を保つ）', () => {
    const small = dimensionFontSize({ minX: 0, minY: 0, maxX: 3000, maxY: 1000 });
    const large = dimensionFontSize({ minX: 0, minY: 0, maxX: 6000, maxY: 1000 });

    expect(large).toBe(small * 2);
  });
});

describe('寸法線の余白', () => {
  it('寸法線を出すと表示範囲が広がる', () => {
    const extent = unifiedViewExtent(cx5);
    const without = expandBounds(buildView(cx5, 'side').bounds, extent);
    const withDimensions = dimensionBounds('side');

    expect(withDimensions.maxX - withDimensions.minX).toBeGreaterThan(without.maxX - without.minX);
    expect(withDimensions.maxY - withDimensions.minY).toBeGreaterThan(without.maxY - without.minY);
  });

  it('寸法線 ON でも3ビューの縮尺が揃う', () => {
    const widths = VIEW_KINDS.map((kind) => {
      const bounds = dimensionBounds(kind);
      return Math.round(bounds.maxX - bounds.minX);
    });

    expect(new Set(widths).size).toBe(1);
  });
});
