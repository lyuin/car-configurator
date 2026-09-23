import { decodeState, DEFAULT_STATE, encodeState, SCHEMA_VERSION } from '../url';
import type { AppState, CarState } from '../url';
import type { CarInput } from '../../domain/types';

const state = (overrides: Partial<AppState> = {}): AppState => ({
  ...DEFAULT_STATE,
  ...overrides,
});

const carA = (car: CarInput, presetId?: string): CarState => ({
  car,
  ...(presetId !== undefined ? { presetId } : {}),
});

describe('encodeState', () => {
  it('スキーマ版を先頭に置く', () => {
    expect(encodeState(DEFAULT_STATE).startsWith(`${SCHEMA_VERSION}&`)).toBe(true);
  });

  it('既定値と同じ項目は省略する', () => {
    expect(encodeState(DEFAULT_STATE)).toBe('s1&a=sil:suv');
  });

  it('既定値と異なる表示設定だけを載せる', () => {
    expect(encodeState(state({ view: 'front' }))).toBe('s1&v=front&a=sil:suv');
    expect(encodeState(state({ showGrid: false }))).toBe('s1&g=0&a=sil:suv');
    expect(encodeState(state({ showDimensions: true }))).toBe('s1&d=1&a=sil:suv');
  });

  it('明示指定した寸法だけを短縮キーで載せる', () => {
    const encoded = encodeState(
      state({ a: carA({ silhouette: 'suv', length: 4600, wheelbase: 2700 }) }),
    );

    expect(encoded).toBe('s1&a=sil:suv,L:4600,wb:2700');
  });

  it('推定値は URL に入らない', () => {
    const encoded = encodeState(state({ a: carA({ silhouette: 'sedan', length: 4700 }) }));

    expect(encoded).not.toContain('H:');
    expect(encoded).not.toContain('wb:');
    expect(encoded).not.toContain('t:');
  });

  it('タイヤ表記のスラッシュはそのまま残す', () => {
    const encoded = encodeState(state({ a: carA({ silhouette: 'suv', tire: '225/55R19' }) }));

    expect(encoded).toContain('t:225/55R19');
  });

  it('車種の ID を載せる', () => {
    const encoded = encodeState(
      state({ a: carA({ silhouette: 'suv', length: 4575 }, 'mazda-cx-5') }),
    );

    expect(encoded).toContain('p=mazda-cx-5');
  });

  it('2台目が無いときは比較の設定を載せない', () => {
    const encoded = encodeState(state({ compare: 'sideBySide', origin: 'axle', active: 'b' }));

    expect(encoded).not.toContain('m=');
    expect(encoded).not.toContain('o=');
    expect(encoded).not.toContain('act=');
    expect(encoded).not.toContain('b=');
  });

  it('2台目があるときは車Bと比較の設定を載せる', () => {
    const encoded = encodeState(
      state({
        a: carA({ silhouette: 'suv', length: 4575 }),
        b: carA({ silhouette: 'sedan', length: 4885 }),
        compare: 'sideBySide',
        origin: 'axle',
        active: 'b',
      }),
    );

    expect(encoded).toContain('m=sbs');
    expect(encoded).toContain('o=axle');
    expect(encoded).toContain('act=b');
    expect(encoded).toContain('b=sil:sedan,L:4885');
  });

  it('2台分を全項目指定しても URL が現実的な長さに収まる', () => {
    const full: CarInput = {
      name: 'マイカー',
      silhouette: 'pickup',
      length: 5325,
      width: 1865,
      height: 1785,
      wheelbase: 3195,
      frontOverhang: 825,
      rearOverhang: 1305,
      trackFront: 1595,
      trackRear: 1595,
      groundClearance: 220,
      tire: '265/65R19',
      doors: 4,
    };
    const encoded = encodeState(
      state({
        view: 'top',
        showGrid: false,
        showDimensions: true,
        compare: 'sideBySide',
        origin: 'center',
        a: carA(full, 'toyota-hilux'),
        b: carA({ ...full, name: 'もう一台' }, 'ford-f-150'),
      }),
    );

    expect(encoded.length).toBeLessThan(400);
  });
});

