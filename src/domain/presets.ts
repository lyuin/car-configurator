import { DIMENSION_KEYS } from './types';
import type { CarInput, Silhouette, SpecFieldKey } from './types';

/**
 * 既存車種のプリセット。
 *
 * 選定方針は「寸法空間で散らばること」。同じような大きさの車を複数入れても
 * 比較の役に立たないので、全長・全幅・全高・ホイールベース比のどれかで
 * 他と明確に違う車を選んでいる。
 *
 * 全長は 2410mm（Ami）から 5885mm（F-150）まで、全幅は 1390 から 2059、
 * 全高は 1187（296 GTB）から 2285（HiAce ハイルーフ）をカバーする。
 * ホイールベース比は Ioniq 5 の 0.647 から 911 の 0.540 まで。
 *
 * 意図的に外したもの: Tesla Model Y（Ioniq 5 と重複）、G-Class と Wrangler
 * （Land Cruiser 300 と重複）、Honda Fit（Yaris と重複）、N-VAN（N-BOX と
 * 全長・全幅・WB が同一）。
 *
 * 寸法はカタログ値。グレードや年式、市場によって変わる。
 * この用途（形状がわかる程度の線画）では影響は小さいと判断している。
 *
 * トレッド・最低地上高は30台分の信頼できる値が無いため持たせず、自動補完に任せる。
 * フロントオーバーハングは推定が明らかに外れる車にのみ指定する。
 */
export interface CarPreset {
  readonly id: string;
  readonly name: string;
  readonly silhouette: Silhouette;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wheelbase: number;
  readonly tire: string;
  /** 推定が明らかに外れる車にのみ指定する（キャブオーバーなど） */
  readonly frontOverhang?: number;
  /** シルエットの既定値と違う場合にのみ指定する */
  readonly doors?: number;
}

export const PRESETS: readonly CarPreset[] = [
  {
    id: 'citroen-ami',
    name: 'Citroën Ami',
    silhouette: 'kei',
    length: 2410,
    width: 1390,
    height: 1520,
    wheelbase: 1730,
    tire: '155/65R14',
    doors: 2,
  },
  {
    id: 'smart-fortwo',
    name: 'smart fortwo',
    silhouette: 'hatch',
    length: 2695,
    width: 1663,
    height: 1555,
    wheelbase: 1873,
    tire: '165/65R15',
    doors: 3,
  },
  {
    id: 'suzuki-carry',
    name: 'Suzuki Carry',
    silhouette: 'pickup',
    length: 3395,
    width: 1475,
    height: 1765,
    wheelbase: 1905,
    tire: '145/80R12',
    // キャブオーバーなので前輪が前端に寄る
    frontOverhang: 490,
    doors: 2,
  },
  {
    id: 'suzuki-jimny',
    name: 'Suzuki Jimny',
    silhouette: 'suv',
    length: 3395,
    width: 1475,
    height: 1725,
    wheelbase: 2250,
    tire: '175/80R16',
    // 全長に対してホイールベースが長く、前後オーバーハングが極端に短い
    frontOverhang: 540,
    doors: 3,
  },
  {
    id: 'honda-n-box',
    name: 'Honda N-BOX',
    silhouette: 'kei',
    length: 3395,
    width: 1475,
    height: 1790,
    wheelbase: 2520,
    tire: '155/65R14',
  },
  {
    id: 'fiat-500',
    name: 'Fiat 500',
    silhouette: 'hatch',
    length: 3570,
    width: 1625,
    height: 1515,
    wheelbase: 2300,
    tire: '185/55R15',
    doors: 3,
  },
  {
    id: 'mazda-mx-5',
    name: 'Mazda MX-5',
    silhouette: 'sports',
    length: 3915,
    width: 1735,
    height: 1235,
    wheelbase: 2310,
    tire: '195/50R16',
  },
  {
    id: 'toyota-yaris',
    name: 'Toyota Yaris',
    silhouette: 'hatch',
    length: 3940,
    width: 1695,
    height: 1500,
    wheelbase: 2550,
    tire: '185/65R15',
  },
  {
    id: 'toyota-yaris-cross',
    name: 'Toyota Yaris Cross',
    silhouette: 'suv',
    length: 4180,
    width: 1765,
    height: 1590,
    wheelbase: 2560,
    tire: '205/65R16',
  },
  {
    id: 'toyota-sienta',
    name: 'Toyota Sienta',
    silhouette: 'minivan',
    length: 4260,
    width: 1695,
    height: 1695,
    wheelbase: 2750,
    tire: '185/60R15',
  },
  {
    id: 'toyota-gr86',
    name: 'Toyota GR86',
    silhouette: 'coupe',
    length: 4265,
    width: 1775,
    height: 1310,
    wheelbase: 2575,
    tire: '215/40R18',
  },
  {
    id: 'vw-golf',
    name: 'VW Golf',
    silhouette: 'hatch',
    length: 4285,
    width: 1790,
    height: 1465,
    wheelbase: 2620,
    tire: '205/55R16',
  },
  {
    id: 'renault-kangoo',
    name: 'Renault Kangoo',
    silhouette: 'minivan',
    length: 4490,
    width: 1860,
    height: 1810,
    wheelbase: 2715,
    tire: '205/60R16',
  },
  {
    id: 'toyota-corolla-touring',
    name: 'Toyota Corolla Touring',
    silhouette: 'wagon',
    length: 4495,
    width: 1745,
    height: 1460,
    wheelbase: 2640,
    tire: '195/65R15',
  },
  {
    id: 'porsche-911',
    name: 'Porsche 911',
    silhouette: 'sports',
    length: 4535,
    width: 1852,
    height: 1300,
    wheelbase: 2450,
    tire: '235/40R19',
  },
  {
    id: 'ferrari-296-gtb',
    name: 'Ferrari 296 GTB',
    silhouette: 'sports',
    length: 4565,
    width: 1958,
    height: 1187,
    wheelbase: 2600,
    tire: '245/35R20',
  },
  {
    id: 'mazda-cx-5',
    name: 'Mazda CX-5',
    silhouette: 'suv',
    length: 4575,
    width: 1845,
    height: 1690,
    wheelbase: 2700,
    tire: '225/55R19',
  },
  {
    id: 'hyundai-ioniq-5',
    name: 'Hyundai Ioniq 5',
    silhouette: 'suv',
    length: 4635,
    width: 1890,
    height: 1605,
    wheelbase: 3000,
    tire: '255/45R20',
  },
  {
    id: 'tesla-model-3',
    name: 'Tesla Model 3',
    silhouette: 'sedan',
    length: 4694,
    width: 1849,
    height: 1443,
    wheelbase: 2875,
    tire: '235/45R18',
  },
  {
    id: 'subaru-levorg',
    name: 'Subaru Levorg',
    silhouette: 'wagon',
    length: 4755,
    width: 1795,
    height: 1500,
    wheelbase: 2670,
    tire: '225/45R18',
  },
  {
    id: 'ford-mustang',
    name: 'Ford Mustang',
    silhouette: 'coupe',
    length: 4810,
    width: 1915,
    height: 1400,
    wheelbase: 2720,
    tire: '255/40R19',
  },
  {
    id: 'toyota-camry',
    name: 'Toyota Camry',
    silhouette: 'sedan',
    length: 4885,
    width: 1840,
    height: 1445,
    wheelbase: 2825,
    tire: '235/45R18',
  },
  {
    id: 'toyota-land-cruiser-300',
    name: 'Toyota Land Cruiser 300',
    silhouette: 'suv',
    length: 4985,
    width: 1980,
    height: 1925,
    wheelbase: 2850,
    tire: '265/60R18',
  },
  {
    id: 'toyota-alphard',
    name: 'Toyota Alphard',
    silhouette: 'minivan',
    length: 4995,
    width: 1850,
    height: 1935,
    wheelbase: 3000,
    tire: '225/60R18',
  },
  {
    id: 'mercedes-s-class',
    name: 'Mercedes-Benz S-Class',
    silhouette: 'sedan',
    length: 5180,
    width: 1920,
    height: 1505,
    wheelbase: 3106,
    tire: '255/45R19',
  },
  {
    id: 'toyota-hilux',
    name: 'Toyota Hilux',
    silhouette: 'pickup',
    length: 5320,
    width: 1855,
    height: 1800,
    wheelbase: 3085,
    tire: '265/65R17',
  },
  {
    id: 'chevrolet-tahoe',
    name: 'Chevrolet Tahoe',
    silhouette: 'suv',
    length: 5352,
    width: 2059,
    height: 1927,
    wheelbase: 3071,
    tire: '275/60R20',
  },
  {
    id: 'toyota-hiace',
    name: 'Toyota HiAce（ロング・ハイルーフ）',
    silhouette: 'minivan',
    length: 5380,
    width: 1880,
    height: 2285,
    wheelbase: 3110,
    tire: '195/80R15',
    // キャブオーバーなので鼻が極端に短い
    frontOverhang: 690,
    doors: 4,
  },
  {
    id: 'bmw-i7',
    name: 'BMW i7',
    silhouette: 'sedan',
    length: 5391,
    width: 1950,
    height: 1544,
    wheelbase: 3215,
    tire: '255/45R20',
  },
  {
    id: 'ford-f-150',
    name: 'Ford F-150 SuperCrew',
    silhouette: 'pickup',
    length: 5885,
    width: 2029,
    height: 1961,
    wheelbase: 3695,
    tire: '265/70R17',
  },
];

