// === 排序轴 ===
// 每个 tab 的每一行 payload 统一带 rsi / volume / volumeFormatted / cvdStrength 字段
// （加密行另带 takerStrength，A股/美股/ETF 行另带 volRatio/emaGap），排序键稳定；
// 默认轴（sorts[0]）＝该 tab 的主指标，**必须与后端 `value` 取的量一致**，否则首屏值列
// 显示的是另一根轴的数。
// ⚠️⚠️ **本段刻意不再写死"某族几轴"**（2026-07-29 审计）：原文停在「股票系五轴 / 加密
// 四轴 / 涨跌幅六轴」，那是 2026-07-22 的快照，此后加 ADX/DI、砍 DI、加日/周MACD、加日
// 波动幅度、删周成交额若干轮，全都没跟着改，且还在引用早已移除的 `dailyEma921`/
// `weeklyStrategy`/涨跌幅榜。**要数轴就去数下面那几个 sorts 常量本身**
// （现役**只剩两个**：`cryptoStrategySorts` 16 轴 / `singleStrategySorts` 15 轴 ——
// 2026-07-30 轴数对齐时 `cryptoWeeklyExpansionSorts` 已并入前者、删除）——
// 这个"注释里写死数字然后发霉"的坑本仓库已经犯到第四次。
// sortField 直接是行上的字段名，getSortedItems 按它比较（null 沉底）。
//
// CVD强弱 = 归一化买卖失衡比 ∈ [−1,+1]（后端 calc_cvd_strength）：+1 纯买/吸筹、0 均衡、
// −1 纯卖/派发。**为什么不排原始 CVD**：原始 CVD 是币本位、随成交量缩放，跨标的排序≈排
// 成交量，和「成交额」轴重复；除以总成交量归一化后才无量纲、跨标的可比。降序=最坚决净买
// 入在顶，升序=最坚决派发在顶。带符号显示 +0.58（不用 +58%：和涨跌幅共用「值」列，% 会让
// 切到 CVD强弱 时的 +0.58 和涨跌幅的 +5% 视觉混淆）。中性不上色（买卖方向靠 +/− 符号，
// 避开涨跌幅红绿 + A股 data-asset 翻转的纠缠）。null（新股/历史不足）显示「—」，排序沉底。
function fmtCvdVal(x) { return x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2); }
function fmtRsiVal(x) { return x == null ? "N/A" : x.toFixed(2); }
function fmtVolVal(v) { return v.volumeFormatted != null ? v.volumeFormatted : "N/A"; }
// 量比 = 当期成交量/前 5 期均量（无量纲倍数，1.00 = 与近期持平）；EMA间距 = (EMA9−EMA21)/EMA21
// 的百分比（带符号——它真是百分比，跟 CVD强弱 刻意不带 % 的理由不冲突；涨跌幅榜切到此轴时
// 副行仍显式带「涨幅 +X%」，不会混淆）。null（历史不足/新股）显示「—」，排序沉底，中性不上色。
function fmtRatioVal(x) { return x == null ? "—" : x.toFixed(2); }
function fmtGapVal(x) { return x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2) + "%"; }
// 振幅（免费"振幅榜"）：永远非负的百分比幅度，中性显示不带符号。null 显示「—」沉底。
function fmtAmpVal(x) { return x == null ? "—" : x.toFixed(2) + "%"; }
// ADX / +DI / −DI（2026-07-25 站长要求引入的方向性运动系统）：三者都是 0-100 的无符号
// 指数，**不是百分比也不是倍数**，故不带 % / ×，只保留两位小数（同 TV 显示口径）。
// null（不足 28 根已收盘 K 的次新标的）显示「—」、排序沉底。
// ⚠️ DI差（= +DI − −DI）是**带符号**的，走既有的 fmtCvdVal（那个函数本身就是"带符号数字
// 两位小数"的通用格式化，与 CVD强弱 共用不是巧合；刻意不另造一个同形近亲函数——本项目
// 多次栽在"两个几乎一样的东西选错一个、不报错只能肉眼发现"上）。
function fmtDmiVal(x) { return x == null ? "—" : x.toFixed(2); }

// 副行：显示当前排序轴**之外**的其余轴摘要（值列已展示当前轴，副行是快览、不承诺穷尽）。
// volLabel 区分 成交额/周成交额/月成交额；extra 是可选的价格/回顾上下文（涨跌幅/信号根等）。
// ⚠️ 轴摘要封顶 SUB_AXES_MAX 段（2026-07-22 深夜审美 PASS 修复）：桌面端 .sub 是
// white-space:normal，超过 ~5 段会折行、行高 60→76px 节奏破坏——etfChange 当天就已实测
// 60/76 混排（7 段），日线策略行家族扩到 7-8 轴后必然全员折行。被裁掉的轴不丢功能：
// 排序条 chip 一键切换后进值列展示。extra（价格上下文）永远保留、不占轴额度。
// 段落顺序即优先级——weeklyRsi 排在 cvdStrength 后（周线强度是 weeklyStrategy 的锚点
// 维度；只有该榜的行有这个 key，其他榜不受影响）。移动端 .sub 本就 nowrap 截断，不受此限。
const SUB_AXES_MAX = 4;
/** 副行里某个轴的标签：**优先取当前 tab 自己 sorts 里的 label**，取不到才用兜底。
 *  2026-07-24 改成查表式，替掉了原来"副行硬编码一份标签、必须和 AXIS_* 常量手工保持
 *  一致"的写法——那个坑 2026-07-23 真的踩过一次（排序条已改成 RSI/CVD强弱，副行还是
 *  旧的 强度/资金强弱）。这轮给股票系单策略榜的轴加了周期前缀（日线RSI/日CVD强弱/
 *  日量比/日EMA间距），若还是硬编码就会**第二次**踩同一个坑，索性从根上消掉。
 *  对加密各榜零视觉变化：它们 sorts 里的 label 与原硬编码值逐字相同。 */
function axisLabelFor(key, fallback) {
    const sorts = (TABS_CONFIG[currentTab] || {}).sorts || [];
    const hit = sorts.find(x => x.key === key);
    return hit ? hit.label : fallback;
}
function axesSub(item, sf, volLabel, extra) {
    const seg = [];
    if (sf !== "rsi") seg.push(`${axisLabelFor("rsi", "RSI")} ${fmtRsiVal(item.rsi)}`);
    // volLabel 由调用方显式传（同一个 volume 字段在日/周/月榜含义不同，且免费行情榜
    // 的主轴就是它，不能反查自己）
    if (sf !== "volume") seg.push(`${volLabel} ${fmtVolVal(item)}`);
    if (sf !== "cvdStrength") seg.push(`${axisLabelFor("cvdStrength", "CVD强弱")} ${fmtCvdVal(item.cvdStrength)}`);
    if ("weeklyRsi" in item && sf !== "weeklyRsi") seg.push(`${axisLabelFor("weeklyRsi", "周线RSI")} ${fmtRsiVal(item.weeklyRsi)}`);
    // 周成交额（2026-07-25 晚指令⑪）：⚠️ **2026-07-28 起后端已不再发 weeklyVolume**
    // （与日成交额秩相关 +0.826、86/86 天同号，见 AXIS_W_VOL 那处的存档）⇒ 这一行当前
    // 恒不触发。**保留是刻意的**：它是数据驱动的，复活那个字段时不用改这里。
    // ⚠️ 走 weeklyVolumeFormatted 而不是 fmtVolVal——后者写死读 item.volumeFormatted（日线那个）。
    if ("weeklyVolume" in item && sf !== "weeklyVolume") seg.push(`${axisLabelFor("weeklyVolume", "周成交额")} ${item.weeklyVolumeFormatted != null ? item.weeklyVolumeFormatted : "N/A"}`);
    // 周线EMA间距：**加密九个策略榜 + 股票系三个策略榜的行都带**（2026-07-30 轴数对齐后
    // 分别走后端唯一的 `_strategy_row` 与股票系行构造；对齐前只有周线族两个榜带），数据驱动判断。
    // ⚠️ 值可正可负，别再套那条早已作废的「恒为正」自检点（旧 weeklyEmaBearish 时代的）：
    // 绝大多数榜不要求周线 EMA 扩张 ⇒ 负值完全正常（周线方向已转、9/21 还没张开＝最早期
    // 形态）；唯 weeklyEmaSarBull 的入榜条件之一就是 9/21 扩张 ⇒ 在那个榜上此值恒为正。
    if ("weeklyEmaGap" in item && sf !== "weeklyEmaGap") seg.push(`${axisLabelFor("weeklyEmaGap", "周线EMA间距")} ${fmtGapVal(item.weeklyEmaGap)}`);
    if ("monthlyRsi" in item && sf !== "monthlyRsi") seg.push(`${axisLabelFor("monthlyRsi", "月线RSI")} ${fmtRsiVal(item.monthlyRsi)}`);
    // 订单流（真实 taker 归边比）只有加密行有——tushare/Massive 无归边字段，股票系行上
    // 没这个 key，数据驱动判断即可，无需 per-tab 配置。与 CVD强弱 背离时（阴线+订单流
    // 正=借跌吸筹）正是这轴的价值所在。
    // ⚠️ 2026-07-25 从硬编码「订单流」改成走 axisLabelFor：加密榜的轴现在叫「日订单流」，
    // 硬编码会让副行与排序条对不上——正是 axisLabelFor 当初要消灭的那个坑（见其注释）。
    if ("takerStrength" in item && sf !== "takerStrength") seg.push(`${axisLabelFor("takerStrength", "订单流")} ${fmtCvdVal(item.takerStrength)}`);
    // 量比/EMA间距/距前高：四个资产唯一的那个单策略榜的行都带（距前高只有加密带——
    // compute_{ashare,us}_daily 未算），数据驱动判断。
    if ("volRatio" in item && sf !== "volRatio") seg.push(`${axisLabelFor("volRatio", "量比")} ${fmtRatioVal(item.volRatio)}`);
    if ("emaGap" in item && sf !== "emaGap") seg.push(`${axisLabelFor("emaGap", "EMA间距")} ${fmtGapVal(item.emaGap)}`);
    if ("highDist" in item && sf !== "highDist") seg.push(`${axisLabelFor("highDist", "距前高")} ${fmtGapVal(item.highDist)}`);
    // ADX/+DI 两轴（2026-07-25 新增四根、2026-07-26 指令⑥ 砍成两根）：数据驱动判断，同上。
    // ⚠️ −DI / DI差 两段已随轴一起删（后端行 payload 也不再发这两个字段）。
    // ⚠️ 它们**排在这里 = 排在 SUB_AXES_MAX(4) 的截断线之后**，故当前默认不出现在副行里，
    // 只在被选为排序轴时进值列展示（被裁掉的轴不丢功能，见 SUB_AXES_MAX 注释）。这是
    // 刻意的：站长这次要的是"升降序里引入 ADX/DI"，不是重排副行——把 ADX 插到
    // cvdStrength 之后确实能让它常驻副行，但代价是挤掉加密的「日订单流」/ 股票系的
    // 「周线RSI」（副行只有 4 段额度）。要换成那种排法，把下面 adx 那行剪到 line 55 之后即可。
    if ("adx" in item && sf !== "adx") seg.push(`${axisLabelFor("adx", "ADX")} ${fmtDmiVal(item.adx)}`);
    if ("diPlus" in item && sf !== "diPlus") seg.push(`${axisLabelFor("diPlus", "+DI")} ${fmtDmiVal(item.diPlus)}`);
    // 日MACD强弱（2026-07-26 指令⑤）：同样数据驱动、同样排在 SUB_AXES_MAX 截断线之后。
    // ⚠️ key 是**不带前缀的** `macdStrength`（日线值一律不加前缀，同 adx/diSpread 的既有
    // 做法），与下面周线那根的 `weeklyMacdStrength` 是两个不同字段，同一行里并存。
    if ("macdStrength" in item && sf !== "macdStrength") seg.push(`${axisLabelFor("macdStrength", "MACD强弱")} ${fmtGapVal(item.macdStrength)}`);
    // 周线版 ADX/+DI（指令⑩ 加、指令⑥ 砍成两根）：同样数据驱动、同样排在截断线之后。
    if ("weeklyAdx" in item && sf !== "weeklyAdx") seg.push(`${axisLabelFor("weeklyAdx", "周ADX")} ${fmtDmiVal(item.weeklyAdx)}`);
    if ("weeklyDiPlus" in item && sf !== "weeklyDiPlus") seg.push(`${axisLabelFor("weeklyDiPlus", "周+DI")} ${fmtDmiVal(item.weeklyDiPlus)}`);
    // 周MACD强弱（2026-07-26 指令④）：同样数据驱动、同样排在 SUB_AXES_MAX 截断线之后
    // ⇒ 默认不出现在副行，只在被选为排序轴时进值列。要让它常驻副行就把这行往上剪，
    // 代价是挤掉前面某一段（副行只有 4 段额度）。
    if ("weeklyMacdStrength" in item && sf !== "weeklyMacdStrength") seg.push(`${axisLabelFor("weeklyMacdStrength", "周MACD强弱")} ${fmtGapVal(item.weeklyMacdStrength)}`);
    // 振幅 只有免费行情榜（涨跌幅/成交额/振幅）的行有——策略榜行没这个 key，数据驱动跳过。
    if ("amplitude" in item && sf !== "amplitude") seg.push(`振幅 ${fmtAmpVal(item.amplitude)}`);
    const shown = seg.slice(0, SUB_AXES_MAX);
    if (extra) shown.push(extra);
    return shown.join(" | ");
}
// ⚠️ momentumStr 当前**无调用方**（休眠，保留供复活）：它服务已移除的 weeklyRsi 榜
// （2026-07-22）。只依赖 axesSub，复活那个榜时直接可用。
// 周线 RSI tab 的动能上下文（rsiPrev→rsiCurr 箭头），并入副行
function momentumStr(v) {
    if (v.rsiPrev == null || v.rsiCurr == null) return "";
    const a = v.rsiCurr > v.rsiPrev ? "↑" : v.rsiCurr < v.rsiPrev ? "↓" : "→";
    return `动能 ${v.rsiPrev.toFixed(2)} → ${v.rsiCurr.toFixed(2)} ${a}`;
}
// 涨跌幅榜副行：排「涨跌幅」轴（sf === "value"）时展示价格上下文，排其他轴时改展示
// 「涨跌幅 +X%」——涨跌幅是本榜核心数字，值列被别的轴占用时不能让它彻底消失。
// ⚠️ 价格上下文由调用方以 priceCtx(v) 传入，因为**两套资产口径不同**：
//   · 加密 = K 线实体，「开 X → 收 Y」（$ 价、fmtMktPrice）——cryptoPriceCtx
//   · A股  = close-to-close，「昨收/上周收/上月收 X → 收/本周收/本月收 Y」（¥ 价、fmtCnyPrice）——asharePriceCtx
// **2026-07-29 站长「A股 也新增涨跌幅榜，基于收盘的」时把 priceCtx 参数加了回来**——正是
// 上一版注释预言的那一步（"日后股票系涨跌幅榜复活时把它加回来、别直接套加密的措辞"）。
// ⚠️ 判据 `sf === "value"` 与轴 key 绑死（见 cryptoChangeSorts 那处的警告），别改成 changePercent。
function changeSub(v, sf, volLabel, priceCtx) {
    const tail = sf === "value" ? priceCtx(v) : `涨跌幅 ${fmtGapVal(v.value)}`;
    return axesSub(v, sf, volLabel, tail);
}
// 加密：K 线实体口径「开 X → 收 Y」，美元价。
const cryptoPriceCtx = v => `开 ${fmtMktPrice(v.open)} → 收 ${fmtMktPrice(v.close)}`;
// A股：close-to-close，前收/现收标签随周期不同（昨收→收 / 上周收→本周收 / 上月收→本月收），
// 人民币价。preClose/close 由后端 _change_row 提供（compute 层 round(_,2)，沪深报价精度即 0.01）。
const asharePriceCtx = (preLabel, curLabel) => v => `${preLabel} ${fmtCnyPrice(v.preClose)} → ${curLabel} ${fmtCnyPrice(v.close)}`;

// 共享 sort-item 定义（key = 行字段名，全 tab 统一）
// ⚠️ 2026-07-23：随 tab 显示名恢复直白命名（见 TAB_GROUPS 顶部注释），排序轴 label 同批
// 恢复指标原名（2026-07-21 那轮「强度/资金强弱/买卖失衡/参与度/结构张开」的脱敏标签作废）。
// **key 仍不动**（key 是行字段名，动了要连累后端 payload 和 getSortedItems）。
// ⚠️ 2026-07-25：全站四个资产各只剩 1 个榜，**所有 live 轴都在下方「单策略榜专用轴」
// 那一段**（带周期前缀的 AXIS_D_*）。这里只剩 AXIS_WRSI/AXIS_MRSI 两个仍在用；不带
// 周期前缀的 AXIS_RSI/AXIS_CVD/AXIS_TAKER/AXIS_VOLRATIO/AXIS_EMAGAP/AXIS_HIGHDIST +
// axisVol/axisChg 工厂随加密 15 个榜一并删除，复活多榜时从 git 捞。
const AXIS_WRSI = { key: "weeklyRsi", label: "周线RSI", format: v => fmtRsiVal(v.weeklyRsi) };
// 月线RSI（2026-07-24 加，挂三个股票系单策略榜）：那榜的行同时锚定三个周期，日线 RSI
// 看"谁启动最热"、周线看"大趋势多强"、月线看"最大级别多强"，三个都给才对得上语义。
// 需 ≥16 根已收盘月 K，次新股 null 沉底。
const AXIS_MRSI = { key: "monthlyRsi", label: "月线RSI", format: v => fmtRsiVal(v.monthlyRsi) };

// === 股票系单策略榜专用轴：**每个轴都写明周期** ===
// ⚠️ 这不是啰嗦：那张表的筛选条件横跨月/周/日三个周期，而**行里的值全是日线的**，
// 光写「成交额」「RSI」根本看不出是哪根 K —— 2026-07-24 站长直接问了「当前A股的成交额
// 升降序是基于日线还是什么周期的？」，说明这个歧义是真会绊人的。既然同一条排序条上
// 已经并排站着「周线RSI」「月线RSI」，日线那几个轴就必须自报周期，否则对比时更糊涂。
// key 全部不动（key 是行字段名，动了要连累后端 payload 与 getSortedItems）。
// 语义提醒：`volume` 是**最新已收盘那一个交易日的单日成交额**（不是周/月累计、不是
// 均值），A股 为人民币元、美股/ETF 为 USD，格式化由后端 volumeFormatted 定。
const AXIS_D_RSI = { key: "rsi", label: "日线RSI", format: v => fmtRsiVal(v.rsi) };
const AXIS_D_VOL = { key: "volume", label: "日成交额", format: v => fmtVolVal(v) };
// ⚠️⚠️ 日CVD强弱 的买卖拆分是**按 K 线形态推断的**（阳线实体归买、影线对半；对齐
// TradingView 上那个 CVD 指标），**不是真实成交归边**。2026-07-28 那轮排序轴审计实测：
// 它与「日线RSI」横截面秩相关 **+0.790 且 86/86 天同号**，与真实归边的「日订单流」只有
// **+0.206**；用价格动能四变量解释它 R²=0.668，用真实归边解释它只有 R²=0.060。
// ⇒ **它名为资金流、实为价格动能。想看真钱流向请用「日订单流」。**
// 这个结论**完全不依赖前瞻收益**（纯横截面相关），所以不受行情/样本/幸存者偏差影响。
// ⚠️ 但**这不是删它的理由**（站长 2026-07-28 明确「不要删」，且它与 日ADX −0.052 /
// 日量比 −0.036 / 日成交额 +0.128 确实正交）；公式也**不改** —— 五条改造路线（换真实
// k[9]／正交残差／改 period／改归一化／原样）全试过，无一在同日公平对照下更优，
// 且换成 k[9] 会让它与 calc_taker_strength 变成逐字相同的函数＝等价于删轴。
// 详见 CLAUDE.md「2026-07-28 全部排序轴的量化审计」。
const AXIS_D_CVD = { key: "cvdStrength", label: "日CVD强弱", format: v => fmtCvdVal(v.cvdStrength),
                     hint: "按K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「日订单流」" };
const AXIS_D_VOLRATIO = { key: "volRatio", label: "日量比", format: v => fmtRatioVal(v.volRatio) };
const AXIS_D_EMAGAP = { key: "emaGap", label: "日EMA间距", format: v => fmtGapVal(v.emaGap) };
// 日订单流 = 真实 taker 归边比（币安 K 线自带 k[9]，零额外抓取）。**加密独有**——
// tushare / Massive 的日线都没有归边字段，股票系那三个榜物理上挂不了这一轴。
// 它与 CVD强弱 是**互为对照**的两根（一个真实归边、一个形态推断）。
// ⚠️ 站内曾把「两者背离 = Wyckoff effort-vs-result（阴线+订单流正=借跌吸筹）」当成设计
// 意图。2026-07-28 审计直接测了这个 2×2，**没有得到支持**（两个"背离"象限并不系统性更好，
// "双确认"象限反而最差）。⇒ 文案里可以说"两根互为对照"，**别说"背离是信号"**。
// ⚠️⚠️ **显示的绝对数字会稳定误导**：全市场只有 **7.4%** 的标的这个值为正、中位在
// **−0.022** 附近 —— 那是**常态**不是"资金在流出"。排序本身只看相对位置、不受影响，
// 所以只加 hint 说明，**不要动公式**。（榜内比例高些：inDEE 25.4%、周线榜 14.9%。）
const AXIS_D_TAKER = { key: "takerStrength", label: "日订单流", format: v => fmtCvdVal(v.takerStrength),
                       hint: "真实成交归边（币安taker数据）。全市场只有约7%为正、常态在−0.02附近，负值是常态不是异常" };

// === 方向性运动系统 ADX / DMI（2026-07-25 站长：「在升降序里面引入 ADX 以及 DI 逻辑」）===
// 四个资产**同批加同一组四根轴**（后端 calc_adx_dmi 一份实现、四条管道共用，对齐
// TradingView `ta.dmi(14, 14)`）。**纯排序轴、不参与任何筛选** —— 各榜命中集合与加之前
// 完全一致，这次改动只是多了几种看同一批标的的方式。
// ⚠️⚠️ **2026-07-26 站长指令⑥：四根砍成两根，只留 日ADX + 日+DI**（周线端同样只留
// 周ADX + 周+DI）。**这条推翻了本段原来那句"四根各自回答不同问题、别只留一根"的告诫**
// ——那是我 2026-07-25 写的建议，站长看过之后明确要求砍。以站长的决定为准，别照着旧
// 告诫（或旧 commit 里的注释）把它们加回来。
// ⚠️ 砍掉的代价**比原来写的小得多**（2026-07-28 审计实测修正）：原注释说"DI差 是唯一带符号、
// 单根即可排多空的，没了只能间接看"——但 **`rho(日+DI, DI差) = +0.930、86/86 天同号**，
// 正交化后 DI差 的增量分辨力只剩 +0.013 且区间含 0 ⇒ **降序那一侧几乎没有损失，砍对了**。
// 唯一有实质损失的是**升序端**：按 +DI 升序取 BOTTOM20，其中"其实是空方占优"的平均只有
// 2.7%（某天到过 50%）；而降序 TOP20 里"其实空方占优"的只有 0.3%。**别据此把它加回来。**
// **复活极便宜**：前端把两个 AXIS_* 常量加回来（定义见本次删除 commit 的父提交）、后端把
// build 层四个行 payload 里的 `diMinus`/`diSpread` 两行加回来即可 —— **compute 层一直
// 照常在算这两个值**（`daily_lookup` 与各 payload dict 里都还在，属保留字段）。
//
// 保留的两根各自回答什么：
//   · 日ADX  —— 趋势"有多强"，**不含方向**（DX 只取 |+DI−−DI| 的绝对值）。ADX 45 的
//     暴跌和 ADX 45 的主升浪同分。经验档：<20 震荡 / 20-25 萌芽 / >25 趋势确立 /
//     >40 强趋势（也可能是过热末段）。**降序=最有趋势的，升序=最横盘的**，升序不是废数据。
//     ⚠️⚠️ **但"升序＝蓄势待突破"这个机制说法是错的**（2026-07-28 审计实测推翻，原注释
//     写的就是它）：低 ADX 那批之后的**绝对波动更小不是更大**（mean|fwd10| 0.1051
//     vs >40 档 0.1388；跌超 10% 的概率 21.3% vs 31.0%）—— 它不是在蓄势，只是在那段
//     跌市里跌得少。升序那头的正确读法是「**最安静的**」，不是「**要爆发的**」。
//     ⚠️ 另一处作用域：「ADX 不含方向、与动量正交」**只在全市场成立**；榜内会退化成动量
//     代理（inDEE 内 adx~diPlus 从全市场 −0.089 变成 **+0.526**）。
//   · 日+DI —— 多方的方向压力（0-100）。配 ADX 一起读：ADX 高且 +DI 高＝多头在推。
// 标签同样带「日」前缀：加密日线族三个榜的行里装的全是日线值（榜的筛选条件却横跨月/周/日），
// 这是 2026-07-24 站长问过一次的歧义，新轴一并遵守。
const AXIS_D_ADX = { key: "adx", label: "日ADX", format: v => fmtDmiVal(v.adx) };
const AXIS_D_DIPLUS = { key: "diPlus", label: "日+DI", format: v => fmtDmiVal(v.diPlus) };
// 两个资产族共用同一个数组常量——避免"两份几乎一样的列表漂移"这个本项目的老坑。
const dmiSorts = [AXIS_D_ADX, AXIS_D_DIPLUS];

