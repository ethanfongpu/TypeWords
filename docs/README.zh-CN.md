<h1 align=center>
  <img src="https://github.com/user-attachments/assets/9d626e0f-0601-4640-8981-ad66d8ac4853" alt="TypeWords" style="width: 500px;"/>
</h1>

<p align="center">
  <a href="/README.md">English</a> |
  <a href="/docs/README.es.md">Español</a> |
  <a href="/docs/README.de.md">Deutsch</a> |
  <a href="/docs/README.fr.md">Français</a> |
  <a href="/docs/README.pt.md">Português</a> |
  <a href="/docs/README.ru.md">Русский</a> |
  <a href="/docs/README.uk.md">Українська</a> |
  <a href="/docs/README.ja.md">日本語</a> |
  <a href="/docs/README.ko.md">한국인</a> |
  <a href="/docs/README.th.md">ไทย</a> |
  <a href="/docs/README.vi.md">Tiếng Việt</a> |
  <a href="/docs/README.id.md">Bahasa Indonesia</a> |
  <a href="/docs/README.zh-TW.md">繁體中文</a> |
  <a href="/docs/README.zh-CN.md">简体中文</a> 
</p>


<p align="center">
  <b>学习英语，一次敲击，一点进步；记忆不再盲目，学习更高效，开源单词与文章练习工具</b>
</p>

## 项目介绍

<https://www.bilibili.com/video/BV1QwYv6eEAS>

<!-- <p align="center">
  <a href="https://github.com/zyronon/type-word/blob/master/LICENSE"><img src="https://img.shields.io/github/license/zyronon/type-word" alt="License"></a>
  <a><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"/></a>
  <a><img src="https://img.shields.io/badge/Powered%20by-Vue-blue"/></a>
  <a href="https://hellogithub.com/repository/eb70616d65604458908fc1736e7d41fc" target="_blank"><img src="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=eb70616d65604458908fc1736e7d41fc&claim_uid=k5e4ZAqRjJEGzCW&theme=small" alt="Featured｜HelloGitHub" /></a>
</p> -->

<!-- <div align=center>
  <a href="https://trendshift.io/repositories/15226" target="_blank"><img src="https://trendshift.io/api/badge/repositories/15226" alt="zyronon%2FTypeWords | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</div> -->

## 在线访问

