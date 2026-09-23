import type { Bounds, Shape, ShapeRole } from '../domain/geometry';
import type { SceneLayer } from '../domain/scene';

export interface CarSvgProps {
  readonly layers: readonly SceneLayer[];
  readonly bounds: Bounds;
  /** 図の周囲に取る余白 (mm) */
  readonly padding?: number;
  readonly className?: string;
  readonly title?: string;
}

/**
 * mm 座標の図形を SVG として描く。
 *
 * `viewBox` を mm でとるため、2台を同じスケールで並べる際は
 * 双方を含む bounds を渡すだけでスケールが揃う。
 *
 * レイヤーごとに `<g>` を出し、色分け（`car--a` / `car--b`）と位置合わせ
 * （`transform`）をそこで行う。パス文字列を書き換えずに済む。
 *
 * 線の太さは `vectorEffect="non-scaling-stroke"` で px 指定する。
 * これがないと全長 5m の車と軽自動車で線の太さが変わってしまう。
 */
export function CarSvg({ layers, bounds, padding = 150, className, title }: CarSvgProps) {
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding,
    bounds.maxX - bounds.minX + padding * 2,
    bounds.maxY - bounds.minY + padding * 2,
  ].join(' ');

  return (
    <svg
      className={['car', className].filter(Boolean).join(' ')}
      viewBox={viewBox}
      role="img"
      {...(title !== undefined ? { 'aria-label': title } : { 'aria-hidden': true })}
      preserveAspectRatio="xMidYMid meet"
    >
      {layers.map((layer) => (
        <g
          key={layer.id}
          className={['car__layer', layer.variant !== undefined ? `car--${layer.variant}` : null]
            .filter(Boolean)
            .join(' ')}
          data-layer={layer.id}
          {...(layer.offsetX !== 0 || layer.offsetY !== 0
            ? { transform: `translate(${layer.offsetX} ${layer.offsetY})` }
            : {})}
        >
          {layer.shapes.map((shape, index) => (
            <ShapeElement key={index} shape={shape} />
          ))}
        </g>
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

  if (shape.kind === 'text') {
    return (
      <text
        className={className}
        x={shape.x}
        y={shape.y}
        textAnchor={shape.anchor}
        fontSize={shape.fontSize}
        {...(shape.rotate !== undefined
          ? { transform: `rotate(${shape.rotate} ${shape.x} ${shape.y})` }
          : {})}
      >
        {shape.text}
      </text>
    );
  }

  return <path className={className} d={shape.d} vectorEffect="non-scaling-stroke" />;
}

function roleClassName(role: ShapeRole): string {
  return `car__${role}`;
}
