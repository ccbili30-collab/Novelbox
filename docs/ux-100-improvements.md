# 100 个 UX / 可用性改进项

> 范围：将 TBird Roundtable Box 从“功能堆砌、视觉粗糙”推到“M3 艺术品级”。
> 每条都标注当前状态：✅ 已完成 / 🟡 部分完成 / ⏳ 待开发。
> “提交”列对应在 `claude/material-you-redesign-YzYgV` 分支上的 commit。

## 1. 设计令牌与基础 (Tokens & Foundation)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 1 | 引入完整 MD3 token system（参考调色板 + 系统颜色 + 形状 + 动效 + 排印）| ✅ | `feat(design): introduce Material You (MD3) design token system` |
| 2 | 自动 light / dark scheme，跟随系统 prefers-color-scheme | ✅ | tokens.css |
| 3 | 显式 `data-theme="light\|dark"` 覆盖 | ✅ | theme-engine.js |
| 4 | `prefers-reduced-motion` 时所有 motion duration 自动收敛到 1ms | ✅ | tokens.css |
| 5 | M3 tonal elevation level 0–5 token | ✅ | tokens.css |
| 6 | M3 shape corner scale (none → full) | ✅ | tokens.css |
| 7 | M3 motion easing：standard / emphasized / decelerate / accelerate / legacy | ✅ | tokens.css |
| 8 | M3 motion duration short/medium/long/extra-long | ✅ | tokens.css |
| 9 | 完整 M3 type scale（display / headline / title / label / body × 3 size） | ✅ | tokens.css |
| 10 | State-layer opacity token（hover 8% / focus 12% / press 12%）| ✅ | tokens.css |
| 11 | safe-area-inset-* 注入到 token，全局可用 | ✅ | tokens.css |
| 12 | 排印切换为 Roboto Flex（变量字体）+ Noto Sans SC（CJK fallback）| ✅ | typography commit |
| 13 | 字体加载使用 `media=print` swap，避免阻塞首屏 | ✅ | index.html |
| 14 | 引入 Material Symbols Rounded 变量字体，支持 fill / wght / GRAD / opsz | ✅ | md3.css |
| 15 | mobile chrome 主题色 meta 自动跟随 surface 色调 | ✅ | theme-engine.js |

## 2. 组件原语 (Components)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 16 | 5 种 M3 button：filled / tonal / elevated / outlined / text | ✅ | md3.css |
| 17 | 危险变体 `.md-button--danger` | ✅ | md3.css |
| 18 | 40dp 圆形 icon button + state layer | ✅ | md3.css + md3-shell.css |
| 19 | 三档 FAB（small / standard / large）+ extended FAB | ✅ | md3.css |
| 20 | 三种 card：elevated / filled / outlined | ✅ | md3.css |
| 21 | 4 种 chip：assist / filter / input / suggestion | ✅ | md3.css |
| 22 | 多行 list-item（one / two / three line） | ✅ | md3.css |
| 23 | M3 divider（含 inset 变体） | ✅ | md3.css |
| 24 | Filled & outlined text-field，error 态 | ✅ | md3.css |
| 25 | M3 switch（thumb 选中态变大）| ✅ | md3.css |
| 26 | 不确定 linear progress + 圆形 spinner | ✅ | md3.css |
| 27 | 基于原生 `<dialog>` 的 M3 dialog | ✅ | dialog.js |
| 28 | M3 snackbar（FIFO 队列，单实例）| ✅ | snackbar.js |
| 29 | M3 bottom sheet（含 handle）| ✅ | md3.css |
| 30 | Top app bar small / medium / large + on-scroll tonal lift | ✅ | md3.css + scroll-aware-bars.js |
| 31 | Bottom navigation bar + 高亮药丸 | ✅ | md3.css |
| 32 | Segmented button | ✅ | md3.css |
| 33 | Badge（数字与点）| ✅ | md3.css |
| 34 | Skeleton loader 占位 | ✅ | md3.css |