describe('decodeState / encodeState のラウンドトリップ', () => {
  const cases: AppState[] = [
    DEFAULT_STATE,
    state({ view: 'front' }),
    state({ view: 'top', showGrid: false, showDimensions: true }),
    state({ a: carA({ silhouette: 'kei' }) }),
    state({ a: carA({ silhouette: 'suv', length: 4600 }) }),
    state({ a: carA({ silhouette: 'suv', length: 4575 }, 'mazda-cx-5') }),
    state({
      a: carA({ silhouette: 'sedan', length: 4700, wheelbase: 2800, frontOverhang: 900 }),
    }),
    state({ a: carA({ silhouette: 'sports', tire: '275/35R20', doors: 2 }) }),
    // 2台比較
    state({
      a: carA({ silhouette: 'suv', length: 4575 }),
      b: carA({ silhouette: 'sedan', length: 4885 }),
    }),
    state({
      a: carA({ silhouette: 'suv', length: 4575 }, 'mazda-cx-5'),
      b: carA({ silhouette: 'sedan', length: 4885 }, 'toyota-camry'),
      compare: 'sideBySide',
      origin: 'center',
      active: 'b',
      view: 'top',
      showDimensions: true,
    }),
  ];

  it.each(cases)('復元して同じ状態に戻る (%j)', (original) => {
    expect(decodeState(encodeState(original))).toEqual(original);
  });

  it('先頭の # があってもなくても同じ結果になる', () => {
    const encoded = encodeState(state({ a: carA({ silhouette: 'suv', length: 4600 }) }));

    expect(decodeState(`#${encoded}`)).toEqual(decodeState(encoded));
  });

  it('名前に記号や空白が入っても復元できる', () => {
    for (const name of ['マイ カー', 'a,b', 'x=y', 'p&q', '100%', 'a:b']) {
      const original = state({ a: carA({ silhouette: 'suv', name }) });

      expect(decodeState(encodeState(original)).a.car.name).toBe(name);
    }
  });
});

describe('decodeState 壊れた入力', () => {
  it('空のハッシュは既定値に戻る', () => {
    expect(decodeState('')).toEqual(DEFAULT_STATE);
    expect(decodeState('#')).toEqual(DEFAULT_STATE);
  });

  it('版が違うハッシュは既定値に戻る', () => {
    expect(decodeState('s0&a=sil:kei,L:3395')).toEqual(DEFAULT_STATE);
    expect(decodeState('s99&a=sil:kei')).toEqual(DEFAULT_STATE);
    expect(decodeState('a=sil:kei')).toEqual(DEFAULT_STATE);
  });

  it('意味をなさない文字列でも落ちない', () => {
    for (const hash of ['#####', 's1&&&&', 's1&=', 's1&a=', 's1&a=:::', 's1&a=,,,']) {
      expect(() => decodeState(hash)).not.toThrow();
      expect(decodeState(hash).a.car.silhouette).toBe('suv');
    }
  });

  it('未知のキーは無視して残りを読む', () => {
    const decoded = decodeState('s1&zz=99&v=top&unknown=x&a=sil:kei,L:3395,qq:1');

    expect(decoded.view).toBe('top');
    expect(decoded.a.car.silhouette).toBe('kei');
    expect(decoded.a.car.length).toBe(3395);
  });

  it('未知のシルエットは既定値にする', () => {
    expect(decodeState('s1&a=sil:spaceship,L:4000').a.car.silhouette).toBe('suv');
    expect(decodeState('s1&a=sil:spaceship,L:4000').a.car.length).toBe(4000);
  });

  it('未知のビューや基準点や比較モードは既定値にする', () => {
    expect(decodeState('s1&v=isometric&a=sil:suv').view).toBe('side');
    expect(decodeState('s1&o=moon&a=sil:suv&b=sil:sedan').origin).toBe('front');
    expect(decodeState('s1&m=hologram&a=sil:suv&b=sil:sedan').compare).toBe('overlay');
  });

  it('数値でない寸法や範囲外の寸法は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,L:abc').a.car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:-500').a.car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:0').a.car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:99999').a.car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:45.5').a.car.length).toBeUndefined();
  });

  it('解釈できないタイヤ表記は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,t:225-55-19').a.car.tire).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,t:hello').a.car.tire).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,t:999/55R19').a.car.tire).toBeUndefined();
  });

  it('存在しない車種 ID は捨てる', () => {
    expect(decodeState('s1&p=delorean&a=sil:suv').a.presetId).toBeUndefined();
    expect(decodeState('s1&p=mazda-cx-5&a=sil:suv').a.presetId).toBe('mazda-cx-5');
  });

  it('範囲外のドア数は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,dr:0').a.car.doors).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,dr:99').a.car.doors).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,dr:4').a.car.doors).toBe(4);
  });

  it('表示設定は 1 以外をすべて false として扱う', () => {
    expect(decodeState('s1&g=0&a=sil:suv').showGrid).toBe(false);
    expect(decodeState('s1&g=yes&a=sil:suv').showGrid).toBe(false);
    expect(decodeState('s1&d=1&a=sil:suv').showDimensions).toBe(true);
  });

  it('2台目が無いのに act=b が来たら車A の編集に戻す', () => {
    // そのまま受け入れると編集先が存在しなくなる
    expect(decodeState('s1&act=b&a=sil:suv').active).toBe('a');
    expect(decodeState('s1&act=b&a=sil:suv&b=sil:sedan').active).toBe('b');
  });

  it('1台だけの既存 URL がそのまま読める（後方互換）', () => {
    const decoded = decodeState('s1&v=front&d=1&p=mazda-cx-5&a=sil:suv,L:4575,wb:2700');

    expect(decoded.b).toBeUndefined();
    expect(decoded.a.presetId).toBe('mazda-cx-5');
    expect(decoded.a.car.length).toBe(4575);
    expect(decoded.view).toBe('front');
    expect(decoded.showDimensions).toBe(true);
  });
});