// === 日MACD强弱（2026-07-26 站长指令⑤，四个资产同批加）===
// 值 = **(PPO线 + 3×PPO柱)/4** = (4·MACD − 3·Signal)/(4·EMA26) × 100，单位是"占慢线的
// 百分比"。PPO线 = MACD/EMA26（趋势位置：MACD 在零轴上方多少）、PPO柱 =(MACD−Signal)/EMA26
// （动能加速：MACD 相对自己的信号线跑出多少）。
// ⚠️⚠️ **它不是原始 MACD**：原始 MACD 带价格单位，日线上与价格的相关性实测 **r=+0.979**，
// 直接排序 TOP5 就是全市场价格最高的五个（BTC/ETH/YFI/ZEC/XMR），而它们归一化后只有
// +0.65%~+2.57%。与全站 CVD 轴一律用归一化 `cvdStrength` 是同一条纪律。
// ⚠️⚠️ **权重是 3，与下面周MACD强弱的 5 不同，这不是笔误**：日线 bar 更吵，权重到 4× 时
// 降序 TOP 就开始被"暴跌途中反弹"占据（加密 SIREN 柱 +19.95% 而线 −44.77%；美股 4× 时
// TOP8 有 3/8、5× 时 6/8 是仙股反弹）。完整取值规则与三个市场的实测数据见后端
// `calc_macd_strength` 上方的常量注释块 —— **改这根轴前先读那里**。
// ⚠️ 与「日EMA间距」轴相关性偏高——这是为保住 TOP 干净付的价，已知并接受。
//   口径要分清（2026-07-28 审计补测）：旧记的 **+0.801(加密) / +0.728(美股) 是单日 Pearson**；
//   **横截面秩相关 86 日均 +0.870（86/86 天同号）、inDEE 榜内 +0.928、TOP5 重叠 89.8%**。
//   最直白的一句：**它与"过去 14 日涨幅"秩相关 +0.895** ⇒ 跨标的排序上约等于一根 14 日动能排名。
// ⚠️ **即便如此也不要降级它**（审计结论）：RSI 在 inDEE 榜内已经饱和（成员 100% >50、
//   中位落在全市场第 94 百分位、几乎排不动）⇒ **它是加密日线榜上唯一还能读出"有多超伸"
//   的轴**。按冗余度砍它，砍掉的正是 RSI 本该干却干不了的活。
// ⚠️⚠️ **2026-07-30 轴数对齐推翻了这条审计结论的一半**：原文写的是「它冗余的对象
//   `emaGap` **不在加密排序条上**（后端刻意不发那两个榜），加密页面上并不存在可见重复」
//   —— 对齐时给六个加密策略榜都补上了「日EMA间距」，所以**现在全站九条策略排序条上
//   「日EMA间距」与「日MACD强弱」全都并排站着**（此前只有股票系三条如此）。
//   这是站长「以最多的为准」的知情结果：**冗余可见 ≠ 应该砍**（砍任何一根都会让某类读法
//   消失，而对齐的收益是九个榜口径一致）。要重新评估就得先在股票系数据上重测 ——
//   那个 +0.870/+0.928 是**加密面板**测的，股票系至今零实测，属推断。
// ⚠️ 与**周MACD强弱**几乎正交（设计意图成立：日线 + 而周线 − ＝「周线崩塌中的日线反弹」）。
//   ~~r=−0.080~~ **那个具体数字已删**：它是某一天的快照，逐日范围 −0.236 ~ +0.382，
//   引用单日数字会误导。只保留"几乎正交"这个结论。
// 需 ≥35 根已收盘日 K（26+9），不足 null 沉底（加密实测 523/528 有值）。
const AXIS_D_MACD = { key: "macdStrength", label: "日MACD强弱",
                      format: v => fmtGapVal(v.macdStrength) };

// === 日波动幅度（2026-07-28 新增，四个资产同批加）===
// 值 = **ATR(14) / 最新已收盘价 × 100** ——"这东西平均一天晃价格的百分之几"。
// ⚠️⚠️⚠️ **这是全站唯一一根【风险披露】轴，不是选股轴。desc / 任何对外文案都绝不能写
// "低波动会跑赢"。** 2026-07-28 那轮排序轴审计实测：它那点"预测力"全部来自「跌市里低波动
// 少跌」——每日区分力与当日大盘收益相关 +0.536，跌日 −0.131 而涨日只有 +0.007，前后半段
// 还衰减 4 倍 ⇒ 是 beta 不是 alpha，换一段涨市大概率反过来。
// **为什么要加它**：加密那 10 根轴全落在「趋势—动能—规模」一族（相关矩阵实测有效维度只有
// 约 5.5 个，第一主轴就占 34.7%），**完全没有"风险"这个坐标**；而榜内同一天的波动率
// p5→p95 差约 4 倍 —— 那决定仓位和止损宽度，不决定谁涨。
// 升序 = 同样上榜里最好拿的（仓位大的人用）；降序 = 最投机、搏弹性。**两端语义都干净。**
// ⚠️ 排的是 atrPct 不是 ATR：ATR 带价格量纲，跨标的直接排 ≈ 排价格（同 CVD 轴那条纪律）。
// ⚠️ 选 ATR 口径而不是"年化已实现波动率"：后者的年化因子加密 √365 / 股票 √252，会变成
// **同名轴两套公式**（本项目明令警惕的坑）；atrPct 是纯比值，四个资产同一个公式。
// 格式化复用 `fmtAmpVal`（非负两位小数 + %）——**别用 fmtGapVal**（那个带符号，而 ATR 恒非负）。
// 需 ≥15 根已收盘日 K（比 日ADX 的 28 根宽 ⇒ 不新增覆盖损失）。
const AXIS_D_ATR = { key: "atrPct", label: "日波动幅度", format: v => fmtAmpVal(v.atrPct),
                     hint: "平均每天晃价格的百分之几（ATR14）。用来判断仓位和止损宽度，不是用来判断谁会涨" };

// === 周线版 ADX / DMI（2026-07-25 晚站长指令⑩「加周线级别就行」）===
// 与上面那组**同一套算法、同一个后端 calc_adx_dmi**（对齐 TV `ta.dmi(14,14)`），只是喂进去
// 的是最新已收盘**周 K**。字段名一律带 `weekly` 前缀 —— **绝不能与日线那组共用 key**，
// 同一行里两组值并存，key 撞车会互相覆盖。
// 为什么值得单开一组：日线ADX 回答"最近这两三周方向坚不坚决"，周线ADX 回答"大级别趋势
// 成没成形"，两者**经常背离**——日线刚张开但周线ADX 只有 12，就是震荡市里的一次反弹。
// 实测反例：BTC 周线 ADX 31.2 但 −DI 27.4 > +DI 13.1（周线下跌趋势已确立）。
// 需 ≥28 根已收盘周 K（加密实测 484/528 有值，次新标的 null 沉底）。
// ⚠️ 2026-07-26 指令⑥：与日线端同批砍，**只留 周ADX + 周+DI**（周−DI / 周DI差 已移除，
// 复活办法与代价见上面日线那组的注释块）。
const AXIS_W_ADX = { key: "weeklyAdx", label: "周ADX", format: v => fmtDmiVal(v.weeklyAdx) };
const AXIS_W_DIPLUS = { key: "weeklyDiPlus", label: "周+DI", format: v => fmtDmiVal(v.weeklyDiPlus) };
const weeklyDmiSorts = [AXIS_W_ADX, AXIS_W_DIPLUS];

// === 周MACD强弱（2026-07-26 站长指令④，四个资产同批加）===
// 值 = **(PPO线 + 5×PPO柱)/6** = (6·MACD − 5·Signal)/(6·EMA26) × 100，单位是"占慢线的
// 百分比"。（⚠️ 2026-07-26 修：这里原先写的是 `PPO线 + PPO柱 = (2·MACD − Signal)/EMA26`
// ——那是**被冗余度实测否掉的等权第一稿**，从未上线，注释漏改了。以本行为准。）
// ⚠️⚠️ **它不是原始 MACD**：原始 MACD 带价格单位，跨标的排序≈排价格（实测按原始值排
// TOP1 是 BTCDOM，只因它价格 5547，归一化后其实只有 +3.70%）。这与全站 CVD 轴一律用
// 归一化 `cvdStrength` 是同一条纪律。完整设计理由、四象限语义、5 这个权重的实测依据，
// 见后端 `calc_macd_strength` 的 docstring 与其上方常量块 —— **改这根轴前先读那里**。
// 读法：>0 表示 MACD 在零轴上方（周线趋势向上），数值越大＝位置越高且动能还在加速；
// <0 反之。**升序那头不是废数据**：最负的一端是"下跌且还在加速"，回避/做空名单直接可用。
// 需 ≥35 根已收盘周 K（26+9），不足 null 沉底（加密实测 469/528 有值）。
// 用 fmtGapVal（带符号两位小数 + %）：它确实是个百分比量，与 EMA间距 同类，
// 刻意不复用 fmtDmiVal（那个不带 % —— ADX/DI 是 0-100 的无量纲读数，不是百分比）。
const AXIS_W_MACD = { key: "weeklyMacdStrength", label: "周MACD强弱",
                      format: v => fmtGapVal(v.weeklyMacdStrength) };

// === 周成交额 / 周线EMA间距（2026-07-25 晚指令⑪加）===
// ⚠️ 这两根轴是为 `weeklyExpansionDailyCvd` 建的，那个榜 2026-07-26 晚被移除；周线EMA间距
// **照常保留**——2026-07-30 轴数对齐后它同时在加密 16 轴与股票系 15 轴两个轴集里
// （行构造分别是后端唯一的 `_strategy_row` 与股票系那份，`_wk_expansion_row` 已并入前者）。
// 站长原话「也要有周成交额，周RSI等数据」。周RSI 直接复用既有的 AXIS_WRSI，周成交额是新轴。
// ⚠️⚠️ **`AXIS_W_VOL`（周成交额）已于 2026-07-28 移除，别加回来。**
// 它是建榜时（指令⑪「也要有周成交额，周RSI等数据」）加的，但 2026-07-28 那轮排序轴审计
// 实测：**与 `AXIS_D_VOL`（日成交额）横截面秩相关 +0.826、86/86 天同号**，控住日成交额后
// 残差分辨力只剩 −0.02 量级 ⇒ 两根轴回答的是同一个问题（"这合约装不装得下我的仓位"）。
// ⚠️ 复活时**前端加轴 + 后端 `_wk_expansion_row` 加回 weeklyVolume/weeklyVolumeFormatted
// 两个 key 必须一起做**：`axesSub` 是数据驱动的（`"weeklyVolume" in item` 就渲染一段），
// 只加轴 = 永远全 null 的幽灵轴，只加字段 = 副行留下没有对应 chip 的孤儿摘要。
// 旧定义：`{ key: "weeklyVolume", label: "周成交额",
//            format: v => v.weeklyVolumeFormatted != null ? v.weeklyVolumeFormatted : "N/A" }`
// （口径备查：它是"最新已收盘那一根周 K"的 USDT 成交额＝后端 closedVolume，
//   既不是 7 天滚动累计也不是日均。`closedVolume` 后端仍照常产出，是保留字段。）
// 周线EMA间距 =（周线EMA9 − 周线EMA21）/周线EMA21 ×100。（建轴时的语义依据：当时那个榜的
// 筛选条件就是周线两线扩张；那个榜已移除，此轴现随轴数对齐成为全部策略榜的通用周线轴。）
// ⚠️ 不保证为正 ⇒ 间距可以是负的。两端是什么形态：降序＝周线结构已经跑开的；
// 升序＝EMA9 还在 EMA21 下方或刚要交叉的最早期一档。
// ⚠️⚠️ **别断言哪一端"更强"或"更该买"**（2026-07-28 审计）：这根轴在那 8 个月里的"正向"
// 几乎全是跌市 beta —— 每日分辨力与当日大盘收益相关 **−0.823**，**21 个上涨日里 0 天为正**。
// 换一段涨市大概率反过来。只描述两端是什么形态，不要写哪端会赢。
// （本常量 2026-07-25 晚随「移除加密所有TAB」删过一次，现按同名同义复活。）
const AXIS_W_EMAGAP = { key: "weeklyEmaGap", label: "周线EMA间距", format: v => fmtGapVal(v.weeklyEmaGap) };

// 股票系（A股/美股/ETF）三个策略榜的 **15 轴**：日线九根（日线RSI·日成交额·日CVD强弱·
// 日量比·日EMA间距·日ADX·日+DI·日MACD强弱·日波动幅度）+ 周线五根（周线RSI·周线EMA间距·
// 周ADX·周+DI·周MACD强弱）+ 月线RSI —— 严格按"日线 → 周线 → 月线"的周期递进排、同周期
// 的挤在一起。**首轴仍是 日线RSI**（＝默认排序，必须与后端 `value` 取的量一致，别把新轴
// 插到最前）。
// ⚠️⚠️ **比加密的 16 轴少一根「日订单流」，而且永远补不上**：tushare（A股）与 Massive
// （美股/ETF）的日线都**没有 taker 逐笔归边字段** —— 数据源硬边界，不是遗漏。2026-07-30
// 站长「能否对齐轴数？以最多的为准」那轮卡的就是这一根，**别再想办法凑齐 16**：硬凑要么
// 得造一根语义不同的轴、要么发一根永远全 null 的幽灵轴，两条都比"少一根"更糟。
// 轴数履历：11（指令⑥ 砍 DI 后）→ +周MACD → +日MACD → 2026-07-28 +日波动幅度 ⇒ 14
// → 2026-07-30 轴数对齐 +周线EMA间距 ⇒ **15**。
const singleStrategySorts = [AXIS_D_RSI, AXIS_D_VOL, AXIS_D_CVD, AXIS_D_VOLRATIO, AXIS_D_EMAGAP,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_ATR,
                             AXIS_WRSI, AXIS_W_EMAGAP, ...weeklyDmiSorts, AXIS_W_MACD, AXIS_MRSI];
// 加密**九个策略榜全部共用**的轴集，**16 根**（2026-07-30 站长「能否对齐轴数？以最多的
// 为准」之后的现状）：日线 10 根（日成交额·日线RSI·日CVD强弱·日订单流·日量比·日EMA间距·
// 日ADX·日+DI·日MACD强弱·日波动幅度）+ 周线 5 根（周线RSI·周线EMA间距·周ADX·周+DI·
// 周MACD强弱）+ 月线 1 根（月线RSI）。与后端唯一的行构造 `_strategy_row` 严格一一对应。
// 前四根是**站长两次逐字点名的同一组**：「支持成交额，RSI，CVD，订单流。四种升降序。」
// ——顺序照他写的，**首轴即默认排序**，必须与后端 `value` 取的量（日成交额）一致，否则
// 首屏值列显示的是另一根轴的数。**别把新轴插到最前。**
//
// ⚠️⚠️ **对齐前这里是两个常量**：日线族四个榜 11 轴、周线族两个榜 13 轴
// （`cryptoWeeklyExpansionSorts`，差 周线RSI + 周线EMA间距 两根）。对齐时后端给日线族的行
// 补上了那两根、给两族都补上了 日量比/日EMA间距/月线RSI 三根 ⇒ 字段集完全相同 ⇒ 那个常量
// **已删除、并进本常量**。**别再拆回两个**：两个"几乎一样的轴常量"正是本项目栽过多次的
// 那个坑（选错一个不报错、只能肉眼发现）。要让某个榜少一根轴，先想清楚它凭什么少。
//
// ⚠️ 轴标签带「日/周/月」前缀是**必要的**：这九个榜的筛选条件横跨月/周/日三个周期，而
// 行里同时装着三个周期的值（2026-07-24 站长就为股票系那张同形的表问过"成交额是基于日线
// 还是什么周期"）。纯日线的榜本可省前缀，但共用一个常量比再造一套「只差标签」的近亲常量
// 安全得多 —— 理由同上一段。
//
// ⚠️ **加轴必须后端先补字段**（`_strategy_row` 加 key），只在这里加轴＝永远全 null 的
// 幽灵轴；只在后端加字段不加轴＝副行冒出没有对应 chip 的孤儿摘要（`axesSub` 是数据驱动的）。
// **两处必须一起改，而且一改就是九个榜一起变。**
//
// ⚠️ 轴数是**注释里最容易发霉的一类数字**（指令④⑤⑥ 连着三次改轴时本文件、fetch_data.py
// 的注释、两个周线榜的 desc 全部停在旧值；加 `atrPct` 那轮又漏；移除三个周线榜那轮 docstring
// 停在已不存在的编号 —— 同一个坑四次）。**改轴时把数字一起改，或者干脆别在注释里写数字。**
// 履历：4 →（指令⑩ +ADX/DI）12 →（指令④⑤ +周/日MACD）14 →（指令⑥ 砍 DI 到两根）10
// →（2026-07-28 +日波动幅度）11 →（2026-07-30 轴数对齐 +5 根）**16**。
// ⚠️ 排序条在 1280 视口早已是多行（10 轴 ≈812px 就卡满了 877px 容器的单行上限）。桌面
// flex-wrap 换行、移动端横滑，两种都不裁切 —— 每次加轴都要在 1280/768/375 三档实测一遍。
const cryptoStrategySorts = [AXIS_D_VOL, AXIS_D_RSI, AXIS_D_CVD, AXIS_D_TAKER,
                             AXIS_D_VOLRATIO, AXIS_D_EMAGAP, ...dmiSorts, AXIS_D_MACD, AXIS_D_ATR,
                             AXIS_WRSI, AXIS_W_EMAGAP, ...weeklyDmiSorts, AXIS_W_MACD, AXIS_MRSI];

/** 三个涨跌幅榜（2026-07-29 站长「新增TAB：日线级涨跌幅，周线级涨跌幅，月线级涨跌幅」）
 *  的 **五轴**：涨跌幅 · 成交额 · RSI · CVD强弱 · 订单流。
 *
 *  ⚠️⚠️ **这是工厂不是三份常量，是刻意的。** 三个榜的轴只差周期前缀，若写成
 *  AXIS_D_CHG / AXIS_W_CHG / AXIS_M_CHG… 九个近亲常量，就正中本项目栽过多次的那个坑
 *  （"两个几乎一样的常量选错一个、不报错只能肉眼发现"）。同 singleStrategyGroup 的思路。
 *
 *  ⚠️⚠️ **五个 key 全是通用 key**（value / volume / rsi / cvdStrength / takerStrength），
 *  三个榜共用同一批 key —— **后端按各榜自己的周期填值**（周线榜的 `rsi` 装的是周线 RSI、
 *  月线榜装月线 RSI）。这与另九个策略榜相反（那些榜通用 key 一律是日线值、周线值另带
 *  `weekly` 前缀）。副行标签走 axisLabelFor 从**当前榜自己的 sorts** 反查，所以页面上
 *  显示的是「周线RSI」而不是「日线RSI」，标签与数值对得上。
 *  也正因为用的是通用 key：`axesSub` 里 rsi / volume / cvdStrength / takerStrength
 *  四段本来就都在 ⇒ **这三个榜零新增 axesSub 代码**。
 *
 *  ⚠️⚠️ **涨跌幅轴的 key 必须是 `value`，别"更语义化"地改成 changePercent** ——
 *  renderTable 里红绿上色的判据写死了 `sortField === "value"`（切到 RSI/成交额 时值列
 *  展示的是那个指标，红绿会误导 ⇒ 一律 neutral）。改了 key 红绿会**静默失效**。
 *  同理 getColorClass 还要求这三个 tab key 在 CHANGE_PCT_TABS 里，两处缺一不可。
 *
 *  ⚠️ 为什么只有五轴、不像策略榜那样再带 ADX/+DI/MACD/波动幅度：① 站长这次一个字没提
 *  排序，五轴正是站内涨跌幅榜的历史形态（＝站长两次逐字点名的「成交额，RSI，CVD，订单流」
 *  四根 ＋ 涨跌幅本身）；② **月线端后端根本没产 ADX/MACD**，硬加就是全 null 幽灵轴，
 *  三个榜还会不对称；③ 这是**全市场 ~528 行 × 3 个榜**，每加一根轴都要乘 ~1584 行进付费 KV。
 *  要加轴：后端 `_change_row` 先补字段（日线端 daily_lookup 全都有、周线端 rsi_data 有
 *  adx/diPlus/macdStrength、月线端没有），再在这里加 —— 别只在这里加。
 *
 *  tf = 周期前缀（"日"/"周"/"月"）；rsiLabel 单列，因为站内写法是「日线RSI」不是「日RSI」。 */
const cryptoChangeSorts = (tf, rsiLabel) => [
    { key: "value",         label: `${tf}涨跌幅`,  format: v => fmtGapVal(v.value) },
    { key: "volume",        label: `${tf}成交额`,  format: v => fmtVolVal(v) },
    { key: "rsi",           label: rsiLabel,       format: v => fmtRsiVal(v.rsi) },
    { key: "cvdStrength",   label: `${tf}CVD强弱`, format: v => fmtCvdVal(v.cvdStrength),
      hint: "按K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「订单流」" },
    { key: "takerStrength", label: `${tf}订单流`,  format: v => fmtCvdVal(v.takerStrength),
      hint: "真实成交归边（币安taker数据）。全市场只有约7%为正、常态在−0.02附近，负值是常态不是异常" },
];
// 股票系（A股/美股/ETF）涨跌幅榜的**四轴**——比加密少一根「订单流」：tushare/Massive 的
// 日线都没有 taker 逐笔归边字段（数据源硬边界，同 singleStrategySorts 不含 AXIS_D_TAKER）。
// ⚠️⚠️ 必须是**独立的第二个工厂、不能给 cryptoChangeSorts 加个 withTaker 开关**：
//   audit_consistency.py 的 A 项靠正则**静态**抽取工厂定义体里的 key 来校验"轴↔行字段"，
//   看不懂运行时的条件裁剪——一个带 takerStrength 字面量的工厂体会让它以为 A股 行缺
//   takerStrength 字段而误报。两个工厂各自把自己的轴写全，正是这道静态守卫要求的。
// ⚠️ CVD hint 也与加密不同：这里没有「订单流」那根轴可指，不能照抄那句"想看真钱流向用订单流"。
const stockChangeSorts = (tf, rsiLabel) => [
    { key: "value",       label: `${tf}涨跌幅`,  format: v => fmtGapVal(v.value) },
    { key: "volume",      label: `${tf}成交额`,  format: v => fmtVolVal(v) },
    { key: "rsi",         label: rsiLabel,       format: v => fmtRsiVal(v.rsi) },
    { key: "cvdStrength", label: `${tf}CVD强弱`, format: v => fmtCvdVal(v.cvdStrength),
      hint: "按K线形态推断的买卖失衡，不是真实成交归边（tushare 日线无逐笔归边数据）" },
];
const dailyChangeSorts = cryptoChangeSorts("日", "日线RSI");
const weeklyChangeSorts = cryptoChangeSorts("周", "周线RSI");
const monthlyChangeSorts = cryptoChangeSorts("月", "月线RSI");
const ashareDailyChangeSorts = stockChangeSorts("日", "日线RSI");
const ashareWeeklyChangeSorts = stockChangeSorts("周", "周线RSI");
const ashareMonthlyChangeSorts = stockChangeSorts("月", "月线RSI");
// （已删的轴与工厂，复活时从 git 捞：股票系 sortsRsiFirst/sortsVolFirst/sortsChange/
//  stockTurnoverSorts/stockAmpSorts〔2026-07-24〕；加密 cryptoRsiFirst/cryptoVolFirst/
//  cryptoChange/cryptoTurnoverSorts/cryptoAmpSorts/cryptoFundingSorts 与 AXIS_AMPLITUDE/
//  AXIS_FUNDING/axisVol/axisChg〔2026-07-25 随加密 15 个榜移除〕；
//  cryptoSingleStrategySorts / cryptoWeeklyDailySorts / cryptoWeeklySarDailySorts 与
//  AXIS_D_HIGHDIST（距前高，只有 get_daily_indicators 算）/ AXIS_W_EMAGAP（周线EMA间距）
//  〔2026-07-25 晚随「移除加密所有TAB」〕。复活那三个榜时这两个轴要一起捞回来——它们的
//  **末轴刻意各不相同**（有月线条件→月线RSI；有周线 EMA 条件→周线EMA间距；周线端只有
//  布尔 SAR→不设末轴），别为了"看起来统一"合并成一个常量。）

