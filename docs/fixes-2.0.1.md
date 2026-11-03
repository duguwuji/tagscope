# TagScope 2.0.1 修复记录

日期：2026-11-03（北京时间）。针对《TagScope_Audit_2026-11-03.md》的已确认问题进行修复。

| 审核项 | 修复与可观察行为 | 主要位置 |
|---|---|---|
| F01 · LLRP 标签操作生命周期 | 共用截止时间；每个异步设置阶段后检查剩余时间；最终禁用、删除 AccessSpec；自动开启盘点后尝试停止。可能已执行的写入超时返回 unknown；清理失败单独返回 cleanupOk=false 并发布故障。不匹配的操作结果不能确认写入成功。 | lib/driver-llrp.js |
| F02 · 停止失败恢复 | 设备确认停止后才清除 running；失败保留 unknown 和重试入口。同一数据源的控制操作串行处理。前端不再吞掉停止或断开失败，也不删除停止未确认的数据源。 | server.js、lib/driver-llrp.js、lib/driver-rest.js、public/app.js、public/views.js |
| F03 · 预设注入 | 按白名单检查预设、过滤器、天线、GPI、枚举、数值类型和范围；重读已保存预设时再次校验；属性插值转义。桥接请求也复用校验。 | public/validation.js、public/app.js |
| F04 · REST 旧流关闭新流 | 停止等待旧流排空后关闭捕获的请求对象；旧事件不能改变新流健康状态。 | lib/driver-rest.js |
| F05 · REST 流故障 | end/error/aborted/close 和请求错误推送 fault；桥接与页面显示 unknown 并终止当前测试。RF 是否停止仍需停止确认。 | lib/driver-rest.js、server.js、public/app.js |
| F06 · 末批与跨轮数据 | runId、连续 seq、停止排空、有限历史重放和去重；页面与浏览器模拟器收到 finalSeq 后再封存；无法恢复的缺口明确标为不完整。REST 尾行即使无换行也会排空。 | public/run-buffer.js、server.js、public/app.js、public/views.js、lib/driver-rest.js |
| F07 · 灭活密码 | 灭活使用本次请求密码；读取、写入和锁定使用访问密码。非法字符不会被静默删去后当作有效密码提交。 | public/views.js |
| F08 · LAN 访问控制 | API 和 SSE 均要求 Bearer 配对码；Host 白名单与 Origin 校验独立执行；允许来源不能绕过认证。仅符合本机来源检查的回环请求自动取得页面配对码；其他电脑需手工配对。固定配对码在页面引导脚本中安全转义。 | lib/bridge-security.js、server.js、public/app.js |

同时修复：默认速率窗口不再积累 rateBuf；非零窗口按时间桶限制缓存；日志上限会提示截断并标记 CSV；慢 SSE 客户端会断开；start.sh 增加执行权限；修正频率断言和模拟器嵌套校验；补齐 Worker 的共享脚本和版本缓存标记；中英文说明同步到 2.0.1，并将 REST 能力描述限定为本驱动的实现范围。

## 验证

- `npm test`：32 项回归测试全部通过，另有内存 LLRP 端到端流程通过。
- LLRP 流程：能力解析、盘点、频率换算、读取、写入与读回、BlockWrite、EPC 长度变化、锁定结果、灭活结果和灭活后无响应。模拟器只实现验收所需的有限行为，不模拟完整密码权限与锁定语义。
- 回归覆盖：超时与失败清理、停止重试、控制串行化、恶意预设拒绝、属性转义、REST 快速重启和流故障、末批与乱序重放、浏览器模拟器停止、密码来源、真实 HTTP 路由的内存调用、API/SSE 认证、Host/Origin、Worker 静态资产与内容散列。
- 18 个 JavaScript 文件语法检查通过，Worker 按 ES module 检查。

## 验证边界

当前环境监听回环端口返回 EPERM；HTTP/SSE 测试通过真实路由的内存请求完成，不代表真实 TCP 或浏览器联调。浏览器安全策略禁止打开 file URL，完整浏览器操作未完成。Worker 测试验证静态路由及文本资产，不是 Wrangler 构建或线上部署验收。

未连接、盘点、写入、锁定或灭活任何真实标签或读写器；未验证目标 R700 固件的接口行为；未部署 Cloudflare，未上传 GitHub。当前目录没有 Git 元数据，无法生成提交哈希或变更差异基线。

上线前仍需真实设备及浏览器验收，尤其是写入后的独立读回、停止后的 RF 状态、REST EOF 与弱网恢复、多源短时测试的末批统计。
