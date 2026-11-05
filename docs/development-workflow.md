# TagScope 开发与发布流程

TagScope 采用“功能分支 → 预览验证 → Pull Request → 合并 main → 正式发布”。

## 开始一项修改

在 Git 仓库中从最新的 `main` 创建功能分支，例如 `feature/reader-status`。每次修改先运行 `npm test`，再把分支推送到 GitHub。

```sh
git switch main
git pull --ff-only
git switch -c feature/reader-status
# 修改文件后
npm test
git add <需要提交的文件>
git commit -m "fix: improve reader status"
git push -u origin feature/reader-status
```

这些命令需要在从 GitHub 克隆的仓库中运行；下载解压的源码目录不含 Git 历史。

`npm test` 现在先运行 `npm run check`（全部 JavaScript 文件的语法检查，含 Worker 的 ES module 检查），再运行回归测试和模拟 LLRP 端到端测试。GitHub Actions（`.github/workflows/ci.yml`）会在 push 到 `main` 和所有 Pull Request 上，用 Node 18、20、22 分别执行同一命令；Cloudflare 构建命令也可以继续使用 `npm test`。

版本号只在 `package.json` 中修改。`server.js` 和 `worker.js` 读取它并注入页面的 `tagscope-version` meta；前端、HTML 脚本标签和 Worker 缓存参数都不再写死版本号。

## 版本号自动递增

`.github/workflows/version-bump.yml` 在 PR 打开、更新或重新打开时，比较 PR 分支与 `main` 的 `package.json` 版本：

- 两者相同 → 把补丁版本 +1（如 `2.0.1` → `2.0.2`），同步更新 README 与用户手册里的“当前版本”行，以 `chore: bump version to 2.0.2` 提交回 PR 分支；
- PR 中已手动改过版本号 → 保持不动。做 minor / major 发布时，直接在 PR 里把 `package.json` 改成目标版本即可，工作流不会覆盖。

随版本号一起更新的只有版本声明行：`README.md` / `README.en.md` 顶部的“当前版本 / Current version”，以及 `docs/user-guide-*.md` 的“适用版本 / Version”。“2.0.1 起需要……”这类历史兼容说明不会被改动。

同一个 PR 只会自动递增一次，之后的推送不会继续加版本号。本地可手动运行：

```sh
node scripts/bump-version.js          # patch +1
node scripts/bump-version.js minor    # 2.0.1 -> 2.1.0
node scripts/bump-version.js major    # 2.0.1 -> 3.0.0
```

来自 fork 的 PR 无法被工作流推送，需要贡献者自己在 PR 中修改版本号；仓库设置需允许 Actions 使用写权限（Settings → Actions → General → Workflow permissions）。自动提交由 `GITHUB_TOKEN` 完成，GitHub 不会为这类推送自动触发工作流，因此工作流在推送后显式派发一次 CI（`ci.yml` 支持 `workflow_dispatch`），保证递增提交同样有 CI 结果。派发需要 `actions: write` 权限，已在该工作流中声明。

## 预览与审查

Cloudflare Workers Builds 对功能分支运行 `npm test` 和预览部署。通过 Cloudflare 的 tagscope → 部署或 Pull Request 中的构建信息找到对应分支和提交的预览地址；预览链接可被持有链接的人访问，勿放入真实凭据或敏感数据。

1. 确认 Cloudflare 预览构建成功，并核对提交编号。
2. 打开预览，检查修改功能和受影响的页面；在无硬件环境先使用模拟器。
3. 创建指向 `main` 的 Pull Request，记录修改内容、测试结果和必要的实机验证。
4. 预览与检查通过后再合并。不要将测试失败或结果未知的提交合并到生产分支。

预览链接与正式网站不是同一来源。预览页面若要连接本地桥接，使用最新桥接服务并将该次预览地址的完整 origin 通过 `--allow-origin=https://预览域名` 加入允许列表；来源白名单不能代替桥接配对码。真实 R700 的连接和标签操作需要另行实机验证。

## 合并与正式发布

Pull Request 合并到 `main` 后，Cloudflare 自动运行 `npm test`，通过后执行 `npx wrangler deploy`。在 Cloudflare 的 tagscope → 部署确认对应提交已部署，再访问 https://tagscope.iotrfid.top/ 检查页面。

Worker 部署只更新网页；读写器电脑上的桥接服务仍需下载对应版本并重启。出现问题时检查 Cloudflare 构建日志并按需回滚到之前的部署版本。

预览分支构建与操作约定本身不能阻止直接推送 `main`；只有配置并生效的 GitHub 分支保护或规则集才能强制要求通过 Pull Request。
