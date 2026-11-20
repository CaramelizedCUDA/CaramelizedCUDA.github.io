      const BLOG_POSTS = [
        {
          id: "post-macos-adapt-four-days",
          issueNo: "ISSUE 08",
          pinned: false,
          category: "engineering",
          categoryLabel: "工程与系统",
          title: "没有实体 Mac 的四天：用 VM 与多 Agent 协作完成开源项目 macOS 适配",
          subtitle: "手里没有实体 Mac，也没有停下来的理由。四天里靠云端 ARM64 macOS VM 和「主会话开发 + 独立会话复核 + 上游评审」连续合入 5 个 PR。v1.4.0 的打包与完整性验收通过。正式 ZIP 在 VM 里手动解压时提示「已损坏」，还没能做实体 Mac 对照。",
          summary: "没有实体 Mac 的四天：在云端 ARM64 macOS VM 上连续合入 yan #103 / #105 / #109 / #111 / #117 五个 PR。记录信号清理、系统工具链探测和 Edge headless（728 过 / 53 败）的实测，#111 打了 30 轮补丁仍无法完全修复后改用词法扫描的过程，访达「已损坏」的四组对照实验，以及多 Agent 如何参与开源协作。",
          date: "2026-11-20",
          readMinutes: 10,
          wordCount: "6,478 字符",
          cover: IMAGES.macosVmWorkbench,
          tags: ["macOS","多 Agent 协作","开源适配","对照实验","yan"],
          specimen: {
            eyebrow: "CAUSAL SEAM #08 · shellWord & scanWrites",
            title: "安全边界：先按词法解码，再谈判定",
            context: "macOS 命令静态筛查要拦 socketfilterfw / sysadminctl / dscl 的写操作；第一版用正则扫命令名和写选项，被独立复核会话连挑 30 轮边界绕过",
            lines: [
              { type: "ctx", text: "第一版：正则匹配命令名 + 写选项 → 缩写、引号、重定向不断冒出新绕过" },
              { type: "del", text: "沿补丁打 30 轮：fd 重定向、&> 断句、续行符拼接、PowerShell UNC……" },
              { type: "ins", text: "重写为 shellWord / argumentsAt / commandInvocations / scanWrites 结构化词法扫描" }
            ],
            proof: "38 条专项 + 815 条全量单测全绿后 Codex 仍抓出 2 条 P1——边界问题该换抽象层，而不是继续打补丁"
          },
          tldr: [
            "信号清理、系统工具链探测和 Edge 157 headless 全量端到端（728 过 / 53 败均卡渲染帧）都在云端 ARM64 macOS VM 上实测。四组对照和完整性校验确认这次问题不在打包器。手动解压正式 ZIP 时的报错可能与 Devin 的 macOS VM 环境限制有关，还需要在实体 Mac 上做对照。",
            "做 #111 是最挣扎的一个阶段。30 轮补丁依然无法完全修复引号、转义、重定向和嵌套语句带来的边界问题，最后改用 shellWord / scanWrites 做词法与重定向扫描。",
            "多 Agent 流水线跑顺：主会话实现 + 独立会话只报 P0/P1 复核 + Codex 自动评审 + 上游作者评审，四天合入 5 个 PR（#103 / #105 / #109 / #111 / #117），最快 26 分钟、最磨人滚出 39 commits。",
            "协作规范固化成铁律后零返工：一律从干净 upstream/main 建分支、显式检查署名、对外文字逐条核对中文语气、PAT 提前配齐 workflow 权限。"
          ],
          boundaryNote: "边界留底：验收基于 Devin 的 macOS VM。实体 Mac 的下载、解压与首次双击 start.command，以及 Intel 机型、其他 macOS 大版本与真实云账号均未实机覆盖。手动解压和首次打开启动器时的报错可能与 VM 环境限制有关，底层原因待查，#117 验收报告标为「待真机确认」。",
          footnote: "核验基准：Master-Norna/yan PR #103 / #105 / #109 / #111 / #117（2026-11-16 至 11-20 全部合入）；覆盖 Node 22 / 24 单测 854 通过、Chrome 全量端到端 1330 通过、v1.4.0 跨版本数据迁移与 Seatbelt 原生回归。",
          sections: [
            {
              id: "vm4d-sec-1",
              heading: "背景",
              html: `
                <p>前几天给开源项目 <a href="https://github.com/Master-Norna/yan" target="_blank" rel="noopener noreferrer">Master-Norna/yan</a> 做了一轮集中收尾的 macOS 适配。</p>
                <p>这个项目是一个本地运行的 AI 对话与工作台工具，包含 Node 桥接服务、Web 前端、MCP 桥接、命令静态筛查和 macOS Seatbelt 沙箱。上游的定位非常明确：<strong>Windows 是兼容性基准，macOS 只求「能用」，不做 Linux 适配</strong>。</p>
                <p>在上一篇<a href="https://caramelizedcuda.github.io/posts/yan-pr75-macos/" target="_blank" rel="noopener noreferrer">《给上游收一个 macOS 的尾》</a>里，PR #75 刚把基础适配和严档 Seatbelt 接进主干，同时也坦诚留了几处边界：环境工具包在 macOS 上只做了降级报错、Edge headless 还没验、Seatbelt 靠手动探针还没进回归，PAT 缺 <code>workflow</code> 权限也只是临时绕了过去。</p>
                <p>有意思的地方在于，到了这一轮，我手里依然没有一台真实 Mac。从 11 月 16 日下午 #75 合入后到 20 日早上，我靠云端 ARM64 macOS VM 和一套「主会话开发 + 独立会话复核 + 上游评审」的协作流程，连续推进并合入了 4 个适配 PR，再补了一轮面向 v1.4.0 的全面验收与测试修复 PR。</p>
                <p>如果说 #75 更像是一次「解冲突、守契约」的单点收尾，那这四天则更像一次系统性的实战演练：既有在真机缺失下做对照实验的克制，也有把正则一路打补丁到第 30 轮的教训，还有一套真正跑顺了的多 Agent 开源协作节奏。</p>
              `
            },
            {
              id: "vm4d-sec-2",
              heading: "一、这四天的时间线",
              html: `
                <p>这一轮的目标很直接：顺着 #75 留下的遗留项逐一清干净，然后在上游发布 v1.4.0（首次提供 ARM Mac 便携 ZIP）后做一次完整验收。以下均为东八区时间：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>PR</th><th>创建 → 合并</th><th>规模与提交</th><th>推进经过</th></tr></thead>
                    <tbody>
                      <tr><td><a href="https://github.com/Master-Norna/yan/pull/103" target="_blank" rel="noopener noreferrer">#103</a> Seatbelt 原生回归与信号清理</td><td>11-16 23:26 → 11-17 14:35</td><td>+488/-6，13 commits</td><td>2 轮独立复核 + Codex + 作者 2 轮评审；清掉误带入的本地配置，补齐宿主信号监听共存与失败路径清理。</td></tr>
                      <tr><td><a href="https://github.com/Master-Norna/yan/pull/105" target="_blank" rel="noopener noreferrer">#105</a> 探测系统 Python / Node / ffmpeg</td><td>11-17 16:08 → 11-17 20:10</td><td>+403/-55，6 commits</td><td>1 轮独立复核；上游作者直接在分支上补交了不可执行探测修复，1 小时内按 Codex P1 去掉 macOS 隔离环境提示并对齐 PATH 顺序。</td></tr>
                      <tr><td><a href="https://github.com/Master-Norna/yan/pull/109" target="_blank" rel="noopener noreferrer">#109</a> macOS Edge headless 结论备注</td><td>11-18 21:44 → 11-18 22:10</td><td>+1/-1，1 commit</td><td>实测 Edge 157 全量端到端（728 过 / 53 败，均卡渲染帧），拿数据定案后 26 分钟合入；同步确认 <code>brew install</code> 由上游接手（#107）。</td></tr>
                      <tr><td><a href="https://github.com/Master-Norna/yan/pull/111" target="_blank" rel="noopener noreferrer">#111</a> 防火墙/账户规则与双平台解析</td><td>11-19 07:39 → 11-19 21:49</td><td>+723/-78，39 commits</td><td>11-18 下午起与复核会话拉锯 30 轮，把正则演进为词法与重定向解析；开 PR 后再修 Codex 2 条 P1 和作者提出的变体，当晚合入。</td></tr>
                      <tr><td><a href="https://github.com/Master-Norna/yan/pull/117" target="_blank" rel="noopener noreferrer">#117</a> v1.4.0 全面验收与测试修复</td><td>11-19 23:59 → 11-20 08:51</td><td>+9/-9，2 commits</td><td>2 个复核会话分别验证端口预检清理和思绪冷读隔离；补齐令牌 <code>workflow</code> 权限后推送，CI 4/4 全绿，次日早合入。</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>5 个 PR 全部合入，节奏差异却非常明显：最快的 #109 只用了 26 分钟，最磨人的 #111 滚出了 39 个 commit。复盘下来，真正值得记录的成长集中在下面三个技术案例和一套协作习惯里。</p>
              `
            },
            {
              id: "vm4d-sec-3",
              heading: "二、三个最有意思的技术案例",
              html: `
                <h3 id="vm4d-h3-1">1. 用实测代替猜测：信号清理、系统工具链与 Edge headless</h3>
                <p>跨平台适配最怕靠脑补做决定，这轮有三次关键节点都是靠直接跑实测才把方向定死的。</p>
                <p>第一次是在 <strong>#103</strong>。我们在 #75 手动探针的基础上补齐了 macOS 严档 Seatbelt 的原生自动化回归，同时确保桥接进程被 <code>SIGTERM</code> / <code>SIGINT</code> 杀掉时，不会把后台指令留成孤儿进程。初版做法是在信号处理里杀掉子进程树后，再向自己重发同名信号走默认终止。上游作者一眼看出问题：<strong>默认信号终止不会触发 Node 的 <code>exit</code> 事件</strong>，这会绕过宿主注册的其他退出清理（比如 MCP 和无头浏览器），还会和宿主自身的信号监听打架。最终改成在信号回调里先收掉在跑的 shell，如果检测到宿主挂了持久监听就把控制权交还宿主，只在没有宿主接管时才走 <code>process.exit</code>，并补上了同进程加载多份模块共用一套退出钩子的边界。</p>
                <p>第二次是在 <strong>#105</strong>。之前 macOS 上的「环境」页只是老实提示仅支持 Windows，这一轮我们决定不再让 macOS 背 Windows 便携环境包，而是按 <code>/opt/homebrew/bin</code>、<code>/usr/local/bin</code> 和 <code>PATH</code> 探测系统里现成的 Python、Node、ffmpeg。这里有个很隐蔽的坑：一开始只检查二进制「存在且可执行」，但如果 Homebrew 里那份缺动态库或架构不匹配，版本探针会失败，逻辑却已经 <code>break</code> 了。作者直接往 PR 分支补了一个提交跳过跑不通的可执行文件；我们紧接着按 Codex 的 P1 意见，去掉了 macOS 上误导模型「往独立隔离环境里装包」的系统提示，并让 <code>PATH</code> 的目录顺序严格跟着探测结果走，保证终端里敲命令名命中的就是状态卡上显示的那一份。</p>
                <p>第三次是最干脆的 <strong>#109</strong>。之前一直把 macOS 上的 Edge headless 标成「未验」。与其一直挂着问号，不如在 VM 上用 Edge 157 原样跑一遍全量端到端：结果是 <strong>728 通过 / 53 失败</strong>，所有失败都集中在依赖渲染帧的路径上（<code>requestAnimationFrame</code> 在 macOS Edge headless 下产不出帧），而同一套参数换成 Chrome 全绿。把这组数字贴给上游后，#109 这 1 行 <code>ci.yml</code> 注释只用了 26 分钟就合并了。同时汇报的 <code>brew install</code> 沙箱实测，也让上游决定直接复用逐条出沙箱请示来修（#107），帮我们省掉了一个本来打算开的文档 PR。</p>
                <h3 id="vm4d-h3-2">2. #111 的教训：从三条正则滚雪球到 30 轮迭代</h3>
                <p>做 <strong>#111</strong> 是我这轮最挣扎的一个阶段。</p>
                <p>起因非常单纯：macOS 的命令静态筛查规则表里缺了三个系统管理命令——<code>socketfilterfw</code>（防火墙）、<code>sysadminctl</code>（账户管理）和 <code>dscl</code>（目录服务），需要做到「拦写放查」。</p>
                <p>第一版提交只改了很少的代码，用正则去扫命令名和写选项。然后把它交给了独立复核会话，只要求报 P0/P1。结果一发不可收拾：</p>
                <ul>
                  <li>复核挑出缩写选项、引号拆词、命令路径前缀和 <code>dscl</code> 参数位绕过；</li>
                  <li>修完一轮，又查出紧贴重定向、<code>fd</code> 重定向、<code>&amp;&gt;</code> 在 bash 与 dash 下的不同断句、续行符拼接选项；</li>
                  <li>再往下挖，涉及前置重定向、参数间夹杂重定向、双引号正文里的内嵌 shell 指令、以及写路径判定在 POSIX 和 PowerShell 两种语法之间的歧义。</li>
                </ul>
                <p>打了 <strong>30 轮</strong>补丁，边界问题依然没能完全修复，我最后改用 <code>shellWord</code>、<code>argumentsAt</code>、<code>commandInvocations</code> 和 <code>scanWrites</code> 做词法与重定向扫描。更扎心的是，哪怕内部复核已经跑到零 P0/P1、38 条专项和 815 条全量单测全绿，PR 一发出去，Codex 还是抓出了 2 条实打实的 P1（<code>&amp;&gt;</code> 在 dash 语法下丢了主调用、PowerShell 引号里的 UNC 输出路径解码遗漏）。</p>
                <p>复盘 #111，教训非常清楚：<strong>安全边界一旦开始涉及引号、转义、重定向和嵌套语句，正则就不再是合适的抽象层</strong>。在第三、第四轮发现绕过手法不断冒头时，就应该果断停下来，把「按词法解码再判定」作为整体设计重写一遍，而不是沿着正则一路打补丁。硬着头皮补了二十多轮才切到结构化解析，反而既耗时间又容易留下边角缝隙。</p>
                <h3 id="vm4d-h3-3">3. 没有真机怎么定性环境问题：面对「访达报已损坏」怎么做对照</h3>
                <p>四个功能 PR 合并、上游发布 v1.4.0 后，我基于干净的 <code>v1.4.0</code>（<code>f607b81</code>）在 macOS VM 上做了一次全面验收：Node 22 / 24 单测（均 854 通过、7 个 Windows 专属跳过）、类型与格式检查、Seatbelt 原生测试、Chrome 全量端到端、源码桌面操作、真实本地 CPU 模型流式对话、以及 v1.3.12 跨版本数据迁移，全都顺利通过。</p>
                <p>真正的波折出在正式 ZIP 的桌面首次启动上：</p>
                <ul>
                  <li>用命令行 <code>ditto</code> 解压正式 ZIP，包内 Node 24.22.0 启动桥接、跑通本地模型对话，一切正常；</li>
                  <li>打开 Safari 的「打开安全文件」自动解包，6,375 项文件与 ZIP 清单逐项核对完全一致，SHA-256 匹配，<code>unzip -tq</code> 通过；</li>
                  <li>但只要在访达里<strong>手动双击</strong> Safari 下载的正式 ZIP，或者双击自动解包出来的 <code>start.command</code>，系统就会直接弹出「已损坏，无法打开」，而且「隐私与安全性」里还不提供「仍要打开」。</li>
                </ul>
                <p>如果只看到这个现象，很容易误判成「v1.4.0 打包出了问题」，甚至动念头去改 <code>pack/pack.mjs</code> 或 <code>start.command</code>，或者为了“跑通”偷偷删掉下载隔离属性（macOS 的 <code>quarantine</code> xattr）。</p>
                <p>这两种做法都不对。前者会误伤正常的打包器，后者等于自己作弊。于是我做了四组对照实验，全程保留隔离属性、不改系统安全设置：</p>
                <ol>
                  <li><strong>纯文本 ZIP 对照</strong>：用 Safari 下载一个只含纯文本的小 ZIP，访达双击同样报「已损坏」；</li>
                  <li><strong>第二台 VM 交叉复验</strong>：另起一台同版本 macOS 26.6.2（25G83）VM 重复上述流程，正式包和纯文本 ZIP 全部复现；</li>
                  <li><strong>无害脚本对照</strong>：用和正式包完全相同的 <code>ditto</code> 参数打包一个只有一行 <code>printf</code> 的 <code>.command</code>，Safari 下载解包后双击照样被拦；</li>
                  <li><strong>无隔离本机原件对照</strong>：把逐字节、权限完全一致的同一个脚本直接放在本机（无下载隔离属性），双击立刻正常运行。</li>
                </ol>
                <figure class="prose-figure">
                  <img src="${IMAGES.macosFinderEvidence}" alt="正式 ZIP、纯文本 ZIP 和 Safari 下载的无害脚本均被访达拦截。同一脚本的本机原件可以运行。两种 ZIP 的提示均在两台同版本 VM 上复现。" loading="lazy" data-prose-zoom="true" role="button" tabindex="0" />
                  <figcaption>图 1 · 访达「已损坏」的实测对照。<a href="https://github.com/Master-Norna/yan/pull/117#issuecomment-7014460226" target="_blank" rel="noopener noreferrer">查看 #117 的 macOS VM 验收报告</a></figcaption>
                </figure>
                <p>四组对照和完整性校验让我确认，这次问题不在打包器，<strong>正式 ZIP 的打包与完整性通过验收</strong>。系统日志记录了 LaunchServices 在下载隔离检查阶段暂缓启动，以及 VM 侧 XProtect 分析失效。手动解压正式 ZIP、首次打开启动器时的报错可能与 Devin 的 macOS VM 环境限制有关，底层原因还没查明。我把这一项在验收报告里标为「VM 无法验收，待真机确认」。</p>
                <p>有意思的是，这轮全面验收虽然没测出产品代码的大 Bug，却顺手抓出了测试框架自身的两个隐蔽问题，最终整理成 <strong>#117</strong> 合入上游：</p>
                <ul>
                  <li><code>test/run.mjs</code> 原先在端口预检之前就清空了 <code>test/.tmp</code>。只要上一轮测试还没结束就误起了第二个 runner，后者会先把前一轮的浏览器资料和诊断文件删光，再报端口占用退出。把清理移到端口预检之后即可解决。</li>
                  <li><code>test/cold-trail-thought.mjs</code> 在 Node 24 串行全量中偶发失败。排查发现用例在桥接写盘后立即于同一浏览器源内切页，上一页 <code>beforeunload</code> / <code>pagehide</code> 写入 IndexedDB 的离页暂存把已读思绪带进了下一页，导致新页面不再发出预期的 <code>/api/chats/trail/get</code>。改为写入走 <code>127.0.0.1</code>、冷读切到 <code>localhost</code> 独立源后，诊断复现下从 13 过 1 败变为 14 过 0 败，修复后 Node 22 + Chrome 全量 1330 通过 / 0 失败。</li>
                </ul>
              `
            },
            {
              id: "vm4d-sec-4",
              heading: "三、多 Agent 与开源协作的几条实操经验",
              html: `
                <p>这四天几乎全程都在用「主会话推进实现 + 独立子会话复核 + 外部自动评审（Codex）+ 上游作者评审」的流水线。跑顺之后，有几条经验非常管用：</p>
                <figure class="prose-figure">
                  <img src="${IMAGES.macosAgentWorkflow}" alt="主会话实现，独立会话复核 P0/P1，再提交 PR，由 Codex 和上游作者评审。两阶段的评审意见都回到主会话跟进验证。" loading="lazy" data-prose-zoom="true" role="button" tabindex="0" />
                  <figcaption>图 2 · 多 Agent 与开源评审的分工和反馈路径</figcaption>
                </figure>
                <ol>
                  <li><strong>推进阶段让独立复核聚焦 P0/P1，推上游后再按需处理影响体验的 P2</strong><br />主会话写久了容易产生盲区，拉一个全新的独立会话只拿 diff 和仓库上下文做复核，非常容易抓出竞态、清理遗漏和边界条件（比如 #103 的信号监听细节、#117 里独立会话甚至通过延后保存确认把思绪冷读的竞态稳定复现了出来）。在推进阶段明确要求「只报 P0/P1、不改代码、不推分支」，并不是彻底放弃 P2/P3，而是为了在效率与质量之间做阶段性取舍：先防止内部复核滑向无休止的风格挑刺，把主干稳住；等推送到上游后，面对作者评审或外部 review 提出、确实影响使用体验的 P2 问题，再认真跟进修复。</li>
                  <li><strong>连续打补丁时要及时止损、换思路</strong><br />PR #111 的 30 轮说明，复核会话很擅长找边界反例，但它默认会在你现有的实现方式上持续挑错。如果连续两三轮都在修同一类边界，主导者必须主动喊停，决定是换数据结构/解析方式，还是接受范围边界，不要陷入无限打地鼠。</li>
                  <li><strong>尽早把实测结果同步给上游，别闷头做完再聊</strong><br />无论是 <code>brew install</code> 的定位、#109 的 Edge 实测数据，还是 #105 上游直接往分支补 commit，本质上都是把「单向提 PR」变成了「和作者一起把问题推进落地」。很多时候一条带数据的短评论，比写完一整份大 PR 更有价值。</li>
                  <li><strong>把协作规范固化成硬规则，顺手还清工具链旧账</strong><br />刚起步做 #103 时踩过两个很尴尬的坑：一是基于 fork 的 <code>main</code> 建分支，把本地的 <code>18787</code> 端口约定带进了 PR diff；二是有一轮行内回复意外发出了非中文内容。之后直接立了四条铁律：
                    <ul>
                      <li>向上游提 PR 一律从干净的 <code>upstream/main</code> 建分支；</li>
                      <li>显式检查提交作者与邮箱，不夹带无关署名；</li>
                      <li>对外文字发前逐条核对中文与语气，不生搬硬套双语模板；</li>
                      <li>个人访问令牌（PAT）提前配齐所需权限——#75 时因为缺少 <code>workflow</code> scope 靠 Git Data API 绕了一次路，#117 基线含 <code>ci.yml</code> 改动又撞上同一道墙，这次直接补齐权限才算彻底解决。</li>
                    </ul>
                    这几条定下来之后，后面 4 个 PR 再没出过一次流程返工。</li>
                </ol>
              `
            },
            {
              id: "vm4d-sec-5",
              heading: "四、写在最后",
              html: `
                <p>截至 11 月 20 日早上，这轮计划里的 macOS 适配任务和 v1.4.0 全面验收已经全部收尾合入。</p>
                <p>当然，基于 VM 的验收也有明确边界：实体 Mac（特别是真实桌面环境下的下载、解压与首次双击 <code>start.command</code>）、Intel 芯片机型、其他 macOS 大版本以及真实云厂商账号，都还没有实机覆盖。这些未测范围已经原样写进了挂在 #117 下方的验收报告里——诚实地标出「测了什么」和「没法测什么」，本身就是跨平台维护的一部分。</p>
                <p>对我来说，这四天最大的收获不只是合入了 5 个 PR，而是验证了一套在资源受限（没有真机）的条件下，依然能靠<strong>严谨的对照实验、小步快跑的 PR 节奏、以及分工清晰的独立复核</strong>，把开源跨平台适配稳稳落地的工程方法。</p>
              `
            },
            {
              id: "vm4d-sec-6",
              heading: "后记",
              html: `
                <p>写完这篇复盘，最后想单独谢谢这次全程帮上大忙的 Devin。</p>
                <p>哪怕只是在 Devin Pro 有限的资源配额下，它提供的近乎原生的 macOS VM，也让我这个手头没有实体 Mac 的人，拥有了接近实机的开发和验收环境——把以前在 Windows 上只能靠翻文档、盲等 GitHub CI 碰运气的问题，真正落到了可复现、可排查的现场里。</p>
                <p>这段感谢并不是商单，只是用下来确实能感受到团队在认真解决开发者的痛点。很多时候我觉得，Devin 的设计基点不只是“做一个 Agent 帮单个开发者在本地写代码”，而是站在更完整的工程链条上，去思考团队如何面向真实用户可靠地完成开发、部署、上线、更新与维护。至少我认为，在这个 AI 高速发展、不断冲击人们固有认知的时代里，Cognition 团队交出了属于他们自己独特角度的思考与答案；整个产品的设计思路和规划，相比起追逐潮流的各类 AI slop，显然包含着他们一路坚持着的审美与设计哲学。加上 Devin Desktop 本身很出色的界面设计，这四天在里面持续推进项目的过程，我其实一直挺享受的。谢谢你们。</p>
              `
            }
          ]
        },
        {
          id: "post-agent-second-pass",
          issueNo: "ISSUE 07",
          pinned: false,
          category: "essays",
          categoryLabel: "设计与随笔",
          title: "我审核了 PR，但没审核 Agent 的第二次发挥",
          subtitle: "给一直在用的 Antigravity 美化补丁提了一个修复分屏指标胶囊的小 PR（#17）。第一次发 PR 时我照例人工逐字审完才手动发布；偏偏在发现右侧边栏旁聊（Side Question /「支线提问」）漏修、让 Agent 追推补丁并顺手通过 API 同步 PR 正文的“第二次发挥”里，全套自动化核验一路绿灯，网页上却因为裸写 #1 / #2 / #3 炸出了一排误关联历史 Issue 的蓝链。",
          summary: "复盘 chuanban-antigravity-theme-patch PR #17 的一段插曲：首版 PR 人工逐字审完发布后，发现右侧边栏旁聊（Side Question）因会话容器与输入框是同层兄弟节点而漏修；追补代码后顺手让 Agent 通过 API 同步 PR 正文，全绿验收（含左手核对右手的 BODY_EXACT_MATCH: True）下却因裸写 #1/#2/#3 触发 GitHub 自动关联蓝链与他人 Issue 时间线留痕。",
          date: "2026-11-17",
          readMinutes: 4,
          wordCount: "3,384 字符",
          cover: IMAGES.issue07SmugAgent,
          tags: ["AI Agent","Antigravity","开源协作"],
          specimen: {
            eyebrow: "CAUSAL SEAM #07 · PR Body Sync & GFM Autolink",
            title: "左手核对右手的 BODY_EXACT_MATCH 与 #1 蓝链误关联",
            context: "首版 PR 是人工审完才发的；第二次让 Agent 用 API 顺手追更说明时，只核对了 Markdown 原文，没看 GitHub 网页渲染出来的样子",
            lines: [
              { type: "ctx", text: "BODY_EXACT_MATCH: True  // 线上正文与本地同一份带坑草稿逐字一致" },
              { type: "del", text: "Before #1/#2, After #1  → 被 GitHub 渲染成历史 Issue 蓝链并留下引用记录" },
              { type: "ins", text: "改为「图 1 / 图 2」覆盖重发，对外写入不能省掉人眼终审" }
            ],
            proof: "PR #17 页面恢复干净（旁聊胶囊 10/10 单测通过），但误触发的 mentioned 记录已留在他人 Issue 时间线上"
          },
          tldr: [
            "漏修根因各异：人眼因左右并排外观把「旁聊（Side Question）」与「拆分对话」合并了同类项；底层里旁聊却是拥有独立 <cascadeId>.db 且可转为独立主对话的侧栏标签页，其消息区与输入框为同层兄弟节点，导致只往祖先查找的 box.closest(\x27[data-cascade-id]\x27) 扑空。",
            "全绿核验盲区：追补代码并让 Agent 通过 API 同步 PR 正文后，BODY_EXACT_MATCH: True 只是拿线上正文与本地同一份草稿“左手核对右手”；正文里裸写的 #1 / #2 / #3 被 GitHub 渲染成历史 Issue 蓝链，还在他人 Issue 时间线留下了删不掉的 mentioned 记录。",
            "协作边界教训：无论是早年读半截贡献指南就骄傲声明“全程无人类监管”遭全组织拉黑，还是这次顺手改文档的“第二次发挥”，Agent 都会拿不完整的信息给自己验收通过；越过本地边界的对外写入不能省掉人眼终审与渲染态护栏。"
          ],
          boundaryNote: "边界留底：本文记录 Anarcadia/chuanban-antigravity-theme-patch PR #17 提交与追补过程中的真实排障与协作插曲；线上 PR 正文已即时改为「图 1 / 图 2」，但 GitHub 首次解析产生的跨 Issue 引用时间线记录不可撤回。",
          footnote: "核验基准：Anarcadia/chuanban-antigravity-theme-patch PR #17（a5cde5a + dc266bb，2026-11-17）；覆盖 split-pane-metrics.test.mjs 10/10 单测与主对话 × 右侧支线提问双会话实机 CDP 核验。",
          sections: [
            {
              id: "agent2-sec-1",
              heading: "一、一个“至少对我自己有用”的小 PR",
              html: `
                <p>今天给我一直在用的 Antigravity 美化组件（<a href="https://github.com/Anarcadia/chuanban-antigravity-theme-patch" target="_blank" rel="noopener noreferrer"><code>Anarcadia/chuanban-antigravity-theme-patch</code></a>）提了一个 PR（<a href="https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/17" target="_blank" rel="noopener noreferrer"><code>#17</code></a>），用来修复底部显示会话速率与上下文水位的小胶囊“只在主对话里显示、到了其它分屏对话里就消失”的问题。</p>
                <p>在动手改之前，我也问过自己：真的会有人经常在 Antigravity 里同时开着好几个 session 分屏干活吗？老实说我不清楚——后来放进 PR 证据里的“四窗同屏认证”，也只是为了验证极端多窗口下这套修复依然稳当。但转念一想，我自己平时偶尔确实会并排开两个 session，或者在主对话旁边顺手拉起一个旁聊（Side Question）；既然这项修复至少对我自己的日常使用有真实价值，我还是把它整理干净提了上去。</p>
                <p>然而百密一疏：整个第一轮修复过程里，我并没有特意让 Agent 去检查“旁聊”里的胶囊表现；确认多 session 分屏一切正常后，我就直接把 PR 发了出去——直到准备写一段案头短记复盘这件事时，才突然反应过来：<strong>等等，针对旁聊的胶囊，是不是根本没修？</strong></p>
              `
            },
            {
              id: "agent2-sec-2",
              heading: "二、为什么人和 Agent 同时漏掉了旁聊？",
              html: `
                <p>回想起来，修复中途我和 Agent 居然谁都没多看旁聊一眼，但两边“视而不见”的原因完全不同：</p>
                <ul>
                  <li><strong>对人来说，是视觉直觉的合并同类项</strong>：虽然我平时顺手就会开旁聊，心里也明白“双分屏开两个 session”和“开一个旁聊”在操作路径与会话定位上不是一回事，但它们在界面上长得实在太像了——都是左右并排两栏对话、底下都挂着同款输入框，大脑下意识就把它们当成了同一种东西。</li>
                  <li><strong>对 Agent 来说，则是界面承载架构与 DOM 结构上的两码事</strong>：Antigravity 的旁聊（界面上的「支线提问」/ <code>Side Question</code>）虽然靠鼠标点按钮就能顺手拉起，从外观上看和普通双分屏差不多，但在底层设计上它并不是通过主工作区「拆分对话」切出来的分屏，而是运行在右侧边栏（Side Panel）里的独立标签页。</li>
                </ul>
                <p>论会话定位，<strong>旁聊本质上是一个与主 session 同级别的独立会话</strong>——有自己的会话数据库（<code>&lt;cascadeId&gt;.db</code>）、后续消息与工具调用记录，甚至还能直接提升成完整的主对话（<code>Promote to conversation</code>）——与主工作区「拆分对话」出来的一组多 session 分屏完全是两套机制。落到页面 DOM 上，两套机制的面板结构恰好长反了：</p>
                <ul>
                  <li>在<strong>主对话与「拆分对话」分屏</strong>里，承载会话 UUID 的容器（<code>conversation-view[data-cascade-id]</code>）与输入框是<strong>外层包内层的父子（祖先—后代）关系</strong>，顺着输入框调用 <code>box.closest(&#39;[data-cascade-id]&#39;)</code> 往上找到最近的祖先容器，就能稳稳拿到当前面板的会话 ID；</li>
                  <li>而在<strong>右侧边栏的旁聊标签页</strong>里，挂着 <code>data-cascade-id</code> 的消息区（<code>side-question-tab-conversation</code>）和输入框所在的 <code>side-question-tab-composer</code> 却是<strong>同层并列的兄弟节点</strong>。</li>
                </ul>
                <p>这就造成了很戏剧性的结果：尽管第一版补丁已经把胶囊节点挂进了旁聊输入框，却因为 <code>box.closest(&#39;[data-cascade-id]&#39;)</code> 只往祖先爬、不看同层兄弟而扑了空；又因为当时页面同时存在两个输入框，第一版为防止分屏混排串染而加上的 <code>totalBoxes === 1</code> 限制拦断了向全局 URL 的回退，拿不到会话 ID 的旁聊胶囊便一直停留在 <code>display: none</code> 的隐藏状态。</p>
                <figure class="prose-figure">
                  <img src="${IMAGES.pr17FollowupDecision}" alt="发现旁聊漏修后，决定趁 PR 尚未合入直接追推补齐" loading="lazy" data-prose-zoom="true" role="button" tabindex="0" />
                  <figcaption>图 1 · 发现旁聊漏修后，决定趁 PR 尚未合入直接追推补齐</figcaption>
                </figure>
              `
            },
            {
              id: "agent2-sec-3",
              heading: "三、“左手核对右手”的全绿报告，与第二次改动的出错",
              html: `
                <p>发现漏网之鱼后，返工补代码本身非常顺利：给旁聊补上同容器兄弟节点的 UUID 解析、跑完 <code>10/10</code> 单元测试与两轮代码审查、实机确认主对话与右侧旁聊的胶囊各自独立亮起，一气呵成。随后我便顺嘴让 Agent 帮我把补充后的说明与脱敏对比图同步更新到线上 PR 正文里。</p>
                <p>几分钟后，模型信心满满地向我汇报“一切正常，PR 已经更新好了”，还附上了极其详尽的核验清单：语法检查通过、哈希对齐、远程截图全部 <code>HTTP 200</code>，甚至连 <code>TITLE_EXACT_MATCH: True</code> 和 <code>BODY_EXACT_MATCH: True</code> 都逐字比对无误。</p>
                <figure class="prose-figure">
                  <img src="${IMAGES.pr17GreenVerification}" alt="Agent 给出的全绿验收清单——连 BODY_EXACT_MATCH 都严格为 True" loading="lazy" data-prose-zoom="true" role="button" tabindex="0" />
                  <figcaption>图 2 · Agent 给出的全绿验收清单——连 BODY_EXACT_MATCH 都严格为 True</figcaption>
                </figure>
                <p>但当我出于习惯，切回浏览器里的 GitHub PR 页面做最后一眼肉眼验收时，眼前的画面让我感到猝不及防：</p>
                <p>为了区分多组截图，模型在 <code>## Evidence</code> 的列表标题里裸写了 <code>Before #1/#2</code>、<code>After #1</code>、<code>Before #3 vs After #2</code>。而在 GitHub Flavored Markdown 里，任何没包进反引号的 <code>#数字</code> 都会被直接解析成对本仓库历史 Issue 或 PR 的引用链接，前端还会贴心地把对应 Issue 的完整标题内联展开成一整串高亮蓝字——于是我的截图证据栏瞬间变成了对仓库 <code>#1</code>、<code>#2</code>、<code>#3</code> 的大型误关联现场，顺带往别人的历史 Issue 时间线里打下了好几条 <code>mentioned this pull request</code> 的留痕。至于那个 <code>BODY_EXACT_MATCH: True</code>？它只是拿线上 PR 正文去和本地同一份带坑的草稿“左手核对右手”，在这个检查逻辑下当然一字不差（这个检查自然有实际意义，只是在这个场景下就确实没什么用）。</p>
                <figure class="prose-figure">
                  <img src="${IMAGES.pr17AutolinkAccident}" alt="打开 GitHub 页面肉眼复核，满屏误关联 #1 / #2 / #3 的蓝链现场" loading="lazy" data-prose-zoom="true" role="button" tabindex="0" />
                  <figcaption>图 3 · 打开 GitHub 页面肉眼复核，满屏误关联 #1 / #2 / #3 的蓝链现场</figcaption>
                </figure>
                <p>我赶紧让它把所有 <code>#1 / #2 / #3</code> 改成中文的“图 1 / 图 2”，重新覆盖线上正文，PR 页面这才恢复干净。但能改回来的只有我自己这份正文：那几条已经打进别人历史 Issue 时间线里的 <code>mentioned this pull request</code> 留痕，并不会因为我删掉了引用就跟着消失。</p>
              `
            },
            {
              id: "agent2-sec-4",
              heading: "四、吃一堑再吃一堑？",
              html: `
                <p>整件事最让我哭笑不得的地方在于：<strong>最初那版 PR 正文，明明是我自己逐段审完、亲手复制到 GitHub 上点下发布的。</strong></p>
                <p>这也是我一直遵循的协作铁律——任何会产生外部副作用的动作，发出前必须经过人工把关。但讽刺的是，模型在最受重视的“第一次发布”时规规矩矩，反倒在看起来毫无技术含量的“第二次顺手改个文档”上给了我一个猝不及防的“惊喜”。</p>
                <p>这让我想起以前的一段经历。先前我用自制的 Agent 壳子做自动化测试（让模型自己去开源仓库找 Bug 并提 PR），当时经验不足，既没配硬性的拦截 Hook，只是以为在提示词里叮嘱一句，模型就能懂事。结果模型一头扎进别人的仓库里，先是直接抢了别人正在跟进的 Issue 来提 PR；然后面对仓库里白纸黑字写着“必须披露 AI 使用情况，<strong>严禁提交完全由 AI 生成且无人类接管的 PR</strong>”的贡献指南，它居然在 PR 正文最后一段工工整整、甚至透着几分骄傲地写上了：</p>
                <blockquote><p>“本 PR 由 AI 完全生成，且全程无人类监管。”</p></blockquote>
                <p>结局毫无悬念：不仅 PR 被秒关，我自己的账号也被那个仓库所属的整个组织直接拉黑（Block）了。</p>
                <p>事后我问 Agent 为什么会这样，它的解释是：读仓库贡献指南时内容被截断了，只读到“需要披露 AI 使用情况”这半句；而直到推送 PR 前，它都没想过回头把规范文档读完。在它眼里，这套流程完全合理。我也从没想过会出现这种情况：文档读到一半被截断，它却认定自己已经读完了。</p>
                <p>回头再看今天的 <code>BODY_EXACT_MATCH: True</code>，其实是同一类问题：Agent 拿手里不完整的信息给自己验收。一次是只读了半份规范，一次是只比对了文本、没看渲染结果，然后两次都真心认为一切正常。</p>
                <p>今天的 <code>#1</code> 乌龙虽然没有那时候那么严重，但它又给我上了一节课：<strong>在自己的本地设备或私人仓库里，Agent 犯浑往往只是回滚一条命令、重跑一次脚本的小事；可一旦动作越过边界，涉及到他人的仓库、维护者的通知栏与公共协作记录，试错的代价就不再是自己一个人兜得住的了。</strong></p>
                <p>说到底，给“第一次提交”设防很容易，难的是对“主体已经审过了，顺手让它补个小尾巴”的<strong>第二次发挥</strong>保持同样的警惕。口头叮嘱从来不等于工程护栏——无论是把对外写入收口到预览确认之后，还是针对 GitHub 这类平台加上渲染结果的二次校验（比如检查 <code>body_html</code> 里的实际 <code>issue-link</code> 数量），唯有把 Agent 的运行逻辑和平台副作用都摸透，人和 AI 一起交出去的东西，才算得上真正负责任的产物。</p>
              `
            }
          ]
        },
        {
          id: "post-building-caramelized-notes",
          issueNo: "ISSUE 06",
          pinned: false,
          category: "essays",
          categoryLabel: "设计与随笔",
          title: "搭建「焦糖笔记」的踩坑记录：路由、滚动与视口",
          subtitle: "把 Caramelized Notes · 焦糖笔记从纯客户端单页原型打磨成可长期维护的静态技术博客，真正费工夫的不是堆砌动效，而是补齐 /posts/<slug>/ 独立路由与全文 RSS 订阅源、驯服前进与 popstate 后退的滚动状态、把排版抽屉收进视口安全区，以及消除深浅底纸切换时的不同步残影——这些在代码里不起眼、却切实影响阅读体验的问题。",
          summary: "复盘「焦糖笔记」从单页原型到多页静态站（8a9f9e8 / f4bba99 / ba78fd6）的工程收口：补齐 /archive/ 与 /posts/<slug>/ 独立路径及全文 RSS 2.0，统一正向切页与浏览器原生后退的确定性置顶契约，将「Aa 排版」抽屉重构为首尾锁死的三段式视口布局，并排查跨平台缺字、封面裁边、View Transition 双底纸同步切换与本机 CDP 120ms 误注入插曲。",
          date: "2026-11-17",
          readMinutes: 5,
          wordCount: "2,923 字符",
          cover: IMAGES.issue06DualWashi,
          tags: ["静态博客","前端工程","路由与视口","View Transition"],
          specimen: {
            eyebrow: "CAUSAL SEAM #06 · Routing, Scroll & Viewport",
            title: "单页顺滑感与静态站确定性布局、状态契约的对齐",
            context: "补齐独立路由与全文 RSS 后，收口前进/popstate 后退滚动残留、排版抽屉视口裁切与双底纸切换残影",
            lines: [
              { type: "ctx", text: ".customizer-drawer { display: flex; flex-direction: column; max-height: calc(100dvh - 24px); }" },
              { type: "del", text: "整块抽屉通体滚动截断底部按钮 + popstate 原生滚动恢复把标题顶进吸顶栏下" },
              { type: "ins", text: ".drawer-head/.drawer-foot { flex-shrink: 0 } + scrollRestoration = \x27manual\x27 确定性归零" }
            ],
            proof: "/archive/ 与写作时全部 5 篇 /posts/<slug>/ 硬刷新零 404 + RSS 2.0 全文输出 + 正向/Back 归零无遮挡 + View Transition 同步切换（8a9f9e8 / f4bba99 / ba78fd6）"
          },
          tldr: [
            "静态可引用性：拆出 /archive/ 与每篇独立的 /posts/<slug>/ 静态目录消除直连硬刷新 404，并生成带 <content:encoded> 全文的标准 /rss.xml。",
            "滚动与视口契约：开启 history.scrollRestoration = \x27manual\x27 将正向切页与原生 Back 统一收口到渲染后确定性归零；「Aa 排版」抽屉改为首尾 flex-shrink: 0、中部独立滚动的三段式弹性布局。",
            "渲染暗礁与站外支线：内联 SVG 替换跨平台缺字字符、信箱式留边防封面裁字、View Transition 消除深浅底纸切换残影，并顺手揪出本机主题补丁按 127.0.0.1 误注入预览页的上游 Bug（#11 / PR #12）。"
          ],
          boundaryNote: "边界留底：当前线上保留「焦糖和纸 / 暖炭暗夜」两套底纸；浏览器原生后退统一回到页面顶部（history.scrollRestoration = \x27manual\x27），不恢复离开前的滚动位置；ISSUE 编号按成刊批次递增而非事件发生日期排序；窄屏真机折行与 <lastBuildDate> 构建时间戳仍需随日常发刊持续核对。",
          footnote: "核验基准：Caramelized Notes 建站演进提交 8a9f9e8、f4bba99、ba78fd6（2026-11-16 ~ 2026-11-17）；外链排障关联 Anarcadia/chuanban-antigravity-theme-patch Issue #11 / PR #12。",
          sections: [
            {
              id: "notes-sec-1",
              heading: "一、既要单页的阅读手感，也要静态站的可引用性",
              html: `
                <p>最初把 <a href="https://caramelizedcuda.github.io/" target="_blank" rel="noopener noreferrer">焦糖笔记</a> 跑起来时，整站是一个纯客户端切换状态的单页应用（SPA）：首屏左七右三排开刊头导语与 <code>Ex Libris · 2026</code> 藏书票，下方直接露出主打文章与 <code>CAUSAL SEAM</code> 切面预览；点进正文还能随时切换「关键切面 / 主题插画 / 纯净无图」三态视图，或在 <code>15–21px</code> 字号、四套正文字体、三档行高（<code>1.65 / 1.85 / 2.10</code>）与三档版心（<code>640 / 740 / 880</code>）之间微调。</p>
                <p>但第一版上线后很快暴露出一个明显短板：<strong>全站所有视图共用根路径 <code>https://caramelizedcuda.github.io/</code>，没有独立文章 URL，也没有 RSS。</strong></p>
                <p>技术排障文章天然是要被贴进 GitHub Issue、PR 评审或聊天窗口里引用的。别人点开链接却只能落回首页自己翻找，内容的外部生命力就断了一半。第一轮改造先把路由地基补齐：</p>
                <ol>
                  <li><strong>拆出干净的静态路径</strong>：将归档列表独立到 <a href="https://caramelizedcuda.github.io/archive/" target="_blank" rel="noopener noreferrer"><code>/archive/</code></a>，每篇长文映射到独立的 <code>/posts/&lt;slug&gt;/</code> 目录（例如 <a href="https://caramelizedcuda.github.io/posts/yan-pr75-macos/" target="_blank" rel="noopener noreferrer">《给上游收一个 macOS 的尾》</a> 与 slug 精简后的 <a href="https://caramelizedcuda.github.io/posts/codex-remote-provider/" target="_blank" rel="noopener noreferrer">《Codex Remote 踩坑》</a>），确保任意路径直接打开或 <code>Ctrl+Shift+R</code> 硬刷新都不会触发 GitHub Pages 的 404。</li>
                  <li><strong>补齐全文 RSS 2.0</strong>：在首页作者名片与全站页脚挂出订阅入口，构建生成标准 <a href="https://caramelizedcuda.github.io/rss.xml" target="_blank" rel="noopener noreferrer"><code>/rss.xml</code></a>，连同 <code>&lt;category&gt;</code> 与 <code>&lt;content:encoded&gt;</code> 全文一并输出，让习惯用阅读器追更的同行不必频繁刷网页。</li>
                </ol>
              `
            },
            {
              id: "notes-sec-2",
              heading: "二、滚动条与视口边界：最容易漏掉的隐性状态机",
              html: `
                <p>独立路由跑通之后，紧接着踩到了单页接管导航时最经典的滚动条陷阱，而且是分两拍暴露出来的：</p>
                <ul>
                  <li><strong>第一拍（正向跳转残留偏移）</strong>：从 <a href="https://caramelizedcuda.github.io/archive/" target="_blank" rel="noopener noreferrer">文章归档页</a> 滚到底部点开 <a href="https://caramelizedcuda.github.io/posts/spawn-enoent/" target="_blank" rel="noopener noreferrer">《一次 spawn ENOENT 的完整排查》</a>，或者读完一篇在文末点 <code>NEXT · 下一篇</code> 切到 <a href="https://caramelizedcuda.github.io/posts/macos-sandbox/" target="_blank" rel="noopener noreferrer">《给 AI Agent 补齐 macOS 静态沙箱》</a> 时，新页面直接继承了上一页的 <code>scrollY</code> 停在半腰（比如 <code>29%</code> 处），文章顶部的刊号与大标题全被吸顶导航栏盖住。</li>
                  <li><strong>第二拍（原生后退与吸顶栏打架）</strong>：给正向跳转补上置顶逻辑、并为右侧「章节导览」锚点留出顶部安全间距后，点页面左上角的「← 返回文章归档」已经能干净回到顶部；偏偏按<strong>浏览器原生后退键（Back）</strong>退回 <a href="https://caramelizedcuda.github.io/archive/" target="_blank" rel="noopener noreferrer"><code>/archive/</code></a> 时，浏览器自带的滚动恢复时机与前端视图渲染撞车，导致「文章归档」标题刚好被吸顶导航栏遮住上半截。</li>
                </ul>
                <p>把前进切页、文末上下篇与 <code>popstate</code> 原生后退统一收口到路由渲染完成后的确定性归零逻辑里，这处半行遮挡才算彻底消失。代价是后退不再恢复离开前的阅读位置：在归档页滚到中段点进文章、再按 <code>Back</code>，回到的是归档页顶部。在归档篇目还不多的现阶段，这比标题被导航栏吃掉半截更容易接受。</p>
                <p>另一个同类边界坑出在阅读页右上角的 <strong>「Aa 排版」抽屉</strong>。因为抽屉里依次塞进了底纸主题、四套字体、字号滑块、行距、版心宽度、新增的「灵动 / 克制 / 静态」动效档位以及实时排版预览框，起初整个抽屉是一个通体滚动容器：在常规笔记本视口高度下刚点开，「完成设置 / 恢复推荐」两个按钮刚好被屏幕下沿截掉大半截；往下滚虽然能点到按钮，顶部的标题和 <code>×</code> 关闭键又被滚出了画面。最终按三段式弹性布局把顶栏和底栏锁死（<code>flex-shrink: 0</code>），只让中间参数区独立滚动并给底部的「排版预览」留足下边距，任何视口高度下都能一眼看到首尾。</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">CSS</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>/* 排版抽屉：从整块滚动容器拆为首尾固定、中部独立滚动 */
.customizer-drawer {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 24px);
  overflow: hidden;
}
.drawer-head,
.drawer-foot { flex-shrink: 0; }
.drawer-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }</code></pre>
                </div>
              `
            },
            {
              id: "notes-sec-3",
              heading: "三、跨环境渲染与主题过渡里的四个细节暗礁",
              html: `
                <p>除了路由和布局，连续三轮线上巡检还顺手抓出了几处“写代码时不易察觉、真机细看格外扎眼”的小毛刺：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>现象切面</th><th>触发根因</th><th>最终收口方式</th></tr></thead>
                    <tbody>
                      <tr><td><strong>画卷按钮显示缺字方框 <code>☒</code></strong></td><td><a href="https://caramelizedcuda.github.io/" target="_blank" rel="noopener noreferrer">首页</a>「卷首画卷 · 展开」与弹窗关闭键使用了依赖特定系统字体的生僻字符</td><td>替换为内联 SVG 绘制的四角星与圆形关闭键，不再依赖系统字体，彻底消除豆腐块</td></tr>
                      <tr><td><strong>归档缩略图底部裁字</strong></td><td><a href="https://caramelizedcuda.github.io/archive/" target="_blank" rel="noopener noreferrer"><code>/archive/</code></a> 双栏卡片圆角容器裁掉了 <a href="https://caramelizedcuda.github.io/posts/yan-pr75-macos/" target="_blank" rel="noopener noreferrer">ISSUE 05</a> 封面底部的 <code>yan #75</code></td><td>改为黑底留边（信箱式）排版，为底部说明文字留出安全内边距</td></tr>
                      <tr><td><strong>窄列表格代码断词尴尬</strong></td><td><a href="https://caramelizedcuda.github.io/posts/macos-sandbox/" target="_blank" rel="noopener noreferrer">ISSUE 03</a> 早期对比表首列过窄，<code>screenUnreviewable</code> 末尾字母 <code>e</code> 单独折行</td><td>重构第 1 节为条目列表，将长标识符改为单行内联代码徽章呈现</td></tr>
                      <tr><td><strong>深浅底纸切换闪过低对比度帧</strong></td><td>「焦糖和纸」与「暖炭暗夜」切换时，文字与背景各自的 CSS <code>transition</code> 速率不同步</td><td>改用整页统一的 View Transition 交叉同步过渡，文字、边框与纸面同拍切换</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>此外还有一处文案与实现的对齐：线上版本将底纸精简为「焦糖和纸 / 暖炭暗夜」两套后，<a href="https://caramelizedcuda.github.io/" target="_blank" rel="noopener noreferrer">首页「卷首画卷」弹窗</a>的博物学底纹说明里还残留着旧稿的“融入\u4e09套主题纸面肌理”。核对时顺手把文案同步回“两套”，避免留下一处言行不一的细节破绽。</p>
              `
            },
            {
              id: "notes-sec-4",
              heading: "四、建站途中的支线排障：120ms 后的“白底白字”",
              html: `
                <p>最有意思的一段插曲发生在 <code>11.16</code> 本地预览本站的时候（已留档于<a href="https://caramelizedcuda.github.io/" target="_blank" rel="noopener noreferrer">首页「案头短记」</a>）：页面刚刷出来时标题明明正常，<strong>120ms 之后却突然变成白底白字“隐身”了</strong>。</p>
                <p>起初以为是站内主题脚本写串了，排查下去才发现锅在站外——本机跑着的 Antigravity 主题补丁在筛选 CDP（Chrome DevTools Protocol）目标时，只判断了 <code>127.0.0.1</code> 地址前缀，把内置浏览器里正在本地预览的焦糖笔记也当成宿主界面，强行注入了 <code>body</code> 配色与汉化词典（外加 <code>NewDocument</code> 阶段 <code>documentElement</code> 空指针）。给补丁加上宿主独占指纹的三态门禁并反哺上游（<a href="https://github.com/Anarcadia/chuanban-antigravity-theme-patch" target="_blank" rel="noopener noreferrer"><code>Anarcadia/chuanban-antigravity-theme-patch</code></a> 的 <a href="https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/11" target="_blank" rel="noopener noreferrer">Issue #11</a> / <a href="https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/12" target="_blank" rel="noopener noreferrer">PR #12</a>）之后，本地预览才恢复清净。用写博客的过程反过来抓出一个上游工具链的 Bug，也让我真切体会了一回和他人协作的感觉（哪怕只是我在给别人提一个小的bug修复PR而已）。</p>
              `
            },
            {
              id: "notes-sec-5",
              heading: "五、边界与留白：把急不来的东西留给时间",
              html: `
                <p>这几轮打磨下来，<a href="https://caramelizedcuda.github.io/" target="_blank" rel="noopener noreferrer">焦糖笔记</a> 的工程骨架已经基本稳住：写作时的 5 篇长文与 7 则案头短记各有落处，搜索、分类筛选、阅读页「☆ 收藏备忘」与归档页「已收藏」实时联动、代码块复制提示都跑在稳定的轨道上。</p>
                <p>至于美术层面的下一步——无论是结合「灵动 / 克制 / 静态」开关去做和纸上的窗影漫射，还是尝试把纸面拼贴肌理与物语式的编号字牌、几何留白慢慢融进边缘背景——我都不打算急于求成。这两个方向极吃分寸感，在手头的文章厚度与视觉母题还没攒够之前硬堆符号，只会冲淡现在好不容易设计自洽的博客网站风格。</p>
                <p>先把工程地基收干净，接下来就回到「研究 → 总结 → 发布」的日常节奏里：多破几个实在的真问题，让学习、研究和工程经验去喂养后面的版面与审美。</p>
              `
            }
          ]
        },
        {
          id: "post-yan-pr75-macos",
          issueNo: "ISSUE 05",
          pinned: false,
          category: "architecture",
          categoryLabel: "架构与工具",
          title: "给上游收一个 macOS 的尾：#75 解冲突、接沙箱与把证据做实",
          subtitle: "一个并行推进中的开源 PR，不仅需要注意写新代码，而且当上游先你一步改了同一块地基时，要进行及时的处理。这篇记录一次「不扩大功能范围」的收尾：合并最新 main、把 macOS 严档的 sandbox-exec 写盘约束重新挂回现行执行链路、统一文档与界面口径，以及把验证证据做成分层的、经得起复核的东西。",
          summary: "记录「言」PR #75 合入前的收尾实战：解冲突时完整保留上游新增的 scopedRoute 存储根代次校验与 onMove 通知，将 macOS 严档 /usr/bin/sandbox-exec (seatbelt) 写盘白名单挂回三条 spawn 路径，用 watchBackground 消除 Windows 下 EBUSY/rmdir 44ms 进程退出竞态，并通过 Git Data API 闭环 workflow 权限与推送 actor 门禁。",
          date: "2026-11-16",
          readMinutes: 8,
          wordCount: "4,712 字符",
          cover: IMAGES.ogPr75Macos,
          coverFit: "contain",
          coverBg: "#0b0f12",
          tags: ["macOS","sandbox-exec","竞态排障","Git Data API"],
          specimen: {
            eyebrow: "CAUSAL SEAM #05 · shell.js & watchBackground",
            title: "严档接入 seatbelt 写盘白名单与进程退出同步",
            context: "仅罩严档「问而后行」，且测试清理须等子进程 close 而非只看文件落地",
            lines: [
              { type: 'ctx', text: "macBox = MAC_SEATBELT && boxed && seatbelt && process.platform === \"darwin\";" },
              { type: 'del', text: "轮询 result.txt 存在即 rmSync(root) → 子进程晚 44ms 退出报 EBUSY" },
              { type: 'ins', text: "spawn(\"/usr/bin/sandbox-exec\", [\"-p\", profile, \"/bin/sh\", \"-c\", command]) + watchBackground" }
            ],
            proof: "macOS arm64 原生 E2E 1296/0 + 同命令三分档对照（严档 EPERM 拒写）+ 四项 CI 全绿（Win 1314 / Mac 1305）合入上游"
          },
          tldr: [
            "解冲突先护上游新契约：完整保留 server/store.js 新增的 scopedRoute 存储根代次校验、background() 值守与 onMove 通知，零冲突合并文件同样逐行按 diff 核对。",
            "seatbelt 接回现行链路：仅在严档（strictBox）启用 /usr/bin/sandbox-exec 将写盘收进工作目录与必要工具链缓存，缺失二进制时静默退回 /bin/sh。",
            "消除 Windows 清理竞态：result.txt 落地后 PowerShell 子进程晚约 44ms 才退出触发 EBUSY/rmdir，改挂 watchBackground 等进程级 close 信号后再删目录。",
            "三层证据与身份闭环：分层给出本机静态、四项 CI 与 macOS 真机探针（运行时拼路径三分档对照 + 内核日志），并用 Git Data API 重建同 tree 提交跨过 workflow scope 与首次贡献者审批卡点。"
          ],
          boundaryNote: "边界留底：seatbelt 仅收严档写盘，读与联网照旧，缺失 sandbox-exec 时静默降级为静态筛查；ps 不可见 sandbox-exec 属 exec 替换常态；macOS 端到端固定验证 Chrome，Edge 未验。",
          footnote: "核验基准：「言」PR #75（合入提交 bde519b，2026-11-16）；覆盖本机静态检查、四项 CI（Windows E2E 1314、macOS E2E 1305）与 macOS arm64 真机 seatbelt 探针。",
          sections: [
            {
              id: "pr75-sec-1",
              heading: "背景",
              html: `
                <p>项目是 yan（本地聊天前端 + 轻量代码 Agent），上游的取舍很明确：<strong>Windows 为准，macOS 只求能用，Linux 不支持</strong>。<a href="https://github.com/Master-Norna/yan/pull/75" target="_blank" rel="noopener noreferrer">PR #75</a> 做 macOS 基础适配，四块内容：</p>
                <ul>
                  <li>macOS 严档（「问而后行」）沙箱在静态筛查之外，用系统自带的 <code>/usr/bin/sandbox-exec</code>（seatbelt）把写盘收进工作目录；</li>
                  <li>「环境」工具包在 macOS 上降级为说明 + 桥接报错（它只备了 Windows 版）；</li>
                  <li>存储位置条子按平台落位（macOS 写 <code>~/Library/Application Support/言/位置.json</code>，并兼容清理早前误写进 <code>%APPDATA%</code> 路径的旧条子）；</li>
                  <li>文档与测试的配套修正。</li>
                </ul>
                <p>挂在 review 阶段时，上游 main 先后合进了几笔同地基的改动：#17 补齐 macOS 沙箱筛查、#87/#89 修沙箱参数识别，以及一组存储根切换修复——<code>server/store.js</code> 里长出了 <code>scopedRoute</code>（存储根代次校验）、<code>background()</code> 值守和 <code>onMove</code> 通知。维护者复核后给了三条明确意见：存储位置修复已通过、冲突要解且不许盖掉这些新逻辑、文档说的和界面做的要统一。</p>
              `
            },
            {
              id: "pr75-sec-2",
              heading: "修复思路",
              html: `
                <h3 id="pr75-h3-1">一、先读复核意见，再读合并结果</h3>
                <p>这轮最重要的动作顺序是：<strong>先把维护者最新一条 review 吃透，再去看 diff</strong>。三条意见里两条是关于「什么不能动」的：根代次校验、<code>onMove</code> 通知是上游刚修好的东西，解冲突时任何「顺手简化」都是在回退别人的修复。</p>
                <p>真正冲突的只有 <code>server/store.js</code> 一个文件、两处，而且都是签名级：工厂函数签名并入了 <code>background</code>/<code>onMove</code>，<code>handleMove</code> 从 <code>jsonRoute</code> 换成了 <code>scopedRoute</code>。但「文本上合得上」不等于「语义上对」——合并工具自动拼好的部分，我逐行核对过：<code>revision</code> 代次、<code>scopedRoute</code> 包裹、<code>background()</code> 值守都在，且分支的 <code>MAC</code> 平台常量没被吃掉。</p>
                <p><strong>经验：merge 不冲突的文件也要当 diff 读。</strong> 这次 <code>server/work/index.js</code> 自动合并零冲突，但我要确认的不是「合上了」，而是「seatbelt 在新链路里仍然只在严档生效」。</p>
                <h3 id="pr75-h3-2">二、seatbelt 接回现行链路，而不是新起一条</h3>
                <p>seatbelt 的接入点选在上游现有的分档逻辑上，一行：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>seatbelt = strictBox(body);   // sandbox:true 且非宽档 —— 即严档「问而后行」</code></pre>
                </div>
                <p>然后三条执行路径透传下去：前台 <code>runShell</code>、带 ticket 转后台的 <code>runForeground</code>、直接后台的 <code>startBackground</code>，最终都进 <code>spawnJob</code> → <code>spawnShell</code>。真正换实现的只有一行 spawn：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>macBox = MAC_SEATBELT &amp;&amp; boxed &amp;&amp; seatbelt &amp;&amp; process.platform === "darwin";
// macBox 时:spawn("/usr/bin/sandbox-exec", ["-p", profile, "/bin/sh", "-c", command])
// 否则照旧:/bin/sh -c</code></pre>
                </div>
                <p>两个刻意的取舍：</p>
                <ul>
                  <li><strong>只罩严档</strong>。审而后行、径行依旧只走规则筛查——上游的权限分档是产品决策，技术方案不能越权替它扩成「全平台进程隔离」；</li>
                  <li><strong>缺失即静默降级</strong>（<code>fs.existsSync("/usr/bin/sandbox-exec")</code> 不满足就退回 <code>/bin/sh</code>），不引入新依赖。</li>
                </ul>
                <p>seatbelt profile 本身是「<code>(allow default)</code> + 对写盘按白名单 deny」：工作目录（过 <code>realpath</code>，防软链绕过）、<code>$TMPDIR</code>/<code>/tmp</code>/<code>/private/var/folders</code>、<code>/dev</code>，以及 <code>~/.npm</code>、<code>~/Library/Caches</code>、<code>~/.cargo</code>、<code>~/.m2</code> 这类工具链缓存。放缓存不是宽纵，是「求能用」——Node/Python 的包管理器不写缓存就没法干活。</p>
                <h3 id="pr75-h3-3">三、文档说的和界面做的，统一成界面做的</h3>
                <p>维护者点的第三处：docs 写 macOS 上环境页会「禁用准备」，<code>envStatusHtml</code> 里按钮实际只在任务运行中才 disabled——不支持的平台按钮可点，点了由桥接的 <code>handlePrepare</code> 同步抛 Windows-only 错。</p>
                <p>两个方向都能选：改 UI 真禁掉，或改文档照实写。选后者，理由：行为已经在维护者上一轮复核里被默认认可过（PR 正文就写着「按钮可点」），改文档是单点收敛，改 UI 是二次动行为。四份文件中英对齐改口径：<strong>标注「仅 Windows」、「准备环境」仍可点、由桥接报这个错</strong>。</p>
                <p><strong>经验：文档与行为不一致时，先问「哪个是被 review 过的行为」。</strong> 被复核过的行为是契约，文档向它对齐；只有行为本身错了才改代码。</p>
                <h3 id="pr75-h3-4">四、文件落地不等于进程退出：清理要等任务真结束</h3>
                <p>合入前最后一轮复核，问题出在测试自己身上，而且只在 Windows 上看得见。</p>
                <p>早前为修偶发失败，已交付分支的固定等待被改成了轮询 <code>result.txt</code> 是否存在。维护者本机复验抓到：文件出现不代表写它的 PowerShell 已退出——随后 <code>finally</code> 里 <code>fs.rmSync(root)</code> 时，进程仍以 root 为当前目录，Windows 报 <code>EBUSY/rmdir</code>，646 过 1 败，独苗就是这条清理。插桩显示清理开始时 <code>backgroundRunning()</code> 仍为 true，子进程 <code>close</code> 晚约 44 ms 才到，退出码 0。</p>
                <p>修复顺着现成的桥接接口走，不新造等待原语：测试服务器加挂 <code>POST /api/work/watch</code>，用例里凭 run 响应已交付的 <code>id/key</code> 发一次 watch。<code>watchBackground</code> 挂在 <code>job.ended</code> 上，它 resolve 于 child 的 <code>close</code>，而 <code>close</code> 必在 <code>exit</code> 之后——watch 正常返回即证明写盘进程真正退出，再进清理。结果文件的断言原样保留，固定等待不扩大，cancel 分支不动（那条拿不到 id/key，且进程是被 <code>killTree</code> 收的，语义上也没有「等它自然结束」可等）。</p>
                <p><strong>经验：文件系统只能证明文件被写过，证明不了写它的进程退了没有。</strong> 要等「进程级」的结束，就得用进程级的信号（exit/close）；文件存在、mtime、输出静默都只是代理证据。另一个对照也值得记下：这一轮被抓的不是 macOS 适配代码，而是 Windows 上的测试竞态——分层验证的缺口不只在「缺真平台」，也在「每个平台有各自才照得见的坑」。</p>
              `
            },
            {
              id: "pr75-sec-3",
              heading: "验证：把「确实生效」做成三层证据",
              html: `
                <p>上游上一轮的复核是在 Windows 上做的，存储测试靠模拟平台——所以这次把证据分了层，每层标清它到底证明了什么：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>层</th><th>做了什么</th><th>证明了什么</th></tr></thead>
                    <tbody>
                      <tr><td>本机静态</td><td><code>npm run check</code>、<code>npm run unit</code>、prettier</td><td>类型、644 项单测、格式；macOS 分支在 Linux 上不执行，这层只管平台无关正确性</td></tr>
                      <tr><td>CI</td><td>Windows 单测·类型·格式 / Windows 端到端 / Node 22 单测 / macOS 测试</td><td>合入后不破坏挡合并的两道 Windows 门，macOS 参考项绿</td></tr>
                      <tr><td>macOS 原生</td><td>arm64 机器上 check/unit/<strong>E2E 1296 过 0 败</strong> + 运行时探针</td><td>真平台、真 Chrome、真 seatbelt</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>第三层的关键是<strong>证明拦截来自 seatbelt 而非静态筛查</strong>。做法是三组对照，写盘路径用 <code>os.homedir()</code> 在运行时才拼出来——静态筛查从字面上看不见它：</p>
                <ul>
                  <li>严档 <code>sandbox:true</code> → <code>EPERM: operation not permitted</code>，文件没落盘；</li>
                  <li>宽档 <code>permission:"auto"</code> → 写出成功；</li>
                  <li><code>sandbox:false</code> → 写出成功。</li>
                </ul>
                <p>同一命令、只差分档，拒绝就只可能来自严档多出来的那一层 seatbelt。外加内核日志里 <code>sandbox-exec[pid]</code> 的 unnest 记录佐证二进制确实被调用。</p>
                <p>有一处如实说明值得单独写：<code>ps</code> 里<strong>看不到</strong> <code>sandbox-exec</code> 进程。它是 shim——<code>sandbox_init</code> 之后直接 exec 成 <code>/bin/sh</code>，没有驻留的 wrapper。如果验收标准要求「进程列表里出现 sandbox-exec」这种字面证据，当前实现形态下它不存在；能给出且足够的，是行为差异加内核日志。<strong>经验：先想清楚什么证据形态是可能的，再去设计验证，比事后被质疑证据不够省一整轮。</strong></p>
              `
            },
            {
              id: "pr75-sec-4",
              heading: "工程侧踩到的一个身份坑",
              html: `
                <p>这次还解决了一个和代码无关、但会卡住整个流程的问题：<strong>推送者与提交作者是两回事，而 GitHub 对它们各有一套检查。</strong></p>
                <ul>
                  <li>提交署名约束：上游不接受 agent 署名，所有提交的 author/committer 都必须是用户本人 noreply；</li>
                  <li>推送被拒：本地 PAT 是 classic、<code>public_repo</code> only——这次合并带进了上游对 <code>.github/workflows</code> 的改动，<strong>没有 <code>workflow</code> scope 的 token 推送任何包含 workflow 变更的提交都会被 receive-pack 拦下</strong>，<code>refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope</code>；</li>
                  <li>走了另一条路推上去后，新坑出现：推送者身份变了，GitHub 把该 PR 的 workflow run 判为「首次贡献者需批准」，CI 直接 <code>action_required</code>、0 个 job。</li>
                </ul>
                <p>最终的解法是用 <strong>Git Data API 以用户身份重建提交对象</strong>：同一个 tree、同一对 parents（合入双方的 head）、同一句 commit message，author/committer 写用户 noreply，只让 committer date 变成当下——得到一个内容逐字节相同但 SHA 不同的合并提交，再用 <code>PATCH /git/refs/heads/...</code> 更新分支 ref。ref 更新的 actor 变成用户本人，PR 触发新一轮 synchronize 事件，CI 自动放行。</p>
                <p><strong>经验三条</strong>：</p>
                <ol>
                  <li>「推送者 ≠ 作者」——GitHub 的贡献者统计看提交作者，但 workflow 批准门槛看推送事件的 actor；</li>
                  <li>PAT 的 <code>workflow</code> scope 是独立权限，专管 <code>.github/workflows</code> 下的任何变更，老 token 特别容易在这上面翻车；</li>
                  <li>Git Data API 建提交走的是另一套校验路径，可以在需要「内容不变、身份换一下」的场景救场——但前提是你能保证 tree 与 parents 重建得分毫不差。</li>
                </ol>
              `
            },
            {
              id: "pr75-sec-5",
              heading: "边界，照实留",
              html: `
                <ul>
                  <li>seatbelt 只收<strong>写盘</strong>；读与联网照旧，这一点文档有明示；</li>
                  <li>sandbox-exec 缺失时静默降级，此时严档只剩静态筛查；</li>
                  <li>macOS 上验证固定 Chrome，Edge 未验；</li>
                  <li>「macOS 只求能用」意味着没有承诺进程级隔离——静态筛查的已知洞（脚本内动态拼路径之外，还有藏字、进程脱离树等）不因 seatbelt 而消失，它只是把其中最影响日常的一类（写盘）收住了。</li>
                </ul>
              `
            },
            {
              id: "pr75-sec-6",
              heading: "收尾",
              html: `
                <p>最终状态：两轮复核的意见逐条落地——冲突干净解掉，<code>scopedRoute</code>/代次校验/<code>onMove</code> 原位保留，文档与界面口径统一，测试竞态按「watch 等进程退出」修掉，功能零扩张；四项 CI 全绿（Windows 端到端 1314、macOS 端到端 1305），seatbelt 三层证据齐全。<strong>PR #75 已合入上游。</strong></p>
                <p>这一类工作的体感是：<strong>收尾比新写更考验纪律</strong>——读复核、守取舍、让每一次验证都能回答「你到底证明了什么」；当使用devin这样的cloud agent环境进行开发时，对于上传推送需要进行额外的配置，将它当作自己在本地做好了之后推送上去的流程来处理是不正确的；PR 是 #75，代码在 yan。</p>
              `
            }
          ]
        }
,
        {
          id: "post-macos-sandbox",
          issueNo: "ISSUE 03",
          pinned: false,
          category: "architecture",
          categoryLabel: "架构与工具",
          title: "给 AI Agent 补齐 macOS 静态沙箱：从一张规则表到跨 Shell 扫描器",
          subtitle: "给「言」的 Node.js 本机桥接补齐 macOS 指令筛查（Issue #16 / PR #17），动工前以为只是照着 Windows 规则表补上 launchctl、defaults 和 rsync。真正写进共用扫描器之后，/bin/sh 与 PowerShell 的语法差异一路撞出了包装词逃逸、# don't 落单撇号吞指令、同步热路径 16.4 秒卡死、外层 $() 抢先求值，以及块注释吃掉右括号一连串硬骨头。",
          summary: "复盘「言」PR #17（4e44763 / 合入 3414c84）：从本机桥接四道筛查分工出发，拆解 macOS 动作规则与 sudo 整词反例、rsync/sed 参数 UTF-16 局部抹白、三视图线性扫描器压平三次复杂度退化、外层 PowerShell $() 求值顺序，以及 <#...#> 块注释遮蔽右括号的受限补查与四层验收证据。",
          date: "2026-11-14",
          readMinutes: 28,
          wordCount: "19,720 字符",
          cover: IMAGES.lanternReading,
          tags: ["Node.js","沙箱安全","PowerShell","回归矩阵"],
          specimen: {
            eyebrow: "CAUSAL SEAM #03 · server/sandbox.js",
            title: "块注释结尾 # 误作行注释吞掉双引号 $() 右括号",
            context: "PR #17（4e44763）对 PowerShell 点调用与 <# ... #> 块注释的受限补查（较 fe78d08 两文件 +74/-18）",
            lines: [
              { type: 'ctx', text: "echo \"$(. <# ordinary comment #> Invoke-Expression $s)\"" },
              { type: 'del', text: "commentAt 将 #> 误判为行注释起点，吞掉 ) 导致整段 $() 被遮成 \\x01" },
              { type: 'ins', text: "return !dotComments && scanned.source.includes(\"<#\") && hasHiddenCommand(shellText(..., true), true);" }
            ],
            proof: "入库回归矩阵实测：fe78d08 (31/1) → 首版块注释候选 (31/1) → 最终 4e44763 (32/0) + 13,561 条回放零漂移"
          },
          tldr: [
            "定位与分工：server/sandbox.js 在 child_process.spawn 之前做纯函数静态筛查，命中后返回中文原因供请示或改写；系统级 sandbox-exec 写盘隔离在后续 PR #75 另行接入。",
            "动作识别与 sudo 反例：macOS 工具按「修改子命令拒、查询子命令放」并入共用 RULES；唯独 sudo 因包装词列不完，改为在剥去引号的 unquoted 视图上整词拦截。",
            "参数角色与平台门禁：rsync、ditto、sed -i 按 UTF-16 区间局部抹白只读来源；withoutDataStream 保留 win32 门禁，避免误截 POSIX 带冒号文件名。",
            "三视图线性扫描：用倒序 Int32Array 收尾表加显式栈单趟产出 text / syntax / unquoted 视图，消掉三次复杂度退化，并按真实求值顺序先扫外层 PowerShell 双引号 $() 再扫内层 bash -c。",
            "收官回归与分层验收：纠偏 . Invoke-Expression 回归归类后，用默认关闭的 dotComments 解决 <# ... #> 遮蔽双引号 $() 配对（较 fe78d08 两文件 +74/-18），经 31/1 → 32/0 红绿矩阵、四项 CI 与 13,561 条回放合入 3414c84。"
          ],
          boundaryNote: "事实边界：纯函数静态筛查不隔离子进程（macOS 严档 sandbox-exec 写盘收口见 PR #75）；沿用「回归必修、main 旧缺口不追补」范围；仓库保持 Windows-first，POSIX 分支不承诺 Linux 支持。",
          footnote: "核验基准：「言」PR #17 最终 head 4e44763 / 上游 squash 提交 3414c84（2026-11-14 合入）；本地参考验证环境 macOS 26.6.2 arm64 / Node 24.21.0。危险命令样本仅作字符串传入筛查纯函数，未执行系统修改动作。",
          sections: [
            {
              id: "sandbox-sec-1",
              heading: "1. 先看地基：这层沙箱在桥接里怎么接",
              html: `
                <p>动手加规则前，先顺清楚「言」原本的执行链路。模型发出的 Shell 指令和文件操作都经过本机 Node.js 桥接（只监听 <code>127.0.0.1</code>），路由入口在 <a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/index.js" target="_blank" rel="noopener noreferrer"><code>server/work/index.js</code></a>：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/work/index.js（handleWorkRun 节选，Line 132-146）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/work/index.js（handleWorkRun 节选，Line 132-146）
const guarded = sandbox.screenStoreCommand(command, storeRoot(), workdir);
if (guarded) throw Error(guarded);
const boxed = body.sandbox === true,
  reviewed = body.permission === "review" &amp;&amp; body.reviewed === true;
const unreviewable = reviewed &amp;&amp; sandbox.screenUnreviewable(command);
if (unreviewable) throw Error(\`审查拒绝：\${unreviewable}\`);
if (boxed &amp;&amp; !reviewed) {
  const why = looseTier(body)
    ? sandbox.screenLoose(command)
    : sandbox.screenCommand(command, workdir);
  if (why) throw Error(why);
}
if (body.permission === "review" &amp;&amp; !reviewed) {
  const why = sandbox.screenAutoReview(command);
  if (why) throw Error(why);
}</code></pre>
                </div>
                <p>这套原有的防护底座分成几块各自守门：</p>
                <ul>
                  <li><strong>存储根保护（<code>screenStoreCommand</code> / <code>screenStorePath</code>）</strong>：不管前端开没开沙箱、选了哪档权限，先挡住对「言」自身存储目录里 <code>配置.json</code>、<code>配置备份</code> 和 <code>ChatGPT 登录.json</code> 的读写，避免模型把 API Key 读走拼进 URL 外传，或自己改写配置关掉沙箱。</li>
                  <li><strong>审查兜底线（<code>screenUnreviewable</code>）</strong>：在「审而后行」模式下，即使另一路审查模型放行，仍有两件事直接拒掉——一是调「言」自己的本机桥接端口（<code>localhost:8787</code>，含 <code>:08787</code> 前导零写法，因为执事接口只认 <code>reviewed: true</code> 而不验沙箱，调它等于自己给自己盖章）；二是编码、拼接、管道喂 Shell 这类「藏字」指令，审查模型看不懂实际内容，放行只能盲猜。</li>
                  <li><strong>严、宽两档沙箱与自动审查规则</strong>：
                    <ul>
                    <li><code>screenCommand</code>（严档，给「问而后行」）：守住工作目录外写入、<code>.env</code>/密钥读写、<code>.git</code> 内部修改以及非本机的直接外联；整机只读查看放行，方便模型排查系统环境。被拦下的命令会带着原因在界面浮出「请示」，用户批了就单条出沙箱执行。</li>
                    <li><code>screenLoose</code>（宽档，给「审而后行」与「径行」）：放开目录外写、联网、读 <code>.env</code> 和改 <code>.git</code>，只守服务、账户、磁盘、防火墙、提权、藏字、别名，以及往 <code>Windows</code>、<code>Program Files</code>、<code>/System</code>、<code>/usr</code> 这类系统目录写入。</li>
                    <li><code>screenAutoReview</code>（审档）：「审而后行」未开审查模型或审查连不上时的规则闸门，在宽档基础上多拦 <code>rm -rf *</code> 等整目录/通配删除。</li>
                    </ul>
                  </li>
                  <li><strong>环境变量过滤与文件工具</strong>：<code>sandboxEnv</code> 在套沙箱启动子进程前按变量名滤掉 <code>KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE|PRIVATE</code>；结构化文件读写则走 <a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/paths.js" target="_blank" rel="noopener noreferrer"><code>server/work/paths.js</code></a> 与 <code>screenPath</code>，在严档里锁死工作目录。</li>
                </ul>
                <p>项目原本是 Windows-first：<a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/shell.js" target="_blank" rel="noopener noreferrer"><code>server/work/shell.js</code></a> 在 <code>win32</code> 上包一层 <code>POWERSHELL_WRAPPER</code> 走 PowerShell，到了 <code>darwin</code> 只用 <code>/bin/sh -c</code>。<code>#16</code> 开工前在 <code>main</code> 上以 <code>platform: "darwin"</code> 实测，<code>launchctl load</code>、<code>defaults write</code>、<code>crontab -r</code>、<code>bash -lc "crontab -r"</code>、<code>chmod -R 777 /Users/a</code>、<code>eval "$(echo ... | base64 -d)"</code> 在严宽两档全部返回 <code>null</code>；反过来，<code>cp -r /Users/a/src ./backup/</code> 因为只读来源正则只认 PowerShell 开关而被严档误拒，<code>echo Set-Alias</code> 因为没认指令位在两档都被误拦。</p>
                <p>整个 PR #17 的任务，就是在沿用既有执行器与工具路由的前提下，通过 <code>server/sandbox.js</code> 等 7 个文件把这套筛查补齐到 macOS 和跨平台共用路径上。</p>
              `
            },
            {
              id: "sandbox-sec-2",
              heading: "2. 命令规则：按“子命令动作”立规矩，以及为什么 sudo 反着来",
              html: `
                <p>最直接的一块是往共用 <code>RULES</code> 数组里添 macOS 管理工具。设计原则在 <a href="https://github.com/Master-Norna/yan/issues/16" target="_blank" rel="noopener noreferrer"><code>#16</code></a> 里先对齐好：不按宿主拆成两张黑名单，而是按「站在指令位（<code>CMD</code>）上的修改子命令拒、明确的查询子命令放」写进同一张表：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（RULES 共用规则节选，Line 1572-1625）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（RULES 共用规则节选，Line 1572-1625）
const EVERY = "严宽审",
  WIDE = "宽审";

const RULES = [
  [
    cmd(
      "launchctl",
      String.raw\`(?:load|unload|bootstrap|bootout|enable|disable|kickstart|\` +
        String.raw\`submit|remove|start|stop|kill|attach|setenv|unsetenv|config|debug|reboot)\\b\`
    ),
    "不动系统服务",
    EVERY
  ],
  [
    cmd("defaults", String.raw\`(?:(?:-currentHost|-host\\s+\\S+)\\s+)?(?:write|delete|import|rename)\\b\`),
    "不动系统设置",
    EVERY
  ],
  [
    cmd(
      "security",
      SECURITY_COMMAND +
        String.raw\`(?:export\\b|dump-keychain\\b[^;|&amp;\\n]*\\s-(?=[a-z]*d)[a-z]+(?=[\\s"']|$)|\` +
        String.raw\`find-(?:generic|internet)-password\\b[^;|&amp;\\n]*\\s-(?=[a-z]*[wg])[a-z]+(?=[\\s"']|$))\`
    ),
    "不直接读取或导出钥匙串密码与密钥",
    "严"
  ]
];</code></pre>
                </div>
                <p>按这套规则，<code>launchctl print gui/501</code>、<code>command -v launchctl</code>、<code>echo "launchctl bootout gui/501/com.example.service"</code>、<code>defaults read</code>、<code>crontab -l -u admin</code>（<code>-l</code> 和 <code>-u</code> 参数顺序不限）、<code>diskutil list</code> 都会放行；改服务的 <code>launchctl bootout</code>、改配置的 <code>defaults write</code>、删计划任务的 <code>crontab -r</code> 或无参从管道读入、抹盘和改分区的 <code>diskutil erase*</code> / <code>apfs deleteVolume</code>、改网络配置的 <code>networksetup -set*</code> 则在严宽审三档全拦。</p>
                <p>两条特例不能套用“只读就放”：</p>
                <ol>
                  <li><strong>钥匙串（<code>security</code>）</strong>：修改钥匙串、解锁、<code>authorizationdb write</code>、<code>-i</code> 交互与 <code>-p</code> 提示符在严宽审三档都拦；但 <code>find-generic-password -w</code> / <code>-g</code>（含 <code>-gw</code> 这类合并短选项）、<code>dump-keychain -d</code>（<code>-dg</code>）以及不带 <code>-t</code> 的 <code>security export</code>（默认导出含私钥的 <code>all</code>）虽然名义上是“读”，吐出来的直接是明文密码和私钥，所以专门压进 <code>"严"</code> 档转用户请示。</li>
                  <li><strong>脚本控制（<code>osascript</code>）</strong>：严档整条拦下转请示；宽档与审档已经放开 <code>node -e</code> 这类任意脚本，单禁普通脚本意义不大，所以只把显式提权（<code>with administrator privileges</code> 与 JXA 的 <code>administratorPrivileges: true</code>）并入 <code>ELEVATION</code> 规则三档同拦。</li>
                </ol>
                <p>本以为写好 <code>cmd()</code> 就能把所有命令统一管住，结果 <strong><code>sudo</code> 上演了一场 180 度反转</strong>。</p>
                <p>起初我把 <code>sudo</code> 也收进 <code>CMD</code> 指令位匹配，打算顺便解决 <code>echo sudo x</code> 误报。第一轮审查（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6651295232" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6651295232</code></a>）维护者直接打了回来：#16 不单独枚举 root 专属高危命令，全靠 <code>sudo</code> 这道关兜底，而 <code>main</code> 原本靠 <code>(^|\\s)sudo\\s</code> 拦得住的 <code>if sudo id; then :; fi</code>、<code>! sudo id</code>、<code>case x in a) sudo id;; esac</code>、<code>find . -exec sudo rm {} ;</code>、<code>echo x | xargs -n 1 sudo rm</code>、<code>FOO="a b" sudo id</code>、<code>env -u X sudo id</code>，全因为新指令位没覆盖包装前缀而漏掉了。</p>
                <p>我老老实实往前缀表里补了一轮 <code>XARGS_OPTIONS</code>、<code>ENV_OPTS</code>、<code>FIND_ACTION</code>。到下一轮，维护者拿着审查报告（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6661557023" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6661557023</code></a>）又列出一排全线漏判的写法：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>command -p sudo id        time -p sudo id         exec -a z sudo id
nice -n5 sudo id          timeout -k 1 5 sudo id  stdbuf -o0 sudo id
watch sudo id             wsl sudo id             ssh -t host sudo reboot
parallel sudo ::: id</code></pre>
                </div>
                <p>到这里问题就明朗了：<strong>POSIX 下能把下一段命令当参数拉起来的包装程序根本列不完，给每个工具维护一套带值选项表是一条死胡同。</strong> 维护者拿自己本机约 4,000 条真实历史指令跑了一遍，引号外面出现整词 <code>sudo</code> 的正常命令是 <strong>0 条</strong>，于是主动收回了第一轮“放行 <code>echo sudo x</code>”的要求。</p>
                <p>于是我把臃肿的 <code>XARGS_OPTIONS</code> 和 <code>FIND_ACTION</code> 带值选项表全删了，让 <code>sudo</code> 单独走一条剥掉引号内容后的整词检查：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（Line 1508 &amp; 1680）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（Line 1508 &amp; 1680）
const SUDO_WORD = /(^|[\\s;&amp;|()&lt;&gt;])sudo(?=$|[\\s;&amp;|()&lt;&gt;])/i;
// forbiddenWhy() 命中判断：
pattern.test(pattern === SUDO_WORD ? scanned.unquoted : scanned.syntax);</code></pre>
                </div>
                <p><code>scanned.unquoted</code> 已经由扫描器线性剥空了单双引号里的普通文本，并把识别到的单层 <code>sh -c "..."</code> 执行串展开在里面。结果是 <code>git commit -m "if sudo fails"</code>、<code>rg 'sudo' src</code>、<code>visudo</code>、<code>sudoers</code> 照常放行；<code>ssh -t host sudo reboot</code>、<code>bash -c "command -p sudo id"</code>、<code>sudo&gt;/tmp/out id</code> 全部在严宽审拦住（不进不可审）；留下的代价是 <code>echo sudo x</code> 和重定向目标恰好叫 <code>sudo</code> 的 <code>echo x&gt;sudo</code> 也会被严宽审拦下。用这条极简的保守误报换回确定性，比堆包装词选项表划算得多。</p>
              `
            },
            {
              id: "sandbox-sec-3",
              heading: "3. 路径不是普通字符串：来源豁免、带值选项与冒号陷阱",
              html: `
                <p>严档目录检查的逻辑是：一旦整条指令命中 <code>DIRECT_FILE_MUTATION</code>（本 PR 在写动词表里补进了 <code>chmod</code>、<code>chown</code>、<code>chflags</code>、<code>ln</code>、<code>rsync</code>、<code>ditto</code>、<code>sed -i</code> / <code>--in-place</code>），所有绝对路径、家目录和 <code>..</code> 上溯都会受工作目录约束。</p>
                <p>但真实场景里经常需要把工作目录外的文件拷进来：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>cp -r /Users/a/src ./backup/
rsync -a --exclude node_modules /Users/a/source/ ./backup/
ditto -V /Users/a/file.zip ./file.zip
ln -s /opt/homebrew/bin/node ./node</code></pre>
                </div>
                <p>把参数一律当写入路径，这些合法操作全死；反过来按字符串全局豁免也不行，同一条命令里写了 <code>Copy-Item C:\\x .; Remove-Item C:\\x</code>，第一个 <code>C:\\x</code> 是只读来源，第二个 <code>C:\\x</code> 却是删除目标。</p>
                <p>一开始我偷懒用“无值短选项白名单”去跨选项找第一个位置参数当来源，结果两轮真实回放与复核（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6661557023" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6661557023</code></a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6704937953" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6704937953</code></a>）打出一整排误伤：</p>
                <ul>
                  <li><code>sed -i '' 's/[0-9]/X/g' ./config.ts</code>：替换表达式 <code>s/[0-9]/X/g</code> 和 <code>/TODO/d</code> 里的斜杠被当作 POSIX 绝对路径拦截；</li>
                  <li><code>rsync -av --exclude .git/ ./ ./backup/</code>：过滤模式里的 <code>.git/</code> 触发了 <code>.git</code> 内部修改保护；</li>
                  <li><code>ditto -arch arm64 /Users/a/f.zip ./f.zip</code>：<code>replace(/^--/, "")</code> 没处理单横线长选项，<code>-arch</code> 对不上 <code>arch</code>，后面的架构名 <code>arm64</code> 被当成源操作数豁免了，真正的源 <code>/Users/a/f.zip</code> 反而裸露被拦；</li>
                  <li><code>rsync -ave ssh /Users/a/x ./y</code>：只认独立的 <code>-e</code>，合并短选项里的 <code>e</code> 没识别出来，结果 <code>ssh</code> 被当作来源；</li>
                  <li><code>rsync --rsync-path=/usr/local/bin/rsync /Users/a/x ./y</code>、<code>rsync -a --exclude-from=/Users/a/ignore /Users/a/x ./y</code>：只跨过参数但没抹掉选项里的只读路径，导致 <code>=</code> 后面的路径被当成目录外写入。</li>
                </ul>
                <p>反面约束同样紧：<code>rsync --remove-source-files</code> 会删掉来源，源路径就不能豁免；<code>--log-file</code>、<code>--temp-dir</code>、<code>--backup-dir</code> 是真正在往外面写文件，遍历时必须跨过它们去定位操作数，却绝对不能把它们的值抹白。</p>
                <p>最后的 <code>stripReadSources</code> 改成按 <code>scanned.quotes</code> 边界切词，<strong>只把当次识别为只读来源或只读选项值的 <code>[start, end)</code> UTF-16 索引区间填成空格</strong>，同时避开一个隐蔽坑——如果命令里混着 <code>rsync</code> / <code>ditto</code> / <code>sed</code>，不要每匹配到一个工具就重新扫一遍整条指令的字符串构建引号表，而是直接复用 <code>shellText</code> 已经算好的 <code>scanned.quotes</code>：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（stripReadSources 节选，Line 1849-1885）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（stripReadSources 节选，Line 1849-1885）
if (options &amp;&amp; value.startsWith("-")) {
  const [name, attached] = value.replace(/^--/, "").split("=", 2);
  if (tool === "rsync") {
    const short = /^-[A-Za-z]*?([efBT])(.*)$/.exec(value),
      takesValue = RSYNC_VALUES.has(name) || !!short,
      hasAttached = short ? short[2] !== "" : attached !== undefined;
    ignored = RSYNC_READ_VALUES.has(name) || !!(short &amp;&amp; "ef".includes(short[1]));
    if (takesValue &amp;&amp; !hasAttached &amp;&amp; tokens[i + 1]) {
      if (ignored) {
        const arg = tokens[i + 1];
        for (let j = arg.start; j &lt; arg.end; j++) chars[j] = " ";
      }
      i++;
    }
  }
  // ditto 与 sed 同理：--log-file 等写参数只 i++ 跨过，不写入 chars[j] = " "
} else if (!operand) {
  operand = true;
  ignored = tool === "sed" ? !sedScript : sources &amp;&amp; !removeSource;
}
if (ignored) for (let j = token.start; j &lt; token.end; j++) chars[j] = " ";</code></pre>
                </div>
                <p>另外两处跨平台细节也全栽在字符归一化上：</p>
                <ol>
                  <li><strong><code>withoutDataStream</code> 的冒号条件</strong>：Windows NTFS 允许用 <code>.env::$DATA</code> 或 <code>x:stream</code> 读写同一个文件。旧实现为了防止 <code>.env::$DATA</code> 绕过 <code>SECRET_FILE</code> 校验，会把路径片段里冒号及后面截掉。但在 macOS 上，冒号是合法的普通文件名字符（例如 <code>keys/service:prod.pem</code> 或 <code>/tmp/user:data/.yan</code>）。如果把 Windows 的数据流截断无条件套在 POSIX 上，会把合法文件名截成别的东西。因此 <code>withoutDataStream</code> 必须留着 <code>process.platform === "win32"</code> 这道门禁：</li>
                </ol>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（Line 1731-1734）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（Line 1731-1734）
function withoutDataStream(value) {
  const text = String(value || "");
  return process.platform === "win32"
    ? text.replace(/(^|[\\\\/])([^\\\\/]*?)(?&lt;!^[A-Za-z]):(?![\\\\/])[^\\\\/]*/g, "$1$2")
    : text;
}</code></pre>
                </div>
                <ol>
                  <li><strong><code>screenStoreCommand</code> 的斜杠拆分</strong>：存储根保护里会把命令文本的 <code>/</code> 统一替换成 <code>\\</code> 去匹配 <code>\\.yan\\*</code>，但判断 <code>workdir</code> 是否落在存储根之内时，<code>pathIsInside(rootPath, ...)</code> 必须使用原生分隔符的 <code>rootPath</code>；两份混成同一套斜杠，在 macOS 存储根里跑命令就会直接失配。</li>
                </ol>
              `
            },
            {
              id: "sandbox-sec-4",
              heading: "4. 从正则到三视图线性扫描器：落单撇号与三次同步卡死",
              html: `
                <p>如果只写上面那张规则表和几个参数处理，PR 到这里就可以收工了。真正把难度拉高十倍的，是把 <code>sh -c</code>、<code>bash -lc</code>、环境变量前缀和管道喂 Shell 接进共用规则之后，纯正则开始在真实语料上成片出错。</p>
                <p>整个扫描器 <code>shellText</code> 最终是被两类问题逼出来的：<strong>上下文错位</strong>与<strong>同步热路径上的复杂度退化</strong>。</p>
                <h3 id="sandbox-h3-1">第一类：上下文错位（引号、<code>2&gt;&amp;1</code> 与落单撇号）</h3>
                <p>在 4,000 到 13,000 条真实历史记录回放和审查中，先后暴露出四组典型问题：</p>
                <ol>
                  <li><strong>引号内的 <code>(</code> 误制造指令位</strong>：真实语料里的一条常规 Python 命令 <code>python -c "print(d.get('eval'))"</code> 和一条 grep 搜索 <code>grep -n "foo('eval')" src/a.js</code>，在早期版本里从四档放行直接变成<strong>四档全拦</strong>（包括「不可审」）。原因只是引号里的 <code>(</code> 触发了指令位匹配，让字符串里的 <code>'eval'</code> 撞上了 <code>HIDDEN_COMMAND</code>。<code>node -e "console.log(require('eval'))"</code>、<code>echo "(eval x)"</code> 也全都躺枪。</li>
                  <li><strong>管道检测的引号转义不一致</strong>：<code>pipesToShell</code> 早期另起炉灶判断引号，只跳过反引号而没跳过 POSIX 的 <code>\\"</code>，导致 <code>rg "a\\"|sh" src</code> 和真实语料里的一条 <code>grep -E "a\\"b|c" x; grep -E "powershell|pwsh" y</code> 在 <code>\\"</code> 处提前闭合引号，把后面的 <code>|sh</code> 和 <code>|pwsh</code> 判成了不可审的管道喂 Shell。统一成按执行 Shell 切分转义后（POSIX 双引号认 <code>\\</code>，PowerShell 认 <code>\`</code>），这两条在 <code>darwin</code> 回到放行；有意思的是它们在 <code>win32</code> 下依然返回四档拦截——维护者在 PowerShell 5.1 和 7 解析器里核对过，PowerShell 双引号不认 <code>\\"</code>，这两条在 PowerShell 里本身就报 <code>TerminatorExpectedAtEndOfString</code> 跑不起来，于是主动撤回了“让 <code>win32</code> 也恢复放行”的要求。</li>
                  <li><strong>引号内 <code>2&gt;&amp;1</code> 误中重定向写判断</strong>：为了在 <code>syntax</code> 视图里把引号内部的命令分隔符藏起来，扫描器把引号里的 <code>;&amp;|(){}\\r\\n</code> 替换成 <code>\\x01</code>。结果 <code>wsl -e bash -lc '~/lab/run.sh 2&gt;&amp;1 | tail -40'</code> 里的 <code>&amp;</code> 变成了 <code>\\x01</code>，<code>DIRECT_FILE_MUTATION</code> 里的 <code>&gt;{1,2}\\s*[^&amp;]</code> 排除不掉 <code>\\x01</code>，整条查看日志命令在严档被当成写文件拦了下来。把否定字符集补成 <code>[^&amp;\\x01]</code> 才解决。</li>
                  <li><strong>落单撇号吞掉后续一整段代码</strong>（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6685041139" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6685041139</code></a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6704937953" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6704937953</code></a>）：这是最险的一类安全回归。看看这两组由机制探针构造出的真实形状：</li>
                </ol>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code># don't do this
sudo rm -rf /x

cat &gt; a.md &lt;&lt;'EOF'
it's fine
EOF
sudo id
echo 'done'</code></pre>
                </div>
                <p>模型在多行命令里写一句 <code># don't do this</code> 注释，或者用 heredoc / PowerShell <code>@'...'@</code> 写一段带英文撇号 <code>it's fine</code> 的 Markdown，在真实记录里极常见（语料里就有约 80 条带落单引号的指令）。旧 <code>quotedEnd</code> 碰到 <code># don't</code> 里没收尾的 <code>'</code> 就一路算到末尾，或者让 heredoc 正文里的 <code>it's</code> 跨越 <code>EOF</code> 跟后面 <code>echo 'done'</code> 的 <code>'done'</code> 配成一对，中间的 <code>sudo rm -rf /x</code> 和 <code>sudo id</code> 在 <code>syntax</code> 与 <code>unquoted</code> 视图里瞬间消失，所有规则全盲。更隐蔽的还有 <code>case x in</code>、<code>$(echo \${x:-)})</code> 和未加引号 heredoc 里的 <code>)</code>，会让早期的括号计数误以为外层 <code>$()</code> 已经结束，把后面的 <code>; sudo id</code> 留在引号视图里漏掉。</p>
                <p>解法必须把整套扫描上下文立起来：</p>
                <ul>
                  <li>引号外、以 <code>#</code> 开头的行注释先从视图里抹成空格（维持字符索引不变），未找到收尾引号的下标直接记 <code>-1</code> 并当成普通字符前进；</li>
                  <li>扫描器显式消费 PowerShell here-string（<code>@'...'@</code> 全字面量、<code>@"..."@</code> 仅展开 <code>$()</code>）与 POSIX heredoc（<code>&lt;&lt;'EOF'</code> 全字面量、<code>&lt;&lt;EOF</code> 仅扫 <code>$()</code> 和反引号替换，但 <code>sh &lt;&lt;EOF</code> 这类把正文喂给 Shell 执行的仍压栈按指令扫描）。</li>
                </ul>
                <h3 id="sandbox-h3-2">第二类：同步热路径上的三次复杂度退化</h3>
                <p><code>server/sandbox.js</code> 是在桥接处理 HTTP 请求时<strong>同步执行</strong>的。只要某个长输入出现平方甚至指数级回溯，整个 Node 桥接进程就会被卡死。整个 PR 期间先后撞出并打掉三次退化：</p>
                <ol>
                  <li><strong>管道后缀重扫（<code>b91ed48</code> 修复）</strong>：早期正则里每个 <code>\${CMD}</code> 命中后都会向后扫到尾，<code>':;'.repeat(5000)</code>（10 KB）耗时 <strong>2.7 秒</strong>，40 KB 直接跑不完。改为写一段引号外逐段扫描的 <code>pipesToShell</code>（配合手写 <code>skipPipeRedir</code> 跳过 <code>2&gt;/dev/null</code> 等前导重定向），<code>':;'.repeat(5000)</code> 降到 <strong>3.7 ms</strong>，<code>':;'.repeat(20000)</code>（40 KB）只要 <strong>15.8 ms</strong>。</li>
                  <li><strong>未闭合 <code>"$(</code> 互递归指数爆炸（<code>e1af9ed</code> 修复）</strong>：<code>3447d03</code> 里的 <code>quotedEnd</code> 与 <code>substitutionEnd</code> 在找不到右括号/右引号时互相重扫同一截后缀，外层循环又从下一个字符重头再来——仅输入 <code>'"$('.repeat(20 / 25 / 30)</code>（区区 <strong>60 / 75 / 90 个字符</strong>），darwin 严档耗时就飙到 <strong>0.6 / 6.5 / 71.4 ms</strong>。</li>
                  <li><strong>长注释抹白后的跨行回溯（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6704937953" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6704937953</code></a> 修复）</strong>：把 <code>#</code> 注释抹成空格后，<code>CMD</code> 锚点后面的 <code>\\s*</code> 会跨过换行吃掉整片空白，从每一行行首重头尝试。独立复核测出 <code>"# c\\n".repeat(4000)</code>（16 KB）在 <code>main</code> 上只需 <strong>2 ms</strong>，在 <code>e1af9ed</code> 上跑出了 <strong>16.4 秒</strong>。把 <code>CMD</code> 与 <code>PREFIX</code> 里的空白全部收窄为行内空白 <code>INLINE_SPACE = String.raw\`[^\\S\\r\\n]\`</code>（同时约束第二段 <code>PREFIX</code> 必须跟在 <code>SHELL</code> 后避免双前缀切分回溯）才彻底压回毫秒级。</li>
                </ol>
                <p>最终成型的 <code>quoteContext</code> + <code>substEnds</code> + <code>shellText</code> 采用「<strong>倒序预填表 + 显式栈单趟生成三份等长视图</strong>」：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（quoteContext 倒序填表，Line 147-162）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（quoteContext 倒序填表，Line 147-162）
function quoteContext(text, shell, offset = 0, dotComments = false) {
  const single = new Int32Array(text.length + 2).fill(-1),
    double = new Int32Array(text.length + 2).fill(-1),
    substitution = new Int32Array(text.length + 2).fill(-1);
  let newline = text.length,
    blockEnd = -1;
  for (let i = text.length - 1; i &gt;= 0; i--) {
    const ch = text[i];
    if (dotComments &amp;&amp; ch === "#" &amp;&amp; text[i + 1] === "&gt;") blockEnd = i + 2;
    if (ch === "\\n" || ch === "\\r") newline = i;
    single[i] = ch === "'" ? i : single[i + 1];
    if (escapes(text, i, shell, '"')) double[i] = double[i + 2];
    else if (ch === '"') double[i] = i;
    else if (shell !== "cmd" &amp;&amp; ch === "$" &amp;&amp; text[i + 1] === "(" &amp;&amp; substitution[i + 2] &gt;= 0)
      double[i] = double[substitution[i + 2] + 1];
    else double[i] = double[i + 1];
    // 同步倒序计算 substitution[i]，未闭合均缓存 -1
  }
  return { text, shell, offset, single, double, substitution };
}</code></pre>
                </div>
                <p>拿到单双引号和 <code>substEnds</code>（<code>Int32Array</code>，专门处理含 <code>case</code>、<code>\${}</code>、heredoc 与 <code>$(())</code> 的真 <code>$()</code> 配对）后，<code>shellText</code> 用显式 <code>frames</code> 栈一次输出三份长度完全相同的字符串：</p>
                <ul>
                  <li><code>text</code>：行注释已抹成空格，保留原始下标，供长度与间隔核对；</li>
                  <li><code>syntax</code>：普通引号内的 <code>;&amp;|(){}\\r\\n</code> 置为 <code>\\x01</code>、转义后字符置为 <code>\\x01</code>，而 <code>$()</code> 与单层执行串内部按真实语法保留；</li>
                  <li><code>unquoted</code>：普通单双引号整段抹为空格，同时展开 <code>$()</code> 与单层执行串，专供 <code>SUDO_WORD</code> 使用。</li>
                </ul>
                <p>三份视图和原始输入的每一个字符索引严丝合缝，深层 <code>$()</code> 嵌套不再递归复制整段正文，所有的 <code>-1</code> 失败结果都只算一次。<code>test/unit/sandbox.test.mjs</code> 里把 24 条 4 KB–40 KB 的长注释、空行、heredoc、未闭合 <code>"$(</code> 和 <code>rsync</code> 长串全部锁进双平台四档 <code>&lt; 200ms</code> 断言，彻底堵死了回溯复发。</p>
              `
            },
            {
              id: "sandbox-sec-5",
              heading: "5. 跨 Shell 求值顺序：外层 PowerShell 双引号先于内层 bash -c",
              html: `
                <p>扫描器能区分平台、展开单层 <code>bash -c "..."</code> 执行串之后，独立复核与维护者（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6847054931" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6847054931</code></a>）又抓出一个极漂亮的 P1 跨 Shell 回归：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>bash -c "echo '$(Stop-Computer)'"
bash -c "echo foo # $(Stop-Computer)"</code></pre>
                </div>
                <p>这两条指令在 <code>main</code> 上严/宽/审三档全部拦截，而在当时的 <code>f409c65</code> 上三档全放。</p>
                <p>错在哪？当时扫描器识别到 <code>bash -c "..."</code> 后，直接把引号里的内容丢给了 <code>bodyShell = "posix"</code> 栈帧去扫。在 POSIX 眼里，第一条的 <code>$(Stop-Computer)</code> 裹在单引号 <code>'...'</code> 里，第二条跟在 <code>#</code> 注释后面——两边都不会执行，于是扫描器乖乖把它们当字面量遮掉了。</p>
                <p>但回到真实运行顺序上，<strong>外层壳是 PowerShell</strong>。在 PowerShell 解析命令行参数时，双引号字符串会先做一次表达式展开，再把求值完的结果作为参数交给 <code>bash</code>（参见 <a href="https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7.5" target="_blank" rel="noopener noreferrer">Microsoft Learn PowerShell 引号规则</a>）。维护者在 Windows PowerShell 5.1 和 PowerShell 7 上用无害替身函数实测：外层替换里的命令确实会先执行一次，传进替身 <code>bash</code> 时收到的已经是 <code>echo 'SAFE_STUB_RESULT'</code>。只有像 <code>bash -c "echo '\`$(Stop-Computer)'"</code> 这样在外层双引号里先用反引号转义了 <code>$</code>，它才真的会逃过外层求值、原封不动落进 POSIX 单引号。</p>
                <p>修法没有堆砌特例规则，只是在 <code>841e996</code> 给 <code>shellText</code> 的双引号执行串多压一帧按外层 <code>shell</code> 解析的扫描任务（<code>outerQuote = true</code>）：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（Line 1304-1314）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（Line 1304-1314）
if (i === frame.scriptAt) {
  const command = text.slice(frame.start, i),
    body = text.slice(i + 1, end),
    bodyShell = CMD_SCRIPT.test(command) ? "cmd" : POSIX_SCRIPT.test(command) ? "posix" : "powershell";
  if (text[i] === '"') {
    const outer = quoteContext(body, shell, at + 1, dotComments);
    outer.ends = substEnds(body, shell, true, dotComments);
    push(outer, 0, body.length, true, '"', true);
  }
  push(quoteContext(body, bodyShell, at + 1, dotComments), 0, body.length, true);
}</code></pre>
                </div>
                <p>外层栈帧遇到 <code>$()</code> 时把整段原样露给三份视图（普通参数文本保持不变，不误放内层字面量），内层栈帧再照 POSIX 规则继续筛余下的脚本；顺序一摆正，上面的正反例全对上了。</p>
              `
            },
            {
              id: "sandbox-sec-6",
              heading: "6. 收官战：Invoke-Expression 的错误类比，与块注释遮蔽 $() 配对",
              html: `
                <p>合并前的最后三轮迭代（<code>f409c65 → ef3d1b5 → fe78d08 → 4e44763</code>），全围着 <code>Invoke-Expression</code> 一条规则打转，却把整篇排查里最容易犯的归因错误和管线遮蔽问题照得一清二楚。</p>
                <h3 id="sandbox-h3-3">第一步：修好删字 bug，顺带揭出旧词匹配的误伤</h3>
                <p>早先 <code>withoutExeDir</code> 为了剥掉命令行上的程序路径，把正则里的路径前缀匹配得太宽，误把文本里的 <code>Invoke-Expression</code> 也当目录截掉了一块。修完这个错误后，真实历史语料里立刻跳出一条常规搜索误伤：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>grep -rn -i "iex\\|Invoke-Expression\\|HIDDEN" src docs/a.md</code></pre>
                </div>
                <p><code>main</code> 对这条四档全放，PR 里因为 <code>HIDDEN_COMMAND</code> 挂着无条件的 <code>\\bInvoke-Expression\\b</code>，直接把一句 <code>grep</code> 打成了<strong>不可审</strong>（连审查批准都没法跑）。</p>
                <h3 id="sandbox-h3-4">第二步：收紧执行位后的回归，与 <code>. iex</code> 的错误归类</h3>
                <p>把 <code>Invoke-Expression</code> 和 <code>iex</code> 并入同一条 <code>(?:\${CMD}|=\\s*)</code> 指令位规则后（中间独立复核先挡下一版漏掉 <code>Invoke-Expression($s)</code> 括号写法的候选），<code>grep</code>、<code>rg Invoke-Expression src</code>、<code>git log -S Invoke-Expression</code> 顺利放行。但随后维护者在 <a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6860117259" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6860117259</code></a> 抓出了点调用回归。</p>
                <p>我当时在回复里顺手辩解了一句：“<code>main</code> 也放行 <code>. iex $s</code>，点调用算既有缺口。”维护者直接拍回一张四行对照表（严/宽/审/不可审，<code>x</code> 拦 <code>o</code> 放）：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>指令</th><th><code>main</code> (<code>4fd70a1</code>)</th><th>当时 <code>ef3d1b5</code></th></tr></thead>
                    <tbody>
                      <tr><td><code>. Invoke-Expression $s</code></td><td><code>xxxx</code></td><td><code>oooo</code></td></tr>
                      <tr><td><code>. 'Invoke-Expression' $s</code></td><td><code>xxxx</code></td><td><code>oooo</code></td></tr>
                      <tr><td><code>. "Invoke-Expression" $s</code></td><td><code>xxxx</code></td><td><code>oooo</code></td></tr>
                      <tr><td><code>. iex $s</code>（对照）</td><td><code>oooo</code></td><td><code>oooo</code></td></tr>
                    </tbody>
                  </table>
                </div>
                <p>并附了 PowerShell 5.1 / 7 实测：<code>$payload = "'SAFE_EVAL_RESULT'"; . Invoke-Expression $payload</code> 会真打印 <code>SAFE_EVAL_RESULT</code>。这记纠偏很清醒：<strong><code>main</code> 以前碰巧靠粗糙的全词匹配拦下了 <code>. Invoke-Expression $s</code>，机制再粗糙，只要同一条完整输入在 <code>main</code> 拦而新分支放，它就是本 PR 引入的回归；拿同义别名 <code>. iex</code> 的旧缺口来开脱，属于把两件不相等的东西混为一谈。</strong></p>
                <h3 id="sandbox-h3-5">第三步：块注释与双引号 <code>$()</code> 里的前序遮蔽</h3>
                <p>我在 <code>fe78d08</code> 给点调用补上了空格和真实 PowerShell 反引号续行（通过核对 <code>scanned.text</code> 排除 <code>\`n</code> 等普通转义，只认 <code>\`</code> + LF/CRLF）。维护者复核全过，紧接着又顺着 PowerShell 语法摸出一条变体（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6870364900" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6870364900</code></a>）：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>. &lt;# ordinary comment #&gt; Invoke-Expression $s
. &lt;# ordinary comment #&gt; 'Invoke-Expression' $s
$r = . &lt;# ordinary comment #&gt; Invoke-Expression $s</code></pre>
                </div>
                <p>PowerShell 允许在代码中间插 <code>&lt;# ... #&gt;</code> 块注释，点调用照常执行；而 <code>fe78d08</code> 只跳过空白和反引号续行，遇到 <code>&lt;#</code> 就断了。</p>
                <p>写第一版块注释补丁时，直接调用很快修通了，但交付前的<strong>独立会话复核</strong>一针见血地拦下了一句包装写法：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>echo "$(. &lt;# ordinary comment #&gt; Invoke-Expression $s)"</code></pre>
                </div>
                <p>起初以为只是正则没匹配到，追进去才发现根因根本不在 <code>HIDDEN_COMMAND</code>：<strong>块注释结尾 <code>comment #&gt;</code> 里的 <code>#</code> 前面刚好是个空格，<code>commentAt</code> 把这个 <code>#&gt;</code> 当成了普通行注释起点！</strong> 这一吞不要紧，紧跟在 <code>#&gt;</code> 后面的右括号 <code>)</code> 一起被行注释抹进了行尾；外层双引号里的 <code>$(</code> 找不到配对的 <code>)</code>，整段 <code>$()</code> 被当作没闭合的普通双引号内容遮成了 <code>\\x01</code>。候选位置在前一阶段已经没了，后面的命令正则再怎么改都看不见它。</p>
                <h3 id="sandbox-h3-6">最终解：<code>4e44763</code> 的两层受限补查</h3>
                <p>为了不让一条块注释小规则动摇已经对过 13,000 多条记录的默认扫描语义，最终在 <a href="https://github.com/CaramelizedCUDA/yan-local-chat/commit/4e447634d931fdf17bb340bf3be1a78710804b44" target="_blank" rel="noopener noreferrer"><code>4e44763</code></a> 选了一个把影响圈死在局部的方案（相对 <code>fe78d08</code> 只改 <code>server/sandbox.js</code> 和 <code>test/unit/sandbox.test.mjs</code>，合计 <strong>+74/-18</strong>）：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js（Line 1510-1540）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// server/sandbox.js（Line 1510-1540）
function hasHiddenCommand(scanned, dotComments = false) {
  const spacing = /&lt;#[\\s\\S]*?#&gt;|(?:[^\\S\\r\\n]|\\x60\\r?\\n)+/y,
    name = /(?:Invoke-Expression|"Invoke-Expression"|'Invoke-Expression')(?![\\w.-])/iy;
  let commentEnd = 0;
  for (const match of scanned.syntax.matchAll(HIDDEN)) {
    const gap = match.indices.groups.dotSpace;
    // syntax 把所有转义的下一字符都换成 \\x01；点调用只把真实的反引号换行当空白。
    if (!gap) {
      if (!dotComments) return true;
      continue;
    }
    if (!/^(?:[^\\S\\r\\n]|\\x60\\r?\\n)+$/.test(scanned.text.slice(gap[0], gap[1]))) continue;
    if (!scanned.syntax.startsWith("&lt;#", gap[1])) {
      if (!dotComments) return true;
      continue;
    }
    if (gap[1] &lt; commentEnd) continue;
    // 块注释的 #&gt; 可能已被行注释视图抹掉；只从已确认的点调用位置读原文，不改共用视图。
    let at = gap[1];
    while (true) {
      spacing.lastIndex = at;
      if (!spacing.test(scanned.source)) break;
      at = spacing.lastIndex;
    }
    commentEnd = scanned.source.startsWith("&lt;#", at) ? scanned.source.length : at;
    name.lastIndex = at;
    if (name.test(scanned.source)) return true;
  }
  // 只补查块注释点调用的 $() 配对；原扫描及其它规则的命中不变。
  return !dotComments &amp;&amp; scanned.source.includes("&lt;#") &amp;&amp; hasHiddenCommand(shellText(scanned.source, scanned.shell, true), true);
}</code></pre>
                </div>
                <p>这段逻辑把四条保护钉死在代码里：</p>
                <ol>
                  <li><strong>默认视图零改动</strong>：<code>dotComments</code> 默认 <code>false</code>，<code>shellText</code> 产出的 1,398 行默认视图对照与 <code>fe78d08</code> 逐行一致，不影响任何其他规则。</li>
                  <li><strong>原地粘性推进（sticky <code>/y</code>）与未闭合短路</strong>：直接调用点号后出现 <code>&lt;#</code> 时，用 sticky 正则固定 <code>lastIndex</code> 从 <code>gap[1]</code> 原地跳过 <code>&lt;#...#&gt;</code>、行内空白和反引号续行核对完整命令名，并在遇到未闭合 <code>&lt;#</code> 时把 <code>commentEnd</code> 置为末尾，避免同一长后缀被反复扫描。</li>
                  <li><strong>按需单次补查</strong>：只有第一遍普通路径没命中、且原文含 <code>&lt;#</code> 时，才传 <code>dotComments = true</code> 再扫一次 <code>shellText</code>（在 <code>quoteContext</code> 与 <code>scanSubst</code> 里跳过 <code>&lt;#...#&gt;</code> 配对出正确的 <code>$()</code> 右括号）。</li>
                  <li><strong>只收特定目标、不递归</strong>：补查路径上 <code>if (!dotComments)</code> 屏蔽了普通分支，只放行「点调用 + <code>&lt;#</code> 块注释 + 完整 <code>Invoke-Expression</code> 名字」一类命中，也不会触发第三次扫描。</li>
                </ol>
              `
            },
            {
              id: "sandbox-sec-7",
              heading: "7. 验证：红绿矩阵、本机与 CI 分层，以及 13,561 条真实指令回放",
              html: `
                <p>维护者在 <a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6870364900" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6870364900</code></a> 提了一条很实的要求：前面验证点调用和块注释用的仓库外探针不能只在评论里汇报，必须写进 <code>test/unit/sandbox.test.mjs</code>，否则后续 CI 守不住。</p>
                <p>我在 <a href="https://github.com/CaramelizedCUDA/yan-local-chat/blob/4e447634d931fdf17bb340bf3be1a78710804b44/test/unit/sandbox.test.mjs#L713-L757" target="_blank" rel="noopener noreferrer"><code>test/unit/sandbox.test.mjs#L713-L757</code></a> 原有的第 32 个顶层测试项内补齐了生成矩阵（9 种间隔 × 3 种命令名 × 直接调用 / 赋值 RHS / <code>$()</code> / 双引号 <code>$()</code> 包装，以及对应的 <code>rg</code> / <code>echo</code> 搜索负例）：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · test/unit/sandbox.test.mjs（Line 729-747）</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// test/unit/sandbox.test.mjs（Line 729-747）
const tick = "\`";
for (const gap of [
  " ",
  \` \${tick}\\n\`,
  \` \${tick}\\r\\n\`,
  \` \${tick}\\n\${tick}\\n\`,
  \` \${tick}\\r\\n\${tick}\\r\\n\`,
  \` \${tick}\\n \\t\${tick}\\r\\n\`,
  " &lt;# ordinary comment #&gt; ",
  \` &lt;# ordinary comment #&gt; \${tick}\\n\`,
  \` \${tick}\\r\\n&lt;# ordinary comment #&gt; \${tick}\\n\`
]) {
  for (const name of ["Invoke-Expression", "'Invoke-Expression'", '"Invoke-Expression"']) {
    const call = \`.\${gap}\${name} $s\`;
    hidden.push(call, \`$r = \${call}\`, \`$(\${call})\`);
    if (gap.includes("&lt;#") &amp;&amp; !gap.includes(tick)) hidden.push(\`echo "$(\${call})"\`);
  }
  searches.push(\`rg '.\${gap}Invoke-Expression' src\`, \`echo ".\${gap}Invoke-Expression"\`);
}</code></pre>
                </div>
                <p>顶层 <code>test()</code> 数量依然是 32，但内部断言把三版源码切得一清二楚（由独立复核与维护者交叉跑出）：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>被测源码</th><th>沙箱单测结果</th><th>卡在哪一条</th></tr></thead>
                    <tbody>
                      <tr><td><code>fe78d08</code></td><td>31 通过 / 1 失败</td><td><code>. &lt;# ordinary comment #&gt; Invoke-Expression $s</code></td></tr>
                      <tr><td>首版块注释候选</td><td>31 通过 / 1 失败</td><td><code>echo "$(. &lt;# ordinary comment #&gt; Invoke-Expression $s)"</code></td></tr>
                      <tr><td>最终补丁 <code>4e44763</code></td><td>32 通过 / 0 失败</td><td>全部断言通过</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>除了这套先红后绿的矩阵，最终交付证据按四层拆开记录，各管各的一块：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>证据层</th><th>实测内容与结果</th><th>这层能证明什么</th></tr></thead>
                    <tbody>
                      <tr><td><strong>本机参考验证</strong>（macOS 26.6.2 arm64 / Node 24.21.0）</td><td>沙箱单测 32/0、<code>npm run check</code> 与全仓 <code>prettier@3.3.3</code> 通过；<code>npm test</code> 单元 448 过 / 0 败 / 3 跳过，E2E 1204 过 / 1 败（<code>exit 1</code>）</td><td>唯一 E2E 失败是 <code>about-first-run.mjs</code> 的悬停 CSS 断言，同 <code>fe78d08</code> 原基线已复现过 <code>14/1</code>，两边单跑该文件均为 <code>15/0</code>；照实报 <code>exit 1</code>，不拿早期提交全绿记录顶替。另在含 <code>&lt;#</code> 且未命中的长串样本测得约 <code>1.3–2×</code> 常数补查开销，至 80,000 字符未见非线性退化</td></tr>
                      <tr><td><strong>最终 head CI</strong>（<a href="https://github.com/Master-Norna/yan/actions/runs/43563903000" target="_blank" rel="noopener noreferrer"><code>run 43563903000</code></a>）</td><td>Windows 单元·类型·格式、Windows 全量 E2E、Node 22 单元、macOS 参考任务四项全绿</td><td>补齐本机在 macOS Node 里传 <code>{ platform: "win32" }</code> 所不能替代的真 Windows 门禁</td></tr>
                      <tr><td><strong>独立会话复核</strong></td><td>实现会话外另开会话复核，运行 389 组（3,112 次调用）构造探针、旧 133 场景与 1,398 行默认视图对照</td><td>确认默认视图零回退，并在推送前抓出首版候选的 <code>echo "$(. &lt;# ... #&gt; Invoke-Expression $s)"</code> 漏判</td></tr>
                      <tr><td><strong>维护者真实语料回放</strong>（<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6872924458" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6872924458</code></a>）</td><td>上游拿本机去重后的 <strong>13,561 条真实记录</strong>（言 4,350、Claude Bash 9,211）只读跑四档接口，对照 <code>fe78d08</code> 与 <code>4e44763</code></td><td>两个版本在 <code>win32</code>/<code>darwin</code> 四档判定零变化，确认最后这轮修复没有误伤日常真实命令</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>跑完这一整圈，体会很深：<strong>真实历史回放与机制构造探针，各自回答完全不同的问题。</strong> 语料回放最擅长揪出平时想不到的日常误伤——<code>d.get('eval')</code>、<code>2&gt;&amp;1</code>、<code>cat &lt;&lt;'EOF'</code> 里写一段 JS <code>eval(code)</code>、<code>grep</code> 搜词，全靠它拦在合入前；而机制探针专抓语料里还没撞上的语法盲区——<code># don't</code>、<code>'"$(</code> 退化、外层双引号 <code>$()</code>、<code>&lt;#...#&gt;</code> 遮蔽右括号，全靠构造出来才能提前看见。缺哪条腿都会跛。</p>
              `
            },
            {
              id: "sandbox-sec-8",
              heading: "8. 复盘：四次绕路与上游协作备忘",
              html: `
                <p>代码最后虽以 <a href="https://github.com/Master-Norna/yan/commit/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d" target="_blank" rel="noopener noreferrer"><code>3414c84</code></a> 顺利合并，过程中有四次绕路值得写下来留作参照：</p>
                <ol>
                  <li><strong>判回归只认“同输入、同入口、同平台参数”的对照</strong>。拿 <code>. iex $s</code> 的旧漏判去给 <code>. Invoke-Expression $s</code> 的回归定性，就是用“相似样例”替“同一条输入”辩解。哪怕旧代码赢在误打误撞，只要同一输入从拦退成放，就先按回归查。</li>
                  <li><strong>同步链路上的规则扩展，第一天就要把失败缓存与行内空白写死</strong>。<code>2.7s</code>、<code>16.4s</code> 和 90 字符 <code>71.4ms</code> 三次退化根源一样：未闭合的 <code>-1</code> 没进表、未闭合 <code>&lt;#</code> 没记 <code>commentEnd</code>，或者让 <code>\\s*</code> 顺手跨过了换行符。</li>
                  <li><strong>外部探针探索完必须及时进单测</strong>。仓库外跑过几百组探针只能算调试笔记，没进 <code>test/unit/sandbox.test.mjs</code>，后面的重构随时可能把刚修好的边界一脚踩回原地。</li>
                  <li><strong>代码推送不等于交付结束，PR 正文与评审对话必须对到最终 SHA</strong>。<code>4e44763</code> 推送时，PR 顶部正文还写着旧提交 <code>fe78d08</code> 和“本轮未新增或修改测试”，直到维护者发合并验收回复才专门点出来；最后在合并后补改 PR 正文，并用 <a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6873568318" target="_blank" rel="noopener noreferrer"><code>#issuecomment-6873568318</code></a> 逐条收口剩余 18 条评审对话（3 项已修、14 项按约定范围不扩修、1 项不成立）。把最终 SHA、变更范围和验证日志一次性对齐，省得审阅人对着旧说明猜版本。</li>
                </ol>
              `
            },
            {
              id: "sandbox-sec-9",
              heading: "9. 边界照实留",
              html: `
                <ul>
                  <li><strong>静态筛查不隔离子进程</strong>：获准运行的脚本仍拥有用户权限，脚本内部读写、运行时拼出来的路径或命令名、符号链接指向，以及多层 Shell 嵌套（如 <code>bash -c "bash -c 'sudo ...'"</code>）均不在 <code>sandbox.js</code> 能力之内；macOS 严档的系统级 <code>/usr/bin/sandbox-exec</code> 写盘收口是在后续 <a href="https://github.com/Master-Norna/yan/pull/75" target="_blank" rel="noopener noreferrer">PR #75</a> 另行接入的。</li>
                  <li><strong>沿用“本 PR 回归必修、main 旧缺口不追补”的范围</strong>：<code>. iex $s</code>、<code>env -S</code>、POSIX <code>&lt;&lt;&lt;</code>、<code>--remove-source-'files'</code> 拆引号写法、<code>find</code>/<code>xargs</code> 复杂包装与未列出的 <code>plutil</code>、<code>PlistBuddy</code>、<code>chgrp</code>、<code>install</code>、<code>xattr</code> 本轮均未纳入。</li>
                  <li><strong>刻意保留的保守误报</strong>：引号外的整词 <code>sudo</code>（含 <code>echo sudo x</code>、<code>echo x&gt;sudo</code>）、引号外 <code>)</code> 后的普通词（<code>Write-Host (Get-Date) shutdown</code> 在严/宽/审标疑），以及 heredoc 正文中带空格的 <code>eval (x)</code> 仍按偏保守方向拦下。</li>
                  <li><strong>平台支持口径</strong>：按仓库 <a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer"><code>CONTRIBUTING.md</code></a> 约定，项目保持 Windows-first（两道 Windows CI 挡合并，macOS CI 作参考）；代码里的 POSIX 分支服务于 macOS <code>/bin/sh</code>，不承诺 Linux 支持。</li>
                </ul>
              `
            },
            {
              id: "sandbox-sec-refs",
              heading: "参考与证据",
              html: `
                <ul>
                  <li><a href="https://github.com/Master-Norna/yan/issues/16" target="_blank" rel="noopener noreferrer">Issue #16：macOS 沙箱规则整理与判法确认</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17" target="_blank" rel="noopener noreferrer">PR #17：完整讨论、逐轮审查与合并记录</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/commit/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d" target="_blank" rel="noopener noreferrer">上游 squash 合入提交 <code>3414c84</code></a> 与 <a href="https://github.com/CaramelizedCUDA/yan-local-chat/commit/4e447634d931fdf17bb340bf3be1a78710804b44" target="_blank" rel="noopener noreferrer">PR 最终 head <code>4e44763</code></a></li>
                  <li><a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/docs/sandbox.md" target="_blank" rel="noopener noreferrer">合入版 <code>docs/sandbox.md</code></a>、<a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/index.js" target="_blank" rel="noopener noreferrer"><code>server/work/index.js</code></a>、<a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/shell.js" target="_blank" rel="noopener noreferrer"><code>server/work/shell.js</code></a> 与 <a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/paths.js" target="_blank" rel="noopener noreferrer"><code>server/work/paths.js</code></a></li>
                  <li><a href="https://github.com/CaramelizedCUDA/yan-local-chat/blob/4e447634d931fdf17bb340bf3be1a78710804b44/server/sandbox.js#L1510-L1540" target="_blank" rel="noopener noreferrer"><code>hasHiddenCommand</code> 受限补查实现</a> 与 <a href="https://github.com/CaramelizedCUDA/yan-local-chat/blob/4e447634d931fdf17bb340bf3be1a78710804b44/test/unit/sandbox.test.mjs#L713-L757" target="_blank" rel="noopener noreferrer">入库回归矩阵</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/actions/runs/43563903000" target="_blank" rel="noopener noreferrer">最终 head CI 运行记录 #43563903000</a></li>
                  <li>关键审查节点：<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6661557023" target="_blank" rel="noopener noreferrer">sudo 与括号误伤</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6685041139" target="_blank" rel="noopener noreferrer">落单引号遮蔽</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6704937953" target="_blank" rel="noopener noreferrer">16.4 秒长注释与 heredoc 撇号</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6847054931" target="_blank" rel="noopener noreferrer">外层 <code>$()</code> 求值</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6860117259" target="_blank" rel="noopener noreferrer">纠偏 <code>. Invoke-Expression</code> 回归归类</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6870364900" target="_blank" rel="noopener noreferrer">块注释残留与入库要求</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6872924458" target="_blank" rel="noopener noreferrer">维护者最终验收</a>、<a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6873568318" target="_blank" rel="noopener noreferrer">合并后收尾同步</a></li>
                  <li><a href="https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7.5" target="_blank" rel="noopener noreferrer">PowerShell 官方引号规则</a></li>
                </ul>
              `
            }
          ]
        }
,
        {
          id: 'post-spawn-enoent',
          issueNo: 'ISSUE 01',
          pinned: true,
          category: 'engineering',
          categoryLabel: '工程与系统',
          title: '一个目录被当成了可执行文件：一次 spawn ENOENT 的完整排查',
          subtitle: '桌面应用启动即崩，日志里只有一行 spawn D:\\AI-Dev\\devin ENOENT。顺着这行往下挖，问题不在文件是否存在，而在“存在”被读成了“可执行”。这篇记录完整的排查路径、每一步的判断依据，以及修复和验证方法。',
          summary: '应用（DSH Desktop + ds-bot 插件）每次启动都崩，根因是 CLI 查找函数只用 existsSync() 判断路径是否存在而未区分文件与目录。本文记录分层读崩溃日志、复盘 ENOENT 三种语义、负向回归验证及最小修复边界。',
          date: '2026-11-11',
          updated: '2026-11-13',
          readMinutes: 9,
          wordCount: '6,491 字符',
          cover: IMAGES.windowStudy,
          tags: ['Node.js', 'Windows', 'ENOENT', '回归测试'],
          specimen: {
            eyebrow: 'CAUSAL SEAM #01 · discover.js',
            title: '把“存在”读成了“可执行”',
            context: 'D:\\AI-Dev\\devin（数据目录）先于 PATH 中的 devin.exe 被遍历到',
            lines: [
              { type: 'ctx', text: "const WIN_EXT = ['.cmd', '.exe', '.bat', '']" },
              { type: 'del', text: 'if (existsSync(path)) return path' },
              { type: 'ins', text: 'if (isFile(path)) return path  // statSync(path).isFile()' }
            ],
            proof: '未修复基线实测：not ok 1 · actual: ...\\decoy\\dsb-fake-agent → 修复后 7 passed, 1 platform-skipped'
          },
          tldr: [
            '应用（DSH Desktop + ds-bot 插件）每次启动都崩，报 spawn D:\\AI-Dev\\devin ENOENT。',
            'D:\\AI-Dev\\devin 确实存在——它是个目录，不是可执行文件。',
            '根因：插件的 CLI 查找函数只用 existsSync() 判断路径是否存在，不判断类型；而候选列表里最后一项是“裸名”，恰好命中了这个目录。',
            '修复：两处判断改成 statSync().isFile()，加一条跨平台回归测试。不改 PATH、不改扫描策略。',
            '附带现象：宿主进程被未捕获的 spawn 错误带崩后，客户端插件会卡在等待远程挂载，形成“二次启动失败”，看起来像另一个问题。'
          ],
          boundaryNote: '刻意不改：不改 PATH，不改扫描策略，拒绝在扫描阶段执行 --version 探测，避免正常 CLI 从列表“静默消失”。',
          footnote: '环境：Windows 11 x64 / DSH Desktop 0.2.2-rc.1 / Electron 44.7.0 / Node 24.21.0 / ds-bot 0.3.1 / Devin CLI 3000.12.43。文中路径与用户名已脱敏。',
          sections: [
            {
              id: 'spawn-sec-1',
              heading: '1. 现场：两次崩溃，同一行错误',
              html: `
                <p>事发时应用正在启动，窗口直接变成"应用无法启动或已意外停止"，只给了一个崩溃日志路径。日志内容大致是：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Crash Log · Host Stderr</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>time: 2026-11-11T15:45:19.276Z
source: host
phase: running
app: @deepseek-ai/dsh-desktop 0.2.2-rc.1
platform: win32 x64
electron: 44.7.0
node: 24.21.0

--- error ---
Error: dsh desktop host exited with 1: ...

<span class="code-line-highlight">dsh: fatal uncaught exception: Error: spawn D:\\AI-Dev\\devin ENOENT</span>
    at ChildProcess._handle.onexit (node:internal/child_process:287:19)
  errno: -4058,
  code: 'ENOENT',
  syscall: 'spawn D:\\\\AI-Dev\\\\devin',
  path: 'D:\\\\AI-Dev\\\\devin',
  spawnargs: [ 'acp' ]</code></pre>
                </div>
                <p>十分钟后重启，同样的错误再来一次。中间还夹着一次 Web 端启动失败（<code>web boot: 1 entry did not activate</code>），这部分后面再说。</p>
              `
            },
            {
              id: 'spawn-sec-2',
              heading: '2. 第一步：先弄清楚"谁死了"',
              html: `
                <p>崩溃日志不是只有最后一行。这份文件其实分了几层：</p>
                <ol>
                  <li><strong>头部元信息</strong>：<code>time / source / phase / app / platform</code> —— 先确认是哪个进程、什么阶段死的。</li>
                  <li><strong><code>--- error ---</code></strong>：桌面壳捕获到的退出信息。这次是 <code>dsh desktop host exited with 1</code>，后面拼着 host 进程 stderr 的<strong>尾部</strong>。</li>
                  <li><strong><code>--- renderer console ---</code></strong>：渲染进程的错误。这次是空的，说明不是前端崩。</li>
                  <li><strong><code>--- auxiliary diagnostics ---</code></strong>：插件操作历史之类的旁证。</li>
                </ol>
                <p>关键判断：壳只说"host 退出码 1"，真正死因藏在它拼接的 stderr 尾巴里——也就是上面那段 <code>fatal uncaught exception</code>。也就是说，<strong>不是渲染进程白屏，而是 Node 侧的主进程被一个未捕获异常终止了</strong>。</p>
                <p>这一步还排除了一个常见假设：不是插件安装或更新导致的，插件操作历史里最近一次记录还是几天前。</p>
              `
            },
            {
              id: 'spawn-sec-3',
              heading: '3. 第二步：ENOENT 不等于"文件不存在"',
              html: `
                <p><code>spawn ... ENOENT</code> 最容易被读成"这个文件没有"。但在 Node 里，至少有三种情况都会落到这个错误码上：</p>
                <p><strong>第一种：目标路径真的不存在。</strong></p>
                <p><strong>第二种：路径存在，但不是文件。</strong> 比如它是个目录。Node（底层的 libuv）在 Windows 上找可执行文件时不接受目录，于是同样报 <code>ENOENT</code>。</p>
                <p><strong>第三种：路径存在且是文件，但启动不了。</strong> 比如脚本 shebang 指向的解释器已经不在了。在终端里直接运行会看到 shell 的 <code>bad interpreter</code> 提示，但 Node 的 <code>spawn</code> 报的仍然是 <code>ENOENT</code>。上游 #1222 就是这种情况：<code>spawn /opt/homebrew/bin/opencode ENOENT</code>。</p>
                <p>这次是第二种。两条命令就能确认：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell · 系统工具对照</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>&gt; (Get-Item 'D:\\AI-Dev\\devin').Attributes
Directory

&gt; where.exe devin
C:\\Users\\&lt;user&gt;\\AppData\\Local\\devin\\cli\\bin\\devin.exe</code></pre>
                </div>
                <p><code>where.exe</code> 是 Windows 自带的命令查找工具（PowerShell 中需显式带 <code>.exe</code> 以区分 <code>Where-Object</code> 别名），它<strong>跳过目录</strong>，落到了真正的 <code>devin.exe</code>。而报错里的路径是 <code>D:\\AI-Dev\\devin</code>——正是那个目录。Windows 路径大小写不敏感，<code>devin</code> 和 <code>Devin</code> 是同一个东西。</p>
                <p>所以问题变成了：<strong>是谁把一个目录当成了可执行文件？</strong></p>
              `
            },
            {
              id: 'spawn-sec-4',
              heading: '4. 第三步：定位到那一行判断',
              html: `
                <p>应用里能启动外部 CLI 的地方不多。顺着 <code>spawnargs: ['acp']</code> 这个线索找，最终落在 ds-bot 插件里：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · src/host/local-agents/engines.js</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// src/host/local-agents/engines.js
'devin-cli': { name: 'Devin CLI', kind: 'acp', command: 'devin', args: ['acp'] },</code></pre>
                </div>
                <p>命令行是 <code>devin</code>，参数是 <code>acp</code>，与崩溃日志完全对上。再看查找可执行文件的地方：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · src/host/local-agents/discover.js</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// src/host/local-agents/discover.js
const WIN_EXT = ['.cmd', '.exe', '.bat', '']
const candidates = (name) =&gt; (process.platform === 'win32'
  ? WIN_EXT.map(ext =&gt; \`\${name}\${ext}\`)
  : [name])

export function findExecutable(name) {
  if (name.includes('/') || name.includes('\\\\')) {
    const path = name.startsWith('~') ? join(homedir(), name.slice(1)) : name
    return existsSync(path) ? path : undefined
  }
  for (const dir of searchDirs()) {
    for (const file of candidates(name)) {
      const path = join(dir, file)
<span class="code-line-highlight">      if (existsSync(path)) return path     // ← 问题在这里</span>
    }
  }
  return undefined
}</code></pre>
                </div>
                <p>两个细节凑成了这次事故：</p>
                <ol>
                  <li><strong>候选列表的最后一项是空扩展名</strong>（<code>''</code>）。也就是说，除了 <code>devin.cmd</code>、<code>devin.exe</code>、<code>devin.bat</code>，它还会尝试不带扩展名的 <code>devin</code>。</li>
                  <li><strong>判断用的是 <code>existsSync</code></strong>，它只回答"这个路径存在吗"，不回答"它是不是可执行文件"。</li>
                </ol>
                <p>于是遍历到 <code>D:\\AI-Dev</code> 时：前三个候选都不存在，第四个 <code>D:\\AI-Dev\\devin</code> 命中目录，函数原样返回。调用方拿它去 <code>spawn</code>，抛 <code>ENOENT</code>，而 <code>spawn</code> 失败走的是 <code>'error'</code> 事件——驱动里没有监听它，异常就冒到了进程顶层。</p>
              `
            },
            {
              id: 'spawn-sec-5',
              heading: '5. 为什么"偏偏是那天"',
              html: `
                <p>这个目录不是本来就有的。它是当天做数据迁移时新建的：把 AI 应用的数据从 C 盘挪到 <code>D:\\AI-Dev</code>，其中 devin 的数据目录就叫 <code>Devin</code>。</p>
                <p>时间线很清楚：</p>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>时间（UTC）</th>
                        <th>事件</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>15:40:23</td>
                        <td>创建 <code>D:\\AI-Dev\\Devin</code> 数据目录</td>
                      </tr>
                      <tr>
                        <td>15:45:19</td>
                        <td>第一次崩溃</td>
                      </tr>
                      <tr>
                        <td>15:55:32</td>
                        <td>第二次崩溃</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>在这之前，扫描到 <code>D:\\AI-Dev</code> 时找不到任何名为 devin 的东西，会继续往后走到真正的 <code>devin.exe</code>。目录一出现，解析结果就变了。</p>
                <p>这也解释了一个容易误判的现象：<code>where.exe devin</code> 一直是对的，用户装的东西一直没坏，坏的只是插件自己那套查找逻辑。</p>
              `
            },
            {
              id: 'spawn-sec-6',
              heading: '6. 修复：改什么，以及刻意不改什么',
              html: `
                <p>修复本身很小，两处判断换成"必须是文件"：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · discover.js 修复</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>import { existsSync, statSync } from 'node:fs'

const isFile = (path) =&gt; {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

// findExecutable()
<span class="code-line-highlight">return isFile(path) ? path : undefined</span>
// ...
<span class="code-line-highlight">if (isFile(path)) return path</span></code></pre>
                </div>
                <p>同样重要的是刻意不改的部分。</p>
                <p>当时有个更"彻底"的想法：扫描到 CLI 之后先跑一次 <code>--version</code> 探测，跑不起来的就不注册。这个方案被否掉了，原因是上游维护者已经明确表态，扫描<strong>不做探测</strong>：找到就注册，等用户真的用它的时候失败，然后显示修复引导。这样 CLI 不会从列表里"静默消失"。</p>
                <p><code>isFile</code> 不违反这个设计：它不启动任何进程、没有副作用、不改变遍历顺序，只是在原有的 PATH 遍历里区分"文件"和"目录"。真正的 CLI 是文件，修复后照样被找到、照样被注册。</p>
              `
            },
            {
              id: 'spawn-sec-7',
              heading: '7. 验证：先证明测试会失败',
              html: `
                <p>只写一个"修复后能返回正确路径"的测试是不够的——它可能在旧代码上也能过。所以这里做了<strong>负向验证</strong>：</p>
                <ol>
                  <li>在临时目录里造两个目录：<code>decoy/</code>（里面放一个与 CLI 同名的<strong>目录</strong>）和 <code>real/</code>（放真正的可执行文件）。</li>
                  <li>把 decoy 排在 PATH 前面，调用 <code>findExecutable</code>。</li>
                  <li><strong>先在未修复的代码上跑</strong>——测试必须失败，并且失败信息要显示 <code>actual</code> 是 decoy 里的那个目录。</li>
                  <li>再在修复后的代码上跑——必须通过。</li>
                </ol>
                <p>当时未修复版本的实际输出：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">TAP · 未修复基线负向验证输出</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>not ok 1 - a directory that shares a CLI name is not the CLI
  expected: '...\\real\\dsb-fake-agent.exe'
  actual:   '...\\decoy\\dsb-fake-agent'</code></pre>
                </div>
                <p>这才是有效的回归测试：它证明了测试确实卡住了那个 bug，而不是碰巧通过。</p>
                <p>修复后同一组用例 8 个，7 个通过、1 个按平台跳过。</p>
              `
            },
            {
              id: 'spawn-sec-8',
              heading: '8. 连锁故障：host 倒下之后',
              html: `
                <p>这次事故里还有一个容易被误诊的现象：host 崩掉、应用自动重启后，窗口仍然起不来，报的是另一句话：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Renderer Boot Error</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>web boot: 1 entry did not activate
@deepseek-ai/dsh-experimental-client-ui-cot-translation: loading</code></pre>
                </div>
                <p>看起来像"某个插件坏了"，其实不是。那个客户端插件的挂载逻辑里有：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · 客户端插件挂载</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>const unmountRemote = await ctx.remote.$mount(contribution)</code></pre>
                </div>
                <p>它要等 host 侧的远程服务就绪。host 刚崩、还没恢复时，这个 <code>await</code> 永远不会完成，插件就一直停在 <code>loading</code>，启动断言失败，整个客户端起不来。</p>
                <p>也就是说，<strong>宿主崩溃会和插件的"启动期强依赖"叠加成二次故障</strong>。排查时如果只看第二次的错误，很容易去查一个根本没坏的插件。</p>
                <p>处理方式也很朴素：恢复流程里先禁用第三方插件、备份 profile 配置、重启，让应用先能起来，再回过头查根因。"先止血、后查因"在本地开发环境里同样适用。</p>
              `
            },
            {
              id: 'spawn-sec-9',
              heading: '9. 沉淀：五条可复用的方法',
              html: `
                <p><strong>① 崩溃日志分层读。</strong> 壳日志只说"进程退出码"，真正的死因在它拼接的 stderr 尾部。先确认是谁死了（host / renderer / 插件），再看异常。</p>
                <p><strong>② 把 errno 和语义分开。</strong> <code>ENOENT</code> 是"创建进程时找不到可执行目标"，不等于"文件不存在"。目录、失效的解释器都会落到同一个错误码上；权限不够则是另一个错误码 <code>EACCES</code>。用系统工具（<code>where.exe</code>、文件属性）对照，是最快的区分方式。</p>
                <p><strong>③ 区分触发条件与根因。</strong> 这次 PATH 里有个数据目录是触发条件，<code>existsSync</code> 不判类型才是根因。把绕过方法（从 PATH 移除该目录）当成修复，会让同一个 bug 在下一个人的机器上继续发生。</p>
                <p><strong>④ 修复要给可观察的验收标准。</strong> 这次的标准是一句话：PATH 前部有同名目录、后部有合法文件时，查找函数跳过目录、返回文件路径。标准可测，测试就能照着写。</p>
                <p><strong>⑤ 验证要做负向对照。</strong> 新测试先跑在旧代码上，确认它真的会失败。没有这一步，测到的可能只是"代码能跑"。</p>
              `
            },
            {
              id: 'spawn-sec-10',
              heading: '10. 上游协作的几个注意点',
              html: `
                <p>顺手记一下这次和上游打交道时踩到的点，给以后留个参照。</p>
                <p><strong>先查重，再写。</strong> 上游已经有一个同类崩溃的 issue（<a href="https://github.com/Fei2411/DS-Bot/issues/1222" target="_blank" rel="noopener noreferrer">#1222</a>，macOS 上 <code>opencode</code> 的解释器缺失），还有一个维护者自己提交的修复 PR（<a href="https://github.com/Fei2411/DS-Bot/pull/1403" target="_blank" rel="noopener noreferrer">#1403</a>），只改了驱动层的错误处理、没动查找逻辑。这种情况不该去别人 issue 下面跟帖：因为这是一个崩溃面相同，入口和修复点不同的问题，应该单独报告，并明确写出与已有修复的关系。</p>
                <p><strong>先看贡献规则。</strong> 那个仓库的 CONTRIBUTING 写得很清楚：目前只有 collaborator 能开 PR，其他人提 issue。所以这次提的是 issue，修复放在自己的 fork 分支里供参考。</p>
                <p><strong>报告只陈述，不辩论。</strong> 早期草稿里写了不少"维护者可能会说 X，那时候可以回 Y"的防守性内容，后来我在审核之后全删了。把现象、证据、最小修复、验收标准说明清楚，判断权交给对方。维护者精力有限，报告的价值在于信息完整，不在于说服技巧。</p>
                <p><strong>提交身份也要干净。</strong> 这次推送的 commit 一开始用的是个人常用邮箱，后来 amend 成了 GitHub 的 noreply 地址再 force push。顺便把本地 <code>user.email</code> 也换掉，避免下次再漏。</p>
              `
            },
            {
              id: 'spawn-sec-11',
              heading: '结语',
              html: `
                <p>整个排查的关键转折只有一个：把 <code>ENOENT</code> 从"文件不存在"重新理解为"目标不是一个可执行文件"。在那之前，所有思路都在"是不是没装好、是不是 PATH 写错了"上打转；在那之后，代码位置几乎是顺着线索自己走出来的。</p>
                <p>修复是两行代码和一条测试。真正花时间的是确认"到底哪一层错了"，以及在动手前想清楚"这个模块的设计允许我改到哪里"。</p>
              `
            },
            {
              id: 'spawn-sec-12',
              heading: '后记（2026-11-13）',
              html: `
                <ul>
                  <li>维护者的 <a href="https://github.com/Fei2411/DS-Bot/pull/1403" target="_blank" rel="noopener noreferrer">#1403</a> 已于 2026-11-12 合并进 <code>dev</code>：<code>spawn</code> 失败不再带崩整个 host。<code>discover.js</code> 没有改动，目录被当成 CLI 的问题仍在。</li>
                  <li>这个解析问题单独报在 <a href="https://github.com/Fei2411/DS-Bot/issues/1407" target="_blank" rel="noopener noreferrer">#1407</a>。修复目前在我的 fork 分支 <a href="https://github.com/CaramelizedCUDA/DeepSeek-Bot/tree/fix/local-agent-nonfile-cli" target="_blank" rel="noopener noreferrer"><code>fix/local-agent-nonfile-cli</code></a>，尚未进入上游。</li>
                </ul>
              `
            }
          ]
        }
,
        {
          id: "post-codex-remote-provider",
          issueNo: "ISSUE 04",
          pinned: false,
          category: "engineering",
          categoryLabel: "工程与系统",
          title: "Codex Remote 踩坑：明明用 ChatGPT 账号登录，为什么还说供应商是 custom？",
          subtitle: "安卓手机 ChatGPT Remote 连接 Windows 主机时旧对话能接着聊，发起新对话第一条消息却报 modelProviderMismatch。顺着 config.toml 与会话归档排查登录态、默认供应商 ID 与显示名的错位。",
          summary: "排查安卓 ChatGPT Remote 连 Windows 主机新建对话报 This chat uses openai, but your current provider is custom：厘清 ChatGPT 账号登录、model_provider ID 与显示名 OpenAI 三者关系，同步对齐 config.toml、387 个归档首行与 SQLite 索引（421 条），并记录无项目对话仍落回 C 盘的遗留问题。",
          date: "2026-11-09",
          readMinutes: 4,
          wordCount: "2,551 字符",
          cover: IMAGES.sunlitStreet,
          tags: ["Codex","ChatGPT Remote","SQLite","配置迁移"],
          specimen: {
            eyebrow: "CAUSAL SEAM #04 · config.toml & SQLite Index",
            title: "显示名叫 OpenAI，底层供应商 ID 却是 custom",
            context: "手机 Remote 新会话写入 openai，单改主机默认 ID 又会导致旧会话反向失配",
            lines: [
              { type: 'ctx', text: "[model_providers.custom]  name = \"OpenAI\"  requires_openai_auth = true" },
              { type: 'del', text: "model_provider = \"custom\"  # 新建报 uses openai, current is custom" },
              { type: 'ins', text: "model_provider = \"openai\"  # 同步迁移归档首行与 SQLite 会话索引" }
            ],
            proof: "核对 387 个归档首行 + 解码 343 个压缩流 + SQLite 索引 421 条 openai / 0 条 custom（quick_check ok），手机端实测恢复"
          },
          tldr: [
            "手机端 Remote 续聊已有对话正常，但新建对话首条消息即报 This chat uses openai, but your current provider is custom。",
            "主机 config.toml 遗留 model_provider = \"custom\"（显示名虽为 OpenAI 且沿用 ChatGPT 账号登录），与手机端新建会话固定使用的 openai 冲突。",
            "隔离测试表明不能只改 config.toml：旧会话自身保存了供应商 ID，单改主机默认值会在续聊旧会话时反向报 modelProviderMismatch。",
            "将默认配置、会话归档首行与 SQLite 索引统一对齐为 openai 后恢复新建与收发；但手机端「不指定项目」入口仍未遵循 D 盘工作目录设置。"
          ],
          boundaryNote: "迁移前提与遗留坑：本机并未实际接入第三方自定义端点，若正在使用自定义服务则切换 ID 会改变运行配置；此外手机端选择「不指定项目」新建会话仍落回 C 盘默认目录（参看 #44195）。",
          footnote: "环境：Windows 主机（Codex 桌面后端 0.167.0-alpha.3.2，CODEX_HOME 位于 D 盘）+ Android ChatGPT Remote；文中本地用户名已脱敏。",
          sections: [
            {
              id: "codex-sec-0",
              heading: "现场：旧对话能聊，新建对话首条报错",
              html: `
                <p>2026 年 11 月 9 日，我用安卓手机上的 ChatGPT Remote 连接自己的 Windows 电脑。已经开着的 Codex 对话可以接着聊，但从手机发起新对话，发出去的第一条消息就报错：</p>
                <blockquote><p>This chat uses openai, but your current provider is custom. Switch to openai to continue.</p></blockquote>
                <p>我当时最困惑的是：明明一直用自己的 ChatGPT Plus 账号，怎么突然变成了 <code>custom</code>？查下来，报错里的“供应商”说的是 <strong>Codex 的模型供应商 ID</strong>。主机把默认 ID 和旧会话的供应商记录对齐到内置的 <code>openai</code> 后，手机实测恢复了新建和收发消息，全程没有重新登录。</p>
              `
            },
            {
              id: "codex-sec-1",
              heading: "登录正常，为什么还会有两个供应商 ID？",
              html: `
                <p>先看 Windows 主机上的全局配置。我这台机器把 <code>CODEX_HOME</code> 放在 D 盘，实际读的是 <code>D:\\AI-Dev\\CodexHome\\config.toml</code>。修复前的备份里有这几行：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">TOML</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>model_provider = "custom"
model = "gpt-6.1-sol"

[model_providers.custom]
name = "OpenAI"
requires_openai_auth = true
wire_api = "responses"</code></pre>
                </div>
                <p>这里有三个容易混淆的值：</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>查什么</th><th>当时读到什么</th><th>它代表什么</th></tr></thead>
                    <tbody>
                      <tr><td>账号认证</td><td>ChatGPT 登录，Plus 订阅</td><td>我是用什么账号和方式登录的</td></tr>
                      <tr><td><code>model_provider</code></td><td><code>custom</code></td><td>主机当前选择的模型供应商 ID</td></tr>
                      <tr><td><code>model_providers.custom.name</code></td><td><code>OpenAI</code></td><td>这条供应商配置的显示名</td></tr>
                    </tbody>
                  </table>
                </div>
                <p><code>requires_openai_auth = true</code> 和实际读到的 ChatGPT 登录状态并不冲突。显示名虽然写着 <code>OpenAI</code>，配置的 ID 仍是 <code>custom</code>；截图里失败的那次交互则显示对话使用的是 <code>openai</code>。报错说的是这两个 ID 对不上。关于这两层设置，可以对照 <a href="https://learn.chatgpt.com/docs/auth" target="_blank" rel="noopener noreferrer">Codex 登录文档</a>和<a href="https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers" target="_blank" rel="noopener noreferrer">自定义模型供应商文档</a>。</p>
                <p>更早的配置备份已经有同样的写法，所以至少能确定：<code>custom</code> 不是那次手机操作临时写进去的。没找到记录能说明它最初由谁写入，也没有证据把它归因于某次升级。备份里没找到显式配置的自定义端点，因此我也收回了最初对代理（第三方gateway接入）的猜测。理论上因为我曾经使用过CC Switch来从第三方供应商来使用Codex，这可能是供应商变为"custom"的一个猜测。但是考虑到时间过于遥远，现在我也不再使用CC Switch（甚至都卸载了），而是改用magpie（主要用于其它Agent Harness，比如Deepseek Harness和言。codex，devin，antigravity等这些使用官方账号登录的都不会用它）。因此我决定不再纠结这种奇怪的配置是从哪里来的，把注意力集中到该如何把这个供应商错误修好就行。</p>
              `
            },
            {
              id: "codex-sec-2",
              heading: "为什么没有只改 config.toml？",
              html: `
                <p>正式动配置前，我先在隔离环境里用样本会话测试。主机默认值从 <code>custom</code> 切到 <code>openai</code> 后，新会话能创建；但接续原先标成 <code>custom</code> 的样本时，后端返回了方向正好相反的同类报错：</p>
                <blockquote><p>This chat uses custom, but your current provider is openai. Switch to custom to continue.</p></blockquote>
                <p>报错类型是 <code>modelProviderMismatch</code>。把样本会话的供应商元数据也对齐到 <code>openai</code> 后，普通历史和压缩历史都能接续。这一步解释了为什么不能只验证“新会话能开”：旧会话自己也保存了供应商 ID。隔离实验复现的是接续时的兼容性检查，没有追踪手机原始请求走过的每一层。</p>
              `
            },
            {
              id: "codex-sec-3",
              heading: "实际改了什么，怎么知道修好了？",
              html: `
                <p>我在主机上将默认 <code>model_provider</code> 切到内置的 <code>openai</code>，保留原模型和 ChatGPT 登录，同时对齐本机旧历史里的供应商字段：一处在会话归档的首行，一处在 SQLite 会话索引。这是针对本机旧配置的迁移；若本来就在用自定义服务，切换供应商会改变运行配置，不能直接照搬。</p>
                <p>实际执行中途断过一次，所以收尾以文件和后端读回的结果为准。备份留有原配置、原 SQLite 索引及计划修改文件的原始首行清单；中断前只复制了 4 个完整的压缩文件，没有备份全部压缩历史。</p>
                <div class="table-scroll">
                  <table>
                    <thead><tr><th>验证</th><th>当时的结果</th></tr></thead>
                    <tbody>
                      <tr><td>桌面后端</td><td>Windows 桌面自带的 <code>0.167.0-alpha.3.2</code> 读到默认供应商为 <code>openai</code>；账号仍是 ChatGPT Plus；创建了一个 <code>openai</code> 临时会话</td></tr>
                      <tr><td>历史与索引</td><td>核对 387 个归档首行，确认差异是供应商 ID；343 个压缩流完整解码。补正一条陈旧索引后，SQLite 索引有 421 条 <code>openai</code>、0 条 <code>custom</code>，<code>quick_check</code> 返回 <code>ok</code></td></tr>
                      <tr><td>手机端到端</td><td>回到手机 Remote，发起一个新对话，发送测试消息并收到回复；之后又成功新建了两次</td></tr>
                    </tbody>
                  </table>
                </div>
                <p>公开资料里，<a href="https://github.com/openai/codex/issues/53848" target="_blank" rel="noopener noreferrer">Codex issue #53848</a> 也记录了安卓 Remote 新会话被标成 <code>openai</code>、主机默认仍是 <code>custom</code> 的情况。对方是在 macOS 上发现新对话完成后从列表消失；我遇到的是 Windows 上首条消息报错。这个报告能作旁证，但不能替代本机的复现，也不能证明两处故障走的是同一条代码路径。</p>
              `
            },
            {
              id: "codex-sec-4",
              heading: "另一个坑：能新建了，但无项目对话去了 C 盘",
              html: `
                <p>修好后，我发现手机选择“不指定项目”时，新会话的工作目录仍在 <code>C:\\Users\\&lt;用户名&gt;\\Documents\\Codex\\2026-11-09\\…</code>。原来配置的 <code>desktop.projectlessWorkspaceRoot</code> 是 <code>D:\\AI-Dev\\CodexTasks</code>，桌面后端也读得出这个值。我把同一个值重新保存了一次，手机再建的测试会话依然用了 C 盘。这里看的是会话元数据里的工作目录（<code>cwd</code>）；配置和聊天记录仍在 D 盘的 <code>CodexHome</code>。</p>
                <p><a href="https://github.com/openai/codex/issues/44195" target="_blank" rel="noopener noreferrer">Codex issue #44195</a> 报告了相近的 Windows + 安卓目录现象，不过对方额外遇到了项目受信任校验失败，我这边的测试消息正常完成。到这次排查结束，<strong>供应商不匹配已修复；手机无项目入口仍未遵循 D 盘工作目录设置。</strong> 因此，虽然修归修了，但是对于我这样喜欢把各种软件跟数据放在D盘的人来说，还是尽量不要在选择“无目录（No project）”的情况下创建新的remote会话最好 : )</p>
              `
            }
          ]
        }
,
        {
          id: 'post-rust-sync-bugs',
          issueNo: 'ISSUE 02',
          pinned: false,
          category: 'engineering',
          categoryLabel: '工程与系统',
          title: '两个“歌词跟不上”的 bug：Rust 里的 SMTC 元数据发布与 LRC 时间戳解析',
          subtitle: '一个在全有或全无的系统调用里被封面拖垮，另一个在进入界面前因漏掉一种小数分隔符被解析器直接丢弃。',
          summary: '排查 Rust Windows 桌面音乐播放器的两类同步错位：souvlaki set_metadata() 因错误拼接 file://https:// 封面失败导致曲名停在第一首，以及 LRC 解析器漏掉冒号分隔小数秒导致 67 行正文被丢弃。另附 Windows cargo test os error 1455 处理记录。',
          date: '2026-11-08',
          readMinutes: 7,
          wordCount: '3,918 字符',
          cover: IMAGES.starryRipple,
          tags: ['Rust', 'Windows SMTC', 'souvlaki', 'LRC 解析'],
          specimen: {
            eyebrow: 'CAUSAL SEAM #02 · LRC Parser & SMTC',
            title: '冒号分隔的小数秒与封面回退隔离',
            context: '歌词行 [00:04:22] 与罗马音 [00:04.220] 同表出现，旧解析器丢弃全部 67 行正文',
            lines: [
              { type: 'ctx', text: '署名 [00:00.00] / 原文 [00:04:22] (4220 ms) / 罗马音 [00:04.220]' },
              { type: 'del', text: '旧逻辑：剩余部分仅认 "." 与 ","，遇 [00:04:22] 解析失败并丢弃正文' },
              { type: 'ins', text: "let (seconds, fraction) = rest.split_once(['.', ',', ':']).unwrap_or((rest, \"\"));" }
            ],
            proof: '隔离实验：仅将小数秒前冒号改点，解析器一行不改即从 2 行署名恢复出 67 行定时歌词'
          },
          tldr: [
            'SMTC 切歌不更新曲名：souvlaki 0.8.3 的 set_metadata() 先读缩略图再提交文字，https:// 封面拼上 file:// 触发 0x800700A1，连带整包元数据失败；而 set_playback() 独立调用，造成“进度在走、曲名停在第一首”。',
            '修复策略：仅向系统传绝对本地路径，远程封面异步缓存后再回写；带封面提交失败时当场去掉封面重试，保住文字字段。',
            '歌词只剩署名：解析器仅认 . 与 , 作小数秒分隔符，遇到 [00:04:22] 报错，触发“有定时行则只保留定时行”逻辑导致正文全丢；支持 [\'.\', \',\', \':\'] 后恢复全部 67 行定时歌词。',
            'Windows 全量测试编译链接报 os error 1455（页面文件/提交内存不足）：通过 cargo test -j 1 并对最大界面 crate 设 debug = 1 顺利通过全部检查。'
          ],
          boundaryNote: '事实边界：首轮坏封面测试“发暂停后超时未读到 Paused”可能走了加载期取消待处理请求路径，仍未确认，文中明确标为未证实；代码片段均为简化示意。',
          footnote: '验证环境：Windows 构建隔离数据实测（含 WinRT 直接读取 SMTC 会话与缩略图字节 SHA-256 校验）；文中代码片段均为简化示意。',
          sections: [
            {
              id: 'rust-sec-0',
              heading: '问题概览',
              html: `
                <p>最近在一个用 Rust 写的 Windows 桌面音乐播放器上，先后遇到两个看起来都像“歌词跟不上”的问题：</p>
                <ul>
                  <li>不管切到哪首，应用内一切正常，但系统媒体会话（以及读取它的外部工具）永远显示整张歌单的第一首；</li>
                  <li>歌词面板只剩作词、作曲两行署名，下面挂着一串带时间标签的译文，正文全没了。</li>
                </ul>
                <p>两个问题最后都不在界面层，而在数据变坏的那一刻：一个是<strong>一次“全有或全无”的系统调用被封面拖垮</strong>，另一个是<strong>解析器漏掉了一种时间戳写法，正文在进入界面前就被丢弃</strong>。这篇记录排查思路、修复写法和验证方式，代码片段均为简化示意。</p>
              `
            },
            {
              id: 'rust-sec-1',
              heading: '一、不管放哪首，系统永远显示歌单第一首',
              html: `
                <h3 id="rust-smtc-layer">先确认是哪一层没跟上</h3>
                <p>应用内歌词正常，说明播放器自己的状态没问题。外部工具读的是 Windows 的系统媒体传输控件（SMTC）会话，所以第一步是绕过外部工具，直接从 WinRT 读这个会话：曲名、时长、时间线，再通过系统媒体控件发一次“下一首”。</p>
                <p>结果是：<strong>进度在走，曲名和时长始终是歌单第一首。</strong> 系统保留的是最后一次成功发布的元数据，这说明从第一首之后，每次切歌的发布都失败了。问题就缩小到了“播放器向系统发布元数据”这一条路径上，不必再去追外部工具怎么匹配歌词。</p>

                <h3 id="rust-smtc-cover">一次调用里，封面拖垮了文字</h3>
                <p>播放器用 <a href="https://crates.io/crates/souvlaki" target="_blank" rel="noopener noreferrer">souvlaki</a> 和系统媒体控件打交道。它把两类信息分成两个调用：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Call Flow · souvlaki Windows Backend</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>播放状态与进度 → set_playback()  → 时间线继续更新
<span class="code-line-highlight">曲目元数据与封面 → set_metadata() → 封面出错，曲目字段停在最后一次成功发布的那首</span></code></pre>
                </div>
                <p>日志里能看到元数据发布失败，错误码 <code>0x800700A1</code>（<code>ERROR_BAD_PATHNAME</code>）。原因是封面字段：云端曲目的封面一开始是 <code>https://</code> 地址，而旧代码不分来源，统一在前面拼上 <code>file://</code>，得到一个非法路径。</p>
                <p>关键在于 souvlaki 0.8.3 的 Windows 后端在 <code>set_metadata()</code> 里<strong>先读取缩略图，再提交显示字段</strong>。封面一出错，同一次调用里的标题、歌手、专辑、时长也一起提交失败。而 <code>set_playback()</code> 是独立调用，所以进度照常更新——这正是“进度在走、曲名永远停在第一首”的来源。</p>

                <h3 id="rust-smtc-fix">修复：让文字先走，封面后补</h3>
                <p>思路是把“封面”从“必须和文字一起成功”的位置上拿下来：</p>
                <ol>
                  <li><strong>只把绝对本地路径交给系统当封面</strong>，并统一路径分隔符；远程地址一律不直接交给系统。</li>
                  <li>远程封面由应用自己下载到缓存（有大小和超时上限），下载成功后把缓存路径写回<strong>仍在播放的那首</strong>曲目，再触发一次同步。</li>
                  <li>带封面的提交失败时，<strong>当场去掉封面重试一次</strong>，保住文字字段。</li>
                </ol>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Rust · 简化示意</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>// 简化示意：只有绝对本地路径才转成 file:// 交给系统
fn cover_url(path: &amp;str) -&gt; Option&lt;String&gt; {
    let p = std::path::Path::new(path);
    if p.is_absolute() {
        Some(format!("file://{}", p.display().to_string().replace('\\\\', "/")))
    } else {
        None // 远程地址交给下载缓存，不直接给系统
    }
}

// 简化示意：带封面失败时，去掉封面再提交一次
fn publish_metadata(controls: &amp;mut MediaControls, meta: MediaMetadata&lt;'_&gt;) -&gt; bool {
    if controls.set_metadata(meta.clone()).is_ok() {
        return true;
    }
<span class="code-line-highlight">    let text_only = MediaMetadata { cover_url: None, ..meta };</span>
<span class="code-line-highlight">    controls.set_metadata(text_only).is_ok()</span>
}</code></pre>
                </div>
                <p>还有几处细节决定了它在边界情况下不出错：</p>
                <ul>
                  <li><strong>成功后才记为已发布。</strong> 发布状态是一份快照，只有提交成功才更新“已发布”的标记；失败时快照保持“待发布”。</li>
                  <li><strong>缺失的文字字段显式清空</strong>，否则旧曲目的歌手或专辑会残留在系统会话里。</li>
                  <li><strong>重试不靠定时器。</strong> 同一份快照失败后有五秒冷却，之后搭着下一次进入同步函数的事件再试；曲目或封面变化会立即尝试，单纯的进度推进不会触发这条重试路径。这样既不会刷屏重试，也不需要额外的后台任务。</li>
                </ul>

                <h3 id="rust-smtc-verify">验收：等播放真的开始再断言</h3>
                <p>验收在 Windows 构建上用隔离数据跑了两组：</p>
                <ul>
                  <li><strong>坏封面场景</strong>：恢复队列中的非首曲、播放、切歌、暂停、继续、切回，每一步都直接从 SMTC 核对曲目信息、播放状态和时间线。</li>
                  <li><strong>真实远程封面</strong>：从空缓存开始，比较新缓存文件与 WinRT 读到的缩略图字节的 SHA-256，两者一致，说明系统拿到的就是应用缓存的那张图。</li>
                </ul>
                <p>第一轮坏封面场景失败过一次：看到下一首的元数据后立刻发“暂停”，一直等到超时也没读到 <code>Paused</code>。重跑时改为<strong>先等新曲目的进度确实前进超过一秒</strong>，再发暂停，六个检查点全部通过。</p>
                <p>这里要老实说明：代码允许“先发布曲目信息、再异步加载音频”，加载期间的暂停可能取消待处理的请求。首轮失败是不是走了这条路径，<strong>仍未确认</strong>。这次通过的，是“正常播放之后再暂停”的场景。</p>
              `
            },
            {
              id: 'rust-sec-2',
              heading: '二、歌词只剩署名，正文去哪了',
              html: `
                <h3 id="rust-lrc-formats">同一首歌，三种时间写法</h3>
                <p>先把同一首歌的原文、译文、罗马音放在一起看：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">LRC Timestamps · 对照样本</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>署名            [00:00.00]  → 0 ms
<span class="code-line-highlight">原文和译文      [00:00:06]  → 60 ms     [00:04:22]  → 4220 ms</span>
对应的罗马音    [00:00.060] → 60 ms     [00:04.220] → 4220 ms</code></pre>
                </div>
                <p>署名行用小数点，原文和译文用<strong>冒号</strong>分隔小数秒，罗马音又用小数点。把同一行的标签并排对照，就能确定 <code>[00:04:22]</code> 在这份数据里表示 4.220 秒，而不是“4 分 22 秒”。</p>

                <h3 id="rust-lrc-dropped">正文是怎么被丢掉的</h3>
                <p>旧的时间戳函数先用第一个冒号分出分钟，再在剩下的部分里只认 <code>.</code> 和 <code>,</code> 作为小数分隔符。遇到 <code>[00:04:22]</code>，它把 <code>04:22</code> 整段当成“秒”去解析数字，失败。</p>
                <p>后果是连锁的：</p>
                <ol>
                  <li>原文里只有两条署名行解析成功。解析器的规则是“只要有定时行，就只保留定时行”，于是正文全部被丢弃。</li>
                  <li>译文一条合法时间都没有，整份被当成纯文本，原始标签留在行首。</li>
                  <li>附加译文的逻辑按行序把纯文本译文挂到原文上，前两条恰好落在两条署名下面。</li>
                </ol>
                <p>界面上看到的“只剩署名 + 一串带标签的译文”，就是这三步叠出来的。</p>

                <h3 id="rust-lrc-isolate">把 UI 移出实验</h3>
                <p>为了确认正文到底在哪一步消失，我没有在界面里调，而是写了一个很小的 Rust 程序，直接调用库里的解析函数：</p>
                <ul>
                  <li>原始输入：只得到 <strong>2</strong> 行定时原文，译文没有定时行；</li>
                  <li>只把输入里小数秒前的冒号改成点，解析器一行不改：同一份原文恢复出 <strong>67</strong> 行定时歌词。</li>
                </ul>
                <p>这一步把 UI、滚动、播放进度全部排除在实验之外，也直接指出了补丁该落在哪里。在 Rust 里做这种实验很方便：<code>examples/</code> 目录或一个临时的 <code>bin</code> 就能调用库的公开函数，不用启动整个应用。</p>

                <h3 id="rust-lrc-fix">修复：一个字符</h3>
                <p>补丁只在秒与小数的分隔符里加了一个冒号，继续复用原来的小数转换函数：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Rust · 时间戳切分</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>let (seconds, fraction) = rest
<span class="code-line-highlight">    .split_once(['.', ',', ':'])</span>
    .unwrap_or((rest, ""));</code></pre>
                </div>
                <p>这里用到了一个不太常被注意的写法：<code>str::split_once</code> 接受任何实现了 <code>Pattern</code> 的参数，<strong>字符数组 <code>[char; N]</code> 也可以</strong>，意思是“遇到其中任意一个字符就切”。比起写三次 <code>split_once</code> 或上正则，这样最小、最直观。</p>
                <p>回归测试覆盖了：</p>
                <ul>
                  <li>两位和三位小数；</li>
                  <li>同一份歌词里点和冒号混用；</li>
                  <li>去掉逐词时间标签后正文仍保留；</li>
                  <li>原文、译文、罗马音按整数毫秒对齐，并且署名行不会被附上译文。</li>
                </ul>
              `
            },
            {
              id: 'rust-sec-3',
              heading: '三、Windows 上跑完整测试时的一个坑',
              html: `
                <p>完整工作区检查第一次在编译阶段就中断了，Windows 报 <code>os error 1455</code>（页面文件太小，提交内存不足），还没走到执行测试。</p>
                <p>处理方式是两步：把 Cargo 的并行度降到 1（<code>cargo test -j 1</code>），再只给体积最大的那个界面 crate 降低测试构建的调试信息级别。Cargo 支持按包覆盖 profile，例如：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">TOML · Cargo.toml</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>[profile.test.package.&lt;最大的那个-crate&gt;]
debug = 1</code></pre>
                </div>
                <p>之后全部测试、Clippy 和格式检查都通过。降低 debuginfo 主要省的是链接阶段的内存，对一个大 crate 单独处理，比全局关掉调试信息代价小得多。</p>
              `
            },
            {
              id: 'rust-sec-4',
              heading: '四、下次遇到“显示错位”时',
              html: `
                <p><strong>先对比几个消费同一份数据的界面，记下哪些字段还在变。</strong> 曲名不动但进度在走，就直接读系统会话，找哪一次发布失败；曲名和进度都对但歌词只剩署名，就直接看解析输出有多少行、多少行带时间。先找到哪个边界的输入和输出对不上，再决定往哪一层追。</p>
                <p><strong>复现时只改一个条件。</strong> 去掉封面，看同一份文字能否发布；把时间戳换成等价写法，看同一个解析器能否恢复正文。这样“改完看起来好了”就变成了一条可核对的因果证据。</p>
                <p><strong>按真实使用路径验收，并保留失败的那一轮。</strong> 解析测试能确认毫秒和对齐，真实播放才能确认滚动表现；系统会话字段正确只说明元数据到了，暂停测试还要确认新歌真的开始播放。把这些条件分别写进断言，下次超时就有具体的观测点可查。</p>
              `
            }
          ]
        }
      ];

      const MICRO_LOGS = [
        {
          date: '11.20',
          tag: 'Upstream / macOS VM',
          text: "没有实体 Mac 的四天，我靠云端 ARM64 macOS VM 给 yan 做适配，连续合入 #103 / #105 / #109 / #111 / #117 五个 PR。做 #111 是最挣扎的一个阶段。30 轮补丁依然无法完全修复引号、转义和重定向带来的边界问题，最后改用 shellWord / scanWrites 做词法扫描。用 Safari 下载的正式 ZIP，在 VM 里手动解压时提示「已损坏」。我做了四组对照实验（纯文本 ZIP、第二台 VM、无害脚本、无隔离原件），结合完整性校验确认问题不在打包器。报错可能跟这套 macOS VM 的环境限制有关。我们手头都没有实体 Mac，没法用同一个 ZIP 做实机对照，报错的原因就留了个尾巴。多亏 Devin 提供了 macOS VM。少了这个环境，我可能还要花更久才能走到这一步吧。"
        },
        {
          date: '11.17',
          tag: 'Agent / Upstream #17',
          text: "给一直在用的 Antigravity 主题补丁提了修复分屏指标胶囊的 PR（#17）。首版正文是我自己审完手动发的，偏偏在发现旁聊 / 支线提问（Side Question）里会话容器与输入框是“平级兄弟”而非分屏的“父子包裹”、导致漏修后，追推补丁并让 Agent 顺手通过 API 更新 PR 文档时出了问题：Agent 跑完一串全绿校验（包括左手核对右手的 BODY_EXACT_MATCH: True），结果在正文里裸写 Before #1/#2 触发了 GitHub 自动关联，把截图说明炸成了指向仓库历史 Issue 的一排蓝链。好在习惯性切回网页肉眼扫了一眼，及时改回“图 1 / 图 2”。一时间我想起之前用自制 Agent 壳子没加 Hook 做社区 PR 测试，结果模型跑去别人仓库抢单还在声明里骄傲写下“完全由 AI 生成且无人类监管”被仓库所属组织秒关 PR + Block 的旧事。 即使现在基本不会再犯“不给人类在关键节点审核就推上线”的第一关，似乎还有第二关等着我。可能是从未深入学习pi，dsh的架构让我吃了认知债，还是从一开始，我的基本文档就从未具备过成熟的工程思维？我不清楚，但这不是停下的理由，依然还要继续在实践中学习更多吧。"
        },
        {
          date: '11.16',
          tag: 'Ctx / Upstream #6',
          text: '切到 Orchestrator (Carbon) 后状态胶囊突然飘红 Ctx 400k/256k (156%)：只读拆解会话 SQLite 的 gen_metadata Protobuf 字段，确认 Carbon 真实窗口已下发为 512k（实占 78%），只是本机停在旧版 v5.2.0 仍按固定 256k 分母估算；升至合入 PR #6 的 v5.3.0 后自动恢复 /512k 动态读数。'
        },
        {
          date: '11.16',
          tag: 'CDP / Upstream #12',
          text: '本地预览本站时撞见标题「先正常、120ms 后白底白字隐身」的怪象：原来 Antigravity 主题补丁仅按 127.0.0.1 前缀过滤 CDP 目标，把内置浏览器里的本地页也当成宿主强刷了 body 配色与汉化词典（外加 NewDocument 期 documentElement 空指针）；补上宿主独占指纹三态门禁后已提交上游 #11 / PR #12。'
        },
        {
          date: '11.15',
          tag: '随笔 / 建站',
          text: '把博客的名字定为 Caramelized Notes（焦糖笔记）。以后这里不局限在某几类排障，而是顺着「研究 → 总结 → 发布」的节奏，把系统底层、工具思考和案头阅读慢慢存下来。'
        },
        {
          date: '11.14',
          tag: 'CI / pnpm',
          text: 'pnpm/action-setup@v4 若同时声明 version: 9 与 package.json 的 packageManager: "pnpm@9.14.4"，会触发 Multiple versions of pnpm specified；删去 workflow 的 version 字段保留单一事实源即可。'
        },
        {
          date: '11.14',
          tag: 'Windows Port',
          text: '本机动态 TCP 端口池实测为 1024–15000（excludedportrange 含 13508 与 50000–50059），将 CDP 远程调试从 9233 迁至静态安全区 127.0.0.1:29233，避开临时端口抢占。'
        },
        {
          date: '11.13',
          tag: 'Upstream #1407',
          text: '维护者 #1403 已合入 dev 止住 spawn 异常带崩 host，但 discover.js 的 existsSync() 仍未区分文件与目录；路径类型修复独立留档于 #1407 及 fix/local-agent-nonfile-cli 分支。'
        },
        {
          date: '11.08',
          tag: 'Rust / Windows',
          text: 'Windows 全量运行 cargo test 编译链接期触发 os error 1455（页面文件/提交内存不足），通过 cargo test -j 1 降并行度并对最大界面 crate 单独设 debug = 1 顺利通过检查。'
        }
      ];
