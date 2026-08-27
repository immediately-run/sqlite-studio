import { useMemo, useState } from 'react';
import type { SqlValue } from '../lib/sqlite';
import { formatNumber } from '../lib/format';

interface Props {
  columns: string[];
  rows: SqlValue[][];
}

const MAX_POINTS = 200;
const W = 720;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 56, left: 56 };

const isNumericColumn = (rows: SqlValue[][], idx: number): boolean =>
  rows.some((r) => typeof r[idx] === 'number') && rows.every((r) => r[idx] === null || typeof r[idx] === 'number');

function niceTicks(max: number, count = 5): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

function ChartPanel({ columns, rows }: Props) {
  const numeric = useMemo(() => columns.filter((_, i) => isNumericColumn(rows, i)), [columns, rows]);
  const [xCol, setXCol] = useState<string>(columns[0] ?? '');
  const [yCol, setYCol] = useState<string>(numeric.find((c) => c !== columns[0]) ?? numeric[0] ?? '');
  const [kind, setKind] = useState<'bar' | 'line'>('bar');

  const xi = columns.indexOf(xCol);
  const yi = columns.indexOf(yCol);

  const points = useMemo(() => {
    if (xi < 0 || yi < 0) return [];
    return rows
      .slice(0, MAX_POINTS)
      .map((r) => ({ x: r[xi] === null ? 'NULL' : String(r[xi]), y: typeof r[yi] === 'number' ? r[yi] : null }))
      .filter((p): p is { x: string; y: number } => p.y !== null);
  }, [rows, xi, yi]);

  const maxY = Math.max(0, ...points.map((p) => p.y));
  const minY = Math.min(0, ...points.map((p) => p.y));
  const ticks = niceTicks(maxY || 1);
  const yMin = minY < 0 ? minY : 0;
  const yMax = ticks[ticks.length - 1] || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yPos = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const slot = innerW / Math.max(1, points.length);
  const barW = Math.max(2, slot * 0.7);
  const labelEvery = Math.max(1, Math.ceil(points.length / 12));

  if (numeric.length === 0) {
    return <p className="hint">Add a numeric column to the result to chart it.</p>;
  }

  return (
    <div className="chart">
      <div className="chart-controls">
        <label>
          <span>X</span>
          <select className="input" value={xCol} onChange={(e) => setXCol(e.target.value)}>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Y</span>
          <select className="input" value={yCol} onChange={(e) => setYCol(e.target.value)}>
            {numeric.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="Chart type">
          <button type="button" className={kind === 'bar' ? 'on' : ''} onClick={() => setKind('bar')}>
            Bar
          </button>
          <button type="button" className={kind === 'line' ? 'on' : ''} onClick={() => setKind('line')}>
            Line
          </button>
        </div>
        {rows.length > MAX_POINTS && <span className="hint">First {MAX_POINTS} rows shown.</span>}
      </div>
      <div className="chart-scroll">
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kind} chart of ${yCol} by ${xCol}`}>
          <defs>
            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-pink)" />
              <stop offset="100%" stopColor="var(--accent-violet)" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yPos(t)} y2={yPos(t)} className="chart-gridline" />
              <text x={PAD.left - 8} y={yPos(t) + 4} textAnchor="end" className="chart-tick">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {yMin < 0 && <line x1={PAD.left} x2={W - PAD.right} y1={yPos(0)} y2={yPos(0)} className="chart-axis" />}
          {kind === 'bar' &&
            points.map((p, i) => {
              const x = PAD.left + i * slot + (slot - barW) / 2;
              const y0 = yPos(0);
              const y1 = yPos(p.y);
              return (
                <rect
                  key={i}
                  x={x}
                  y={Math.min(y0, y1)}
                  width={barW}
                  height={Math.max(1, Math.abs(y0 - y1))}
                  rx={2}
                  fill="url(#chart-grad)"
                >
                  <title>{`${p.x}: ${formatNumber(p.y)}`}</title>
                </rect>
              );
            })}
          {kind === 'line' && points.length > 0 && (
            <>
              <polyline
                className="chart-line"
                points={points.map((p, i) => `${PAD.left + i * slot + slot / 2},${yPos(p.y)}`).join(' ')}
              />
              {points.map((p, i) => (
                <circle key={i} cx={PAD.left + i * slot + slot / 2} cy={yPos(p.y)} r={3} className="chart-dot">
                  <title>{`${p.x}: ${formatNumber(p.y)}`}</title>
                </circle>
              ))}
            </>
          )}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={PAD.left + i * slot + slot / 2}
                y={H - PAD.bottom + 16}
                textAnchor="end"
                transform={`rotate(-35 ${PAD.left + i * slot + slot / 2} ${H - PAD.bottom + 16})`}
                className="chart-tick"
              >
                {p.x.length > 14 ? `${p.x.slice(0, 14)}…` : p.x}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}

export default ChartPanel;
