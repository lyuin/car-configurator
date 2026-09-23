import { useId, useMemo, useState } from 'react';
import { filterPresets } from '../domain/presets';
import { SILHOUETTE_LABELS } from '../domain/types';
import type { CarPreset } from '../domain/presets';

export interface PresetPickerProps {
  /** 現在読み込んでいるプリセットの ID */
  readonly selectedId: string | undefined;
  readonly onSelect: (preset: CarPreset) => void;
}

/**
 * 既存車種のピッカー。
 *
 * 30台あるので検索で絞り込めるようにしている。
 * 一覧は全長の昇順（プリセットの定義順）なので、大きさの並びとしても読める。
 */
export function PresetPicker({ selectedId, onSelect }: PresetPickerProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterPresets(query), [query]);

  return (
    <div className="presets">
      <input
        id={id}
        className="presets__search"
        type="search"
        placeholder="車種を検索"
        aria-label="車種を検索"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {matches.length === 0 ? (
        <p className="presets__empty">該当する車種がありません</p>
      ) : (
        <ul className="presets__list" aria-label="車種">
          {matches.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="presets__item"
                aria-pressed={preset.id === selectedId}
                onClick={() => onSelect(preset)}
              >
                <span className="presets__name">{preset.name}</span>
                <span className="presets__meta">
                  {SILHOUETTE_LABELS[preset.silhouette]} / {preset.length.toLocaleString('ja-JP')}{' '}
                  mm
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
