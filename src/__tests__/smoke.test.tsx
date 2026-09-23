import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';

/**
 * React + TSX + Vitest の配線が通っていることの確認。
 * Task 4 以降の SVG スナップショットテストも同じ仕組みで書く。
 */
describe('App', () => {
  it('タイトルを描画する', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Car Silhouette Configurator');
  });
});
