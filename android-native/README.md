# android-native — Kotlin + Compose 原生重写

这是 Web 原型并行的**真正原生 Android 实现**。和 `android-app/`（WebView
包壳）完全独立。

## 目标范围（Phase 1，本仓库当前状态）

- ✅ Material 3 主题 + Material You 动态色（Android 12+ 跟随壁纸）
- ✅ 三档主题模式：浅 / 深 / 跟随系统，落地到 DataStore
- ✅ 主聊天界面：M3 顶栏 + 消息列表 + composer，含空状态 + 建议 chip
- ✅ OpenAI-compatible Chat Completions 流式客户端（kotlinx.serialization +
  HttpURLConnection，无第三方依赖）
- ✅ 流式 token 实时写入 assistant 气泡
- ✅ 设置页：主题段控件 + 动态色开关 + Base URL/API Key/Model 表单
- ✅ Edge-to-edge + 状态栏 + IME insets + 自适应回到底部
- ✅ Splash + 自适应图标

## Phase 2+（暂未实现）

- 多 AI 圆桌 / 创作者记忆 / 分支会话树 / 手稿同步
- 会话历史持久化（Room）— 当前只在内存里
- 全部的 import/export / 模型 picker / layout 预设

以上每一块都是几天到一周的独立工作，不在 Phase 1 范围里。

## 构建

```bash
export ANDROID_HOME=/opt/android-sdk
cd android-native
./gradlew assembleDebug --no-daemon
```

APK 输出：
```
android-native/app/build/outputs/apk/debug/app-debug.apk
```

或者把它复制到 `releases/`：
```bash
cp android-native/app/build/outputs/apk/debug/app-debug.apk \
   releases/v0.2.0-md3/tbird-roundtable-native-debug.apk
```

## 配置

需要的 build-tools：`34.0.0`（同 `android-app/`），AGP `8.2.2`，Kotlin
`1.9.22`，Compose BOM `2024.02.01`。

## 应用 ID

`com.qinglan.chatnovel.native.debug`（与 WebView 版的 `com.qinglan.chatnovel`
独立，两个版本可同时安装在同一台手机上对比）。
