import React from 'react';
import { TimeSeriesLineChart, TimeSeriesLineDefinition } from './TimeSeriesLineChart';

export interface TemperatureSample {
  time: number;
  temp: number;
}

interface TemperatureMonitorChartProps {
  data: TemperatureSample[];
}

const temperatureLine: Array<TimeSeriesLineDefinition<TemperatureSample>> = [
  { dataKey: 'temp', name: 'Temperature (C)', color: '#ef4444', valueFormatter: (value) => value.toFixed(2) },
];

export const TemperatureMonitorChart: React.FC<TemperatureMonitorChartProps> = ({ data }) => (
  <TimeSeriesLineChart data={data} lines={temperatureLine} yTickFormatter={(value) => value.toFixed(1)} />
);
