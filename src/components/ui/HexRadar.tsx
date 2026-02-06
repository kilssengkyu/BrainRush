import React from 'react';

type StatKey = 'speed' | 'memory' | 'judgment' | 'calculation' | 'accuracy' | 'observation';

interface HexRadarProps {
    values: Record<StatKey, number>;
    labels: Record<StatKey, string>;
    max?: number;
    size?: number;
    className?: string;
    compareValues?: Record<StatKey, number>;
    primaryColor?: { fill: string; stroke: string };
    compareColor?: { fill: string; stroke: string };
    showLabels?: boolean;
}

const STAT_ORDER: StatKey[] = ['speed', 'memory', 'judgment', 'calculation', 'accuracy', 'observation'];

const polarPoint = (cx: number, cy: number, radius: number, angleDeg: number) => {
    const rad = (Math.PI / 180) * angleDeg;
    return {
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad)
    };
};

const HexRadar: React.FC<HexRadarProps> = ({
    values,
    labels,
    max,
    size = 240,
    className,
    compareValues,
    primaryColor = { fill: 'rgba(59,130,246,0.25)', stroke: 'rgba(59,130,246,0.9)' },
    compareColor = { fill: 'rgba(239,68,68,0.22)', stroke: 'rgba(239,68,68,0.9)' },
    showLabels = true
}) => {
    const padding = 40;
    const radius = size / 2 - padding;
    const center = size / 2;
    const angles = STAT_ORDER.map((_, idx) => -90 + idx * 60);
    const step = 50;
    const rawMax = Math.max(
        step,
        ...STAT_ORDER.map((key) => values[key] || 0),
        ...STAT_ORDER.map((key) => compareValues?.[key] || 0)
    );
    const effectiveMax = typeof max === 'number'
        ? Math.max(1, max)
        : Math.ceil(rawMax / step) * step;

    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

    const makePolygon = (level: number) => {
        const points = angles.map((angle) => {
            const pt = polarPoint(center, center, radius * level, angle);
            return `${pt.x},${pt.y}`;
        });
        return points.join(' ');
    };

    const valuePolygon = angles.map((angle, idx) => {
        const key = STAT_ORDER[idx];
        const clamped = Math.max(0, Math.min(values[key] || 0, effectiveMax));
        const level = clamped / effectiveMax;
        const pt = polarPoint(center, center, radius * level, angle);
        return `${pt.x},${pt.y}`;
    }).join(' ');
    const comparePolygon = compareValues
        ? angles.map((angle, idx) => {
            const key = STAT_ORDER[idx];
            const clamped = Math.max(0, Math.min(compareValues[key] || 0, effectiveMax));
            const level = clamped / effectiveMax;
            const pt = polarPoint(center, center, radius * level, angle);
            return `${pt.x},${pt.y}`;
        }).join(' ')
        : null;

    return (
        <div className={className}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto overflow-visible">
                {/* Grid */}
                {gridLevels.map((level, idx) => (
                    <polygon
                        key={`grid-${idx}`}
                        points={makePolygon(level)}
                        fill="none"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="1"
                    />
                ))}

                {/* Axes */}
                {angles.map((angle, idx) => {
                    const pt = polarPoint(center, center, radius, angle);
                    return (
                        <line
                            key={`axis-${idx}`}
                            x1={center}
                            y1={center}
                            x2={pt.x}
                            y2={pt.y}
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* Data polygons */}
                {comparePolygon && (
                    <polygon
                        points={comparePolygon}
                        fill={compareColor.fill}
                        stroke={compareColor.stroke}
                        strokeWidth="2"
                    />
                )}
                <polygon
                    points={valuePolygon}
                    fill={primaryColor.fill}
                    stroke={primaryColor.stroke}
                    strokeWidth="2"
                />

                {/* Labels */}
                {showLabels && angles.map((angle, idx) => {
                    const key = STAT_ORDER[idx];
                    const labelPt = polarPoint(center, center, radius + 12, angle);
                    const anchor = Math.abs(angle) === 90 ? 'middle' : angle > 90 || angle < -90 ? 'end' : 'start';
                    return (
                        <text
                            key={`label-${key}`}
                            x={labelPt.x}
                            y={labelPt.y}
                            textAnchor={anchor}
                            alignmentBaseline="middle"
                            className="fill-slate-200 text-[11px] font-medium tracking-[0.02em]"
                        >
                            {labels[key]}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

export default HexRadar;