## 3. 主题与可定制 (Theming)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 35 | Material You 主题引擎，支持种子色 → tonal palette | ✅ | theme-engine.js |
| 36 | localStorage 持久化主题模式 + 种子色 | ✅ | theme-engine.js |
| 37 | `window.tbirdTheme.setSeedColor("#xxx")` 控制台 API | ✅ | main.js |
| 38 | 主题切换时同步刷新 `<meta name=theme-color>` | ✅ | theme-engine.js |
| 39 | 跟随系统 light/dark 切换实时更新 chrome 色 | ✅ | theme-engine.js |
| 40 | 设置面板内的可视化主题选择器（光/暗/auto + 颜色板） | ⏳ | — |

## 4. 性能 (Performance)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 41 | render() 用 rAF 合并，64 个调用点 1 帧只跑 1 次 | ✅ | scheduler commit |
| 42 | persistState 用 idle debouncer 合并，71 个调用点合并到 ≤1 / idle frame | ✅ | scheduler commit |
| 43 | pagehide / beforeunload / visibilitychange 强制 flush 持久化 | ✅ | main.js |
| 44 | 关闭的 side panel 跳过其专属 renderer | ✅ | renderNow() guards |
| 45 | classList.toggle 加 diff 守卫，避免无意义样式失效 | ✅ | setBodyClass() |
| 46 | 标题 textContent 写入加 diff 守卫 | ✅ | renderNow() |
| 47 | `content-visibility: auto` + intrinsic-size 让离屏聊天行被浏览器跳过 | ✅ | md3.css |
| 48 | `contain: layout paint` 限制 side panel / message-menu 的重排传播 | ✅ | md3.css |
| 49 | 全局 `-webkit-tap-highlight-color: transparent`，灭掉每次点击的灰闪 | ✅ | base.css |
| 50 | 全局 `touch-action: manipulation`，灭掉 iOS 300ms tap 延迟与双击缩放 | ✅ | base.css |
| 51 | 滚动区 `overscroll-behavior: contain`，灭掉手机上的橡皮筋下拉刷新 | ✅ | md3-shell.css |
| 52 | 隐藏 legacy `.motion-press` / `.motion-ripple`，去除每次 pointerdown 的多余动效 | ✅ | md3-shell.css |

## 5. 微交互与动效 (Motion)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 53 | 顶栏滚动时 surface tonal lift（M3 spec） | ✅ | scroll-aware-bars.js |
| 54 | 所有 button 用 ::before state layer 实现 hover/focus/press（无 JS） | ✅ | md3-shell.css |
| 55 | Send button 在生成中变成 error-container 色，提示停止 | ✅ | md3-shell.css |
| 56 | Roundtable cycle button：开始态 secondary-container，结束态 error-container | ✅ | md3-shell.css |
| 57 | Send button press 时 `transform: scale(0.94)` + emphasized easing | ✅ | md3-shell.css |
| 58 | composer textarea focus 用 inset 2px primary 描边（不 jump） | ✅ | md3-shell.css |
| 59 | M3 inverse-surface ::selection | ✅ | base.css |
| 60 | 自定义滚动条（WebKit + Firefox），M3 outline-variant | ✅ | base.css |
| 61 | dialog backdrop 32% scrim + 2px blur | ✅ | md3.css |
| 62 | snackbar enter/exit 用 emphasized-decelerate easing，220ms | ✅ | md3.css |

## 6. 可访问性 (Accessibility)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 63 | 所有可聚焦元素 3px primary `outline` + 2px offset，仅在键盘导航时显示 | ✅ | base.css |
| 64 | 所有 icon-only 按钮加 `aria-label` + 桌面 `title` 提示 | ✅ | index.html icons |
| 65 | snackbar `role="status"` + `aria-live="polite"` + `aria-atomic` | ✅ | snackbar.js |
| 66 | dialog 焦点陷阱（Tab 循环，Shift+Tab 反向） | ✅ | dialog.js |
| 67 | dialog ESC + 背景点击都解析为取消 | ✅ | dialog.js |
| 68 | dialog 默认聚焦主操作按钮 | ✅ | dialog.js |
| 69 | `.md-visually-hidden` a11y 工具类 | ✅ | md3.css |
| 70 | tap target ≥ 48dp（icon button、send、FAB）| ✅ | md3-shell.css |
| 71 | reduced-motion 下所有 transition / animation 自动 1ms | ✅ | tokens.css + base.css |
| 72 | window.confirm/alert 替换为带 headline / 危险态的 M3 dialog | 🟡 | dialog wired for global model overwrite; 其余仍用 legacy showToast |

