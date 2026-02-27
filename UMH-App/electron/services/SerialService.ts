import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { 
  DeviceCommand, 
  DeviceResponse, 
  IPC_CHANNELS, 
  DeviceConfig, 
  DeviceStatus,
  DeviceAckPayload,
  PingAckPayload,
  TransducerPosition,
} from '../../src/shared/types';

const HEADER_BYTE_1 = 0xAA;
const HEADER_BYTE_2 = 0x55;
const TAIL_BYTE_1 = 0x0D;
const TAIL_BYTE_2 = 0x0A;
const FRAME_MIN_LENGTH = 7;
const MAX_TRANSDUCER_INFO_BATCH = 21;

interface ParsedFrame {
  cmdType: number;
  data: Buffer;
}

class ProtocolParser {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): ParsedFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: ParsedFrame[] = [];

    while (this.buffer.length >= FRAME_MIN_LENGTH) {
      const headerIndex = this.findHeader();

      if (headerIndex < 0) {
        if (this.buffer.length > 4096) {
          this.buffer = Buffer.alloc(0);
        }
        break;
      }

      if (headerIndex > 0) {
        this.buffer = this.buffer.subarray(headerIndex);
      }

      if (this.buffer.length < 4) {
        break;
      }

      const dataLen = this.buffer[3];
      const frameLen = 2 + 1 + 1 + dataLen + 1 + 2;

      if (this.buffer.length < frameLen) {
        break;
      }

      const frame = this.buffer.subarray(0, frameLen);
      if (!this.isTailValid(frame, dataLen) || !this.isChecksumValid(frame, dataLen)) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      frames.push({
        cmdType: frame[2],
        data: frame.subarray(4, 4 + dataLen),
      });

      this.buffer = this.buffer.subarray(frameLen);
    }

    return frames;
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }

  static buildFrame(cmdType: number, payload: Buffer = Buffer.alloc(0)): Buffer {
    const length = payload.length;
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

    let sum = cmdType + length;
    for (const byte of payload) {
      sum += byte;
    }

    frame.writeUInt8(sum & 0xFF, offset++);
    frame.writeUInt8(TAIL_BYTE_1, offset++);
    frame.writeUInt8(TAIL_BYTE_2, offset);

    return frame;
  }

  private findHeader(): number {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === HEADER_BYTE_1 && this.buffer[i + 1] === HEADER_BYTE_2) {
        return i;
      }
    }

    return -1;
  }

  private isTailValid(frame: Buffer, dataLen: number): boolean {
    return frame[4 + dataLen + 1] === TAIL_BYTE_1 && frame[4 + dataLen + 2] === TAIL_BYTE_2;
  }

  private isChecksumValid(frame: Buffer, dataLen: number): boolean {
    const cmdType = frame[2];
    const expectedChecksum = frame[4 + dataLen];
    let sum = cmdType + dataLen;

    for (let i = 0; i < dataLen; i++) {
      sum += frame[4 + i];
    }

    return (sum & 0xFF) === expectedChecksum;
  }
}

export class SerialService extends EventEmitter {
  private port: SerialPort | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isConnected: boolean = false;
  private shouldReconnect: boolean = false;
  private lastPath: string = '';
  private lastBaudRate: number = 115200;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private statusPollTimer: NodeJS.Timeout | null = null;
  private protocolParser = new ProtocolParser();
  private pendingPingTimestamps = new Map<number, number>();
  private expectedTransducerCount: number = 0;
  private transducerPositions: Array<TransducerPosition | undefined> = [];

  constructor() {
    super();
  }

  setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  private safeSend(channel: string, payload: unknown) {
    if (!this.mainWindow) {
      return;
    }

    if (this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) {
      this.mainWindow = null;
      return;
    }

    try {
      this.mainWindow.webContents.send(channel, payload);
    } catch (error) {
      console.error(`[SerialService] Failed to send ${channel}:`, error);
    }
  }

  async listPorts() {
    return await SerialPort.list();
  }

