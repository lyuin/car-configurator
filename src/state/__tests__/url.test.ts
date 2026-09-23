import { decodeState, DEFAULT_STATE, encodeState, SCHEMA_VERSION } from '../url';
import type { AppState } from '../url';

const state = (overrides: Partial<AppState> = {}): AppState => ({
  ...DEFAULT_STATE,
  ...overrides,
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
      state({ car: { silhouette: 'suv', length: 4600, wheelbase: 2700 } }),
    );

    expect(encoded).toBe('s1&a=sil:suv,L:4600,wb:2700');
  });

  it('推定値は URL に入らない', () => {
    const encoded = encodeState(state({ car: { silhouette: 'sedan', length: 4700 } }));

    expect(encoded).not.toContain('H:');
    expect(encoded).not.toContain('wb:');
    expect(encoded).not.toContain('t:');
  });

  it('タイヤ表記のスラッシュはそのまま残す', () => {
    const encoded = encodeState(state({ car: { silhouette: 'suv', tire: '225/55R19' } }));

    expect(encoded).toContain('t:225/55R19');
  });

  it('全項目を指定しても URL が現実的な長さに収まる', () => {
    const encoded = encodeState(
      state({
        view: 'top',
        showGrid: false,
        showDimensions: true,
        car: {
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
        },
      }),
    );

    expect(encoded.length).toBeLessThan(200);
  });
});

describe('decodeState / encodeState のラウンドトリップ', () => {
  const cases: AppState[] = [
    DEFAULT_STATE,
    state({ view: 'front' }),
    state({ view: 'top', showGrid: false, showDimensions: true }),
    state({ car: { silhouette: 'kei' } }),
    state({ car: { silhouette: 'suv', length: 4600 } }),
    state({ car: { silhouette: 'sedan', length: 4700, wheelbase: 2800, frontOverhang: 900 } }),
    state({ car: { silhouette: 'sports', tire: '275/35R20', doors: 2 } }),
    state({
      car: {
        silhouette: 'minivan',
        length: 4995,
        width: 1850,
        height: 1925,
        wheelbase: 3000,
        frontOverhang: 950,
        rearOverhang: 1045,
        trackFront: 1580,
        trackRear: 1580,
        groundClearance: 150,
        tire: '225/60R18',
        doors: 5,
      },
    }),
  ];

  it.each(cases)('復元して同じ状態に戻る (%j)', (original) => {
    expect(decodeState(encodeState(original))).toEqual(original);
  });

  it('先頭の # があってもなくても同じ結果になる', () => {
    const encoded = encodeState(state({ car: { silhouette: 'suv', length: 4600 } }));

    expect(decodeState(`#${encoded}`)).toEqual(decodeState(encoded));
  });

  it('名前に記号や空白が入っても復元できる', () => {
    for (const name of ['マイ カー', 'a,b', 'x=y', 'p&q', '100%', 'a:b']) {
      const original = state({ car: { silhouette: 'suv', name } });

      expect(decodeState(encodeState(original)).car.name).toBe(name);
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
      expect(decodeState(hash).car.silhouette).toBe('suv');
    }
  });

  it('未知のキーは無視して残りを読む', () => {
    const decoded = decodeState('s1&zz=99&v=top&unknown=x&a=sil:kei,L:3395,qq:1');

    expect(decoded.view).toBe('top');
    expect(decoded.car.silhouette).toBe('kei');
    expect(decoded.car.length).toBe(3395);
  });

  it('未知のシルエットは既定値にする', () => {
    expect(decodeState('s1&a=sil:spaceship,L:4000').car.silhouette).toBe('suv');
    expect(decodeState('s1&a=sil:spaceship,L:4000').car.length).toBe(4000);
  });

  it('未知のビューは既定値にする', () => {
    expect(decodeState('s1&v=isometric&a=sil:suv').view).toBe('side');
  });

  it('数値でない寸法や範囲外の寸法は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,L:abc').car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:-500').car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:0').car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:99999').car.length).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,L:45.5').car.length).toBeUndefined();
  });

  it('解釈できないタイヤ表記は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,t:225-55-19').car.tire).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,t:hello').car.tire).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,t:999/55R19').car.tire).toBeUndefined();
  });

  it('範囲外のドア数は捨てる', () => {
    expect(decodeState('s1&a=sil:suv,dr:0').car.doors).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,dr:99').car.doors).toBeUndefined();
    expect(decodeState('s1&a=sil:suv,dr:4').car.doors).toBe(4);
  });

  it('表示設定は 1 以外をすべて false として扱う', () => {
    expect(decodeState('s1&g=0&a=sil:suv').showGrid).toBe(false);
    expect(decodeState('s1&g=yes&a=sil:suv').showGrid).toBe(false);
    expect(decodeState('s1&d=1&a=sil:suv').showDimensions).toBe(true);
  });
});
