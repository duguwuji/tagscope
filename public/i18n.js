// TagScope — Copyright © 2026 Hill (Hill@iotrfid.top). All rights reserved.
// UI language: Chinese (source) / English (runtime translation of the rendered DOM). Loaded first, in <head>.
'use strict';
(function () {
const KEY = 'tagscope.lang';
let L = null; try { L = localStorage.getItem(KEY); } catch (e) {}
if (L !== 'en' && L !== 'zh') L = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
window.TS_LANG = L;
window.TS_setLang = v => { try { localStorage.setItem(KEY, v); } catch (e) {} location.reload(); };
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

/* ---------- dictionary (whole strings and fragments) ---------- */
const D = {
  // navigation / layout
  '展示': 'Displays', '盘点': 'Inventory', '定位': 'Location', '方向': 'Direction', '标签存储': 'Tag Memory', '数据源': 'Data Sources', '数据源 ⊕': 'Data Sources ⊕',
  '关注标签': 'Tags of Interest', '设置': 'Settings', '更新': 'Updates', '标签日志': 'Tag Logging', '关于': 'About', '导航': 'Navigation', '日志': 'Log', '调试': 'Debug',
  '清空': 'Clear', '关闭': 'Close', '网页版': 'Web app', '桥接': 'Bridge', '桥接离线': 'Bridge offline', '· 桥接服务': '· Bridge',
  '定位展示': 'Location display', '方向展示': 'Direction display', '需要 Impinj xArray 网关': 'Requires an Impinj xArray gateway', '需要 Impinj xSpan / xArray 网关': 'Requires an Impinj xSpan / xArray gateway',
  '定位展示需要 Impinj xArray 网关（LLRP 定位模式）。当前数据源中没有兼容设备，此展示不可用。': 'The Location display requires an Impinj xArray gateway (LLRP location mode). None of the current data sources is compatible, so this display is unavailable.',
  '方向展示需要 Impinj xSpan 或 xArray 网关（方向模式）。当前数据源中没有兼容设备，此展示不可用。': 'The Direction display requires an Impinj xSpan or xArray gateway (direction mode). None of the current data sources is compatible, so this display is unavailable.',
  '点击 ⊕ 添加读写器': 'Click ⊕ to add a reader', '未载入文件': 'No files loaded', '载入关注标签文件': 'Load Tags of Interest file', '载入关注标签文件（JSON / CSV）': 'Load Tags of Interest files (JSON / CSV)',
  '面向 RFID 工程师的 UHF RFID 读写器测试工具：盘点、余量测试、标签存储读写、Gen2 过滤、GPI/GPO，支持 Impinj LLRP、R700 IoT 接口和模拟器。': 'A UHF RFID reader test tool for RFID engineers: inventory, margin test, tag memory read/write, Gen2 filters, GPI/GPO. Supports Impinj LLRP, the R700 IoT interface and a simulator.',
  'Impinj、ItemTest、Octane、FastID、TagFocus 是 Impinj, Inc. 的商标；TagScope 为独立项目，与 Impinj 无关联。': 'Impinj, ItemTest, Octane, FastID and TagFocus are trademarks of Impinj, Inc. TagScope is an independent project and is not affiliated with Impinj.',
  '打开用户指南': 'Open user guide',
  // add / edit data source
  '添加数据源': 'Add data source', '编辑数据源': 'Edit data source', '删除数据源': 'Delete data source', '设备信息': 'Device info', '连接': 'Connect', '断开连接': 'Disconnect', '重新连接': 'Reconnect', '重试': 'Retry',
  '数据源即 TagScope 获取标签读取数据的读写器或网关。填写主机名、可选昵称，并选择读写器接口；如有需要可在高级选项中启用 TLS 或覆盖默认凭据。': 'A data source is a reader or gateway that TagScope gets tag reads from. Enter the hostname and an optional nickname, then choose the reader interface. Enable TLS or override the default credentials under Advanced options if needed.',
  '主机名': 'Hostname', '昵称': 'Nickname', '（可选）': '(optional)', '数据源接口': 'Data source interface', '模拟标签数量': 'Simulated tag count', '桥接服务地址': 'Bridge URL', '高级选项': 'Advanced options',
  '端口': 'Port', '认证方式': 'Authentication', '使用 TLS': 'Use TLS', '允许自签名证书': 'Allow self-signed certificate', '覆盖默认凭据': 'Override default credentials', '用户名': 'Username', '密码': 'Password',
  'Impinj LLRP 接口': 'Impinj LLRP interface', 'Impinj IoT 设备接口（R700 REST）': 'Impinj IoT Device Interface (R700 REST)', '模拟读写器': 'Simulated reader', '模拟读写器（无需硬件）': 'Simulated reader (no hardware)',
  '模拟读写器（非真实设备）': 'Simulated reader (not a real device)', 'IoT（REST）': 'IoT (REST)', '模拟器': 'Simulator', '（模拟器）': '(simulator)',
  '例如 192.168.1.242 或 impinj-12-34-56.local': 'e.g. 192.168.1.242 or impinj-12-34-56.local', '例如 192.168.1.242 或 impinj-12-34-56.local:5084': 'e.g. 192.168.1.242 or impinj-12-34-56.local:5084',
  '网页不能直接建立 LLRP TCP 连接（端口 5084）。需要在能访问读写器的电脑上运行 TagScope 桥接服务（node server.js）。': 'Web pages cannot open LLRP TCP connections (port 5084). Run the TagScope bridge (node server.js) on a computer that can reach the reader.',
  '浏览器不能直接调用 R700 REST 接口：读写器默认使用自签名 HTTPS 证书，一般也不允许网页跨域（CORS）访问。需要在能访问读写器的电脑上运行 TagScope 桥接服务（node server.js），由它转发 REST 请求和标签数据流。': 'Browsers cannot call the R700 REST interface directly: the reader uses a self-signed HTTPS certificate by default and generally does not allow cross-origin (CORS) access. Run the TagScope bridge (node server.js) on a computer that can reach the reader; it relays the REST requests and the tag data stream.',
  '尚未添加数据源。点击左侧': 'No data sources yet. Click', '添加读写器（无硬件可选“模拟读写器”）。': 'in the sidebar to add a reader (choose "Simulated reader" if you have no hardware).',
  '无法连接 TagScope 桥接服务（': 'Cannot reach the TagScope bridge (', '）。请在可访问读写器的电脑上运行': '). Run', '并保持窗口打开；如浏览器询问是否允许访问本地网络 / 本设备上的应用，请选择“允许”。仅体验界面可添加“模拟读写器”数据源。': 'on a computer that can reach the reader and keep the window open. If the browser asks whether to allow access to the local network / apps on this device, choose "Allow". To just try the UI, add a "Simulated reader" data source.',
  '需要填写主机名或 IP 地址': 'Enter a hostname or IP address', '昵称必须唯一': 'Nickname must be unique', '请先启用该数据源': 'Enable this data source first',
  // status
  '已连接': 'Connected', '未连接': 'Not connected', '不可达': 'Unreachable', '正在连接…': 'Connecting…', '正在连接': 'Connecting to', '正在盘点': 'Running inventory', '盘点中': 'Running inventory', '已断开': 'Disconnected', '已断开连接': 'Disconnected',
  '状态': 'Status', '错误': 'Error', '接口': 'Interface', '型号': 'Model', '区域': 'Region', '制造商': 'Manufacturer', '序列号': 'Serial number', '固件版本': 'Firmware version', '固件': 'firmware',
  '天线端口': 'Antenna ports', '发射功率范围': 'Transmit power range', 'RF 模式数': 'RF modes', '频道数': 'Channels', '未知': 'Unknown', '未指定': 'Not specified',
  'FCC Part 15.247（模拟）': 'FCC Part 15.247 (simulated)', 'FCC（美国）': 'FCC (USA)', 'FCC（加拿大）': 'FCC (Canada)', '桥接服务不可达': 'Bridge unreachable', '数据源未连接': 'Data source not connected', '数据源在运行中断开': 'Data source disconnected during the run',
  '与 TagScope 桥接服务的连接已断开，正在重试…': 'Lost connection to the TagScope bridge, retrying…', '与读写器的连接已断开': 'Connection to the reader was lost', '连接已断开': 'Connection lost', '连接失败': 'Connection failed', '数据流已结束': 'Data stream ended',
  '已有其他客户端连接到该读写器（请关闭 ItemTest 等其他软件）': 'Another client is already connected to this reader (close ItemTest and other software)', '读写器已有主动发起的连接': 'The reader already has a reader-initiated connection', '读写器正在处理其他连接': 'The reader is busy with another connection',
  '读写器关闭了连接': 'The reader closed the connection', 'LLRP 帧长度异常，断开连接': 'Invalid LLRP frame length, disconnecting', '读写器异常': 'Reader exception', '读写器当前 RFID 接口为': 'The reader\'s current RFID interface is',
  '已刷新设备能力': 'Device capabilities refreshed', '更新配置': 'Update settings', 'SET_READER_CONFIG（恢复默认）': 'SET_READER_CONFIG (restore defaults)', 'SET_READER_CONFIG（启用 GPI）': 'SET_READER_CONFIG (enable GPI)',
  'Impinj R700 系列（IoT Device Interface）': 'Impinj R700 series (IoT Device Interface)',
  // source configuration
  '诊断': 'Diagnostics', '预设': 'Preset', '（当前）': ' (current)', '刷新能力': 'Refresh capabilities', '导入': 'Import', '导出': 'Export', '复制': 'Copy', '重置': 'Reset', '删除': 'Delete', '保存': 'Save', '取消': 'Cancel',
  '手动设置': 'Manual settings', '天线': 'Antenna', '天线:': 'Antennas:', '全部': 'All', '清除': 'Clear', 'RF 模式': 'RF mode', '- 自定义': '- Custom', '自定义': 'Custom', '搜索模式': 'Search mode', '启用 Fast ID': 'Enable Fast ID', '预估标签数量': 'Estimated tag population',
  '报告相位角': 'Report phase angle', '报告多普勒频率': 'Report Doppler frequency', 'TagFocus™（Single Target w/ Suppression）': 'TagFocus™ (Single Target w/ Suppression)',
  '功率与灵敏度设置': 'Power & sensitivity', '功率 (dBm)': 'Power (dBm)', '接收灵敏度 (dBm)': 'Receive sensitivity (dBm)', '启用最大灵敏度': 'Enable max sensitivity', '单独设置天线': 'Per-antenna settings', '发射功率 (dBm)': 'Transmit power (dBm)',
  'GPI 配置': 'GPI configuration', 'GPI 端口': 'GPI port', '启动': 'Start', '停止': 'Stop', '电平': 'Level', '高': 'High', '低': 'Low', '高电平': 'high level', '低电平': 'low level',
  'GPI 触发仅在盘点展示的“GPI 触发”运行场景中生效。': 'GPI triggers apply only to the "GPI trigger" run scenario of the inventory display.', '该设备未报告 GPI 端口。': 'This device reports no GPI ports.', 'IoT 接口暂不支持 GPI 触发。': 'The IoT interface does not support GPI triggers yet.',
  'GPI 配置错误：同一端口的启动与停止电平不能相同': 'GPI configuration error: start and stop levels of the same port must differ',
  'GEN 2 过滤': 'GEN 2 FILTERS', '+ 添加过滤器': '+ Add filter', '未配置过滤器：盘点所有标签。': 'No filters configured: all tags are inventoried.', '最多 5 个 Select 过滤器，按顺序执行；匹配/不匹配动作可组合出 与 / 或 / 非 逻辑。': 'Up to 5 Select filters, applied in order; combine match / non-match actions for AND / OR / NOT logic.',
  '过滤器': 'Filter', '移除': 'Remove', '掩码（十六进制）': 'Mask (hex)', '位长度': 'Bit length', '偏移（位）': 'Offset (bits)', '存储区': 'Memory bank', '匹配动作': 'Match action', '不匹配动作': 'Non-match action', '例如 E280': 'e.g. E280',
  '选择 (Select)': 'Select', '无动作 (Do Nothing)': 'Do Nothing', '取消选择 (Unselect)': 'Unselect', '匹配与不匹配动作不能相同': 'Match and non-match actions must differ', '过滤器的匹配与不匹配动作不能相同': 'A filter\'s match and non-match actions must differ',
  '请填写过滤器掩码，或移除空过滤器': 'Enter a filter mask or remove empty filters', '过滤器动作组合无效': 'Invalid filter action combination', '不匹配': 'non-match', '匹配': 'match',
  '低占空比（Low Duty Cycle）': 'LOW DUTY CYCLE', '启用': 'Enable', '空场超时 (ms)': 'Empty field timeout (ms)', '场探测间隔 (ms)': 'Field ping interval (ms)', '需要 Impinj 扩展（Octane LLRP）。': 'Requires the Impinj extensions (Octane LLRP).', '（Impinj 扩展）': '(Impinj extension)',
  'GPO 控制': 'GPO control', '模拟 GPI 输入（仅模拟器）': 'Simulated GPI input (simulator only)', '该设备没有可控制的 GPO 端口': 'This device has no controllable GPO ports', '连接数据源后可控制 GPO': 'Connect the data source to control GPOs',
  '该数据源不支持 GPO 控制': 'This data source does not support GPO control', '仅模拟器支持模拟 GPI 输入': 'Only the simulator supports simulated GPI input',
  '保存为新预设': 'Save as new preset', '新预设名称': 'New preset name', '预设名称': 'Preset name', '复制预设': 'Copy preset', '导入预设': 'Import preset', '已导入预设': 'Preset imported', '已恢复为上次保存的设置': 'Restored the last saved settings',
  '请输入名称': 'Enter a name', '该名称已存在': 'This name already exists', '不是 TagScope 预设文件': 'Not a TagScope preset file', '导入失败': 'Import failed', '放弃未保存的修改？': 'Discard unsaved changes?', '放弃对数据源设置的未保存修改？': 'Discard unsaved changes to the data source settings?',
  '请至少启用一个天线': 'Enable at least one antenna', '请至少填写一个天线': 'Enter at least one antenna', '无法保存': 'Cannot save', '确定': 'OK', '确认': 'Confirm',
  // inventory
  '开始': 'Start', '结束': 'End', '被抢占': 'preempted', '开始盘点': 'Start inventory', '停止盘点': 'Stop inventory', '盘点已停止': 'Inventory stopped',
  '开始盘点。右键列标题可选择显示的列，拖动列标题可调整顺序，右键标签行可访问标签存储或修改 EPC。': 'to start inventory. Right-click a column header to choose columns, drag headers to reorder them, and right-click a tag row for tag memory access or to change the EPC.',
  '点击': 'Click', '没有已启用且已连接的数据源': 'No enabled and connected data source', '没有已启用且已连接的数据源。请在左侧打开数据源开关。': 'No enabled and connected data source. Turn on a data source switch in the sidebar.',
  'GPI 触发时只能启用一个数据源': 'Only one data source may be enabled for GPI trigger', '请先保存盘点设置或启动一次盘点': 'Save the inventory settings or run inventory once first',
  '读取次数': 'Read count', '最后读取自': 'Last read by', '首次读取': 'First read', '最后读取': 'Last read', '距上次读取': 'Since last read', '读写器最后读取时间': 'Reader last-read time', '标签型号信息': 'Tag model info',
  '最近 RSSI': 'Last RSSI', 'RSSI 平均': 'Avg RSSI', 'RSSI 最大': 'Max RSSI', 'RSSI 最小': 'Min RSSI', '功率': 'Power', '相位角': 'Phase angle', '多普勒频率': 'Doppler frequency', '频率 (MHz)': 'Frequency (MHz)', 'PC 字': 'PC Word',
  '唯一标签': 'Unique tags', '读取速率': 'Read rate', '次/秒': 'reads/s', '总读取': 'Total reads', '合并': 'Combined', '名称': 'Name', '合计': 'Total', '总计': 'Total', '全部文件': 'All files', 'Strays（游离）': 'Strays',
  '唯一标签曲线': 'Unique tag chart', '时间（秒）': 'Time (s)', '暂无标签': 'No tags yet', '标签存储访问': 'Tag memory access', '修改 EPC': 'Change EPC', '复制 EPC': 'Copy EPC', '复制 TID': 'Copy TID', '其他列': 'Other columns',
  '显示为十六进制': 'Show as hex', '显示为 Base64': 'Show as Base64', '当前 EPC': 'Current EPC', '新 EPC': 'New EPC', '已复制': 'Copied', '复制失败，请手动选择文本': 'Copy failed; select the text manually',
  'EPC 必须为整字（4 位十六进制的倍数）': 'The EPC must be whole words (a multiple of 4 hex digits)', 'EPC 最长 496 位': 'The EPC can be at most 496 bits', '修改失败': 'Change failed', '读取该标签的数据源未连接': 'The data source that read this tag is not connected',
  '运行中按读写器格式显示；如需立即生效请在设置中启用“手动十六进制 / Base64 格式”': 'During a run values are shown in the reader format; enable "manual hex / Base64 format" in the settings to apply it immediately',
  // inventory settings
  '盘点展示设置': 'Inventory display settings', '盘点显示': 'Inventory display', '列表视图': 'List view', '表格视图': 'Table view', '行列互换': 'Swap rows and columns', '显示关注标签汇总': 'Show Tags of Interest summary',
  '盘点运行配置': 'Inventory run configuration', '运行场景': 'Run scenario', '连续 - 永久运行': 'Continuous - run forever', '定时 - 按指定时间间隔运行': 'Timed - run at set intervals', '余量测试 - 逐级提高功率的连续多次运行': 'Margin test - consecutive runs with increasing power',
  'GPI 触发 - 由 GPI 启动（及可选停止）': 'GPI trigger - started (and optionally stopped) by GPI', 'GPI 启动时总是重置秒表': 'Always reset the stopwatch on GPI start', 'GPI 触发 -': 'GPI trigger -', '由 GPI 启动': 'started by GPI',
  '等待 GPI 启动信号': 'waiting for GPI start signal', '读取中': 'reading', 'GPI 启动：开始读取': 'GPI start: reading started', 'GPI 停止：停止读取': 'GPI stop: reading stopped', '间歇': 'off time', '延迟中': 'start delay', '重置为 A 状态': 'resetting to state A',
  '时间': 'Time', '启动延迟 (s)': 'Start delay (s)', '开启时间 (s)': 'On time (s)', '关闭时间 (s)': 'Off time (s)', '启动时蜂鸣': 'Beep on start', '运行次数': 'Number of runs',
  '起始功率 (dBm)': 'Start power (dBm)', '结束功率 (dBm)': 'End power (dBm)', '功率步进 (dBm)': 'Power step (dBm)', '结束功率必须不小于起始功率': 'End power must not be lower than start power',
  '附加功能': 'Additional features', '显示唯一标签曲线': 'Show unique tag chart', '启用手动十六进制 / Base64 格式': 'Enable manual hex / Base64 format', '将标签重置为 A 状态': 'Reset tags to state A', '首次运行前': 'Before the first run', '每次运行前': 'Before every run',
  '重置时长 (s)': 'Reset duration (s)', '读取速率窗口 (s)': 'Read rate window (s)', '读取速率窗口为 0 时按整个运行时长计算（不含启动延迟与关闭时间）。': 'With a read rate window of 0 the rate is computed over the whole run (excluding start delay and off time).', '，将在下次运行时生效': ', takes effect on the next run',
  // tags of interest
  'LLRP 数据源用于“系统”页通过 Impinj IoT 接口（HTTPS）进行的操作': 'For an LLRP data source, used by the System page for operations through the Impinj IoT interface (HTTPS)',
  '桥接服务版本过旧，不支持系统功能。请在“更新”页下载最新桥接服务': 'The bridge is too old for the System page. Download the latest bridge on the Updates page',
  '系统': 'System', '数据源：': 'Data source:', '刷新': 'Refresh', '硬件与固件': 'Hardware & firmware', '工作区域': 'Operating region', 'RFID 接口': 'RFID interface', '切换': 'Switch', '维护': 'Maintenance', '重启读写器': 'Reboot reader', '恢复出厂设置': 'Factory reset', '诊断 · GPO 控制': 'Diagnostics · GPO control', '应用': 'Apply', '保存': 'Save',
  '点击切换 GPO 静态电平，高电平显示为青色。': 'Click to toggle the static GPO level; high is shown in teal.', '没有已连接的数据源。请先在左侧添加并启用读写器（或模拟读写器）。': 'No connected data source. Add and enable a reader (or the simulated reader) in the sidebar first.',
  '正在读取…': 'Reading…', '正在执行…': 'Working…', '读写器正在重启…': 'Reader is rebooting…', '该数据源不支持远程重启。': 'This data source does not support remote reboot.', '模拟器重启约 5 秒，期间所有操作返回 503。': 'The simulator reboots in about 5 s; all operations return 503 meanwhile.', '重启约需 1–2 分钟，期间读写器不可用；完成后 TagScope 会自动重新连接。': 'A reboot takes 1–2 minutes and the reader is unavailable meanwhile; TagScope reconnects automatically afterwards.',
  '该数据源没有可控制的 GPO。': 'This data source has no controllable GPO.', '正在盘点：修改设置或重启前请先停止盘点': 'Inventory running: stop it before changing settings or rebooting', '请先停止盘点': 'Stop the inventory first', 'Impinj IoT 接口不提供恢复出厂设置，请在读写器网页中操作或长按复位键': 'The Impinj IoT interface has no factory reset; use the reader web page or hold the reset button',
  '主机名只能包含字母、数字和连字符（1–63 个字符，不能以连字符开头或结尾）': 'A hostname may contain only letters, digits and hyphens (1–63 characters, not starting or ending with a hyphen)', '主机名已保存': 'Hostname saved', '主机名已保存。数据源地址仍是旧主机名，如需请在数据源设置中修改': 'Hostname saved. The data source still uses the old hostname; change it in the data source settings if needed',
  '工作区域未改变': 'Operating region unchanged', '工作区域已更新': 'Operating region updated', 'RFID 接口未改变': 'RFID interface unchanged', 'RFID 接口已切换': 'RFID interface switched', '已发送重启命令': 'Reboot command sent', '已恢复出厂设置，正在重启': 'Factory settings restored; rebooting', '等待重启超时，请检查读写器后在左侧点击“重试”': 'Timed out waiting for the reboot; check the reader, then click "Retry" in the sidebar',
  '读写器正在重启（HTTP 503），请稍候': 'The reader is rebooting (HTTP 503); please wait', '读写器正在重启（约 5 秒）': 'Reader rebooting (about 5 s)', '恢复出厂设置': 'Factory reset', '重启读写器': 'Reboot reader',
  '管理关注标签': 'Manage Tags of Interest', '+ 导入 TOI 文件': '+ Import TOI file', '用当前列表前 10 个标签生成示例': 'Generate a sample from the first 10 tags in the list', 'JSON 格式：': 'JSON format: ', 'CSV / TXT 格式：每行一个 EPC，可附加 Color=颜色': 'CSV / TXT format: one EPC per line, optionally followed by Color=<color>',
  '{"Version":"1.0.0","Name":"托盘A","Tags":[{"EPC":"E280…","Color":"#2E86DE"}]}': '{"Version":"1.0.0","Name":"Pallet A","Tags":[{"EPC":"E280…","Color":"#2E86DE"}]}', '点击文件名查看其中的标签。': 'Click a file name to see its tags.', '尚未载入关注标签文件。可导入 TOI 文件，或先运行盘点再用当前列表生成示例。': 'No Tags of Interest files loaded yet. Import a TOI file, or run an inventory and generate a sample from the current list.', '当前列表没有标签，请先运行盘点': 'The list has no tags yet. Run an inventory first.',
  '颜色': 'Color', '标签数': 'Tags', '本次已读到': 'Read this run', '已启用': 'Enabled', '未启用': 'Disabled', '已读到': 'Read', '导出 JSON': 'Export JSON', '移除此文件': 'Remove this file', '文件中没有有效的 EPC': 'The file contains no valid EPC', '缺少 Tags 数组': 'Missing Tags array',
  // tag memory
  '按 EPC 选择': 'Select by EPC', '按 TID 选择': 'Select by TID', '未知标签型号：启用 FAST ID 以识别': 'Unknown tag model: enable FAST ID to identify it', '字数': 'Word count', '字偏移': 'Word offset', '访问密码': 'Access password', '设置访问密码': 'Set access password', '新访问密码': 'New access password',
  '读取': 'Read', '写入': 'Write', '使用块写（BlockWrite）': 'Use BlockWrite', '复制到剪贴板': 'Copy to clipboard', '就绪': 'Ready', '数据': 'Data',
  '扩展操作（TagScope）：锁定 / 灭活': 'Extended operations (TagScope): lock / kill', '锁定区域': 'Lock area', '锁定权限': 'Lock action', '执行锁定': 'Execute lock', '锁定': 'Lock', '解锁': 'Unlock', '永久锁定': 'Permalock', '永久解锁': 'Permanent unlock',
  '灭活': 'Kill', '灭活密码': 'Kill password', '灭活标签（不可恢复）': 'Kill tag (irreversible)', '非 0 的 8 位十六进制': 'non-zero, 8 hex digits', '请输入 8 位十六进制': 'Enter 8 hex digits', '（保留区字 2–3）': '(reserved bank words 2–3)',
  'TID 存储区通常为只读，仍要尝试写入？': 'The TID bank is usually read-only. Try to write anyway?', '将覆盖 EPC 存储区的 CRC / PC 字，确定继续？': 'This overwrites the CRC / PC words of the EPC bank. Continue?', '永久锁定 / 永久解锁不可撤销，确定继续？': 'Permalock / permanent unlock cannot be undone. Continue?', '灭活后标签将永久失效，确定继续？': 'Killing makes the tag permanently unusable. Continue?',
  '写入数据必须为整字（4 位十六进制的倍数）': 'Write data must be whole words (a multiple of 4 hex digits)', '错误：灭活密码必须为非 0 的 8 位十六进制': 'Error: the kill password must be 8 hex digits and non-zero', '错误：访问密码最多 8 位十六进制': 'Error: the access password is at most 8 hex digits',
  '错误：没有可用的数据源（需要已启用、已连接且支持标签读写）': 'Error: no usable data source (it must be enabled, connected and support tag read/write)', '（没有支持标签读写的已连接数据源）': '(no connected data source supports tag read/write)', '上一个标签操作尚未完成': 'The previous tag operation has not finished',
  '当前驱动不支持标签操作': 'The current driver does not support tag operations', 'R700 REST 接口不支持标签读写/锁定/灭活。请在读写器网页将 RFID 接口切换为 LLRP，并使用 LLRP 驱动': 'The R700 REST interface does not support tag read/write/lock/kill. Switch the RFID interface to LLRP in the reader web page and use the LLRP driver',
  '灭活密码不能为 0': 'The kill password cannot be 0', '灭活密码为 0': 'Kill password is 0', '灭活密码错误': 'Wrong kill password', '灭活成功': 'Kill succeeded', '成功': 'Success', '标签无响应': 'No response from tag', '存储区已锁定': 'Memory bank is locked', '存储区越界': 'Memory overrun',
  '功率不足': 'Insufficient power', '访问密码错误': 'Wrong access password', '标签错误': 'Tag error', '读写器错误': 'Reader error', '未知操作': 'Unknown operation', '超时': 'timed out', '任意标签': 'any tag', '标签操作': 'Tag operation',
  '读取失败': 'Read failed', '写入失败': 'Write failed', '锁定失败': 'Lock failed', '锁定成功': 'Lock succeeded', '灭活失败': 'Kill failed', '设置访问密码失败': 'Set access password failed', '失败': 'failed',
  // logging / updates / about
  '记录标签数据': 'Log tag data', '文件名前缀': 'File name prefix', '目标目录': 'Destination', '浏览器默认下载目录': 'Browser default download folder', '生成唯一标签日志': 'Generate unique tag log', '下载当前读取日志': 'Download current read log', '下载唯一标签列表': 'Download unique tag list',
  '启用后，每次盘点运行结束（含定时 / 余量测试的每一次运行）自动下载一个 CSV 日志；文件头包含运行时间、参与的读写器与预设。': 'When enabled, a CSV log is downloaded automatically at the end of every inventory run (including each run of a timed or margin test). The file header contains the run time and the participating readers and presets.',
  '暂无读取记录': 'No reads yet', '网页版本': 'Web app version', '桥接服务版本': 'Bridge version', '最新版本': 'Latest version', '启动时自动检查更新': 'Check for updates at startup', '立即检查': 'Check now', '下载最新桥接服务': 'Download latest bridge',
  '已是最新版本。': 'You are on the latest version.', '检查更新失败': 'Update check failed', '版本': 'Version',
  // misc fragments
  '个唯一标签': 'unique tags', '个标签': 'tags', '个字': 'words', '字': 'Word', '事件': 'Event', '代码': 'code', '型号代码': 'model code', '标准': 'Standard', '参数类型': 'parameter type', '错误码': 'error code', '字段': 'field',
  '来源': 'Origin', '解析 LLRP 消息': 'Parse LLRP message', 'LLRP 消息': 'LLRP message', '确定继续？': 'Continue?',
};

/* ---------- patterns for messages with values ---------- */
const P = [
  [/删除数据源“(.+)”？其预设也会一并删除。/, 'Delete data source "$1"? Its presets will also be deleted.'],
  [/删除预设“(.+)”？/, 'Delete preset "$1"?'],
  [/已保存，“(.+)”为当前预设/, 'Saved. "$1" is now the current preset'],
  [/无法连接桥接服务 (\S+)，请确认已运行 node server.js/, 'Cannot reach the bridge at $1. Make sure node server.js is running'],
  [/(?:ROSpec 已启用|已就绪)，等待 GPI (\d+) (高|低)电平启动/, (m, p, l) => `Ready, waiting for GPI ${p} ${l === '高' ? 'high' : 'low'} to start`],
  [/LLRP 消息 (\S+) 超时/, 'LLRP message $1 timed out'],
  [/解析 LLRP 消息 (\S+) 失败：/, 'Failed to parse LLRP message $1: '],
  [/超时（([\d.]+)s 内未找到目标标签或无结果）/, 'Timed out (target tag not found or no result within $1 s)'],
  [/超时（([\d.]+)s 内未找到目标标签）/, 'Timed out (target tag not found within $1 s)'],
  [/连接 (\S+) 超时/, 'Connection to $1 timed out'],
  [/连接被拒绝（(.*?)）/, 'Connection refused ($1)'],
  [/读写器当前 RFID 接口为 "(.+?)"，请在读写器网页中切换为 REST（或改用 LLRP 驱动）/, 'The reader\'s RFID interface is currently "$1". Switch it to REST in the reader web page (or use the LLRP driver)'],
  [/来源 (\S+) 未被允许，可用 --allow-origin 添加/, 'Origin $1 is not allowed; add it with --allow-origin'],
  [/开始盘点：RF 模式/, 'Inventory started: RF mode'],
  [/仅显示前 (\d+) 行（共 (\d+) 个唯一标签，导出 CSV 可查看全部）/, 'Showing the first $1 rows only ($2 unique tags in total; export CSV to see all)'],
  [/^(读取|写入|锁定|灭活|设置访问密码|修改 EPC)中…（(.+)，超时 5 秒）$/, (m, a, n) => `${core(a)}… (${core(n)}, 5 s timeout)`],
  [/EPC (\S+) 已存在于已启用的文件“(.+)”中，请先停用该文件/, 'EPC $1 already exists in the enabled file "$2"; disable that file first'],
  [/EPC 已修改为 (\S+)，重新运行盘点即可看到新 EPC/, 'EPC changed to $1. Run inventory again to see the new EPC'],
  [/TagScope 有新版本 (\S+)，可在“设置 › 更新”中查看/, 'TagScope $1 is available; see Settings › Updates'],
  [/“(.+)”与已启用文件“(.+)”有重复 EPC，已载入但未启用/, '"$1" shares EPCs with the enabled file "$2"; loaded but not enabled'],
  [/“(.+)”：跳过 (\d+) 行无效 EPC/, '"$1": skipped $2 lines with invalid EPCs'],
  [/不支持的 Version：(.+)（应为 1.0.0）/, 'Unsupported Version: $1 (expected 1.0.0)'],
  [/余量测试 - ([\d.]+) → ([\d.]+) dBm，步进 ([\d.]+) dBm/, 'Margin test - $1 → $2 dBm, step $3 dBm'],
  [/共 (\d+) 次运行（运行次数由功率范围与步进自动计算）/, '$1 runs (calculated from the power range and step)'],
  [/写入成功：已写入 (\d+) 个字/, 'Write succeeded: $1 words written'],
  [/读取成功：已读取 (\d+) 个字/, 'Read succeeded: $1 words read'],
  [/发现新版本 (\S+)：网页版刷新即可更新；本地桥接服务请下载最新版本并重新运行 node server.js（预设与设置保存在浏览器中，不受影响）。/, 'New version $1 available: refresh the page to update the web app; for the local bridge, download the latest version and run node server.js again (presets and settings are kept in the browser).'],
  [/定时 - 共 (\d+) 次，每次 ([\d.]+) s/, 'Timed - $1 runs, $2 s each'],
  [/将标签重置为 A 状态（Single Target Reset，([\d.]+) s）/, 'Reset tags to state A (Single Target Reset, $1 s)'],
  [/已载入同名关注标签文件“(.+)”/, 'A Tags of Interest file named "$1" is already loaded'],
  [/当前缓存 (\d+) 条读取记录，(\d+) 个唯一标签/, 'Buffered: $1 reads, $2 unique tags'],
  [/数据源“(.+)”不支持 GPI 触发/, 'Data source "$1" does not support GPI trigger'],
  [/桥接服务版本 (\S+) 过旧，TagScope (\S+) 需要 2.0.0 或更高版本，请下载最新桥接服务。/, 'Bridge version $1 is too old. TagScope $2 requires 2.0.0 or later; download the latest bridge.'],
  [/访问密码已设置为 (\S+)（保留区字 2–3）/, 'Access password set to $1 (reserved bank words 2–3)'],
  [/请在数据源“(.+)”的当前预设中勾选一个 GPI 启动端口/, 'Tick a GPI start port in the current preset of data source "$1"'],
  [/错误：请在全部 (\d+) 个字框中填写 4 位十六进制/, 'Error: enter 4 hex digits in all $1 word boxes'],
  [/错误：请填写完整的 ?(TID|EPC)/, 'Error: enter the complete $1'],
  [/（([\d.]+) dBm，第 (\d+)\/(\d+) 次/, ' ($1 dBm, run $2/$3'],
  [/（第 (\d+)\/(\d+) 次/, ' (run $1/$2'],
  [/天线 (\d+) (已连接|已断开)/, (m, a, s) => `Antenna ${a} ${s === '已连接' ? 'connected' : 'disconnected'}`],
  [/^(\d+) 个标签$/, '$1 tags'],
  [/^(\d+) 个标签 · 已读到 (\d+)$/, '$1 tags · $2 read'],
  [/^将工作区域改为“(.+)”？\n工作区域决定读写器使用的频段和功率上限，必须符合当地无线电法规。$/, 'Change the operating region to "$1"?\nThe region sets the frequency band and power limits and must comply with local radio regulations.'],
  [/^将 RFID 接口切换为 (.+)？\n切换后需要在数据源设置中把接口改为对应类型才能继续盘点。$/, 'Switch the RFID interface to $1?\nAfterwards, change the interface in the data source settings to match before running an inventory.'],
  [/^重启读写器“(.+)”？\n重启期间读写器不可用。$/, 'Reboot reader "$1"?\nThe reader is unavailable while rebooting.'],
  [/^将“(.+)”恢复出厂设置？\n主机名、工作区域、RFID 接口和 GPO 都会恢复默认，并重启读写器。此操作不可撤销。$/, 'Restore factory settings on "$1"?\nHostname, operating region, RFID interface and GPOs return to defaults and the reader reboots. This cannot be undone.'],
  [/^RFID 接口已切换为 (\w+)。请在数据源设置中把接口改为对应类型$/, 'RFID interface switched to $1. Change the interface in the data source settings to match'],
  [/^“(.+)”重启完成$/, '"$1" finished rebooting'],
  [/^系统操作：(.+)$/, 'System operation: $1'],
  [/^([^\u4e00-\u9fff]+)（模拟）$/, '$1 (simulated)'],
  [/^主机名 → (.+)$/, 'Hostname → $1'], [/^工作区域 → (.+)$/, 'Operating region → $1'], [/^RFID 接口 → (.+)$/, 'RFID interface → $1'],
];

const keys = Object.keys(D).sort((a, b) => b.length - a.length);
const PUN = { '：': ': ', '，': ', ', '（': ' (', '）': ') ', '“': '"', '”': '"', '、': ', ', '；': '; ', '。': '. ', '？': '? ', '！': '! ', '　': ' ' };
const W = /[A-Za-z0-9\u4e00-\u9fff]/;
function frag(o) {
  for (const k of keys) {
    if (!CJK.test(o)) break;
    let i = o.indexOf(k); if (i < 0) continue;
    const v = D[k]; let r = '', j = 0;
    while (i >= 0) { const b = o[i - 1], a = o[i + k.length]; r += o.slice(j, i) + (b && W.test(b) && W.test(v[0]) ? ' ' : '') + v + (a && W.test(a) && W.test(v[v.length - 1]) ? ' ' : ''); j = i + k.length; i = o.indexOf(k, j); }
    o = r + o.slice(j);
  }
  return o;
}
function core(s) {
  if (D[s] != null) return D[s];
  const m = s.match(/^(.*?)\s*[:：]$/); if (m && D[m[1]] != null) return D[m[1]] + ':';
  let o = s;
  for (const [re, r] of P) o = o.replace(re, r);
  o = frag(o).replace(/[：，（）“”、；。？！　]/g, c => PUN[c]);
  return o.replace(/ {2,}/g, ' ').replace(/\( +/g, '(').replace(/ +([),.:;?!])/g, '$1').replace(/\) ([,.:;?!)])/g, ')$1').trim();
}
const cache = new Map();
function tr(s) {
  if (L !== 'en' || s == null) return s; s = String(s); if (!CJK.test(s)) return s;
  let v = cache.get(s); if (v != null) return v;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], t = s.trim();
  v = core(t); if (!lead && /^[（(]/.test(t)) v = ' ' + v; v = lead + v + tail; if (cache.size > 5000) cache.clear(); cache.set(s, v); return v;
}
window.T = tr;
if (L !== 'en') return;

