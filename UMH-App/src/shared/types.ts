
// Shared types for UMH Host

// Frame structure constants
export const FRAME_HEADER = 0xAA55;
export const FRAME_TAIL = 0x0D0A;

// Command types (PC -> UMH)
export enum DeviceCommand {
  ENABLE_DISABLE = 0x01,
  PING = 0x02,
  GET_CONFIG = 0x03,
  GET_STATUS = 0x04,
  SET_STIMULATION = 0x05,
  SET_PHASES = 0x06,
  SET_DEMO = 0x07,
}

// Response types (UMH -> PC)
export enum DeviceResponse {
  ACK = 0x80,
  NACK = 0x81,
  PING_ACK = 0x82,
  RETURN_CONFIG = 0x83,
  RETURN_STATUS = 0x84,
  SACK = 0x85,
  DEMO_ACK = 0x86,
  ERROR = 0xFF,
}

// Stimulation types
export enum StimulationType {
  POINT = 0,
  LINEAR = 1,
  CIRCULAR = 2,
  TWIN_TRAP = 3,
}

export interface DeviceConfig {
  serialNumber: string; // 12 bytes
  version: number; // uint32
  arrayType: number; // uint8
  arraySize: number; // uint32
  transducerCount: number; // uint32
  transducerSize: number; // float
  transducerSpace: number; // float
}

export interface DeviceStatus {
  vdda: number; // float
  v3v3: number; // float
  v5v0: number; // float
  temperature: number; // float
  dmaUpdateStats: number; // double
  loopFreq: number; // float
  stimulationType: number; // uint8
  calibrationMode: number; // uint32
  phaseSetMode: number; // uint32
}

export interface StimulationParams {
  type: StimulationType;
  position: { x: number; y: number; z: number }; // meters
  intensity: number; // 0.0 - 1.0
  frequency: number; // Hz
}

// IPC Channels
export const IPC_CHANNELS = {
  SERIAL_CONNECT: 'serial:connect',
  SERIAL_DISCONNECT: 'serial:disconnect',
  SERIAL_LIST: 'serial:list',
  SERIAL_STATUS: 'serial:status', // Event
  DEVICE_COMMAND: 'device:command',
  DEVICE_STATUS: 'device:status', // Event
  DEVICE_CONFIG: 'device:config', // Event
};

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
  friendlyName?: string;
}

export interface ConnectionStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
}
