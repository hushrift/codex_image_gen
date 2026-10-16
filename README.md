# Codex Image Bridge

让 Claude Code、Claude Desktop 和其他支持本地 stdio MCP 的工具调用本机 Codex 生图。无需 npm 依赖，要求 Node.js 20+、Codex CLI，并已执行 `codex login`。

调用链：`Claude → MCP → codex exec → 内置 image_gen → 本地图片`。

已在 Windows、Node.js 24、Codex CLI 0.162.0-alpha.17.2（ChatGPT 登录）环境完成一次真实生图验证。若 Codex 的 Windows 沙箱无法复制图片，桥接程序会按 JSONL 中的本次会话 ID，从 Codex 的 generated_images 对应会话目录收集结果，不扫描其他会话。

## 下载

```powershell
git clone https://github.com/hushrift/codex_image_gen.git
cd codex_image_gen
codex login
npm test
```

无需执行 npm install。请先安装 Node.js 和 Codex CLI，并确保 `node`、`codex` 在 PATH 中可用。

## 接入 Claude

将以下条目合并到 Claude 的 MCP 配置中的 `mcpServers`，把 `/absolute/path/to/codex_image_gen` 替换为克隆后的实际绝对路径，不要覆盖已有配置。Windows 路径可写为 `C:/tools/codex_image_gen/bridge.mjs`。配置模板也见 `.mcp.example.json`：

```json
{
  "mcpServers": {
    "codex-image": {
      "command": "node",
      "args": ["/absolute/path/to/codex_image_gen/bridge.mjs", "mcp"]
    }
  }
}
```

如果使用 Claude Code，可在终端执行（在需要使用的项目目录下运行）：

```powershell
claude mcp add --transport stdio codex-image -- node "/absolute/path/to/codex_image_gen/bridge.mjs" mcp
```

重启对应客户端后，对 Claude 说：

> 调用 codex-image 生成一张 9:16 的公众号插画：橘猫坐在窗边，暖色水彩风。提交后每隔约 10 秒查询任务，直到成功或失败，最后返回图片路径。

工具：

- `generate_image({"prompt":"...", "references":["绝对路径.png"]})`：立即返回任务 ID。references 可省略，最多五张。比例、尺寸、风格、图片文字都写入 prompt，最终尺寸由生图工具决定。
- `get_image_job({"id":"..."})`：返回 running/completed/failed；成功时 `images` 是图片绝对路径列表。

本服务返回图片路径，调用方可使用自己的图片读取工具打开它。服务与调用方需能访问同一文件系统；本版本未提供远程 HTTP 接口。

## 命令行

```powershell
node bridge.mjs generate "一只橘猫，奶油色背景，方形插画"
node bridge.mjs generate "将参考图改成水彩风格" "C:/images/reference.png"
node bridge.mjs status "任务ID"
npm test
```

命令行 generate 会等待任务完成，并在失败时返回非零退出码。

## 配置及排错

环境变量：`CODEX_BIN` 指向 Codex 可执行文件，`CODEX_IMAGE_OUTPUT` 指定输出根目录，`CODEX_IMAGE_TIMEOUT_MS` 指定超时（默认 600000 毫秒）。默认通过 PATH 查找 codex；如果 Claude 找不到 Codex，在 MCP 条目的 env 中设置 CODEX_BIN 为 `Get-Command codex` 返回的 exe 绝对路径。

每个任务保存到 `outputs/<任务ID>/`，包含请求、状态、Codex 事件日志、错误日志和最终回复；目录可能含私人提示词及参考图，应按需自行清理。

最多同时执行两个任务。MCP 服务必须在任务运行期间保持启动；重启不会自动恢复或重试任务，避免重复消耗额度。状态查询会提示跨进程或旧任务可能已失去运行进程。

生成沿用本机 Codex 登录及配置，受账号额度和工具可用性限制。程序不会把 ChatGPT 登录凭据转换成 API Key，不会自动切换付费图片 API。桌面聊天里的生图工具可用，并不保证 CLI 会话也能使用；如果没有生成文件，任务明确标记为失败，请检查 result.txt、events.jsonl 和 stderr.log。工作进程使用 workspace-write 沙箱、禁止交互审批，并在独立任务目录运行。

Codex 非交互调用方式参考 [OpenAI 官方文档](https://developers.openai.com/codex/noninteractive)。