const TABS_CONFIG = {
    // === 加密涨跌幅：三个榜（2026-07-29 站长「新增TAB：日线级涨跌幅，周线级涨跌幅，
    // 月线级涨跌幅」）===
    // **无筛选、全市场入榜**。轴集走 cryptoChangeSorts 工厂（五轴，
    // 完整设计说明见那里）。
    // ⚠️ 三处必须同时到位，缺一个都不报错但会静默坏掉：
    //   ① 这里的 sorts（首轴 = value = 涨跌幅，与后端 `value` 取的量一致）
    //   ② `CHANGE_PCT_TABS` 里要有这三个 key（否则值列的红绿上色恒 neutral）
    //   ③ subFormat 传的 volLabel 要写对周期（副行的成交额标签，axesSub 不会自己反查它）
    // ⚠️ subFormat 走 changeSub 而不是直接 axesSub：它多一段"价格上下文 / 涨跌幅"的尾巴，
    // 保证切到别的排序轴时涨跌幅这个核心数字不会从行里彻底消失。
    dailyChange: { sorts: dailyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", cryptoPriceCtx) },
    weeklyChange: { sorts: weeklyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "周成交额", cryptoPriceCtx) },
    // ⚠️ 月线榜的数值每月 1 号 00:00 UTC 才变一次（后端走月线缓存）——整月不动是正确行为，
    // 不是缓存卡住了。日线榜每小时随日 K 变，周线榜每周一变。
    monthlyChange: { sorts: monthlyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "月成交额", cryptoPriceCtx) },

    // === 加密策略：九个榜（数轮增删后 2026-07-30 一度达九个 → 同日站长移除三个周线族 SAR
    // 榜 ⇒ 六个 → 2026-08-01 复活 monthlyWeeklySar ⇒ 七个 → 2026-08-07 新增 dailyTripleEmaCvd
    // ⇒ 八个 → 2026-08-09 新增 dailyFourEmaExpansion ⇒ **九个**。被移除各榜判据存档见后端
    // build_rankings docstring 末尾）===
    // **轴集只有一族**：九个榜全部共用 **16 轴的 cryptoStrategySorts**，行全部走后端唯一的
    // `_strategy_row`（2026-07-30 站长「能否对齐轴数？以最多的为准」；对齐前是 ①②③④ 用
    // 11 轴、⑤⑥ 用 13 轴的 cryptoWeeklyExpansionSorts 两族）。
    // 九个榜行 payload 逐字同构，**差别只在筛选条件**。首轴统一 = 日成交额降序。
    // ⚠️ 新榜一律**追加在末尾**；移除中间的榜时要把后面的**重新编号**（2026-07-30 移除旧④⑤⑥、
    // 把旧⑦⑧⑨ 重编成 ④⑤⑥）——① ~ ⑦ 这套编号是 rail 位置，CLAUDE.md/后端 docstring/本文件
    // 多处按它互相引用，别留编号缺口。
    // ① 月×周×日 三个 SAR 全多头的三级共振（3 个条件，**不含新币回退**，见后端注释）。
    monthlyWeeklyDaily: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ② 日线 9/21 扩张（**严格，不含 9/26**）＋ 量/CVD/RSI 三条递增 —— **4 个条件，全在
    // 日线**。⚠️ 本槽位已迭代五版、**key 一次没动**；此处注释 2026-08-07 前一直停在第四版
    // （写着"9/21/55 三线扩张、1 个条件"），那是 2026-07-28 **早**的口径，同日**晚**站长
    // 就改成了现在这版（EMA 放宽回两线、另叠三条递增）。**判据以 TAB_GROUPS 的 desc 与
    // 后端为准**，别照这类"顺带提一句"的注释推断口径。
    // ⚠️⚠️ **别把 ② 和 ⑧ `dailyTripleEmaCvd`（9/21/55扩张＋CVD递增）看成重复**：⑧ 恰好就是
    // 本槽位第三版的判据，但两者**两个方向都不包含** —— ② 的 EMA 更宽（9/21）却多两条递增
    // （量、RSI），⑧ 的 EMA 更严（9/21/55）却只有 CVD 一条递增。
    // ⚠️ **历次改判据轴集都一根没动**（行 payload 一个字段都没改，动的都是 build 层的成员
    // 资格判断）：别以为加了 EMA55 就要加一根轴 —— 后端没给行发 ema55，加了就是永远全 null
    // 的幽灵轴；也别以为条件里有量/CVD/RSI 就与同名的三根轴重复 —— **条件量的是方向
    // （涨没涨），轴量的是水平（到什么程度）**，三条递增都是布尔值、本来也排不了序。
    dailyEmaExpansion: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ③ 日线四线扩张**存续期**（2026-07-28 站长新增，1 个条件）。"**状态**"型榜——结构不破
    // 就一直在，成员跨天稳定。⚠️ 旧注释说 `dailyFourEmaAligned` 是"全站唯一的状态型榜"，
    // 三次改判据后已不成立：现在只有 ② 是"**事件**"型（扩张＝间距在变大，成员天天换），
    // ①③ 都是状态型。行 payload 与 ② 逐字同构 ⇒ 共用 cryptoStrategySorts。
    //
    // ⚠️⚠️ **同日先上线过一个只看排列的 `dailyFourEmaAligned`，当天就与本榜二选一被移除了**
    // （站长看到两榜命中数一样后追问，实测重合度：298 天回放里 29% 的日子完全相同、
    // 每日保留率中位 93% ⇒ 在 rail 里像双胞胎，留下定义更干净的本榜）。
    // 两者关系是**严格包含**不是重复：那个只要"四条线现在排好了"，本榜还要求"这段排列
    // 当初是被一次真扩张启动的"。**别把那个榜加回来**，除非站长明确要。
    // ⚠️ 「排列」≠「扩张」：站内「扩张」一词专指间距在变大，两个词别混用。
    // ⚠️ **别因为名字里有"扩张"就加 emaGap / ema55 / ema200 轴** —— 后端没给行发这些字段，
    // 加了就是永远全 null 的幽灵轴（axesSub 是数据驱动的）。站长原话是"支持当前多种升降
    // 序"＝沿用现有那套，没要求新轴。
    dailyFourEmaPersist: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ④ **最新已收盘日线是 SAR 多头段的第二根 K 线（1 个条件）** —— 2026-07-30 站长新增。
    // 倒1 多头 且 倒2 多头 且 **倒3 空头** ⇒ 这段多头恰好从倒2 起，最新那根正是第二根。
    // ⚠️⚠️ **"事件"型 SAR 榜**（与 ⑤ 周线版一起是站内仅有的两个）：① 的 SAR 多头是
    // **状态**（会连着很多天为真、成员跨期稳定），本榜是**一次性事件**——每个标的一轮
    // 行情只在翻多后那一天命中 ⇒ **成员每天几乎全换、命中数天然很小**。
    // 看到它只有个位数、且和昨天完全不是同一批，那是正确行为不是数据挂了。
    // 行 payload 与其余五个榜逐字同构 ⇒ **共用 cryptoStrategySorts 16 轴**。
    // ⚠️ **别因为判据里有 SAR 就加一根「SAR」轴**：SAR 多头是布尔值、排不了序（同「阴K
    // 不设轴」那条先例），后端也没给行发圆点价 ⇒ 加了就是永远全 null 的幽灵轴。
    // 周线三轴在这里是纯描述值，恰是本榜最主要的读法：在这批"日线刚翻多满一天"的标的里
    // 按 周ADX / 周MACD强弱 排序，能分出「大级别也在向上」和「只是空头里反弹第二天」两类。
    dailySarSecondBar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⑤ **最新已收盘周线是 SAR 多头段的第二根 K 线（1 个条件）** —— 2026-07-30 站长紧随
    // ④ 之后新增。判据与 ④ **逐字同构，只把日线换成周线**（倒1/倒2 多头 + 倒3 空头，全在
    // 周线）。与 ④ 一起是站内仅有的两个"事件"型 SAR 榜。
    // ⚠️ **与 ④ 不是同一个榜、也无包含关系**：日线翻多 vs 周线翻多是两个级别，同一标的两边
    // 同时命中要求"日线第二根恰好落在周线第二根那一周"，极少见。别因名字只差一字就当重复。
    // ⚠️ 本榜条件蕴含「周线 SAR 多头」（那原是 2026-07-30 移除的「周线SAR多头」榜的全部条件）——自检点。
    // ⚠️ 行 payload 走后端唯一的 `_strategy_row` ⇒ **16 轴的 cryptoStrategySorts**（九个榜
    // 共用）。上线时本榜是 13 轴、④ 是 11 轴（轴集不同曾是刻意的：本榜条件在周线，周线块
    // 那 5 根轴才是主要读法）；2026-07-30 站长要求对齐后 ④ 也补上了那两根周线轴，两者同为
    // 16 轴 —— **周线块仍然是本榜的主要读法，只是不再靠"轴集不同"来体现**（按周ADX /
    // 周MACD强弱 分「大级别也在向上」vs「空头里的反弹」）。
    // **别因为判据里有 SAR 就加 SAR 轴**（布尔值排不了序、后端没发圆点价）。
    weeklySarSecondBar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⑥ **周线 EMA9/21 扩张 且 SAR 多头（2 个条件，都在周线）** —— 2026-07-30 站长新增。
    // 就是同日移除的「周线SAR多头」槽位的第二版判据（2026-07-26 指令③），但**是新榜**（key
    // 全新）：站长要"扩张 + SAR"两条都要。命中比"纯周线 SAR 多头"少得多。
    // ⚠️ 本榜条件蕴含「周线 SAR 多头」，与 ⑤ 都蕴含它、但彼此无包含关系（一个筛结构张开、
    // 一个筛刚翻多满一周，实测交集很小）。
    // 行 payload 走后端唯一的 `_strategy_row` ⇒ **16 轴的 cryptoStrategySorts**（九个榜共用；
    // 建榜时是 13 轴的 cryptoWeeklyExpansionSorts，2026-07-30 轴数对齐后并入）。
    // ⚠️ 显示名写「9/21扩张」不写「两线扩张」：后者是 (9/21 ∪ 9/26) 并集的专称，本榜是严格 9/21。
    weeklyEmaSarBull: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⑦ **月线 SAR 多头 且 周线 SAR 多头（2 个条件，月+周两级，没有日线端）** —— 2026-08-01
    // 站长新增。判据与 2026-07-24 的 `monthlyWeeklySar` 旧榜逐字相同 ⇒ **key 复用＝复活**
    // （同 weeklyEmaBearish 2026-07-26 复活的先例；那个榜 2026-07-25 随「移除加密所有TAB」下线过）。
    // ⚠️ 与 ① 是**严格超集**：① ＝ 本榜 ∩ 日线 SAR 多头 ⇒ ① ⊆ 本榜（免费自检点）。
    // **不适用「严格子集 ⇒ 默认取代」**（那条只针对保留率九成级的双胞胎）：本榜"两级共振、
    // 状态型、命中宽"，① "三级共振、更严"，差集正是"月/周都多头、日线此刻在回调"的那批，
    // rail 上一眼分得开，且站长指令就是"新增"。
    // ⚠️ **别因为判据里全是 SAR 就加 SAR 轴**（布尔值排不了序、后端没发圆点价——同 ④⑤ 那条先例）。
    monthlyWeeklySar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⑧ **日线 EMA9/21/55 三线扩张 且 CVD 递增（2 个条件，都在日线）** —— 2026-08-07 站长
    // 「新增一个TAB，逻辑是：最新已收盘日线是EMA9/21/55扩张，且CVD递增。」（没点资产 ⇒
    // 按记了九次的先例做加密）
    // ⚠️⚠️ 这**恰好是 ② 槽位第三版的判据**（2026-07-26～07-28 早），但**是新榜不是复活**：
    // 那个 key 现在 live 且已换成第五版的另一套逻辑，「同判据 ⇒ 复用旧 key」只适用于 key
    // 已退役的情形（weeklyEmaBearish / monthlyWeeklySar 两个先例）。
    // ⚠️⚠️ **与 ② 两个方向都不包含**（EMA 一严一宽、递增条数一少一多，见 ② 那条注释）。
    // 命中数哪天与 ② 撞上一样，**先看交集再下结论** —— 站内为此栽过两次（「18 = 18」和
    // 「17 = 17」都是巧合）。
    // ⚠️ **别因为判据里有 EMA/CVD 就加 ema55 轴或原始 CVD 轴**：后端没发 ema55（幽灵轴），
    // 而「日CVD强弱」轴用的是归一化 cvdStrength（原始 CVD 币本位、跨标的排序≈排成交量）。
    // 💡 本榜行里 `emaGap`（日EMA间距）**恒为正** —— 三线扩张蕴含 9/21 扩张，是个免费自检点。
    dailyTripleEmaCvd: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⑨ **日线 EMA9/21/55/200 四线扩张（1 个条件）** —— 2026-08-09 站长「新增一个TAB，逻辑是：
    // 最新已收盘日线是EMA9/21/55/200扩张。」（没点资产 ⇒ 加密）
    // ⚠️⚠️⚠️ **本榜 ⊊ ③ `dailyFourEmaPersist`（严格子集）**：③ ＝「扩张过、排列至今没破」
    // （**状态**型），本榜 ＝「**最新那一根就在扩张**」（**事件**型）。
    // **不适用 2026-07-28「严格子集 ⇒ 默认取代」** —— 那条只针对保留率九成级的双胞胎。
    // 本轮按 CLAUDE.md 那条「别拿单日快照外推」的教训做了 **90 天回放**：保留率
    // **中位 34.6%**（最高 66.7%）、**两榜完全相同的天数 0/90**、③ 里 **67.1% 的人次**是
    // 本榜看不到的；相邻两日成员 Jaccard 本榜 **40%**（天天换）vs ③ **89%**（跨天稳）
    // ⇒ 定量证实是"事件 vs 状态"的一对，rail 上一眼分得开，**两张都留是对的**。
    // ⚠️ 但包含关系是真的：本榜成员必然全在 ③ 里（90 天天天成立），别当 bug 去查。
    // ⚠️ 与 ⑧ 无包含关系（都 ⊆ 三线扩张，一个再加 EMA200+gap3、一个再加 CVD 递增）。
    // ⚠️ **别因为名字里有四条 EMA 就加 ema55/ema200/emaGap 轴** —— 后端没发这些字段，
    // 加了就是永远全 null 的幽灵轴（axesSub 数据驱动，这个坑站内踩过多次）。
    // 💡 行里 `emaGap` **恒为正**（四线扩张蕴含 9/21 扩张），同 ⑧ 那个免费自检点。
    dailyFourEmaExpansion: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // === A股 / 美股 / ETF：各自唯一的单策略榜（2026-07-24 站长两步定版）===
    // 三者口径与轴集完全一致，共用 singleStrategySorts（见上方定义：日线五轴 +
    // ADX/DI 四轴 + 周线RSI + 月线RSI，**每个轴都写明周期**）。副行的成交额标签同样
    // 写「日成交额」。
    // ⚠️ TABS_CONFIG 是平查找表、与 TAB_GROUPS 分离，所以这三条要手写；
    // singleStrategyGroup 工厂只管导航，不管这里。三条必须保持一致，改一条要改三条。
    //
    // A股 三个涨跌幅榜（2026-07-29 站长「A股 也新增：日线级/周线级/月线级涨跌幅，基于收盘的」）：
    // 与加密三个涨跌幅榜同构，但 ① 走 stockChangeSorts（**4 轴**，无订单流——tushare 无 taker）；
    // ② 副行价格上下文是 close-to-close 的「昨收/上周收/上月收 X → …Y」（asharePriceCtx，¥ 价），
    // 不是加密的 K 线实体「开→收」。**CHANGE_PCT_TABS 里也要有这三个 key**（红绿上色 + 不挂命中徽标），别漏。
    ashareDailyChange: { sorts: ashareDailyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", asharePriceCtx("昨收", "收")) },
    ashareWeeklyChange: { sorts: ashareWeeklyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "周成交额", asharePriceCtx("上周收", "本周收")) },
    ashareMonthlyChange: { sorts: ashareMonthlyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "月成交额", asharePriceCtx("上月收", "本月收")) },
    ashareMonthlyWeeklyDaily: { sorts: singleStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    usMonthlyWeeklyDaily: { sorts: singleStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    etfMonthlyWeeklyDaily: { sorts: singleStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

};

// 分组导航。每组带 asset（资产类别）、tf（周期）：驱动组标签、chip 上的周期角标、
// 以及表格上方的「资产 · 周期 · 策略」标识栏——让用户任何时候都能一眼看出当前榜单
// 是加密还是 A股、日线周线还是月线（2026-07-16 用户反馈"分不清周期"后加）。
// tf 放在组上（组内所有 tab 同周期）；涨跌幅组是例外（横跨日/周/月），tf 放在 tab 上。
// full = 标识栏用的完整名（涨跌幅组的 chip 名是"昨天/周线/月线"=周期本身，标识栏里
// 周期已由 tf 角标表达，名字统一显示"涨跌幅"不重复）。data-tab key 不变。

/** 股票系资产的**单策略组**生成器。⚠️ **2026-07-29 起只服务 美股/ETF 两个**——A股
 *  当天单独改了逻辑（月线扩张 × 周线SAR × 日线量/CVD/RSI递增），已从工厂里拆出去单列
 *  （见下方 TAB_GROUPS）。本工厂的 name/desc 写死的是旧口径「月线SAR × 周线SAR＋扩张 ×
 *  日线扩张＋CVD」，现仅对 美股/ETF 成立。
 *  2026-07-24 站长两步定版：「A股只保留这个TAB」→「美股对齐A股的TAB和逻辑，也是保留
 *  一个」（ETF 由后端 build_etf_rankings 的 us→etf 前缀重映射自动跟随）。美股/ETF 的筛选
 *  口径、行字段、排序轴**完全相同**，只有 key 前缀和标的范围说明不同。
 *
 *  ⚠️ 这个工厂取代了旧的 `stockGroups()`（那个一次生成 4 组 15 个 tab：行情/日线/
 *  周线/月线）。**别把它改回按资产手写三份**——本项目吃过多次"几处该同步的地方漏改
 *  一处"的亏（排序轴 factory 选错、tab 计数不一致…），生成式让三者**结构上不可能漂移**。
 *  组名统一叫「策略」：只有一个组时，rail 上再标周期是废话（周期已由 tf 角标表达）。
 *
 *  assetCN = "A股"/"美股"/"ETF"（也是 TAB_GROUPS.asset 的值）；
 *  p = tab key 前缀（"ashare"/"us"/"etf"）；universe = 该资产的标的范围一句话。 */
const singleStrategyGroup = (assetCN, p, universe) => ({
    label: `${assetCN}策略`, asset: assetCN, tf: "月线",
    tabs: [
        { key: `${p}MonthlyWeeklyDaily`, name: "月线SAR × 周线SAR＋扩张 × 日线扩张＋CVD",
          desc: `月线 SAR 多头（最大级别方向已确立）× 周线 SAR 多头且 EMA9/21 张开（中级别趋势正在加速）× 日线 EMA9/21 张开且资金同步流入——三个周期同时点头才入榜，全站最严格的一档。${universe}表格显示的是日线数值。` },
    ],
});

const TAB_GROUPS = [
    // ⚠️⚠️ 2026-07-23 三次命名：站长要求「把所有 TAB 的命名恢复到自己一眼就能理解的
    // 名字」——显示名重新写明筛选条件（两线/三线/四线扩张、SAR、CVD…），2026-07-21
    // 深夜那版「脱敏、禁用指标词」的规矩就此作废。历史：PR #121 写全条件版 → PR #124
    // 脱敏版 → 本次恢复直白版（站长知情决定：付费墙照旧锁"榜单内容"，但筛选规则
    // 重新对页面访客可见）。
    // 命名约定：name 写"怎么算"（条件用 ＋/× 连接，宽→严梯度用条件个数表达）；
    // desc 保持白话讲"这榜在找什么行情"，两层互补。
    //
    // ⚠️ **内部 key 一律不动**（`dailyEma921` 等）：改 key 会连累三条抓取管道 + 公开
    // JSON + 缓存 schema——key 与显示名是两回事，历史上因此定过"key 固定、只改显示名"
    // 的规矩（*MonthlyStrategy / weeklyStrategy 先例），继续有效。
    {
        // === 加密行情：三个涨跌幅榜（2026-07-29 站长「新增TAB：日线级涨跌幅，周线级涨跌幅，
        // 月线级涨跌幅」）===
        // ⚠️ **资产范围是推断的（站长没写资产）**，判据留在这里以便日后复盘：按 CLAUDE.md
        // 记了四次的先例「新增TAB 不点资产 ＝ 加密」做加密（2026-07-26 指令② / 2026-07-28
        // 的 dailyFourEmaPersist / dailyBreakWeeklyBearSar / weeklyBreakBearSar 四例）。
        // **这条与「加排序轴不点资产 ＝ 四资产同批加」不是同一条规矩，别混。** 扩到四个
        // 资产是纯 build 层的事（股票系三条管道的 compute 早就产出各周期涨跌幅）。
        //
        // ⚠️ **排在策略组之前**：它们无筛选、是"先看全市场在涨什么、再进策略榜筛"的入口，
        // 也是站内历史上一贯的排法（当年 crypto 的组序是 行情 → 日线策略 → 周线策略 → 月线策略）。
        // ⚠️ **组的 tf 不下发**：本组横跨日/周/月，tf 挂在每个 tab 上（房规，见 TAB_META
        // 的注释）。chip 名就写周期本身（日线/周线/月线）+ full 统一写「涨跌幅」——组标签
        // 已经说了"涨跌幅"、tf 角标已经说了周期，chip 再写「日线级涨跌幅」是三重重复，
        // 而 rail 只有 148px 可用宽。站长口中的"日线级涨跌幅"＝ 本组标签 + 本 chip。
        label: "加密行情", asset: "加密",
        tabs: [
            { key: "dailyChange", name: "日线", full: "涨跌幅", tf: "日线",
              desc: "最新已收盘日 K 的涨跌幅（当根收盘 ÷ 当根开盘，币安日 K 每天 00:00 UTC 收盘，所以看的是昨天那一整根）。没有任何筛选条件——全部加密 USDT 永续合约都在里面，谁涨谁跌一眼看全，是先看清全市场在发生什么、再去策略榜里筛的入口。默认按涨幅从高到低，点排序条可以切成日成交额（涨得多是不是也有人接）、日线RSI（是不是已经超买）、日CVD强弱与日订单流（这波是买盘推的还是卖盘砸的）。上市当天、还没有一根已收盘日 K 的新合约不入榜；上市不足约 23 天的合约涨跌幅照常显示，但 RSI / CVD强弱 / 订单流 会显示「—」（暖机根数不够），排序时自动沉底。" },
            { key: "weeklyChange", name: "周线", full: "涨跌幅", tf: "周线",
              desc: "最新已收盘周 K 的涨跌幅（周 K 每周一 00:00 UTC 收盘，所以整周之内这张榜的数值是不变的，下周一才换一批）。没有任何筛选条件，全部加密 USDT 永续合约。它比日线那张钝得多，正好用来分辨「这几天的涨只是反弹」还是「整周都在往上走」。请注意排序条上的 RSI、CVD强弱、订单流全部是周线口径而不是日线值，成交额也是那一根周 K 的成交额，不是 7 天滚动也不是日均。只要有 1 根已收盘周 K 就入榜，所以刚上市一两周的新合约也在；但它们的周线 RSI 要 16 根周 K 才算得出来，不够的显示「—」并在排序时沉底。" },
            { key: "monthlyChange", name: "月线", full: "涨跌幅", tf: "月线",
              desc: "最新已收盘月 K 的涨跌幅（月 K 每月 1 号 00:00 UTC 收盘，所以整个月之内这张榜是不动的——那是正确行为，不是数据卡住了）。没有任何筛选条件，全部加密 USDT 永续合约。这是站内周期最长的一张行情榜，看的是「这个月谁真的走出来了」，短线噪音基本被抹平。请注意排序条上的 RSI、CVD强弱、订单流全部是月线口径，成交额是那一根月 K 的成交额。只要有 1 根已收盘月 K 就入榜（上市当月的新合约还没有，暂不入榜）；月线 RSI 需要 16 根月 K、约一年半才算得出来，所以有四成左右的合约这几根轴会显示「—」并在排序时沉底——这本身也是一种信息：显示「—」的就是还没走完一轮周期的品种。" },
        ],
    },
    {
        // 加密：**九个榜**（2026-07-30 一度达九个 → 同日站长移除三个周线族 SAR 榜 ⇒ 六个
        // → 2026-08-01 复活 monthlyWeeklySar ⇒ 七个 → 2026-08-07 新增 dailyTripleEmaCvd
        // （日线9/21/55扩张＋CVD递增）⇒ 八个 → 2026-08-09 新增 dailyFourEmaExpansion
        // （日线9/21/55/200扩张）⇒ **九个**；被移除各榜的显示名/desc/判据存档见 git 历史
        // 与后端 build_rankings docstring 末尾）。
        // ⚠️ **刻意不套 singleStrategyGroup 工厂**：那个工厂的 name/desc 写死的是股票系
        // 的 5 个条件（月线SAR + 周线SAR + 周线扩张 + 日线扩张 + CVD），与这九个榜都不
        // 一样。硬套会让页面上的规则说明与后端实际筛选严重不符。
        // 组 tf 取第一个 tab 的周期（月线），其余 tab 各自覆盖。**排法：同周期的放一起 +
        // 新榜追加在末尾**（① 月×周×日 → ②③ 日线两个 → ④ 日线SAR第二根 → ⑤ 周线SAR第二根
        // → ⑥ 周线扩张＋SAR → ⑦ 月×周 SAR，⑦ 是追加的、没挪到 ① 旁边——插中间会让整套
        // 编号位移）。
        // ⚠️ **移除中间的榜要把后面的重新编号**：2026-07-30 移除了旧④⑤⑥（三个周线 SAR 榜），
        // 把旧⑦⑧⑨ 重编成 ④⑤⑥。① ~ ⑦ 是 rail 位置编号，后端 docstring / CLAUDE.md / 本文件
        // 多处按它互相引用，别留缺口。
        // ⚠️ 现存两个"事件"型 SAR 榜（④ 日线第二根 / ⑤ 周线第二根）+ 一个"趋势＋结构双确认"
        // 榜（⑥ 周线9/21扩张＋SAR多头）+ 两个纯 SAR 共振"状态"型榜（① 三级 / ⑦ 两级，
        // ① ⊆ ⑦）。**九个榜轴集已于 2026-07-30 对齐成同一套 16 轴。**⑤⑥⑦ 都蕴含
        // 「周线 SAR 多头」但彼此无包含关系（刚翻多满一周 / 结构在张开 / 月线也多头）。
        label: "加密策略", asset: "加密", tf: "月线",
        tabs: [
            { key: "monthlyWeeklyDaily", name: "月线SAR × 周线SAR × 日线SAR",
              desc: "月线、周线、日线三个周期的 SAR 全部多头——最大级别方向、中级别趋势、短期节奏同时向上，纯趋势共振的一档，不看 EMA 也不看资金。上市不足 3 个月、还算不出月线 SAR 的新合约不入榜。范围是全部加密 USDT 永续合约，表格显示的是日线数值。" },
            // tf 覆盖成日线：本榜的条件在日线，挂着组默认的「月线」角标会误导。
            // ⚠️ 本槽位已迭代**五版**，**key 一次都没动**（老规矩）：指令⑥ 建榜（只有 9/21
            // 扩张一个条件）→ 指令⑫ 追加「日线 CVD 递增」→ 2026-07-26 站长把 EMA 那一条由
            // 两线收紧成三线 → 2026-07-28 早去掉 CVD（只剩三线扩张一个条件）→
            // **2026-07-28 晚「日线9/21扩张，且成交量递增，且CVD递增，且RSI递增」**
            // ⇒ **4 个条件，全部在日线**。
            // ⚠️⚠️ **EMA 那条是放宽回两线、另三条是收紧**，两个方向叠在一起 ⇒ 命中数别拿
            // 上一版外推。门槛也随之由 ≥56 根回落到 **≥23 根已收盘日 K**（EMA55 那条走了），
            // 上市 23~55 天的新合约现在可以入榜了——判据使然不是 bug。
            // ⚠️⚠️ **name 一律把 EMA 周期数写全，别写「两线扩张」**（完整词义约定见下面 ⑥
            // weeklyEmaSarBull 那条的注释）：站内「两线扩张」是 (9/21 ∪ 9/26) **并集**的专称，
            // 而本榜是**严格 9/21**，用那个词会把宽窄口径说反。
            // ⚠️ 改判据那轮**轴集一根没动**：行 payload 一个字段都没改，改的只是 build 层的
            // 成员资格判断。（轴集现为九个榜共用的 cryptoStrategySorts 16 轴，2026-07-30 对齐。）
            // ⚠️⚠️ **三条「递增」都不设排序轴**——它们是布尔值、排不了序（同「阴K / SAR多头
            // 不设轴」那条先例）。排序条上的「日成交额 / 日CVD强弱 / 日线RSI」三根轴看着像
            // 与条件②③④ 重复，其实不是：**条件量的是方向（涨没涨），轴量的是水平（到什么
            // 程度）**，"都在涨"的一批标的里正是靠这三根轴再分高下。
            // ⚠️ 另注：条件②的成交量是**币本位**（与 TV 成交量柱一致），而「日成交额」轴是
            // USDT 计价——口径不同是刻意的（轴要跨标的可比），别以为哪边写错了。
            // desc 里不写会漂移的实测命中数：bhNote 本就渲染实时命中数，写死的快照只会和
            // 旁边那个实时数当场打架（这一条是 2026-07-26 审计删掉一句写死数字后定的规矩）。
            { key: "dailyEmaExpansion", name: "日线9/21扩张＋量/CVD/RSI递增", tf: "日线",
              desc: "四个条件同时成立，全部看最新已收盘的那根日线：① EMA9 在 EMA21 上方，且两者的间距比前一天更大（均线正在张开，不是单纯的多头排列）；② 成交量比前一天大（口径与图表上的成交量柱一致，看的是币的数量不是 USDT 金额）；③ CVD 在 0 轴上方且比前一天更高；④ RSI 比前一天更高。结构、量能、资金、动能四路同时抬头的那一天，找的是启动当日而不是已经走了一段的行情——所以成员天天换，连着两天一样反而少见。上市不足 23 天的新合约数据不够，不入榜。范围是全部加密 USDT 永续合约。" },
            // tf 日线。⚠️ 2026-07-26 指令②「最新已收盘日线依然是EMA9/21/55/200多头排列存续
            // 期间（不要求四线扩张）」。**name 用「排列」不用「扩张」**：站内「扩张」专指
            // 间距在变大，本榜恰恰不要求那个，两个词混用会把判据说反。
            // tf 日线。⚠️ 2026-07-28 站长「最新已收盘日线处于四线扩张存续期间，也就是说日线
            // 出现过首次扩张后，四条均线依然还是ema9>21>55>200」。
            // ⚠️⚠️ **同日先上线过一个只看排列的 `dailyFourEmaAligned`（「日线四线多头排列」），
            // 当天就与本榜二选一被移除了** —— 两者是严格包含不是重复，但实测重合度太高
            // （298 天回放：29% 的日子完全相同、每日保留率中位 93%），rail 里像双胞胎。
            // **desc 里因此不能再提"上面那张四线多头排列"**（那是本榜第一版 desc 的写法，
            // 榜删了就成了悬空引用）。
            // ⚠️ **name 把周期数写全**（9/21/55/200），遵守加密这边"不用「N 线扩张」说法"的
            // 规矩（完整词义约定见下面 ⑥ weeklyEmaSarBull 那条）。
            { key: "dailyFourEmaPersist", name: "日线9/21/55/200扩张存续", tf: "日线",
              desc: "最新已收盘日线上 EMA9 > EMA21 > EMA55 > EMA200 四条均线依次排开，而且这段排列当初是被一次真正的「四线扩张」启动的——历史上某一天 EMA9/21、21/55、55/200 三档间距同时比前一天更大，从那天起四条均线的先后次序一直没有被打破，一直排到今天。它排除的是「四条线慢慢磨蹭成排列、从来没有一起张开过」的那一类，留下的是「有过明确启动、且趋势结构至今完好」的标的。不要求今天还在扩张，所以是一张趋势存续清单而不是当日事件清单，成员跨天稳定；行情普涨、符合条件的标的一多的时候，这道启动门槛剔得最狠。上市不足 201 天、算不出 EMA200 的新合约不入榜；另外能回看的历史约 300 根日线，启动点比这更早又一路没破的极少数标的会看不到那次扩张，按规则不入榜。范围是全部加密 USDT 永续合约。" },
            // tf 日线：条件三根 K 全在日线。⚠️ 2026-07-30 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘日线是SAR多头的第二根K线。」（没点资产 ⇒ 按先例做加密）
            // ⚠️⚠️ **name 里「第二根」是"恰好"不是"至少"**：判据要求倒3 是空头，所以一段
            // 多头里只有第 2 根那一天命中，第 3、4、5…根都不在。别把它读成「多头持续中」。
            // ⚠️ 它与站内保留组「刚翻多首根」严格互斥、并列成一对（首根那个没有 live 榜）。
            // ⚠️ 本榜完全不碰 EMA，「写全 EMA 周期数」那条规矩不适用。
            { key: "dailySarSecondBar", name: "日线SAR多头第二根", tf: "日线",
              desc: "最新已收盘的那根日线，正好是这一轮 Parabolic SAR 多头趋势的第二根——也就是说前一天 SAR 刚刚由空翻多，而再往前一天还是空头。它找的是「翻多刚站住一天」的那个时点：翻多当天容易是假信号、一天就打回去，隔一天还在多头一侧算是初步确认，同时又比等趋势走一段再上车要早得多。要留意这是一张一次性的事件清单，不是趋势持续清单——同一个标的在一轮行情里只会在这一天出现，第三根、第四根就不在了，所以命中数天然很小、而且几乎每天换一批人，看到只有几个标的是正常的。表格里的日线八轴和周线三轴都不参与筛选：按周ADX 或周MACD强弱 排序，可以把「大级别本来就在向上、日线只是回踩后重新翻多」和「大级别还在下跌、这只是空头里反弹的第二天」这两种情形分开，后者是本榜最需要提防的一类。上市不足 23 天的新合约数据不够，不入榜。范围是全部加密 USDT 永续合约。" },
            // tf 周线：条件三根 K 全在周线。⚠️ 2026-07-30 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘周线是SAR多头的第二根K线。」（紧随日线版之后，没点资产 ⇒ 加密）
            // ⚠️⚠️ **判据与上面那张日线版逐字同构，只是周期换成周线** —— 两者不是重复：日线
            // 翻多是几天级别的事、周线翻多是几周级别的事，同一标的两边同时命中极少见。
            // ⚠️ 本榜条件蕴含「周线 SAR 多头」（那原是 2026-07-30 移除的「周线SAR多头」榜的全部
            // 条件）：SAR 多头是"状态"、能连着很多周为真，本榜是"事件"——只挑其中翻多后第二周那
            // 一撮。轴集与其余五个榜相同（16 轴，行走后端唯一的 `_strategy_row`）。
            { key: "weeklySarSecondBar", name: "周线SAR多头第二根", tf: "周线",
              desc: "最新已收盘的那根周线，正好是这一轮 Parabolic SAR 多头趋势的第二根——上一周 SAR 刚刚由空翻多，再往前一周还是空头。它是上面「日线SAR多头第二根」的周线版，看的级别高一档：日线翻多是几天的事、容易反复，周线翻多是几周的事、一旦成立分量重得多，所以「周线翻多刚站住一周」往往是一波大级别趋势起步的信号。同样是一次性的事件清单不是持续清单——同一个标的一轮行情里只在翻多后的那一周出现，第三周就不在了，所以命中数天然很少、每周换一批。周线 SAR 多头是一种状态、可以连着很多周都成立，本榜只挑其中「刚翻多满一周」的那一小撮，是更早、更精的一档。表格里的日线八轴和周线五轴都不参与筛选，用来在这批标的里再分强弱。上市不足 4 周、还看不出「翻多的前一周是空头」的新合约不入榜；日线数据不足的，日线那几轴会显示「—」。范围是全部加密 USDT 永续合约。" },
            // tf 周线：两个条件都在周线。⚠️ 2026-07-30 站长逐字：「新增一个TAB，逻辑是：最新
            // 已收盘周线是EMA9/21扩张，且SAR多头。支持当前各种升降序。」（没点资产 ⇒ 加密）
            // ⚠️⚠️ 这是同日移除的「周线SAR多头」榜槽位第二版判据的**新榜化身**（key 全新）：
            // 在"周线 SAR 站多头"之上再叠一道"EMA9/21 结构在张开"，命中比纯 SAR 多头少得多。
            // ⚠️ name 写「9/21扩张」不写「两线扩张」：后者是 (9/21 ∪ 9/26) 并集专称，本榜严格 9/21。
            { key: "weeklyEmaSarBull", name: "周线9/21扩张＋SAR多头", tf: "周线",
              desc: "最新已收盘周线要同时满足两条：一是 EMA9 在 EMA21 上方、而且两者的间距比上一周更大（均线正在张开，不是单纯的多头排列），二是这根周线的 Parabolic SAR 站在多头一侧。它在「周线 SAR 站多头」这个方向门槛之上，还要求 EMA9/21 均线结构本身正在加速张开，所以命中数比单看方向少得多，找的是「趋势方向和结构强度双双确认」的标的，而不是「方向朝上但可能还在磨」的一大批。用法上，SAR 保证了方向，EMA 扩张保证了力度，两者叠加天然偏强势；排序时按周ADX 或周MACD强弱 能进一步区分「大级别力度足」和「刚起步」。需要至少 22 根已收盘周 K 才算得出 EMA9/21 扩张，所以上市不足约半年的新合约不入榜。表格里的日线八轴不参与筛选，用来在这批标的里再看日线强弱。范围是全部加密 USDT 永续合约。" },
            // tf 月线：判据的最大级别在月线（① 同理挂月线角标）。⚠️ 2026-08-01 站长逐字：
            // 「新增一个TAB，逻辑是：最新已收盘月线SAR多头且周线也是SAR多头。」（没点资产 ⇒
            // 按记了八次的先例做加密）
            // ⚠️⚠️ 判据与 2026-07-24 的 `monthlyWeeklySar` 旧榜逐字相同 ⇒ **key 复用＝复活**
            // （同 weeklyEmaBearish 2026-07-26 复活的先例）。显示名从旧名「月线SAR多头 ×
            // 周线SAR多头」收短成「月线SAR × 周线SAR」——与相邻 ① 的命名式样一致，且让
            // 「① ＝ 本榜 ＋ 日线SAR」这层包含关系在 rail 上直接可见（两个名字只差一节）。
            // ⚠️ 本榜是"状态"型（两级 SAR 不翻空就一直在榜、成员跨期稳定、命中天然比 ① 宽），
            // 连着几周几乎不变是正确行为不是数据卡住了。
            { key: "monthlyWeeklySar", name: "月线SAR × 周线SAR", tf: "月线",
              desc: "最新已收盘月线的 Parabolic SAR 站在多头一侧，且最新已收盘周线的 SAR 也站在多头一侧——最大级别方向与中级别趋势同向的两级共振，不看日线、不看 EMA 也不看资金。它与「月线SAR × 周线SAR × 日线SAR」只差最后那道日线确认：少了这道门，命中会宽出不少，多出来的正是「月线周线都向上、日线此刻正在回调」的那批标的——想在大级别趋势里等回调、而不是追日线已经翻多的，看的就是这张。两级 SAR 不翻空就一直在榜，属于状态型清单，成员跨期稳定，连着几周几乎不变是正常的。上市不足 3 个月、还算不出月线 SAR 的新合约不入榜。范围是全部加密 USDT 永续合约，表格显示的是日线数值。" },
            // tf 日线：两个条件都在日线。⚠️ 2026-08-07 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘日线是EMA9/21/55扩张，且CVD递增。」（没点资产 ⇒ 按记了九次的先例做加密）
            // ⚠️⚠️ **这恰好是 ② 槽位第三版的判据，但是新榜不是复活**（那个 key 还在服役、
            // 已换成第五版逻辑）。**与 ② 两个方向都不包含**：② 的 EMA 更宽（9/21）却多两条
            // 递增（量、RSI），本榜 EMA 更严（9/21/55）却只有 CVD 一条递增 —— 两张榜挨着，
            // desc 必须把这层差别讲清楚，否则用户会当成重复。
            // ⚠️ **name 把周期数写全**（9/21/55），遵守加密这边"不用「N 线扩张」说法"的规矩
            // ——「三线扩张」那个说法站内历来只在股票系用（完整词义约定见 ⑥ 那条注释）。
            // ⚠️ ＋ 连接同周期条件（× 是留给跨周期的），两个条件都在日线 ⇒ 用 ＋。
            { key: "dailyTripleEmaCvd", name: "日线9/21/55扩张＋CVD递增", tf: "日线",
              desc: "两个条件都看最新已收盘的那根日线：① EMA9 在 EMA21 上方、EMA21 又在 EMA55 上方，而且 9 与 21、21 与 55 这两档间距都比前一天更大——三条均线依次排开并且同时在张开，不是单纯的多头排列；② CVD 在 0 轴上方且比前一天更高，也就是资金这一侧同步在跟。比起只看两条均线，多要求的那条 EMA55 把「短周期刚翻上来、中周期还没转过来」的那批挡在外面，留下的是中短周期结构已经一致向上、且还在加速张开的标的。它与上面那张「日线9/21扩张＋量/CVD/RSI递增」看着像，其实互不包含：那张的均线门槛更松（只要 9/21），但额外要求成交量和 RSI 也在同一天抬头，找的是启动当日；这张的均线门槛更严（多一条 55），资金那侧只要求 CVD 一条，找的是结构确认，成员跨天比那张稳一些。两张榜的命中数偶尔撞上一样是巧合，看的不是同一批标的。上市不足 56 天、还算不出 EMA55 的新合约不入榜。范围是全部加密 USDT 永续合约。" },
            // tf 日线。⚠️ 2026-08-09 站长逐字：「新增一个TAB，逻辑是：最新已
            // 收盘日线是EMA9/21/55/200扩张。」判据就是 compute 层 `four_ema_data` 的成员资格。
            // ⚠️⚠️⚠️ **本榜 ⊊「日线9/21/55/200扩张存续」（严格子集）** —— 两个名字只差最后
            // 两个字，**这是刻意的**：让包含关系在 rail 上直接可见（同「月线SAR × 周线SAR」
            // 与「…× 日线SAR」只差一节的先例）。
            // **不适用「严格子集 ⇒ 默认取代」**：90 天回放实测保留率中位 **34.6%**、完全相同
            // 的天数 **0/90**、相邻两日成员 Jaccard 本榜 40% vs 那张 89% ⇒ 一个是事件、一个是
            // 状态，分得开。（对照：2026-07-28 被判"双胞胎"那对是中位 93% / 完全相同 29%。）
            // ⚠️ desc 必须把这层关系讲清楚，否则用户看到"本榜的标的那张里全有"会以为重复。
            // ⚠️ **name 把周期数写全**（9/21/55/200），遵守加密"不用「N 线扩张」说法"的规矩。
            { key: "dailyFourEmaExpansion", name: "日线9/21/55/200扩张", tf: "日线",
              desc: "只有一个条件，看最新已收盘的那根日线：EMA9 > EMA21 > EMA55 > EMA200 四条均线依次排开，而且 9 与 21、21 与 55、55 与 200 这三档间距全部比前一天更大——四个周期的均线同时在张开，是短、中、长三个层级一起加速的那一天。它是本站门槛最严的一档趋势启动信号：既要四条均线的先后次序全对，又要三档间距同一天一起扩大，任何一档在收窄就出局。要留意这是一张一次性的事件清单：同一个标的只在真正扩张的那几天出现，扩张一停就不在了，所以命中数天然很小、而且几乎每天换一批人，看到只有几个标的是正常的。它与「日线9/21/55/200扩张存续」是同一件事的两个侧面，也是那张榜的一个子集：那张问的是「有没有扩张过、而且排列一直没破」，是趋势还在不在的存续清单，成员跨天很稳；这张问的是「今天是不是正在扩张」，是趋势正在加速的当日清单。实测下来那张榜里约有三分之二的标的在这张榜上看不到——它们是扩张过之后进入平推或缓慢收窄、但结构尚未破坏的那一批。想抓启动瞬间看这张，想跟踪趋势是否还完好看那张。上市不足 201 天、还算不出 EMA200 的新合约不入榜。范围是全部加密 USDT 永续合约。" },
        ],
    },
    // === A股 / 美股 / ETF（2026-07-24 站长两步定版：三者各保留 1 个榜）===
    // ⚠️ **2026-07-29 起 A股 单独改了逻辑，不再与 美股/ETF 一致**：A股 改成「月线扩张 ×
    // 周线SAR × 日线量/CVD/RSI递增」，美股/ETF 仍是旧口径「月线SAR × 周线SAR＋扩张 ×
    // 日线扩张＋CVD」。所以 A股 **从 singleStrategyGroup 工厂里拆出来单列**（工厂那份
    // name/desc 现在只对 美股/ETF 成立），后两者继续用工厂。轴集三者仍完全相同
    // （singleStrategySorts 14 轴，A股 的三个「递增」是布尔值不设轴），故 TABS_CONFIG
    // 上方那三条仍共用同一份、无需拆。universe 参数是各资产标的范围说明。
    {
        // === A股行情：三个涨跌幅榜（2026-07-29 站长「A股 也新增：日线级涨跌幅，周线级涨跌幅，
        // 月线级涨跌幅。基于收盘的」）===
        // ⚠️ **口径 close-to-close**（站长明写"基于收盘的"）：日线用交易所官方 pct_chg
        // （相对昨收、含集合竞价跳空），周/月线用本周收 vs 上周收——与加密的 K 线实体
        // (close−open)/open 不同（A股 有跳空，股民认的是相对上一根收盘的涨跌）。
        // ⚠️ **4 轴不是 5 轴**：A股 无「订单流」（tushare 日线无 taker 归边字段）。
        // ⚠️ 排在「A股策略」之前（行情=先看全市场、再进策略榜筛的入口，同加密组序）。
        // ⚠️ 组 tf 不下发（本组横跨日/周/月），tf 挂在每个 tab 上；chip 名写周期本身 + full「涨跌幅」。
        label: "A股行情", asset: "A股",
        tabs: [
            { key: "ashareDailyChange", name: "日线", full: "涨跌幅", tf: "日线",
              desc: "最新交易日的收盘涨跌幅——相对昨天收盘价算（交易所官方口径，含早盘集合竞价的跳空缺口），不是拿开盘价算。没有任何筛选条件，全部沪深 A 股都在里面（当天停牌的除外）：谁涨谁跌一眼看全，是先看清全市场在发生什么、再进策略榜筛的入口。默认按涨幅从高到低，点排序条可以切成日成交额（涨得多是不是也有量）、日线RSI（是不是已经超买）、日CVD强弱（这波是买盘推的还是卖盘砸的）。副行给出「昨收 X → 收 Y」两个价格便于核对。当天停牌的股票挂着的是停牌前的旧涨跌幅、会误导，一律不入榜。" },
            { key: "ashareWeeklyChange", name: "周线", full: "涨跌幅", tf: "周线",
              desc: "最新已收盘那一周的收盘涨跌幅——本周收盘价 ÷ 上周收盘价（close-to-close，含跨周的跳空），当周最后一个交易日收盘后定型、整周之内不变，下周才换一批。没有任何筛选条件，全部沪深 A 股。它比日线那张钝得多，正好用来分辨「这几天的涨只是反弹」还是「整周都在往上走」。请注意排序条上的 RSI、CVD强弱、成交额全部是周线口径（成交额是那一根周 K 的成交额，不是 5 日累计也不是日均），不是日线值。要有 2 根已收盘周 K 才入榜；周线 RSI 需 16 根周 K 才算得出来，不够的显示「—」并在排序时沉底。" },
            { key: "ashareMonthlyChange", name: "月线", full: "涨跌幅", tf: "月线",
              desc: "最新已收盘那一个月的收盘涨跌幅——本月收盘价 ÷ 上月收盘价（close-to-close，含月初的跳空），当月最后一个交易日收盘后定型、整个月之内不变（那是正确行为，不是数据卡住了）。没有任何筛选条件，全部沪深 A 股。这是站内周期最长的一张 A股 行情榜，看的是「这个月谁真的走出来了」，短线噪音基本被抹平。排序条上的 RSI、CVD强弱、成交额全部是月线口径。要有 2 根已收盘月 K 才入榜（上市当月、还只有一根月 K 的新股暂不入榜）；月线 RSI 需 16 根月 K、约一年半才算得出来，不够的这几根轴显示「—」并沉底。" },
        ],
    },
    { label: "A股策略", asset: "A股", tf: "月线",
      tabs: [
        { key: "ashareMonthlyWeeklyDaily", name: "月线扩张 × 周线SAR × 日线量/CVD/RSI递增",
          desc: "最新已收盘的月线上 EMA9 站上 EMA21、且两者间距比上月更大（最大级别的均线正在张开、趋势在加速）× 周线 Parabolic SAR 站在多头一侧（中级别方向已确立）× 日线在同一天里三条同步递增：CVD 在 0 轴上方且比前一天更高、成交量比前一天更大（比的是成交手数不是成交额）、RSI 比前一天更高——短期资金、量能、动能一起抬头。三个周期同时点头才入榜，是很严格的一档，成员会随日线量价天天变。上市不足约两年、月线不满 22 根 K、算不出 EMA9/21 扩张的次新股不入榜。范围是全部沪深 A 股（当日停牌的不入榜）。表格显示的是日线数值。" },
      ] },
    singleStrategyGroup("美股", "us", "范围是美股全市场普通股与 ADR。"),
    singleStrategyGroup("ETF", "etf", "范围是约 42 个精选大类资产 ETF（黄金/白银/原油/指数/债券/国别/行业/加密现货）。"),
];

// tab key → {asset, tf, name, full}。组的 asset/tf 下发到每个 tab；tab 自带的 tf 优先
// （涨跌幅组）。full 缺省用 name。标识栏/角标都读这张表。
const TAB_META = {};
for (const g of TAB_GROUPS) {
    for (const t of g.tabs) {
        TAB_META[t.key] = { asset: g.asset, tf: t.tf || g.tf, name: t.name, full: t.full || t.name, desc: t.desc || "" };
    }
}

// === 付费墙配置（2026-07-21 接 OxaPay 重新启用）===
// 免费橱窗留 TEASER_TAB（现为美股榜 usMonthlyWeeklyDaily）里 日线 RSI 最高的 1 行，
// 其余全部榜锁定后 data[tab] 是 undefined（公开 JSON 根本不含这个 key）——不是"给个
// 空数组"那种锁法。2026-07-25 起全站 3 个榜全部付费，这 1 行是唯一的榜单类免费内容。
// 总开关：必须跟后端 fetch_data.py 的 PAYWALL_ENABLED 保持一致，留作紧急回滚
// 开关（两处一起改回 false，不用逐处回退 diff）。
const PAYWALL_ENABLED = true;
const WORKER_API = "https://bishuju-api.fanshenpan.workers.dev";
// ⚠️ 必须与后端 fetch_data.py 的 TEASER_TAB 一致。历经 dailyCvd → dailyEma921
// （2026-07-22 日线策略收敛）→ monthlyWeeklyDaily（2026-07-25 加密收敛成单一榜）→
// **usMonthlyWeeklyDaily**（同日站长「移除加密所有TAB」，加密一个榜都不剩，橱窗必须
// 改挂一个还活着的榜）。挑美股是因为它命中最厚（实测 224；A股 8 / ETF 5 都可能某天
// 归零，那天橱窗和默认落地页会一起空）。换榜要同时改：这里 + 后端同名常量 +
// 下面的 currentTab 默认值 + currentAsset 默认值。
// 全站 3 个榜全付费后，这 1 行橱窗 + marketOverview 是仅存的两个免费面。
const TEASER_TAB = "usMonthlyWeeklyDaily";
const LS_LICENSE = "bishuju_license";
const PLAN_LABEL = { monthly: "月付", quarterly: "季付", yearly: "年付" };
// ⚠️ 仅供页面标价显示——实际扣款金额以 Worker 的同名常量为准，两处必须一致，
// 否则页面写一个价、OxaPay 收另一个价。
const PRICES = { monthly: 19, quarterly: 49, yearly: 149 };
let selectedPlan = "quarterly"; // 购买弹窗默认选中项，对应 UI 上标"最划算"的那档
const LOCK_REASON = {
    not_found: "通行证不存在，请检查是否粘贴完整",
    expired: "通行证已过期，续费后可继续使用",
    revoked: "通行证已被停用，如有疑问请联系我",
    missing: "请输入通行证",
};
// 内联锁图标（emoji 跨平台渲染不一致，SVG 统一视觉）。width/height 属性内置：
// 锁图标可能出现在无 CSS 作用域的容器里（如导航项/脉搏磁贴），不能只靠样式给尺寸。
const LOCK_SVG = '<svg class="tab-lock" width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 1a2.7 2.7 0 0 0-2.7 2.7V5H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-.3V3.7A2.7 2.7 0 0 0 6 1Zm1.5 4h-3V3.7a1.5 1.5 0 1 1 3 0V5Z"/></svg>';

// 存储安全包装:浏览器禁 cookie/存储时裸调 localStorage 会抛异常——顶层一抛整个脚本
// 死掉、页面全白(审计 P2-7)。降级为"不记忆",功能照常。
const safeStore = {
    get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } },
    set(store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* 禁存储:本次会话内不记忆 */ } },
    del(store, k) { try { window[store].removeItem(k); } catch (e) {} },
};

