var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SerialPort } from "serialport";
import { EventEmitter } from "events";
var DeviceCommand = /* @__PURE__ */ ((DeviceCommand2) => {
  DeviceCommand2[DeviceCommand2["ENABLE_DISABLE"] = 1] = "ENABLE_DISABLE";
  DeviceCommand2[DeviceCommand2["PING"] = 2] = "PING";
  DeviceCommand2[DeviceCommand2["GET_CONFIG"] = 3] = "GET_CONFIG";
  DeviceCommand2[DeviceCommand2["GET_STATUS"] = 4] = "GET_STATUS";
  DeviceCommand2[DeviceCommand2["SET_STIMULATION"] = 5] = "SET_STIMULATION";
  DeviceCommand2[DeviceCommand2["SET_PHASES"] = 6] = "SET_PHASES";
  DeviceCommand2[DeviceCommand2["SET_DEMO"] = 7] = "SET_DEMO";
  return DeviceCommand2;
})(DeviceCommand || {});
var DeviceResponse = /* @__PURE__ */ ((DeviceResponse2) => {
  DeviceResponse2[DeviceResponse2["ACK"] = 128] = "ACK";
  DeviceResponse2[DeviceResponse2["NACK"] = 129] = "NACK";
  DeviceResponse2[DeviceResponse2["PING_ACK"] = 130] = "PING_ACK";
  DeviceResponse2[DeviceResponse2["RETURN_CONFIG"] = 131] = "RETURN_CONFIG";
  DeviceResponse2[DeviceResponse2["RETURN_STATUS"] = 132] = "RETURN_STATUS";
  DeviceResponse2[DeviceResponse2["SACK"] = 133] = "SACK";
  DeviceResponse2[DeviceResponse2["DEMO_ACK"] = 134] = "DEMO_ACK";
  DeviceResponse2[DeviceResponse2["ERROR"] = 255] = "ERROR";
  return DeviceResponse2;
})(DeviceResponse || {});
const IPC_CHANNELS = {
  SERIAL_CONNECT: "serial:connect",
  SERIAL_DISCONNECT: "serial:disconnect",
  SERIAL_LIST: "serial:list",
  SERIAL_STATUS: "serial:status",
  // Event
  DEVICE_COMMAND: "device:command",
  DEVICE_STATUS: "device:status",
  // Event
  DEVICE_CONFIG: "device:config",
  // Event
  DEVICE_PING_ACK: "device:ping-ack",
  // Event
  DEVICE_ACK: "device:ack"
  // Event
};
const HEADER_BYTE_1 = 170;
const HEADER_BYTE_2 = 85;
const TAIL_BYTE_1 = 13;
const TAIL_BYTE_2 = 10;
const FRAME_MIN_LENGTH = 7;
class ProtocolParser {
  constructor() {
    __publicField(this, "buffer", Buffer.alloc(0));
  }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];
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
        data: frame.subarray(4, 4 + dataLen)
      });
      this.buffer = this.buffer.subarray(frameLen);
    }
    return frames;
  }
  reset() {
    this.buffer = Buffer.alloc(0);
  }
  static buildFrame(cmdType, payload = Buffer.alloc(0)) {
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
    frame.writeUInt8(sum & 255, offset++);
    frame.writeUInt8(TAIL_BYTE_1, offset++);
    frame.writeUInt8(TAIL_BYTE_2, offset);
    return frame;
  }
  findHeader() {
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === HEADER_BYTE_1 && this.buffer[i + 1] === HEADER_BYTE_2) {
        return i;
      }
    }
    return -1;
  }
  isTailValid(frame, dataLen) {
    return frame[4 + dataLen + 1] === TAIL_BYTE_1 && frame[4 + dataLen + 2] === TAIL_BYTE_2;
  }
  isChecksumValid(frame, dataLen) {
    const cmdType = frame[2];
    const expectedChecksum = frame[4 + dataLen];
    let sum = cmdType + dataLen;
    for (let i = 0; i < dataLen; i++) {
      sum += frame[4 + i];
    }
    return (sum & 255) === expectedChecksum;
  }
}
class SerialService extends EventEmitter {
  constructor() {
    super();
    __publicField(this, "port", null);
    __publicField(this, "mainWindow", null);
    __publicField(this, "isConnected", false);
    __publicField(this, "shouldReconnect", false);
    __publicField(this, "lastPath", "");
    __publicField(this, "lastBaudRate", 115200);
    __publicField(this, "reconnectTimeout", null);
    __publicField(this, "statusPollTimer", null);
    __publicField(this, "protocolParser", new ProtocolParser());
    __publicField(this, "pendingPingTimestamps", /* @__PURE__ */ new Map());
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  async listPorts() {
    return await SerialPort.list();
  }
  async connect(path2, baudRate = 115200) {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.shouldReconnect = true;
    this.lastPath = path2;
    this.lastBaudRate = baudRate;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.emitStatus("connecting");
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ path: path2, baudRate, autoOpen: false });
      this.port.open((err) => {
        var _a, _b, _c;
        if (err) {
          console.error("Error opening port:", err);
          this.emitStatus("error", err.message);
          this.isConnected = false;
          reject(err);
        } else {
          console.log("Port opened:", path2);
          this.isConnected = true;
          this.protocolParser.reset();
          this.emitStatus("connected");
          (_a = this.port) == null ? void 0 : _a.on("data", (data) => this.handleData(data));
          (_b = this.port) == null ? void 0 : _b.on("close", () => {
            console.log("Port closed");
            this.isConnected = false;
            this.stopStatusPolling();
            this.emitStatus("disconnected");
            if (this.shouldReconnect) {
              this.scheduleReconnect();
            }
          });
          (_c = this.port) == null ? void 0 : _c.on("error", (err2) => {
            console.error("Port error:", err2);
            this.isConnected = false;
            this.stopStatusPolling();
            this.emitStatus("error", err2.message);
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
  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    console.log("Scheduling reconnect in 2s...");
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.shouldReconnect && this.lastPath) {
        console.log("Attempting to reconnect...");
        this.connect(this.lastPath, this.lastBaudRate).catch((err) => {
          console.error("Reconnect failed:", err);
          if (this.shouldReconnect) this.scheduleReconnect();
        });
      }
    }, 2e3);
  }
  async disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        var _a;
        (_a = this.port) == null ? void 0 : _a.close(() => {
          this.port = null;
          this.isConnected = false;
          this.stopStatusPolling();
          this.protocolParser.reset();
          this.emitStatus("disconnected");
          resolve();
        });
      });
    } else {
      this.isConnected = false;
      this.stopStatusPolling();
      this.protocolParser.reset();
      this.emitStatus("disconnected");
    }
  }
  emitStatus(status, error) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(IPC_CHANNELS.SERIAL_STATUS, { status, error });
    }
  }
  sendCommand(cmdType, payload = Buffer.alloc(0)) {
    if (!this.port || !this.port.isOpen) return;
    const frame = ProtocolParser.buildFrame(cmdType, payload);
    this.port.write(frame);
  }
  sendPingWithEchoedByte(echoedByte) {
    const pingByte = echoedByte & 255;
    this.pendingPingTimestamps.set(pingByte, Date.now());
    this.sendCommand(DeviceCommand.PING, Buffer.from([pingByte]));
  }
  handleData(data) {
    const frames = this.protocolParser.push(data);
    for (const frame of frames) {
      this.processFrame(frame.cmdType, frame.data);
    }
  }
  processFrame(cmdType, data) {
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
      case DeviceResponse.ACK:
      case DeviceResponse.NACK:
      case DeviceResponse.SACK:
      case DeviceResponse.DEMO_ACK:
      case DeviceResponse.ERROR:
        this.emitAck(cmdType, data);
        break;
    }
  }
  sendPing() {
    const echoedByte = Math.floor(Math.random() * 256);
    this.sendPingWithEchoedByte(echoedByte);
  }
  requestConfig() {
    this.sendCommand(DeviceCommand.GET_CONFIG);
  }
  requestStatus() {
    this.sendCommand(DeviceCommand.GET_STATUS);
  }
  handlePingAck(data) {
    if (!this.mainWindow) return;
    if (data.length < 1) {
      return;
    }
    const echoedByte = data[0];
    const sentAt = this.pendingPingTimestamps.get(echoedByte);
    if (sentAt !== void 0) {
      this.pendingPingTimestamps.delete(echoedByte);
    }
    const now = Date.now();
    const payload = {
      echoedByte,
      rttMs: sentAt !== void 0 ? now - sentAt : -1,
      receivedAt: now
    };
    this.mainWindow.webContents.send(IPC_CHANNELS.DEVICE_PING_ACK, payload);
  }
  emitAck(type, data) {
    if (!this.mainWindow) return;
    const payload = {
      type,
      dataHex: data.length > 0 ? data.toString("hex") : void 0
    };
    this.mainWindow.webContents.send(IPC_CHANNELS.DEVICE_ACK, payload);
  }
  startStatusPolling() {
    this.stopStatusPolling();
    this.statusPollTimer = setInterval(() => {
      if (!this.isConnected) {
        return;
      }
      this.requestStatus();
    }, 200);
  }
  stopStatusPolling() {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }
  parseConfig(data) {
    if (data.length < 33) return;
    let offset = 0;
    const serialNumber = data.toString("utf8", offset, offset + 12).replace(/\0/g, "");
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
      const config = {
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
  parseStatus(data) {
    if (data.length < 33) return;
    const hasDoubleDmaField = data.length >= 37;
    let offset = 0;
    const vdda = data.readFloatLE(offset);
    offset += 4;
    const v3v3 = data.readFloatLE(offset);
    offset += 4;
    const v5v0 = data.readFloatLE(offset);
    offset += 4;
    const temperature = data.readFloatLE(offset);
    offset += 4;
    let dmaUpdateStats = hasDoubleDmaField ? data.readDoubleLE(offset) : data.readFloatLE(offset);
    if (hasDoubleDmaField) {
      dmaUpdateStats /= 1e3;
    }
    offset += hasDoubleDmaField ? 8 : 4;
    const loopFreq = data.readFloatLE(offset);
    offset += 4;
    const stimulationType = data.readUInt8(offset);
    offset += 1;
    const calibrationMode = data.readUInt32LE(offset);
    offset += 4;
    const phaseSetMode = data.readUInt32LE(offset);
    offset += 4;
    if (this.mainWindow) {
      const status = {
        vdda,
        v3v3,
        v5v0,
        temperature,
        dmaUpdateStats,
        loopFreq,
        stimulationType,
        calibrationMode,
        phaseSetMode
      };
      this.mainWindow.webContents.send(IPC_CHANNELS.DEVICE_STATUS, status);
    }
  }
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
const serialService = new SerialService();
function createWindow() {
  win = new BrowserWindow({
    title: "UMH Host",
    icon: path.join(process.env.VITE_PUBLIC, "umh-host.svg"),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs"),
      sandbox: false
      // Ensure Node integration if needed, though contextBridge is safer
    }
  });
  serialService.setMainWindow(win);
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle(IPC_CHANNELS.SERIAL_LIST, async () => {
  return await serialService.listPorts();
});
ipcMain.handle(IPC_CHANNELS.SERIAL_CONNECT, async (_event, path2, baudRate) => {
  try {
    await serialService.connect(path2, baudRate);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle(IPC_CHANNELS.SERIAL_DISCONNECT, async () => {
  await serialService.disconnect();
  return { success: true };
});
ipcMain.on(IPC_CHANNELS.DEVICE_COMMAND, (_event, cmdType, payload) => {
  if (payload) {
    const buffer = Buffer.from(payload);
    if (cmdType === DeviceCommand.PING && buffer.length >= 1) {
      serialService.sendPingWithEchoedByte(buffer[0]);
      return;
    }
    serialService.sendCommand(cmdType, buffer);
  } else {
    serialService.sendCommand(cmdType);
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
