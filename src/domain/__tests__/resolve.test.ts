import { MIN_OVERHANG, resolve } from '../resolve';
import { SILHOUETTE_RATIOS } from '../ratios';
import { SILHOUETTES } from '../types';
import type { CarInput, Silhouette } from '../types';

describe('resolve 全長だけ指定したとき', () => {
  it('SUV の未指定項目を比率から埋める', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600 });

    expect(spec.length).toBe(4600);
    expect(spec.wheelbase).toBe(2690); // 4600 * 0.585
    expect(spec.frontOverhang).toBe(945); // 4600 * 0.205
    expect(spec.rearOverhang).toBe(965); // 残り
    expect(spec.width).toBe(1855); // 4600 * 0.403
    expect(spec.height).toBe(1695); // 4600 * 0.369
    expect(spec.groundClearance).toBe(200);
    expect(spec.doors).toBe(5);
    expect(spec.warnings).toEqual([]);
  });

  it('指定した項目は explicit、埋めた項目は derived になる', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600 });

    expect(spec.source.length).toBe('explicit');
    expect(spec.source.wheelbase).toBe('derived');
    expect(spec.source.tire).toBe('derived');
  });

  it('プリセット由来の項目は preset として区別される', () => {
    const spec = resolve(
      { silhouette: 'suv', length: 4600, width: 1845 },
      { presetFields: new Set(['width']) },
    );

    expect(spec.source.length).toBe('explicit');
    expect(spec.source.width).toBe('preset');
  });

  it('シルエットを変えると未指定項目だけが変わる', () => {
    const sedan = resolve({ silhouette: 'sedan', length: 4600 });
    const suv = resolve({ silhouette: 'suv', length: 4600 });

    expect(sedan.length).toBe(suv.length);
    expect(sedan.height).toBeLessThan(suv.height);
    expect(sedan.groundClearance).toBeLessThan(suv.groundClearance);
    expect(sedan.doors).toBe(4);
    expect(suv.doors).toBe(5);
  });
});

describe('resolve 何も指定しないとき', () => {
  it.each(SILHOUETTES)('%s は代表車の全長を基準に組み立てる', (silhouette) => {
    const spec = resolve({ silhouette });

    expect(spec.length).toBe(SILHOUETTE_RATIOS[silhouette].defaultLength);
    expect(spec.warnings).toEqual([]);
  });
});

describe('resolve ロックの追従', () => {
  it('ホイールベースをロックして全長を伸ばすと前後オーバーハングだけが伸びる', () => {
    const base: CarInput = { silhouette: 'suv', length: 4600, wheelbase: 2700 };
    const longer = resolve({ ...base, length: 4800 });
    const shorter = resolve(base);

    expect(shorter.wheelbase).toBe(2700);
    expect(longer.wheelbase).toBe(2700);
    expect(longer.frontOverhang).toBeGreaterThan(shorter.frontOverhang);
    expect(longer.rearOverhang).toBeGreaterThan(shorter.rearOverhang);
    expect(longer.length - shorter.length).toBe(200);
  });

  it('フロントオーバーハングをロックするとリア側で差を吸収する', () => {
    const spec = resolve({ silhouette: 'sedan', length: 4700, frontOverhang: 1100 });

    expect(spec.frontOverhang).toBe(1100);
    expect(spec.source.frontOverhang).toBe('explicit');
    expect(spec.frontOverhang + spec.wheelbase + spec.rearOverhang).toBe(spec.length);
  });

  it('全長が未指定でもホイールベースから逆算する', () => {
    const spec = resolve({ silhouette: 'sedan', wheelbase: 2900 });

    // 2900 / 0.58 = 5000
    expect(spec.length).toBe(5000);
    expect(spec.source.length).toBe('derived');
    expect(spec.source.wheelbase).toBe('explicit');
  });

  it('全長が未指定でホイールベースと前後オーバーハングが揃えば合計が全長になる', () => {
    const spec = resolve({
      silhouette: 'sedan',
      wheelbase: 2800,
      frontOverhang: 900,
      rearOverhang: 1000,
    });

    expect(spec.length).toBe(4700);
    expect(spec.warnings).toEqual([]);
  });
});

