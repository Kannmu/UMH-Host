import React, { useEffect, useState } from 'react';
import { deviceService } from '../services/device';
import { useDeviceStore } from '../store/useDeviceStore';
import { RefreshCw, Link2, Link2Off } from 'lucide-react';
import { SerialPortInfo } from '../shared/types';
import clsx from 'clsx';

export const SerialConnect: React.FC = () => {
  const { connectionStatus } = useDeviceStore();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [loading, setLoading] = useState(false);

  const baudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

  const refreshPorts = async () => {
    setLoading(true);
    try {
      const list = await deviceService.listPorts();
      setPorts(list);
      if (list.length > 0 && !selectedPort) {
        setSelectedPort(list[0].path);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    if (!selectedPort) return;
    try {
      await deviceService.connect(selectedPort, baudRate);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await deviceService.disconnect();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-2 shadow-sm">
      <select 
        className="bg-transparent border-none text-sm focus:ring-0 min-w-[120px] outline-none"
        value={selectedPort}
        onChange={(e) => setSelectedPort(e.target.value)}
        disabled={connectionStatus === 'connected'}
      >
        <option value="" disabled>Select Port</option>
        {ports.map((p) => (
          <option key={p.path} value={p.path}>
            {p.path} {p.friendlyName ? `(${p.friendlyName})` : ''}
          </option>
        ))}
      </select>

      <div className="h-4 w-px bg-border mx-1" />

      <select
        className="bg-transparent border-none text-sm focus:ring-0 outline-none w-[90px]"
        value={baudRate}
        onChange={(e) => setBaudRate(Number(e.target.value))}
        disabled={connectionStatus === 'connected'}
      >
        {baudRates.map((rate) => (
          <option key={rate} value={rate}>
            {rate}
          </option>
        ))}
      </select>

      <div className="h-4 w-px bg-border mx-1" />

      <button 
        onClick={refreshPorts} 
        disabled={connectionStatus === 'connected' || loading}
        className="p-1 hover:bg-muted rounded-md text-muted-foreground transition-colors"
      >
        <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
      </button>

      <div className="h-4 w-px bg-border mx-1" />

      {connectionStatus === 'connected' ? (
        <button 
          onClick={handleDisconnect}
          className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm font-medium transition-colors"
        >
          <Link2Off className="w-4 h-4" />
          Disconnect
        </button>
      ) : (
        <button 
          onClick={handleConnect}
          disabled={!selectedPort || connectionStatus === 'connecting'}
          className={clsx(
            "flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            connectionStatus === 'connecting' && "opacity-50 cursor-not-allowed"
          )}
        >
          <Link2 className="w-4 h-4" />
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
      )}
    </div>
  );
};
