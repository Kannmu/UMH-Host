
## 1. 项目概述

本项目旨在为基于 STM32 的超声触觉设备（UMH-Controller）开发一款跨平台（Windows, macOS Apple Silicon）的桌面控制软件。软件将采用现代化的技术栈，提供美观、简约（Apple 风格）的用户界面，并具备强大的实时控制和可视化功能。

### 1.1 技术栈

* **核心框架**: Electron (支持跨平台桌面应用)

* **前端框架**: React (构建用户界面) + Vite (构建工具)

* **UI 组件库**: Tailwind CSS (样式) + ShadcnUI/Radix UI (无头组件，高度可定制以实现 Apple 风格)

* **3D 可视化**: Three.js + React Three Fiber (展示超声阵列和声场/焦点)

* **数据可视化**: Recharts 或 Visx (实时绘制波形图、状态监控)

* **通信层**: Node.js `serialport` (串口通信)

* **状态管理**: Zustand (轻量级状态管理)

## 6. 开发路线图 (Roadmap)

### Phase 1: 基础架构搭建 (预计 1-2 天)

* [x] 初始化 Electron + React + Vite + TypeScript 项目。

* [x] 配置 Tailwind CSS 和基础 UI 组件。

* [x] 搭建 IPC 通信框架。

* [x] 实现 Node.js 串口服务基础类（打开、关闭、列出端口）。

### Phase 2: 通信协议实现 (预计 2-3 天)

* [ ] 实现 `ProtocolParser`，完成帧的封装与解析。

* [ ] 实现所有 Command 的发送函数。

* [ ] 实现接收数据的解包和 Checksum 校验。

* [ ] 联调：实现 Ping 和 Get Config 功能，确保与固件通信正常。

### Phase 3: 核心功能开发 (预计 3-4 天)

* [ ] **仪表盘**: 完成状态数据的实时图表绘制。

* [ ] **控制功能**: 实现启用/禁用、Demo 切换功能。

* [ ] **3D 可视化**:

  * 集成 Three.js / React Three Fiber。

  * 动态生成阵列模型。

  * 实现焦点拖拽控制逻辑。

### Phase 4: 优化与打包 (预计 2 天)

* [ ] UI 细节打磨（毛玻璃、动画、响应式布局）。

* [ ] 性能优化（减少 React 渲染频率，优化 3D 帧率）。

* [ ] 构建配置（electron-builder）。

* [ ] Windows (nsis) 和 macOS (dmg, arm64) 打包测试。

