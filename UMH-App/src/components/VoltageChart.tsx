import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface VoltageChartProps {
  data: { time: number; vdda: number; v3v3: number; v5v0: number }[];
}

export const VoltageChart: React.FC<VoltageChartProps> = ({ data }) => {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke="currentColor" />
          <XAxis dataKey="time" hide />
          <YAxis domain={['auto', 'auto']} stroke="currentColor" fontSize={12} tickFormatter={(val) => val.toFixed(1)} />
          <Tooltip 
            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '0.5rem' }}
            itemStyle={{ color: 'hsl(var(--foreground))' }}
            labelStyle={{ display: 'none' }}
          />
          <Line type="monotone" dataKey="vdda" stroke="#8b5cf6" dot={false} strokeWidth={2} name="VDDA" animationDuration={300} />
          <Line type="monotone" dataKey="v3v3" stroke="#10b981" dot={false} strokeWidth={2} name="3.3V" animationDuration={300} />
          <Line type="monotone" dataKey="v5v0" stroke="#f59e0b" dot={false} strokeWidth={2} name="5.0V" animationDuration={300} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
