var V = Object.defineProperty;
var G = (n, r, t) => r in n ? V(n, r, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[r] = t;
var c = (n, r, t) => G(n, typeof r != "symbol" ? r + "" : r, t);
import { ipcMain as C, app as I, BrowserWindow as w } from "electron";
import { fileURLToPath as D } from "node:url";
import T from "node:path";
import { SerialPort as p } from "serialport";
import { EventEmitter as x } from "events";
var _ = /* @__PURE__ */ ((n) => (n[n.ENABLE_DISABLE = 1] = "ENABLE_DISABLE", n[n.PING = 2] = "PING", n[n.GET_CONFIG = 3] = "GET_CONFIG", n[n.GET_STATUS = 4] = "GET_STATUS", n[n.SET_STIMULATION = 5] = "SET_STIMULATION", n[n.SET_PHASES = 6] = "SET_PHASES", n[n.SET_DEMO = 7] = "SET_DEMO", n[n.GET_TRANSDUCER_INFO = 8] = "GET_TRANSDUCER_INFO", n))(_ || {}), d = /* @__PURE__ */ ((n) => (n[n.ACK = 128] = "ACK", n[n.NACK = 129] = "NACK", n[n.PING_ACK = 130] = "PING_ACK", n[n.RETURN_CONFIG = 131] = "RETURN_CONFIG", n[n.RETURN_STATUS = 132] = "RETURN_STATUS", n[n.SACK = 133] = "SACK", n[n.DEMO_ACK = 134] = "DEMO_ACK", n[n.TRANSDUCER_INFO = 135] = "TRANSDUCER_INFO", n[n.ERROR = 255] = "ERROR", n))(d || {});
const a = {
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
  DEVICE_TRANSDUCER_LAYOUT: "device:transducer-layout",
  // Event
  DEVICE_PING_ACK: "device:ping-ack",
  // Event
  DEVICE_ACK: "device:ack"
  // Event
}, g = 170, P = 85, R = 13, N = 10, K = 7, U = 21;
class L {
  constructor() {
    c(this, "buffer", Buffer.alloc(0));
  }
  push(r) {
    this.buffer = Buffer.concat([this.buffer, r]);
    const t = [];
    for (; this.buffer.length >= K; ) {
      const e = this.findHeader();
      if (e < 0) {
        this.buffer.length > 4096 && (this.buffer = Buffer.alloc(0));
        break;
      }
      if (e > 0 && (this.buffer = this.buffer.subarray(e)), this.buffer.length < 4)
        break;
      const s = this.buffer[3], i = 4 + s + 1 + 2;
      if (this.buffer.length < i)
        break;
      const o = this.buffer.subarray(0, i);
      if (!this.isTailValid(o, s) || !this.isChecksumValid(o, s)) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      t.push({
        cmdType: o[2],
        data: o.subarray(4, 4 + s)
      }), this.buffer = this.buffer.subarray(i);
    }
    return t;
  }
  reset() {
    this.buffer = Buffer.alloc(0);
  }
  static buildFrame(r, t = Buffer.alloc(0)) {
    const e = t.length, s = Buffer.alloc(4 + e + 1 + 2);
    let i = 0;
    s.writeUInt8(g, i++), s.writeUInt8(P, i++), s.writeUInt8(r, i++), s.writeUInt8(e, i++), e > 0 && (t.copy(s, i), i += e);
    let o = r + e;
    for (const u of t)
      o += u;
    return s.writeUInt8(o & 255, i++), s.writeUInt8(R, i++), s.writeUInt8(N, i), s;
  }
  findHeader() {
    for (let r = 0; r < this.buffer.length - 1; r++)
      if (this.buffer[r] === g && this.buffer[r + 1] === P)
        return r;
    return -1;
  }
  isTailValid(r, t) {
    return r[4 + t + 1] === R && r[4 + t + 2] === N;
  }
  isChecksumValid(r, t) {
    const e = r[2], s = r[4 + t];
    let i = e + t;
    for (let o = 0; o < t; o++)
      i += r[4 + o];
    return (i & 255) === s;
  }
}
class k extends x {
  constructor() {
    super();
    c(this, "port", null);
    c(this, "mainWindow", null);
    c(this, "isConnected", !1);
    c(this, "shouldReconnect", !1);
    c(this, "lastPath", "");
    c(this, "lastBaudRate", 115200);
    c(this, "reconnectTimeout", null);
    c(this, "statusPollTimer", null);
    c(this, "protocolParser", new L());
    c(this, "pendingPingTimestamps", /* @__PURE__ */ new Map());
    c(this, "expectedTransducerCount", 0);
    c(this, "transducerPositions", []);
  }
  setMainWindow(t) {
    this.mainWindow = t;
  }
  safeSend(t, e) {
    if (this.mainWindow) {
      if (this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) {
        this.mainWindow = null;
        return;
      }
      try {
        this.mainWindow.webContents.send(t, e);
      } catch (s) {
        console.error(`[SerialService] Failed to send ${t}:`, s);
      }
    }
  }
  async listPorts() {
    return await p.list();
  }
  async connect(t, e = 115200) {
    return this.isConnected && await this.disconnect(), this.shouldReconnect = !0, this.lastPath = t, this.lastBaudRate = e, this.reconnectTimeout && (clearTimeout(this.reconnectTimeout), this.reconnectTimeout = null), this.emitStatus("connecting"), new Promise((s, i) => {
      this.port = new p({ path: t, baudRate: e, autoOpen: !1 }), this.port.open((o) => {
        var u, l, S;
        o ? (console.error("Error opening port:", o), this.emitStatus("error", o.message), this.isConnected = !1, i(o)) : (console.log("Port opened:", t), this.isConnected = !0, this.protocolParser.reset(), this.resetTransducerLayoutState(), this.emitStatus("connected"), (u = this.port) == null || u.on("data", (E) => this.handleData(E)), (l = this.port) == null || l.on("close", () => {
          console.log("Port closed"), this.isConnected = !1, this.stopStatusPolling(), this.emitStatus("disconnected"), this.shouldReconnect && this.scheduleReconnect();
        }), (S = this.port) == null || S.on("error", (E) => {
          console.error("Port error:", E), this.isConnected = !1, this.stopStatusPolling(), this.emitStatus("error", E.message), this.shouldReconnect && this.scheduleReconnect();
        }), this.startStatusPolling(), this.requestConfig(), this.sendPing(), s());
      });
    });
  }
  scheduleReconnect() {
    this.reconnectTimeout || (console.log("Scheduling reconnect in 2s..."), this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null, this.shouldReconnect && this.lastPath && (console.log("Attempting to reconnect..."), this.connect(this.lastPath, this.lastBaudRate).catch((t) => {
        console.error("Reconnect failed:", t), this.shouldReconnect && this.scheduleReconnect();
      }));
    }, 2e3));
  }
  async disconnect() {
    if (this.shouldReconnect = !1, this.reconnectTimeout && (clearTimeout(this.reconnectTimeout), this.reconnectTimeout = null), this.port && this.port.isOpen)
      return new Promise((t) => {
        var e;
        (e = this.port) == null || e.close(() => {
          this.port = null, this.isConnected = !1, this.stopStatusPolling(), this.protocolParser.reset(), this.resetTransducerLayoutState(), this.emitStatus("disconnected"), t();
        });
      });
    this.isConnected = !1, this.stopStatusPolling(), this.protocolParser.reset(), this.resetTransducerLayoutState(), this.emitStatus("disconnected");
  }
  emitStatus(t, e) {
    this.safeSend(a.SERIAL_STATUS, { status: t, error: e });
  }
  sendCommand(t, e = Buffer.alloc(0)) {
    if (!this.port || !this.port.isOpen) return;
    const s = L.buildFrame(t, e);
    this.port.write(s);
  }
  sendPingWithEchoedByte(t) {
    const e = t & 255;
    this.pendingPingTimestamps.set(e, Date.now()), this.sendCommand(_.PING, Buffer.from([e]));
  }
  handleData(t) {
    const e = this.protocolParser.push(t);
    for (const s of e)
      this.processFrame(s.cmdType, s.data);
  }
  processFrame(t, e) {
    switch (t) {
      case d.RETURN_CONFIG:
        this.parseConfig(e);
        break;
      case d.RETURN_STATUS:
        this.parseStatus(e);
        break;
      case d.PING_ACK:
        this.handlePingAck(e);
        break;
      case d.TRANSDUCER_INFO:
        this.parseTransducerInfo(e);
        break;
      case d.ACK:
      case d.NACK:
      case d.SACK:
      case d.DEMO_ACK:
      case d.ERROR:
        this.emitAck(t, e);
        break;
    }
  }
  sendPing() {
    const t = Math.floor(Math.random() * 256);
    this.sendPingWithEchoedByte(t);
  }
  requestConfig() {
    this.sendCommand(_.GET_CONFIG);
  }
  requestStatus() {
    this.sendCommand(_.GET_STATUS);
  }
  requestTransducerInfo(t, e) {
    if (!this.isConnected || e <= 0)
      return;
    const s = Buffer.from([t & 255, e & 255]);
    this.sendCommand(_.GET_TRANSDUCER_INFO, s);
  }
  resetTransducerLayoutState() {
    this.expectedTransducerCount = 0, this.transducerPositions = [], this.safeSend(a.DEVICE_TRANSDUCER_LAYOUT, []);
  }
  beginTransducerLayoutFetch(t) {
    const e = Math.max(0, Math.min(255, Math.round(t)));
    if (this.expectedTransducerCount = e, this.transducerPositions = Array.from({ length: e }, () => {
    }), e === 0) {
      this.safeSend(a.DEVICE_TRANSDUCER_LAYOUT, []);
      return;
    }
    this.requestTransducerInfo(0, Math.min(U, e));
  }
  requestNextTransducerBatch() {
    if (this.expectedTransducerCount === 0) {
      this.safeSend(a.DEVICE_TRANSDUCER_LAYOUT, []);
      return;
    }
    const t = this.transducerPositions.findIndex((i) => i === void 0);
    if (t < 0) {
      const i = this.transducerPositions.filter((o) => o !== void 0);
      this.safeSend(a.DEVICE_TRANSDUCER_LAYOUT, i);
      return;
    }
    const e = this.expectedTransducerCount - t, s = Math.min(U, e);
    this.requestTransducerInfo(t, s);
  }
  handlePingAck(t) {
    if (t.length < 1)
      return;
    const e = t[0], s = this.pendingPingTimestamps.get(e);
    s !== void 0 && this.pendingPingTimestamps.delete(e);
    const i = Date.now(), o = {
      echoedByte: e,
      rttMs: s !== void 0 ? i - s : -1,
      receivedAt: i
    };
    this.safeSend(a.DEVICE_PING_ACK, o);
  }
  emitAck(t, e) {
    const s = {
      type: t,
      dataHex: e.length > 0 ? e.toString("hex") : void 0
    };
    this.safeSend(a.DEVICE_ACK, s);
  }
  startStatusPolling() {
    this.stopStatusPolling(), this.statusPollTimer = setInterval(() => {
      this.isConnected && this.requestStatus();
    }, 200);
  }
  stopStatusPolling() {
    this.statusPollTimer && (clearInterval(this.statusPollTimer), this.statusPollTimer = null);
  }
  parseConfig(t) {
    if (t.length < 33) return;
    let e = 0;
    const s = t.toString("utf8", e, e + 12).replace(/\0/g, "");
    e += 12;
    const i = t.readUInt32LE(e);
    e += 4;
    const o = t.readUInt8(e);
    e += 1;
    const u = t.readUInt32LE(e);
    e += 4;
    const l = t.readUInt32LE(e);
    e += 4;
    const S = t.readFloatLE(e);
    e += 4;
    const E = t.readFloatLE(e), A = {
      serialNumber: s,
      version: i,
      arrayType: o,
      arraySize: u,
      transducerCount: l,
      transducerSize: S,
      transducerSpace: E
    };
    this.safeSend(a.DEVICE_CONFIG, A), this.beginTransducerLayoutFetch(l);
  }
  parseTransducerInfo(t) {
    if (t.length < 2 || this.expectedTransducerCount <= 0)
      return;
    const e = t.readUInt8(0), s = t.readUInt8(1), i = 2 + s * 12;
    if (!(t.length < i)) {
      for (let o = 0; o < s; o += 1) {
        const u = e + o;
        if (u >= this.expectedTransducerCount)
          continue;
        const l = 2 + o * 12;
        this.transducerPositions[u] = {
          x: t.readFloatLE(l),
          y: t.readFloatLE(l + 4),
          z: t.readFloatLE(l + 8)
        };
      }
      if (s === 0) {
        const o = this.transducerPositions.filter((u) => u !== void 0);
        this.safeSend(a.DEVICE_TRANSDUCER_LAYOUT, o);
        return;
      }
      this.requestNextTransducerBatch();
    }
  }
  parseStatus(t) {
    if (t.length < 33) return;
    const e = t.length >= 37;
    let s = 0;
    const i = t.readFloatLE(s);
    s += 4;
    const o = t.readFloatLE(s);
    s += 4;
    const u = t.readFloatLE(s);
    s += 4;
    const l = t.readFloatLE(s);
    s += 4;
    let S = e ? t.readDoubleLE(s) : t.readFloatLE(s);
    e && (S /= 1e3), s += e ? 8 : 4;
    const E = t.readFloatLE(s);
    s += 4;
    const A = t.readUInt8(s);
    s += 1;
    const F = t.readUInt32LE(s);
    s += 4;
    const B = t.readUInt32LE(s);
    s += 4;
    const M = {
      vdda: i,
      v3v3: o,
      v5v0: u,
      temperature: l,
      dmaUpdateStats: S,
      loopFreq: E,
      stimulationType: A,
      calibrationMode: F,
      phaseSetMode: B
    };
    this.safeSend(a.DEVICE_STATUS, M);
  }
}
const b = T.dirname(D(import.meta.url));
process.env.APP_ROOT = T.join(b, "..");
const m = process.env.VITE_DEV_SERVER_URL, z = T.join(process.env.APP_ROOT, "dist-electron"), O = T.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = m ? T.join(process.env.APP_ROOT, "public") : O;
let h;
const f = new k();
function y() {
  h = new w({
    title: "UMH Host",
    icon: T.join(process.env.VITE_PUBLIC, "umh-host.svg"),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: T.join(b, "preload.cjs"),
      sandbox: !1
      // Ensure Node integration if needed, though contextBridge is safer
    }
  }), f.setMainWindow(h), h.on("closed", () => {
    f.setMainWindow(null), h = null;
  }), h.webContents.on("did-finish-load", () => {
    h == null || h.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), m ? h.loadURL(m) : h.loadFile(T.join(O, "index.html"));
}
C.handle(a.SERIAL_LIST, async () => await f.listPorts());
C.handle(a.SERIAL_CONNECT, async (n, r, t) => {
  try {
    return await f.connect(r, t), { success: !0 };
  } catch (e) {
    return { success: !1, error: e.message };
  }
});
C.handle(a.SERIAL_DISCONNECT, async () => (await f.disconnect(), { success: !0 }));
C.on(a.DEVICE_COMMAND, (n, r, t) => {
  if (t) {
    const e = Buffer.from(t);
    if (r === _.PING && e.length >= 1) {
      f.sendPingWithEchoedByte(e[0]);
      return;
    }
    f.sendCommand(r, e);
  } else
    f.sendCommand(r);
});
I.on("window-all-closed", () => {
  process.platform !== "darwin" && (f.disconnect().catch((n) => {
    console.error("Error disconnecting serial service during shutdown:", n);
  }), I.quit(), h = null);
});
I.on("activate", () => {
  w.getAllWindows().length === 0 && y();
});
I.whenReady().then(y);
export {
  z as MAIN_DIST,
  O as RENDERER_DIST,
  m as VITE_DEV_SERVER_URL
};
