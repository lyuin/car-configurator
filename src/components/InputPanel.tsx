import { DimensionField } from './DimensionField';
import { TireField } from './TireField';
import { DIMENSION_FIELDS, DOOR_OPTIONS } from '../ui/fields';
import { lockedCount } from '../state/carInput';
import { SILHOUETTE_LABELS, SILHOUETTES } from '../domain/types';
import type {
  CarInput,
  DimensionKey,
  ResolvedSpec,
  Silhouette,
  SpecFieldKey,
} from '../domain/types';

export interface InputPanelProps {
  readonly input: CarInput;
  readonly spec: ResolvedSpec;
  readonly onSilhouetteChange: (silhouette: Silhouette) => void;
  readonly onDimensionChange: (key: DimensionKey, value: number) => void;
  readonly onTireChange: (notation: string) => void;
  readonly onDoorsChange: (doors: number) => void;
  readonly onUnlock: (key: SpecFieldKey) => void;
  readonly onResetAll: () => void;
}

export function InputPanel({
  input,
  spec,
  onSilhouetteChange,
  onDimensionChange,
  onTireChange,
  onDoorsChange,
  onUnlock,
  onResetAll,
}: InputPanelProps) {
  const locked = lockedCount(input);

  return (
    <div className="panel">
      <div className="panel__section">
        <div className="panel__heading">
          <h2>シルエット</h2>
        </div>
        <div className="segmented" role="group" aria-label="シルエット">
          {SILHOUETTES.map((value) => (
            <button
              key={value}
              type="button"
              className="segmented__item"
              aria-pressed={value === input.silhouette}
              onClick={() => onSilhouetteChange(value)}
            >
              {SILHOUETTE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel__section">
        <div className="panel__heading">
          <h2>寸法</h2>
          <p className="panel__note">
            {locked === 0
              ? 'すべて推定値。触った項目が固定されます'
              : `${locked} 項目を固定中`}
            {locked > 0 ? (
              <button type="button" className="panel__reset" onClick={onResetAll}>
                すべて推定に戻す
              </button>
            ) : null}
          </p>
        </div>

        {DIMENSION_FIELDS.map((config) => (
          <DimensionField
            key={config.key}
            config={config}
            value={spec[config.key]}
            source={spec.source[config.key]}
            onChange={(value) => onDimensionChange(config.key, value)}
            onUnlock={() => onUnlock(config.key)}
          />
        ))}

        <TireField
          input={input.tire}
          resolved={spec.tire}
          source={spec.source.tire}
          onChange={onTireChange}
          onUnlock={() => onUnlock('tire')}
        />

        <div className="field" data-source={spec.source.doors} data-field="doors">
          <div className="field__head">
            <span className="field__label">ドア数</span>
            <div className="segmented segmented--compact" role="group" aria-label="ドア数">
              {DOOR_OPTIONS.map((doors) => (
                <button
                  key={doors}
                  type="button"
                  className="segmented__item"
                  aria-pressed={doors === spec.doors}
                  onClick={() => onDoorsChange(doors)}
                >
                  {doors}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="field__lock"
              aria-pressed={spec.source.doors !== 'derived'}
              aria-label={
                spec.source.doors !== 'derived'
                  ? 'ドア数のロックを解除して推定に戻す'
                  : 'ドア数を現在の値で固定する'
              }
              onClick={() =>
                spec.source.doors !== 'derived' ? onUnlock('doors') : onDoorsChange(spec.doors)
              }
            >
              {spec.source.doors !== 'derived' ? '固定' : '推定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
