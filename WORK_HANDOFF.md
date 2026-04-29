# TBird / Novelbox 工作交接

迁移时间：2026-04-29  
新工作目录：`D:\CodexW\TBird_Novelbox`  
旧工作目录：`C:\Users\16014\Documents\New project`

## 当前项目状态

- 项目名称：TBird / Novelbox
- 形态：移动端优先的 Chatbox 式小说创作工具，Web 原型 + Android WebView 打包。
- GitHub：`https://github.com/ccbili30-collab/Novelbox`
- 当前本地分支：`master`
- 远端主分支：`main`
- 最近已推送提交：
  - `94211f9 Separate user edit save from resend`
  - `06f0bbf Improve model compatibility and message menu`
  - `e7fa90f Isolate novel settings per session`

## 关键功能约定

- API 配置全局共享：`Base URL`、`API Key`、模型列表。
- 每个会话独立保存：系统提示、模型选择、温度、上下文条数、最大 token、流式开关、排版参数、正文库、剧情线、角色卡、世界观、大纲、伏笔线。
- 用户消息编辑：
  - `保存`：只修改用户消息文本，不调用模型。
  - `保存并重新发送`：创建新分支并重新生成。
- AI 消息编辑：
  - `保存`：实打实修改当前 AI 输出文本。
  - `保存并继续`：保存后让 AI 从该输出继续。
- 正文库：
  - 支持 TXT 导入。
  - 支持 TXT 导出。
  - `同步正文` 会把当前会话路径上的所有 AI 输出按顺序写入正文库，不写入用户输入。
- OpenAI 兼容接口：
  - 已移除流式请求里的 `stream_options.include_usage`，避免兼容模型报 `param incorrect`。
  - 安卓桥会把流式错误显示为 `HTTP 状态码 + 上游错误信息`。

## 主要文件

- `index.html`：应用壳、面板、编辑弹窗。
- `src/main.js`：核心状态、会话树、OpenAI 调用、正文/资料逻辑。
- `src/styles.css`：移动端 Chatbox 风格 UI 和排版调试参数。
- `dev-server.mjs`：本地开发服务器和 OpenAI 兼容代理。
- `android-app/`：Android WebView 打包工程。

## 常用命令

```powershell
# 语法检查
node --check src\main.js
node --check dev-server.mjs

# Android debug 包
cd android-app
.\gradlew.bat assembleDebug --offline --no-daemon
```

APK 输出：

`android-app\app\build\outputs\apk\debug\app-debug.apk`

## 注意事项

- `localStorage` key：`tbird-chatbox-v1`。
- 旧数据迁移逻辑在 `hydrate()` 中，旧版顶层 `settings/novel` 会被迁到 `api` 和当前会话。
- 工作目录之前混入了其他临时项目和缓存，迁移时只保留 TBird/Novelbox 本体。
- 不要把 `node_modules/`、`outputs/`、`spore_lore_extract/`、Godot/菌临天下等残余当成 TBird 项目文件。
