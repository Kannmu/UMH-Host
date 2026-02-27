import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface TimePoint {
  time: number;
}

export interface TimeSeriesLineDefinition<T extends TimePoint> {
  dataKey: keyof T & string;
  name: string;
  color: string;
  strokeWidth?: number;
  valueFormatter?: (value: number) => string;
}

interface TimeSeriesLineChartProps<T extends TimePoint> {
  data: T[];
  lines: Array<TimeSeriesLineDefinition<T>>;
  yTickFormatter: (value: number) => string;
  className?: string;
}

const defaultValueFormatter = (value: number) => value.toFixed(3);

const formatElapsedSecondsLabel = (value: number, data: TimePoint[]): string => {
  if (data.length === 0) {
    return '0.0s';
  }

  const elapsedSeconds = Math.max(0, (value - data[0].time) / 1000);
  return `${elapsedSeconds.toFixed(1)}s`;
};

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

const SharedTooltip = <T extends TimePoint,>({
  active,
  payload,
  label,
  data,
  lineMap,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
  data: T[];
  lineMap: Record<string, TimeSeriesLineDefinition<T>>;
}) => {
  if (!active || !payload || payload.length === 0 || label === undefined) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <p className="text-xs text-muted-foreground">t = {formatElapsedSecondsLabel(label, data)}</p>
      {payload.map((item) => {
        const line = lineMap[item.name];
        const formatter = line?.valueFormatter ?? defaultValueFormatter;
        return (
          <p key={item.name} className="text-sm tabular-nums" style={{ color: item.color }}>
            {item.name}: {formatter(Number(item.value))}
          </p>
        );
      })}
    </div>
  );
};

export const TimeSeriesLineChart = <T extends TimePoint,>({
  data,
  lines,
  yTickFormatter,
  className = 'h-64 w-full',
}: TimeSeriesLineChartProps<T>) => {
  const lineMap = lines.reduce<Record<string, TimeSeriesLineDefinition<T>>>((map, line) => {
    map[line.name] = line;
    return map;
  }, {});

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke="currentColor" />
          <XAxis
            dataKey="time"
            tickFormatter={(value) => formatElapsedSecondsLabel(value, data)}
            stroke="currentColor"
            fontSize={12}
            minTickGap={20}
          />
          <YAxis domain={['auto', 'auto']} stroke="currentColor" fontSize={12} tickFormatter={yTickFormatter} width={50} />
          <Tooltip content={<SharedTooltip data={data} lineMap={lineMap} />} />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.color}
              dot={false}
              strokeWidth={line.strokeWidth ?? 2}
              name={line.name}
              animationDuration={300}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
