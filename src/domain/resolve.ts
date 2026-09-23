import { SILHOUETTE_RATIOS, synthesizeTireNotation } from './ratios';
import { parseTireSpec } from './tire';
import type { CarInput, ResolvedSpec, SpecFieldKey, TireSpec, ValueSource } from './types';

/** オーバーハングの下限 (mm)。これを下回る図は成立しないものとして扱う */
export const MIN_OVERHANG = 200;

export interface ResolveOptions {
  /**
   * プリセット由来の項目。UI で「自分が入れた値」と「車種から入った値」を
   * 区別するために使う。指定がなければ入力済みの項目はすべて explicit 扱い。
   */
  readonly presetFields?: ReadonlySet<SpecFieldKey>;
}

/**
 * 明示指定された寸法から、全項目が埋まった仕様を組み立てる。
 *
 * 「ロック」は `CarInput` に値があるかどうかで表現する。別途ロック集合を
 * 持つと二重管理になるため。ロック解除は該当フィールドの削除に対応する。
 *
 * `全長 = フロントOH + WB + リアOH` は戻り値で常に成立する。矛盾した指定が
 * あった場合は警告を出しつつ、図と寸法ラベルが食い違わない状態を優先する。
 */
export function resolve(input: CarInput, options: ResolveOptions = {}): ResolvedSpec {
  const ratios = SILHOUETTE_RATIOS[input.silhouette];
  const warnings: string[] = [];

  // --- 全長 -------------------------------------------------------------
  // 全長が未指定でもホイールベースが分かっていれば逆算できる
  let length: number;
  if (input.length !== undefined) {
    length = input.length;
  } else if (
    input.wheelbase !== undefined &&
    input.frontOverhang !== undefined &&
    input.rearOverhang !== undefined
  ) {
    length = input.wheelbase + input.frontOverhang + input.rearOverhang;
  } else if (input.wheelbase !== undefined) {
    length = round5(input.wheelbase / ratios.wheelbase);
  } else {
    length = ratios.defaultLength;
  }

  // --- 全幅・全高 -------------------------------------------------------
  const width = input.width ?? round5(length * ratios.width);
  const height = input.height ?? round5(length * ratios.height);

  // --- ホイールベースと前後オーバーハング -------------------------------
  let wheelbase: number;
  let frontOverhang: number;
  let rearOverhang: number;

  /**
   * 比率からフロントオーバーハングを導く。
   * リア側に下限を残せる範囲で上限を掛けることで、ホイールベースが
   * 全長に対して長すぎる場合でも前後が偏らないようにする。
   */
  const deriveFrontOverhang = (availableForOverhangs: number): number =>
    Math.max(
      Math.min(round5(length * ratios.frontOverhang), availableForOverhangs - MIN_OVERHANG),
      MIN_OVERHANG,
    );

  if (input.wheelbase !== undefined) {
    wheelbase = input.wheelbase;
    if (input.frontOverhang !== undefined && input.rearOverhang !== undefined) {
      frontOverhang = input.frontOverhang;
      rearOverhang = input.rearOverhang;
    } else if (input.frontOverhang !== undefined) {
      frontOverhang = input.frontOverhang;
      rearOverhang = length - wheelbase - frontOverhang;
    } else if (input.rearOverhang !== undefined) {
      rearOverhang = input.rearOverhang;
      frontOverhang = length - wheelbase - rearOverhang;
    } else {
      frontOverhang = deriveFrontOverhang(length - wheelbase);
      rearOverhang = length - wheelbase - frontOverhang;
    }
  } else if (input.frontOverhang !== undefined && input.rearOverhang !== undefined) {
    frontOverhang = input.frontOverhang;
    rearOverhang = input.rearOverhang;
    wheelbase = length - frontOverhang - rearOverhang;
  } else {
    wheelbase = round5(length * ratios.wheelbase);
    if (input.frontOverhang !== undefined) {
      frontOverhang = input.frontOverhang;
      rearOverhang = length - wheelbase - frontOverhang;
    } else if (input.rearOverhang !== undefined) {
      rearOverhang = input.rearOverhang;
      frontOverhang = length - wheelbase - rearOverhang;
    } else {
      frontOverhang = deriveFrontOverhang(length - wheelbase);
      rearOverhang = length - wheelbase - frontOverhang;
    }
  }

  // 明示指定が噛み合わず、成立しない図になっていないか確認する
  if (frontOverhang < MIN_OVERHANG || rearOverhang < MIN_OVERHANG) {
    warnings.push(
      `指定どおりではオーバーハングが ${MIN_OVERHANG}mm を下回るため、${MIN_OVERHANG}mm で打ち切りました（全長 ${length}mm / ホイールベース ${wheelbase}mm）`,
    );
    frontOverhang = Math.max(frontOverhang, MIN_OVERHANG);
    rearOverhang = Math.max(rearOverhang, MIN_OVERHANG);
  }

  // 整合式を必ず成立させる。ズレていれば全長側で吸収し、その旨を伝える
  const sum = frontOverhang + wheelbase + rearOverhang;
  if (sum !== length) {
    if (input.length !== undefined) {
      warnings.push(
        `全長 ${input.length}mm と各部の合計 ${sum}mm が一致しないため、全長を ${sum}mm として描画します`,
      );
    }
    length = sum;
  }

  // --- タイヤ -----------------------------------------------------------
  const targetDiameter = length * ratios.tireDiameter;
  const fallbackNotation = synthesizeTireNotation(targetDiameter, width, ratios);
  let tire: TireSpec;

  if (input.tire !== undefined) {
    const parsed = parseTireSpec(input.tire);
    if (parsed.ok) {
      tire = parsed.value;
    } else {
      warnings.push(`タイヤサイズ「${input.tire}」を解釈できないため推定値を使います: ${parsed.error}`);
      tire = parseTireOrThrow(fallbackNotation);
    }
  } else {
    tire = parseTireOrThrow(fallbackNotation);
  }

  // --- トレッド ---------------------------------------------------------
  let trackFront = input.trackFront ?? round5(width * ratios.track);
  let trackRear = input.trackRear ?? round5(width * ratios.track);

  // トレッドは必ず全幅の内側に収まる
  const maxTrack = round5(width * 0.95);
  if (trackFront > maxTrack || trackRear > maxTrack) {
    warnings.push(`トレッドが全幅 ${width}mm を超えないよう ${maxTrack}mm に収めました`);
    trackFront = Math.min(trackFront, maxTrack);
    trackRear = Math.min(trackRear, maxTrack);
  }

  // --- 最低地上高 -------------------------------------------------------
  let groundClearance = input.groundClearance ?? ratios.groundClearance;

  // 最低地上高がタイヤ半径を超えると車体が浮いた図になる
  const tireRadius = tire.outerDiameter / 2;
  if (groundClearance >= tireRadius) {
    const capped = round5(tireRadius * 0.8);
    warnings.push(
      `最低地上高 ${groundClearance}mm がタイヤ半径 ${Math.round(tireRadius)}mm 以上のため ${capped}mm に収めました`,
    );
    groundClearance = capped;
  }

  if (height <= tire.outerDiameter) {
    warnings.push(
      `全高 ${height}mm がタイヤ外径 ${Math.round(tire.outerDiameter)}mm 以下です。寸法を確認してください`,
    );
  }

  const sourceOf = (key: SpecFieldKey): ValueSource => {
    if (input[key] === undefined) {
      return 'derived';
    }
    return options.presetFields?.has(key) === true ? 'preset' : 'explicit';
  };

  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    silhouette: input.silhouette,
    length,
    width,
    height,
    wheelbase,
    frontOverhang,
    rearOverhang,
    trackFront,
    trackRear,
    groundClearance,
    tire,
    doors: input.doors ?? ratios.doors,
    source: {
      length: sourceOf('length'),
      width: sourceOf('width'),
      height: sourceOf('height'),
      wheelbase: sourceOf('wheelbase'),
      frontOverhang: sourceOf('frontOverhang'),
      rearOverhang: sourceOf('rearOverhang'),
      trackFront: sourceOf('trackFront'),
      trackRear: sourceOf('trackRear'),
      groundClearance: sourceOf('groundClearance'),
      tire: sourceOf('tire'),
      doors: sourceOf('doors'),
    },
    warnings,
  };
}

/** 5mm 刻みに丸める。カタログ値の見た目に寄せるため */
function round5(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * 合成した表記は範囲内に収まるよう組み立てているため、解析は必ず成功する。
 * 失敗した場合は比率テーブルか合成ロジックの不整合なので、早期に落とす。
 */
function parseTireOrThrow(notation: string): TireSpec {
  const parsed = parseTireSpec(notation);
  if (!parsed.ok) {
    throw new Error(`合成したタイヤ表記を解析できない: ${notation} / ${parsed.error}`);
  }
  return parsed.value;
}
