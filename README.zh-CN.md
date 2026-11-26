# Bone 2D

[English](README.md) · [Русский](README.ru.md) · **简体中文**

<p align="center"><img src="docs/media/kit-walk.gif" alt="示例狐狸 Kit 行走：IK 腿部、物理尾巴、耳朵和围巾" width="280"></p>

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![CI](https://github.com/iamgatz/Bone-2D/actions/workflows/ci.yml/badge.svg)

**在浏览器中运行的 2D 骨骼动画编辑器。** 打开链接即可绑定骨骼、制作动画、导出。无需安装，你的文件不会离开你的电脑。
开源（MIT），设计思路类似 Spine。它写出 **Spine 4.3** 格式（`.json` 或二进制 `.skel`、`.atlas`、`.png`），结果经过官方 `spine-core` 运行库的校验。

**[打开编辑器 →](https://iamgatz.github.io/Bone-2D/)** 示例骨架“Kit”一键即可载入。
直达链接：[`?demo`](https://iamgatz.github.io/Bone-2D/?demo) 打开示例狐狸，[`?demo=wave`](https://iamgatz.github.io/Bone-2D/?demo=wave) 打开并播放 `wave` 动画（还有 `walk`、`jump`、`idle`）。界面支持英语、俄语和简体中文：浏览器语言为中文时自动使用中文，也可以在顶部栏切换。
第一次打开示例时，两分钟的互动课程（“让狐狸动起来”）会带你走一遍主要流程；在“帮助”中可以再次打开，“学习”菜单里共有七课（绑定、网格、IK、曲线、皮肤与事件、导出）。

## 功能

- **骨架绑定：** 骨骼、插槽、加权网格（自动描边、权重笔刷）、皮肤、剪裁、边界框、路径、Photoshop（PSD）和 OpenRaster（Krita、GIMP）导入，以及为分层绘制的角色自动生成骨骼、网格和 IK 的自动绑定。
- **约束：** IK、变换、路径、物理约束，以及 Spine 4.3 的滑块。
- **动画：** 摄影表和支持贝塞尔曲线的曲线图、洋葱皮、事件、绘制顺序和序列关键帧、姿势库、关键帧工具。
- **导出：** 带图集打包的 Spine 4.3 JSON 或二进制；动画导出为 GIF、PNG 序列帧、视频，或带 JSON 的精灵表（用于逐帧播放的游戏）；单文件播放器页面；**网页游戏**包，附带免费播放器（单个 JavaScript 文件，MIT），可在你自己的游戏中播放角色。支持导入 Spine JSON 4.0 – 4.3 和二进制 4.3。
- **审阅：** 发送一个带动画的 HTML 页面；对方单击骨骼留下评论，你再把评论导入为标记。
- **放心尝试：** 300 步撤销、可对比和取回部分内容的检查点、自动备份。
- **无需账号、没有服务器：** 也可以在命令行使用（`npm run cli`）。

在编辑器中按 `Ctrl+K` 打开命令面板。与 Spine 的逐项功能对照见 [docs/SPINE_PARITY.md](docs/SPINE_PARITY.md)（俄语）。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:5273
npm test           # 单元测试和随机编辑会话，包括与官方 spine-core 的对比
npm run build      # 生产构建，输出到 dist/
npm run cli -- help   # 不打开编辑器处理 Spine 骨架数据：export、import、info、check、clean
```

更长时间的随机编辑会话（`FUZZ_FROM` 是第一个种子）：

```bash
FUZZ_SEEDS=300 FUZZ_STEPS=100 npx vitest run tests/fuzz.test.ts
```

## 为什么导出结果可靠

- **差分测试。** `tests/spine-parity.test.ts` 导出一个刻意刁钻的骨架（所有继承模式、斜切、IK、变换、路径和物理约束、加权网格、变形、皮肤、随机绘制顺序），用官方 `@esotericsoftware/spine-core@4.3` 载入，在几十个时间点上把每根骨骼的世界矩阵、网格顶点、颜色、附件和绘制顺序与本项目的解算器逐一对比。变异测试确保任何偏差都能被发现。
- **随机会话。** `tests/fuzz.test.ts` 运行数百组真实的编辑操作序列。每一步之后文档都必须有效，导出结果必须能被官方运行库载入；结束时对比两套解算器，“全部撤销”必须回到初始文档，“全部重做”必须回到最终文档。

## 项目结构

```
src/core      纯逻辑，不依赖 DOM：数据模型、曲线、解算器（姿势、IK、约束、蒙皮）、动画、网格、校验、导入导出
src/store     基于 immer 补丁的文档（撤销 / 重做）、界面状态、界面调用的操作
src/render    WebGL2 渲染器（批次、混合模式、双色着色、模板剪裁）
src/editor    React 面板、视口、摄影表和曲线图、快捷键
src/player    审阅者打开的页面
tests, e2e    vitest（单元、差分、随机会话）和 Playwright 浏览器测试
docs          架构说明、与 Spine 的对照
```

技术栈：TypeScript（strict）、Vite、React 19、immer、delaunator、自研 WebGL2 渲染器。贡献者指南见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)（英语）。

## 快捷键

`V` 选择 · `B` 骨骼 · `T` `R` `S` 移动 / 旋转 / 缩放 · `M` 网格 · `W` 权重 · `I` IK · `C` 剪裁 · `Tab` 装配 ⇄ 动画 · `Space` 播放 · `K` 打关键帧 · `Ctrl+Z` / `Ctrl+Y` 撤销 / 重做 · `Ctrl+S` / `Ctrl+O` / `Ctrl+E` 保存 / 打开 / 导出 · `F12` 设置。
非拉丁键盘布局下同样有效，每个快捷键都可以在设置中修改。

## 尚未完成

- 剪裁和边界框的权重与变形（目前只能移动它们的顶点）。
- 不读取 Spine 4.0 – 4.2 的二进制文件（这些版本的 JSON 可以读取）。
- 实时协作（目前通过项目文件和审阅页面分享）。
- 暂无计划：多边形图集打包、ninepatch、JPG 图集页、`.spine` 导入、外部编辑器插件。

## 参与贡献

欢迎提交 issue 和 pull request（中文也可以）；最有用的是附带项目文件的错误报告。参见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)（英语）。

## 说明

Bone 2D 是独立项目，与 Esoteric Software 没有关联；“Spine”是其产品和商标，这里提及仅用于说明 Bone 2D 读写的文件格式。在游戏中使用官方 Spine 运行库受其自身许可条款约束。

## 许可证

[MIT](LICENSE)
