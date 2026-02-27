import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { VoltageChart } from './VoltageChart';
import { Activity, Thermometer, Cpu, Zap } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { status, connectionStatus } = useDeviceStore();
  const [history, setHistory] = useState<{ time: number; vdda: number; v3v3: number; v5v0: number; temp: number }[]>([]);

  useEffect(() => {
    if (status) {
      setHistory(prev => {
        const newItem = {
          time: Date.now(),
          vdda: status.vdda,
          v3v3: status.v3v3,
          v5v0: status.v5v0,
          temp: status.temperature
        };
        const newHistory = [...prev, newItem];
        if (newHistory.length > 100) newHistory.shift(); // Keep last 100 points
        return newHistory;
      });
    }
  }, [status]);

  if (connectionStatus !== 'connected') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Activity className="w-12 h-12 mb-4 opacity-20" />
        <p>Connect to a device to view dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard 
          title="VDDA" 
          value={status?.vdda.toFixed(2)} 
          unit="V" 
          icon={Zap} 
          color="text-purple-500" 
        />
        <StatusCard 
          title="Temperature" 
          value={status?.temperature.toFixed(1)} 
          unit="°C" 
          icon={Thermometer} 
          color="text-red-500" 
        />
        <StatusCard 
          title="Loop Freq" 
          value={status?.loopFreq.toFixed(0)} 
          unit="Hz" 
          icon={Activity} 
          color="text-green-500" 
        />
        <StatusCard 
          title="DMA Time" 
          value={status?.dmaUpdateStats.toFixed(1)} 
          unit="µs" 
          icon={Cpu} 
          color="text-blue-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Voltage Monitor
          </h3>
          <VoltageChart data={history} />
        </div>
        
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
          <h3 className="font-medium mb-4 flex items-center gap-2">
             <Thermometer className="w-4 h-4 text-muted-foreground" />
             Temperature (Last 10s)
          </h3>
           <div className="h-64 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-lg bg-secondary/20">
             <span className="opacity-50">Temperature Chart Placeholder</span>
           </div>
        </div>
      </div>
    </div>
  );
};

const StatusCard = ({ title, value, unit, icon: Icon, color }: any) => (
  <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between transition-all hover:shadow-md">
    <div>
      <p className="text-sm text-muted-foreground font-medium">{title}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold tabular-nums">{value ?? '--'}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
    <div className={`p-2 rounded-full bg-secondary/50 ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
  </div>
);
