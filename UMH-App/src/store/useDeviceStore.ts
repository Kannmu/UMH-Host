import { create } from 'zustand';
import {
  DeviceConfig,
  DeviceStatus,
  ConnectionStatusPayload,
  IPC_CHANNELS,
  PingAckPayload,
  DeviceAckPayload,
} from '../shared/types';

interface DeviceState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  config: DeviceConfig | null;
  status: DeviceStatus | null;
  lastPing: PingAckPayload | null;
  lastAck: DeviceAckPayload | null;
  
  setConnectionStatus: (payload: ConnectionStatusPayload) => void;
  setConfig: (config: DeviceConfig) => void;
  setStatus: (status: DeviceStatus) => void;
  setLastPing: (ping: PingAckPayload) => void;
  setLastAck: (ack: DeviceAckPayload) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connectionStatus: 'disconnected',
  connectionError: null,
  config: null,
  status: null,
  lastPing: null,
  lastAck: null,

  setConnectionStatus: (payload) => set({ 
    connectionStatus: payload.status, 
    connectionError: payload.error || null 
  }),
  setConfig: (config) => set({ config }),
  setStatus: (status) => set({ status }),
  setLastPing: (ping) => set({ lastPing: ping }),
  setLastAck: (ack) => set({ lastAck: ack }),
}));

// Initialize listeners
let listenersInitialized = false;

export const initDeviceListeners = () => {
  if (listenersInitialized) {
    return;
  }

  listenersInitialized = true;

  window.ipcRenderer.on(IPC_CHANNELS.SERIAL_STATUS, (_, payload: ConnectionStatusPayload) => {
    useDeviceStore.getState().setConnectionStatus(payload);
  });
  
  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_CONFIG, (_, config: DeviceConfig) => {
    useDeviceStore.getState().setConfig(config);
  });
  
  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_STATUS, (_, status: DeviceStatus) => {
    useDeviceStore.getState().setStatus(status);
  });

  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_PING_ACK, (_, ping: PingAckPayload) => {
    useDeviceStore.getState().setLastPing(ping);
  });

  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_ACK, (_, ack: DeviceAckPayload) => {
    useDeviceStore.getState().setLastAck(ack);
  });
};
