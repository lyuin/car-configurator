import { DimensionField } from './DimensionField';
import { PresetPicker } from './PresetPicker';
import { TireField } from './TireField';
import type { CarPreset } from '../domain/presets';
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
  readonly presetId: string | undefined;
  readonly onLoadPreset: (preset: CarPreset) => void;
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
  presetId,
  onLoadPreset,
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
          <h2>車種から読み込む</h2>
          {input.name !== undefined ? <p className="panel__note">{input.name}</p> : null}
        </div>
        <PresetPicker selectedId={presetId} onSelect={onLoadPreset} />
      </div>

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
            <label className="field__lock">
              <input
                type="checkbox"
                checked={spec.source.doors !== 'derived'}
                aria-label="ドア数を固定する"
                onChange={() =>
                  spec.source.doors !== 'derived' ? onUnlock('doors') : onDoorsChange(spec.doors)
                }
              />
              <span aria-hidden="true">{spec.source.doors === 'preset' ? '車種' : '固定'}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
