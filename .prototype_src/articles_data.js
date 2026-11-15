      const BLOG_POSTS = [
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
,
        {
          id: 'post-macos-sandbox',
          issueNo: 'ISSUE 03',
          pinned: false,
          category: 'architecture',
          categoryLabel: '架构与工具',
          title: '用 JavaScript 扩展 AI Agent 的 macOS 沙箱：从规则表到跨 Shell 语义',
          subtitle: '为一个既有的 Node.js 应用层沙箱补齐 macOS 能力，真正困难的并不是多列几个危险命令，而是弄清哪些文本会被执行、哪些路径会被写入，以及修复之后如何证明没有破坏原来的判断。',
          summary: '复盘「言」PR #17（基于最终 head 4e44763）：如何在既有 Node.js 本机桥接的静态命令筛查中扩展 macOS 规则、区分路径参数角色、处理 PowerShell 块注释与双引号 $() 遮蔽，并以红/绿回归矩阵、本地 E2E、4 项 CI 与上游 13,561 条回放各自交代证据边界。',
          date: '2026-11-14',
          readMinutes: 18,
          wordCount: '10,447 字符',
          cover: IMAGES.lanternReading,
          tags: ['Node.js', '沙箱安全', 'PowerShell', '回归矩阵'],
          specimen: {
            eyebrow: 'CAUSAL SEAM #03 · server/sandbox.js',
            title: '跨 Shell 引用与块注释遮蔽下的受限补查',
            context: 'PR #17（head 4e44763）对 PowerShell 块注释与双引号 $() 的扫描修复（较 fe78d08 两文件 +74/-18）',
            lines: [
              { type: 'ctx', text: 'echo "$(. <# ordinary comment #> Invoke-Expression $s)"' },
              { type: 'del', text: '仅扫默认视图：块注释结尾 # 被误作行注释起点，遮蔽 $() 内执行位置' },
              { type: 'ins', text: 'return !dotComments && scanned.source.includes("<#") && hasHiddenCommand(shellText(scanned.source, scanned.shell, true), true);' }
            ],
            proof: '同一 32 项测试矩阵对照：fe78d08 (31/1) → 第一版块注释候选 (31/1) → 最终补丁 (32/0)'
          },
          tldr: [
            '边界定位：属于 Node.js 本机桥接内的静态命令文本筛查与路径检查，不是操作系统内核级进程隔离，也非从零实现整套沙箱，既有权限流与执行器保持沿用。',
            '语义优先：macOS 规则需识别动作（launchctl print 与 bootout）与参数角色（rsync 来源与 --remove-source-files），且不能将 Windows NTFS 数据流归一化套到 POSIX 冒号文件名。',
            '最小受限修复：针对 PowerShell 点调用与 <# ... #> 块注释在双引号 $() 中的遮蔽，采用默认关闭的 dotComments 标志做受限补查（相对 fe78d08 两文件 +74/-18），不另写完整 PowerShell 解析器。',
            '分开报告证据：沙箱单测矩阵由 31/1 升至 32/0 且最终 CI 四项全绿；同时严格区分 Mac 本地全量 E2E 1204/1（hover 已知波动）与上游另行报告的 13,561 条真实记录静态回放。'
          ],
          boundaryNote: '严格事实边界（4e44763）：静态筛查不完整分析脚本内部变量与任意多层 Shell 包装；Windows-first 仅指 CI 策略，POSIX 分支不等同承诺支持 Linux；不将 1.3–2× 特定样本开销或 352 次静态 API 核验扩写为通用复杂度或原生执行证明。',
          footnote: '核验基准：PR #17 最终 head 4e447634d931fdf17bb340bf3be1a78710804b44 / 上游 squash 提交 3414c84e5cc136b2a7b22a83851ed8b3e15ad80d。本文针对指定版本与保留证据复盘，不构成覆盖全部 Shell 语法的安全审计结论。',
          sections: [
            {
              id: 'sandbox-sec-0',
              heading: '导语',
              html: `
                <p>最近参与「言」的 <a href="https://github.com/Master-Norna/yan/pull/17" target="_blank" rel="noopener noreferrer">PR #17</a>，工作从补齐 macOS 指令筛查，逐步延伸到 Shell 执行上下文、引号与命令替换、路径参数角色，以及跨平台回归验证。</p>
                <p>这篇文章复盘的不是“用 JavaScript 从零造一个操作系统沙箱”，而是一个更具体的问题：<strong>在既有 AI Agent 工具链里，怎样扩展一层可解释、可测试的应用级防护，同时不把它的安全保证说过头。</strong></p>
                <p>文中代码和结论以最终 PR head <code>4e44763</code> 为主要参照。以下涉及命令的例子用于说明筛查行为，不是执行建议；验证危险形状时只调用筛查函数，没有执行其中的系统修改动作。</p>
              `
            },
            {
              id: 'sandbox-sec-1',
              heading: '一、先说清楚：这里的“沙箱”是什么',
              html: `
                <p>言的相关逻辑主要用 JavaScript 编写，运行在 Node.js 本机桥接中。模型提出命令或文件操作，桥接根据权限、沙箱档位和资源范围决定怎样处理，再调用子进程或文件 API。</p>
                <p>可以把相关链路概括为：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Architecture · Node.js 本机桥接链路</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>模型提出命令 / 文件工具调用
             ↓
       Node.js 本机桥接
       ├─ 命令的静态筛查
       ├─ 文件落点与机密路径检查
       ├─ 应用自身存储敏感项保护
       └─ 按配置选择请示、审查、执行或拒绝
             ↓ 获准的操作
       子进程 / 文件系统 API</code></pre>
                </div>
                <p>这是一张职责示意图，不表示所有操作都顺次经过同一组检查。不同权限和沙箱配置会选择不同分支。</p>
                <p>底层命令执行仍使用 Node.js 的 <code>child_process.spawn</code>：Windows 走 PowerShell，macOS 走 <code>/bin/sh</code>。JavaScript 是实现这些防护逻辑的语言，不是说工具只能运行 JavaScript，也不是在 Node.js 的 <code>vm</code> 上下文里隔离一段 JS。</p>
                <p>最重要的边界，仓库文档已经说得很直接：</p>
                <blockquote><p>这是静态筛查，不是进程隔离。</p></blockquote>
                <p>它没有因为多写了一层 JavaScript，就让子进程获得低于用户的系统权限，也没有给任意脚本建立操作系统级的文件、网络或系统调用隔离。被允许的脚本仍然以用户权限运行，脚本内部的代码不在这层命令文本筛查的完整分析范围内。</p>
                <p>因此，“基于 JavaScript、扩展到 macOS 的应用层沙箱”是合适的描述；“macOS 原生隔离沙箱”或“可以安全执行任意代码”则不是。</p>

                <h3 id="sandbox-existing-vs-new">哪些原来就有，哪些是这次扩展的</h3>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>层次</th>
                        <th>既有能力</th>
                        <th>本 PR 的主要工作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>工具执行与权限</td>
                        <td>Node.js 桥接、命令执行、文件工具，以及请示和审查流程</td>
                        <td>沿用既有执行链路，没有另造一个执行后端</td>
                      </tr>
                      <tr>
                        <td>路径、环境与应用配置</td>
                        <td>工作目录约束、机密文件检查、机密环境变量过滤、存储根敏感项保护</td>
                        <td>保留这些职责，并修正涉及跨平台路径解释的部分细节</td>
                      </tr>
                      <tr>
                        <td>命令规则</td>
                        <td>原有 Windows 相关筛查</td>
                        <td>补齐 macOS 命令类别、提权与动态执行相关判定</td>
                      </tr>
                      <tr>
                        <td>语法理解</td>
                        <td>原有指令位匹配与筛查逻辑</td>
                        <td>增加、统一引号与执行上下文扫描，处理多种包装、命令替换和参数角色</td>
                      </tr>
                      <tr>
                        <td>验证</td>
                        <td>原有单元、类型、格式与端到端检查</td>
                        <td>扩充跨平台用例，在后续修复中将指定回归矩阵入库</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>这个区分很重要：不能把项目已有的权限系统和执行器，都算成本次从零实现的成果。</p>
              `
            },
            {
              id: 'sandbox-sec-2',
              heading: '二、三档权限、两档沙箱，不等于“四级权限”',
              html: `
                <p>理解这套实现，还要分清几组容易混淆的概念。</p>
                <p>用户操作层有“问而后行、审而后行、径行”三档权限；沙箱本身有严、宽两种主要筛查范围。两者相关，但不是同一个开关。</p>
                <p>例如，严档侧重工作目录、机密路径和命令限制；宽档主要守住明确会伤及系统的动作，不再把普通目录外写入、联网等行为一概作为沙箱拒绝项。严档拒下的命令，也可能进入用户明确批准、单条出沙箱执行的流程。因此，<strong>某个筛查函数返回拒绝，不等于整个产品在任何配置下都绝不允许这项操作。</strong></p>
                <p>代码中经常一起验证的四个入口，又是另一组分工：</p>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>入口</th>
                        <th>主要职责</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>screenCommand</code></td>
                        <td>严档命令筛查，包含写入路径等限制</td>
                      </tr>
                      <tr>
                        <td><code>screenLoose</code></td>
                        <td>宽档沙箱筛查，主要保护系统本身</td>
                      </tr>
                      <tr>
                        <td><code>screenAutoReview</code></td>
                        <td>审而后行的规则筛查</td>
                      </tr>
                      <tr>
                        <td><code>screenUnreviewable</code></td>
                        <td>审查批准之后仍不能越过的特定底线，如直接调用自身桥接、部分动态执行形状</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>四个函数不是四个递增的用户权限等级，更不是四个操作系统隔离级别。存储根中配置、备份和登录文件的保护，还由独立检查承担，不能只看这四个函数就推断所有路径都会被怎样处理。</p>
                <p>另外，<code>sandboxEnv</code> 会按变量名过滤像机密的环境变量，并在套用沙箱的子进程启动路径中使用它。这能减少凭据直接继承，却不等于隔离了凭据的所有来源：文件、脚本或其他服务中的信息，并不会因为过滤了环境变量就自动消失。</p>
              `
            },
            {
              id: 'sandbox-sec-3',
              heading: '三、macOS 适配：规则要认识“动作”，而不只是程序名',
              html: `
                <p>最直观的新增能力，是为 macOS 常见系统工具补规则。下面只列几个代表，不是完整支持清单：</p>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>工具</th>
                        <th>查询或普通文本示例</th>
                        <th>需要限制的动作类别</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>launchctl</code></td>
                        <td><code>list</code>、<code>print</code></td>
                        <td>加载、卸载、启停和修改服务配置</td>
                      </tr>
                      <tr>
                        <td><code>defaults</code></td>
                        <td><code>read</code>、<code>domains</code></td>
                        <td>写入、删除、导入或重命名设置</td>
                      </tr>
                      <tr>
                        <td><code>crontab</code></td>
                        <td><code>-l</code></td>
                        <td>编辑、删除或安装计划任务</td>
                      </tr>
                      <tr>
                        <td><code>diskutil</code></td>
                        <td><code>list</code>、<code>info</code></td>
                        <td>擦除、分区和部分 APFS 修改</td>
                      </tr>
                      <tr>
                        <td><code>networksetup</code></td>
                        <td>查询与列表参数</td>
                        <td>修改网络服务和配置</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>这些已识别动作在严、宽、审规则中受到限制；是否可进入用户批准或审查流程，还取决于前面提到的权限配置。不能把“筛查命中”简化成所有模式下的绝对禁止。</p>
                <p>同时，规则也不能看到 <code>launchctl</code> 就拦。例如：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell · 非服务修改示例</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>launchctl print gui/501
command -v launchctl
echo "launchctl bootout gui/501/com.example.service"</code></pre>
                </div>
                <p>三行分别是查询、查找命令，以及输出普通文本，不应因为包含同一个程序名而一起被当成服务修改。</p>
                <p>这次实现把 macOS 与 Windows 规则放进共用清单，而不是按宿主平台拆成两套互不相干的黑名单。平台差异主要体现在路径和 Shell 语义等地方。<strong>同一份规则表可以共用，不代表所有平台都按同一种 Shell 语法解析。</strong></p>
                <p>还有刻意保守的例外：<code>sudo</code> 除了指令位判断，还使用去掉引号内容后的整词检查，甚至会命中 <code>echo sudo x</code>。这是一项有明确误报取舍的策略，不能把整套实现描述成“所有命令都精确到真实执行位、绝无误报”。</p>
              `
            },
            {
              id: 'sandbox-sec-4',
              heading: '四、路径不是普通字符串：来源、目标和选项值的角色不同',
              html: `
                <p>把 Windows 逻辑移到 macOS，也不是把反斜杠换成正斜杠这么简单。</p>
                <p>先看一个同步场景：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell · rsync 参数角色示例</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>rsync -a --exclude node_modules /Users/example/source/ ./backup/</code></pre>
                </div>
                <p>如果当前工作目录是项目目录，源目录在外、目标目录在内，这仍可能是合理的导入操作。简单规定“命令中出现目录外路径就拒绝”，会把只读来源一起拦下。</p>
                <p>反过来，也不能把某个参数一律当作只读来源。<code>rsync --remove-source-files</code> 会删除来源，来源就不能继续享受相同豁免。</p>
                <p>因此，这部分实现需要识别有限的参数角色：</p>
                <ul>
                  <li>哪个是被支持形式中的来源路径；</li>
                  <li>哪个是目标、日志或临时目录等写入参数；</li>
                  <li>哪个只是过滤模式、sed 脚本或选项值，不该当作写入路径。</li>
                </ul>
                <p>PR 为 <code>rsync</code>、<code>ditto</code>、<code>sed</code> 等补充了相关处理，并扩充 <code>chmod</code>、<code>chown</code>、<code>chflags</code>、<code>ln</code> 等写动词识别。这里做的是有限语法下的参数分析，不是完整模拟每个工具所有版本的行为。</p>
                <p>另一个细节是冒号。Windows 的 NTFS 数据流写法，与 macOS 路径中的普通冒号不是同一种语义。为防止 Windows 数据流路径绕过而做的归一化，不能无条件套到非 Windows 文件名上。相应处理需要保留平台条件，存储根检查中的斜杠归一化也要与实际路径比较分开看。</p>
                <p><strong>归一化不是越多越安全。按错平台归一化，本身就可能改变安全判断。</strong></p>
                <p>结构化文件工具另外有自己的路径与链接检查。这与命令文本筛查是两条不同的防护路径，不能把其中一条的能力推定到另一条上，更不能理解成对子进程所有文件访问的强制隔离。</p>
              `
            },
            {
              id: 'sandbox-sec-5',
              heading: '五、为什么 macOS 扩展最终会遇到 PowerShell 回归',
              html: `
                <p>原因在于共用扫描逻辑。</p>
                <p>macOS 命令规则增加之后，还要处理前缀、包装和引用：<code>env</code> 后面有真正的命令，<code>bash -c</code> 的参数里可能有可执行文本，普通引号参数中的括号却不该制造新的指令位。</p>
                <p>PR 因此不仅增加了规则，也引入了更细的扫描上下文。实现使用引号收尾缓存、命令替换收尾表和显式扫描栈，在有限范围内区分普通文本与执行内容，而不是对所有输入只跑一个无上下文的关键词表达式。</p>
                <p>这不是完整的 Shell 解析器，但它已经必须面对解释顺序。例如，在 PowerShell 上下文中：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell · 外层双引号求值示例</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>bash -c "echo '$(Write-Output SAFE)'"</code></pre>
                </div>
                <p>不能因为看到了“内层单引号”，就把其中的 <code>$()</code> 当作不会执行的字面量：它首先处于外层 PowerShell 的双引号中，外层会先求值，再把结果交给 Bash。PowerShell 官方引号规则也明确区分了双引号中的表达式展开与单引号字面量。</p>
                <p>这条经验可以推广为：</p>
                <blockquote><p>安全筛查应跟着真正的解释顺序走，而不是凭肉眼看到的最内层引号决定整段文本的含义。</p></blockquote>
                <p>也正因为底层逻辑共用，修正 macOS/POSIX 相关行为时，仍然需要保护 Windows/PowerShell 已有判定。仓库本身是 Windows-first：Windows 两项主要 CI 必须通过，macOS 测试只作参考；代码中存在 POSIX 分支，也不等于项目承诺支持 Linux。</p>
              `
            },
            {
              id: 'sandbox-sec-6',
              heading: '六、一个典型回归：从关键词误报，到漏掉真正的调用',
              html: `
                <p>这次修复过程中，<code>Invoke-Expression</code> 很能说明问题。</p>
                <p>如果只按单词匹配，普通搜索就容易被误伤：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">Shell · 搜索负例</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>rg Invoke-Expression src
git log -S Invoke-Expression</code></pre>
                </div>
                <p>但把规则收紧到“看起来像命令名的位置”，也可能漏掉原先拦住的执行形状。较早的一版候选补丁，就被独立复核发现会放过 <code>Invoke-Expression($s)</code>、部分括号调用和赋值右侧写法。那版候选因此被退回修改，没有作为最终补丁发布。</p>
                <p>后续又发现，点调用不能拿另一个名字相近的例子来代替判断：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell · 点调用对照</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>. Invoke-Expression $s
. iex $s</code></pre>
                </div>
                <p>上游 main 对第一条会拦，对第二条却存在既有漏判。因此，“main 也放过 <code>. iex</code>”不能证明“. Invoke-Expression 的放行只是旧缺口”。正确比较必须是：<strong>同一条完整输入，在 main、PR 当前版本和候选补丁上的结果。</strong></p>
                <p>这一步最值得复盘的，并不是正则少写了哪几个字符，而是分类方法出了偏差：把语义相近、名字不同的样例，当成了是否回归的充分对照。</p>
                <p>本文提到的 P1/P2，沿用该 PR 讨论和独立复核中的优先级，不是另行发布的 CVE 或 CVSS 结论。</p>

                <h3 id="sandbox-block-comment">普通块注释又暴露了一层边界</h3>
                <p>点调用和反引号续行补齐后，维护者继续指出：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell · 块注释点调用</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code>. &lt;# ordinary comment #&gt; Invoke-Expression $s
. &lt;# ordinary comment #&gt; 'Invoke-Expression' $s
$r = . &lt;# ordinary comment #&gt; Invoke-Expression $s</code></pre>
                </div>
                <p>PowerShell 允许普通块注释放在代码中间，点调用仍然成立。维护者还在 Windows PowerShell 5.1 和 PowerShell 7 上，用只输出固定标记的内容验证了相应调用，不是仅凭字符串猜测。</p>
                <p>而筛查逻辑当时只把空白和真实反引号续行当作点号与命令名之间的间隔，遇到 <code>&lt;# ... #&gt;</code> 就断开了。</p>
                <p>第一版块注释修复补上了直接调用，却仍漏掉另一个普通上下文：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">PowerShell · 双引号 $() 内块注释</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code><span class="code-line-highlight">echo "$(. &lt;# ordinary comment #&gt; Invoke-Expression $s)"</span></code></pre>
                </div>
                <p>这里的 <code>$()</code> 在双引号中仍会求值。独立复核发现，问题已经不只在“跳过注释后能否认出名字”：原有行注释处理会在相关扫描路径把块注释结尾处的 <code>#</code> 当成行注释起点，影响 <code>$()</code> 收尾配对，导致执行位置没有暴露给后续规则。</p>
                <p><strong>如果候选位置在前一阶段已经被遮掉，继续扩充后一阶段的命令名正则，就补不回来。</strong></p>
              `
            },
            {
              id: 'sandbox-sec-7',
              heading: '七、最终处理：复用扫描器，只给特定规则一次受限补查',
              html: `
                <p>最后一轮没有把共用扫描结果整体换成另一种解释，也没有顺势实现一个完整 PowerShell 解析器。</p>
                <p>处理分为两部分。</p>
                <p>第一，在已经确认的点调用候选处，保留并读取扫描输入原文，按当前位置跳过普通块注释、行内空白和真实反引号续行，再确认完整的 <code>Invoke-Expression</code> 名字，包括成对单、双引号形式。</p>
                <p>这里使用 sticky 正则游标，意思是“只能从当前位置继续识别间隔”，不是在后面随便找一个命令名。语法视图会标记转义字符，原文检查则用于区分真正的续行与其他转义，不能把所有转义都当成空白。</p>
                <p>第二，为双引号 <code>$()</code> 的配对问题，在既有扫描流程中传递一个默认关闭的 <code>dotComments</code> 标志。原 HIDDEN 检查没有确认命中、且输入含 <code>&lt;#</code> 时，才运行一次专用扫描流程。</p>
                <p>实际代码末尾的控制条件如下，这是函数片段，不是完整实现：</p>
                <div class="code-figure">
                  <div class="code-figure-bar">
                    <span class="code-lang">JavaScript · server/sandbox.js 控制条件片段</span>
                    <button type="button" class="code-copy-btn">复制代码</button>
                  </div>
                  <pre><code><span class="code-line-highlight">return !dotComments &amp;&amp;</span>
<span class="code-line-highlight">  scanned.source.includes("&lt;#") &amp;&amp;</span>
<span class="code-line-highlight">  hasHiddenCommand(</span>
    shellText(scanned.source, scanned.shell, true),
    true
  );</code></pre>
                </div>
                <p>它的约束比“再扫一遍”更重要：</p>
                <ol>
                  <li>第二次调用不会再次触发自身补查。</li>
                  <li>补查只接受“点调用 + 块注释 + 完整命令名”这一类目标。</li>
                  <li>其他规则继续使用原视图，不拿补查结果顺便扩展判断范围。</li>
                  <li>正常路径已经确认的命中优先返回，不由补查取消。</li>
                </ol>
                <p>相对 <code>fe78d08</code>，最后这一轮只改两个文件，合计 <strong>+74/-18</strong>；整个 PR 的合并变更则涉及七个文件。二者不是同一统计口径。</p>
                <p>这里的“最小修改”，指的是尽量限制修复对其他规则和默认语义的影响，不是追求正则表达式最短，也不是宣称已经找到数学意义上行数最少的方案。</p>
              `
            },
            {
              id: 'sandbox-sec-8',
              heading: '八、验证的关键，不只是让新版本变绿',
              html: `
                <h3 id="sandbox-val-red-green">1. 让回归测试先证明自己会失败</h3>
                <p>维护者明确要求：点调用、续行、块注释和普通搜索负例，不能只留在仓库外的临时探针中。</p>
                <p>最终在原有沙箱测试项里扩充了矩阵：三种命令名形式、直接调用/赋值 RHS/裸 <code>$()</code>、九种间隔，再补普通块注释下的双引号 <code>$()</code> 包装及搜索负例。没有新增测试文件或无关顶层测试项。</p>
                <p>顶层测试数仍是 32，但内部断言已经增加。“32 项测试通过”既不表示只测了 32 条命令，也不能拿来声称“没有新增断言”。</p>
                <p>独立复核把同一套新断言分别用于不同生产源码，结果是：</p>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>被测源码</th>
                        <th>结果</th>
                        <th>抓到的问题</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>fe78d08</code></td>
                        <td>31 通过、1 失败</td>
                        <td>普通块注释点调用</td>
                      </tr>
                      <tr>
                        <td>第一版块注释候选</td>
                        <td>31 通过、1 失败</td>
                        <td>双引号 <code>$()</code> 中的同类残留</td>
                      </tr>
                      <tr>
                        <td>最终补丁</td>
                        <td>32 通过、0 失败</td>
                        <td>上述指定回归通过</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>这比单独报告“最终绿了”更有说服力：新增测试确实能抓住旧问题，也能区分一个不完整修复与最终候选。</p>

                <h3 id="sandbox-val-review">2. 修复与复核分开，但不把独立复核神化</h3>
                <p>修复在 macOS 会话中进行，再交给未实现这份补丁的独立会话检查。复核不只重跑报告，还比较基线、候选、普通搜索负例、四个入口和旧场景，并核对实际补丁。</p>
                <p>最终复核中，1398 行对照的默认扫描视图与基线一致，旧场景矩阵也没有发现阻塞回退。这些是“默认行为尽量不被这条专用补查改变”的定向证据，不是对所有输入的形式化证明。</p>
                <p>一次候选修复即使已有测试通过，仍可能被新的机制探针发现问题；反过来，独立复核给出“本轮范围可推”，也不等于实现了全部 Shell 语法。</p>

                <h3 id="sandbox-val-perf">3. 性能必须检查，也必须承认额外成本</h3>
                <p>扫描器通过收尾缓存、显式栈和失败结果缓存，减少重复扫描。块注释专用路径中，也要避免对同一未闭合后缀反复查找。</p>
                <p>定向长输入测试没有观察到新增平方级或指数级退化。但部分含标记、原检查未命中的长串，会付出额外扫描的常数开销；独立测量中的部分样本约为基线的 1.3–2 倍。</p>
                <p>这组对照是在 macOS 上对筛查 API 预热后，取五次测量的中位数，不是原生 Shell 执行耗时，也不代表日常命令一律增加相同开销。</p>
                <p>所以，准确结论是“在已测输入家族中未见新增非线性退化”，不是“零性能成本”，更不是仅凭几个耗时数字就证明最坏复杂度。</p>

                <h3 id="sandbox-val-ci">4. 本地 macOS 结果与最终 CI，必须分开报告</h3>
                <p>最后一轮完整补丁的本地参考验证是：</p>
                <div class="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>检查</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>沙箱单测</td>
                        <td>32 通过、0 失败</td>
                      </tr>
                      <tr>
                        <td>类型检查</td>
                        <td>通过</td>
                      </tr>
                      <tr>
                        <td>全仓 Prettier 检查</td>
                        <td>通过</td>
                      </tr>
                      <tr>
                        <td><code>npm test</code> 单元部分</td>
                        <td>448 通过、0 失败、3 跳过</td>
                      </tr>
                      <tr>
                        <td><code>npm test</code> 端到端部分</td>
                        <td>1204 通过、1 失败，整体退出码为 1</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>唯一端到端失败是悬停提示断言。此前同一 <code>fe78d08</code> 原基线也复现过该失败；最新基线与补丁的单例检查则都为 15/0。</p>
                <p>这些证据支持“它不是本补丁独有、存在既有波动”的判断，却不能把本次全量运行写成通过，也不能说已经定位了不稳定的最终根因。</p>
                <p>最终 head 的 CI 则是另一组结果：Windows 单元/类型/格式、Windows 全量端到端、Node 22 单元以及 macOS 参考任务，四个 job 均完成并通过。</p>
                <p>在 macOS 上给函数传入 <code>platform: "win32"</code>，只是在测试 Windows 静态筛查分支，不是原生 Windows/PowerShell 执行验证。两种证据都需要，但不能互相冒充。</p>

                <h3 id="sandbox-val-replay">5. 真实历史回放与构造探针，各自回答不同问题</h3>
                <p>维护者在最终验收中另行报告：重新静态回放 <strong>13,561 条真实记录</strong>，其中言 4,350 条、Claude Bash 9,211 条，按来源、工作目录与指令去重。对照 <code>fe78d08</code> 与 <code>4e44763</code>，win32/darwin 四个入口的判定均无变化。回放只调用筛查函数，没有执行历史命令。</p>
                <p>这不是修复会话自行完成的数据，也不能借来证明所有块注释形状都已覆盖。</p>
                <p>它说明的是：在这批真实使用记录里，没有观察到判定变化。新增回归是否修复，则由额外构造样例和红/绿测试证明。<strong>历史语料擅长发现现实误伤，机制探针擅长探索语料尚未出现的结构，两者不能互相替代。</strong></p>
              `
            },
            {
              id: 'sandbox-sec-9',
              heading: '九、这次做得不够好的地方',
              html: `
                <p>复盘不能只留下最终方案，几次绕路同样值得记下来。</p>
                <p><strong>第一，把范围收窄误当成覆盖更准确。</strong> 为消除关键词误报而收紧执行位时，没有一次保住所有原有调用形状。改进办法不是无限扩测试，而是在修改识别边界时，同时列出必须保持的正例与负例。</p>
                <p><strong>第二，用相似命令代替同一输入对照。</strong> <code>. iex</code> 的旧漏判不能替 <code>. Invoke-Expression</code> 的新回归开脱。以后判断“既有边界还是本 PR 引入”，先做同输入、同平台模式、同入口的版本对照。</p>
                <p><strong>第三，临时探针没有及时变成持续回归保护。</strong> 点调用和续行阶段的外部探针能帮助定位，却不会随仓库 CI 自动运行。后来根据上游要求确认范围，将指定断言加入原有测试项，才补上这一环。</p>
                <p><strong>第四，代码、验证说明与 PR 正文没有同步完成。</strong> 最新代码已经推送，正文却还保留旧 head 和“本轮未新增或修改测试”。维护者再次指出后，最终在合并后补齐了说明。这不是代码运行错误，却会让读者无法判断一组结果究竟验证了哪个版本。</p>
                <p>更合理的交付顺序应是：确定最终补丁和身份、推送、核对该 head 的检查，再把正文与评论同步到同一版本；不能把“代码推上去了”当成交付已经完整结束。</p>
              `
            },
            {
              id: 'sandbox-sec-10',
              heading: '十、结论：扩展的是防护能力，不是无限的安全承诺',
              html: `
                <p>这次 PR 没有引入新的 npm 运行时依赖，没有另写一套 macOS 执行器。主要工作是在既有 Node.js 工具链里补齐规则、统一有限的执行上下文扫描，并用跨平台对照守住已有行为。</p>
                <p>但它仍然不是一个能约束任意代码的隔离环境：</p>
                <ul>
                  <li>不能完整分析脚本内部、运行时变量和任意多层 Shell 包装；</li>
                  <li>命令文本筛查不等于跟踪子进程实际经过的所有文件路径；</li>
                  <li>参数支持与规则覆盖都有边界，未识别的写法不一定会被拒绝；</li>
                  <li>已知低影响文字误报、复杂注释或后续多条调用的组合，并未全部修尽；</li>
                  <li>“main 已有缺口”“本 PR 回归”和“本轮未覆盖”必须分别说明，不能统称已经修复。</li>
                </ul>
                <p>最终，维护者在复核与 CI 通过后，合并了 PR #17。真正可迁移的经验，不是那几条 macOS 命令规则，而是下面三件事：</p>
                <ol>
                  <li><strong>在执行之前设检查，比只在提示词里要求模型谨慎更具体；但应用层检查不是操作系统隔离。</strong></li>
                  <li><strong>跨平台适配的核心是解释语义与资源角色，而不只是命令名和路径分隔符。</strong></li>
                  <li><strong>安全修复需要一条可追溯的证据链：同输入对照、旧版红灯、新版绿灯、负例保留、独立复核，以及与最终版本对应的说明。</strong></li>
                </ol>
                <p>把边界说清楚，并不削弱这层防护的价值。恰恰相反，只有知道它在哪里可靠、哪里必须依赖其他机制，才谈得上正确使用它。</p>
              `
            },
            {
              id: 'sandbox-sec-refs',
              heading: '资料与证据',
              html: `
                <hr />
                <ul>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17" target="_blank" rel="noopener noreferrer">PR #17：完整讨论与合并记录</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">贡献规范：Windows-first、macOS 参考、CI 与 squash 流程</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/docs/sandbox.md" target="_blank" rel="noopener noreferrer">合并版本的沙箱文档：权限、隔离边界与 macOS 规则</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/index.js" target="_blank" rel="noopener noreferrer">合并版本的工具路由</a>、<a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/shell.js" target="_blank" rel="noopener noreferrer">Shell 执行器</a>与<a href="https://github.com/Master-Norna/yan/blob/3414c84e5cc136b2a7b22a83851ed8b3e15ad80d/server/work/paths.js" target="_blank" rel="noopener noreferrer">路径工具</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6860117259" target="_blank" rel="noopener noreferrer">维护者纠正点调用回归的归类</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6870364900" target="_blank" rel="noopener noreferrer">维护者指出普通块注释残留并要求入库断言</a></li>
                  <li><a href="https://github.com/CaramelizedCUDA/yan-local-chat/commit/4e447634d931fdf17bb340bf3be1a78710804b44" target="_blank" rel="noopener noreferrer">最终一轮补丁：相对 fe78d08 的两文件修改</a></li>
                  <li><a href="https://github.com/CaramelizedCUDA/yan-local-chat/blob/4e447634d931fdf17bb340bf3be1a78710804b44/server/sandbox.js#L1510-L1540" target="_blank" rel="noopener noreferrer">受限补查实现</a>与<a href="https://github.com/CaramelizedCUDA/yan-local-chat/blob/4e447634d931fdf17bb340bf3be1a78710804b44/test/unit/sandbox.test.mjs#L713-L757" target="_blank" rel="noopener noreferrer">入库回归矩阵</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/actions/runs/43563903000" target="_blank" rel="noopener noreferrer">最终 head 的 CI</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6872924458" target="_blank" rel="noopener noreferrer">维护者最终验收：定向检查、真实记录回放与 CI 口径</a></li>
                  <li><a href="https://github.com/Master-Norna/yan/pull/17#issuecomment-6873568318" target="_blank" rel="noopener noreferrer">合并后的验证与范围说明</a></li>
                  <li><a href="https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules?view=powershell-7.5" target="_blank" rel="noopener noreferrer">PowerShell 官方引号规则</a></li>
                </ul>
                <p>本文是针对上述版本与证据的工程复盘，不是覆盖全部 Shell 语法的安全审计结论，也不承诺后续版本行为不变。</p>
              `
            }
          ]
        }

      ];

      const MICRO_LOGS = [
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