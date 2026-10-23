# 熵析拓解 · 电脑版（Windows 10 / 11）

网易云音乐的**桌面第三方客户端**：无边框窗口 + 侧边栏 + 底部播放条 + 歌词侧栏，
原生层用 Node.js 重写，Electron 承载界面。

> 这是**电脑版**仓库，和手机（Android）版分开发布：
> 手机版见 [Xueliyou/shangxi-tuojie](https://github.com/Xueliyou/shangxi-tuojie)。

<p align="center">
  <img src="app/ui/app_icon.png" width="112" alt="icon">
</p>

---

## ⚠️ 登录请用扫码，不要用验证码

> 短信验证码登录走的是非官方接口，容易触发网易云风控（登录失败、账号被临时限制）。
> **请使用「扫码登录」**，用手机上的网易云音乐 App 扫一下即可，稳定且安全。

---

## 功能

- **发现**：热歌榜 / 飙升榜 / 新歌榜 / 原创榜，榜单前三名预览，一键播放
- **搜索**：歌名 / 歌手 / 专辑，回车即搜，结果可直接播放或下载
- **详情**：歌单、专辑、榜单、单曲；支持播放全部、批量下载
- **播放**：播放 / 暂停 / 上一首 / 下一首 / 进度拖拽 / 音量 / 列表循环 / 顺序 / 单曲 / 随机
- **歌词**：右侧歌词栏，逐行高亮，原文 + 中文翻译，点歌词跳转进度
- **下载**：MP3 / FLAC，写 ID3v2.3 / FLAC 标签（封面、标题、歌手、专辑、USLT、SYLT、`LYRICS`），
  同时生成同名 `.lrc`；下载进度在「下载」页实时显示
- **登录**：扫码登录 / 手动填 Cookie / 登录状态测试
- **设置**：默认音质（8 档）、下载子目录、深色 / 浅色主题、打开下载目录
- **最近播放**：本地记录最近 60 首

音质取决于账号权益：普通账号一般 320K，黑胶 VIP 才有无损 / Hi-Res / 环绕声等。

## 下载安装

到 [Releases](../../releases) 下载 `ShangxiTuojie-Setup-*.exe`：

- 用户级安装（**不需要管理员**），装到 `%LOCALAPPDATA%\Programs\ShangxiTuojie`
- 自动创建桌面 / 开始菜单快捷方式和卸载项
- 下载默认保存到 `%USERPROFILE%\Music\NeteaseMusic`，同名 `.lrc` 在旁边
- 安装包未做代码签名，SmartScreen 提示时选「更多信息 → 仍要运行」

## 从源码构建

环境：Node 22+、bash、[NSIS 3](https://nsis.sourceforge.io/)（Linux 上 `apt install nsis`）。

```bash
# 1) 下载 Electron Windows x64 运行时
wget https://npmmirror.com/mirrors/electron/45.0.0/electron-v45.0.0-win32-x64.zip
unzip electron-v45.0.0-win32-x64.zip -d electron

# 2) 打包（会生成 ShangxiTuojie-Setup-2.1.1.exe）
./build-win.sh
```

`build-win.sh` 做的事：Electron 运行时 + `app/` → `stage/resources/app`，裁掉多余语言包，
把 `electron.exe` 改名成 `ShangxiTuojie.exe`，再用 NSIS 生成用户级安装包。

## 目录

```
app/
  main.js             主进程：无边框窗口、IPC、下载进度、剪贴板、外链
  preload.js          注入 Native / StateBridge / DownloadBridge / Desktop
  ui/
    desktop.html      桌面版界面结构
    desktop.css       Windows 11 风格样式（深浅色）
    desktop.js        界面逻辑（Native.call 桥接）
  native/
    netease.js        网易云接口：weapi / eapi 加密、搜索/歌单/专辑/榜单/歌词/登录
    tags.js           ID3v2.3 / FLAC 标签写入（与 Android 版 Java 实现字节级一致）
    download.js       下载、进度、写标签、生成 .lrc
    bridge.js         前端 call() 的路由层
installer.nsi         NSIS 安装脚本
build-win.sh          一键打包
icon.ico              安装包 / 快捷方式图标
```

## 说明

- 首次打开没有登录态，请**扫码登录**；不登录只能试听 128K 且部分歌单不完整。
- 通知栏 / 媒体键这类安卓专有能力，桌面版用窗口内控件替代；暂无系统托盘和开机自启。
- 下载的音乐版权归网易云音乐及版权方所有，仅供个人学习交流，请勿传播或商用。

## 更新日志

### v2.1.1（2026-10-24）
- 修复：部分机器播放没有声音。关闭 Chromium 的混合内容拦截，音频地址优先 https、失败自动回退 http
- 修复：播放条右侧的下载按钮没有绑定，点了没反应
- 修复：音量条在部分窗口宽度下超出播放条边框
- 修复：全屏时首页榜单卡片过小，改为自适应铺满
- 改进：下载封面按真实格式写 MIME（jpeg/png/webp），封面地址 https 失败会回退 http；标签写入失败会在下载状态里提示
- 新增：设置页「音频」诊断卡片（播放 440Hz 测试音、打开运行日志）

### v2.1.0
- 首个桌面正式版：无边框窗口、侧边栏、播放条、歌词侧栏、下载中心

## 联系

- **QQ：3525848951**
- 问题 / 建议 / Bug，欢迎提 Issue 或加 QQ。

> 本项目与网易云音乐官方无关。
