# TBird 模块化架构说明

## 当前问题
- `src/main.js` 同时承担状态、业务逻辑、UI 渲染、OpenAI 调用、Android bridge 兼容等职责。
- `src/styles.css` 为集中式样式文件，后续维护成本会持续上升。
- `android-app/.../MainActivity.java` 同时负责 WebView、Bridge、通知、权限、文件选择和网络请求。

## 重构目标
- 将项目逐步拆分为 `domain/`、`state/`、`services/`、`ui/`、`utils/` 等边界明确的模块。
- 先抽离纯逻辑与持久化，再继续拆分 UI 和 Android 宿主层。
- 保持当前功能与本地存储兼容，不推翻重写。

## 当前第一阶段范围
1. 建立 `docs/` 文档骨架。
2. 从 `src/main.js` 抽离通用工具函数到 `src/utils/`。
3. 抽离默认状态、hydrate 与 localStorage 持久化到 `src/state/` 与 `src/domain/`。
4. 保持 `main.js` 作为应用装配入口，暂不大改 UI 结构。

## 目标边界
- `domain/`: 会话、小说资料、布局、设置等业务模型与纯逻辑。
- `state/`: 默认状态、hydrate、load/save 持久化。
- `services/`: AI 请求、bridge、storage、通知。
- `ui/`: DOM 引用、事件绑定、渲染器、panel 管理。
- `utils/`: id、文本、时间、token、错误处理。

## 当前约束
- 使用 PowerShell 命令进行项目检查与脚本执行。
- 每次改动尽量小而可验证。
- 优先抽纯逻辑，不优先重做 UI。
