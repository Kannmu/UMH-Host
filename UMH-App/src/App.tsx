import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SerialConnect } from './components/SerialConnect';
import { Dashboard } from './components/Dashboard';
import { initDeviceListeners, useDeviceStore } from './store/useDeviceStore';
import { Activity } from 'lucide-react';
import { Control3DPanel } from './components/control3d/Control3DPanel';

const formatSignificant = (value: number, significantDigits: number = 4): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return Number(value.toPrecision(significantDigits)).toString();
};

const formatFrequency = (hz: number | undefined): { value: string; unit: string } => {
  if (hz === undefined || !Number.isFinite(hz)) {
    return { value: '--', unit: 'Hz' };
  }

  const abs = Math.abs(hz);
  if (abs >= 1e6) {
    return { value: formatSignificant(hz / 1e6), unit: 'MHz' };
  }
  if (abs >= 1e3) {
    return { value: formatSignificant(hz / 1e3), unit: 'kHz' };
  }

  return { value: formatSignificant(hz), unit: 'Hz' };
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { status } = useDeviceStore();
  const loopFreq = useMemo(() => formatFrequency(status?.loopFreq), [status?.loopFreq]);

  useEffect(() => {
    initDeviceListeners();
  }, []);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
            {status && (
              <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 bg-secondary rounded-full">
                <Activity className="w-3 h-3 text-green-500" />
                <span>{loopFreq.value} {loopFreq.unit}</span>
                <span className="text-muted-foreground">|</span>
                <span>{status.temperature.toFixed(1)}°C</span>
              </div>
            )}
          </div>
          
          <SerialConnect />
        </header>

        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'dashboard' && (
            <Dashboard />
          )}
          
          {activeTab === 'visualizer' && (
            <Control3DPanel />
          )}
          
          {activeTab === 'settings' && (
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
               <h3 className="font-medium mb-4">Device Settings</h3>
               <p className="text-sm text-muted-foreground">Configuration options will appear here.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