let data = null;
let lastRenderKey = null; // loadData 上次重渲染时的 updateTime，用于跳过无变化的重建
// 默认落地榜 = TEASER_TAB（美股）：未解锁的新访客一进来就能看到唯一那行免费内容 +
// 「解锁查看剩余 N 个」的转化位。2026-07-25 晚从加密的 monthlyWeeklyDaily 改过来
// （加密全部 TAB 已移除）。改这里要同步 currentAsset 的默认值。
let currentTab = "usMonthlyWeeklyDaily";
let sortAsc = false; // false=降序, true=升序
let sortField = "value"; // 当前排序字段；默认 value，带 sorts 的 tab 可切 RSI/成交额
let searchQuery = ""; // 表格搜索（代码/名称子串），切 tab 时清空
let lastBustAt = 0; // 上次带 cache-buster 强拉的时间（限流用，见 loadData）
let bustStreak = 0; // 连续强穿仍拿到同一 updateTime 的次数，驱动 loadData 的指数退避（线上抓取中断时省带宽）
let license = { key: safeStore.get("localStorage", LS_LICENSE) || "", valid: false, expiresAt: null, plan: null, reason: null };
let paidData = null; // Worker 返回的全量付费数据（未解锁或未拉到时为 null）
let lastPaidUpdateTime = null; // 上次成功拉到付费数据时对应的 updateTime，避免每 30s 轮询都打 Worker