  async connect(path: string, baudRate: number = 115200) {
    if (this.isConnected) {
      await this.disconnect();
    }

    this.shouldReconnect = true;
    this.lastPath = path;
    this.lastBaudRate = baudRate;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
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
          this.protocolParser.reset();
          this.resetTransducerLayoutState();
          this.emitStatus('connected');

          this.port?.on('data', (data) => this.handleData(data));
          this.port?.on('close', () => {
            console.log('Port closed');
            this.isConnected = false;
            this.stopStatusPolling();
            this.emitStatus('disconnected');
            if (this.shouldReconnect) {
              this.scheduleReconnect();
            }
          });
          this.port?.on('error', (err) => {
            console.error('Port error:', err);
            this.isConnected = false;
            this.stopStatusPolling();
            this.emitStatus('error', err.message);
            if (this.shouldReconnect) {
              this.scheduleReconnect();
            }
          });

          this.startStatusPolling();
          this.requestConfig();
          this.sendPing();
          
          resolve();
        }
      });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    console.log('Scheduling reconnect in 2s...');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.shouldReconnect && this.lastPath) {
        console.log('Attempting to reconnect...');
        this.connect(this.lastPath, this.lastBaudRate).catch(err => {
          console.error('Reconnect failed:', err);
          // If failed, schedule another one
          if (this.shouldReconnect) this.scheduleReconnect();
        });
      }
    }, 2000);
  }

  async disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.port && this.port.isOpen) {
      return new Promise<void>((resolve) => {
        this.port?.close(() => {
          this.port = null;
          this.isConnected = false;
          this.stopStatusPolling();
          this.protocolParser.reset();
          this.resetTransducerLayoutState();
          this.emitStatus('disconnected');
          resolve();
        });
      });
    } else {
      this.isConnected = false;
      this.stopStatusPolling();
      this.protocolParser.reset();
      this.resetTransducerLayoutState();
      this.emitStatus('disconnected');
    }
  }

  private emitStatus(status: string, error?: string) {
    this.safeSend(IPC_CHANNELS.SERIAL_STATUS, { status, error });
  }

  sendCommand(cmdType: DeviceCommand, payload: Buffer = Buffer.alloc(0)) {
    if (!this.port || !this.port.isOpen) return;
    const frame = ProtocolParser.buildFrame(cmdType, payload);
    this.port.write(frame);
  }

  sendPingWithEchoedByte(echoedByte: number) {
    const pingByte = echoedByte & 0xff;
    this.pendingPingTimestamps.set(pingByte, Date.now());
    this.sendCommand(DeviceCommand.PING, Buffer.from([pingByte]));
  }

  private handleData(data: Buffer) {
    const frames = this.protocolParser.push(data);
    for (const frame of frames) {
      this.processFrame(frame.cmdType, frame.data);
    }
  }

  private processFrame(cmdType: number, data: Buffer) {
    switch (cmdType) {
      case DeviceResponse.RETURN_CONFIG:
        this.parseConfig(data);
        break;
      case DeviceResponse.RETURN_STATUS:
        this.parseStatus(data);
        break;
      case DeviceResponse.PING_ACK:
        this.handlePingAck(data);
        break;
      case DeviceResponse.TRANSDUCER_INFO:
        this.parseTransducerInfo(data);
        break;
      case DeviceResponse.ACK:
      case DeviceResponse.NACK:
      case DeviceResponse.SACK:
      case DeviceResponse.DEMO_ACK:
      case DeviceResponse.ERROR:
        this.emitAck(cmdType, data);
        break;
    }
  }

  private sendPing() {
    const echoedByte = Math.floor(Math.random() * 256);
    this.sendPingWithEchoedByte(echoedByte);
  }

  private requestConfig() {
    this.sendCommand(DeviceCommand.GET_CONFIG);
  }

  private requestStatus() {
    this.sendCommand(DeviceCommand.GET_STATUS);
  }

  private requestTransducerInfo(startIndex: number, count: number) {
    if (!this.isConnected || count <= 0) {
      return;
    }

    const payload = Buffer.from([startIndex & 0xff, count & 0xff]);
    this.sendCommand(DeviceCommand.GET_TRANSDUCER_INFO, payload);
  }

  private resetTransducerLayoutState() {
    this.expectedTransducerCount = 0;
    this.transducerPositions = [];
    this.safeSend(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, []);
  }

  private beginTransducerLayoutFetch(transducerCount: number) {
    const roundedCount = Math.max(0, Math.min(255, Math.round(transducerCount)));
    this.expectedTransducerCount = roundedCount;
    this.transducerPositions = Array.from({ length: roundedCount }, () => undefined);

    if (roundedCount === 0) {
      this.safeSend(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, []);
      return;
    }

    this.requestTransducerInfo(0, Math.min(MAX_TRANSDUCER_INFO_BATCH, roundedCount));
  }

  private requestNextTransducerBatch() {
    if (this.expectedTransducerCount === 0) {
      this.safeSend(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, []);
      return;
    }

    const nextMissingIndex = this.transducerPositions.findIndex((item) => item === undefined);
    if (nextMissingIndex < 0) {
      const layout = this.transducerPositions.filter((item): item is TransducerPosition => item !== undefined);
      this.safeSend(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, layout);
      return;
    }

    const remaining = this.expectedTransducerCount - nextMissingIndex;
    const count = Math.min(MAX_TRANSDUCER_INFO_BATCH, remaining);
    this.requestTransducerInfo(nextMissingIndex, count);
  }

  private handlePingAck(data: Buffer) {
    if (data.length < 1) {
      return;
    }

    const echoedByte = data[0];
    const sentAt = this.pendingPingTimestamps.get(echoedByte);
    if (sentAt !== undefined) {
      this.pendingPingTimestamps.delete(echoedByte);
    }

    const now = Date.now();
    const payload: PingAckPayload = {
      echoedByte,
      rttMs: sentAt !== undefined ? now - sentAt : -1,
      receivedAt: now,
    };

    this.safeSend(IPC_CHANNELS.DEVICE_PING_ACK, payload);
  }

  private emitAck(type: number, data: Buffer) {
    const payload: DeviceAckPayload = {
      type: type as DeviceResponse,
      dataHex: data.length > 0 ? data.toString('hex') : undefined,
    };

    this.safeSend(IPC_CHANNELS.DEVICE_ACK, payload);
  }

  private startStatusPolling() {
    this.stopStatusPolling();

    this.statusPollTimer = setInterval(() => {
      if (!this.isConnected) {
        return;
      }

      this.requestStatus();
    }, 200);
  }

  private stopStatusPolling() {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }

  private parseConfig(data: Buffer) {
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

    const config: DeviceConfig = {
      serialNumber,
      version,
      arrayType,
      arraySize,
      transducerCount,
      transducerSize,
      transducerSpace,
    };

    this.safeSend(IPC_CHANNELS.DEVICE_CONFIG, config);
    this.beginTransducerLayoutFetch(transducerCount);
  }

  private parseTransducerInfo(data: Buffer) {
    if (data.length < 2 || this.expectedTransducerCount <= 0) {
      return;
    }

    const startIndex = data.readUInt8(0);
    const count = data.readUInt8(1);
    const expectedDataLength = 2 + count * 12;

    if (data.length < expectedDataLength) {
      return;
    }

    for (let i = 0; i < count; i += 1) {
      const index = startIndex + i;
      if (index >= this.expectedTransducerCount) {
        continue;
      }

      const offset = 2 + i * 12;
      this.transducerPositions[index] = {
        x: data.readFloatLE(offset),
        y: data.readFloatLE(offset + 4),
        z: data.readFloatLE(offset + 8),
      };
    }

    if (count === 0) {
      const layout = this.transducerPositions.filter((item): item is TransducerPosition => item !== undefined);
      this.safeSend(IPC_CHANNELS.DEVICE_TRANSDUCER_LAYOUT, layout);
      return;
    }

    this.requestNextTransducerBatch();
  }

  private parseStatus(data: Buffer) {
    if (data.length < 33) return;

    const hasDoubleDmaField = data.length >= 37;

    let offset = 0;
    const vdda = data.readFloatLE(offset); offset += 4;
    const v3v3 = data.readFloatLE(offset); offset += 4;
    const v5v0 = data.readFloatLE(offset); offset += 4;
    const temperature = data.readFloatLE(offset); offset += 4;
    let dmaUpdateStats = hasDoubleDmaField ? data.readDoubleLE(offset) : data.readFloatLE(offset);
    
    // Firmware calculates time in ms, convert to seconds for display
    if (hasDoubleDmaField) {
      dmaUpdateStats /= 1000.0;
    }

    offset += hasDoubleDmaField ? 8 : 4;
    const loopFreq = data.readFloatLE(offset); offset += 4;
    const stimulationType = data.readUInt8(offset); offset += 1;
    const calibrationMode = data.readUInt32LE(offset); offset += 4;
    const phaseSetMode = data.readUInt32LE(offset); offset += 4;

    const status: DeviceStatus = {
      vdda,
      v3v3,
      v5v0,
      temperature,
      dmaUpdateStats,
      loopFreq,
      stimulationType,
      calibrationMode,
      phaseSetMode,
    };

    this.safeSend(IPC_CHANNELS.DEVICE_STATUS, status);
  }
}
