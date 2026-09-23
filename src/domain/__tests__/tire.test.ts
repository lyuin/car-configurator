import { formatTireSpec, MM_PER_INCH, parseTireSpec, tireOuterDiameter } from '../tire';

/** テストの可読性のため、成功前提で値を取り出すヘルパ */
function parseOk(input: string) {
  const result = parseTireSpec(input);
  if (!result.ok) {
    throw new Error(`パースに失敗した: ${input} / ${result.error}`);
  }
  return result.value;
}

function parseErr(input: string) {
  const result = parseTireSpec(input);
  if (result.ok) {
    throw new Error(`パースが成功してしまった: ${input}`);
  }
  return result.error;
}

describe('tireOuterDiameter', () => {
  it('リム径とサイドウォール高から外径を求める', () => {
    // 18 inch = 457.2mm, サイドウォール 225 * 0.55 = 123.75mm
    expect(tireOuterDiameter(225, 55, 18)).toBeCloseTo(704.7, 5);
  });

  it('扁平率が下がると外径も小さくなる', () => {
    expect(tireOuterDiameter(225, 40, 18)).toBeLessThan(tireOuterDiameter(225, 55, 18));
  });

  it('同じ外径でもリム径が大きいほどサイドウォールが薄くなる（インチアップ）', () => {
    // 205/55R16 と 225/45R17 はほぼ同じ外径になる組み合わせ
    expect(tireOuterDiameter(205, 55, 16)).toBeCloseTo(631.9, 1);
    expect(tireOuterDiameter(225, 45, 17)).toBeCloseTo(634.3, 1);
  });
});

describe('parseTireSpec 正常系', () => {
  it('標準的な表記を解析する', () => {
    const tire = parseOk('225/55R18');
    expect(tire).toMatchObject({
      notation: '225/55R18',
      width: 225,
      aspectRatio: 55,
      rimDiameterInch: 18,
    });
    expect(tire.rimDiameter).toBeCloseTo(457.2, 5);
    expect(tire.sidewallHeight).toBeCloseTo(123.75, 5);
    expect(tire.outerDiameter).toBeCloseTo(704.7, 5);
  });

  it('軽自動車のサイズを解析する', () => {
    const tire = parseOk('165/55R15');
    expect(tire.sidewallHeight).toBeCloseTo(90.75, 5);
    expect(tire.outerDiameter).toBeCloseTo(562.5, 5);
  });

  it('大径SUVのサイズを解析する', () => {
    const tire = parseOk('285/45R22');
    expect(tire.outerDiameter).toBeCloseTo(815.3, 5);
  });

  it('リム径 0.5 刻みを解析する', () => {
    const tire = parseOk('185/60R14.5');
    expect(tire.rimDiameterInch).toBe(14.5);
    expect(tire.outerDiameter).toBeCloseTo(590.3, 5);
  });

  it('リム径の inch から mm への換算が 25.4 倍になっている', () => {
    const tire = parseOk('195/65R15');
    expect(tire.rimDiameter).toBeCloseTo(15 * MM_PER_INCH, 5);
  });
});

describe('parseTireSpec 表記の揺れ', () => {
  it.each([
    ['小文字の r', '225/55r18'],
    ['前後の空白', '  225/55R18  '],
    ['スラッシュ前後の空白', '225 / 55 R18'],
    ['Z レーティング', '225/55ZR18'],
    ['P メトリックのプレフィックス', 'P225/55R18'],
    ['LT のプレフィックス', 'LT225/55R18'],
    ['末尾のロードインデックスと速度記号', '225/55R18 95V'],
    ['末尾の余分な記述', '225/55R18 95V XL'],
    ['全角（iPadの日本語キーボード対策）', '２２５／５５Ｒ１８'],
  ])('%s を解析できる', (_label, input) => {
    expect(parseOk(input).notation).toBe('225/55R18');
  });
});

describe('parseTireSpec 異常系', () => {
  it('空文字は入力を促すメッセージを返す', () => {
    expect(parseErr('')).toContain('入力してください');
    expect(parseErr('   ')).toContain('入力してください');
  });

  it.each([
    ['数値でない文字列', 'abcdef'],
    ['区切りがハイフン', '225-55-18'],
    ['スラッシュがない', '2255518'],
    ['扁平率がない', '225/R18'],
    ['R がない', '225/55 18'],
  ])('%s は形式エラーになる', (_label, input) => {
    expect(parseErr(input)).toContain('225/55R18 の形式');
  });

  it.each([
    ['タイヤ幅が小さすぎる', '95/55R18', 'タイヤ幅'],
    ['タイヤ幅が大きすぎる', '405/55R18', 'タイヤ幅'],
    ['扁平率が小さすぎる', '225/10R18', '扁平率'],
    ['扁平率が大きすぎる', '225/99R18', '扁平率'],
    ['リム径が大きすぎる', '225/55R32', 'リム径'],
  ])('%s は範囲エラーになる', (_label, input, expectedLabel) => {
    const error = parseErr(input);
    expect(error).toContain(expectedLabel);
    expect(error).toContain('範囲');
  });
});

describe('formatTireSpec', () => {
  it('解析結果を元の表記に戻せる', () => {
    expect(formatTireSpec(parseOk('225/55R18'))).toBe('225/55R18');
  });

  it('揺れのある入力を正規化した表記に整える', () => {
    expect(formatTireSpec(parseOk('p225/55zr18 95v'))).toBe('225/55R18');
  });
});
