import React from 'react';
import { TimeSeriesLineChart, TimeSeriesLineDefinition } from './TimeSeriesLineChart';

export interface VoltageSample {
  time: number;
  vdda: number;
  v3v3: number;
  v5v0: number;
}

interface VoltageMonitorChartProps {
  data: VoltageSample[];
}

const voltageLines: Array<TimeSeriesLineDefinition<VoltageSample>> = [
  { dataKey: 'vdda', name: 'VDDA (V)', color: '#6366f1', valueFormatter: (value) => value.toFixed(3) },
  { dataKey: 'v3v3', name: 'V3V3 (V)', color: '#10b981', valueFormatter: (value) => value.toFixed(3) },
  { dataKey: 'v5v0', name: 'V5V0 (V)', color: '#f59e0b', valueFormatter: (value) => value.toFixed(3) },
];

export const VoltageMonitorChart: React.FC<VoltageMonitorChartProps> = ({ data }) => (
  <TimeSeriesLineChart data={data} lines={voltageLines} yTickFormatter={(value) => value.toFixed(2)} />
);