function formatPercent(val) {
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
}

/** 与 Worker 的 normalizeKey 对齐：trim/大写/去空白/全角横线→半角。
 * 必须在存储和发请求头之前做——X-License-Key 头含非 Latin-1 字符（如全角横线）
 * 会让 fetch() 同步抛 TypeError，表现为"验证通过但榜单全空"的幽灵故障。 */
function normalizeKey(raw) {
    return (raw || "").trim().toUpperCase().replace(/\s+/g, "").replace(/[—–－]/g, "-");
}

/** 某榜的"命中数"：优先 paidMeta（服务端按完整名单算的真实命中数，免费橱窗和
 * 已解锁两种状态下都存在、数值恒等），数组长度只在 paidMeta 没有这个 key 时
 * 兜底——TEASER_TAB 的 data[key] 故意只截了 1 行，若直接拿数组长度会显示
 * "命中 1 个"这种误导数字，橱窗行本身要看真数据就点开那一行。
 * data 未就绪或两边都没有时返回 null。 */
function tabCount(key) {
    if (!data) return null;
    if (data.paidMeta && key in data.paidMeta) return data.paidMeta[key];
    if (Array.isArray(data[key])) return data[key].length;
    return null;
}

// 涨跌幅榜：无筛选、全量入榜、值是涨跌幅，走红绿配色（getColorClass）。
// **2026-07-29 站长新增三个加密涨跌幅榜后重新非空**（2026-07-25～07-29 之间曾是空集）。
// ⚠️⚠️ 这个 Set 现在同时决定**三件事**，加涨跌幅类 tab 时三件一起生效、漏加则三件一起
// 静默失效（都不报错）：
//   ① 值列红绿上色（getColorClass；另需 renderTable 里 sortField === "value"，见下）
//   ② 导航 chip **不挂命中徽标**（isStrategyTab，见下面那行）——涨跌幅榜恒为全市场数量，
//      挂个 528 既没信息量又会被误读成"筛出了 528 个"
//   ③ 空状态文案走"暂无数据"而不是"0 命中是正常信号"（策略榜才有后一种语义）
// 加密 3 个 + A股 3 个（2026-07-29）。A股 的三个走 close-to-close，但红绿/非策略语义与加密
// 一致，同样进这个集合。红绿方向由 CSS 的 [data-asset] 作用域翻（A股 涨红跌绿）。
const CHANGE_PCT_TABS = new Set(["dailyChange", "weeklyChange", "monthlyChange",
                                 "ashareDailyChange", "ashareWeeklyChange", "ashareMonthlyChange"]);

// 免费引流层（2026-07-22 站长定：通用行情开放引流，策略筛选付费）。整榜免费的通用
// 行情榜：涨跌幅 + 成交额 + 振幅 + 资金费率。**必须跟后端 fetch_data.py 的同名
// FREE_TABS 一致**——后端据此把这些榜整榜写进公开文件，前端据此判断"不锁"；漏一处
// 会让已免费的榜被前端当付费锁上、或后端没写进公开文件导致空榜。CHANGE_PCT_TABS
// ⊂ FREE_TABS（涨跌幅走红绿，成交额/振幅/资金费率走中性色——是量级/带符号数不是涨跌方向）。
const FREE_TABS = new Set([]);
// ⚠️⚠️ **2026-07-25 起为空集：全站一个免费整榜都没有了，这不是漏写。** A股/美股/ETF
// 于 2026-07-24 各收敛成 1 个纯付费策略榜（各自 7 个免费行情榜一并移除），加密于
// 2026-07-25 移除全部 15 个榜（含最后 8 个免费行情榜：涨跌幅 日周月 + 成交额 日周月 +
// 振幅 + 资金费率），当晚站长再下「移除加密所有TAB」，加密新定版的 3 个榜也一并下线、
// 资产整体退役。免费引流面现在只剩「橱窗 1 行（TEASER_TAB）+ 市场概览全局条」。
// 后端 fetch_data.py 的同名 FREE_TABS 同样是空集，两边必须一致。
// 策略榜 = **有筛选条件的榜**（"0 命中"是正常信号而非故障，值是 RSI/成交额等指标）。
// 空状态文案、脉搏策略计数、导航命中徽标都据此——行情榜（涨跌幅）不参与这些语义。
// ⚠️⚠️ **2026-07-29 加了 `&& !CHANGE_PCT_TABS.has(tab)`**：在此之前判据只有
// `!FREE_TABS.has(tab)`，那是因为历史上涨跌幅榜**同时**在 FREE_TABS 里（免费引流层），
// 一个条件顺带盖住了两件事。这次新增的三个涨跌幅榜**是付费的**（FREE_TABS 仍是空集），
// 两者第一次解耦 ⇒ 只判 FREE_TABS 会把行情榜当成策略榜：chip 上挂出「528」这种没有信息
// 量的命中徽标、空榜时说"0 命中是正常的"（对全市场行情榜而言那分明是故障）、脉搏磁贴的
// 策略榜计数从 6 虚增到 9。**"是不是策略榜"是语义问题，与免费/付费无关。**
const isStrategyTab = tab => !FREE_TABS.has(tab) && !CHANGE_PCT_TABS.has(tab);

function getColorClass(val, tab) {
    if (CHANGE_PCT_TABS.has(tab)) {
        if (val > 0) return "positive";
        if (val < 0) return "negative";
    }
    return "neutral";
}

function stripUSDT(symbol) {
    return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

function isCryptoSymbol(symbol) {
    return symbol.endsWith("USDT");
}

// A股 symbol 形如 "600000.SH"/"000001.SZ"：6 位数字 + 点 + 交易所后缀，精确正则匹配。
// **不能用"带不带点"当判据**（2026-07-20 接入美股时修：美股有些 ticker 本身带点，
// 如 BRK.B / BF.B 这类 class share 后缀，includes(".") 会把它们误判成 A股 代码，
// 导致 symbolDisplayParts/tvSymbolFor 按 A股 逻辑错误拆分）。
function isAshareSymbol(symbol) {
    return /^\d{6}\.(SH|SZ)$/.test(symbol);
}

function isAshareTab(tab) {
    return tab.startsWith("ashare");
}

function isUsTab(tab) {
    return tab.startsWith("us");
}

// ETF tab（"etf" 前缀不会撞 "us"）。数据与美股同管道产出，新鲜度共用
// usUpdateTime——所有"按时间戳分流"的地方（staleBanner/pill）把 etf 归到美股一侧。
function isEtfTab(tab) {
    return tab.startsWith("etf");
}

// TradingView 符号：crypto "BTCUSDT" -> "BINANCE:BTCUSDT.P"（永续合约后缀）；美股/ETF
// 裸 ticker（如 "AAPL"）原样返回不加交易所前缀——后端（Massive 分组日线）没有把
// primary_exchange 带进每行 payload，而 TV 的 symbol 搜索对美股裸 ticker 足够智能、
// 能自动解析到正确交易所（不像加密那样交易所前缀是消歧义必需的），故不多传一个字段。
// ⚠️ 美股有些 ticker 本身带点（BRK.B / BF.B 这类 class share 后缀），任何按"带不带点"
// 分流的写法都会误伤它们——2026-07-20 接入美股时踩过（当时是 A股 分支用了 includes(".")）。
function tvSymbolFor(symbol) {
    if (isAshareSymbol(symbol)) {
        const [code, ex] = symbol.split(".");
        const prefix = ex === "SH" ? "SSE" : ex === "SZ" ? "SZSE" : ex;
        return `${prefix}:${code}`;
    }
    if (isCryptoSymbol(symbol)) {
        return `BINANCE:${symbol}.P`;
    }
    return symbol;
}

function tvUrlFor(symbol) {
    return `https://www.tradingview.com/chart/?symbol=${tvSymbolFor(symbol)}`;
}

// 表格里符号列的展示拆分：主代码 + 后缀（crypto 用计价币种，美股/ETF 用裸 ticker 无
// 后缀——item.name 存在时 renderTable 优先显示公司名，suffix 派不上用场，但仍返回空串
// 保持函数签名一致，防御 name 缺失的边缘情况）。
function symbolDisplayParts(symbol) {
    if (isAshareSymbol(symbol)) {
        const [code, ex] = symbol.split(".");
        return { base: code, suffix: ex };
    }
    if (isCryptoSymbol(symbol)) {
        return { base: stripUSDT(symbol), suffix: "USDT" };
    }
    return { base: symbol, suffix: "" };
}

function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getSortedItems() {
    let items = [...(data[currentTab] || [])];
    // 搜索过滤：代码/名称都大小写不敏感（ST股名字含 ASCII 前缀，小写 st 也要能搜到）
    if (searchQuery) {
        const q = searchQuery.toUpperCase();
        items = items.filter(i =>
            i.symbol.toUpperCase().includes(q) || (i.name && i.name.toUpperCase().includes(q)));
    }
    const key = sortField;
    const dir = sortAsc ? 1 : -1;
    // null 沉底：CVD强弱/RSI 对新合约/次新股/历史不足的标的是 null，裸 a[key]-b[key] 会算出
    // NaN 打乱排序。null（及 NaN）一律排到末尾，升降序都沉底，只对有值的行按 dir 比较。
    items.sort((a, b) => {
        const av = a[key], bv = b[key];
        const an = av == null || Number.isNaN(av);
        const bn = bv == null || Number.isNaN(bv);
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return dir * (av - bv);
    });
    return items;
}

// === master-detail 左栏导航（Claude Design 重设计落地）===
// 左栏 rail：顶部 加密/A股/美股/ETF 分段控件 + 当前资产的分组榜单（组数由 TAB_GROUPS
// 决定，别写死；四个资产现各只有 1 组 1 榜），「资产·周期·策略」同屏全见、一键直达；
// rail 激活态随资产变色（--asset-accent）。移动端 rail 隐藏，同一份导航渲染进抽屉。
// **资产变迁**：crypto 曾有 12H策略组（2026-07-22 移除）；A股 曾整体退役过一次
// （2026-07-24 白天，当晚复活为单 tab）；加密于 2026-07-25 晚整体退役过几十分钟
// （站长「移除加密所有TAB」），**同晚随新增 dailyEmaExpansion 榜复活**。
const TF_SHORT = { "日线": "日", "周线": "周", "月线": "月" };
const ASSET_KEY = { "加密": "crypto", "A股": "ashare", "美股": "us", "ETF": "etf" };  // TAB_GROUPS.asset → data-asset
const ASSET_CN = { crypto: "加密", ashare: "A股", us: "美股", etf: "ETF" };           // data-asset → TAB_GROUPS.asset
// ⚠️ 默认资产 = 默认落地 tab 所属资产，**当前是美股不是加密**——落地榜刻意跟着
// TEASER_TAB 走（未解锁的新访客一进来就能看到那 1 行免费内容 + 转化位），而橱窗自
// 2026-07-25 晚起挂在美股榜上。要把落地页换回加密，**必须同时**改 currentTab、
// 这里、以及前后端两处 TEASER_TAB —— 只改落地页不改橱窗，新访客会落在一个全锁的
// 空榜上，转化位直接消失。
let currentAsset = "us";                                // 当前资产（由 tab 派生/资产切换驱动）
// 各资产记住上次看的榜；这里是"还没看过时"的初值 = 该资产 TAB_GROUPS 里的第一个榜。
// 三个股票系资产各只有一个榜，"上次看的"恒等于它；加密有两个，初值取三级共振那个。
const lastTabByAsset = { crypto: "monthlyWeeklyDaily", ashare: "ashareMonthlyWeeklyDaily", us: "usMonthlyWeeklyDaily", etf: "etfMonthlyWeeklyDaily" };

function assetOfTab(tab) {
    const m = TAB_META[tab];
    return m ? ASSET_KEY[m.asset] : "us";   // 兜底跟默认落地 tab 走
}

// rail 组标签统一显示"周期/行情"（资产已由分段控件表达,组名不再重复"美股"/"ETF"前缀）
function navGroupLabel(g) {
    return g.label.replace(/^(A股|美股|ETF)/, "") || g.label;
}

function navHtml() {
    const assetCn = ASSET_CN[currentAsset];
    return TAB_GROUPS.filter(g => g.asset === assetCn).map(g => `
        <div class="nav-group">
            <div class="nav-group__label">${navGroupLabel(g)}</div>
            ${g.tabs.map(t => {
                const m = TAB_META[t.key];
                const tf = TF_SHORT[m.tf] || "";
                // 策略榜在导航右端直接亮命中数——现在锁定态也照亮(tabCount 退回
                // paidMeta)，"今天没命中"和"没解锁"都是有用信号,不隐藏。涨跌幅榜恒为
                // 全市场数量,显示无意义,不挂。数据未到时不渲染,loadData 后 renderNav 补上。
                const hits = isStrategyTab(t.key) ? tabCount(t.key) : null;
                const locked = PAYWALL_ENABLED && !license.valid && t.key !== TEASER_TAB && !FREE_TABS.has(t.key);
                return `<button class="nav-item${t.key === currentTab ? " is-active" : ""}" data-tab="${t.key}"${t.key === currentTab ? ' aria-current="page"' : ''} title="${g.label} · ${t.name}${hits != null ? ` · 命中 ${hits}` : ""}${locked ? " · 未解锁" : ""}">
                    <span class="nav-item__bar"></span>
                    ${tf ? `<span class="tf-chip${tf.length > 1 ? " tf-chip--wide" : ""}">${tf}</span>` : ""}
                    <span class="nav-item__name">${t.name}${locked ? " " + LOCK_SVG : ""}</span>
                    ${hits != null ? `<span class="nav-item__count${hits === 0 ? " is-zero" : ""}">${hits}</span>` : ""}
                </button>`;
            }).join("")}
        </div>`).join("");
}

function renderNav() {
    // 资产分段控件激活态（rail + drawer 两份）
    document.querySelectorAll(".asset-seg__opt").forEach(b => {
        const on = b.dataset.k === currentAsset;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on)); // SR 能读出当前选中的是哪个资产
    });
    const nav = document.getElementById("boardNav");
    if (nav) nav.innerHTML = navHtml();
    const dnav = document.getElementById("drawerNav");
    if (dnav) dnav.innerHTML = navHtml();
    // rail 底部统计
    const foot = document.getElementById("railFoot");
    if (foot && data) {
        const assetCn = ASSET_CN[currentAsset];
        const n = TAB_GROUPS.filter(g => g.asset === assetCn).reduce((s, g) => s + g.tabs.length, 0);
        // 四个资产都没有全量涨跌幅榜可以数了（唯一的榜是筛选后的策略榜），故一律写
        // **标的范围**而不是数量——写 tabCount(唯一的榜) 会变成"监控 N 只"却是命中数，
        // 是误导。
        const uni = currentAsset === "ashare" ? "沪深 A 股全市场"
            : currentAsset === "etf" ? "约 42 只精选大类资产 ETF"
            : currentAsset === "crypto" ? "加密 USDT 永续合约全市场"
            : "美股全市场普通股与 ADR";
        foot.innerHTML = `<b>${n}</b> 个榜单 · 监控 ${uni}`;
    }
}

// board 头（标识 + 命中数注释）：资产 tag · 周期 badge · 策略名
function renderBoardHead() {
    const head = document.getElementById("boardHead");
    if (!head) return;
    const m = TAB_META[currentTab];
    if (!m) { head.hidden = true; return; }
    const tagEl = document.getElementById("bhAsset");
    tagEl.textContent = m.asset;
    tagEl.classList.toggle("is-ashare", m.asset === "A股");
    tagEl.classList.toggle("is-us", m.asset === "美股");
    tagEl.classList.toggle("is-etf", m.asset === "ETF");
    const tfEl = document.getElementById("bhTf");
    tfEl.textContent = m.tf || "";
    tfEl.style.display = m.tf ? "" : "none";
    document.getElementById("bhName").textContent = m.full;
    // 说明行 = 完整筛选规则 + 命中数。规则写在这里（而不是挤进导航的名字里）是
    // 2026-07-21 重命名的关键一步：导航名可以短，规则一个字都不丢。涨跌幅榜的
    // desc 说明的是"取哪根 K、有没有筛选"，同样有用。
    const note = document.getElementById("bhNote");
    const n = tabCount(currentTab);
    // ⚠️ 2026-07-29：量词按榜的类型分开。**只有策略榜说"命中"**（有筛选条件、N 是筛出来
    // 的）；涨跌幅这类行情榜没有任何筛选、N 恒等于全市场标的数，说"命中 528"会被读成
    // "筛出了 528 个"。行情榜改说"共 N 个标的"，与 .table-foot 正常态的措辞一致。
    const hit = n != null ? `${isStrategyTab(currentTab) ? "命中" : "共"} ${n} 个标的` : "";
    note.textContent = m.desc ? (hit ? `${m.desc} · ${hit}` : m.desc) : hit;
    head.hidden = false;
}

// 排序条(2026-07-20 移动端拥挤重设计)：多轴排序的**选择**从值列表头挪到表格上方的
// chip 条——此前 5-6 个轴挤在表头 116px(移动)/240px(桌面)里换行成 3-4 行 10px 小字,
// 触控目标过小且表头被撑高。chips 是真按钮(键盘可达),移动端横向滑动,表头只保留
// 当前轴+方向箭头(点击仍切升/降)。
let lastStripTab = null; // 上次渲染排序条的 tab：切轴时保留 chips 横向滚动位,切 tab 时回卷
function renderSortStrip() {
    const strip = document.getElementById("sortStrip");
    if (!strip) return;
    const config = TABS_CONFIG[currentTab];
    if (!config || !config.sorts) { strip.hidden = true; return; }
    const prevChips = strip.querySelector(".sort-strip__chips");
    const keepScroll = lastStripTab === currentTab && prevChips ? prevChips.scrollLeft : 0;
    const arrow = sortAsc ? "▲" : "▼";
    strip.innerHTML = `<span class="sort-strip__label">排序</span><div class="sort-strip__chips">` +
        config.sorts.map(s => {
            const act = s.key === sortField;
            return `<button type="button" class="sort-chip${act ? " is-active" : ""}" data-sortkey="${s.key}"
                aria-pressed="${act}" title="${(act ? "再点一次切换升/降序" : `按${s.label}排序`) + (s.hint ? "　·　" + s.hint : "")}">${s.label}${act ? `<span class="sort-chip__arrow">${arrow}</span>` : ""}</button>`;
        }).join("") + `</div>`;
    // 重建 innerHTML 会把横向滚动位归零——点最右侧的轴(如 订单流)后 chips 弹回左端、
    // 刚点的轴反而看不见了；同 tab 内重渲染时手动还原
    const chips = strip.querySelector(".sort-strip__chips");
    if (chips && keepScroll) chips.scrollLeft = keepScroll;
    lastStripTab = currentTab;
    strip.hidden = false;
}