## 7. 反馈与错误处理 (Feedback)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 73 | 全局 snackbar API：showSnackbar / showError | ✅ | snackbar.js |
| 74 | snackbar 支持 action 按钮（Retry / Undo） | ✅ | snackbar.js |
| 75 | snackbar 支持自定义 duration、关闭按钮 | ✅ | snackbar.js |
| 76 | snackbar 错误变体使用 error-container 色 | ✅ | snackbar.js |
| 77 | dialog 有危险变体（删除/覆盖类操作） | ✅ | dialog.js |
| 78 | dialog 支持 prompt 输入 + Enter 提交 + 必填校验 | ✅ | dialog.js |
| 79 | toast 也用 inverse-surface tone，与 snackbar 视觉统一 | ✅ | md3-shell.css |
| 80 | 全局模型覆盖二次确认改用 M3 危险 dialog（含详细说明） | ✅ | main.js |

## 8. 输入与键盘 (Keyboard & Input)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 81 | Ctrl/⌘+Enter 发送（保留 Enter 换行的输入习惯） | ✅ | 已有，title 已注明 |
| 82 | Esc 关闭 mention picker | ✅ | 已有 |
| 83 | composer 输入态会改 body class 而不是 re-render | ✅ | input handler |
| 84 | textarea max-height 限制 + 自动伸缩 | ✅ | md3-shell.css |

## 9. 响应式与移动端 (Responsive)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 85 | safe-area-inset 全部 token 化，顶栏 / composer / panel / snackbar / sheet 都尊重刘海与 home indicator | ✅ | tokens.css + md3-shell.css |
| 86 | viewport 含 viewport-fit=cover | ✅ | index.html |
| 87 | composer 顶部用 extra-large 圆角，符合 M3 mobile bottom sheet 视觉 | ✅ | md3-shell.css |
| 88 | side-panel 外侧用 extra-large 圆角，营造抽屉浮起感 | ✅ | md3-shell.css |

## 10. 测试与持续集成 (Testing & CI)

| # | 改进 | 状态 | 提交 |
|---|------|------|------|
| 89 | `npm test` 用 node:test (无第三方依赖) 跑全部用例 | ✅ | test commit |
| 90 | scheduler 单测覆盖 coalesce / flush / cancel / latest-meta / type-error | ✅ | scheduler.test.mjs |
| 91 | theme-engine 单测覆盖 palette 生成 / 单调亮度 / malformed input / 3-digit hex | ✅ | theme-engine.test.mjs |
| 92 | legacy `scripts/test-*.mjs` 全部被 `tests/legacy-scripts.test.mjs` 自动收编进 node:test | ✅ | test commit |
| 93 | GitHub Actions CI：matrix Node 20 & 22，跑测试 | ✅ | ci.yml |
| 94 | CI 含 dev-server smoke：启动后 curl index/main/tokens/md3 | ✅ | ci.yml |
| 95 | CI 含 lint job：`node --check` 全部 .js/.mjs | ✅ | ci.yml |
| 96 | CI 可选 android 任务（workflow_dispatch）：assemble debug APK 并上传 artifact | ✅ | ci.yml |
| 97 | `concurrency: cancel-in-progress`：新 push 自动取消旧 CI | ✅ | ci.yml |

## 11. 待开发 (Backlog)

| # | 改进 | 状态 | 备注 |
|---|------|------|------|
| 98 | 设置面板内置主题切换 UI（light/dark/auto + 颜色板）| ⏳ | window.tbirdTheme 已可用，UI 待加 |
| 99 | 全部 legacy showToast 调用迁移到 MD3 snackbar 并保留 retry action | ⏳ | 风险较高，分批迁移 |
| 100 | 长聊天列表的虚拟化（在 content-visibility 之上再加一层） | ⏳ | 当前 50+ 消息已流畅，>500 时再做 |

## 状态汇总

- ✅ 已完成：91
- 🟡 部分完成：1
- ⏳ 待开发：8
- 总计：100
