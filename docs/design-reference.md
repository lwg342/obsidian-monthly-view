# Diane 界面参考

检查日期为 2026-11-07。

入口为 [Diane 日历](https://diane.wl342.net/calendar)。浏览器可访问，但当前会话显示“请登录后查看你的记录”。没有登录、读取私人日程或调用后端。已查看页面截图及其实际引用的 CSS 和 JavaScript。

读取的公开前端资源为

- [workbench.css](https://diane.wl342.net/assets/9586cf3a52d41aea/src/workbench.css)
- [workbench.js](https://diane.wl342.net/assets/9586cf3a52d41aea/src/workbench.js)

该部署中，JavaScript 的 `calendar()` 将日期分成 `[1,15]` 和 `[16,days]`。后置 CSS 规则覆盖了早期规则，最终为双栏、28px 栏间距、28px 日期列、10px 内部间距、48px 最小行高，周日结束处使用 2px 分隔线。桌面通过 CSS subgrid 使左右行高对齐，内容最多两行。今天使用浅灰底色。

插件沿用其最终布局尺度和分隔思路，CSS 类名与 Obsidian 隔离。没有复制网站 JavaScript、认证、业务数据或后端客户端。页面只提供部署源码，未取得完整仓库；因此不声称完成了仓库级复用或登录后视觉逐像素比对。

| 项目 | 当前 Diane 部署 | 此插件 |
| --- | --- | --- |
| 月份拆分 | 1–15 / 16–月底 | 相同 |
| 行对齐 | subgrid | 同一 CSS Grid 的配对行，无 subgrid 依赖 |
| 内容 | 最多两行并显示日程数量 | 完整 Markdown 换行，按内容撑高 |
| 窄屏 | 上下堆叠 | 按日期连续显示单列 |
| 今天 | 灰色背景 | Obsidian 主题底色及强调线 |
| 分隔 | 星期日之后，横跨整栏 | 星期日数字下方的主题强调色线，与日期栏等宽 |
| 高度 | 等高日期区 | 至少铺满面板可用高度，长内容继续撑高 |
| 编辑 | 网站详情/相关业务界面 | Obsidian 原生编辑器 |
| 月份控制 | 上月、月份、下月 | 加入“本月” |
| 数据 | 网站账户和远端记录 | 单个本地月度 Markdown 文件 |

浏览器预览使用项目内的示例数据和生产视图代码。测试宿主的主题颜色是对 Obsidian 变量的近似定义，真实 Obsidian 中会使用当前主题的值。
