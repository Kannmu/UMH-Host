import { IPC_CHANNELS, DeviceCommand, StimulationType } from '../shared/types';

declare global {
  interface Window {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
      send: (channel: string, ...args: any[]) => void;
    };
  }
}

export const deviceService = {
  listPorts: () => window.ipcRenderer.invoke(IPC_CHANNELS.SERIAL_LIST),
  
  connect: (path: string, baudRate: number = 115200) => 
    window.ipcRenderer.invoke(IPC_CHANNELS.SERIAL_CONNECT, path, baudRate),
    
  disconnect: () => window.ipcRenderer.invoke(IPC_CHANNELS.SERIAL_DISCONNECT),
  
  sendCommand: (cmdType: DeviceCommand, payload?: Uint8Array) => 
    window.ipcRenderer.send(IPC_CHANNELS.DEVICE_COMMAND, cmdType, payload),

  // Helpers
  enableOutput: (enable: boolean) => 
    deviceService.sendCommand(DeviceCommand.ENABLE_DISABLE, new Uint8Array([enable ? 1 : 0])),
    
  ping: () => {
    const randomByte = Math.floor(Math.random() * 255);
    deviceService.sendCommand(DeviceCommand.PING, new Uint8Array([randomByte]));
  },

  getStatus: () => deviceService.sendCommand(DeviceCommand.GET_STATUS),
  
  getConfig: () => deviceService.sendCommand(DeviceCommand.GET_CONFIG),

  setStimulation: (type: StimulationType, x: number, y: number, z: number, intensity: number, frequency: number) => {
    // Pack struct: type(1) + x(4) + y(4) + z(4) + intensity(4) + frequency(4)
    // All Little Endian
    const buffer = new ArrayBuffer(1 + 12 + 4 + 4);
    const view = new DataView(buffer);
    let offset = 0;
    
    view.setUint8(offset++, type);
    view.setFloat32(offset, x, true); offset += 4;
    view.setFloat32(offset, y, true); offset += 4;
    view.setFloat32(offset, z, true); offset += 4;
    view.setFloat32(offset, intensity, true); offset += 4;
    view.setFloat32(offset, frequency, true); offset += 4;
    
    deviceService.sendCommand(DeviceCommand.SET_STIMULATION, new Uint8Array(buffer));
  }
};
