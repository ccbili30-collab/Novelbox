# TBird 状态结构

## 顶层 state
```js
{
  activeSessionId: string,
  sessions: Session[],
  api: {
    baseUrl: string,
    apiKey: string,
    models: string[]
  }
}
```

## Session
```js
{
  id: string,
  title: string,
  createdAt: number,
  updatedAt: number,
  rootId: string,
  nodes: Record<string, MessageNode>,
  settings: SessionSettings,
  novel: NovelData
}
```

## MessageNode
```js
{
  id: string,
  role: 'root' | 'user' | 'assistant',
  parentId: string | null,
  content?: string,
  children: string[],
  activeChildId: string | null,
  versions?: AssistantVersion[],
  activeVersionId?: string | null,
  createdAt: number
}
```

## SessionSettings
```js
{
  systemPrompt: string,
  model: string,
  temperature: number,
  contextCount: number,
  unlimitedContext: boolean,
  maxTokens: number,
  stream: boolean,
  layout: LayoutSettings,
  layoutPresets: Array<{ id: string, name: string, values: LayoutSettings }>
}
```

## NovelData
```js
{
  body: string,
  plotline: string,
  characters: string,
  world: string,
  outline: string,
  foreshadows: string
}
```

## 兼容迁移
- 历史顶层 `settings` 会迁移到 `api` 和当前会话 `settings`。
- 历史顶层 `novel` 会迁移到当前活动会话 `novel`。
- 缺失字段由 hydrate 过程补齐默认值。
