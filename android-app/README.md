# 青澜对话写作 Android

这是 Web 原型的 Android WebView 封装版。构建时会自动把项目根目录的 `index.html` 和 `src/` 同步进 APK assets，所以继续改 Web 原型后重新打包即可。

## 已接入

- 离线加载本地页面：`file:///android_asset/index.html`
- `localStorage` 持久化
- 本地图片背景选择：Android 原生文件选择器支持 `<input type="file">`
- OpenAI-compatible：APK 内通过 `AndroidBridge.openAIChat()` 走原生网络请求，不依赖桌面端 `dev-server.mjs`
- 互联网权限：用于真实 API 调用

## 构建

当前机器缺 Android SDK，所以 Gradle 已经能启动但还不能产出 APK。安装 Android SDK 后二选一：

```powershell
$env:ANDROID_HOME="C:\Users\16014\AppData\Local\Android\Sdk"
cd android-app
.\gradlew.bat assembleDebug --offline
```

或在 `android-app/local.properties` 写入：

```properties
sdk.dir=C\:\\Users\\16014\\AppData\\Local\\Android\\Sdk
```

然后运行：

```powershell
cd android-app
.\gradlew.bat assembleDebug --offline
```

Debug APK 输出位置：

```text
android-app/app/build/outputs/apk/debug/app-debug.apk
```