// 锁定橱窗的模糊预览行：8 行确定性假数据(宽度参差,模拟真实榜单的长短)。整体高斯
// 模糊后当"橱窗背景",让未解锁用户看见"这里满满一榜标的,就差解锁"——比一堵光墙 +
// emoji 锁的转化力强得多(2026-07-23 转化改造)。宽度写死不用随机,避免每次重渲染抖动。
const LOCK_PREVIEW_ROWS = [
    { sym: 82, bar: 96 }, { sym: 104, bar: 78 }, { sym: 66, bar: 64 }, { sym: 92, bar: 55 },
    { sym: 74, bar: 47 }, { sym: 110, bar: 39 }, { sym: 70, bar: 30 }, { sym: 88, bar: 23 },
];
function lockPreviewRowsHtml() {
    return `<div class="lockgate__rows" aria-hidden="true">` + LOCK_PREVIEW_ROWS.map((r, i) => {
        const rank = i + 1;
        const rankCell = rank <= 3
            ? `<span class="medal medal--${rank}">${rank}</span>`
            : `<span class="rank-num">${rank}</span>`;
        return `<div class="tr lockrow">
            <div class="c-check"><span class="skl skl--dot"></span></div>
            <div class="c-rank">${rankCell}</div>
            <div class="c-sym"><span class="skl skl--sym" style="width:${r.sym}px"></span></div>
            <div class="c-val"><span class="lockval"><span class="skl skl--num"></span><span class="skl skl--bar" style="width:${r.bar}%"></span></span></div>
        </div>`;
    }).join("") + `</div>`;
}
// 锁定橱窗卡片：模糊预览行 + 品牌锁(LOCK_SVG,统一视觉,不用 emoji) + 命中数 + 醒目 CTA。
// n=命中数(paidMeta,可为 null)。CTA 沿用 #emptyUnlockBtn 的 id,由调用方绑定动作。
function lockGateHtml(n, opts) {
    const count = n != null ? `已找到 <b>${n}</b> 个标的` : (opts.fallbackTitle || "该榜已锁定");
    return `<div class="lockgate">
        ${lockPreviewRowsHtml()}
        <div class="lockgate__veil">
            <div class="lockgate__card">
                <div class="lockgate__icon">${LOCK_SVG}</div>
                <div class="lockgate__count">${count}</div>
                <div class="lockgate__desc">${opts.desc}</div>
                <button type="button" class="btn-primary lockgate__cta" id="emptyUnlockBtn">${opts.ctaLabel}</button>
                ${opts.hintHtml || ""}
            </div>
        </div>
    </div>`;
}
// 锁定态收起"假控件"(搜索框/排序条/表头)：无数据可搜、可排,点了没反应 = 首屏空间
// 浪费 + 误导;收起后橱窗 CTA 卡片直接顶到看板头下方(首屏可见)。非锁定态恢复显示。
function setLockedChrome(hide) {
    const search = document.querySelector(".board-head .search");
    if (search) search.hidden = hide;
    // renderSortStrip 已按 config 置 hidden=false;锁定时在其之后覆盖为收起
    if (hide) { const strip = document.getElementById("sortStrip"); if (strip) strip.hidden = true; }
    const thead = document.querySelector(".table .thead");
    if (thead) thead.hidden = hide;
}

function renderTable() {
    // 榜单标识不依赖数据(命中数自带空守卫),放在 !data 早退之前——
    // 否则首屏数据未到时切 tab,nav 高亮已变而标识栏还是旧内容(审计 P2-9)
    renderBoardHead();
    renderSortStrip();

    if (!data) return;

    const config = TABS_CONFIG[currentTab];
    if (!config) return;

    const foot = document.getElementById("tableFoot");

    const items = getSortedItems();
    const tbody = document.getElementById("rankBody");
    const header = document.getElementById("valueHeader");
    if (!tbody || !header) return;

    // 锁定态(公开 JSON 不含该 key)：提前判定,据此收起搜索/排序条/表头等"假控件",
    // 并在下方空状态里渲染橱窗卡片(模糊预览 + CTA)。data 此处已保证非空(上方早退)。
    const locked = PAYWALL_ENABLED && data[currentTab] === undefined && currentTab !== TEASER_TAB && !FREE_TABS.has(currentTab);
    setLockedChrome(locked);

    const arrow = sortAsc ? " ▲" : " ▼";
    if (config.sorts) {
        // 多轴的选择在排序条(#sortStrip)；表头只标注当前轴+方向,点击切升/降序
        const active = config.sorts.find(s => s.key === sortField) || config.sorts[0];
        header.innerHTML = `<span class="sort-opt active" data-sortkey="${active.key}" title="点击切换升/降序">${active.label}<span class="sort-arrow">${arrow}</span></span>`;
    } else {
        // 兜底分支：当前所有 tab 都带 sorts，走不到这里；留一层防御，未来若加无 sorts 的
        // tab 也不会印出字面 "undefined"（config.header 已随三轴改造移除）。
        header.innerHTML = (config.header || "值") + `<span class="sort-arrow">${arrow}</span>`;
    }
    const sortDef = config.sorts ? (config.sorts.find(s => s.key === sortField) || config.sorts[0]) : null;

    if (items.length === 0) {
        // 空状态三种情形：搜索无匹配 / 策略榜 0 命中（筛选严格的信号，不是故障）/ 数据未生成
        // A股/美股/ETF 同为"每交易日收盘后更新"的日更资产，共用同一套文案（2026-07-20 审计
        // 修正：此前漏判美股，落进 else 显示加密的「合约/整点后重算」——误导更新预期）
        const dailyAsset = isAshareTab(currentTab) || isUsTab(currentTab) || isEtfTab(currentTab);
        const strict = isStrategyTab(currentTab);
        // 锁定态(见上方 locked 判定)优先于"筛选严格 0 命中"(key 存在、数组为空)：
        // 未解锁 / 通行证失效 → 橱窗卡片(模糊预览 + 醒目 CTA,顶到首屏);有有效通行证
        // 只是付费数据暂时没拉到 → 加载态(不催已付费的人重复付款,Worker 抖动时这文案
        // 就是事故现场),落到下方通用 .empty 分支。
        if (locked && !license.valid) {
            const n = tabCount(currentTab);
            const expired = !!license.key; // 有 key 但 !valid = 过期/吊销
            const desc = expired
                ? "通行证已失效（过期或被停用）<br>续费后即可继续查看完整名单"
                // ⚠️ 2026-07-29 由「全部策略榜」改成「全部榜单」：站内已不只有策略榜，
                // 当天新增的六个涨跌幅榜（加密 3 + A股 3）是行情榜（无筛选、全市场），
                // 同样要付费解锁。
                : "购买通行证，解锁本站全部榜单的完整名单与多轴排序";
            const ctaLabel = expired ? "重新输入 / 续费" : "立即解锁";
            const ctaAction = expired ? () => openUnlockDialog() : openPurchaseDialog;
            // 未解锁时额外给一条"已有通行证？"入口(回访用户直接输码,不必先进购买弹窗)
            const hintHtml = expired ? ""
                : `<button type="button" class="lockgate__link" id="lockgateEnterBtn">已有通行证？点此输入</button>`;
            tbody.innerHTML = lockGateHtml(n, { desc, ctaLabel, hintHtml });
            const cta = document.getElementById("emptyUnlockBtn");
            if (cta) cta.addEventListener("click", ctaAction);
            const enter = document.getElementById("lockgateEnterBtn");
            if (enter) enter.addEventListener("click", () => openUnlockDialog());
            // 页脚(role=status/aria-live)保留一句状态给 AT 用户(#rankBody 不朗读上千行,
            // 空/锁定态一律靠页脚播报)——视觉上不重复卡片里的命中数,只说"这是锁定榜"
            if (foot) { foot.textContent = expired ? "通行证已失效，续费后可继续查看" : "该策略榜需通行证解锁"; foot.hidden = false; }
            updateExportBar();  // 锁定态也要刷：否则切榜后导出坞仍显示上一榜的「已选 N 个」+ 表头勾选态残留
            return;
        }
        let ico, title, desc;
        if (locked && license.valid) {
            const n = tabCount(currentTab);
            // ⚠️ 两种情况必须分开说，别一律许诺"30 秒自动重试"（2026-07-24 审计）：
            //  a) paidData == null —— 整包没拉到（5xx/网络）。fetchPaidData 失败时不推进
            //     lastPaidUpdateTime，所以下一轮轮询确实会重试，许诺成立。
            //  b) paidData 有、但缺这个 key —— 整包拉到了，是**服务端没产出这个榜**
            //     （2026-07-22 split_output 400 事故就是这样：us/etf/ashare 33 个 tab
            //     从未进 KV）。此时 paidFetchKey 不变，整点前不会再打 Worker，"30 秒重试"
            //     是假的，用户会盯着"加载中"直到下次数据更新。这里如实说，且**不**自动
            //     重试——真坏掉时每 30s 打一次 Worker 会撞上付费侧的节流纪律。
            const missingKey = paidData && !(currentTab in paidData);
            ico = missingKey ? "🛠️" : "⏳";
            if (missingKey) {
                title = n != null ? `该榜暂时缺数据（命中 ${n} 个）` : "该榜暂时缺数据";
                desc = "通行证有效，但服务端本次未提供这个榜<br>下次数据更新后自动恢复，无需重新解锁";
            } else {
                title = n != null ? `已找到 ${n} 个标的，解锁数据加载中…` : "解锁数据加载中…";
                desc = "通行证有效，付费数据暂时拉取失败<br>30 秒内自动重试，无需任何操作";
            }
        } else if (searchQuery) {
            ico = "🔍";
            // escapeHtml：searchQuery 是唯一进 innerHTML 的用户输入，必须转义（自 XSS）
            title = `没有匹配「${escapeHtml(searchQuery)}」的标的`;
            desc = "试试换个代码或名称关键词";
        } else if (currentTab === TEASER_TAB && !license.valid && (tabCount(currentTab) || 0) > 0) {
            // 橱窗榜命中数 >0 却一行都没有 = **免费橱窗那 1 行还没写进公开文件**，不是
            // "今日无人命中"。2026-07-25 晚 TEASER_TAB 从加密榜改指美股榜后这变成了真实
            // 场景：橱窗改由美股管道（每交易日 21:20 UTC）写入，而公开文件每小时被加密
            // 任务重写一次——两条管道错位时中间会有一段空窗（改动当天就撞上了）。
            // 若走下面的 strict 分支，页面会说"今日没有标的命中"而导航徽标同时显示 224，
            // 自相矛盾且是假话。这里如实说，并直接给转化位。
            ico = "🔒";
            title = `已找到 ${tabCount(currentTab)} 个标的`;
            desc = "免费预览的那一行正在更新，稍后自动出现<br>购买通行证可立即查看完整名单";
        } else if (strict) {
            ico = "🎯";
            title = dailyAsset ? "今日没有标的命中该策略" : "本小时没有合约命中该策略";
            desc = dailyAsset
                ? "筛选条件较严，命中数会随行情波动<br>每个交易日收盘后自动重算"
                : "筛选条件较严，命中数会随行情波动<br>整点后约 2 分钟自动重算";
        } else {
            ico = "📭";
            title = "暂无数据";
            desc = "数据将在下次抓取后出现";
        }
        tbody.innerHTML = `
            <div class="empty">
                <div class="empty__icon">${ico}</div>
                <div class="empty__title">${title}</div>
                <div class="empty__desc">${desc}</div>
            </div>`;
        // 空状态也给 #tableFoot(role=status/aria-live)一句话,让 AT 用户得到反馈
        // (#rankBody 不设 live——30s 刷新会朗读上千行)。搜索分支用原始 searchQuery,
        // textContent 自动转义;非搜索用 title(不含用户输入,无双重转义问题)。
        if (foot) { foot.textContent = searchQuery ? `没有匹配「${searchQuery}」的标的` : title; foot.hidden = false; }
        updateExportBar();  // 同上：0 行/空状态分支也要刷导出坞，别把上一榜的勾选计数留在屏幕上
        return;
    }

    // 渲染上限：加密 yesterdayChange 全量 500+ 行、历史上 usChange 曾 5000+ 行，
    // 一次性 innerHTML 在中低端机型是数百毫秒
    // 卡顿；超过 1000 行只渲染前 1000（排序/搜索仍作用于全量数据，尾部靠搜索定位）
    const RENDER_CAP = 1000;
    const capped = items.length > RENDER_CAP;
    const shown = capped ? items.slice(0, RENDER_CAP) : items;

    // 数值相对强度条：以当前列表 |值| 最大者为 100%
    const barKey = sortDef ? sortField : "value";
    const maxAbs = Math.max(...shown.map(x => Math.abs(x[barKey] ?? 0)), 1e-9);

    tbody.innerHTML = shown
        .map((item, i) => {
            const rank = i + 1;
            // 只在「值」列真正展示涨幅（sortField==="value"，即涨跌幅 tab 的默认轴）时才红绿上色；
            // 切到 RSI/成交额/CVD强弱 时值列展示的是那个指标，红绿会误导（RSI 62 染成绿 = 假涨），
            // 一律 neutral。策略 tab 的 sortField 永远不是 "value"，本就 neutral。
            const colorClass = sortField === "value" ? getColorClass(item.value, currentTab) : "neutral";
            // 涨跌语义只标 up/down,红绿由 CSS 的 [data-asset] 作用域决定(A股 涨红跌绿自动翻)
            const valCls = colorClass === "positive" ? " val--up" : colorClass === "negative" ? " val--down" : "";
            const displayValue = sortDef ? sortDef.format(item) : config.format(item);
            const checked = selectedSymbols.has(item.symbol) ? "checked" : "";

            const rankCell = rank <= 3
                ? `<span class="medal medal--${rank}">${rank}</span>`
                : `<span class="rank-num">${rank}</span>`;

            const barVal = Math.abs(item[barKey] ?? 0);
            const barW = Math.max(3, Math.round(barVal / maxAbs * 100));

            const subInfo = config.subFormat ? `<div class="sub">${config.subFormat(item, sortField)}</div>` : "";

            const tvUrl = tvUrlFor(item.symbol);
            // symbol 与 name 同样来自数据管道，一律转义后再进 innerHTML（2026-07-24 审计：
            // 原先只转 name、symbol 裸拼，防御不一致——标的池目前全是 [A-Z0-9.] 所以是潜伏面
            // 不是活 bug，但 ticker 一旦含 " 或 < 就会撑破行结构/属性逃逸）。data-symbol 转义
            // 无副作用：浏览器读 dataset 时会自动解码回原值。
            const symSafe = escapeHtml(item.symbol);
            const { base: symBase0, suffix: symSuffix0 } = symbolDisplayParts(item.symbol);
            const symBase = escapeHtml(symBase0), symSuffix = escapeHtml(symSuffix0);
            // A股行带 name（股票名），比 "/ SH" 后缀对用户有用得多；crypto 行维持 "/ USDT"。
            const symLabel = item.name
                ? `${symBase} <span class="sym__suffix">${escapeHtml(item.name)}</span>`
                : `${symBase} <span class="sym__suffix">/ ${symSuffix}</span>`;
            return `<div class="tr" role="row">
                <div class="c-check" role="cell"><span class="row-accent"></span><input type="checkbox" class="chk chk--row symbol-check" data-symbol="${symSafe}" aria-label="选择 ${symSafe}" ${checked}></div>
                <div class="c-rank" role="cell">${rankCell}</div>
                <div class="c-sym" role="cell">
                    <a class="sym" href="${escapeHtml(tvUrl)}" target="_blank" rel="noopener noreferrer" title="在 TradingView 打开 ${symSafe} 图表">
                        <span class="sym__base">${symLabel}</span>
                        <span class="sym__tv">TV ↗</span>
                    </a>${subInfo}
                </div>
                <div class="c-val" role="cell">
                    <span class="val${valCls}">${displayValue}<span class="val__bar" style="width:${barW}%"></span></span>
                </div>
            </div>`;
        })
        .join("");

    if (foot) {
        // 四种情形分开说：搜索给「匹配/命中」双数,截断提示渲染上限,橱窗榜未解锁给
        // 解锁 CTA（「共 1 个标的」对着「命中 55」毫无解释,还浪费了最强的转化位——
        // 用户刚看完 TOP1 正想看剩下的）,平常一句「共 N」
        const total = (data[currentTab] || []).length;
        const teaserLocked = PAYWALL_ENABLED && currentTab === TEASER_TAB && !license.valid;
        // ⚠️⚠️ 量词必须随榜的语义走（与 renderBoardHead 同一判据）：策略榜「命中 N」、
        // 行情榜「共 N」——行情榜无任何筛选，说"命中 5193"会被读成"筛出了 5193 个"。
        // **2026-07-29 A股 三个涨跌幅榜（各 ~5190 行）上线后才暴露**：加密那三个只有 528 行、
        // 从未越过 RENDER_CAP(1000)，所以截断分支历史上从没在行情榜上触发过；正常态那句
        // （下面的 else）本来就写的是"共"，于是 board-head 说「共 5193」而同屏表尾说
        // 「命中 5193」，**自相矛盾**。搜索分支同理——截断提示恰恰在劝用户去搜索。
        const q = isStrategyTab(currentTab) ? "命中" : "共";
        if (searchQuery) {
            foot.textContent = `匹配 ${items.length} / ${q} ${total} 个${capped ? ` · 仅渲染前 ${RENDER_CAP} 行` : ""}`;
        } else if (capped) {
            foot.textContent = `显示 ${RENDER_CAP} / ${q} ${total} 个 · 单榜最多渲染 ${RENDER_CAP} 行,其余可用搜索定位`;
        } else if (teaserLocked) {
            const hits = tabCount(currentTab); // paidMeta 的真实命中数（不是被截成 1 行的数组长度）
            const rest = hits != null && hits > total ? `其余 ${hits - total} 个标的` : "完整榜单";
            foot.innerHTML = `免费预览第 1 名，${rest}需通行证解锁<button type="button" class="foot-cta" id="teaserUnlockBtn">立即解锁</button>`;
            const btn = document.getElementById("teaserUnlockBtn");
            if (btn) btn.addEventListener("click", openPurchaseDialog);
        } else {
            foot.textContent = `共 ${total} 个标的`;
        }
        foot.hidden = false;
    }

    updateExportBar();
}

function switchTab(tab) {
    currentTab = tab;
    safeStore.set("localStorage", LS_TAB, tab); // 记住上次看的榜单(刷新/回访直达)
    // 资产随 tab 同步：data-asset 驱动 CSS 的涨跌语义翻转 + 资产标识色
    currentAsset = assetOfTab(tab);
    lastTabByAsset[currentAsset] = tab;
    const app = document.getElementById("app");
    if (app) app.dataset.asset = currentAsset;
    sortAsc = false; // 所有 tab 默认降序（点表头可切升序）
    const cfg = TABS_CONFIG[tab];
    sortField = cfg && cfg.sorts ? cfg.sorts[0].key : "value"; // 切 tab 重置排序字段
    searchQuery = ""; // 切 tab 清空搜索
    const sb = document.getElementById("searchBox");
    if (sb) sb.value = "";
    // 表体是容器内滚动(.tbody),切榜必须回顶,否则新榜停留在上一榜的滚动位置(审计 P1-2)
    const tb = document.getElementById("rankBody");
    if (tb) tb.scrollTop = 0;
    renderNav();
    renderTable();
    // 脉搏条 + 新鲜度胶囊 + 横幅都按当前资产切换,切 tab 立即刷新,不等 30s 轮询。
    renderPulse();
    renderUpdatePill();
    renderStaleBanner();
    renderSnapshotBanner();
}

// 切资产（rail/drawer 顶部分段控件）：回到该资产上次看的榜单
function switchAsset(assetK) {
    if (assetK === currentAsset) return;
    // 兜底：lastTabByAsset 全量初始化后正常不可达，但兜底若被触发（未来改坏），
    // 二分写法会把「ETF」误跳去别的资产（2026-07-20 审计补的防御）
    const fallback = assetK === "ashare" ? "ashareMonthlyWeeklyDaily"
        : assetK === "etf" ? "etfMonthlyWeeklyDaily"
        : assetK === "crypto" ? "monthlyWeeklyDaily" : "usMonthlyWeeklyDaily";
    switchTab(lastTabByAsset[assetK] || fallback);
}

// 收盘快照说明横幅：切到 美股/ETF 显示,关闭一次永久不再弹（localStorage——"这个资产是
// 收盘快照不是盘中实时"是常识型说明,看过一次就够）。两个资产各自独立的 dismiss key,
// 互不影响。（2026-07-24 A股 退役后连同 DOM id 一并从 ashareBanner 改名 snapshotBanner
// ——它从 2026-07-20 起就覆盖多个资产，名字早已名不副实。⚠️ localStorage 的 key 保持
// 原样不动：改了会让所有已关过横幅的老用户重新看到它。）
const SNAPSHOT_BANNER_TEXT = {
    ashare: "A股 数据为每个交易日收盘后更新的快照，不是盘中实时行情。",
    us: "美股 数据为每个交易日收盘后更新的快照，不是盘中实时行情。",
    etf: "ETF 数据为每个美股交易日收盘后更新的快照，不是盘中实时行情。",
};
function snapshotBannerDismissKey() {
    return currentAsset === "etf" ? "bsj_etf_banner_dismissed"
        : currentAsset === "ashare" ? "bsj_ashare_banner_dismissed"
        : "bsj_us_banner_dismissed";
}
function renderSnapshotBanner() {
    const el = document.getElementById("snapshotBanner");
    if (!el) return;
    const applicable = currentAsset === "ashare" || currentAsset === "us" || currentAsset === "etf";
    if (applicable) {
        const textEl = el.querySelector("[data-banner-text]");
        if (textEl) textEl.textContent = SNAPSHOT_BANNER_TEXT[currentAsset];
    }
    const dismissed = applicable && safeStore.get("localStorage", snapshotBannerDismissKey()) === "1";
    el.hidden = !(applicable && !dismissed);
}

function toggleSort() {
    sortAsc = !sortAsc;
    renderTable();
}

// === 数据加载 ===

/** updateTime 形如 "2026-07-15 08:34:26 UTC" */
function parseUpdateTime(s) {
    if (!s) return null;
    const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T"));
    return Number.isNaN(t) ? null : t;
}

function renderStaleBanner() {
    const el = document.getElementById("staleBanner");
    if (!el || !data) return;

    if (isAshareTab(currentTab) || isUsTab(currentTab) || isEtfTab(currentTab)) {
        // A股/美股/ETF 都是每个交易日收盘后更新一次，阈值远比 crypto 的小时级宽松
        // （容忍节假日/偶发延迟），跟 check-freshness.yml 的 30 小时口径一致。
        // ETF 与美股同管道同次运行产出，读同一个 usUpdateTime。
        const t = parseUpdateTime(isAshareTab(currentTab) ? data.ashareUpdateTime : data.usUpdateTime);
        el.hidden = !(t && Date.now() - t > 30 * 3600 * 1000);
        return;
    }
    // 加密走小时级 updateTime（每小时抓一次，2.5h 未动就亮横幅），与上面三个收盘日更的
    // 资产阈值差一个数量级——这条分支 2026-07-25 晚随加密榜移除短暂不可达，同晚已复活。
    const t = parseUpdateTime(data.updateTime);
    // 数据每小时更新；超过 2.5 小时没动就亮横幅
    el.hidden = !(t && Date.now() - t > 2.5 * 3600 * 1000);
}

/** 顶栏新鲜度胶囊（Claude Design 重设计）：加密（小时级倒计时）+ A股 + 美股（均收盘
 *  日更）并置，当前资产侧高亮、其余 .is-dim；移动端 CSS 只显示激活侧。
 *  A股/美股 显示各自的 DataDate（数据实际对应的交易日）——任务跑了但数据源迟发布时
 *  它会落后于更新时间，显示出来用户能看出"今天的数据其实还是昨天的"。
 *  ETF 无独立胶囊：与美股同管道同时间戳，复用 freshUS。 */
