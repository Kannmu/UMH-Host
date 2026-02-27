import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { 
  DeviceCommand, 
  DeviceResponse, 
  IPC_CHANNELS, 
  DeviceConfig, 
  DeviceStatus 
} from '../../src/shared/types';

const HEADER_BYTE_1 = 0xAA;
const HEADER_BYTE_2 = 0x55;
const TAIL_BYTE_1 = 0x0D;
const TAIL_BYTE_2 = 0x0A;

export class SerialService extends EventEmitter {
  private port: SerialPort | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private mainWindow: BrowserWindow | null = null;
  private isConnected: boolean = false;

  constructor() {
    super();
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async listPorts() {
    return await SerialPort.list();
  }

  async connect(path: string, baudRate: number = 115200) {
    if (this.isConnected) {
      await this.disconnect();
    }

    this.emitStatus('connecting');

    return new Promise<void>((resolve, reject) => {
      this.port = new SerialPort({ path, baudRate, autoOpen: false });

      this.port.open((err) => {
        if (err) {
          console.error('Error opening port:', err);
          this.emitStatus('error', err.message);
          this.isConnected = false;
          reject(err);
        } else {
          console.log('Port opened:', path);
          this.isConnected = true;
          this.emitStatus('connected');
          
          // Setup listeners
          this.port?.on('data', (data) => this.handleData(data));
          this.port?.on('close', () => {
            console.log('Port closed');
            this.isConnected = false;
            this.emitStatus('disconnected');
          });
          this.port?.on('error', (err) => {
            console.error('Port error:', err);
            this.isConnected = false;
            this.emitStatus('error', err.message);
          });
          
          resolve();
        }
      });
    });
  }

  async disconnect() {
    if (this.port && this.port.isOpen) {
      return new Promise<void>((resolve) => {
        this.port?.close(() => {
          this.port = null;
          this.isConnected = false;
          this.emitStatus('disconnected');
          resolve();
        });
      });
    } else {
        this.isConnected = false;
        this.emitStatus('disconnected');
    }
  }

  private emitStatus(status: string, error?: string) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(IPC_CHANNELS.SERIAL_STATUS, { status, error });
    }
  }

  sendCommand(cmdType: DeviceCommand, payload: Buffer = Buffer.alloc(0)) {
    if (!this.port || !this.port.isOpen) return;

    const length = payload.length;
    // Frame: Header(2) + Cmd(1) + Len(1) + Payload(N) + Checksum(1) + Tail(2)
    const frame = Buffer.alloc(2 + 1 + 1 + length + 1 + 2);
    
    let offset = 0;
    frame.writeUInt8(HEADER_BYTE_1, offset++);
    frame.writeUInt8(HEADER_BYTE_2, offset++);
    frame.writeUInt8(cmdType, offset++);
    frame.writeUInt8(length, offset++);
    
    if (length > 0) {
      payload.copy(frame, offset);
      offset += length;
    }

    // Checksum: (Cmd + Len + Sum(Data)) & 0xFF
    let sum = cmdType + length;
    for (const byte of payload) {
      sum += byte;
    }
    const checksum = sum & 0xFF;
    frame.writeUInt8(checksum, offset++);

    frame.writeUInt8(TAIL_BYTE_1, offset++);
    frame.writeUInt8(TAIL_BYTE_2, offset++);

    this.port.write(frame);
  }

  private handleData(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Simple parser loop
    while (this.buffer.length >= 7) { 
      const headerIndex = this.buffer.indexOf(Buffer.from([HEADER_BYTE_1, HEADER_BYTE_2]));
      
      if (headerIndex === -1) {
        // Discard all but keep enough bytes that might match header start
        if (this.buffer.length > 1024) this.buffer = Buffer.alloc(0);
        break;
      }

      if (headerIndex > 0) {
        this.buffer = this.buffer.subarray(headerIndex);
      }

      if (this.buffer.length < 4) break;

      const dataLen = this.buffer[3];
      const frameLen = 2 + 1 + 1 + dataLen + 1 + 2;

      if (this.buffer.length < frameLen) break;

      const frame = this.buffer.subarray(0, frameLen);
      this.processFrame(frame);

      this.buffer = this.buffer.subarray(frameLen);
    }
  }

  private processFrame(frame: Buffer) {
    const cmdType = frame[2];
    const dataLen = frame[3];
    const data = frame.subarray(4, 4 + dataLen);
    const checksum = frame[4 + dataLen];
    const tail = frame.subarray(4 + dataLen + 1, 4 + dataLen + 3);

    if (tail[0] !== TAIL_BYTE_1 || tail[1] !== TAIL_BYTE_2) return;

    let sum = cmdType + dataLen;
    for (const byte of data) {
      sum += byte;
    }
    if ((sum & 0xFF) !== checksum) {
      console.warn('Checksum mismatch');
      return;
    }

    switch (cmdType) {
      case DeviceResponse.RETURN_CONFIG:
        this.parseConfig(data);
        break;
      case DeviceResponse.RETURN_STATUS:
        this.parseStatus(data);
        break;
      case DeviceResponse.PING_ACK:
        // Handle pong
        break;
    }
  }

  private parseConfig(data: Buffer) {
    // char serial_number[12]; uint32_t version; uint8_t array_type; uint32_t array_size; uint32_t num_transducer; float transducer_size; float transducer_space;
    if (data.length < 33) return;

    let offset = 0;
    const serialNumber = data.toString('utf8', offset, offset + 12).replace(/\0/g, '');
    offset += 12;
    const version = data.readUInt32LE(offset);
    offset += 4;
    const arrayType = data.readUInt8(offset);
    offset += 1;
    const arraySize = data.readUInt32LE(offset);
    offset += 4;
    const transducerCount = data.readUInt32LE(offset);
    offset += 4;
    const transducerSize = data.readFloatLE(offset);
    offset += 4;
    const transducerSpace = data.readFloatLE(offset);

    if (this.mainWindow) {
        const config: DeviceConfig = {
            serialNumber,
            version,
            arrayType,
            arraySize,
            transducerCount,
            transducerSize,
            transducerSpace
        };
        this.mainWindow.webContents.send(IPC_CHANNELS.DEVICE_CONFIG, config);
    }
  }

  private parseStatus(data: Buffer) {
      // float vdda, v33, v50, temp; double dma; float freq; uint8 stim; uint32 cal; uint32 phase;
      if (data.length < 37) return;

      let offset = 0;
      const vdda = data.readFloatLE(offset); offset += 4;
      const v3v3 = data.readFloatLE(offset); offset += 4;
      const v5v0 = data.readFloatLE(offset); offset += 4;
      const temperature = data.readFloatLE(offset); offset += 4;
      const dmaUpdateStats = data.readDoubleLE(offset); offset += 8;
      const loopFreq = data.readFloatLE(offset); offset += 4;
      const stimulationType = data.readUInt8(offset); offset += 1;
      const calibrationMode = data.readUInt32LE(offset); offset += 4;
      const phaseSetMode = data.readUInt32LE(offset); offset += 4;

      if (this.mainWindow) {
          const status: DeviceStatus = {
              vdda, v3v3, v5v0, temperature, dmaUpdateStats, loopFreq, stimulationType, calibrationMode, phaseSetMode
          };
          this.mainWindow.webContents.send(IPC_CHANNELS.DEVICE_STATUS, status);
      }
  }
}
