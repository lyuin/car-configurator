import { useId } from 'react';
import { parseTireSpec } from '../domain/tire';
import type { TireSpec, ValueSource } from '../domain/types';

export interface TireFieldProps {
  /** 入力中の文字列。未指定なら推定値の表記を表示する */
  readonly input: string | undefined;
  /** 補完後のタイヤ */
  readonly resolved: TireSpec;
  readonly source: ValueSource;
  readonly onChange: (notation: string) => void;
  readonly onUnlock: () => void;
}

/**
 * タイヤ規格表記の入力。
 *
 * 入力途中は不正な文字列になるため、解析結果をエラーとして扱わず
 * その場で理由を表示するだけにして、図は直前の有効な値で描き続ける。
 */
export function TireField({ input, resolved, source, onChange, onUnlock }: TireFieldProps) {
  const id = useId();
  const locked = source !== 'derived';
  const parsed = input === undefined ? undefined : parseTireSpec(input);
  const error = parsed !== undefined && !parsed.ok ? parsed.error : undefined;

  return (
    <div className="field field--tire" data-source={source} data-field="tire">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          タイヤ
        </label>

        <input
          id={id}
          className="field__text"
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="225/55R19"
          aria-invalid={error !== undefined}
          {...(error !== undefined ? { 'aria-describedby': `${id}-error` } : {})}
          value={input ?? resolved.notation}
          onChange={(event) => onChange(event.target.value)}
        />

        <button
          type="button"
          className="field__lock"
          aria-pressed={locked}
          aria-label={locked ? 'タイヤのロックを解除して推定に戻す' : 'タイヤを現在の値で固定する'}
          onClick={() => (locked ? onUnlock() : onChange(resolved.notation))}
        >
          {locked ? (source === 'preset' ? '車種' : '固定') : '推定'}
        </button>
      </div>

      {error !== undefined ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        <p className="field__hint">
          外径 {Math.round(resolved.outerDiameter)} mm / リム {resolved.rimDiameterInch} inch
        </p>
      )}
    </div>
  );
}