describe('resolve 矛盾した指定', () => {
  it('全長と各部の合計が合わないときは全長側で吸収し警告を出す', () => {
    const spec = resolve({
      silhouette: 'sedan',
      length: 4700,
      wheelbase: 2800,
      frontOverhang: 900,
      rearOverhang: 1200, // 合計 4900
    });

    expect(spec.length).toBe(4900);
    expect(spec.warnings).toHaveLength(1);
    expect(spec.warnings[0]).toContain('4900');
  });

  it('ホイールベースが全長に対して長すぎるとオーバーハングを下限で打ち切る', () => {
    const spec = resolve({ silhouette: 'sedan', length: 3000, wheelbase: 2800 });

    expect(spec.frontOverhang).toBe(MIN_OVERHANG);
    expect(spec.rearOverhang).toBe(MIN_OVERHANG);
    expect(spec.warnings.join()).toContain(`${MIN_OVERHANG}mm`);
    // 図が成立するよう全長は再計算される
    expect(spec.length).toBe(3200);
  });

  it('トレッドが全幅を超える指定は内側に収める', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, width: 1800, trackFront: 1900 });

    expect(spec.trackFront).toBeLessThan(1800);
    expect(spec.warnings.join()).toContain('トレッド');
  });

  it('最低地上高がタイヤ半径以上の指定は収める', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, groundClearance: 600 });

    expect(spec.groundClearance).toBeLessThan(spec.tire.outerDiameter / 2);
    expect(spec.warnings.join()).toContain('最低地上高');
  });

  it('全高がタイヤ外径以下なら警告する', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, height: 600 });

    expect(spec.warnings.join()).toContain('全高');
  });

  it('解釈できないタイヤサイズは警告して推定値にフォールバックする', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, tire: '225-55-19' });

    expect(spec.tire.outerDiameter).toBeGreaterThan(0);
    expect(spec.warnings.join()).toContain('タイヤサイズ');
    expect(spec.source.tire).toBe('explicit');
  });
});

describe('resolve タイヤの推定', () => {
  it('指定したタイヤサイズをそのまま使う', () => {
    const spec = resolve({ silhouette: 'suv', length: 4600, tire: '225/55R19' });

    expect(spec.tire.notation).toBe('225/55R19');
    expect(spec.source.tire).toBe('explicit');
  });

  it('CX-5 相当の寸法から実車と同じ 225/55R19 を導く', () => {
    const spec = resolve({ silhouette: 'suv', length: 4575 });

    expect(spec.tire.notation).toBe('225/55R19');
  });

  it('スポーツカーは幅広で薄いサイドウォールになる', () => {
    const spec = resolve({ silhouette: 'sports' });

    expect(spec.tire.notation).toBe('275/35R20');
    // 扁平率が低く、リム径が外径の大半を占める
    expect(spec.tire.aspectRatio).toBeLessThanOrEqual(40);
    expect(spec.tire.rimDiameter / spec.tire.outerDiameter).toBeGreaterThan(0.7);
  });

  it('同じ全長ならスポーツカーの方がセダンより低く幅広になる', () => {
    const sports = resolve({ silhouette: 'sports', length: 4500 });
    const sedan = resolve({ silhouette: 'sedan', length: 4500 });

    expect(sports.height).toBeLessThan(sedan.height);
    expect(sports.width).toBeGreaterThan(sedan.width);
    expect(sports.wheelbase).toBeLessThan(sedan.wheelbase);
  });

  it('全長を伸ばすとタイヤ外径も追従して大きくなる', () => {
    const small = resolve({ silhouette: 'suv', length: 4200 });
    const large = resolve({ silhouette: 'suv', length: 5100 });

    expect(large.tire.outerDiameter).toBeGreaterThan(small.tire.outerDiameter);
  });

  it.each(SILHOUETTES)('%s の推定タイヤが車体に対して妥当な大きさになる', (silhouette) => {
    const spec = resolve({ silhouette });
    const ratio = spec.tire.outerDiameter / spec.length;

    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.2);
    // タイヤは車体の内側に収まる
    expect(spec.tire.outerDiameter).toBeLessThan(spec.height);
    expect(spec.tire.width * 2).toBeLessThan(spec.width);
  });
});

describe('resolve の不変条件', () => {
  const inputs: CarInput[] = [
    { silhouette: 'sedan' },
    { silhouette: 'suv', length: 4600 },
    { silhouette: 'kei', length: 3395, wheelbase: 2520 },
    { silhouette: 'hatch', length: 4000, frontOverhang: 850 },
    { silhouette: 'pickup', wheelbase: 3100, rearOverhang: 1200 },
    { silhouette: 'minivan', length: 4900, wheelbase: 2950, frontOverhang: 950, rearOverhang: 1000 },
    { silhouette: 'coupe', length: 4400, tire: '245/35R20' },
    { silhouette: 'sports', length: 4500, height: 1200 },
  ];

  it.each(inputs)('全長 = フロントOH + WB + リアOH が成立する (%j)', (input) => {
    const spec = resolve(input);

    expect(spec.frontOverhang + spec.wheelbase + spec.rearOverhang).toBe(spec.length);
  });

  it.each(inputs)('すべての寸法が正の値になる (%j)', (input) => {
    const spec = resolve(input);

    for (const [key, value] of Object.entries(spec)) {
      if (typeof value === 'number') {
        expect(value, `${key} が正の値でない`).toBeGreaterThan(0);
      }
    }
  });

  it.each(SILHOUETTES)('%s はトレッドが全幅の内側に収まる', (silhouette: Silhouette) => {
    const spec = resolve({ silhouette });

    expect(spec.trackFront).toBeLessThan(spec.width);
    expect(spec.trackRear).toBeLessThan(spec.width);
  });
});
