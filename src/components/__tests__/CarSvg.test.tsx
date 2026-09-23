import { renderToStaticMarkup } from 'react-dom/server';
import { CarSvg } from '../CarSvg';
import { buildSideView } from '../../domain/geometry';
import { resolve } from '../../domain/resolve';
import { SILHOUETTES } from '../../domain/types';

function render(silhouette: (typeof SILHOUETTES)[number]) {
  const geometry = buildSideView(resolve({ silhouette }));
  return renderToStaticMarkup(
    <CarSvg shapes={geometry.shapes} bounds={geometry.bounds} title={silhouette} />,
  );
}

describe('CarSvg', () => {
  it.each(SILHOUETTES)('%s の側面図が変化しないこと', (silhouette) => {
    expect(render(silhouette)).toMatchSnapshot();
  });

  it('viewBox を mm 単位でとり余白を含める', () => {
    const geometry = buildSideView(resolve({ silhouette: 'suv', length: 4575 }));
    const html = renderToStaticMarkup(
      <CarSvg shapes={geometry.shapes} bounds={geometry.bounds} padding={100} />,
    );

    // minX = -150（地面線の延長）, padding 100 → -250
    expect(html).toContain('viewBox="-250');
  });

  it('線の太さが図のスケールに影響されないよう non-scaling-stroke を付ける', () => {
    const html = render('sedan');

    expect(html).toContain('vector-effect="non-scaling-stroke"');
  });

  it('タイトルを渡すと画像として読み上げられる', () => {
    const html = render('suv');

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="suv"');
  });

  it('タイトルがなければ支援技術から隠す', () => {
    const geometry = buildSideView(resolve({ silhouette: 'suv' }));
    const html = renderToStaticMarkup(
      <CarSvg shapes={geometry.shapes} bounds={geometry.bounds} />,
    );

    expect(html).toContain('aria-hidden="true"');
  });

  it('比較用に variant でクラスを切り替えられる', () => {
    const geometry = buildSideView(resolve({ silhouette: 'suv' }));
    const html = renderToStaticMarkup(
      <CarSvg shapes={geometry.shapes} bounds={geometry.bounds} variant="b" />,
    );

    expect(html).toContain('car--b');
  });
});
