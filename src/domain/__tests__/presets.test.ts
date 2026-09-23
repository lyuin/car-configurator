import {
  filterPresets,
  findPreset,
  PRESETS,
  presetFieldsOf,
  presetToCarInput,
} from '../presets';
import { parseTireSpec } from '../tire';
import { resolve } from '../resolve';
import { SILHOUETTE_RATIOS } from '../ratios';
import { SILHOUETTES } from '../types';
import type { CarPreset } from '../presets';

describe('PRESETS のスキーマ', () => {
  it('30台ある', () => {
    expect(PRESETS).toHaveLength(30);
  });

  it('ID が一意', () => {
    const ids = PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ID が kebab-case', () => {
    for (const preset of PRESETS) {
      expect(preset.id, preset.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('名前が空でない', () => {
    for (const preset of PRESETS) {
      expect(preset.name.trim()).not.toBe('');
    }
  });

  it('シルエットが定義済みのもの', () => {
    for (const preset of PRESETS) {
      expect(SILHOUETTES, preset.name).toContain(preset.silhouette);
    }
  });

  it.each(PRESETS)('$name のタイヤ表記が解釈できる', (preset: CarPreset) => {
    const parsed = parseTireSpec(preset.tire);

    expect(parsed.ok, `${preset.name}: ${preset.tire}`).toBe(true);
  });

  it.each(PRESETS)('$name の寸法が妥当な範囲にある', (preset: CarPreset) => {
    expect(preset.length).toBeGreaterThan(2000);
    expect(preset.length).toBeLessThan(6500);
    expect(preset.width).toBeGreaterThan(1300);
    expect(preset.width).toBeLessThan(2100);
    expect(preset.height).toBeGreaterThan(1100);
    expect(preset.height).toBeLessThan(2400);
    // ホイールベースは全長の内側に収まる。
    // 上限が 0.78 なのは、軽やマイクロカーは全長が短いのにホイールベースが長く
    // オーバーハングが極端に短いため（N-BOX 0.742、Ami 0.718）
    expect(preset.wheelbase).toBeLessThan(preset.length);
    expect(preset.wheelbase / preset.length).toBeGreaterThan(0.45);
    expect(preset.wheelbase / preset.length).toBeLessThan(0.78);
  });

  it('全長の昇順に並んでいる（一覧が大きさの並びとして読める）', () => {
    const lengths = PRESETS.map((preset) => preset.length);

    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });
});

describe('PRESETS の選定方針', () => {
  /**
   * 「寸法空間で散らばること」が選定方針。同じような大きさの車を複数入れても
   * 比較の役に立たないので、どの2台も主要寸法のどれかで明確に違うことを保証する。
   */
  it('どの2台も全長・全幅・全高・WB のどれかで 50mm 以上違う', () => {
    for (let i = 0; i < PRESETS.length; i += 1) {
      for (let j = i + 1; j < PRESETS.length; j += 1) {
        const a = PRESETS[i]!;
        const b = PRESETS[j]!;
        const differences = [
          Math.abs(a.length - b.length),
          Math.abs(a.width - b.width),
          Math.abs(a.height - b.height),
          Math.abs(a.wheelbase - b.wheelbase),
        ];

        expect(Math.max(...differences), `${a.name} と ${b.name} が似すぎている`).toBeGreaterThan(
          50,
        );
      }
    }
  });

  it('全長が 2400〜5900mm の範囲に広がっている', () => {
    const lengths = PRESETS.map((preset) => preset.length);

    expect(Math.min(...lengths)).toBeLessThan(2500);
    expect(Math.max(...lengths)).toBeGreaterThan(5800);
  });

  it('全高が 1200〜2280mm の範囲に広がっている', () => {
    const heights = PRESETS.map((preset) => preset.height);

    expect(Math.min(...heights)).toBeLessThan(1250);
    expect(Math.max(...heights)).toBeGreaterThan(2200);
  });

  it('ホイールベース比に極端な例が含まれる', () => {
    const ratios = PRESETS.map((preset) => preset.wheelbase / preset.length);

    // 911 のような短いものと Ioniq 5 のような長いものの両方
    expect(Math.min(...ratios)).toBeLessThan(0.56);
    expect(Math.max(...ratios)).toBeGreaterThan(0.64);
  });

  it('全シルエットが少なくとも1台ずつ含まれる', () => {
    const used = new Set(PRESETS.map((preset) => preset.silhouette));

    for (const silhouette of SILHOUETTES) {
      expect(used, silhouette).toContain(silhouette);
    }
  });
});

describe('プリセットを resolve に通したとき', () => {
  it.each(PRESETS)('$name が警告なしで解決できる', (preset: CarPreset) => {
    const spec = resolve(presetToCarInput(preset));

    expect(spec.warnings, `${preset.name}: ${spec.warnings.join(' / ')}`).toEqual([]);
  });

  it.each(PRESETS)('$name の指定値がそのまま反映される', (preset: CarPreset) => {
    const spec = resolve(presetToCarInput(preset));

    expect(spec.length).toBe(preset.length);
    expect(spec.width).toBe(preset.width);
    expect(spec.height).toBe(preset.height);
    expect(spec.wheelbase).toBe(preset.wheelbase);
    expect(spec.tire.notation).toBe(parseOk(preset.tire));
  });

  it('ドア数を省略したプリセットはシルエットの既定値になる', () => {
    const golf = findPreset('vw-golf');
    if (golf === undefined) {
      throw new Error('vw-golf が見つからない');
    }

    expect(golf.doors).toBeUndefined();
    expect(resolve(presetToCarInput(golf)).doors).toBe(SILHOUETTE_RATIOS.hatch.doors);
  });

  it('フロントオーバーハングを指定したプリセットはその値になる', () => {
    const hiace = findPreset('toyota-hiace');
    if (hiace === undefined) {
      throw new Error('toyota-hiace が見つからない');
    }
    const spec = resolve(presetToCarInput(hiace));

    expect(spec.frontOverhang).toBe(690);
    // キャブオーバーなのでリアオーバーハングの方が遥かに長い
    expect(spec.rearOverhang).toBeGreaterThan(spec.frontOverhang * 2);
  });
});

function parseOk(notation: string): string {
  const parsed = parseTireSpec(notation);
  if (!parsed.ok) {
    throw new Error(`解釈できない表記: ${notation}`);
  }
  return parsed.value.notation;
}

describe('presetToCarInput', () => {
  it('名前とシルエットと主要寸法を明示値として入れる', () => {
    const cx5 = findPreset('mazda-cx-5')!;
    const input = presetToCarInput(cx5);

    expect(input).toEqual({
      name: 'Mazda CX-5',
      silhouette: 'suv',
      length: 4575,
      width: 1845,
      height: 1690,
      wheelbase: 2700,
      tire: '225/55R19',
    });
  });

  it('持っていない項目は入れない（自動補完に任せる）', () => {
    const input = presetToCarInput(findPreset('mazda-cx-5')!);

    expect(input.trackFront).toBeUndefined();
    expect(input.groundClearance).toBeUndefined();
    expect(input.rearOverhang).toBeUndefined();
  });
});

describe('presetFieldsOf', () => {
  const cx5 = findPreset('mazda-cx-5')!;

  it('プリセットのまま読み込んだ状態では全項目が車種由来', () => {
    const fields = presetFieldsOf(presetToCarInput(cx5), cx5);

    expect(fields.has('length')).toBe(true);
    expect(fields.has('width')).toBe(true);
    expect(fields.has('tire')).toBe(true);
  });

  it('変更した項目は車種由来から外れる', () => {
    const edited = { ...presetToCarInput(cx5), length: 4800 };
    const fields = presetFieldsOf(edited, cx5);

    expect(fields.has('length')).toBe(false);
    expect(fields.has('width')).toBe(true);
  });

  it('プリセットが無い状態では空になる', () => {
    expect(presetFieldsOf(presetToCarInput(cx5), undefined).size).toBe(0);
  });

  it('resolve に渡すと出所が preset と explicit に分かれる', () => {
    const edited = { ...presetToCarInput(cx5), length: 4800 };
    const spec = resolve(edited, { presetFields: presetFieldsOf(edited, cx5) });

    expect(spec.source.length).toBe('explicit');
    expect(spec.source.width).toBe('preset');
    expect(spec.source.groundClearance).toBe('derived');
  });
});

describe('findPreset / filterPresets', () => {
  it('ID で引ける', () => {
    expect(findPreset('mazda-cx-5')?.name).toBe('Mazda CX-5');
    expect(findPreset('nonexistent')).toBeUndefined();
  });

  it('空の検索語では全件返す', () => {
    expect(filterPresets('')).toHaveLength(30);
    expect(filterPresets('   ')).toHaveLength(30);
  });

  it('部分一致で絞り込む', () => {
    expect(filterPresets('toyota').length).toBeGreaterThan(5);
    expect(filterPresets('cx-5').map((p) => p.id)).toEqual(['mazda-cx-5']);
  });

  it('大文字小文字を無視する', () => {
    expect(filterPresets('TOYOTA').length).toBe(filterPresets('toyota').length);
  });

  it('全角で入力しても一致する', () => {
    expect(filterPresets('ｔｏｙｏｔａ').length).toBe(filterPresets('toyota').length);
  });

  it('該当がなければ空', () => {
    expect(filterPresets('存在しない車種')).toHaveLength(0);
  });
});