function renderUpdatePill() {
    const elC = document.getElementById("freshCrypto");
    const elA = document.getElementById("freshAshare");
    const elU = document.getElementById("freshUS");
    if (!elC || !elA || !elU || !data) return;

    // --- 加密胶囊 ---
    const tC = parseUpdateTime(data.updateTime);
    const ageC = tC ? (Date.now() - tC) / 60000 : Infinity;
    const clsC = ageC <= 75 ? "fresh--ok" : ageC <= 150 ? "fresh--warn" : "fresh--bad";
    const now = new Date();
    let nextMin = 65 - now.getUTCMinutes();
    if (nextMin > 60) nextMin -= 60;
    const nextTxt = ageC > 150 ? "" :
        nextMin <= 1 ? ' <span class="fresh__next">· 刷新中…</span>' :
        ` <span class="fresh__next">· 下次 ≈ ${nextMin} 分</span>`;
    document.getElementById("freshCryptoTxt").innerHTML = data.updateTime
        ? ` · <b>${data.updateTime.slice(11, 16)}</b>&nbsp;UTC${nextTxt}` : " · —";

    // --- A股胶囊（收盘日更；ashareDataDate 是 tushare 的 'YYYYMMDD'，无分隔符，
    // 与美股的 ISO 'YYYY-MM-DD' slice 位置不同，别抄错）---
    const tA = parseUpdateTime(data.ashareUpdateTime);
    let clsA = "fresh--bad";
    if (tA) {
        const ageA = (Date.now() - tA) / 60000;
        // 每天 07:05 UTC 触发后等 tushare 发布 → 25.5h 内新鲜，30h（与 check-freshness
        // 同阈值）以上才红
        clsA = ageA <= 25.5 * 60 ? "fresh--ok" : ageA <= 30 * 60 ? "fresh--warn" : "fresh--bad";
    }
    const dd = data.ashareDataDate
        ? `<b>${data.ashareDataDate.slice(4, 6)}-${data.ashareDataDate.slice(6, 8)}</b> 收盘`
        : (tA ? `<b>${data.ashareUpdateTime.slice(11, 16)}</b> UTC` : "—");
    document.getElementById("freshAshareTxt").innerHTML = ` · ${dd} <span class="fresh__next">· 日更</span>`;

    // --- 美股胶囊（收盘日更；usDataDate 是 'YYYY-MM-DD' ISO 格式）---
    const tU = parseUpdateTime(data.usUpdateTime);
    let clsU = "fresh--bad";
    if (tU) {
        const ageU = (Date.now() - tU) / 60000;
        // 每天 21:20 UTC 更新 → 25.5h 内新鲜，30h（与 check-freshness 同阈值）以上才红
        clsU = ageU <= 25.5 * 60 ? "fresh--ok" : ageU <= 30 * 60 ? "fresh--warn" : "fresh--bad";
    }
    const du = data.usDataDate
        ? `<b>${data.usDataDate.slice(5, 7)}-${data.usDataDate.slice(8, 10)}</b> 收盘`
        : (tU ? `<b>${data.usUpdateTime.slice(11, 16)}</b> UTC` : "—");
    document.getElementById("freshUSTxt").innerHTML = ` · ${du} <span class="fresh__next">· 日更</span>`;

    // 状态类 + 当前资产侧高亮。ETF 资产没有第四个胶囊——它与美股同管道同时间戳，
    // 高亮美股胶囊即是它的新鲜度指示（移动端只显非 dim 的那一个，必须有一个亮着）。
    elC.className = `fresh ${clsC}${currentAsset === "crypto" ? "" : " is-dim"}`;
    elA.className = `fresh ${clsA}${currentAsset === "ashare" ? "" : " is-dim"}`;
    elU.className = `fresh ${clsU}${(currentAsset === "us" || currentAsset === "etf") ? "" : " is-dim"}`;
}

// 各资产的策略 tab 数，pulse "N 榜" 用；按资产从 TAB_GROUPS 算，不硬编码。
const CRYPTO_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "加密").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;
const ASHARE_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "A股").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;
const US_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "美股").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;
const ETF_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "ETF").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;

/** 当前资产的策略 tab 命中总数。用 TAB_META[k].asset 过滤，只统计该资产自己的
 *  策略榜。走 paidMeta（tabCount 的口径）而不是直接数组长度——付费墙生效后
 *  data.paidMeta 恒存在（免费橱窗也带着它），锁定态一样能算出总数，不会因为
 *  大部分 tab 的 data[k] 是 undefined 而漏计。 */
function strategyHits(asset) {
    if (!data || !data.paidMeta) return null;
    return Object.keys(data.paidMeta)
        .filter(k => isStrategyTab(k) && TAB_META[k] && TAB_META[k].asset === asset)
        .reduce((s, k) => s + data.paidMeta[k], 0);
}

function pulseTile(k, v, sub) {
    return `<div class="pulse__cell"><div class="pulse__label">${k}</div><div class="pulse__value">${v}</div><div class="pulse__sub">${sub}</div></div>`;
}

// 价格/百分比格式化：大额无小数带千分位、小额留精度（USDT 永续从 BTC 6 万到 1000SATS
// 的 1e-5 跨 9 个数量级，固定小数位一定有一头是废的）。
// ⚠️ fmtMktPrice **有两个消费者**：市场概览的 BTC/ETH 锚点 + 三个涨跌幅榜副行的
// 「开 X → 收 Y」（2026-07-29 起，见 changeSub）。改它会同时动这两处。
function fmtMktPrice(p) {
    if (p == null) return "—";
    if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
    if (p >= 1) return "$" + p.toFixed(2);
    if (p >= 0.01) return "$" + p.toFixed(4);
    // ⚠️ 2026-07-29 由 toPrecision(2) 提到 4：涨跌幅榜副行要展示「开 X → 收 Y」，2 位有效
    // 数字会让低价币的两个价格看起来对不上涨跌幅（AKE 0.0019814→0.0031325 是 +58.1%，
    // 但显示成 $0.0020→$0.0031 只有 +55%）。**对市场概览零影响**：那里只喂 BTC/ETH，
    // 永远走上面 >= 1000 那个分支，这一行是死枝。外面套 Number() 是为了去掉 toPrecision
    // 补出来的尾零（0.0000123 → "0.00001230" → "0.0000123"）。
    return "$" + Number(p.toPrecision(4));
}
// A股 价格：沪深报价精度恒为 0.01 ⇒ 两位小数即完整；¥ 前缀（不是 crypto 的 $）。
// A股 涨跌幅榜副行「昨收 X → 收 Y」用（close-to-close，见 asharePriceCtx）。
function fmtCnyPrice(p) {
    if (p == null) return "—";
    return "¥" + p.toFixed(2);
}
function fmtMktPct(x, dp) {
    if (x == null) return "—";
    return (x >= 0 ? "+" : "") + x.toFixed(dp == null ? 2 : dp) + "%";
}
function mktAnchor(name, a) {
    if (!a) return "";
    const cls = a.change >= 0 ? "is-up" : "is-down";
    return `<div class="mkt__item" title="${name} 最新价与 24h 涨跌幅">
        <span class="mkt__k">${name}</span>
        <span class="mkt__v">${fmtMktPrice(a.price)} <span class="${cls}">${fmtMktPct(a.change)}</span></span>
    </div>`;
}

/** 市场概览全局条（免费引流）：永续合约全市场 24h 内生指标 + 合约情绪,数据来自
 *  data.marketOverview（后端 get_market_overview 自算,只用 24h 行情 + 资金费率两次调用）。
 *  参考 CMC/CoinGecko 顶部全局条,但指标为合约市场定制（涨跌宽度/资金费率持仓/合约总成交额）。
 *
 *  ⚠️ **2026-07-25 晚从"仅加密视图显示"解禁成全资产可见**：那天站长先下「移除加密所有
 *  TAB」，这条不是 tab 是个 dict（后端 ALWAYS_FREE_FIELDS）故刻意保留，但"加密视图"
 *  当时已不复存在，继续 gate 在 currentAsset==="crypto" 上等于连带删掉一个没被要求删
 *  的东西。**同晚加密榜回来了也不改回去**——全局条本来就叫"全局"条，四个资产都看得到
 *  一条 24/7 的市场温度是加分项。代价是它会挂在 A股/美股/ETF 榜上方，所以**必须自报
 *  是哪个市场的数据**，见下面第一块 tag（否则用户会以为那是当前资产的成交额/情绪）。 */
function renderMarketOverview() {
    const el = document.getElementById("marketOverview");
    if (!el) return;
    const mo = data && data.marketOverview;
    if (!mo) { el.hidden = true; return; }

    const b = mo.breadth || {};
    const s = mo.sentiment;
    const zone = s < 25 ? "fear2" : s < 45 ? "fear" : s < 55 ? "neutral" : s < 75 ? "greed" : "greed2";
    const items = [];

    // 身份 + 刷新时刻：这条会出现在 A股/美股/ETF 榜上方，不写明"这是加密市场的数"会被
    // 当成当前资产的指标。顺带给了 updateTime 一个可见落点（移动端只显示当前资产那一个
    // 新鲜度胶囊，看股票榜时这里是加密刷新时刻在小屏上唯一的落点）。复用既有 class。
    if (data.updateTime) items.push(`<div class="mkt__item" title="加密 USDT 永续合约全市场，每小时更新">
        <span class="mkt__k">加密市场</span>
        <span class="mkt__v"><b>${data.updateTime.slice(11, 16)}</b> UTC<span class="mkt__sub">每小时</span></span>
    </div>`);

    items.push(`<div class="mkt__item mkt__item--senti" title="市场情绪指数（0-100）：基于全市场涨跌宽度与平均涨跌幅自算，非第三方指数">
        <span class="mkt__k">市场情绪</span>
        <span class="mkt__senti">
            <span class="mkt__gauge"><i class="mkt__marker" style="left:${Math.max(0, Math.min(100, s))}%"></i></span>
            <span class="mkt__score mkt-z--${zone}">${s}<em>${mo.sentimentLabel}</em></span>
        </span>
    </div>`);

    if (b.total) items.push(`<div class="mkt__item" title="全市场 24h 上涨/下跌合约家数（市场宽度）">
        <span class="mkt__k">涨跌家数</span>
        <span class="mkt__v"><span class="is-up">${b.up}↑</span> <span class="is-down">${b.down}↓</span><span class="mkt__sub">${b.upPct}% 上涨</span></span>
    </div>`);

    items.push(`<div class="mkt__item" title="全市场加密 USDT 永续合约 24h 总成交额">
        <span class="mkt__k">24h 合约成交额</span>
        <span class="mkt__v">$${mo.totalVolumeFormatted}</span>
    </div>`);

    if (mo.funding) items.push(`<div class="mkt__item" title="全市场平均资金费率 + 正费率占比（正=多头付费，反映杠杆持仓偏向）">
        <span class="mkt__k">资金费率</span>
        <span class="mkt__v">均 <span class="${mo.funding.avg >= 0 ? "is-up" : "is-down"}">${fmtMktPct(mo.funding.avg, 4)}</span><span class="mkt__sub">正 ${mo.funding.positivePct}%</span></span>
    </div>`);

    items.push(mktAnchor("BTC", mo.btc));
    items.push(mktAnchor("ETH", mo.eth));

    el.innerHTML = `<div class="mkt__inner">${items.filter(Boolean).join("")}</div>`;
    el.hidden = false;
}

/** 市场脉搏速览条（无缝状态条）：跟随当前资产切换,切 tab 立即重渲染。 */
function renderPulse() {
    // 概览条与脉搏同触发（切榜/数据刷新/解锁），一处调用覆盖三处；try 包住——新组件
    // 渲染若出任何错，绝不能连累脉搏和整条主渲染链（付费站,稳健优先）。
    try { renderMarketOverview(); } catch (e) { console.warn("市场概览渲染失败", e); }
    const el = document.getElementById("pulse");
    if (!el || !data) return;
    const tiles = currentAsset === "ashare" ? asharePulseTiles()
        : currentAsset === "etf" ? etfPulseTiles()
        : currentAsset === "crypto" ? cryptoPulseTiles()
        : usPulseTiles();
    if (!tiles) { el.hidden = true; return; }
    el.innerHTML = tiles.join("");
    el.hidden = false;
}

// 锁定态兜底：换取"今日领涨"这类 tile 需要的是具体某一行数据，锁定后拿不到（连
// 涨跌幅榜现在也是付费内容），不能伪造；但命中数是公开的教据（paidMeta），至少留
// 一块"策略命中，解锁查看"的磁贴,总比整条脉搏消失更能体现"这里有东西"。
function lockedPulseTile(asset, totalTabs) {
    const hits = strategyHits(asset);
    if (hits == null) return null;
    // ⚠️⚠️ 2026-08-06 修：锁图标 + 「解锁查看…」这条 CTA **只在锁定态出**。
    // 此前解锁态一并复用了整块磁贴，等于对着已经付过钱的用户喊"去解锁"（真机实测到）。
    // 命中数那一半锁定/解锁都正确，所以只分叉「锁图标」和「副标题」这两处，别整块另写。
    const locked = PAYWALL_ENABLED && !license.valid;
    const sub = locked ? "解锁查看完整榜单与领涨标的" : unlockedPulseSub(asset);
    return [pulseTile("策略命中" + (locked ? " " + LOCK_SVG : ""), `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${totalTabs} 榜</span>`, sub)];
}

// 解锁态的副标题：命中最多的那个策略榜。
// ⚠️ 数据源仍是**公开的 paidMeta**（命中数）不是行数据 ⇒ 不触碰下方那条
//    「别为了凑满 4 格去 data[唯一的榜] 里取行」的警告，不存在伪造全市场数字的风险。
// ⚠️ `.pulse__sub` 是 nowrap + overflow:hidden + ellipsis，榜名再长也只会被截断，
//    不会撑破磁贴——所以这里可以放榜名，不用怕最长的那个「日线9/21扩张＋量/CVD/RSI递增」。
// 单榜资产（A股/美股/ETF 各只有 1 个策略榜）说"命中最多"是废话，故分两种措辞。
function unlockedPulseSub(asset) {
    if (!data || !data.paidMeta) return "";
    const keys = Object.keys(data.paidMeta)
        .filter(k => isStrategyTab(k) && TAB_META[k] && TAB_META[k].asset === asset);
    if (!keys.length) return "";
    const top = keys.reduce((a, k) => (data.paidMeta[k] > data.paidMeta[a] ? k : a), keys[0]);
    return keys.length === 1
        ? `全部来自「${TAB_META[top].name}」`
        : `命中最多：${TAB_META[top].name} ${data.paidMeta[top]} 个`;
}

// 加密脉搏（与股票系同款）：加密也没有全量涨跌幅榜了，"监控 N 个 / 昨日领涨 / 周线
// 领涨"三块磁贴的数据源（yesterdayChange/weeklyChange）随 2026-07-25 的移除一起下线，
// 只能退到 lockedPulseTile。旧的四格实现见 git。
function cryptoPulseTiles() { return lockedPulseTile("加密", CRYPTO_STRATEGY_TABS); }

// 三个股票系资产（A股/美股/ETF）的脉搏：**它们都没有全量涨跌幅榜了**——2026-07-24
// 起各自只剩一个筛选后的策略榜，给不了"监控 N 只 / 今日领涨 / 涨跌家数"那种全市场
// 磁贴。lockedPulseTile 本就是"拿不到具体行、但命中数是公开数据(paidMeta)"的那条
// 路径，锁定态/解锁态都正确，直接复用它即是这三个资产的完整脉搏。
// ⚠️ **别为了凑满 4 格去 data[唯一的榜] 里取行**：那是筛选结果不是全市场，
// 写成"监控 N 只"会把命中数说成标的总数，是实打实的误导。
// 旧的三份实现（含美股 ticker vs 全名的宽度取舍、ETF「涨跌分布」的措辞理由）见 git。
function asharePulseTiles() { return lockedPulseTile("A股", ASHARE_STRATEGY_TABS); }
function usPulseTiles()     { return lockedPulseTile("美股", US_STRATEGY_TABS); }
function etfPulseTiles()    { return lockedPulseTile("ETF", ETF_STRATEGY_TABS); }

/** 首屏骨架行(静态灰条,无动画——GPU 硬约束) */
function renderSkeleton() {
    const tbody = document.getElementById("rankBody");
    if (!tbody) return;
    // 复用真实行的四列 class → 零横向漂移、继承响应式列宽,数据到位时不再整体重排。
    // 静态灰条(GPU 硬约束禁动画);pointer-events:none 关掉骨架 hover。
    tbody.innerHTML = Array.from({ length: 10 }, () => {
        const w = 90 + Math.round(Math.random() * 80);
        return `
        <div class="tr" style="pointer-events:none">
            <div class="c-check"><span class="sk" style="width:15px;height:15px;border-radius:4px"></span></div>
            <div class="c-rank"><span class="sk" style="width:20px"></span></div>
            <div class="c-sym"><span class="sk" style="width:${w}px"></span><div class="sub"><span class="sk" style="width:55%;height:9px;margin-top:6px"></span></div></div>
            <div class="c-val"><span class="sk" style="width:64px;margin-left:auto"></span></div>
        </div>`;
    }).join("");
}

/** 拉付费全量数据。返回 {data, authFailed}：
 *  authFailed=true 表示确定性鉴权失败（401/402，key 无效/过期/吊销）——调用方据此
 *  推进 lastPaidUpdateTime，避免失效 key 的常开标签页每 30s 空打 Worker 打爆配额。
 *  网络错误 / 5xx / 503 视为暂时性，authFailed=false，保留已解锁内容不误锁。 */
async function fetchPaidData() {
    if (!license.key) {
        license.valid = false;
        license.reason = "missing";
        return { data: null, authFailed: true };
    }
    try {
        const resp = await fetch(WORKER_API + "/api/data", {
            headers: { "X-License-Key": normalizeKey(license.key) },
        });
        if (resp.ok) {
            license.valid = true;
            license.reason = null;
            license.expiresAt = resp.headers.get("X-License-Expires");
            license.plan = resp.headers.get("X-License-Plan"); // Worker 现回传套餐,供徽标"已解锁 · 季付"
            return { data: await resp.json(), authFailed: false };
        }
        if (resp.status === 401 || resp.status === 402) {
            license.valid = false;
            let reason = "not_found";
            try { reason = (await resp.json()).error || reason; } catch (e) { /* 忽略,用默认 reason */ }
            license.reason = reason;
            return { data: null, authFailed: true };
        }
        return { data: null, authFailed: false }; // 5xx/503：暂时性，不动 license 状态
    } catch (e) {
        return { data: null, authFailed: false }; // 网络错误：同上
    }
}

// in-flight 守卫（2026-07-24 审计）：setInterval 不 await，visibilitychange 也直接调——
// 慢网下单次拉取超过 30s（8MB / gzip 2MB，50kB/s 就要 ~40s）定时器会叠加。真正值钱的不是
// 省那次公开 JSON，而是**付费侧的竞态**：两个重叠调用都在 lastPaidUpdateTime 被写之前读到
// 旧值，于是同一小时打两次 Worker /api/data（每次 ~1.3MB KV 读），绕过"不能每 30s 打 Worker"
// 那条节流纪律。finally 复位，异常路径也不会把轮询永久卡死。
let loadInFlight = false;
async function loadData() {
    if (loadInFlight) return;
    loadInFlight = true;
    try {
        // 带宽策略（rankings.json 已 ~8.0MB / gzip ~2.0MB，绝不能每 30s 全量拉）：
        // 默认 {cache:'no-cache'} 走条件请求——数据没变时 CDN/浏览器返回 304，几乎零流量；
        // 只有当手头数据已到期（>61 分钟没更新 = 新一轮抓取该到了）才带 cache-buster
        // 强穿 CDN 缓存，且强穿最密 2.5 分钟一次（防线上抓取中断时每 30s 白拉全量）。
        // 冷启动（data 尚为 null，页面刚加载/刷新）不算"到期"——此时无从判断数据新鲜度，
        // 该交给条件请求自己决定（有浏览器缓存就 304，没有就正常 200，跟带不带
        // cache-buster 结果一样，但不带的话有缓存可用时能命中 304）。带 cache-buster
        // 会把 URL 变成从未见过的新缓存键，白白放弃这次本可能命中的 304——2026-07-20
        // 审计发现，此前 !lastT 会让冷启动必定判定为「到期」，每次开页/刷新都必然强穿。
        const lastT = data ? parseUpdateTime(data.updateTime) : null;
        const due = lastT != null && Date.now() - lastT > 61 * 60 * 1000;
        let url = "data/rankings.json";
        // 强穿基线 2.5 分钟一次；但线上抓取长时间中断时每次强穿都拿回同一份陈旧数据
        // = 纯浪费带宽（~2MB gzip/次 × 24 次/小时 ≈ 1.15GB/天/标签页）。连续强穿仍拿到
        // 同一 updateTime 就指数退避（2.5→5→10→20min 封顶），数据一旦真更新立即复位（见下）。
        let busted = false;
        const bustGap = Math.min(150000 * (2 ** bustStreak), 20 * 60 * 1000);
        if (due && Date.now() - lastBustAt > bustGap) {
            url += "?" + Date.now();
            lastBustAt = Date.now();
            busted = true;
        }
        const resp = await fetch(url, { cache: "no-cache" });
        const fresh = await resp.json();

        // 单调性守卫：busted 请求直穿源站拿到新数据后，下一次普通轮询可能从 CDN 边缘
        // 缓存拿回**上一小时的旧体**（max-age=600 内边缘不回源）。无条件采信会出现
        // 新旧数据每小时来回翻转 + 反复触发 due→全量强拉。旧于手头的数据直接丢弃。
        // crypto/A股/美股 三条管道独立写各自的时间戳，缺一个检查就会被另一个放过——
        // 只查 updateTime 会让 ashareUpdateTime/usUpdateTime 被回滚（它们每天只更新
        // 一次，回滚后要等下一次 crypto 整点刷新 updateTime 才会被下面的 render-key
        // 检查带出来重渲染）。
        const freshT = parseUpdateTime(fresh.updateTime);
        const haveT = data ? parseUpdateTime(data.updateTime) : null;
        const freshAshareT = parseUpdateTime(fresh.ashareUpdateTime);
        const haveAshareT = data ? parseUpdateTime(data.ashareUpdateTime) : null;
        const freshUsT = parseUpdateTime(fresh.usUpdateTime);
        const haveUsT = data ? parseUpdateTime(data.usUpdateTime) : null;
        const rolledBack = (haveT && freshT && freshT < haveT)
            || (haveAshareT && freshAshareT && freshAshareT < haveAshareT)
            || (haveUsT && freshUsT && freshUsT < haveUsT);
        // 强穿退避：这次强穿真拿回更新的数据 → 复位到 2.5min；否则（同一/更旧的
        // updateTime，线上还在陈旧）退避加倍，最多 20min 一次（bustStreak 封 3）。
        if (busted) bustStreak = (freshT != null && (haveT == null || freshT > haveT)) ? 0 : Math.min(bustStreak + 1, 3);
        if (rolledBack) {
            renderUpdatePill();   // 倒计时照常走（用手头数据）
            renderStaleBanner();
            return;
        }

        // 免费橱窗和付费全量来自同一批管道，所以只在任一资产的时间戳变化时才打
        // Worker，否则每 30s 轮询会把 CF 免费额度打爆。触发键用三时间戳组合（与下方
        // renderKey 同款）：A股/美股 各自收盘后只刷新自己的时间戳，只盯 crypto 的
        // updateTime 会让它们写进 KV 的新付费数据最多晚 ~1 小时（等下一个 crypto
        // 整点）才被拉取。付费墙关闭时 fresh 本身已是全量，完全不打 Worker。
        // ⚠️ 本键与下方 renderKey、以及初始化处的 lastPaidUpdateTime **必须同构**
        // （同样的字段、同样的顺序），改一处要三处一起改。
        const paidFetchKey = fresh.updateTime + "|" + fresh.ashareUpdateTime + "|" + fresh.usUpdateTime;
        if (PAYWALL_ENABLED && license.key && paidFetchKey !== lastPaidUpdateTime) {
            const paid = await fetchPaidData();
            // KV 的 updateTime 是**上传时刻**（三条管道谁上传谁刷新，见 upload_paid_data
            // 的兜底），公开文件的 updateTime 是 crypto 的 build 时刻——两者只差几百毫秒
            // 但秒级字符串跨秒即不同、A股/美股 上传后更是整段不同，**绝不能用严格相等
            // 判断**（2026-07-22 审计实锤：相等与否取决于 build→上传是否跨秒边界，纯靠
            // 运气；不等时付费回访用户整小时拿不到付费数据）。守卫的本意是挡 KV 边缘
            // 缓存回吐的**旧**付费体，解析成时间后用 >= 判断即可：上传时刻晚于（或同秒
            // 于）手头免费数据的 build 时刻 = 新数据，采纳；早于 = 旧缓存体，拒收。
            const paidT = paid.data ? parseUpdateTime(paid.data.updateTime) : null;
            if (paid.data && paidT != null && (freshT == null || paidT >= freshT)) {
                paidData = paid.data;
                lastPaidUpdateTime = paidFetchKey;
            } else if (paid.authFailed) {
                // 确定性鉴权失败：推进 lastPaidUpdateTime，本周期不再重试
                lastPaidUpdateTime = paidFetchKey;
            }
            // 其余（付费 updateTime 滞后、5xx、网络错误）：不推进，30s 轮询继续追新数据
            // fetchPaidData 可能改变 license.valid/reason（自动校验成功 / 挂机中过期吊销），
            // 徽标必须跟着刷新——此前只有初始化和表单提交两个调用点，回访用户自动解锁后
            // 徽标永远停在"未解锁"、挂机中被吊销徽标永远停在"已解锁"（2026-07-22 审计）。
            renderLicenseStatus();
        }

        data = { ...fresh, ...(license.valid && paidData ? paidData : {}) };
        data.updateTime = fresh.updateTime; // 新鲜度基准恒以免费文件（30s 轮询）为准

        renderUpdatePill();   // 倒计时每轮都要走
        renderStaleBanner();

        // 渲染键 = updateTime + ashareUpdateTime + usUpdateTime 组合：三条管道各自独立
        // 刷新，只看其中一个会让另外两条的更新落地却不触发重渲染——A股/美股 数据到位后
        // 表格/导航/脉搏条会停留在上一交易日的行，直到下一次 crypto 整点刷新才顺带带
        // 出来（此时顶部胶囊已经先一步显示新日期，出现"胶囊新、表格旧"的错位）。
        // 另加两个付费维度（2026-07-22 审计）：paidData 的到位时刻（首轮拉取失败、次轮
        // 成功时免费时间戳没变，不加这维付费内容落地也不重渲染，锁定态要钉到下个整点）
        // 和 license.valid（挂机中被吊销/过期时表格要重新上锁，不能冻结在旧付费内容）。
        const renderKey = fresh.updateTime + "|" + fresh.ashareUpdateTime + "|" + fresh.usUpdateTime
            + "|" + (paidData ? paidData.updateTime : "") + "|" + (license.valid ? "1" : "0");
        if (renderKey !== lastRenderKey) {
            lastRenderKey = renderKey;
            renderPulse();
            renderNav();
            renderTable();
        }
    } catch (e) {
        // 失败指示染**当前资产**的胶囊：移动端只显示非 dim 的那一个,写死 freshCrypto 时
        // 用户在 A股/美股 视图下失败完全不可见(2026-07-20 审计修正)。当前资产的胶囊本就
        // 无 is-dim,其余保持原样(dim 状态由 renderUpdatePill 管理)。
        // ETF 没有自己的胶囊,与 renderUpdatePill 同款归并到美股胶囊(2026-07-21 审计补漏:
        // 此前 etf 落进兜底 freshCrypto——ETF 视图下它是 dim 的,移动端整个被隐藏)。
        const pillId = currentAsset === "ashare" ? "freshAshare"
            : (currentAsset === "us" || currentAsset === "etf") ? "freshUS" : "freshCrypto";
        const pill = document.getElementById(pillId);
        if (pill) {
            pill.className = "fresh fresh--bad";
            document.getElementById(pillId + "Txt").textContent = " · 数据加载失败,稍后自动重试";
        }
        // 只有从未成功加载过才占用表格区展示错误；
        // 已有数据时单次轮询失败不能把用户正在看的榜单清掉。
        if (!data) {
            document.getElementById("rankBody").innerHTML =
                '<div class="empty"><div class="empty__icon">⚠️</div><div class="empty__title">无法加载数据</div><div class="empty__desc">稍后自动重试</div></div>';
        }
    } finally {
        loadInFlight = false;   // 见函数上方 in-flight 守卫注释；必须在 finally 里复位
    }
}