/* ---------- DOM translation ---------- */
document.documentElement.lang = 'en';
const ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
const SKIP = 'script,style,textarea,[data-noi18n]';
function trAttrs(el) { for (const a of ATTR) { const v = el.getAttribute(a); if (v && CJK.test(v)) el.setAttribute(a, tr(v)); } }
function trText(n) { const v = n.nodeValue; if (!v || !CJK.test(v)) return; const p = n.parentElement; if (p && p.closest(SKIP)) return; const t = tr(v); if (t !== v) n.nodeValue = t; }
function trTree(root) {
  if (root.nodeType === 3) return trText(root);
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  trAttrs(root);
  for (const el of root.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) if (!el.closest(SKIP)) trAttrs(el);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) trText(n);
}
new MutationObserver(ms => { for (const m of ms) {
  if (m.type === 'childList') m.addedNodes.forEach(trTree);
  else if (m.type === 'characterData') trText(m.target);
  else if (m.type === 'attributes') { const el = m.target; if (!el.closest(SKIP)) trAttrs(el); }
} }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
for (const f of ['alert', 'confirm', 'prompt']) { const o = window[f]; window[f] = (m, ...a) => o.call(window, tr(m), ...a); }
document.addEventListener('DOMContentLoaded', () => trTree(document.body));
})();

/* ---------- language switch + user guide links ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const en = window.TS_LANG === 'en', b = document.getElementById('langBtn');
  if (b) { b.textContent = en ? '中文' : 'English'; b.title = en ? '切换到中文界面' : 'Switch to English'; b.onclick = () => window.TS_setLang(en ? 'zh' : 'en'); }
  const g1 = document.getElementById('guide1'), g2 = document.getElementById('guide2');
  if (g1 && g2 && en) { g1.href = 'https://github.com/duguwuji/tagscope/blob/main/docs/user-guide-en.md'; g1.textContent = 'Open user guide'; g2.href = 'https://github.com/duguwuji/tagscope/blob/main/docs/user-guide-zh.md'; g2.textContent = '中文用户手册'; }
});
