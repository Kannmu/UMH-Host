import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { SerialConnect } from './components/SerialConnect';
import { Dashboard } from './components/Dashboard';
import { initDeviceListeners, useDeviceStore } from './store/useDeviceStore';
import { Activity, Cuboid, SlidersHorizontal, Sparkles } from 'lucide-react';
import { deviceService } from './services/device';
import { StimulationType } from './shared/types';

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const Control3DPanel: React.FC = () => {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [z, setZ] = useState(0.1);
  const [intensity, setIntensity] = useState(100);
  const [frequency, setFrequency] = useState(200);

  const focusStyle = useMemo(() => {
    const nx = clamp((x + 0.05) / 0.1, 0, 1);
    const ny = clamp((y + 0.05) / 0.1, 0, 1);
    return {
      left: `${nx * 100}%`,
      top: `${(1 - ny) * 100}%`,
    };
  }, [x, y]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 p-6 rounded-xl border border-border bg-card shadow-sm">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Cuboid className="w-4 h-4 text-muted-foreground" />
            3D Focus Preview
          </h3>
          <div className="rounded-xl border border-border bg-gradient-to-b from-slate-100 to-slate-50 p-4">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.18),_transparent_60%)]">
              <div className="absolute inset-0 opacity-50" style={{ backgroundSize: '24px 24px', backgroundImage: 'linear-gradient(to right, rgba(100,116,139,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.15) 1px, transparent 1px)' }} />
              <div className="absolute left-1/2 top-0 h-full w-px bg-slate-400/40" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-slate-400/40" />
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={focusStyle}
              >
                <div className="h-5 w-5 rounded-full border-2 border-red-500 bg-red-400/40 shadow-[0_0_0_6px_rgba(239,68,68,0.15)]" />
              </div>
              <div className="absolute bottom-3 left-3 rounded-md bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
                XY plane preview, Z = {z.toFixed(3)} m
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            Focus Parameters
          </h3>

          <LabeledRange label="X (m)" min={-0.05} max={0.05} step={0.001} value={x} onChange={setX} />
          <LabeledRange label="Y (m)" min={-0.05} max={0.05} step={0.001} value={y} onChange={setY} />
          <LabeledRange label="Z (m)" min={0.01} max={0.2} step={0.001} value={z} onChange={setZ} />
          <LabeledRange label="Intensity" min={0} max={255} step={1} value={intensity} onChange={setIntensity} />
          <LabeledRange label="Frequency (Hz)" min={1} max={2000} step={1} value={frequency} onChange={setFrequency} />

          <button
            onClick={() => deviceService.setStimulation(StimulationType.POINT, x, y, z, intensity, frequency)}
            className="w-full px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Send Point Stimulation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickAction
          title="Center Focus"
          desc="Set focus to center point"
          onClick={() => {
            setX(0);
            setY(0);
          }}
        />
        <QuickAction
          title="Shallow Layer"
          desc="Bring focus near array"
          onClick={() => setZ(0.04)}
        />
        <QuickAction
          title="Burst Test"
          desc="Apply high intensity pulse"
          onClick={() => {
            setIntensity(220);
            setFrequency(350);
          }}
        />
      </div>

      <div className="p-4 rounded-xl border border-border bg-card shadow-sm text-sm text-muted-foreground flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        Basic 3D control flow is active. Next step can layer in full array mesh and drag-to-place focus interaction.
      </div>
    </div>
  );
};

interface LabeledRangeProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

const LabeledRange: React.FC<LabeledRangeProps> = ({ label, min, max, step, value, onChange }) => (
  <label className="block text-xs text-muted-foreground">
    <div className="flex items-center justify-between mb-1">
      <span>{label}</span>
      <span className="tabular-nums">{value.toFixed(3)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  </label>
);

interface QuickActionProps {
  title: string;
  desc: string;
  onClick: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ title, desc, onClick }) => (
  <button
    onClick={onClick}
    className="p-4 rounded-xl border border-border bg-card shadow-sm text-left hover:bg-muted/40 transition-colors"
  >
    <p className="font-medium text-sm">{title}</p>
    <p className="text-xs text-muted-foreground mt-1">{desc}</p>
  </button>
);