export function findPreset(id: string): CarPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

/** プリセットを入力状態に変換する */
export function presetToCarInput(preset: CarPreset): CarInput {
  return {
    name: preset.name,
    silhouette: preset.silhouette,
    length: preset.length,
    width: preset.width,
    height: preset.height,
    wheelbase: preset.wheelbase,
    tire: preset.tire,
    ...(preset.frontOverhang !== undefined ? { frontOverhang: preset.frontOverhang } : {}),
    ...(preset.doors !== undefined ? { doors: preset.doors } : {}),
  };
}

/**
 * どの項目がプリセット由来のままかを判定する。
 *
 * 値がプリセットと一致していれば「車種由来」、変更されていれば「自分で決めた値」。
 * 専用のフィールド集合を持たずに済み、URL にも載せる必要がない。
 * プリセットと同じ値に戻した場合は車種由来に戻るが、実害はない。
 */
export function presetFieldsOf(
  car: CarInput,
  preset: CarPreset | undefined,
): ReadonlySet<SpecFieldKey> {
  const fields = new Set<SpecFieldKey>();
  if (preset === undefined) {
    return fields;
  }

  const source = presetToCarInput(preset);

  for (const key of DIMENSION_KEYS) {
    if (car[key] !== undefined && car[key] === source[key]) {
      fields.add(key);
    }
  }
  if (car.tire !== undefined && car.tire === source.tire) {
    fields.add('tire');
  }
  if (car.doors !== undefined && car.doors === source.doors) {
    fields.add('doors');
  }

  return fields;
}

/** 車種名の部分一致で絞り込む。大文字小文字と全角半角の違いを無視する */
export function filterPresets(query: string): readonly CarPreset[] {
  const normalized = query.normalize('NFKC').trim().toLowerCase();
  if (normalized === '') {
    return PRESETS;
  }
  return PRESETS.filter((preset) =>
    preset.name.normalize('NFKC').toLowerCase().includes(normalized),
  );
}
