import { buildScene, shiftBounds, unionBounds } from '../scene';
import { buildView, VIEW_KINDS } from '../geometry';
import { resolve } from '../resolve';
import type { SceneInput, SceneLayer } from '../scene';
import type { Bounds } from '../geometry';

const cx5 = resolve({ silhouette: 'suv', length: 4575 });
const camry = resolve({ silhouette: 'sedan', length: 4885 });

const scene = (overrides: Partial<SceneInput> = {}) =>
  buildScene({
    a: cx5,
    view: 'side',
    compare: 'overlay',
    origin: 'front',
    active: 'a',
    showGrid: false,
    showDimensions: false,
    ...overrides,
  });

function layer(layers: readonly SceneLayer[], id: SceneLayer['id']): SceneLayer {
  const found = layers.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`レイヤーが見つからない: ${id}`);
  }
  return found;
}

function ids(layers: readonly SceneLayer[]): string[] {
  return layers.map((item) => item.id);
}

describe('buildScene 1台のとき', () => {
  it('車のレイヤーだけを返す', () => {
    expect(ids(scene().layers)).toEqual(['a']);
  });

  it('グリッドと寸法線を有効にするとレイヤーが増える', () => {
    expect(ids(scene({ showGrid: true, showDimensions: true }).layers)).toEqual([
      'grid',
      'a',
      'dimensions',
    ]);
  });

  it('オフセットは 0 になる', () => {
    const carLayer = layer(scene().layers, 'a');

    expect(carLayer.offsetX).toBe(0);
    expect(carLayer.offsetY).toBe(0);
  });

  it('車体が表示範囲に収まる', () => {
    const { bounds } = scene();

    expect(bounds.minX).toBeLessThanOrEqual(0);
    expect(bounds.maxX).toBeGreaterThanOrEqual(cx5.length);
  });
});

describe('buildScene 2台のとき', () => {
  it('2台目のレイヤーが追加され色の識別子が付く', () => {
    const { layers } = scene({ b: camry });

    expect(ids(layers)).toEqual(['a', 'b']);
    expect(layer(layers, 'a').variant).toBe('a');
    expect(layer(layers, 'b').variant).toBe('b');
  });

  it('表示範囲が両方の車を含む', () => {
    const { bounds } = scene({ b: camry, compare: 'sideBySide' });
    const placedA = shiftBounds(buildView(cx5, 'side').bounds, 0, 0);
    const layers = scene({ b: camry, compare: 'sideBySide' }).layers;
    const offsetB = layer(layers, 'b');
    const placedB = shiftBounds(
      buildView(camry, 'side').bounds,
      offsetB.offsetX,
      offsetB.offsetY,
    );

    for (const inner of [placedA, placedB]) {
      expect(bounds.minX).toBeLessThanOrEqual(inner.minX);
      expect(bounds.maxX).toBeGreaterThanOrEqual(inner.maxX);
      expect(bounds.minY).toBeLessThanOrEqual(inner.minY);
      expect(bounds.maxY).toBeGreaterThanOrEqual(inner.maxY);
    }
  });

  it('縮尺は大きい方の車に合わせる', () => {
    const single = scene();
    const pair = scene({ b: camry });

    // 全長の長い Camry を含むので表示範囲が広がる
    expect(pair.bounds.maxX - pair.bounds.minX).toBeGreaterThan(
      single.bounds.maxX - single.bounds.minX,
    );
  });
});

describe('buildScene 並置', () => {
  it('側面図では上下に積み、前端を揃える', () => {
    const { layers } = scene({ b: camry, compare: 'sideBySide', view: 'side' });
    const a = layer(layers, 'a');
    const b = layer(layers, 'b');

    expect(a.offsetX).toBe(0);
    expect(b.offsetX).toBe(0);
    // B は下（y の正方向）に置かれる
    expect(b.offsetY).toBeGreaterThan(0);
  });

  it('上下に積んだとき2台が重ならない', () => {
    const { layers } = scene({ b: camry, compare: 'sideBySide', view: 'side' });
    const boundsA = buildView(cx5, 'side').bounds;
    const boundsB = shiftBounds(buildView(camry, 'side').bounds, 0, layer(layers, 'b').offsetY);

    expect(boundsB.minY).toBeGreaterThan(boundsA.maxY);
  });

  it('上面図でも上下に積む', () => {
    const { layers } = scene({ b: camry, compare: 'sideBySide', view: 'top' });

    expect(layer(layers, 'b').offsetY).toBeGreaterThan(0);
    expect(layer(layers, 'b').offsetX).toBe(0);
  });

  it('正面図では左右に並べる', () => {
    const { layers } = scene({ b: camry, compare: 'sideBySide', view: 'front' });
    const a = layer(layers, 'a');
    const b = layer(layers, 'b');

    expect(a.offsetX).toBeLessThan(0);
    expect(b.offsetX).toBeGreaterThan(0);
    expect(a.offsetY).toBe(0);
    expect(b.offsetY).toBe(0);
  });

  it('正面図で左右に並べたとき2台が重ならない', () => {
    const { layers } = scene({ b: camry, compare: 'sideBySide', view: 'front' });
    const boundsA = shiftBounds(buildView(cx5, 'front').bounds, layer(layers, 'a').offsetX, 0);
    const boundsB = shiftBounds(buildView(camry, 'front').bounds, layer(layers, 'b').offsetX, 0);

    expect(boundsB.minX).toBeGreaterThan(boundsA.maxX);
  });
});

