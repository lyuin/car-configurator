import type { Silhouette } from './types';
import { MM_PER_INCH } from './tire';

/**
 * シルエット別の典型比率。実車のカタログ値から起こした値。
 *
 * 比率の分母は項目ごとに異なる（コメント参照）。
 * Task 4 で実際の描画を見てから調整する前提の初期値。
 */
export interface SilhouetteRatios {
  /** ホイールベース / 全長 */
  readonly wheelbase: number;
  /** フロントオーバーハング / 全長 */
  readonly frontOverhang: number;
  /** 全高 / 全長 */
  readonly height: number;
  /** 全幅 / 全長 */
  readonly width: number;
  /** トレッド / 全幅 */
  readonly track: number;
  /** 最低地上高 (mm)。比率ではなく実数。車格より車種特性で決まるため */
  readonly groundClearance: number;
  /** タイヤ外径 / 全長 */
  readonly tireDiameter: number;
  /** タイヤ幅 / 全幅 */
  readonly tireWidth: number;
  /** リム径 / タイヤ外径。大きいほど「インチアップした見た目」になる */
  readonly rimFactor: number;
  /** ドア数 */
  readonly doors: number;
  /** 全長が未指定のときの基準値 (mm)。各シルエットの代表車の全長 */
  readonly defaultLength: number;
}

/**
 * 参考にした代表車（比率の検算用）:
 * kei=N-BOX / hatch=Golf / sedan=Camry / wagon=Levorg / coupe=GR86・Mustang
 * sports=911・296GTB / suv=CX-5 / minivan=Alphard / pickup=Hilux
 */
export const SILHOUETTE_RATIOS: Record<Silhouette, SilhouetteRatios> = {
  // 軽は全長が短いのにホイールベースが長く、オーバーハングが極端に短い
  kei: {
    wheelbase: 0.74,
    frontOverhang: 0.13,
    height: 0.48,
    width: 0.435,
    track: 0.88,
    groundClearance: 150,
    tireDiameter: 0.165,
    tireWidth: 0.11,
    rimFactor: 0.63,
    doors: 5,
    defaultLength: 3395,
  },
  hatch: {
    wheelbase: 0.61,
    frontOverhang: 0.2,
    height: 0.342,
    width: 0.418,
    track: 0.865,
    groundClearance: 140,
    tireDiameter: 0.155,
    tireWidth: 0.115,
    rimFactor: 0.62,
    doors: 5,
    defaultLength: 4285,
  },
  sedan: {
    wheelbase: 0.58,
    frontOverhang: 0.19,
    height: 0.296,
    width: 0.377,
    track: 0.862,
    groundClearance: 135,
    tireDiameter: 0.14,
    tireWidth: 0.12,
    rimFactor: 0.66,
    doors: 4,
    defaultLength: 4885,
  },
  wagon: {
    wheelbase: 0.58,
    frontOverhang: 0.2,
    height: 0.315,
    width: 0.377,
    track: 0.865,
    groundClearance: 140,
    tireDiameter: 0.142,
    tireWidth: 0.12,
    rimFactor: 0.65,
    doors: 5,
    defaultLength: 4755,
  },
  // ロングノーズでキャビンが後退した2ドア。GR86・Mustang 系
  coupe: {
    wheelbase: 0.585,
    frontOverhang: 0.19,
    height: 0.3,
    width: 0.415,
    track: 0.865,
    groundClearance: 130,
    tireDiameter: 0.148,
    tireWidth: 0.125,
    rimFactor: 0.7,
    doors: 2,
    defaultLength: 4265,
  },
  // 低くワイド。ホイールベースが短くリム径が大きい。911・296GTB 系
  sports: {
    wheelbase: 0.555,
    frontOverhang: 0.205,
    height: 0.275,
    width: 0.42,
    track: 0.865,
    groundClearance: 110,
    tireDiameter: 0.152,
    tireWidth: 0.145,
    rimFactor: 0.74,
    doors: 2,
    defaultLength: 4530,
  },
  suv: {
    wheelbase: 0.585,
    frontOverhang: 0.205,
    height: 0.369,
    width: 0.403,
    track: 0.864,
    groundClearance: 200,
    tireDiameter: 0.16,
    tireWidth: 0.122,
    rimFactor: 0.65,
    doors: 5,
    defaultLength: 4575,
  },
  minivan: {
    wheelbase: 0.6,
    frontOverhang: 0.19,
    height: 0.385,
    width: 0.37,
    track: 0.855,
    groundClearance: 150,
    tireDiameter: 0.148,
    tireWidth: 0.12,
    rimFactor: 0.63,
    doors: 5,
    defaultLength: 4995,
  },
  pickup: {
    wheelbase: 0.6,
    frontOverhang: 0.155,
    height: 0.335,
    width: 0.35,
    track: 0.855,
    groundClearance: 220,
    tireDiameter: 0.152,
    tireWidth: 0.13,
    rimFactor: 0.6,
    doors: 4,
    defaultLength: 5325,
  },
};

/** 実在するタイヤ幅は 10 刻みで末尾が 5（155, 165, ... 355） */
function roundTireWidth(value: number): number {
  const rounded = Math.round((value - 5) / 10) * 10 + 5;
  return clamp(rounded, 135, 355);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 目標外径と車体幅から、実在しそうなタイヤ規格表記を合成する。
 *
 * 固定のデフォルト表記を持つのではなく車の大きさから導くことで、
 * 全長を変えたときにタイヤも一緒に見合ったサイズへ追従する。
 *
 * 検算例:
 * - SUV / 全長 4575 → `225/55R19`（CX-5 の実車と一致）
 * - バン / 全長 5380 → `195/80R15`（ハイエースの実車と一致）
 */
export function synthesizeTireNotation(
  targetDiameter: number,
  bodyWidth: number,
  ratios: SilhouetteRatios,
): string {
  const tireWidth = roundTireWidth(bodyWidth * ratios.tireWidth);
  const rimDiameterInch = clamp(
    Math.round((targetDiameter * ratios.rimFactor) / MM_PER_INCH),
    12,
    24,
  );

  const sidewallHeight = (targetDiameter - rimDiameterInch * MM_PER_INCH) / 2;
  // 扁平率は 5 刻みが実在サイズの基本
  const aspectRatio = clamp(Math.round(((sidewallHeight / tireWidth) * 100) / 5) * 5, 30, 85);

  return `${tireWidth}/${aspectRatio}R${rimDiameterInch}`;
}
