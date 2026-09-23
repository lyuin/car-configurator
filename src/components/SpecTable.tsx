import { buildSpecRows, formatDiff } from '../domain/specTable';
import type { ResolvedSpec } from '../domain/types';

export interface SpecTableProps {
  readonly a: ResolvedSpec;
  readonly b?: ResolvedSpec | undefined;
  readonly nameA: string;
  readonly nameB?: string | undefined;
}

/**
 * スペック比較表。
 *
 * 1台のときは項目と値の2列、2台のときは差分を含む4列になる。
 * 差分は B − A で、プラスにも符号を付けて向きが分かるようにする。
 */
export function SpecTable({ a, b, nameA, nameB }: SpecTableProps) {
  const rows = buildSpecRows(a, b);
  const comparing = b !== undefined;

  return (
    <table className="spectable">
      <caption className="spectable__caption">スペック{comparing ? '比較' : ''}</caption>
      <thead>
        <tr>
          <th scope="col">項目</th>
          <th scope="col" className="spectable__a">
            {nameA}
          </th>
          {comparing ? (
            <>
              <th scope="col" className="spectable__b">
                {nameB}
              </th>
              <th scope="col">差</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} data-differs={row.diff !== undefined ? row.diff !== 0 : row.differs}>
            <th scope="row">{row.label}</th>
            <td className="spectable__num">{row.a}</td>
            {comparing ? (
              <>
                <td className="spectable__num">{row.b}</td>
                <td className="spectable__num spectable__diff">
                  {row.diff !== undefined ? formatDiff(row.diff) : row.differs ? '≠' : '同じ'}
                </td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
