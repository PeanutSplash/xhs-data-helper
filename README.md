<div align="center">

<h1>小红书数据助手</h1>

**批量下载笔记内容的桌面工具**

<img src="docs/assets/preview.png" alt="软件界面预览" width="800">

图片 • 视频 • Excel 数据 • 本地运行

[![Windows](https://img.shields.io/badge/Windows-支持-0078D6?logo=windows&logoColor=white)](https://github.com/PeanutSplash/xhs-data-helper/releases)
[![macOS](https://img.shields.io/badge/macOS-支持-000000?logo=apple&logoColor=white)](https://github.com/PeanutSplash/xhs-data-helper/releases)
[![License](https://img.shields.io/badge/License-CC_BY--NC_4.0-green)](LICENSE)

[下载](#安装) • [使用说明](#使用说明) • [常见问题](#常见问题)

</div>

---

## 功能

### 三种下载模式

| 模式 | 适用场景 |
|------|---------|
| **指定笔记** | 你已经有一批笔记链接,想批量保存 |
| **博主笔记** | 喜欢某个博主,想下载 TA 的所有内容 |
| **搜索下载** | 按关键词搜索,批量保存搜索结果 |

### 主要特点

- 完整保存笔记中的图片和视频
- 自动生成 Excel 表格(包含标题、正文、点赞数等)
- Cookie 本地加密,不上传任何数据
- 支持断点续传和任务队列
- 支持 HTTP/HTTPS 代理

---

## 安装

从 [Releases](https://github.com/PeanutSplash/xhs-data-helper/releases) 下载对应系统的安装包:

- **Windows**: `xhs-helper-setup.exe`
- **macOS**: `xhs-helper.dmg`

> macOS 用户首次打开时,需要在「系统偏好设置 → 安全性与隐私」中点击"仍要打开"

---

## 使用说明

### 1. 获取 Cookie

<details>
<summary>点击查看步骤</summary>

1. 用浏览器打开 [小红书网页版](https://www.xiaohongshu.com),登录你的账号
2. 按 <kbd>F12</kbd> 打开开发者工具
3. 点击 **Network** (网络) 标签
4. 刷新页面,点击任意一个请求
5. 在右侧找到 **Request Headers**,复制 `Cookie:` 那一整行
6. 在软件的设置页面粘贴保存

</details>

### 2. 配置保存路径

在设置页面指定:
- 图片/视频保存位置
- Excel 文件保存位置
- 代理地址(可选)

### 3. 创建任务

**指定笔记模式**
```
https://www.xiaohongshu.com/explore/xxxxx
https://www.xiaohongshu.com/explore/yyyyy
```
每行一个链接

**博主笔记模式**
```
https://www.xiaohongshu.com/user/profile/xxxxx
```
输入博主主页链接

**搜索模式**

填写搜索关键词和筛选条件:
- 下载数量
- 排序方式(综合/最新/最热)
- 笔记类型(图文/视频/不限)
- 时间范围

### 4. 查看进度

在历史页面可以:
- 查看实时日志和进度条
- 随时停止任务
- 导出日志文件
- 打开结果文件夹

---

## 常见问题

<details>
<summary><b>文件保存在哪里?</b></summary>

在设置页面可以看到你配置的路径,或者在历史页面点击"打开文件夹"按钮。

文件结构:
```
保存路径/
├── 笔记标题1/
│   ├── 图1.jpg
│   ├── 图2.jpg
│   └── 视频.mp4
├── 笔记标题2/
└── 汇总.xlsx
```

</details>

<details>
<summary><b>macOS 提示"无法打开"</b></summary>

解决方法:
1. 打开「系统偏好设置 → 安全性与隐私」
2. 点击"仍要打开"

或者在终端执行:
```bash
sudo xattr -r -d com.apple.quarantine /Applications/xhs-helper.app
```

</details>

---

## 核心依赖

本项目的爬虫能力基于 [Spider_XHS](https://github.com/cv-cat/Spider_XHS) 实现

---

## 许可证

本项目基于 [CC BY-NC 4.0](LICENSE) 开源

---

## 反馈

- [报告问题](https://github.com/PeanutSplash/xhs-data-helper/issues)
- 觉得有用的话,给个 Star ⭐

---

<div align="center">

**免责声明**

本工具仅供学习研究使用,请遵守相关法律法规和平台规则。<br>
下载内容的版权归原作者所有,使用后果自负。

<br>

[下载最新版本](https://github.com/PeanutSplash/xhs-data-helper/releases)

</div>

---

<details>
<summary><b>开发者</b></summary>

### 技术栈
- React 19 + TypeScript + Tailwind CSS
- Electron 37

### 本地开发
```bash
git clone --recursive https://github.com/PeanutSplash/xhs-data-helper.git
cd xhs-data-helper

pnpm install
pip3 install -r python-engine/requirements.txt

pnpm run dev
```

### 构建
```bash
pnpm run build:win    # Windows
pnpm run build:mac    # macOS
```

</details>
