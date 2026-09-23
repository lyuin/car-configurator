import type { Bounds, Shape, ShapeRole } from '../domain/geometry';

export interface CarSvgProps {
  readonly shapes: readonly Shape[];
  readonly bounds: Bounds;
  /** 図の周囲に取る余白 (mm) */
  readonly padding?: number;
  /** 比較時に2台を色で区別するための識別子。CSS 変数の切り替えに使う */
  readonly variant?: 'a' | 'b';
  readonly className?: string;
  readonly title?: string;
}

/**
 * mm 座標の図形を SVG として描く。
 *
 * `viewBox` を mm でとるため、2台を同じスケールで並べる際は
 * 双方を含む bounds を渡すだけでスケールが揃う。
 *
 * 線の太さは `vectorEffect="non-scaling-stroke"` で px 指定する。
 * これがないと全長 5m の車と軽自動車で線の太さが変わってしまう。
 */
export function CarSvg({
  shapes,
  bounds,
  padding = 150,
  variant = 'a',
  className,
  title,
}: CarSvgProps) {
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding,
    bounds.maxX - bounds.minX + padding * 2,
    bounds.maxY - bounds.minY + padding * 2,
  ].join(' ');

  return (
    <svg
      className={['car', `car--${variant}`, className].filter(Boolean).join(' ')}
      viewBox={viewBox}
      role="img"
      {...(title !== undefined ? { 'aria-label': title } : { 'aria-hidden': true })}
      preserveAspectRatio="xMidYMid meet"
    >
      {shapes.map((shape, index) => (
        <ShapeElement key={index} shape={shape} />
      ))}
    </svg>
  );
}

function ShapeElement({ shape }: { readonly shape: Shape }) {
  const className = roleClassName(shape.role);

  if (shape.kind === 'circle') {
    return (
      <circle
        className={className}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  return <path className={className} d={shape.d} vectorEffect="non-scaling-stroke" />;
}

function roleClassName(role: ShapeRole): string {
  return `car__${role}`;
}
