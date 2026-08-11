---
name: generate-museum-json
description: Generate, edit, review, or validate museum configuration JSON for this photo-album-museum-XR project. Use when creating a museum or gallery from photo metadata, changing files under public/museums/, adding rooms or connections, choosing templates/themes/door styles, or diagnosing a museum JSON rejected by the app.
---

# Generate Museum JSON

生成应用可以直接加载的博物馆配置。不要在 JSON 中写注释、尾逗号、房间坐标或本文未列出的字段。

## 工作流

1. 阅读用户提供的照片、分组、标题和叙事要求；信息缺失时只补保守的展示文案，不虚构拍摄地点或日期。
2. 选择模板并规划所有房间、板块和门连接。确保每个展厅都能从大厅到达。
3. 按下述契约生成 UTF-8 JSON。优先使用两空格缩进，并在文件末尾保留换行。
4. 若要让欢迎页显示新博物馆，同时在 `public/museums/index.json` 添加入口；`config` 使用 `/museums/<file>.json` 形式。
5. 从项目根目录运行零依赖检查器：

   ```bash
   node .agents/skills/generate-museum-json/scripts/check-museum-json.mjs public/museums/<file>.json
   ```

6. 修改了项目配置实现时，再运行 `npm test`；交付新配置前至少运行检查器。

## 顶层格式

只允许四个顶层字段，且全部必填：

```json
{
  "version": 1,
  "museum": {
    "title": "我的博物馆",
    "lobby": { "id": "lobby", "template": "lobby-atrium" }
  },
  "rooms": [],
  "connections": []
}
```

- `version`：必须为数字 `1`。
- `museum`：博物馆与大厅信息。
- `rooms`：展厅数组；大厅不要重复放入此数组。
- `connections`：门之间的无向连接数组。

所有对象都拒绝未声明字段。

## museum 与 lobby

`museum`：

| 字段 | 要求 |
| --- | --- |
| `title` | 必填，非空字符串 |
| `subtitle` | 可选字符串 |
| `intro` | 可选字符串 |
| `heroImage` | 可选，使用“图片源”格式 |
| `backgroundMusic` | 可选，全馆默认背景音乐 |
| `lobby` | 必填，大厅对象 |

`lobby`：

| 字段 | 要求 |
| --- | --- |
| `id` | 必填；以英文字母开头，之后仅字母、数字、`_`、`-`；必须与所有展厅 ID 唯一 |
| `template` | 必须为 `lobby-atrium` |
| `theme` | 可选主题 |
| `doorStyle` | 可选普通门样式 |
| `elevatorDoorStyle` | 可选电梯门样式 |
| `backgroundMusic` | 可选；仅在大厅覆盖全馆默认背景音乐 |

大厅有 `door-1` 至 `door-6` 六个门位。主视觉 `heroImage` 不计入展厅照片。

## rooms、blocks 与 photos

每个展厅只允许：

| 字段 | 要求 |
| --- | --- |
| `id` | 必填，格式同大厅 ID，且全局唯一 |
| `template` | 必填，见模板表 |
| `title` | 必填，非空字符串 |
| `intro` | 可选字符串 |
| `theme` | 可选主题 |
| `doorStyle` | 可选普通门样式 |
| `elevatorDoorStyle` | 可选电梯门样式 |
| `backgroundMusic` | 可选；仅在该展厅覆盖全馆默认背景音乐 |
| `blocks` | 必填，板块数组 |

每个板块只允许 `title`（可选字符串）、`description`（可选字符串）和 `photos`（必填数组）。板块用于策展分组，不配置位置。

每张照片只允许：

```json
{
  "sources": {
    "original": "https://images.example.com/photo.jpg",
    "medium": "https://images.example.com/photo-2048.webp",
    "low": "https://images.example.com/photo-512.webp"
  },
  "title": "雨后的新宿",
  "location": "东京",
  "date": "2025-04-12",
  "description": "傍晚沿街散步时拍摄。",
  "alt": "雨后的东京街道"
}
```

- `sources` 必填；`original` 为非空字符串且必填，`medium`、`low` 为可选非空字符串。
- `title`、`location`、`date`、`description`、`alt` 均为可选字符串。
- 优先提供三档图片 URL；缺少 `medium` 或 `low` 时应用会回退到原图，增加下载流量。
- 写有事实含义的 `location`、`date`、`description` 前先确认来源；无法确认时省略。
- 为无障碍体验尽量提供准确的 `alt`，但不要用文件名冒充描述。

## 背景音乐

`museum.backgroundMusic` 为全馆默认音乐；`museum.lobby.backgroundMusic` 或任一 `rooms[]` 的 `backgroundMusic` 会在参观者进入该房间时覆盖默认音乐。离开独特音乐房间后会恢复全馆默认音乐。

```json
{
  "url": "https://media.example.com/museum-ambient.mp3",
  "volume": 0.35
}
```

- `url` 必填，必须是非空字符串。远程音频须允许浏览器直接加载；部署环境应使用 HTTPS。
- `volume` 可选，必须是 `0` 到 `1` 的数字；省略时使用 `0.35`。
- 音乐会循环播放。浏览器若限制自动播放，应用会在参观者下一次点击、按键或 XR 交互时开始播放。
- 房间未配置 `backgroundMusic` 时继承全馆默认音乐；完全不配置则静音。
- 使用有明确授权的音乐，并自行保存作者、来源和许可证记录。不要把许可证不明的链接写进配置。

## 模板与容量

| 模板 | 最大板块 | 照片上限 | 可连接门位 |
| --- | ---: | ---: | --- |
| `gallery-small` | 2 | 16 | `door-1`、`door-2` |
| `gallery-medium` | 3 | 24 | `door-1`、`door-2`、`door-3` |
| `gallery-large` | 4 | 36 | `door-1`、`door-2`、`door-3`、`door-4` |

照片上限按一个房间所有板块的照片总数计算。只有连接中使用的门才显示；不要为未使用门写占位连接。

## 主题与门样式

- `theme`：`classic`、`botanical`、`art-deco`、`terrazzo`。
- `doorStyle`：`classic-oak`、`sage-panel`、`deco-walnut`、`modern-ash`。
- `elevatorDoorStyle`：`elevator-brushed`、`elevator-bronze`、`elevator-dark`。

主题和门样式都可省略。不要把普通门样式写入 `elevatorDoorStyle`，反之亦然。

## connections

每条连接必须有且只能有 `from`、`to`，以及可选的 `elevatorDoorStyle`：

```json
{
  "from": "lobby.door-1",
  "to": "cities.door-1",
  "elevatorDoorStyle": "elevator-bronze"
}
```

同时满足：

- 端点格式为 `<room-id>.door-<正整数>`。
- 两端必须引用已存在的不同端点，并且门号属于对应模板。
- 一个门位最多出现在一条连接中。
- 所有展厅必须通过连接图从大厅可达。
- 不要指定连接类型、走廊、电梯、位置或旋转；布局器根据距离与冲突自动选择直连、走廊或电梯。

## 完成检查

- 确认 JSON 可解析、没有额外字段，ID 和枚举值拼写正确。
- 确认板块数、照片数和门号没有超过模板容量。
- 确认没有重复 ID、重复门位、自连接或孤立展厅。
- 确认每张照片有 `sources.original`，远程图片服务允许浏览器跨域读取。
- 确认背景音乐 URL 可公开访问、使用 HTTPS，并且音频授权适合项目用途。
- 运行 `scripts/check-museum-json.mjs` 并修复全部错误；不要仅凭目测宣布完成。
