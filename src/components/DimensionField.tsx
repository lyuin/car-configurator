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

        <button
          type="button"
          className="field__lock"
          aria-pressed={locked}
          aria-label={
            locked ? `${config.label}のロックを解除して推定に戻す` : `${config.label}を現在の値で固定する`
          }
          onClick={() => (locked ? onUnlock() : onChange(value))}
        >
          {locked ? (source === 'preset' ? '車種' : '固定') : '推定'}
        </button>
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
