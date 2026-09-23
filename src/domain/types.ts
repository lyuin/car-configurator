/**
 * 車の寸法を表すドメイン型。
 *
 * 単位は特記なき限り mm。座標系は Task 4 以降のジオメトリで定義する。
 */

export const SILHOUETTES = [
  'kei',
  'hatch',
  'sedan',
  'wagon',
  'coupe',
  'suv',
  'minivan',
  'van',
  'pickup',
] as const;

export type Silhouette = (typeof SILHOUETTES)[number];

export const SILHOUETTE_LABELS: Record<Silhouette, string> = {
  kei: '軽',
  hatch: 'ハッチバック',
  sedan: 'セダン',
  wagon: 'ワゴン',
  coupe: 'クーペ',
  suv: 'SUV',
  minivan: 'ミニバン',
  van: 'バン',
  pickup: 'ピックアップ',
};

/** タイヤ規格表記（`225/55R18`）を解析した結果 */
export interface TireSpec {
  /** 正規化した表記。例: `225/55R18` */
  readonly notation: string;
  /** タイヤ幅 (mm) */
  readonly width: number;
  /** 扁平率 (%) */
  readonly aspectRatio: number;
  /** リム径 (inch) */
  readonly rimDiameterInch: number;
  /** リム径 (mm) */
  readonly rimDiameter: number;
  /** サイドウォール高 (mm) */
  readonly sidewallHeight: number;
  /** タイヤ外径 (mm) */
  readonly outerDiameter: number;
}

/** 数値で指定する寸法項目のキー */
export const DIMENSION_KEYS = [
  'length',
  'width',
  'height',
  'wheelbase',
  'frontOverhang',
  'rearOverhang',
  'trackFront',
  'trackRear',
  'groundClearance',
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** 自動補完とロックの対象になる全項目のキー */
export type SpecFieldKey = DimensionKey | 'tire' | 'doors';

/**
 * ユーザーが明示した値のみを保持する入力。
 * `undefined` の項目は自動補完の対象になる。
 */
export interface CarInput {
  name?: string;
  silhouette: Silhouette;
  /** 全長 */
  length?: number;
  /** 全幅 */
  width?: number;
  /** 全高 */
  height?: number;
  /** ホイールベース */
  wheelbase?: number;
  /** フロントオーバーハング */
  frontOverhang?: number;
  /** リアオーバーハング */
  rearOverhang?: number;
  /** フロントトレッド */
  trackFront?: number;
  /** リアトレッド */
  trackRear?: number;
  /** 最低地上高 */
  groundClearance?: number;
  /** タイヤ規格表記。例: `225/55R18` */
  tire?: string;
  /** ドア数 */
  doors?: number;
}

/** 値の出所。UI で「自分が入れた値」と「推定値」を区別するために使う */
export type ValueSource = 'explicit' | 'preset' | 'derived';

/**
 * 自動補完を適用して全項目が埋まった状態。
 *
 * 将来の拡張（駆動レイアウト、パワートレイン搭載位置、重量配分）は
 * この型に任意フィールドを追加する形で載せる。
 */
export interface ResolvedSpec {
  name?: string;
  silhouette: Silhouette;
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontOverhang: number;
  rearOverhang: number;
  trackFront: number;
  trackRear: number;
  groundClearance: number;
  tire: TireSpec;
  doors: number;
  /** 各項目の出所 */
  source: Record<SpecFieldKey, ValueSource>;
  /** 寸法の矛盾など、ユーザーに伝える警告 */
  warnings: string[];
}

/**
 * 解析・検証の結果。
 * 例外ではなくユニオンで返すのは、テキスト入力中の不正な文字列を
 * 「異常」ではなく「まだ有効でない状態」として UI に表示したいため。
 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
