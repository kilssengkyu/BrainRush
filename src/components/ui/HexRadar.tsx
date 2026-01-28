import React from 'react';

type StatKey = 'speed' | 'memory' | 'judgment' | 'calculation' | 'accuracy' | 'observation';

interface HexRadarProps {
    values: Record<StatKey, number>;
    labels: Record<StatKey, string>;
    max?: number;
    size?: number;
    className?: string;
}

const STAT_ORDER: StatKey[] = ['speed', 'memory', 'judgment', 'calculation', 'accuracy', 'observation'];

const polarPoint = (cx: number, cy: number, radius: number, angleDeg: number) => {
    const rad = (Math.PI / 180) * angleDeg;
    return {
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad)
    };
};

const HexRadar: React.FC<HexRadarProps> = ({ values, labels, max = 999, size = 240, className }) => {
    const padding = 28;
    const radius = size / 2 - padding;
    const center = size / 2;
    const angles = STAT_ORDER.map((_, idx) => -90 + idx * 60);

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
        const clamped = Math.max(0, Math.min(values[key] || 0, max));
        const level = clamped / max;
        const pt = polarPoint(center, center, radius * level, angle);
        return `${pt.x},${pt.y}`;
    }).join(' ');

    return (
        <div className={className}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
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

                {/* Data polygon */}
                <polygon
                    points={valuePolygon}
                    fill="rgba(59,130,246,0.25)"
                    stroke="rgba(59,130,246,0.9)"
                    strokeWidth="2"
                />

                {/* Labels */}
                {angles.map((angle, idx) => {
                    const key = STAT_ORDER[idx];
                    const labelPt = polarPoint(center, center, radius + 16, angle);
                    const anchor = Math.abs(angle) === 90 ? 'middle' : angle > 90 || angle < -90 ? 'end' : 'start';
                    return (
                        <text
                            key={`label-${key}`}
                            x={labelPt.x}
                            y={labelPt.y}
                            textAnchor={anchor}
                            alignmentBaseline="middle"
                            className="fill-gray-300 text-[10px] font-bold"
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
