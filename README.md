# TagScope · RFID 标签观测台

TagScope 是一个网页版的 RFID 读写器测试与标签观测工具，界面和工作流程参照 Impinj ItemTest 2.x。它可以连接真实读写器，也可以用模拟器演示。项目不依赖任何 npm 包，只需要 Node.js 18 或更高版本。

## 在线网页版

地址：**[https://tagscope.iotrfid.top](https://tagscope.iotrfid.top)**（部署在 Cloudflare Workers）

- **只体验界面**：添加数据源时选择“模拟器”，模拟器直接在浏览器中运行，不需要安装任何东西。
- **连接真实读写器**：在与读写器同一局域网的电脑上运行 `node server.js`，然后在网页版添加 LLRP 或 IoT 接口数据源，“桥接服务地址”填 `http://localhost:8080`（默认值）。
- Chrome / Edge 第一次访问本机桥接服务时，会询问是否允许该网站访问本地网络 / 本设备上的应用，请选择“允许”。Safari 会阻止 https 页面访问 http 本机服务，请使用 Chrome、Edge 或 Firefox，或直接打开 http://localhost:8080 。
- 标签数据只在浏览器和本机桥接服务之间传输，不经过 Cloudflare。
- 桥接服务只接受本机页面和网页版的跨域请求。需要其他来源时使用 `--allow-origin=https://example.com`（多个用逗号分隔）。

重新部署：`npx wrangler deploy`（配置见 `wrangler.toml`，入口 `worker.js`）。

## 为什么需要本地服务

浏览器不能直接建立 TCP 连接，所以无法访问读写器的 LLRP 端口（5084）。`server.js` 是一个很小的本地桥接服务，作用如下：

- 提供网页界面（<http://localhost:8080>）
- 使用 LLRP（TCP）或 R700 REST（HTTPS）与读写器通信
- 用 Server-Sent Events 把标签数据实时推送到网页

```
浏览器 ⇄ HTTP / SSE ⇄ server.js ⇄ LLRP TCP 5084 或 HTTPS REST ⇄ Impinj 读写器
```

## 快速开始

1. 安装 Node.js 18 或更高版本（<https://nodejs.org>）。
2. 启动服务：
   - Windows：双击 `start-windows.bat`
   - macOS / Linux：运行 `./start.sh`，或者 `node server.js`
3. 打开 <http://localhost:8080>
4. 点击左侧“数据源 ⊕”添加读写器（填写 IP 或主机名并选择接口），然后在盘点页点击 ▶ 开始盘点。

完整操作说明见 **[中文用户手册](docs/user-guide-zh.md)**。

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

## 功能（对照 ItemTest 2.14.1 用户指南）

2.0 版按 ItemTest 2.14.1 的界面结构复刻：左侧为 展示 / 数据源 / 关注标签 / 设置，右侧主区随所选内容切换。

- **数据源**：可同时添加多台读写器（LLRP、IoT/REST、模拟器），开关决定是否参与展示；悬停显示主机名/接口/型号/区域，右键“编辑数据源 / 设备信息”，不可达时显示“重试”。高级选项：端口、TLS、自签名证书、覆盖默认凭据。
- **数据源配置页**（点击数据源名称）：预设（default 只读，修改后另存为新预设；当前预设加粗）及 刷新能力 / 导入 / 导出 / 复制 / 重置 / 删除；手动设置（天线、RF 模式、搜索模式 Single/Dual Target/TagFocus/Single Target Reset/Dual Target B→A、Fast ID、预估标签数量、Session、相位角/多普勒）；功率与灵敏度（全局、最大灵敏度、单独设置天线）；GPI 配置（启动/停止端口与电平）；Gen2 过滤（最多 5 个 Select 过滤器，掩码/位长度/偏移/存储区/匹配与不匹配动作）；低占空比。诊断页：GPO 控制、模拟 GPI 输入（模拟器）、设备信息。
- **盘点展示**：▶/■、秒表、齿轮设置页。列表视图列与 ItemTest 一致（#、EPC、TID、XPC、读取次数、最后读取自、首次/最后读取、距上次读取、读写器时间、标签型号信息（由 TID 解析）、RSSI 最近/平均/最大/最小、天线、功率、相位角、多普勒、频率、PC、CR Handle）；右键列标题选择列、拖动列标题排序列、点击排序；行背景随未读时间逐渐变灰；右键标签：标签存储访问、修改 EPC、EPC/TID/其他列 十六进制 ↔ Base64。表格视图：数据源 × 关注标签文件 + Strays，可行列互换、显示汇总。
- **运行场景**：连续、定时（启动延迟/开启/关闭时间/蜂鸣/次数）、余量测试（起始/结束功率与步进，功率列记录首次读到时的功率）、GPI 触发（可在 GPI 启动时重置秒表）。附加功能：唯一标签曲线、手动十六进制格式、运行前将标签重置为 A 状态（Single Target Reset，首次或每次运行前）、读取速率窗口。
- **标签存储展示**：按 EPC 或 TID 选中单个标签；存储区、字数（≤32）、字偏移、访问密码、设置访问密码；32 个字框与 ASCII 双向编辑、复制到剪贴板、状态栏、读取 / 写入（可选 BlockWrite），5 秒超时；顶部显示标签型号。扩展：锁定 / 灭活。
- **关注标签**：支持 ItemTest JSON（`{"Name","Version":"1.0.0","Tags":[{"Epc","Color"}]}`）和旧版 CSV（`EPC,Color=<颜色>`），可载入多个文件、逐个开关，徽标显示已启用的关注标签数；同名文件拒绝载入，与已启用文件重复 EPC 时不能启用；点击文件名查看明细。
- **设置**：更新（检查 GitHub 最新版本，显示网页与桥接服务版本）、标签日志（每次运行结束自动下载 CSV，文件头含运行时间、读写器与预设；可生成唯一标签日志）、关于。
- 定位 / 方向展示需要 xArray / xSpan 网关，当前版本只保留入口。

## 注意事项

- 一台读写器同一时间只接受一个 LLRP 客户端。连接前请关闭 ItemTest、MultiReader 等其他软件。
- 连接时会把读写器的 LLRP 配置恢复为默认值，这和 ItemTest 的做法一致。
- 灭活和永久锁定都无法撤销。界面会先要求确认。
- R700 REST 接口不提供标签读写，需要标签操作时请使用 LLRP 驱动。
- 2.0 网页版需要 2.0 及以上的桥接服务（支持多数据源）。旧版桥接服务请重新下载。
- 接收灵敏度的 dBm 数值根据 Impinj 能力表换算：索引 1 表示最大灵敏度，按 −80 dBm 显示。

## 文件结构

```
server.js              桥接服务（HTTP、SSE、API）
public/index.html      网页界面
public/app.js          界面逻辑：后端、数据源、预设
public/views.js        界面逻辑：各展示页、标签存储、日志、导航
public/sim.js          模拟读写器核心（浏览器与桥接服务共用）
public/tagdb.js        TID → 标签型号
docs/user-guide-zh.md  中文用户手册
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
