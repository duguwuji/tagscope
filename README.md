# TagScope · RFID 标签观测台

TagScope 是一个网页版的 RFID 读写器测试与标签观测工具，界面和工作流程参照 Impinj ItemTest 2.x。它可以连接真实读写器，也可以用模拟器演示。项目不依赖任何 npm 包，只需要 Node.js 18 或更高版本。

## 在线网页版

地址：**https://tagscope.hillleng2478.workers.dev**（部署在 Cloudflare Workers）

- **只体验界面**：添加数据源时选择“模拟器”，模拟器直接在浏览器中运行，不需要安装任何东西。
- **连接真实读写器**：在与读写器同一局域网的电脑上运行 `node server.js`，然后在网页版添加 LLRP 或 IoT 接口数据源，“桥接服务地址”填 `http://localhost:8080`（默认值）。
- Chrome / Edge 第一次访问本机桥接服务时，会询问是否允许该网站访问本地网络 / 本设备上的应用，请选择“允许”。Safari 会阻止 https 页面访问 http 本机服务，请使用 Chrome、Edge 或 Firefox，或直接打开 http://localhost:8080 。
- 标签数据只在浏览器和本机桥接服务之间传输，不经过 Cloudflare。
- 桥接服务只接受本机页面和网页版的跨域请求。需要其他来源时使用 `--allow-origin=https://example.com`（多个用逗号分隔）。

重新部署：`npx wrangler deploy`（配置见 `wrangler.toml`，入口 `worker.js`）。

## 为什么需要本地服务

浏览器不能直接建立 TCP 连接，所以无法访问读写器的 LLRP 端口（5084）。`server.js` 是一个很小的本地桥接服务，作用如下：

- 提供网页界面（http://localhost:8080）
- 使用 LLRP（TCP）或 R700 REST（HTTPS）与读写器通信
- 用 Server-Sent Events 把标签数据实时推送到网页

```
浏览器 ⇄ HTTP / SSE ⇄ server.js ⇄ LLRP TCP 5084 或 HTTPS REST ⇄ Impinj 读写器
```

## 快速开始

1. 安装 Node.js 18 或更高版本（https://nodejs.org）。
2. 启动服务：
   - Windows：双击 `start-windows.bat`
   - macOS / Linux：运行 `./start.sh`，或者 `node server.js`
3. 打开 http://localhost:8080
4. 选择驱动，输入读写器 IP 或主机名，然后点击“连接”，再点击“开始盘点”。

常用参数：`node server.js --port=8080 --host=0.0.0.0 --verbose`

- `--host=0.0.0.0`：允许局域网中的其他电脑访问。默认只监听本机。
- `--verbose`：在控制台打印 LLRP 协议细节。
- `--allow-origin=<来源>`：允许其他网页来源调用桥接服务。

## 驱动

| 驱动 | 适用设备 | 说明 |
|---|---|---|
| LLRP | Speedway R120/R220/R420、xPortal、xArray/xSpan，以及切换到 LLRP 模式的 R700/R660 | 功能最完整，支持盘点和全部标签操作 |
| R700 REST | 运行 IoT Device Interface 的 R700/R660 | 只支持盘点。默认账号是 root/impinj，可接受自签名证书 |
| 模拟器 | 不需要硬件 | 所有数据都是模拟数据，界面会显示“模拟数据” |

## 功能（对照 ItemTest）

- 连接时读取型号、序列号或 Reader ID、固件版本、天线端口数、功率表、灵敏度表和 RF 模式表。
- 盘点设置：RF 模式（读取读写器能力表，也可以输入自定义编号）、搜索模式（单目标、双目标、TagFocus 等）、Session 0–3、标签数量估计、运行时长、FastID（TID）和多普勒。
- 天线：可以逐个端口启用或停用，单独设置发射功率（dBm）和接收灵敏度，也可以把同一个功率应用到全部端口。界面会显示天线连接状态。
- 硬件过滤：在 EPC、TID 或 User 存储区上设置 Select 掩码，可以只读匹配标签，也可以排除匹配标签。
- 实时统计：运行时间、唯一标签数、总读取次数、当前读速、平均读速，最近 60 秒的读速趋势，以及各天线的读取次数。
- 标签列表：显示 EPC、TID、天线、次数、单标签读速、RSSI、峰值 RSSI、相位、多普勒、频率、首次读取和最后读取时间。可以排序、筛选、按天线分行，也可以导出 CSV。
- 标签操作（LLRP 和模拟器）：读取、写入（User、EPC、Reserved）、写 EPC（长度变化时会自动更新 PC 字）、锁定、解锁、永久锁定和灭活。
- 日志：记录连接、盘点、操作结果和错误。勾选“显示协议细节”后，还会显示每条 LLRP 消息的结果。

## 注意事项

- 一台读写器同一时间只接受一个 LLRP 客户端。连接前请关闭 ItemTest、MultiReader 等其他软件。
- 连接时会把读写器的 LLRP 配置恢复为默认值，这和 ItemTest 的做法一致。
- 灭活和永久锁定都无法撤销。界面会先要求确认。
- R700 REST 接口不提供标签读写，需要标签操作时请使用 LLRP 驱动。
- 接收灵敏度的 dBm 数值根据 Impinj 能力表换算：索引 1 表示最大灵敏度，按 −80 dBm 显示。

## 文件结构

```
server.js              桥接服务（HTTP、SSE、API）
public/index.html      网页界面（单个文件）
lib/llrp-codec.js      LLRP 1.0.1 编解码，以及 Impinj 扩展
lib/driver-llrp.js     LLRP 驱动
lib/driver-rest.js     R700 IoT Device Interface 驱动
lib/driver-sim.js      模拟器
test/                  模拟 LLRP 读写器和端到端测试（npm test）
```

## 版权

Copyright © 2026 Hill。保留所有权利。

联系方式：Hill@iotrfid.top

Impinj、ItemTest、Speedway、xArray 是 Impinj, Inc. 的商标。TagScope 是独立开发的软件，与 Impinj 没有隶属关系。