describe('buildScene オーバーレイの基準点', () => {
  it('フロントバンパー基準では両方の前端が揃う', () => {
    const { layers } = scene({ b: camry, compare: 'overlay', origin: 'front' });

    expect(layer(layers, 'a').offsetX).toBe(0);
    expect(layer(layers, 'b').offsetX).toBe(0);
  });

  it('前輪中心基準ではフロントオーバーハングの差ぶんずらす', () => {
    const { layers } = scene({ b: camry, compare: 'overlay', origin: 'axle' });

    expect(layer(layers, 'b').offsetX).toBe(cx5.frontOverhang - camry.frontOverhang);
  });

  it('車体中央基準では全長の半分の差ぶんずらす', () => {
    const { layers } = scene({ b: camry, compare: 'overlay', origin: 'center' });

    expect(layer(layers, 'b').offsetX).toBe(cx5.length / 2 - camry.length / 2);
  });

  it('基準点を変えると B の位置だけが動く', () => {
    const front = scene({ b: camry, compare: 'overlay', origin: 'front' });
    const center = scene({ b: camry, compare: 'overlay', origin: 'center' });

    expect(layer(front.layers, 'a').offsetX).toBe(layer(center.layers, 'a').offsetX);
    expect(layer(front.layers, 'b').offsetX).not.toBe(layer(center.layers, 'b').offsetX);
  });

  it('正面図では基準点の選択が効かない（常に中心線と地面で揃う）', () => {
    for (const origin of ['front', 'axle', 'center'] as const) {
      const { layers } = scene({ b: camry, compare: 'overlay', origin, view: 'front' });

      expect(layer(layers, 'b').offsetX).toBe(0);
      expect(layer(layers, 'b').offsetY).toBe(0);
    }
  });

  it('重ねたとき地面の高さは揃う', () => {
    const { layers } = scene({ b: camry, compare: 'overlay' });

    expect(layer(layers, 'a').offsetY).toBe(0);
    expect(layer(layers, 'b').offsetY).toBe(0);
  });
});

describe('buildScene 寸法線', () => {
  it('編集中の車の分だけを描く', () => {
    const forA = scene({ b: camry, showDimensions: true, active: 'a' });
    const forB = scene({ b: camry, showDimensions: true, active: 'b' });

    const labelsOf = (layers: readonly SceneLayer[]) =>
      layer(layers, 'dimensions')
        .shapes.filter((shape) => shape.kind === 'text')
        .map((shape) => (shape.kind === 'text' ? shape.text : ''))
        .join(' ');

    expect(labelsOf(forA.layers)).toContain(`全長 ${cx5.length}`);
    expect(labelsOf(forA.layers)).not.toContain(`全長 ${camry.length}`);
    expect(labelsOf(forB.layers)).toContain(`全長 ${camry.length}`);
  });

  it('寸法線のレイヤーは対象の車と同じオフセットを持つ', () => {
    const { layers } = scene({
      b: camry,
      compare: 'sideBySide',
      showDimensions: true,
      active: 'b',
    });

    expect(layer(layers, 'dimensions').offsetY).toBe(layer(layers, 'b').offsetY);
  });

  it('寸法線を出すと表示範囲が広がる', () => {
    const without = scene({ b: camry });
    const withDimensions = scene({ b: camry, showDimensions: true });

    expect(withDimensions.bounds.maxY - withDimensions.bounds.minY).toBeGreaterThan(
      without.bounds.maxY - without.bounds.minY,
    );
  });
});

describe('buildScene がどのビュー・モードでも破綻しない', () => {
  it.each(VIEW_KINDS)('%s ビュー', (view) => {
    for (const compare of ['sideBySide', 'overlay'] as const) {
      for (const origin of ['front', 'axle', 'center'] as const) {
        const built = scene({ b: camry, view, compare, origin, showGrid: true, showDimensions: true });

        expect(built.bounds.maxX).toBeGreaterThan(built.bounds.minX);
        expect(built.bounds.maxY).toBeGreaterThan(built.bounds.minY);
        for (const item of built.layers) {
          for (const shape of item.shapes) {
            if (shape.kind === 'path') {
              expect(shape.d).not.toContain('NaN');
            }
          }
        }
      }
    }
  });
});

describe('bounds のユーティリティ', () => {
  const base: Bounds = { minX: 0, minY: -1000, maxX: 4000, maxY: 0 };

  it('shiftBounds は範囲を平行移動する', () => {
    expect(shiftBounds(base, 100, -50)).toEqual({
      minX: 100,
      minY: -1050,
      maxX: 4100,
      maxY: -50,
    });
  });

  it('unionBounds は両方を含む範囲を返す', () => {
    const other: Bounds = { minX: -200, minY: -500, maxX: 3000, maxY: 300 };

    expect(unionBounds(base, other)).toEqual({
      minX: -200,
      minY: -1000,
      maxX: 4000,
      maxY: 300,
    });
  });
});
