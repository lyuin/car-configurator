import { buildSpecRows, formatDiff } from '../specTable';
import { resolve } from '../resolve';

const cx5 = resolve({ silhouette: 'suv', length: 4575 });
const camry = resolve({ silhouette: 'sedan', length: 4885 });

function row(label: string, a = cx5, b = camry) {
  const found = buildSpecRows(a, b).find((item) => item.label === label);
  if (found === undefined) {
    throw new Error(`行が見つからない: ${label}`);
  }
  return found;
}

describe('buildSpecRows 1台のとき', () => {
  const rows = buildSpecRows(cx5);

  it('B の値と差分を持たない', () => {
    for (const item of rows) {
      expect(item.b).toBeUndefined();
      expect(item.diff).toBeUndefined();
    }
  });

  it('主要項目が並ぶ', () => {
    const labels = rows.map((item) => item.label);

    expect(labels).toContain('全長');
    expect(labels).toContain('全幅');
    expect(labels).toContain('全高');
    expect(labels).toContain('ホイールベース');
    expect(labels).toContain('フロントオーバーハング');
    expect(labels).toContain('リアオーバーハング');
    expect(labels).toContain('フロントトレッド');
    expect(labels).toContain('リアトレッド');
    expect(labels).toContain('最低地上高');
    expect(labels).toContain('タイヤ');
    expect(labels).toContain('タイヤ外径');
    expect(labels).toContain('ドア数');
    expect(labels).toContain('シルエット');
  });

  it('数値は mm 付きで桁区切りされる', () => {
    expect(row('全長', cx5, cx5).a).toBe('4,575 mm');
  });
});

describe('buildSpecRows 2台のとき', () => {
  it('差分は B − A になる', () => {
    expect(row('全長').diff).toBe(camry.length - cx5.length);
    expect(row('全長').diff).toBe(310);
  });

  it('B の方が小さい項目は負の差分になる', () => {
    // SUV の方が背が高い
    expect(row('全高').diff).toBeLessThan(0);
  });

  it('同じ値なら差分が 0 になる', () => {
    expect(row('全長', cx5, cx5).diff).toBe(0);
  });

  it('文字の項目は差分を持たず、違うかどうかだけを示す', () => {
    const silhouette = row('シルエット');

    expect(silhouette.diff).toBeUndefined();
    expect(silhouette.differs).toBe(true);
    expect(silhouette.a).toBe('SUV');
    expect(silhouette.b).toBe('セダン');
  });

  it('同じ文字の項目は differs が false になる', () => {
    expect(row('シルエット', cx5, cx5).differs).toBe(false);
  });

  it('タイヤは表記と外径の両方を並べる', () => {
    expect(row('タイヤ').a).toBe(cx5.tire.notation);
    expect(row('タイヤ外径').diff).toBe(
      Math.round(camry.tire.outerDiameter) - Math.round(cx5.tire.outerDiameter),
    );
  });

  it('サイドシル高も比較できる', () => {
    expect(row('サイドシル高').diff).toBeLessThan(0);
  });
});

describe('formatDiff', () => {
  it('プラスにも符号を付ける', () => {
    expect(formatDiff(310)).toBe('+310');
  });

  it('マイナスは全角マイナスで表す', () => {
    expect(formatDiff(-245)).toBe('−245');
  });

  it('0 は ±0 と表す', () => {
    expect(formatDiff(0)).toBe('±0');
  });

  it('桁区切りする', () => {
    expect(formatDiff(1200)).toBe('+1,200');
  });
});
