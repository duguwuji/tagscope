# TagScope User Guide

Version: TagScope 2.0.0 (web app and bridge)  
Author: Hill · <Hill@iotrfid.top>  
Online: <https://tagscope.iotrfid.top>  
Source code: <https://github.com/duguwuji/tagscope>  
中文版：[TagScope 用户手册](user-guide-zh.md)

> **Interface language.** TagScope has an English and a Chinese interface. Switch with the **English / 中文** link at the bottom of the sidebar; by default the language follows your browser. Labels in this guide follow the English interface, with the Chinese label in parentheses on first mention, e.g. **Inventory (盘点)**.

---

## Contents

1. [Introduction](#1-introduction)
2. [Installation and startup](#2-installation-and-startup)
3. [Interface overview](#3-interface-overview)
4. [Data sources](#4-data-sources)
5. [Data source configuration and presets](#5-data-source-configuration-and-presets)
6. [Inventory display](#6-inventory-display)
7. [Inventory settings and run scenarios](#7-inventory-settings-and-run-scenarios)
8. [Tags of Interest](#8-tags-of-interest)
9. [Tag memory](#9-tag-memory)
10. [Tag logging](#10-tag-logging)
11. [System](#11-system)
12. [Updates and About](#12-updates-and-about)
13. [Troubleshooting](#13-troubleshooting)
14. [Appendix](#14-appendix)

---

## 1. Introduction

TagScope is a web-based UHF RFID reader test and tag observation tool. Its layout and workflow follow Impinj ItemTest 2.14.1. Typical uses:

- Run inventory on several readers at once and see per-tag read count, RSSI, antenna, phase angle, Doppler frequency and more.
- Measure tag read margin with a margin test (power stepped up run by run).
- Tune read performance with Gen2 Select filters, session, search mode, Fast ID, low duty cycle and other parameters.
- Read and write tag memory, change the EPC, set the access password, lock or kill tags.
- Trigger inventory from GPI inputs and drive GPO outputs manually.
- Load "Tags of Interest" lists to color-code specific tags in the results and count missed tags.

Three kinds of data source are supported:

| Interface | Devices | Capabilities |
|---|---|---|
| Impinj LLRP interface | Speedway R120 / R220 / R420, xPortal, xArray / xSpan (inventory), and R700 / R660 switched to LLRP mode | Most complete: inventory, filters, GPI/GPO, tag read/write, lock, kill, low duty cycle |
| Impinj IoT Device Interface (R700 REST) | R700 / R660 running the IoT Device Interface | Inventory, Gen2 filters, phase angle; no tag read/write and no GPI trigger |
| Simulated reader | No hardware needed | Simulates a population of tags with common chips; supports every feature; for learning the UI and demos |

> TagScope is an independent project and is not affiliated with Impinj, Inc. Impinj, ItemTest, Octane, FastID and TagFocus are trademarks of Impinj, Inc.

---

## 2. Installation and startup

### 2.1 Two ways to use TagScope

| Mode | Address | When to use |
|---|---|---|
| Online web app | <https://tagscope.iotrfid.top> | Recommended. Nothing to install when using the simulator; to connect real readers, run the bridge on your computer |
| Local app | <http://localhost:8080> | Open it after starting the bridge. Same UI as the online version, with no cross-origin or browser network permission issues |

### 2.2 Why a bridge is needed

Browsers cannot open raw TCP connections, so they cannot reach the reader's LLRP port (5084). The R700 REST interface uses a self-signed HTTPS certificate by default and generally does not allow cross-origin access from web pages. To connect a real reader you therefore run the TagScope bridge `server.js` on **a computer that can reach the reader**:

```
Browser ⇄ HTTP / SSE ⇄ server.js (bridge) ⇄ LLRP TCP 5084 or HTTPS REST ⇄ Reader
```

Tag data travels only between the browser and your local bridge. It never passes through Cloudflare or any other server.

### 2.3 Installing the bridge

1. Install Node.js 18 or later (<https://nodejs.org>).
2. Download the source from GitHub (Code → Download ZIP) and unzip it. The project has no npm dependencies, so `npm install` is not needed.
3. Start it:
   - Windows: double-click `start-windows.bat`
   - macOS / Linux: run `./start.sh`, or run `node server.js` in the project folder
4. When the console shows the listening address, open <http://localhost:8080>, or set **Bridge URL (桥接服务地址)** to `http://localhost:8080` in the online version.

> The 2.0 web app requires bridge 2.0 or later (multi-source API). If the **Updates (更新)** page shows a bridge version below 2.0, download it again.

### 2.4 Bridge options

```
node server.js --port=8080 --host=127.0.0.1 --verbose --allow-origin=https://example.com
```

| Option | Default | Description |
|---|---|---|
| `--port` | 8080 | Listening port; the `PORT` environment variable also works |
| `--host` | 127.0.0.1 | Listening address. Use `0.0.0.0` to allow other computers on the LAN (mind the security implications) |
| `--verbose` | off | Print LLRP protocol details to the console for troubleshooting |
| `--allow-origin` | — | Allow additional web origins to call the bridge, comma-separated; the `TAGSCOPE_ALLOW_ORIGIN` environment variable also works |

By default the bridge accepts requests only from local pages and from <https://tagscope.iotrfid.top>.

### 2.5 Browser requirements

- Use a recent version of Chrome, Edge or Firefox.
- The first time the online version contacts the local bridge, Chrome / Edge asks whether to allow the site to access your local network / apps on this device. Choose **Allow**. If you blocked it by mistake, re-allow it from the site settings at the left of the address bar.
- Safari blocks https pages from calling local http services. With Safari, open <http://localhost:8080> directly.
- Data sources, presets, Tags of Interest and display settings are stored in the browser's local storage. After switching browsers or clearing site data you need to configure them again; presets can be exported to JSON as a backup.

---

## 3. Interface overview

As in ItemTest, the window has a left sidebar and a main area on the right.

**Sidebar**

| Group | Items | Description |
|---|---|---|
| Displays (展示) | Inventory (盘点) | Inventory results (list view / table view) |
| | Location (定位), Direction (方向) | Require an xArray / xSpan gateway; placeholders only in this version |
| | Tag Memory (标签存储) | Read and write the memory of a single tag |
| Data Sources (数据源) | ⊕ and the source list | Add readers; the switch in front of each source decides whether it takes part in inventory |
| Tags of Interest (关注标签) | ⊕ and the file list | Load Tags of Interest files; the badge shows the number of enabled tags |
| Settings (设置) | System (系统), Updates (更新), Tag Logging (标签日志), About (关于) | Reader information and maintenance, version check, automatic logging, version and copyright information |

**Log (日志)** at the bottom left opens the log drawer, which shows connection, configuration and error messages. Tick **Debug (调试)** for more detail, or clear the log.

**English / 中文** at the bottom left switches the interface language. The page reloads; data sources, presets and settings are kept. Without a saved choice, the language follows the browser (Chinese for Chinese browsers, otherwise English).

---

## 4. Data sources

A data source is a reader or gateway that TagScope gets tag data from.

### 4.1 Adding a data source

Click ⊕ next to **Data Sources (数据源)** and fill in:

| Field | Description |
|---|---|
| Hostname (主机名) | Reader IP or hostname, e.g. `192.168.1.242` or `impinj-12-34-56.local`. For LLRP you may write `host:port` |
| Nickname (昵称, optional) | Display name in the UI; must be unique |
| Data source interface (数据源接口) | Impinj LLRP interface / Impinj IoT Device Interface (R700 REST) / Simulated reader |
| Simulated tag count (模拟标签数量) | Simulator only: number of simulated tags in the field |
| Bridge URL (桥接服务地址) | Online version with real readers only: default `http://localhost:8080`; enter another address if the bridge runs on a different computer |

**Advanced options (高级选项)**

| Field | Description |
|---|---|
| Port (端口) | Leave empty for the default: LLRP 5084; REST 443 (TLS) or 80 |
| Authentication (认证方式) | REST: Basic |
| Use TLS / Allow self-signed certificate | REST: the R700 uses HTTPS with a self-signed certificate by default, so usually tick both |
| Override default credentials (覆盖默认凭据) | REST: the default account is root / impinj; tick and fill in if the password has been changed |

Click **Add data source (添加数据源)**. The new source appears in the sidebar and is enabled and connected automatically.

### 4.2 Source list

- **Switch**: on = connect and take part in inventory; off = disconnect.
- **Name**: click to open the source's configuration page (chapter 5).
- **Hover**: shows hostname, interface, model, region and so on.
- **Status**: an error is shown if the connection fails or the reader is unreachable; click **Retry (重试)**.
- **Context menu (right-click)**: Edit data source, Device info, Connect / Disconnect, Delete data source.

> A reader accepts only one LLRP client at a time. Close ItemTest, MultiReader and other software before connecting. On connect, TagScope resets the reader's LLRP configuration to factory defaults (as ItemTest does).

---

## 5. Data source configuration and presets

Click a source name to open its configuration page. It has two tabs: **Inventory (盘点)** and **Diagnostics (诊断)**.

### 5.1 Presets

A preset is a set of inventory parameters. Each source can have several presets; the active one is marked "(current) (当前)" in the drop-down.

- **default**: generated from the reader's capabilities and read-only. If you change it and click **Save (保存)**, you are asked to save it as a new preset (default name `copy_of_default`).
- **Refresh capabilities (刷新能力)**: re-read the reader capabilities (antenna count, RF modes, power table, etc.) and update default.
- **Import / Export (导入 / 导出)**: back up or share presets as JSON files.
- **Copy (复制)**: create a new preset from the current settings.
- **Reset (重置)**: discard unsaved changes and return to the last saved values.
- **Delete (删除)**: delete the current preset (default cannot be deleted).

Changes take effect only after you click **Save**. If you try to leave the page with unsaved changes, you are asked to confirm.

### 5.2 Manual settings

| Parameter | Description |
|---|---|
| Antennas (天线) | Antenna ports used for inventory, comma-separated, e.g. `1, 2, 3, 4`; **All (全部)** selects every antenna, **Clear (清除)** empties the list |
| RF mode (RF 模式) | Taken from the reader's capability table, e.g. Impinj AutoSet 1002, Max Throughput, Dense Reader M4/M8 |
| Search mode (搜索模式) | Single Target / Dual Target / TagFocus™ (Single Target w/ Suppression) / Single Target Reset / Dual Target Select B to A |
| Enable Fast ID | Return the TID together with the EPC, used to identify the tag model (requires Impinj chip support) |
| Estimated tag population (预估标签数量) | The reader uses it to choose the initial Q value |
| Session | Session 0–3 |
| Report phase angle / Report Doppler frequency | Include these values in tag reports |

**Common combinations**

- Count every tag in the field: Single Target + Session 2 or 3, so each tag replies only once per round.
- Continuously observe signal changes (RSSI, phase): Dual Target + Session 0 or 1.
- Return tags to state A before every run: use Single Target Reset, or enable **Reset tags to state A (将标签重置为 A 状态)** in the inventory settings (see 7.3).

### 5.3 Power and sensitivity

- **Power (dBm) (功率)**: transmit power for all antennas; values come from the reader's power table.
- **Receive sensitivity (dBm) (接收灵敏度)**: values come from the reader's sensitivity table.
- **Enable max sensitivity (启用最大灵敏度)**: use the reader's maximum sensitivity (shown as −80 dBm); the sensitivity drop-down is greyed out.
- **Per-antenna settings (单独设置天线)**: expand to set power and sensitivity for each antenna; antennas left unset use the global values above.

### 5.4 GPI configuration

The table lists every GPI port on the reader. Tick **Start (启动)** and/or **Stop (停止)** and choose the trigger level (high / low).

- Applies only to the **GPI trigger** run scenario of the inventory display (see 7.2).
- If the same port is used for both start and stop, the two levels must differ; otherwise the row turns red and the preset cannot be saved.
- The IoT interface (REST) does not yet support GPI triggers.

### 5.5 Gen2 filters

Up to 5 Gen2 Select filters, applied in order. Each filter has:

| Field | Description |
|---|---|
| Memory bank (存储区) | EPC / TID / USER |
| Offset (bits) (偏移) | Start position of the mask. In the EPC bank the EPC itself starts at bit 32 (after CRC and PC) |
| Mask (hex) (掩码) | Data to match |
| Bit length (位长度) | Number of significant mask bits; leave empty to use the mask length |
| Match action / Non-match action | Select / Do Nothing / Unselect; the two actions must differ |

Combining actions across several filters gives AND / OR / NOT logic. Examples:

- Read only tags whose EPC starts with `E280`: bank EPC, offset 32, mask `E280`, match = Select, non-match = Unselect.
- Exclude a class of tags: match = Unselect, non-match = Select.

### 5.6 Low duty cycle

Requires the Impinj extensions (Octane LLRP). When enabled, an antenna that reads no tags for a while (empty field timeout) enters low duty cycle mode and probes the field periodically at the field ping interval. Normal inventory resumes when a tag enters, which reduces power consumption and interference.

| Parameter | Default |
|---|---|
| Empty field timeout (ms) (空场超时) | 500 |
| Field ping interval (ms) (场探测间隔) | 200 |

### 5.7 Diagnostics

- **GPO control (GPO 控制)**: switch each GPO output of the reader high / low, to test stack lights, buzzers, gates and other peripherals.
- **Simulated GPI input (模拟 GPI 输入, simulator only)**: change the simulated reader's GPI levels by hand to rehearse GPI triggers.
- **Device info (设备信息)**: manufacturer, model, serial number, firmware version, region, antenna ports (ports without an antenna are marked with a cross), transmit power range, number of RF modes, GPI / GPO count, channel count, and connection status.

---

## 6. Inventory display

### 6.1 Start and stop

- ▶ at the top starts inventory, ■ stops it. Every **enabled and connected** source starts at the same time, each with its own current preset.
- The stopwatch shows the read time of the current run.
- The gear button opens the **inventory display settings (盘点展示设置)** (chapter 7).
- The footer shows the current run scenario and progress (e.g. "Run 2/5 (第 2/5 次)", "Waiting for GPI start (等待 GPI 启动信号)"), the unique tag count and the read rate (reads/s).

### 6.2 List view

One row per unique EPC. Available columns:

| Column | Description |
|---|---|
| # | Order in which the tag was first read |
| EPC / TID | Tag EPC and TID (TID requires Fast ID or a previous TID read) |
| XPC Words | Extended PC words |
| Read count (读取次数) | Total reads in the current run |
| Last read by (最后读取自) | Source that read the tag most recently |
| First read / Last read (首次读取 / 最后读取) | Time relative to the start of the run |
| Since last read (距上次读取) | Time since the tag was last read |
| Reader last-read time (读写器最后读取时间) | Timestamp reported by the reader |
| Tag model info (标签型号信息) | Decoded from the TID, e.g. `CLASS E2 : IMPINJ : M730` |
| Last RSSI / Avg / Max / Min RSSI | In dBm |
| Antenna (天线) | Antenna of the latest read |
| Power (功率) | In a margin test, the power at which the tag was first read |
| Phase angle / Doppler frequency / Frequency (MHz) | Requires the corresponding reports to be enabled in the preset |
| PC Word / CR Handle Hex | Protocol control word and RN16 handle |

**Operations**

- **Choose columns**: right-click any column header and tick or untick columns.
- **Reorder columns**: drag a column header.
- **Sort**: click a column header; click again to toggle ascending / descending.
- **Row fading**: when a tag has not been read for more than 1 second its row starts turning grey, reaching the darkest grey after about 15 seconds, so tags that left the field are easy to spot.
- **Tags of Interest**: tags in an enabled Tags of Interest file have their EPC cell colored with the color from the file.

**Tag context menu (right-click a tag)**

- **Tag memory access (标签存储访问)**: open the Tag Memory page with this tag selected.
- **Change EPC (修改 EPC)**: write a new EPC. It must be a whole number of words (a multiple of 4 hex digits), up to 496 bits. If the length changes, TagScope also updates the EPC length field in the PC word. Requires the LLRP interface or the simulator.
- **Copy EPC / Copy TID**.
- **EPC / TID / other columns**: switch the display format between hex and Base64.

### 6.3 Table view

Counts tags read per "data source × Tags of Interest file". Tags that belong to no Tags of Interest file are counted as **Strays**. Tick **Swap rows and columns (行列互换)** in the settings to transpose the table.

When **Show Tags of Interest summary (显示关注标签汇总)** is on and at least one Tags of Interest file is enabled, a summary appears at the bottom of the inventory page: Tags of Interest read / total, percentage, and the total number of unique tags read in this run.

### 6.4 Unique tag chart

Tick **Show unique tag chart (显示唯一标签曲线)** in the settings to display a chart of the unique tag count over time, which shows how quickly reads converge.

---

## 7. Inventory settings and run scenarios

Open with the gear button on the inventory page. Click **Save (保存)** after making changes.

### 7.1 Inventory display

- List view (列表视图) / Table view (表格视图)
- Swap rows and columns (table view)
- Show Tags of Interest summary

### 7.2 Run scenarios

**Continuous – run forever (连续 - 永久运行)**: inventory runs from Start until you click Stop.

**Timed – run at set intervals (定时 - 按指定时间间隔运行)**

| Parameter | Description |
|---|---|
| Start delay (s) (启动延迟) | Wait time after clicking Start before the first run |
| On time (s) (开启时间) | Inventory duration of each run |
| Off time (s) (关闭时间) | Interval between runs |
| Beep on start (启动时蜂鸣) | Play a tone at the start of each run |
| Number of runs (运行次数) | Total number of runs |

**Margin test – consecutive runs with increasing power (余量测试 - 逐级提高功率的连续多次运行)**

| Parameter | Description |
|---|---|
| Start power (dBm) (起始功率) | Power of the first run |
| End power (dBm) (结束功率) | Power of the last run; must not be lower than the start power |
| Power step (dBm) (功率步进) | Power increase per run; the number of runs is calculated automatically |

The margin test also uses the start delay, on time, off time and beep settings above. The **Power** column of the list records the **power at which each tag was first read**, i.e. its read threshold, so you can compare the read margin of different tags or positions.

> With Session 2 / 3 a tag stays in state B after being read and may not reply at the next power step. Also enable **Reset tags to state A → Before every run** (see 7.3), or use Session 0.

**GPI trigger – started (and optionally stopped) by GPI (GPI 触发 - 由 GPI 启动（及可选停止）)**

- Exactly one data source may be enabled, and its current preset must have a GPI start port ticked (see 5.4).
- After you click Start, TagScope waits for the GPI start signal; reading begins when the start condition is met. If a stop port is configured, reading stops when the stop condition is met and TagScope goes back to waiting; otherwise reading continues until you click ■.
- **Always reset the stopwatch on GPI start (GPI 启动时总是重置秒表)**: the stopwatch restarts from 0 at every GPI start.
- With the simulator, toggle the GPI levels under **Diagnostics → Simulated GPI input** on the source configuration page to rehearse.

### 7.3 Additional features

| Option | Description |
|---|---|
| Show unique tag chart | See 6.4 |
| Enable manual hex / Base64 format (启用手动十六进制格式) | During a run the values are shown in hex by default; when ticked, the hex / Base64 format chosen in the tag context menu also applies immediately during runs |
| Reset tags to state A (将标签重置为 A 状态) | Use Single Target Reset to return the tags in the field to state A **before the first run** or **before every run**; **Reset duration (重置时长)** is the length of the reset in seconds. Useful for repeated tests with Session 2/3 |
| Read rate window (s) (读取速率窗口) | Sliding window used to compute the read rate; 0 = the whole run (excluding start delay and off time) |

---

## 8. Tags of Interest

Tags of Interest are a set of EPCs you want to watch closely. Once loaded, these tags are color-coded in the list, and the table view counts which were read and which were missed.

### 8.1 File formats

**JSON (ItemTest format)**

```json
{
  "Name": "Shelf A",
  "Version": "1.0.0",
  "Tags": [
    { "Epc": "E2801190200000000000A001", "Color": "#FF8800" },
    { "Epc": "E2801190200000000000A002", "Color": "LightGreen" }
  ]
}
```

**CSV (legacy format)**: one EPC per line with an optional `Color=<color>`; lines starting with `#` and an `EPC` header line are ignored.

```
EPC,Color
E2801190200000000000A001,Color=Orange
E2801190200000000000A002
```

Colors can be CSS color names or `#RRGGBB`; tags without a color use the file's default color.

### 8.2 Loading and managing files

- Click ⊕ next to **Tags of Interest (关注标签)** and choose one or more files, or click the **Tags of Interest** heading to open the management page and use **+ Import TOI file (+ 导入 TOI 文件)**.
- The management page lists every file: switch, color, name, tag count and the number read in this run (updated live during inventory); × removes the file.
- **Generate a sample from the first 10 tags in the list (用当前列表前 10 个标签生成示例)** takes the first 10 EPCs of the inventory list in its current sort order and creates a file named Sample_1, Sample_2, …; export it as JSON to use as a template.
- The switch in front of each file enables or disables it; the badge shows the total number of tags in enabled files.
- A file with the same name as an already loaded file cannot be loaded.
- A file that shares EPCs with an enabled file can be loaded but is not enabled automatically.
- Lines with an invalid EPC are skipped, and the number of skipped lines is reported.
- Click a file name to see its details: color of each EPC, whether it was read in this run, and its read count; you can **Export JSON (导出 JSON)** or **Remove this file (移除此文件)**.

---

## 9. Tag memory

Reads and writes the memory of a single tag, like the Tag Memory display in ItemTest. Requires the LLRP interface or the simulator.

### 9.1 Selecting a tag

- Right-click a tag in the inventory list → **Tag memory access (标签存储访问)**, or click **Tag Memory (标签存储)** in the sidebar and fill in the fields yourself.
- **Data source (数据源)**: the reader that performs the operation.
- **TID / EPC**: the radio button decides which value is used to select the target tag. Selecting by TID is more reliable (several tags may share an EPC, while TIDs are normally unique); it requires the TID to have been read (enable Fast ID).
- The tag model identified from the TID is shown at the top; if unknown, the page suggests **enabling FAST ID to identify it (启用 FAST ID 以识别)**.

### 9.2 Read and write

| Parameter | Description |
|---|---|
| Memory bank (存储区) | RESERVED (kill / access passwords), EPC, TID, USER |
| Word count (字数) | 1–32 words (16 bits each) |
| Word offset (字偏移) | Start word address. In the EPC bank word 0 is the CRC, word 1 is the PC, and the EPC starts at word 2 |
| Access password (访问密码) | Fill in if the tag has an access password set; 8 hex digits |

- **Read (读取)**: the result fills the 32 word boxes and is also shown as ASCII.
- **Write (写入)**: write the data in the word boxes to the tag. Edit either the hex word boxes or the ASCII text; they stay in sync both ways.
- **Use BlockWrite (使用块写)**: write several words at once, which is faster; some chips do not support it.
- **Copy to clipboard (复制到剪贴板)**: copy the data in the word boxes.
- The status bar shows Ready / Read succeeded / Write succeeded / the error reason, and the stopwatch at the top right shows how long the operation took. Operations time out after 5 seconds.

### 9.3 Setting the access password

Click **Set access password (设置访问密码)** to write a new access password to words 2–3 of the RESERVED bank. Once set, locked memory banks can only be written with the access password.

### 9.4 Lock and kill (TagScope extension)

ItemTest does not offer these functions; TagScope adds them as an extension.

- **Lock (锁定)**: choose the area (EPC / USER / TID / access password / kill password) and the action (Lock / Unlock / Permalock / Permanent unlock), then click **Execute lock (执行锁定)**. With an access password of 0 anyone can unlock the tag, so normally set a non-zero access password first and enter it in the **Access password** box.
- **Kill (灭活)**: enter the non-zero 8-hex-digit kill password (which must have been written to words 0–1 of the RESERVED bank beforehand), then click **Kill tag (灭活标签)**.

> ⚠️ Permalock and kill **cannot be undone**. The UI asks for confirmation; make sure you have the right tag.

---

## 10. Tag logging

Configure under **Settings → Tag Logging (设置 → 标签日志)** in the sidebar.

- **Log tag data (记录标签数据)**: when enabled, a CSV file is downloaded to the browser's default download folder at the end of every inventory run (each run of a timed or margin test counts as one run).
- **File name prefix (文件名前缀)**: default `TagScope`; files are named `prefix_timestamp.csv`. Multi-run scenarios append the run number to the file name.
- **Generate unique tag log (生成唯一标签日志)**: also download a unique tag list (same columns as the current list view).
- **Download current read log / Download unique tag list (下载当前读取日志 / 下载唯一标签列表)**: download the currently buffered data at any time.

The read log CSV starts with several header lines beginning with `#` that record the run time, run scenario and, for each reader, its hostname, interface, model, firmware, preset, antennas, RF mode, session, search mode, power, Fast ID and so on. The data rows follow:

```
Timestamp,EPC,TID,Antenna,RSSI,Frequency,Hostname,PhaseAngle,DopplerFrequency,Power,ReadCount
```

---

## 11. System

**Settings → System (系统)** in the sidebar shows the reader hardware information and offers common maintenance tasks, modeled on the system endpoints of the Impinj IoT Device Interface (REST). Choose a connected data source at the top; **Refresh (刷新)** reads it again.

- **Hardware & firmware (硬件与固件)**: model, description, SKU, serial number, MAC address, hostname, antenna / GPI / GPO counts, firmware version, RFID interface, uptime and so on (whatever fields the reader returns).
- **Settings (设置)**
  - **Hostname (主机名)**: letters, digits and hyphens, 1–63 characters. If the data source address uses the old hostname, update it in the data source settings.
  - **Operating region (工作区域)**: only the regions the reader allows are listed (an FCC R700 usually offers only FCC). The region sets the frequency band and power limits and must comply with local regulations.
  - **RFID interface (RFID 接口)**: switch between LLRP and IoT Device Interface (REST). Afterwards, change the interface in the data source settings to match.
- **Maintenance (维护)**
  - **Reboot reader (重启读写器)**: a real reader takes 1–2 minutes and TagScope reconnects automatically afterwards; the simulator takes about 5 s and returns 503 for every operation meanwhile.
  - **Factory reset (恢复出厂设置)**: simulator only. The Impinj IoT interface has no factory-reset endpoint; on a real reader use the reader web page or hold the reset button.
- **Diagnostics · GPO control (诊断 · GPO 控制)**: click to toggle the static level of each GPO; high is shown in teal.

Settings cannot be changed and the reader cannot be rebooted while an inventory is running; stop it first.

Support by interface:

| Feature | Simulator | IoT (REST) | LLRP |
|---|---|---|---|
| Hardware & firmware information | ✓ | ✓ | ✓ (Impinj R700: read from the IoT interface over HTTPS; other readers show only LLRP capability information) |
| Hostname / region / RFID interface / reboot | ✓ | ✓ | Impinj R700 only (the bridge calls the IoT interface over HTTPS 443 with root / impinj by default; change it under "Override default credentials" in the data source) |
| Factory reset | ✓ | — | — |
| GPO control | ✓ | ✓ | ✓ |

---

## 12. Updates and About

- **Updates (更新)**: shows the web app version, the bridge version and the latest version on GitHub. Tick **Check for updates at startup (启动时自动检查更新)** or click **Check now (立即检查)**. **Download latest bridge (下载最新桥接服务)** downloads the latest source archive from GitHub. A notice is shown if the bridge version is below 2.0.
- **About (关于)**: version, copyright, and a link to the user guide.

---

## 13. Troubleshooting

**The online version cannot reach the bridge**

1. Make sure `node server.js` is running and <http://localhost:8080> opens.
2. Check that **Bridge URL** is correct (default `http://localhost:8080`).
3. In Chrome / Edge, make sure the site is allowed to access the local network (address bar → site settings).
4. Safari does not support this; use the local app at <http://localhost:8080> instead.
5. If the bridge runs on another computer, start it with `--host=0.0.0.0` and make sure the firewall allows the port.

**LLRP connection fails or drops quickly**

- A reader accepts only one LLRP client at a time; close ItemTest, MultiReader and other applications on the reader.
- Make sure the computer can ping the reader and port 5084 is not blocked by a firewall.
- The R700 / R660 must be switched to LLRP mode in the reader's web page to use the LLRP interface; otherwise choose the IoT Device Interface.
- Start the bridge with `--verbose` to see protocol details.

**R700 REST connection fails**

- Make sure the IoT Device Interface is enabled, and tick **Use TLS** and **Allow self-signed certificate**.
- If the default password has been changed, tick **Override default credentials** under the advanced options and enter the username and password.

**Fewer tags than expected**

- Check that all antennas are selected, the power is not too low, and no Gen2 filter excludes the tags.
- With Session 2 / 3 + Single Target, a tag stays in state B for a while after being read; enable **Reset tags to state A** before repeated tests.
- Use a margin test to find the read threshold of each tag.

**Tag memory read/write fails**

- Use the LLRP interface or the simulator (the REST interface does not support tag read/write).
- Writing to locked areas requires the correct access password.
- Writes often fail when the tag is far from the antenna; writing usually needs more power than reading.
- Some chips do not support BlockWrite; untick **Use BlockWrite** and try again.

**Data sources and presets are gone**

All settings are stored in the browser's local storage, per site address: the online and local versions do not share settings. After clearing browser data or switching browsers you need to configure again. Export important presets regularly.

---

## 14. Appendix

### 14.1 Interface capability comparison

| Feature | LLRP | IoT / REST | Simulator |
|---|---|---|---|
| Inventory, RSSI, antenna, frequency | ✓ | ✓ | ✓ |
| Phase angle / Doppler frequency | ✓ | Phase angle | ✓ |
| Fast ID (TID) | ✓ | ✓ | ✓ |
| Gen2 filters | ✓ (up to 5) | ✓ | ✓ |
| Search mode / session | ✓ | ✓ | ✓ |
| Low duty cycle | ✓ (Impinj extension) | — | — |
| GPI trigger / GPO control | ✓ | — | ✓ |
| Tag read/write, BlockWrite | ✓ | — | ✓ |
| Lock, kill | ✓ | — | ✓ |

### 14.2 Differences from ItemTest 2.14.1

**Not implemented** in this version: Location and Direction displays (xArray / xSpan), Gen2X features, Truncated Reply, Protected Mode, filter verification, tag population estimation algorithm, XPC and Enhanced Integra reporting, GPI debounce, RDD / FDD, and tag event configuration for the IoT interface.

**Additional in TagScope**: web version (no installation), Chinese / English interface, built-in simulated reader, tag lock and kill, automatic tag model identification, automatic CSV log export after every run.

### 14.3 File structure

```
server.js              Bridge (HTTP, SSE, API)
worker.js              Cloudflare Workers entry (online version)
public/index.html      Web UI
public/i18n.js         Interface language (Chinese / English)
public/app.js          UI logic: backends, data sources, presets
public/views.js        UI logic: displays, tag memory, logging, navigation
public/sim.js          Simulated reader core (shared by browser and bridge)
public/tagdb.js        TID → tag model
lib/llrp-codec.js      LLRP 1.0.1 codec and Impinj extensions
lib/driver-llrp.js     LLRP driver
lib/driver-rest.js     R700 IoT Device Interface driver
lib/driver-sim.js      Simulator driver
docs/user-guide-en.md  This guide
docs/user-guide-zh.md  Chinese user guide
```

---

© 2026 Hill · <Hill@iotrfid.top>
