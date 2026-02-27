var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SerialPort } from "serialport";
import { EventEmitter } from "events";
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
  DEVICE_CONFIG: "device:config"
  // Event
};
const HEADER_BYTE_1 = 170;
const HEADER_BYTE_2 = 85;
const TAIL_BYTE_1 = 13;
const TAIL_BYTE_2 = 10;
class SerialService extends EventEmitter {
  constructor() {
    super();
    __publicField(this, "port", null);
    __publicField(this, "buffer", Buffer.alloc(0));
    __publicField(this, "mainWindow", null);
    __publicField(this, "isConnected", false);
    __publicField(this, "shouldReconnect", false);
    __publicField(this, "lastPath", "");
    __publicField(this, "lastBaudRate", 115200);
    __publicField(this, "reconnectTimeout", null);
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
          this.emitStatus("connected");
          (_a = this.port) == null ? void 0 : _a.on("data", (data) => this.handleData(data));
          (_b = this.port) == null ? void 0 : _b.on("close", () => {
            console.log("Port closed");
            this.isConnected = false;
            this.emitStatus("disconnected");
            if (this.shouldReconnect) {
              this.scheduleReconnect();
            }
          });
          (_c = this.port) == null ? void 0 : _c.on("error", (err2) => {
            console.error("Port error:", err2);
            this.isConnected = false;
            this.emitStatus("error", err2.message);
            if (this.shouldReconnect) {
              this.scheduleReconnect();
            }
          });
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
          this.emitStatus("disconnected");
          resolve();
        });
      });
    } else {
      this.isConnected = false;
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
    const checksum = sum & 255;
    frame.writeUInt8(checksum, offset++);
    frame.writeUInt8(TAIL_BYTE_1, offset++);
    frame.writeUInt8(TAIL_BYTE_2, offset++);
    this.port.write(frame);
  }
  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 7) {
      const headerIndex = this.buffer.indexOf(Buffer.from([HEADER_BYTE_1, HEADER_BYTE_2]));
      if (headerIndex === -1) {
        if (this.buffer.length > 4096) this.buffer = Buffer.alloc(0);
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
  processFrame(frame) {
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
    if ((sum & 255) !== checksum) {
      console.warn("Checksum mismatch");
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
        break;
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
    if (data.length < 37) return;
    let offset = 0;
    const vdda = data.readFloatLE(offset);
    offset += 4;
    const v3v3 = data.readFloatLE(offset);
    offset += 4;
    const v5v0 = data.readFloatLE(offset);
    offset += 4;
    const temperature = data.readFloatLE(offset);
    offset += 4;
    const dmaUpdateStats = data.readDoubleLE(offset);
    offset += 8;
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
