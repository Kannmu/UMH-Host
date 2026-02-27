import { create } from 'zustand';
import { DeviceConfig, DeviceStatus, ConnectionStatusPayload, IPC_CHANNELS } from '../shared/types';

interface DeviceState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  config: DeviceConfig | null;
  status: DeviceStatus | null;
  lastPing: number | null;
  
  setConnectionStatus: (payload: ConnectionStatusPayload) => void;
  setConfig: (config: DeviceConfig) => void;
  setStatus: (status: DeviceStatus) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connectionStatus: 'disconnected',
  connectionError: null,
  config: null,
  status: null,
  lastPing: null,

  setConnectionStatus: (payload) => set({ 
    connectionStatus: payload.status, 
    connectionError: payload.error || null 
  }),
  setConfig: (config) => set({ config }),
  setStatus: (status) => set({ status }),
}));

// Initialize listeners
export const initDeviceListeners = () => {
  window.ipcRenderer.on(IPC_CHANNELS.SERIAL_STATUS, (_, payload: ConnectionStatusPayload) => {
    useDeviceStore.getState().setConnectionStatus(payload);
  });
  
  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_CONFIG, (_, config: DeviceConfig) => {
    useDeviceStore.getState().setConfig(config);
  });
  
  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_STATUS, (_, status: DeviceStatus) => {
    useDeviceStore.getState().setStatus(status);
  });
};
