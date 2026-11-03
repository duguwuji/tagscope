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
