import { create } from 'zustand';
import {
  DeviceConfig,
  DeviceStatus,
  ConnectionStatusPayload,
  IPC_CHANNELS,
  PingAckPayload,
  DeviceAckPayload,
  TransducerPosition,
} from '../shared/types';

interface DeviceState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  config: DeviceConfig | null;
  lastConfigAt: number | null;
  status: DeviceStatus | null;
  lastStatusAt: number | null;
  lastPing: PingAckPayload | null;
  lastAck: DeviceAckPayload | null;
  transducerLayout: TransducerPosition[];
  
  setConnectionStatus: (payload: ConnectionStatusPayload) => void;
  setConfig: (config: DeviceConfig) => void;
  setStatus: (status: DeviceStatus) => void;
  setLastPing: (ping: PingAckPayload) => void;
  setLastAck: (ack: DeviceAckPayload) => void;
  setTransducerLayout: (layout: TransducerPosition[]) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
  connectionStatus: 'disconnected',
  connectionError: null,
  config: null,
  lastConfigAt: null,
  status: null,
  lastStatusAt: null,
  lastPing: null,
  lastAck: null,
  transducerLayout: [],

  setConnectionStatus: (payload) =>
    set(() => {
      if (payload.status === 'connecting') {
        return {
          connectionStatus: payload.status,
          connectionError: payload.error || null,
          config: null,
          lastConfigAt: null,
          status: null,
          lastStatusAt: null,
          lastPing: null,
          lastAck: null,
          transducerLayout: [],
        };
      }

      const isDisconnected = payload.status === 'disconnected' || payload.status === 'error';
      if (!isDisconnected) {
        return {
          connectionStatus: payload.status,
          connectionError: payload.error || null,
        };
      }

      return {
        connectionStatus: payload.status,
        connectionError: payload.error || null,
        config: null,
        lastConfigAt: null,
        status: null,
        lastStatusAt: null,
        lastPing: null,
        lastAck: null,
        transducerLayout: [],
      };
    }),
  setConfig: (config) => set({ config, lastConfigAt: Date.now() }),
  setStatus: (status) => set({ status, lastStatusAt: Date.now() }),
  setLastPing: (ping) => set({ lastPing: ping }),
  setLastAck: (ack) => set({ lastAck: ack }),
  setTransducerLayout: (layout) => set({ transducerLayout: layout }),
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

  window.ipcRenderer.on(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, (_, layout: TransducerPosition[]) => {
    useDeviceStore.getState().setTransducerLayout(layout);
  });
};
