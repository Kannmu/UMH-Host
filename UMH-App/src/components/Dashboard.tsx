import React, { useEffect, useMemo, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { TemperatureMonitorChart } from './charts/TemperatureMonitorChart';
import { VoltageMonitorChart } from './charts/VoltageMonitorChart';
import { Activity, Thermometer, Cpu, Zap, Settings2, Gauge, Send, Radar } from 'lucide-react';
import { deviceService } from '../services/device';
import { DeviceResponse, StimulationType } from '../shared/types';

interface TelemetryPoint {
  time: number;
  vdda: number;
  v3v3: number;
  v5v0: number;
  temp: number;
}

const DEFAULT_HISTORY_WINDOW_SECONDS = 5;
const MIN_HISTORY_WINDOW_SECONDS = 1;
const MAX_HISTORY_WINDOW_SECONDS = 120;

const clampHistoryWindowSeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_WINDOW_SECONDS;
  }

  return Math.min(MAX_HISTORY_WINDOW_SECONDS, Math.max(MIN_HISTORY_WINDOW_SECONDS, value));
};

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

const formatDurationFromSeconds = (seconds: number | undefined): { value: string; unit: string } => {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return { value: '--', unit: 's' };
  }

  const abs = Math.abs(seconds);
  if (abs >= 1) {
    return { value: formatSignificant(seconds), unit: 's' };
  }
  if (abs >= 1e-3) {
    return { value: formatSignificant(seconds * 1e3), unit: 'ms' };
  }
  if (abs >= 1e-6) {
    return { value: formatSignificant(seconds * 1e6), unit: 'us' };
  }

  return { value: formatSignificant(seconds * 1e9), unit: 'ns' };
};