[https://typewords.cc](https://typewords.cc)   


<img width="1920" height="1440" alt="practice words" src="/public/imgs/words.png" />
<img width="1920" height="1440" alt="practice articles" src="/public/imgs/articles.png" />



## 功能列表

### 单词练习

- 练习模式：跟写 / 听写 / 自测 / 默写
- 智能模式：记忆曲线自动计算学习单词，并通过默写加深记忆
- 自由模式：不受限制，自行规划
- 提供音标、发音（美音、英音）、例句、短语、近义词、同根词、词源、错误统计等功能

### 背文章

- 内置经典教材书籍，也可自行添加、导入文章，提供一键翻译、译文对照功能
- 跟打 + 默写双模式，逐句输入，自动发音，让背诵更高效
- 支持边听边默写，强化记忆

### 收藏、错词本、已掌握

- 学习单词时输入错误自动添加到错词本，方便后续复习
- 可主动添加到已掌握，后续学习时自动跳过
- 可主动添加到收藏中，以便巩固复习

### 高度自由

- 丰富的键盘音效
- 可自定义快捷键
- 高度定制化的设置选项

### 简洁高效

- 简洁设计，现代化UI，无广告
- 界面清爽，操作简单
- 不强制关注任何平台

### 词库

内置了常用的 CET-4 、CET-6 、GMAT 、GRE 、IELTS 、SAT 、TOEFL 、考研英语、专业四级英语、专业八级英语等词库（仅官方网站）。
尽可能满足大部分用户对背单词的需求，也非常欢迎社区贡献更多的词库

## 运行

### 本 fork：个人场景学习版（2026-11-06）

新增入口 [`/scenarios`](http://localhost:5567/scenarios)：8 节初学者短课，包含中文解释、听力选择、短句输入、分层提示、口头自评和独立 FSRS 复习。保留原单词、文章入口，不依赖账号或付费 AI。

本分支现有 8 节短课，新增“询问对方的需求”和“约一个时间”。在“我的资料”填写工作、产品、人群或用途的中文意思及英文回答，下次新课会使用自己的句子。学习记录按表达展示最近一次开口自评。

本次功能位于 `feat/personal-scenarios` 分支。启动项目后，从首页进入“场景短课”。

- **首套 6 节入门课程**。介绍自己、工作、产品、适用人群、用途，以及请求重复、放慢和核实信息。
- **按时间安排练习**。10 分钟精简到 2 个表达，15 分钟提供标准流程，25 分钟增加一句回忆练习和一个新的对话场景。时间紧张时可以只复习两张到期卡。
- **学习记录**。听懂和表达各自建立 FSRS 复习卡，显示到期任务、最近 7 个学习日和有效活动时间，分别统计听力理解、口头自评和无英文提示的口头回答。
- **暂停与继续**。保存当前步骤、文字草稿、提示使用情况和听力选择结果，重新打开后可以继续学习。

- 8 节课程共附带 35 段英文示范 WAV，由本机 Microsoft Zira Desktop 对原创课程文本合成；点击时加载。个人称呼不在预制音频中时尝试浏览器英文语音，不可用时允许看文字继续。
- 录音需主动点击，拒绝权限也能继续。默认仅回听，选择“保留这次录音”后才存入本机；保留录音可在场景备份页回听和导出。没有自动发音评分。
- 场景记录保存在独立 IndexedDB 键中，不自动云同步。场景备份页可导出记录或含录音的 ZIP，导入先校验再明确确认替换；旧备份没有场景数据时保留当前记录。原设置页的完整 ZIP 导出也会包含场景模块。
- 同一浏览器仅一个场景标签可写入，其他标签只读，可主动接管。支持新版 Chrome / Edge 的 Web Locks API。
- 已填写对应英文回答的工作和产品资料可用于练习；课程中的书、音箱、销售等明确标注为练习样例。没有配置真实商业事实，也没有增加 AI 服务或生产部署。

本 fork 的测试使用 Node.js 24 的 TypeScript 类型擦除运行：`pnpm test`。启动方式沿用下方说明。构建使用 `pnpm build`；本地预览构建产物使用 `pnpm preview`。

#### 本次修复与验证（2026-11-06）

- 双标签来回接管同一道题时恢复最新草稿，避免暂停操作把旧答案写回。
- 完整备份在一次本地事务中恢复词库、设置、练习缓存、音频和场景数据，写入失败时整体回滚，成功后再同步远端和提示成功。
- 解压时限制实际输出大小，拦截高压缩文件超量占用内存。
- 当天新到期的卡可以加入复习队列，修复显示有卡到期却无法开始复习的问题。
- 听力答错后刷新或暂停会恢复首次选择和反馈，避免重选正确后改变成绩。
- 跳过口语题不会计入口头自评，听力选择题与无提示口头回答分别统计。
- 卡片到期时自动刷新数量和入口，返回标签页时也会重新检查。
- 25 分钟课程加入回忆与场景变体，延伸练习保留记录并避免重复更新复习时间。

修复版本 `9c85e8c` 已通过 16 项自动化测试和生产构建。Chrome 独立会话已验证双标签接管、听力错误恢复、自动到期入口、25 分钟课程，以及完整备份写入失败后的回滚和重试。全项目类型检查仍报告 66 处错误，整体类型检查待处理。

#### 注：本项目可单独运行，数据保存在本地，换设备需手动备份数据，不影响正常使用；

本项目是基于`Nuxt`开发的，需要 node 环境来运行。

1. 安装 NodeJS，参考[官方文档](https://nodejs.org/en/download)
2. 项目文件很大，推荐使用 `git clone --depth 1 --branch feat/personal-scenarios https://github.com/ethanfongpu/TypeWords.git` 命令获取本 fork 的个人学习版。直接下载
   Github 提供的 Download ZIP 功能是无法运行的
3. 在项目根目录下，打开命令行，运行`pnpm install`来下载依赖。
4. 执行`pnpm run dev`来启动项目，项目默认地址为[`http://localhost:5567`](http://localhost:5567)
5. 在浏览器中打开[`http://localhost:5567`](http://localhost:5567)  来访问项目。
6. 执行`pnpm run generate`打包项目文件
 
## 功能与建议

目前项目处于开发初期，新功能正在持续添加中，如果你对软件有任何功能与建议，欢迎在 `Issues` 中提出
如果你也喜欢本软件的设计思想，欢迎提交 `Pr`，非常感谢你对我们的支持！

## 贡献指南

[贡献准则](/docs//CONTRIBUTING.md)

如果您对本项目感兴趣，我们非常欢迎参与到项目的贡献中，我们会尽可能地提供帮助

在贡献前，我们希望您能与开发者进行沟通，以避免代码冲突

再次感谢您对项目的贡献！🎉

## ❤️ 支持 TypeWords

如果 TypeWords 对您有所帮助，欢迎赞助项目，支持服务器运行和后续开发。   
当然，不赞助也完全不影响使用。分享项目、提交反馈或贡献代码，同样是非常宝贵的支持。

<img width="300" height="390" alt="practice words" src="/public/imgs/zhifubao.png" />
<img width="300" height="390" alt="practice words" src="/public/imgs/weixin.png" />