// === 弹窗 ===

function initFooterUI() {
    document.querySelectorAll(".flink[data-dialog]").forEach(b =>
        b.addEventListener("click", () => document.getElementById(b.dataset.dialog).showModal()));
    document.querySelectorAll(".dialog-close").forEach(b =>
        b.addEventListener("click", () => document.getElementById(b.dataset.dialog).close()));
    // 点弹窗外部(backdrop)也能关：backdrop 的点击事件 target 是 <dialog> 元素本身,
    // 内容区的点击 target 是子元素,借此区分,无需额外遮罩
    document.querySelectorAll("dialog.modal").forEach(d =>
        d.addEventListener("click", e => { if (e.target === d) d.close(); }));
}

// === 付费墙：通行证状态 / 输入 / 购买 三块 UI ===

/** 顶栏 + 抽屉两份通行证状态徽标同步（结构相同，选择器不同）。 */
function renderLicenseStatus() {
    [
        { badgeSel: "#licenseStatus .lic-badge", btn: "licenseBtn" },
        { badgeSel: "#licenseStatusDrawer", btn: "licenseBtnDrawer" },
    ].forEach(({ badgeSel, btn }) => {
        const badge = document.querySelector(badgeSel);
        const btnEl = document.getElementById(btn);
        if (!badge) return;
        // 幂等的 class 赋值：先剥掉全部三种状态 class 再加当前的。旧写法只 replace
        // 另外两种、不剥自身，本函数进 loadData 轮询路径后（30s 一次）同状态重复调用
        // 会无限累积重复 class。
        const base = badge.className.replace(/\s*\blic-(on|off|expired)\b/g, "").trim();
        if (license.valid) {
            badge.className = base + " lic-on";
            const planLabel = PLAN_LABEL[license.plan] || "";
            badge.textContent = `已解锁${planLabel ? " · " + planLabel : ""}`;
            if (btnEl) btnEl.textContent = "管理通行证";
        } else if (license.key) {
            badge.className = base + " lic-expired";
            badge.textContent = LOCK_REASON[license.reason] ? "通行证失效" : "未解锁";
            if (btnEl) btnEl.textContent = "输入通行证";
        } else {
            badge.className = base + " lic-off";
            badge.textContent = "未解锁";
            if (btnEl) btnEl.textContent = "输入通行证";
        }
    });
}

function openUnlockDialog(hintMsg) {
    const dlg = document.getElementById("licenseDialog");
    if (!dlg) return;
    const input = document.getElementById("licenseInput");
    if (input) input.value = license.key || "";
    const msg = document.getElementById("licenseMsg");
    if (msg) {
        // 已解锁用户点"管理通行证"(无 hint)时,顺带展示到期日——header 里早已拿到 expiresAt
        // 却从不显示;有 hint(如"付款已收到…")时不覆盖。
        let m = hintMsg || "";
        if (!m && license.valid && license.expiresAt) {
            m = `当前通行证有效期至 ${String(license.expiresAt).slice(0, 10)}`;
        }
        msg.textContent = m;
        msg.className = "lic-msg";
    }
    dlg.showModal();
}

function openPurchaseDialog() {
    const dlg = document.getElementById("purchaseDialog");
    if (!dlg) return;
    const cmsg = document.getElementById("checkoutMsg");
    if (cmsg) { cmsg.textContent = ""; cmsg.className = "lic-msg"; }
    dlg.showModal();
}

function renderPlanPrices() {
    for (const p of Object.keys(PRICES)) {
        const el = document.getElementById("price" + p[0].toUpperCase() + p.slice(1));
        if (el) el.textContent = `${PRICES[p]} USDT`;
    }
}

function initPaywallUI() {
    renderPlanPrices();
    renderLicenseStatus();

    document.getElementById("licenseBtn")?.addEventListener("click", () => openUnlockDialog());
    document.getElementById("licenseBtnDrawer")?.addEventListener("click", () => { closeDrawer(); openUnlockDialog(); });

    document.getElementById("licenseSwitchToBuy")?.addEventListener("click", () => {
        document.getElementById("licenseDialog").close();
        openPurchaseDialog();
    });
    document.getElementById("purchaseSwitchToLicense")?.addEventListener("click", () => {
        document.getElementById("purchaseDialog").close();
        openUnlockDialog();
    });

    // 套餐选择：点哪个高亮哪个，默认选中 quarterly（HTML 里 bp-best 标的那档）
    document.getElementById("buyPlans")?.addEventListener("click", e => {
        const btn = e.target.closest(".buy-plan");
        if (!btn) return;
        selectedPlan = btn.dataset.plan;
        document.querySelectorAll(".buy-plan").forEach(b => b.classList.toggle("is-selected", b === btn));
    });
    document.querySelector(`.buy-plan[data-plan="${selectedPlan}"]`)?.classList.add("is-selected");

    // 输入通行证：本地校验格式后直接尝试拉付费数据判断有效性（Worker 是唯一真相源，
    // 不在前端单独维护一份校验逻辑）
    document.getElementById("licenseForm")?.addEventListener("submit", async e => {
        e.preventDefault();
        const raw = document.getElementById("licenseInput").value;
        const key = normalizeKey(raw);
        const msg = document.getElementById("licenseMsg");
        if (!key) {
            if (msg) { msg.textContent = LOCK_REASON.missing; msg.className = "lic-msg lic-err"; }
            return;
        }
        license.key = key;
        safeStore.set("localStorage", LS_LICENSE, key);
        if (msg) { msg.textContent = "校验中…"; msg.className = "lic-msg"; }
        const sbtn = document.querySelector("#licenseForm .btn-primary");
        if (sbtn) sbtn.disabled = true; // 校验期间禁用"解锁",防慢网并发重复提交(与 checkout 一致)
        lastPaidUpdateTime = null; // 强制这次不跳过，立即真实校验一次
        const result = await fetchPaidData();
        if (result.data) {
            if (sbtn) sbtn.disabled = false;
            paidData = result.data;
            // 合并后必须恢复 updateTime：paidData 带的是 KV **上传时刻**（谁上传谁刷新），
            // 直接盖掉免费文件的 build 时刻会让下一轮 loadData 的单调性守卫把正常新数据
            // 误判成"回滚"整段拒收（loadData 路径有同款恢复，这里此前漏了）。
            const freeUpdateTime = data ? data.updateTime : null;
            data = { ...data, ...paidData };
            if (freeUpdateTime) data.updateTime = freeUpdateTime;
            // 首屏公开数据尚未到达（data 原为 null）时没有 build 时刻可恢复——必须删掉
            // KV 带来的上传时刻，否则它可能晚于公开文件的 build 时刻（美股上传也刷它），
            // 下一轮 loadData 的单调性守卫会把正常公开数据误判成"回滚"整段拒收，
            // 22 个免费榜空窗直到公开 updateTime 追过 KV 时刻（最长 ~1 小时）。
            else delete data.updateTime;
            // ⚠️ 必须与 loadData 的 paidFetchKey **同构**（同字段同顺序，现为三时间戳）
            lastPaidUpdateTime = data ? (data.updateTime + "|" + data.ashareUpdateTime + "|" + data.usUpdateTime) : null;
            renderLicenseStatus();
            if (msg) { msg.textContent = "解锁成功！"; msg.className = "lic-msg lic-ok"; }
            // 首屏公开数据(~8MB)还没到达时(freeUpdateTime 为空)，此刻 data 是"付费 only"
            // 对象——直接渲会让免费榜/脉搏/命中数瞬时空白(自愈但难看)。这种竞态交由在飞/
            // 下一轮 loadData 完成完整合并+渲染；常见路径(已在浏览、公开数据在手)立即渲染。
            if (freeUpdateTime) { renderNav(); renderTable(); renderPulse(); }
            else loadData();
            setTimeout(() => document.getElementById("licenseDialog").close(), 700);
        } else {
            if (sbtn) sbtn.disabled = false;
            renderLicenseStatus();
            if (msg) {
                msg.textContent = LOCK_REASON[license.reason] || "校验失败，请稍后重试";
                msg.className = "lic-msg lic-err";
            }
        }
    });

    // 购买：创建 OxaPay 发票，拿到 payment_url 后跳转（离开本站去 OxaPay 收银台）
    document.getElementById("checkoutForm")?.addEventListener("submit", async e => {
        e.preventDefault();
        const email = document.getElementById("checkoutEmail").value.trim();
        const msg = document.getElementById("checkoutMsg");
        const btn = document.getElementById("checkoutSubmitBtn");
        if (!email) return;
        btn.disabled = true;
        btn.textContent = "跳转中…";
        if (msg) { msg.textContent = ""; msg.className = "lic-msg"; }
        try {
            const resp = await fetch(WORKER_API + "/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: selectedPlan, email }),
            });
            const body = await resp.json().catch(() => null);
            if (resp.ok && body && body.payment_url) {
                location.href = body.payment_url;
                return; // 即将离开页面，不需要恢复按钮状态
            }
            if (msg) { msg.textContent = "创建订单失败，请稍后重试"; msg.className = "lic-msg lic-err"; }
        } catch (e) {
            if (msg) { msg.textContent = "网络错误，请稍后重试"; msg.className = "lic-msg lic-err"; }
        }
        btn.disabled = false;
        btn.textContent = "去支付";
    });

    // OxaPay 付款完成后跳转回本站会带 ?unlock=1（见 worker/src/index.js 的 return_url）——
    // 此时 webhook 是异步处理的，卡密不一定已经发到邮箱，提示语言要如实反映这一点。
    if (new URLSearchParams(location.search).get("unlock") === "1") {
        openUnlockDialog("付款已收到，通行证正在发送到你的邮箱，收到后粘贴在这里");
        history.replaceState(null, "", location.pathname); // 清掉查询串，避免刷新重复弹窗
    }
}

// === 勾选与导出 ===
const selectedSymbols = new Set();

function updateExportBar() {
    const bar = document.getElementById("exportBar");
    const count = document.getElementById("selectedCount");
    const checkAll = document.getElementById("checkAll");
    if (selectedSymbols.size > 0) {
        bar.style.display = "flex";
        count.textContent = `已选 ${selectedSymbols.size} 个`;
    } else {
        bar.style.display = "none";
    }
    // 同步全选框状态
    const checks = document.querySelectorAll(".symbol-check");
    const arr = [...checks];
    const all = arr.length > 0 && arr.every(c => c.checked);
    checkAll.checked = all;
    // 部分选中显示 indeterminate 横杠(否则 SR 读成"未选中")；切到 0 行 tab 也清掉残留
    checkAll.indeterminate = arr.some(c => c.checked) && !all;
}

function exportTradingViewTxt() {
    if (selectedSymbols.size === 0) return;
    const lines = [...selectedSymbols].map(tvSymbolFor);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tradingview_watchlist.txt";
    a.click();
    URL.revokeObjectURL(a.href);
}

// 表格内勾选事件（事件委托）
document.getElementById("rankBody").addEventListener("change", e => {
    if (e.target.classList.contains("symbol-check")) {
        const symbol = e.target.dataset.symbol;
        if (e.target.checked) {
            selectedSymbols.add(symbol);
        } else {
            selectedSymbols.delete(symbol);
        }
        updateExportBar();
    }
});

// 全选
document.getElementById("checkAll").addEventListener("change", e => {
    const checks = document.querySelectorAll(".symbol-check");
    checks.forEach(c => {
        c.checked = e.target.checked;
        if (e.target.checked) {
            selectedSymbols.add(c.dataset.symbol);
        } else {
            selectedSymbols.delete(c.dataset.symbol);
        }
    });
    updateExportBar();
});

// 全选按钮
document.getElementById("selectAllBtn").addEventListener("click", () => {
    const checks = document.querySelectorAll(".symbol-check");
    const allChecked = [...checks].every(c => c.checked);
    checks.forEach(c => {
        c.checked = !allChecked;
        if (!allChecked) {
            selectedSymbols.add(c.dataset.symbol);
        } else {
            selectedSymbols.delete(c.dataset.symbol);
        }
    });
    updateExportBar();
});

// 清空勾选：selectedSymbols 是跨榜单累积的（换 tab 不丢）,而「全选」按钮只作用于
// 当前榜可见行——跨 tab 勾的散选此前只能回到各 tab 逐个取消,这里一键清干净
document.getElementById("clearSelBtn").addEventListener("click", () => {
    selectedSymbols.clear();
    document.querySelectorAll(".symbol-check").forEach(c => { c.checked = false; });
    const ca = document.getElementById("checkAll");
    if (ca) ca.checked = false;
    updateExportBar();
});

// 导出按钮
document.getElementById("exportBtn").addEventListener("click", exportTradingViewTxt);

// === rail / 抽屉 导航事件（事件委托,nav 由 renderNav 动态生成）===
function bindNavEvents(rootId, closeDrawerAfter) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.addEventListener("click", e => {
        const seg = e.target.closest(".asset-seg__opt");
        // 抽屉内切资产**不**关抽屉：移动端抽屉是唯一资产入口,切完资产要让用户接着选具体
        // 榜单(此前立即 closeDrawer 会把用户甩回该资产默认榜)。选具体 nav-item 才关。
        if (seg) { switchAsset(seg.dataset.k); return; }
        const item = e.target.closest(".nav-item");
        if (item) { switchTab(item.dataset.tab); if (closeDrawerAfter) closeDrawer(); }
    });
}
bindNavEvents("rail", false);
bindNavEvents("drawer", true);

// === 移动抽屉 ===
// 抽屉焦点管理:打开时把背景(topbar/wrap/dock)设 inert——键盘 Tab 困在抽屉内、SR 也
// 读不到背景;焦点移入抽屉;关闭时归还 inert 并把焦点还给汉堡。inert 优雅降级(旧浏览器
// no-op),不引入 sticky/backdrop/无限动画。桌面(≥641px)抽屉 display:none,inert 无害。
const DRAWER_BG_SEL = [".topbar", ".wrap", "#exportBar"];
function openDrawer() {
    const drawer = document.getElementById("drawer");
    drawer.classList.add("is-open");
    drawer.removeAttribute("inert");
    document.getElementById("drawerScrim").classList.add("is-open");
    document.body.classList.add("no-scroll"); // 锁背景滚动,抽屉内滚动不再带动页面
    document.getElementById("hamburger").setAttribute("aria-expanded", "true");
    DRAWER_BG_SEL.forEach(sel => document.querySelector(sel)?.setAttribute("inert", ""));
    document.getElementById("drawerClose").focus();
}
function closeDrawer() {
    const drawer = document.getElementById("drawer");
    const wasOpen = drawer.classList.contains("is-open");
    drawer.classList.remove("is-open");
    document.getElementById("drawerScrim").classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    document.getElementById("hamburger").setAttribute("aria-expanded", "false");
    drawer.setAttribute("inert", ""); // 关闭后抽屉本身也 inert,背景恢复可交互
    DRAWER_BG_SEL.forEach(sel => document.querySelector(sel)?.removeAttribute("inert"));
    // 仅当确实从"打开"态关闭才归还焦点——未开时全局 Esc 触发 closeDrawer 是无害空操作,
    // 不该抢走用户当前焦点。清 inert 必须在 focus 之前。
    if (wasOpen) document.getElementById("hamburger").focus();
}
// Esc 关抽屉(dialog 自带 Esc,抽屉是自绘的要手动补;未开时是无害空操作)
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
document.getElementById("hamburger").addEventListener("click", openDrawer);
document.getElementById("drawerClose").addEventListener("click", closeDrawer);
document.getElementById("drawerScrim").addEventListener("click", closeDrawer);

// 抽屉体：注入资产分段控件 + 导航容器（renderNav 往 #drawerNav 里填内容）
document.getElementById("drawerBody").innerHTML = `
    <div class="asset-seg">
        <button class="asset-seg__opt" data-k="crypto"><span class="asset-seg__dot"></span>加密</button>
        <button class="asset-seg__opt" data-k="ashare"><span class="asset-seg__dot"></span>A股</button>
        <button class="asset-seg__opt is-active" data-k="us"><span class="asset-seg__dot"></span>美股</button>
        <button class="asset-seg__opt" data-k="etf"><span class="asset-seg__dot"></span>ETF</button>
    </div>
    <nav class="board-nav" id="drawerNav" style="margin-top:14px"></nav>`;

// === 亮/暗主题切换（token 覆盖,组件零分叉）===
const LS_THEME = "bishuju_theme";
function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = t === "light" ? "☀" : "◐";
    // 手机浏览器工具栏颜色跟随主题——index.html 首屏内联脚本只管「加载时」,
    // 这里补上「切换时」,否则亮色页面配深色地址栏。
    // ⚠️ 两个 hex 必须跟 style.css 的 --bg1(亮 #f0eee6 骨白 / 暗 #141413 墨)保持一致——
    // 这里是第三份独立硬编码拷贝(index.html 内联脚本 + manifest + 这里,共三处),改配色
    // 一起改,否则每次切换/刷新会把 index.html 刚设对的值又覆盖回旧值。
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = t === "light" ? "#f0eee6" : "#141413";
}
// v5 起亮色为默认底盘:除非用户显式存过 dark,否则一律亮色
applyTheme(safeStore.get("localStorage", LS_THEME) === "dark" ? "dark" : "light");
document.getElementById("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    safeStore.set("localStorage", LS_THEME, next);
    applyTheme(next);
});

// 收盘快照横幅关闭（永久,按当前资产分别记忆,见 renderSnapshotBanner）
document.getElementById("snapshotBannerClose").addEventListener("click", () => {
    safeStore.set("localStorage", snapshotBannerDismissKey(), "1");
    document.getElementById("snapshotBanner").hidden = true;
});

// 顶栏新鲜度胶囊可点：点暗的那侧直接切资产（.is-dim 的胶囊本来就在邀请注意力,
// 给它一个响应;点当前侧是无害空操作,switchAsset 自带同资产早退）。
// ⚠️ 唯一例外是 ETF 视图下的美股胶囊：ETF 无独立时间戳、复用 freshUS 且此时它不带
// .is-dim(代表的就是当前 ETF 视图的新鲜度),但 switchAsset("us") 的同资产早退比较的是
// "us" !== "etf" → 会把用户切离 ETF。手机端 .is-dim 胶囊隐藏后它还是屏幕上唯一可点的
// 资产控件,必须显式空操作(2026-07-21 审计)。
document.getElementById("freshCrypto").addEventListener("click", () => switchAsset("crypto"));
document.getElementById("freshAshare").addEventListener("click", () => switchAsset("ashare"));
document.getElementById("freshUS").addEventListener("click", () => {
    if (currentAsset === "etf") return;
    switchAsset("us");
});

// 排序选择（排序条 chips + 表头共用）：点不同轴切排序键，点当前轴切升/降
function selectSortKey(key) {
    if (key === sortField) {
        sortAsc = !sortAsc;
    } else {
        sortField = key;
        sortAsc = false;
    }
    renderTable(); // renderTable 内部会重渲染排序条(箭头/激活态跟着走)
}
document.getElementById("valueHeader").addEventListener("click", e => {
    const config = TABS_CONFIG[currentTab];
    if (config && config.sorts) {
        const opt = e.target.closest(".sort-opt");
        if (opt) selectSortKey(opt.dataset.sortkey);
    } else {
        toggleSort();
    }
});
document.getElementById("sortStrip").addEventListener("click", e => {
    const chip = e.target.closest(".sort-chip");
    if (chip) selectSortKey(chip.dataset.sortkey);
});

// 表格搜索框（代码/名称过滤当前 tab，切 tab 自动清空）。
// 150ms 防抖：5000+ 行的 tab 上每个按键全量重建 tbody 会卡输入。
const searchBoxEl = document.getElementById("searchBox");
if (searchBoxEl) {
    let searchTimer = null;
    searchBoxEl.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = searchBoxEl.value.trim();
            renderTable();
        }, 150);
    });
}

// Initial load
// 恢复上次看的榜单（key 已失效则留在默认 tab；switchTab 自带资产/排序/胶囊全套同步）
const LS_TAB = "bishuju_last_tab";
const savedTab = safeStore.get("localStorage", LS_TAB);
if (savedTab && TABS_CONFIG[savedTab] && savedTab !== currentTab) switchTab(savedTab);
// ⚠️ 2026-07-27 修:**首访者的 data-asset 一直是错的**。index.html 把 `data-asset="crypto"`
// 写死在 .app 上，而只有 switchTab() 会去纠正它 —— 上面那行在「没有 savedTab」或
// 「savedTab 恰好等于默认 tab」时都不会触发，于是新访客落在**美股**榜上、资产标签也显示
// 「美股」，但 CSS 作用域仍是 crypto ⇒ --asset-accent、nav 选中底色、tf-chip、排序 chip
// 选中态、行悬停装饰条全部用成加密琥珀而不是美股紫。涨跌语义碰巧没错（美股与加密同为
// 涨绿跌红），所以它一直没被当成 bug 发现；换成 A股 做默认落地资产就会当场变成红绿颠倒。
// 修法是无条件把 DOM 同步到 JS 的 currentAsset，别依赖 switchTab 的副作用。
const appEl = document.getElementById("app");
if (appEl) appEl.dataset.asset = currentAsset;
initFooterUI();
initPaywallUI();
renderNav();
renderSkeleton();
loadData();

// Auto refresh every 30s。后台标签页跳过轮询（回到前台立即补一轮）——
// 交易员常年挂着几十个标签页，后台空轮询是带宽/配额的最大浪费源。
setInterval(() => { if (!document.hidden) loadData(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