export const Dashboard: React.FC = () => {
  const { status, config, connectionStatus, lastPing, lastAck } = useDeviceStore();
  const [history, setHistory] = useState<TelemetryPoint[]>([]);
  const [historyWindowSeconds, setHistoryWindowSeconds] = useState(DEFAULT_HISTORY_WINDOW_SECONDS);
  const [outputEnabled, setOutputEnabled] = useState(true);
  const [demoIndex, setDemoIndex] = useState(0);

  const [stimType, setStimType] = useState<StimulationType>(StimulationType.POINT);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [z, setZ] = useState(0.1);
  const [intensity, setIntensity] = useState(100);
  const [frequency, setFrequency] = useState(200);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0.0125);
  const [startZ, setStartZ] = useState(0.1);
  const [endX, setEndX] = useState(0);
  const [endY, setEndY] = useState(-0.0125);
  const [endZ, setEndZ] = useState(0.1);
  const [normalX, setNormalX] = useState(0);
  const [normalY, setNormalY] = useState(0);
  const [normalZ, setNormalZ] = useState(1);
  const [radius, setRadius] = useState(0.004);

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
        const cutoffTime = newItem.time - historyWindowSeconds * 1000;
        return [...prev, newItem].filter((item) => item.time >= cutoffTime);
      });
    }
  }, [historyWindowSeconds, status]);

  useEffect(() => {
    const cutoffTime = Date.now() - historyWindowSeconds * 1000;
    setHistory((prev) => prev.filter((item) => item.time >= cutoffTime));
  }, [historyWindowSeconds]);

  const temperatureHistory = useMemo(
    () => history.map((item) => ({ time: item.time, temp: item.temp })),
    [history],
  );

  const loopFreq = useMemo(() => formatFrequency(status?.loopFreq), [status?.loopFreq]);
  const dmaTime = useMemo(() => formatDurationFromSeconds(status?.dmaUpdateStats), [status?.dmaUpdateStats]);

  const sendStimulation = () => {
    if (stimType === StimulationType.POINT) {
      deviceService.setStimulation(stimType, x, y, z, intensity, frequency);
      return;
    }

    if (stimType === StimulationType.DISCRETE || stimType === StimulationType.LINEAR) {
      deviceService.setLinearStimulation(
        stimType,
        [startX, startY, startZ],
        [endX, endY, endZ],
        intensity,
        frequency,
      );
      return;
    }

    if (stimType === StimulationType.CIRCULAR) {
      deviceService.setCircularStimulation(
        [normalX, normalY, normalZ],
        radius,
        intensity,
        frequency,
      );
    }
  };

  const ackLabel = (() => {
    if (!lastAck) return 'None';
    switch (lastAck.type) {
      case DeviceResponse.ACK:
        return 'ACK';
      case DeviceResponse.NACK:
        return 'NACK';
      case DeviceResponse.SACK:
        return 'SACK';
      case DeviceResponse.DEMO_ACK:
        return 'DEMO_ACK';
      case DeviceResponse.ERROR:
        return 'ERROR';
      default:
        return `0x${lastAck.type.toString(16)}`;
    }
  })();

  const pingRttLabel = lastPing && lastPing.rttMs >= 0 ? `${formatSignificant(lastPing.rttMs)} ms` : '--';

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
          value={loopFreq.value}
          unit={loopFreq.unit}
          icon={Activity} 
          color="text-green-500" 
        />
        <StatusCard 
          title="DMA Time" 
          value={dmaTime.value}
          unit={dmaTime.unit}
          icon={Cpu} 
          color="text-blue-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Voltage Monitor
            </h3>
            <label className="text-xs text-muted-foreground">
              Window (s)
              <input
                type="number"
                min={MIN_HISTORY_WINDOW_SECONDS}
                max={MAX_HISTORY_WINDOW_SECONDS}
                step={1}
                value={historyWindowSeconds}
                onChange={(e) => setHistoryWindowSeconds(clampHistoryWindowSeconds(Number(e.target.value)))}
                className="input ml-2 w-20"
              />
            </label>
          </div>
          <VoltageMonitorChart data={history} />
        </div>
        
        <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
          <h3 className="font-medium mb-4 flex items-center gap-2">
             <Thermometer className="w-4 h-4 text-muted-foreground" />
             Temperature Monitor
            </h3>
            <TemperatureMonitorChart data={temperatureHistory} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 p-6 rounded-xl border border-border bg-card shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Command Center</h3>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Device Commands</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const next = !outputEnabled;
                  setOutputEnabled(next);
                  deviceService.enableOutput(next);
                }}
                className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {outputEnabled ? 'Disable Output' : 'Enable Output'}
              </button>
              <button
                onClick={() => deviceService.ping()}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Ping Device
              </button>
              <button
                onClick={() => deviceService.getConfig()}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Refresh Config
              </button>
              <button
                onClick={() => deviceService.getStatus()}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Poll Status Now
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-muted-foreground">
                Demo Program
                <select
                  value={demoIndex}
                  onChange={(e) => setDemoIndex(Number(e.target.value))}
                  className="mt-1 w-full px-2 py-2 rounded-md border border-border bg-transparent text-sm"
                >
                  <option value={0}>DLM_2</option>
                  <option value={1}>DLM_3</option>
                  <option value={2}>ULM_L</option>
                  <option value={3}>LM_L</option>
                  <option value={4}>LM_C</option>
                </select>
              </label>
              <button
                onClick={() => deviceService.setDemo(demoIndex)}
                className="px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
              >
                Apply Demo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <p className="text-muted-foreground">Ping RTT</p>
              <p className="font-semibold tabular-nums">{pingRttLabel}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <p className="text-muted-foreground">Echo Byte</p>
              <p className="font-semibold tabular-nums">{lastPing ? `0x${lastPing.echoedByte.toString(16).padStart(2, '0')}` : '--'}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <p className="text-muted-foreground">Last ACK</p>
              <p className="font-semibold">{ackLabel}</p>
            </div>
          </div>

          <div className="space-y-3 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-muted-foreground" />
                <p className="font-medium text-sm">Stimulation Command</p>
              </div>
              <select
                value={stimType}
                onChange={(e) => setStimType(Number(e.target.value) as StimulationType)}
                className="px-2 py-1 rounded-md border border-border bg-transparent text-sm"
              >
                <option value={StimulationType.POINT}>Point</option>
                <option value={StimulationType.DISCRETE}>Discrete</option>
                <option value={StimulationType.LINEAR}>Linear</option>
                <option value={StimulationType.CIRCULAR}>Circular</option>
              </select>
            </div>

            {stimType === StimulationType.POINT && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <LabeledNumberInput label="X (m)" value={x} onChange={setX} step="0.001" />
                <LabeledNumberInput label="Y (m)" value={y} onChange={setY} step="0.001" />
                <LabeledNumberInput label="Z (m)" value={z} onChange={setZ} step="0.001" />
                <LabeledNumberInput label="Intensity" value={intensity} onChange={setIntensity} step="1" />
                <LabeledNumberInput label="Frequency (Hz)" value={frequency} onChange={setFrequency} step="1" />
              </div>
            )}

            {(stimType === StimulationType.DISCRETE || stimType === StimulationType.LINEAR) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <LabeledNumberInput label="Start X (m)" value={startX} onChange={setStartX} step="0.001" />
                <LabeledNumberInput label="Start Y (m)" value={startY} onChange={setStartY} step="0.001" />
                <LabeledNumberInput label="Start Z (m)" value={startZ} onChange={setStartZ} step="0.001" />
                <LabeledNumberInput label="End X (m)" value={endX} onChange={setEndX} step="0.001" />
                <LabeledNumberInput label="End Y (m)" value={endY} onChange={setEndY} step="0.001" />
                <LabeledNumberInput label="End Z (m)" value={endZ} onChange={setEndZ} step="0.001" />
                <LabeledNumberInput label="Intensity" value={intensity} onChange={setIntensity} step="1" />
                <LabeledNumberInput label="Frequency (Hz)" value={frequency} onChange={setFrequency} step="1" />
              </div>
            )}

            {stimType === StimulationType.CIRCULAR && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <LabeledNumberInput label="Normal X" value={normalX} onChange={setNormalX} step="0.1" />
                <LabeledNumberInput label="Normal Y" value={normalY} onChange={setNormalY} step="0.1" />
                <LabeledNumberInput label="Normal Z" value={normalZ} onChange={setNormalZ} step="0.1" />
                <LabeledNumberInput label="Radius (m)" value={radius} onChange={setRadius} step="0.001" />
                <LabeledNumberInput label="Intensity" value={intensity} onChange={setIntensity} step="1" />
                <LabeledNumberInput label="Frequency (Hz)" value={frequency} onChange={setFrequency} step="1" />
              </div>
            )}

            <button
              onClick={sendStimulation}
              className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Send Stimulation Command
            </button>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-border bg-card shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium">Device Config</h3>
          </div>
          <p className="text-xs text-muted-foreground">Data from latest `Get Config` response.</p>
          <div className="space-y-2 text-sm">
            <ConfigRow label="Serial Number" value={config?.serialNumber ?? '--'} />
            <ConfigRow label="Firmware Version" value={config ? `0x${config.version.toString(16)}` : '--'} />
            <ConfigRow label="Array Type" value={config?.arrayType.toString() ?? '--'} />
            <ConfigRow label="Array Size" value={config?.arraySize.toString() ?? '--'} />
            <ConfigRow label="Transducer Count" value={config?.transducerCount.toString() ?? '--'} />
            <ConfigRow label="Transducer Size" value={config ? `${formatSignificant(config.transducerSize)} m` : '--'} />
            <ConfigRow label="Transducer Spacing" value={config ? `${formatSignificant(config.transducerSpace)} m` : '--'} />
          </div>
          <div className="pt-2">
            <button
              onClick={() => deviceService.getConfig()}
              className="w-full px-3 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
            >
              Get Config Now
            </button>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 border border-border">
            <p className="text-muted-foreground text-xs mb-1">Runtime State</p>
            <p className="text-sm flex items-center gap-2"><Gauge className="w-4 h-4" /> stimulationType: {status?.stimulationType ?? '--'}</p>
            <p className="text-sm mt-1">calibrationMode: {status?.calibrationMode ?? '--'}</p>
            <p className="text-sm mt-1">phaseSetMode: {status?.phaseSetMode ?? '--'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface LabeledNumberInputProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step: string;
}

const LabeledNumberInput: React.FC<LabeledNumberInputProps> = ({ label, value, onChange, step }) => (
  <label className="text-xs text-muted-foreground">
    {label}
    <input
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      type="number"
      step={step}
      className="input mt-1 w-full"
    />
  </label>
);

interface ConfigRowProps {
  label: string;
  value: string;
}

const ConfigRow: React.FC<ConfigRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
);

interface StatusCardProps {
  title: string;
  value: string | undefined;
  unit: string;
  icon: React.ElementType;
  color: string;
}

const StatusCard = ({ title, value, unit, icon: Icon, color }: StatusCardProps) => (
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
