import { IPC_CHANNELS, DeviceCommand, StimulationType } from '../shared/types';

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

  setDemo: (index: number) =>
    deviceService.sendCommand(DeviceCommand.SET_DEMO, new Uint8Array([index & 0xff])),

  setPhases: (phases: number[]) => {
    const floatPhases = phases.slice(0);
    const buffer = new ArrayBuffer(floatPhases.length * 4);
    const view = new DataView(buffer);

    for (let i = 0; i < floatPhases.length; i++) {
      view.setFloat32(i * 4, floatPhases[i], true);
    }

    deviceService.sendCommand(DeviceCommand.SET_PHASES, new Uint8Array(buffer));
  },

  setStimulation: (type: StimulationType, x: number, y: number, z: number, intensity: number, frequency: number) => {
    // Point payload: type(1) + position xyz(12) + strength(4) + frequency(4)
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
  },

  setLinearStimulation: (
    type: StimulationType.DISCRETE | StimulationType.LINEAR,
    start: [number, number, number],
    end: [number, number, number],
    intensity: number,
    frequency: number,
  ) => {
    const buffer = new ArrayBuffer(1 + 24 + 4 + 4);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint8(offset++, type);

    for (const value of start) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }

    for (const value of end) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }

    view.setFloat32(offset, intensity, true);
    offset += 4;
    view.setFloat32(offset, frequency, true);

    deviceService.sendCommand(DeviceCommand.SET_STIMULATION, new Uint8Array(buffer));
  },

  setCircularStimulation: (
    normal: [number, number, number],
    radius: number,
    intensity: number,
    frequency: number,
  ) => {
    const buffer = new ArrayBuffer(1 + 16 + 4 + 4);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint8(offset++, StimulationType.CIRCULAR);

    for (const value of normal) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }

    view.setFloat32(offset, radius, true);
    offset += 4;
    view.setFloat32(offset, intensity, true);
    offset += 4;
    view.setFloat32(offset, frequency, true);

    deviceService.sendCommand(DeviceCommand.SET_STIMULATION, new Uint8Array(buffer));
  }
};
