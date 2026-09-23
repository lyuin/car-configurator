import { useId, useState } from 'react';
import { clampToField } from '../ui/fields';
import type { DimensionFieldConfig } from '../ui/fields';
import type { ValueSource } from '../domain/types';

export interface DimensionFieldProps {
  readonly config: DimensionFieldConfig;
  /** 補完後の値。推定値もここに入る */
  readonly value: number;
  readonly source: ValueSource;
  /** 値を変更する。呼ぶと同時にロックされる */
  readonly onChange: (value: number) => void;
  /** ロックを解除して推定に戻す */
  readonly onUnlock: () => void;
}

/**
 * ひとつの寸法項目。スライダーと数値入力、ロックバッジを持つ。
 *
 * 推定値のときもスライダーには補完後の値が入っているので、
 * つまんで動かせばそのままロックされて自分の値になる。
 */
export function DimensionField({
  config,
  value,
  source,
  onChange,
  onUnlock,
}: DimensionFieldProps) {
  const id = useId();
  const locked = source !== 'derived';

  /**
   * 入力途中の文字列。
   *
   * 数値入力を直接 props の値に結びつけると、フィールドを空にした瞬間に
   * `Number('')` が 0 になって寸法 0 が確定してしまう。有効な範囲の数値に
   * なるまでは下書きとして保持し、確定したら破棄して props の値に戻す。
   */
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="field" data-source={source} data-field={config.key}>
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {config.label}
        </label>

        <input
          id={id}
          className="field__number"
          type="number"
          inputMode="numeric"
          min={config.min}
          max={config.max}
          step={config.step}
          value={draft ?? String(value)}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const next = Number(raw);
            if (raw !== '' && Number.isFinite(next) && next >= config.min && next <= config.max) {
              onChange(next);
              setDraft(null);
            }
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="field__unit">mm</span>

        {/*
          チェックボックスにしているのは、ボタンだとラベルが「現在の状態」なのか
          「押したときの動作」なのか読み取れないため。ラベルを固定してチェックの
          有無で状態を示す。
        */}
        <label className="field__lock">
          <input
            type="checkbox"
            checked={locked}
            aria-label={`${config.label}を固定する`}
            onChange={() => (locked ? onUnlock() : onChange(value))}
          />
          <span aria-hidden="true">{source === 'preset' ? '車種' : '固定'}</span>
        </label>
      </div>

      <input
        className="field__slider"
        type="range"
        min={config.min}
        max={config.max}
        step={config.step}
        value={clampToField(config, value)}
        aria-label={config.label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
