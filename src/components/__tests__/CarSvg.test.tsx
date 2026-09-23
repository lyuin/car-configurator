import { renderToStaticMarkup } from 'react-dom/server';
import { CarSvg } from '../CarSvg';
import { buildView, VIEW_KINDS } from '../../domain/geometry';
import { buildScene } from '../../domain/scene';
import { resolve } from '../../domain/resolve';
import { SILHOUETTES } from '../../domain/types';
import type { ViewKind } from '../../domain/geometry';

function singleLayer(silhouette: (typeof SILHOUETTES)[number], view: ViewKind = 'side') {
  const geometry = buildView(resolve({ silhouette }), view);
  return {
    layers: [{ id: 'a' as const, variant: 'a' as const, offsetX: 0, offsetY: 0, shapes: geometry.shapes }],
    bounds: geometry.bounds,
  };
}

function render(silhouette: (typeof SILHOUETTES)[number], view: ViewKind = 'side') {
  const { layers, bounds } = singleLayer(silhouette, view);
  return renderToStaticMarkup(<CarSvg layers={layers} bounds={bounds} title={silhouette} />);
}

describe('CarSvg', () => {
  it.each(SILHOUETTES)('%s の側面図が変化しないこと', (silhouette) => {
    expect(render(silhouette)).toMatchSnapshot();
  });

  it.each(VIEW_KINDS)('SUV の%sビューが変化しないこと', (view) => {
    expect(render('suv', view)).toMatchSnapshot();
  });

  it('viewBox を mm 単位でとり余白を含める', () => {
    const { layers, bounds } = singleLayer('suv');
    const html = renderToStaticMarkup(<CarSvg layers={layers} bounds={bounds} padding={100} />);

    // minX = -150（地面線の延長）, padding 100 → -250
    expect(html).toContain('viewBox="-250');
  });

  it('線の太さが図のスケールに影響されないよう non-scaling-stroke を付ける', () => {
    expect(render('sedan')).toContain('vector-effect="non-scaling-stroke"');
  });

  it('タイトルを渡すと画像として読み上げられる', () => {
    const html = render('suv');

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="suv"');
  });

  it('タイトルがなければ支援技術から隠す', () => {
    const { layers, bounds } = singleLayer('suv');
    const html = renderToStaticMarkup(<CarSvg layers={layers} bounds={bounds} />);

    expect(html).toContain('aria-hidden="true"');
  });
});

describe('CarSvg のレイヤー', () => {
  const scene = buildScene({
    a: resolve({ silhouette: 'suv', length: 4575 }),
    b: resolve({ silhouette: 'sedan', length: 4885 }),
    view: 'side',
    compare: 'overlay',
    origin: 'front',
    active: 'a',
    showGrid: true,
    showDimensions: true,
  });

  const html = renderToStaticMarkup(<CarSvg layers={scene.layers} bounds={scene.bounds} />);

  it('レイヤーごとに g 要素を出す', () => {
    for (const id of ['grid', 'a', 'b', 'dimensions']) {
      expect(html).toContain(`data-layer="${id}"`);
    }
  });

  it('2台目は色を切り替えるクラスを持つ', () => {
    expect(html).toContain('car--b');
  });

  it('グリッドと寸法線には色のクラスを付けない', () => {
    const gridLayer = html.match(/<g[^>]*data-layer="grid"[^>]*>/)?.[0] ?? '';

    expect(gridLayer).not.toContain('car--a');
    expect(gridLayer).not.toContain('car--b');
  });

  it('オフセットのあるレイヤーは transform で位置を合わせる', () => {
    const sideBySide = buildScene({
      a: resolve({ silhouette: 'suv' }),
      b: resolve({ silhouette: 'sedan' }),
      view: 'side',
      compare: 'sideBySide',
      origin: 'front',
      active: 'a',
      showGrid: false,
      showDimensions: false,
    });
    const markup = renderToStaticMarkup(
      <CarSvg layers={sideBySide.layers} bounds={sideBySide.bounds} />,
    );

    expect(markup).toMatch(/data-layer="b"[^>]*transform="translate\(/);
  });

  it('オフセットが 0 のレイヤーには transform を付けない', () => {
    const layerA = html.match(/<g[^>]*data-layer="a"[^>]*>/)?.[0] ?? '';

    expect(layerA).not.toContain('transform');
  });
});
