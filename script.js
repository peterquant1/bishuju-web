// === 排序轴 ===
// 每个 tab 的每一行 payload 统一带 rsi / volume / volumeFormatted / cvdStrength 字段
// （加密行另带 takerStrength，A股/美股/ETF 行另带 volRatio/emaGap），排序键稳定；
// 默认轴（sorts[0]）＝该 tab 的主指标，**必须与后端 `value` 取的量一致**，否则首屏值列
// 显示的是另一根轴的数。
// ⚠️⚠️ **本段刻意不再写死"某族几轴"**（2026-07-29 审计）：原文停在「股票系五轴 / 加密
// 四轴 / 涨跌幅六轴」，那是 2026-07-22 的快照，此后加 ADX/DI、砍 DI、加日/周MACD、加日
// 波动幅度、删周成交额若干轮，全都没跟着改，且还在引用早已移除的 `dailyEma921`/
// `weeklyStrategy`/涨跌幅榜。**要数轴就去数下面那几个 sorts 常量本身**
// （现役**只剩两个**：`cryptoStrategySorts` 17 轴 / `singleStrategySorts` 16 轴 ——
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
// 日SAR多头根数（2026-09-04）：**整数根数**，不是百分比也不是倍数 ⇒ 不带 % / 正负号，
// 带「根」量词。null（SAR 空头 或 K 线不足 3 根）显示「—」、升降序两个方向都沉底。
// ⚠️ 写「根」不写「天」：A股 一根是**交易日**（隔周末/长假），只有加密一根才等于一天。
// ⚠️ 刻意不复用 fmtDmiVal/fmtAmpVal —— 那两个都 toFixed(2)，整数轴显示成「3.00」是错的。
function fmtBarsVal(x) { return x == null ? "—" : x + " 根"; }

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
    // 周线EMA间距：**加密各策略榜 + A股 那个策略榜的行都带**（2026-07-30 轴数对齐后分别走后端
    // 唯一的 `_strategy_row` 与 A股 行构造；对齐前只有周线族两个榜带），数据驱动判断。
    // ⚠️ 别在这里写死策略榜数（原文"七个/三个"停在美股移除、加密加榜之前，早烂了）——要数就数 TAB_GROUPS。
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
    // 日涨跌幅（2026-08-12）：同样数据驱动、同样排在 SUB_AXES_MAX 截断线之后 ⇒ 默认不出现
    // 在副行，只在被选为排序轴时进值列。**六个涨跌幅榜的行没有 changePercent 这个 key**
    // （那边涨跌幅就是 `value`，由 changeSub 单独处理），所以这一行对它们天然不触发、
    // 不会让同一个数字在副行里出现两遍。要让它常驻副行就把这行往上剪到 cvdStrength 之后，
    // 代价是挤掉当前第 4 段（策略榜是「周线RSI」）。
    if ("changePercent" in item && sf !== "changePercent") seg.push(`${axisLabelFor("changePercent", "涨跌幅")} ${fmtGapVal(item.changePercent)}`);
    // 周线版 ADX/+DI（指令⑩ 加、指令⑥ 砍成两根）：同样数据驱动、同样排在截断线之后。
    if ("weeklyAdx" in item && sf !== "weeklyAdx") seg.push(`${axisLabelFor("weeklyAdx", "周ADX")} ${fmtDmiVal(item.weeklyAdx)}`);
    if ("weeklyDiPlus" in item && sf !== "weeklyDiPlus") seg.push(`${axisLabelFor("weeklyDiPlus", "周+DI")} ${fmtDmiVal(item.weeklyDiPlus)}`);
    // 周MACD强弱（2026-07-26 指令④）：同样数据驱动、同样排在 SUB_AXES_MAX 截断线之后
    // ⇒ 默认不出现在副行，只在被选为排序轴时进值列。要让它常驻副行就把这行往上剪，
    // 代价是挤掉前面某一段（副行只有 4 段额度）。
    if ("weeklyMacdStrength" in item && sf !== "weeklyMacdStrength") seg.push(`${axisLabelFor("weeklyMacdStrength", "周MACD强弱")} ${fmtGapVal(item.weeklyMacdStrength)}`);
    // 日SAR多头根数（2026-09-04）：同样数据驱动、同样排在 SUB_AXES_MAX 截断线之后 ⇒ 默认
    // 不出现在副行，只在被选为排序轴时进值列。**六个涨跌幅榜的行没有这个 key**，天然不触发。
    // ⚠️ 顺带记一笔：`atrPct`（日波动幅度）至今**没有**对应的副行段落 —— 那是 2026-07-28
    // 加它时留下的既有缺口，因为同样在截断线之后所以零视觉影响、一直没人发现。本行是照
    // 「每根轴都该有一段」的意图补齐的，别把它当多余代码删掉。
    if ("sarBullBars" in item && sf !== "sarBullBars") seg.push(`${axisLabelFor("sarBullBars", "SAR多头根数")} ${fmtBarsVal(item.sarBullBars)}`);
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
// 日涨跌幅（2026-08-12 站长「所有升降序也新增一个涨幅升降序」）：最新已收盘那根日 K 的
// 涨跌幅（加轴时四资产同批，现存加密＋A股 两个）。挂在全部策略榜上（加密各榜 + A股 那个）；六个涨跌幅榜刻意不挂，见下。
// ⚠️⚠️ **六个涨跌幅榜刻意没加这根轴**：它们的首轴 `value` 本身就是涨跌幅（标签「日/周/月
// 涨跌幅」），再挂一根就是同一个量出现两次。且那是全市场约 1.7 万行 × 6 个榜，每加一根轴
// 都要乘行数进付费 KV —— 2026-07-30 站长「只对齐九个策略榜」定的就是这条边界，别越过。
// ⚠️⚠️ **口径两套，是既有的刻意差异，别"统一"**：加密 ＝ K 线实体 (收−开)/开（永续 7×24
// 不停盘）；A股 ＝ 相对上一根收盘、含集合竞价跳空（已移除的美股/ETF 当年也走这一套）。
// 涨跌幅榜历来就这么分。
// ⚠️ **key 是 `changePercent` 不是 `value`** —— 策略榜的 `value` 是日成交额（加密）/日线RSI
// （股票系），那才是默认排序量。**连带：按本轴排序时值列不上红绿**（getColorClass 只认
// CHANGE_PCT_TABS 里的榜 ＋ `sortField === "value"`，见那两处警告），靠 fmtGapVal 的正负号
// 区分。这是知情取舍：那个 Set 同时管着"上色／不挂命中徽标／空状态语义"三件事，为了上色
// 去动它风险不对称。
// ⚠️ hint 只写**口径**，不写"涨幅小的后来涨得多"这类策略断言 —— 同 AXIS_D_ATR 那条纪律
// （轴负责披露事实，不替用户下判断）。
const AXIS_D_CHGPCT = { key: "changePercent", label: "日涨跌幅", format: v => fmtGapVal(v.changePercent),
                        hint: "最新已收盘那根日K的涨跌幅。加密＝K线实体(收−开)/开；A股＝相对上一根收盘、含跳空" };
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
//   消失，而对齐的收益是各榜口径一致）。要重新评估就得先在股票系数据上重测 ——
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

// === 日SAR多头根数（2026-09-04 站长「想看日线SAR翻多后的新鲜度」，两个资产同批加）===
// 值 = **这轮日线 SAR 多头已经跑了几根已收盘 K 线，翻多那一根本身记 1**。
// SAR 空头 ⇒ null（"多头的根数"在空头段没有定义）⇒ 升降序两个方向都沉底 ⇒
// **升序头部＝刚翻多（最新鲜）、降序头部＝这轮多头跑得最久**，两端都有语义。
//
// ⚠️⚠️ **为什么值得加**：2026-07-28 那轮排序轴审计实测，现有 17 根轴的相关矩阵**有效维度
// 只有约 5.5 个、第一主轴就占 34.7%**，全部落在「趋势—动能—规模—风险」这四类**此刻的
// 横截面读数**上 —— **没有任何一根回答"这个状态持续了多久"**。这是站内第一个**时间/
// 状态年龄**坐标，按构造就近乎正交，不是又一个 EMA 间距的变体。
// 它还把每张状态型榜变成择时榜：以前只有 `dailyEmaSarFlip` 那一张纯事件榜（＝本轴恒 ==1），
// 现在任何一张榜都能问"这批里哪些是日线最近三根才刚翻多的"。
//
// ⚠️⚠️ **这是全站第一根整数轴，平局是常态不是例外**（另 17 根都是连续浮点，两个标的撞到
// 小数点后 6 位几乎不可能，所以站内至今没定过平局规则）。实测量级：全市场 525 个合约里
// 「值==1」一天大约个位数到十几个（2026-07-30 那天 5 个、08-11 那天 14 个），过了各榜筛选
// 之后通常只剩 0–5 行 ⇒ 不会糊。**平局的处理见 `getSortedItems` 里那条显式 tie-break。**
//
// ⚠️ 标签写「根数」不写「新鲜度」：数字越大越**不**新鲜，标签叫新鲜度会被反着读。
// "新鲜度"这层意思放进 hint。
const AXIS_D_SARBARS = { key: "sarBullBars", label: "日SAR多头根数",
                         format: v => fmtBarsVal(v.sarBullBars),
                         hint: "日线SAR翻多至今第几根K线（翻多那根算第1根）。升序＝刚翻多最新鲜，降序＝这轮多头跑最久；SAR 空头显示「—」" };

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
// **照常保留**——2026-07-30 轴数对齐后它同时在加密 17 轴与股票系 16 轴两个轴集里
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

// A股 策略榜的 **17 轴**，**轴序与加密的 cryptoStrategySorts 完全对齐、只少一根「日订单流」**：
// 日成交额·日涨跌幅·日线RSI·日CVD强弱·〔加密这里是日订单流，A股 没有〕·日量比·日EMA间距·
// 日ADX·日+DI·日MACD强弱·日波动幅度·日SAR多头根数 + 周线RSI·周线EMA间距·周ADX·周+DI·
// 周MACD强弱 + 月线RSI。
// ⚠️⚠️ **2026-08-19 站长「升降序和加密那边对齐」把轴序整体改成加密那套**（此前 A股 自成
// 一序、首轴是日线RSI）：把加密的 17 轴去掉它独有的「日订单流」就得到这 16 轴，逐根一一
// 对应。**首轴由「日线RSI」改成「日成交额」** ⇒ **后端 `_strategy_row` 的 `value` 必须
// 同步取日成交额**（build_ashare_rankings 里已改），两处只改一处 = 首屏值列的数与表头
// 标签对不上（不报错、只能肉眼发现）。
// ⚠️⚠️ **那根「日订单流」永远补不上**：tushare（A股）的日线**没有 taker 逐笔归边字段**
// —— 数据源硬边界，不是遗漏。2026-07-30「以最多的为准」那轮卡的就是这一根，**别再想办法
// 凑齐**：硬凑要么造一根语义不同的轴、要么发一根永远全 null 的幽灵轴，两条都比"少一根"更糟。
// 轴数履历：11 → 14 → 16（2026-07-30 对齐）→ 16（2026-08-19 只重排不增减）→ **17
// （2026-09-04 +日SAR多头根数）**。
// ⚠️ 本轴 A股 侧**有值、不是幽灵轴**：tushare 日线的 OHLC 足够算 SAR（`compute_ashare_daily`
// 早就在算日线 SAR）——与「日订单流」那种数据源硬边界完全是两回事，别混为一谈。
const singleStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_CVD, AXIS_D_VOLRATIO, AXIS_D_EMAGAP,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_ATR, AXIS_D_SARBARS,
                             AXIS_WRSI, AXIS_W_EMAGAP, ...weeklyDmiSorts, AXIS_W_MACD, AXIS_MRSI];
// 加密**全部策略榜共用**的轴集，**18 根**（2026-07-30 站长「能否对齐轴数？以最多的
// 为准」＋ 2026-08-12「所有升降序也新增一个涨幅升降序」＋ 2026-09-04「日线SAR翻多后的
// 新鲜度」之后的现状）：日线 12 根（日成交额·
// 日涨跌幅·日线RSI·日CVD强弱·日订单流·日量比·日EMA间距·日ADX·日+DI·日MACD强弱·
// 日波动幅度·日SAR多头根数）+ 周线 5 根（周线RSI·周线EMA间距·周ADX·周+DI·周MACD强弱）
// + 月线 1 根（月线RSI）。与后端唯一的行构造 `_strategy_row` 严格一一对应。
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
// ⚠️ 轴标签带「日/周/月」前缀是**必要的**：这七个榜的筛选条件横跨月/周/日三个周期，而
// 行里同时装着三个周期的值（2026-07-24 站长就为股票系那张同形的表问过"成交额是基于日线
// 还是什么周期"）。纯日线的榜本可省前缀，但共用一个常量比再造一套「只差标签」的近亲常量
// 安全得多 —— 理由同上一段。
//
// ⚠️ **加轴必须后端先补字段**（`_strategy_row` 加 key），只在这里加轴＝永远全 null 的
// 幽灵轴；只在后端加字段不加轴＝副行冒出没有对应 chip 的孤儿摘要（`axesSub` 是数据驱动的）。
// **两处必须一起改，而且一改就是七个榜一起变。**
//
// ⚠️ 轴数是**注释里最容易发霉的一类数字**（指令④⑤⑥ 连着三次改轴时本文件、fetch_data.py
// 的注释、两个周线榜的 desc 全部停在旧值；加 `atrPct` 那轮又漏；移除三个周线榜那轮 docstring
// 停在已不存在的编号 —— 同一个坑四次）。**改轴时把数字一起改，或者干脆别在注释里写数字。**
// 履历：4 →（指令⑩ +ADX/DI）12 →（指令④⑤ +周/日MACD）14 →（指令⑥ 砍 DI 到两根）10
// →（2026-07-28 +日波动幅度）11 →（2026-07-30 轴数对齐 +5 根）16 →（2026-08-12
// 站长「所有升降序也新增一个涨幅升降序」+日涨跌幅）17 →（**2026-09-04 站长「日线SAR
// 翻多后的新鲜度」+日SAR多头根数**）**18**。
// ⚠️ 排序条在 1280 视口早已是多行（10 轴 ≈812px 就卡满了 877px 容器的单行上限）。桌面
// flex-wrap 换行、移动端横滑，两种都不裁切 —— 每次加轴都要在 1280/768/375 三档实测一遍。
// ⚠️ 「日涨跌幅」插在「日成交额」之后（同属"行情量"，技术指标排在其后），**首轴没动**。
// ⚠️ 「日SAR多头根数」追加在**日线块末尾**（周线块之前），保住「日→周→月」的周期递进，
// 且既有 17 根的相对位置一个没动 —— 插中间会让用户已经形成的 chip 肌肉记忆整体位移。
const cryptoStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_CVD, AXIS_D_TAKER,
                             AXIS_D_VOLRATIO, AXIS_D_EMAGAP, ...dmiSorts, AXIS_D_MACD, AXIS_D_ATR,
                             AXIS_D_SARBARS,
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
 *  月线榜装月线 RSI）。这与其余策略榜相反（那些榜通用 key 一律是日线值、周线值另带
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

    // === 加密策略：**七个榜**（数量以下面的条目为准；完整增删履历见 CLAUDE.md 顶部的日期
    // 区块，被移除各榜的判据存档见后端 build_rankings docstring 末尾）===
    // **轴集只有一族**：七个榜全部共用 **17 轴的 cryptoStrategySorts**，行全部走后端唯一的
    // `_strategy_row`（2026-07-30 站长「能否对齐轴数？以最多的为准」；对齐前是两族：日线族
    // 11 轴、周线族 13 轴的 cryptoWeeklyExpansionSorts）。
    // 七个榜行 payload 逐字同构，**差别只在筛选条件**。首轴统一 = 日成交额降序。
    // ⚠️ 新榜一律**追加在末尾**；移除中间的榜时要把后面的**重新编号**（2026-07-30 移除旧
    // ④⑤⑥ 把旧⑦⑧⑨ 重编成 ④⑤⑥；2026-08-09 移除旧③ 把旧④~⑨ 重编成 ③~⑧；
    // **2026-08-11 再移除当时的 ③`dailySarSecondBar`，旧④~⑧ 又重编成 ③~⑦**；
    // **2026-08-12 站长一次移除三个（旧②`dailyEmaExpansion`、旧⑤`monthlyWeeklySar`、
    // 旧⑩`weeklyEma921Expansion`），旧③④⑥⑦⑧⑨ 重编成 ②③④⑤⑥⑦**；
    // **2026-08-16 又一次移除三个（旧②`weeklySarSecondBar`、旧⑤`dailyFourEmaExpansion`、
    // 旧⑦`dailyTripleEmaSarBearish`），旧①③④⑥⑧ 重编成 ①②③④⑤**）——
    // ①~⑤ 是 rail 位置，CLAUDE.md/后端 docstring/本文件多处按它互相引用，别留编号缺口。
    // ⚠️ 本轮已把块内**指代榜**的圆圈数字尽量改成 key 引用（就是上面那条纪律），只有块
    // 标题还留着编号；注释里剩下的 ①②③ 多是**条件/列举序号**，别拿去当榜号替换。
    // ⚠️⚠️ **本段的榜号 2026-08-11 才补齐过一次**：上一轮重编号只改了一部分，导致这里
    // 一度出现两个 ⑧、且 ⑤~⑦ 全部指错人（不报错、只能肉眼发现）。**删中段榜之后务必
    // 把这一整段的编号从头数一遍**，别只改被删榜附近那几行。
    // ⚠️ **引用某个榜优先写 key、别写榜号。**
    // ① 月×周×日 三个 SAR 全多头的三级共振（3 个条件，**不含新币回退**，见后端注释）。
    monthlyWeeklyDaily: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ⚠️ 四线族曾经有过三个榜（`dailyFourEmaAligned` 只看排列、2026-07-28 移除；
    // `dailyFourEmaPersist`「扩张存续」、2026-08-09 移除；`dailyFourEmaExpansion`
    // 「最新一根正在扩张」、**2026-08-16 站长移除**）——**现在一个都不剩**。判据都存档在后端。
    // ⚠️ 「排列」≠「扩张」：站内「扩张」一词专指**间距在变大**，两个词别混用（复活任一
    // 四线榜时这条用词规矩仍然管着它的 name）。
    // ⚠️ `dailySarSecondBar`「日线SAR多头第二根」**2026-08-11 站长移除**、
    // `weeklySarSecondBar`「周线SAR多头首根」**2026-08-16 站长移除**（判据都存档在后端
    // build_rankings；复活 = 后端重建列表 + 这里与 TAB_GROUPS 各加回一条）。
    // ⇒ 历轮移除后现在是下面这套 ①~⑤。
    // ② **周线 EMA9/21 扩张 且 SAR 多头（2 个条件，都在周线）** —— 2026-07-30 站长新增。
    // 就是同日移除的「周线SAR多头」槽位的第二版判据（2026-07-26 指令③），但**是新榜**（key
    // 全新）：站长要"扩张 + SAR"两条都要。命中比"纯周线 SAR 多头"少得多。
    // ⚠️ 周线榜历轮增删：08-16 一度只剩本榜，同日稍后 + `weeklyTripleEma`/`weeklySarBearish`、
    // 08-18 + `weeklyTwoBullExact`、**08-19 + `weeklySarUptrend`** ⇒ **现为五个**（别照
    // 「唯一的周线榜」旧注释读）。
    // ⚠️⚠️ **本榜 2026-08-19 起 ⊊ ⑨`weeklySarUptrend`（纯周线SAR多头全集）** —— 本榜 ＝ ⑨ ∩
    //   9/21扩张。此前它曾 ⊊ `weeklyEma921Expansion`（2026-08-12 移除对家、包含关系随之消失），
    //   连同同日移除 `monthlyWeeklySar` 带走的另一对 ⇒ 08-12～08-19 站内是"零对"。**那句"没有
    //   任何一对结构性包含"自 ⑨ 上线起作废**（站内现有 ①②⑦ 各 ⊊ ⑨ 三对，别再照旧注释找）。
    // 行 payload 走后端唯一的 `_strategy_row` ⇒ **17 轴的 cryptoStrategySorts**（五个榜共用；
    // 建榜时是 13 轴的 cryptoWeeklyExpansionSorts，2026-07-30 轴数对齐后并入）。
    // ⚠️ 显示名写「9/21扩张」不写「两线扩张」：后者是 (9/21 ∪ 9/26) 并集的专称，本榜是严格 9/21。
    weeklyEmaSarBull: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // ③ **日线 EMA9/21 扩张 且 CVD 递增（2 个条件，都在日线）** —— 2026-08-07 建榜时是
    // 「EMA9/21/55 三线扩张 且 CVD 递增」；**2026-09-05 站长「日线9/21/55扩张＋CVD递增这个
    // TAB 的逻辑改为：日线EMA9/21两线扩张＋CVD递增」⇒ 条件 ① 由三线放宽回 9/21**（条件 ②
    // 一个字没动）。⚠️ 后端改的是**遍历源**（`triple_ema_data` → `ema921_expansion_data`），
    // 不是删一行 `and` —— 条件 ① 就是遍历源本身。命中 55 → 88（纯放宽、零剔除）。
    // ⚠️ 判据现在恰好是已退役的 `dailyEmaExpansion` 槽位**第二版**（2026-07-25 晚～07-26 深夜），
    // 但 key 仍固定为 `dailyTripleEmaCvd`（"槽位逻辑会迭代、key 固定"的老规矩，且本榜还是
    // 橱窗 TEASER_TAB）⇒ **key 里的 "TripleEma" 已名不副实，读到它别去查 EMA55。**
    // ⚠️ 那条「命中数撞上一样先看交集、别下结论」的教训仍然有效（站内为此栽过两次：
    // 「18 = 18」和「17 = 17」都是巧合）。
    // ⚠️ **别因为判据里有 EMA/CVD 就加 ema55 轴或原始 CVD 轴**：后端没发 ema55（幽灵轴），
    // 而「日CVD强弱」轴用的是归一化 cvdStrength（原始 CVD 币本位、跨标的排序≈排成交量）。
    // 💡 本榜行里 `emaGap`（日EMA间距）**恒为正** —— 条件 ① 直接蕴含 EMA9 在 EMA21 上方
    // （改判据前后都成立：三线扩张同样蕴含 9/21 扩张），是个免费自检点。
    dailyTripleEmaCvd: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // ④ 日线9/21扩张＋SAR多头首根（2026-08-11 站长「最新已收盘日线是首根SAR多头的日K，
    //   且EMA9/21扩张」）—— **2 个条件，都在日线**：① EMA9/21 扩张（严格 9/21）
    //   ② 日线 SAR 刚翻多的首根（倒1 多头 且 倒2 空头）。
    // ⚠️⚠️ 它与「第二根」那对结构性互斥 2026-08-11 曾随纯 `dailySarSecondBar` 被移除而消失，
    //   **2026-09-05 起以对称形式复活成 live 对**：⑪ `dailyEmaSarSecond`（9/21扩张 ∩ 第二根）
    //   ∩ 本榜（9/21扩张 ∩ 首根）＝ ∅ —— 倒2 空/多头互斥，判据保证，且两榜叠的是**同一道**
    //   9/21 门 ⇒ 合起来正好是「均线在张开的这一轮日线多头的头两根」。**站内结构性互斥
    //   live 榜现有两对**（另一对是 ⑦∩⑧ 周线，08-18）。⚠️ 本榜 desc 里当年那段讲互斥的
    //   文字 08-11 已删、并未随之复活 —— 要不要写回给用户看，是产品判断。
    // ⚠️⚠️ **这里原来还写着「站内现已没有任何一对结构性互斥的 live 榜」—— 2026-08-18 起作废**：
    //   新榜 ⑧ `weeklyTwoBullExact`（当根周 K 阳）与 ⑦ `weeklySarBearish`（当根周 K 阴）
    //   **交集恒为空**，是站内重新出现的第一对。⇒ 又一次印证「站内已经没有 X 了」这类
    //   全称否定句下一条指令就可能被推翻（08-16 记的教训，这是第二次应验）。
    // ⚠️ **命中天然极小、0 个是正常的**："事件"型（每个标的一轮行情只在翻多那天命中）
    //   再叠一道结构过滤；90 天回放中位 3、6/90 天为 0。相邻两日成员 Jaccard 恒为 0
    //   （今天的首根明天必不是首根）⇒ 看到成员全换/空榜别当故障。
    // ⚠️ **别因为判据里有 SAR 就加 SAR 轴**（布尔值排不了序、后端没发圆点价 ⇒ 幽灵轴，
    //   在案先例）；也别因为有 EMA 就加 emaGap 轴 —— 它早就在轴集里。
    // 💡 行里 `emaGap` **恒为正**（9/21 扩张蕴含 EMA9>EMA21）⇒ 现在 **③④⑩⑪ 四个**榜都是
    //   （履历：2026-08-12 移除 `dailyEmaExpansion` 前五个、2026-08-16 移除
    //   `dailyFourEmaExpansion`/`dailyTripleEmaSarBearish` 前四个、其后两个 ⇒
    //   09-03 加 ⑩ 成三个 ⇒ 09-05 加 ⑪ 成四个）。**别在这里写死数字而不留履历。**
    dailyEmaSarFlip: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // ⑤ **月线 SAR 多头首根（1 个条件，纯月线）** —— 2026-08-13 站长「新增一个TAB，逻辑是：
    //   最新已收盘月线的SAR是首个SAR多头。」（没点资产 ⇒ 加密）：倒1（最新已收盘月 K）多头
    //   且 倒2 空头 ⇒ 这个月刚刚由空翻多。
    // ⚠️ 建榜时与「周线SAR多头首根」是**真正的同判据异周期对**——**那个榜 2026-08-16 已
    //   移除** ⇒ 本榜现在是**站内唯一的纯 SAR 首根榜**；事件型 SAR 榜现共**两个**
    //   （本榜 + ④ 日线首根＋EMA，周期不同 ⇒ 无包含关系）。
    // ⚠️ **月内成员恒定**：判据全在月线、月线走缓存 ⇒ 每月 1 号 00:00 UTC 才换一批，
    //   月内看到成员纹丝不动是正确行为（周线榜"周内恒定"的月线版）。
    // ⚠️ **事件型**：相邻两月成员交集恒为空（判据保证）；36 个月回放 min 0 / 中位 8 /
    //   max 42、2/36 个月为 0 ⇒ 命中天然不大、空榜正常。
    // ⚠️ **别因为判据是 SAR 就加 SAR 轴**（布尔值排不了序、后端没发圆点价 ⇒ 幽灵轴，在案先例）。
    monthlySarFirstBar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // 周线9/21/55扩张（2026-08-16 站长复活，key 复用 2026-07-08 被移除的同名旧榜——判据
    // 逐字相同：最新已收盘周线 EMA9>21>55 三线排列 + 双间距扩张，唯一判据是周线缓存的
    // `emaExpansion` 字段）。⚠️ **别因为判据里有 EMA55 就加 ema55 轴**（后端没发该字段
    // ⇒ 幽灵轴）；17 轴照旧、与本族其余各榜共用同一个 sorts 对象。
    weeklyTripleEma: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // 周线阴K＋SAR多头（2026-08-16 站长新增，加密第 7 个策略榜）：最新已收盘周 K 收阴
    // （`closedBearish`）且 周线 SAR 多头（`sarUptrend`）—— 两个字段都是周线缓存早就产出的。
    // ⚠️ **别为阴K/SAR 加轴**（都是布尔值、排不了序，同在案多次的先例）；17 轴照旧、
    //   与本族其余各榜共用同一个 sorts 对象。
    // ⚠️ 它一上线，「站内不再有要求阴K 的榜/找回调的榜」那条说法作废（见下方 TAB_GROUPS
    //   里 dailyEmaSarFlip 上方那段已改）。⚠️ 但「本榜是站内唯一找回调的榜」这半句
    //   **2026-09-03 又作废** —— 新增了日线级的 `dailyEmaSarBearish`（周线 ⑦ / 日线 ⑩ 两个）。
    // ⚠️ 行里 `weeklyEmaGap` **可正可负**（本榜完全不看 EMA），与 ②⑥ 那两个"恒为正"的
    //   周线榜相反 —— 别照它们的说法给本榜也标恒正（08-16 A股 那轮的教训：对照式注释
    //   在判据翻转时会精确地变成谎话）。
    weeklySarBearish: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // ⑧ 周线两连阳第二根（2026-08-18 站长「最新已收盘周线是两连阳。恰好是第二根。」）
    //   —— **1 个条件，全在周线**：最新已收盘周 K 是**恰好** 2 连阳的第 2 根
    //   （倒1 阳 且 倒2 阳 且 **倒3 非阳**）。纯 K 线形态，不看均线、不看 SAR、不看资金。
    // ⚠️⚠️ 后端判据字段是 `twoBullExact` 不是 `twoBull`——后者是「**≥2** 连阳」的保留字段
    //   （真超集）。两个名字只差一个后缀，选错命中会静默翻几倍。本轮为此 bump 了
    //   WEEKLY_CACHE_SCHEMA 17→18（站内没有任何既有字段能表达"恰好 2"）。
    // ⚠️⚠️ 与 ⑦ `weeklySarBearish` **结构性互斥**：本榜要求当根周 K 阳、⑦ 要求当根阴
    //   ⇒ **两张榜永远不会出现同一个标的**（60 周回放 0/60 违规）。**这是站内重新出现的
    //   第一对结构性互斥 live 榜** —— 上一对随 2026-08-11 移除「日线SAR多头第二根」而消失，
    //   ⇒ 本文件里那两处写着「站内现已没有任何一对结构性互斥的 live 榜」的注释已就地改掉。
    // ⚠️ **纯事件型**：这周的"第 2 根"下周要么成第 3 根、要么连阳已断 ⇒ **相邻两周成员
    //   交集恒为空**（60 周回放 59 对全空、累计重合 0 人次）。成员每周全换、偶尔空榜都正常。
    //   但周线走缓存 ⇒ **周内纹丝不动也正常**。
    // ⚠️ 行里 `weeklyEmaGap` **可正可负**（本榜完全不看 EMA，实测多数为负 —— 刚从下跌里
    //   翻上来两周、均线还没跟上）。别照 ②⑥ 那两个"恒为正"的周线榜抄注释。
    // ⚠️ **别为"连阳/K 线形态"加轴**（布尔值排不了序，同阴K/SAR 不设轴的在案先例）；
    //   17 轴照旧、与本族其余各榜共用同一个 sorts 对象。
    weeklyTwoBullExact: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // ⑨ 周线SAR多头（2026-08-19 站长「最新已收盘的周线是SAR多头即可」）—— **1 个条件，
    //   全在周线**：`sarUptrend is True`。就是站内"周线 SAR 多头"**全集**（= ⑦ 去掉阴K =
    //   ② 去掉 9/21扩张）。纯 build 层、17 轴照旧、与本族其余各榜共用同一个 sorts 对象。
    // ⚠️⚠️⚠️ **本榜引入三对结构性严格包含 ⇒「站内没有任何一对结构性包含」当场作废**：
    //   ①`monthlyWeeklyDaily`、②`weeklyEmaSarBull`、⑦`weeklySarBearish` 都以「周线 SAR 多头」
    //   为条件之一 ⇒ ①②⑦ 全都 ⊊ 本榜。**本文件里那几处写着"站内没有任何一对结构性包含的
    //   live 榜"的注释已就地改掉**（下方 TAB_GROUPS 两处 + 上方 monthlyWeeklyDaily 那段）。
    //   —— 这是「『站内已经没有 X 了』下一条指令就把 X 加回来」的第三次应验（阴K/互斥/包含）。
    // ⚠️ 严格子集但**不该取代**：①②⑦ 量级差一个数量级、语义各异、站长说"新增"⇒ 并列是对的。
    // ⚠️ 行里 `weeklyEmaGap` **可正可负**（本榜不看 EMA，同 ⑦⑧）—— 别照 ②⑥ 抄"恒为正"。
    // ⚠️ **别为 SAR 加轴**（布尔值排不了序，同 ①④⑦ 先例）；门槛 ≥3 根周 K（同 ⑦⑧ 最低）。
    weeklySarUptrend: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // 日线9/21扩张＋SAR多头＋阴K（2026-09-03 站长新增，加密第 10 个策略榜）：三个条件都在
    // 日线 —— EMA9/21 扩张（`ema921_expansion_data`）∩ 阴K∧SAR多头（`daily_sar_bearish_data`），
    // 后端两个现成保留组的交集，零 compute / 零 schema 改动。
    // ⚠️ **别为阴K/SAR 加轴**（布尔值排不了序）；17 轴照旧、与本族其余各榜共用同一个 sorts 对象。
    // ⚠️ 行里 `emaGap` 恒为正（条件含 EMA9 在 EMA21 上方）—— 与 ⑦ `weeklySarBearish` 相反（⑦ 不看 EMA）。
    dailyEmaSarBearish: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // ⑪ 日线9/21扩张＋SAR多头第二根（2026-09-05 站长「日线9/21扩张＋SAR多头第二根K线」，加密第 11 个策略榜）
    // —— **2 个条件，都在日线**：① EMA9/21 扩张（严格 9/21）② 日线 SAR 多头的第二根
    //   （倒1多头 ∧ 倒2多头 ∧ 倒3空头 ＝ "恰好"不是"至少"）。后端 ＝ ema921_expansion_data
    //   ∩ daily_lookup 的 `sarSecondBar` 旗标（自 2026-08-11 起零消费者的保留组，本榜是它转正
    //   后的第一个消费者），零 compute / 零 schema 改动。
    // ⚠️⚠️ 与 ④ `dailyEmaSarFlip`「首根」**结构性互斥、且对称**：④ ＝ 9/21扩张 ∩ 倒2空头、
    //   本榜 ＝ 9/21扩张 ∩ 倒2多头+倒3空头 ⇒ 倒2 不可能既空又多 ⇒ 两榜永远不会有同一个标的。
    //   合起来正好是"均线在张开的这一轮日线多头的头两根"。**这是站内第 2 对结构性互斥 live 榜**
    //   （第一对是 ⑦∩⑧）。显示名与 ④ 刻意只差末节，让这层关系在 rail 上一眼可见。
    // ⚠️ **别为阴K/SAR 加轴**（布尔值排不了序）；18 轴照旧、与本族其余各榜共用同一个 sorts 对象。
    // ⚠️ 行里 `emaGap` **恒为正**（条件①含 EMA9 在 EMA21 上方）⇒ emaGap 恒正的榜由三个变四个
    //   （dailyTripleEmaCvd / dailyEmaSarFlip / dailyEmaSarBearish / 本榜）。
    // ⚠️ 事件型：今天的第二根明天要么成第三根、要么已翻空 ⇒ 相邻两日成员交集恒为空、命中天然
    //   很小、空榜正常（同 ④ 首根）。
    dailyEmaSarSecond: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },


    // === A股：唯一的单策略榜（2026-07-24 站长定版，2026-07-29 / 2026-08-16 两次改判据）===
    // ⚠️ 判据 2026-08-16 换成「周线 EMA9/21/55 三线扩张」**单条件**（此前是月/周/日 5 条件），
    // 但**轴集一根没动**（仍 singleStrategySorts 16 轴）：后端行字段集逐字未变。
    // 改判据不等于改轴——别因为名字里只剩周线就去砍日线那几根轴（它们是描述值不是条件镜像）。
    // ⚠️⚠️ **2026-08-16 站长「移除美股，移除ETF」** ⇒ `usMonthlyWeeklyDaily` /
    // `etfMonthlyWeeklyDaily` 两条已删除，连同下方 TAB_GROUPS 的 singleStrategyGroup
    // 工厂、资产分段控件那两个按钮、美股新鲜度胶囊、isUsTab/isEtfTab、收盘快照横幅的
    // us/etf 文案、style.css 的 --asset-us/--asset-etf 两组 token。
    // **复活清单见后端 fetch_us.py 顶部 docstring**（只改前端不够，后端退役前缀不拿掉
    // 数据照跑也进不了站）。
    // ⇒ `singleStrategySorts`（**16 轴**：日线十根 + 周线五根 + 月线RSI，每个轴都写明
    // 周期）现在只剩 A股 这一个消费者。**别顺手把它并进 cryptoStrategySorts**：股票系
    // 永远少一根「日订单流」（tushare 日线无 taker 归边字段，数据源硬边界），并了就是
    // 一根永远全 null 的幽灵轴。副行的成交额标签同样写「日成交额」。
    // ⚠️ TABS_CONFIG 是平查找表、与 TAB_GROUPS 分离，所以这条要手写；TAB_GROUPS 那边
    // 只管导航，不管这里。
    //
    // A股 三个涨跌幅榜（2026-07-29 站长「A股 也新增：日线级/周线级/月线级涨跌幅，基于收盘的」）：
    // 与加密三个涨跌幅榜同构，但 ① 走 stockChangeSorts（**4 轴**，无订单流——tushare 无 taker）；
    // ② 副行价格上下文是 close-to-close 的「昨收/上周收/上月收 X → …Y」（asharePriceCtx，¥ 价），
    // 不是加密的 K 线实体「开→收」。**CHANGE_PCT_TABS 里也要有这三个 key**（红绿上色 + 不挂命中徽标），别漏。
    ashareDailyChange: { sorts: ashareDailyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", asharePriceCtx("昨收", "收")) },
    ashareWeeklyChange: { sorts: ashareWeeklyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "周成交额", asharePriceCtx("上周收", "本周收")) },
    ashareMonthlyChange: { sorts: ashareMonthlyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "月成交额", asharePriceCtx("上月收", "本月收")) },
    ashareMonthlyWeeklyDaily: { sorts: singleStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

};

// 分组导航。每组带 asset（资产类别）、tf（周期）：驱动组标签、chip 上的周期角标、
// 以及表格上方的「资产 · 周期 · 策略」标识栏——让用户任何时候都能一眼看出当前榜单
// 是加密还是 A股、日线周线还是月线（2026-07-16 用户反馈"分不清周期"后加）。
// tf 放在组上（组内所有 tab 同周期）；涨跌幅组是例外（横跨日/周/月），tf 放在 tab 上。
// full = 标识栏用的完整名（涨跌幅组的 chip 名是"昨天/周线/月线"=周期本身，标识栏里
// 周期已由 tf 角标表达，名字统一显示"涨跌幅"不重复）。data-tab key 不变。

// ⚠️⚠️ **`singleStrategyGroup(assetCN, p, universe)` 工厂已于 2026-08-16 删除**
// （站长「移除美股，移除ETF」）：它当时只服务美股/ETF 两个资产、生成
// `${p}MonthlyWeeklyDaily` 那个「月线SAR × 周线SAR＋扩张 × 日线扩张＋CVD」的组，
// 两个资产一走它就成了零调用方。A股 2026-07-29 单独改判据时已从它里面拆出去手写，
// 所以删它**不影响 A股**。复活美股/ETF 时从 git 捞这个工厂（本次移除 commit 的父提交），
// 它写死的口径对那两个资产仍然成立。
// ⚠️ 连带：`audit_consistency.py` 与 `make_og.py` 里都有一段
// `re.search(r'key: \`\$\{p\}(\w+)\`')` 专门展开这个工厂——现在正则匹配不到、那段自动
// no-op，两个脚本改走"只数手写字面量"的路径，**是预期行为不是解析瞎了**。

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
        // 加密策略榜：**六个**（数量以下面 tabs 数组的条目为准，别在注释里维护一个会发霉
        // 的流水账——完整增删履历在 CLAUDE.md 顶部的日期区块，被移除各榜的显示名/desc/判据
        // 存档见 git 历史与后端 build_rankings docstring 末尾）。
        // ⚠️ **刻意不套 singleStrategyGroup 工厂**：那个工厂的 name/desc 写死的是股票系
        // 的 5 个条件（月线SAR + 周线SAR + 周线扩张 + 日线扩张 + CVD），与这些榜都不
        // 一样。硬套会让页面上的规则说明与后端实际筛选严重不符。
        // 组 tf 取第一个 tab 的周期（月线），其余 tab 各自覆盖。**排法：同周期的放一起 +
        // 新榜追加在末尾**（① 月×周×日 → ② 周线扩张＋SAR → ③ 日线三线＋CVD →
        // ④ 日线9/21扩张＋SAR首根 → ⑤ 月线SAR首根 → ⑥ 周线9/21/55扩张 → ⑦ 周线阴K＋SAR
        // 多头；追加在末尾是为了不让整套编号位移，所以 ⑤ 虽是月线榜不挪去 ① 旁边、⑥⑦ 虽是
        // 周线榜也不挪去 ② 旁边）。
        // ⚠️⚠️ **移除中间的榜必须把后面的重新编号**：2026-07-30 移除三个周线 SAR 榜后把旧
        // ⑦⑧⑨ 重编成 ④⑤⑥；2026-08-09 移除旧③「四线扩张存续」后把旧④~⑨ 重编成 ③~⑧；
        // 2026-08-11 移除旧③「日线SAR多头第二根」后又把旧④~⑨ 重编成 ③~⑧；
        // 2026-08-12 站长一次移除三个（旧②`dailyEmaExpansion`、旧⑤`monthlyWeeklySar`、
        // 旧⑩`weeklyEma921Expansion`），旧③④⑥⑦⑧⑨ 重编成 ②③④⑤⑥⑦；
        // **2026-08-16 又一次移除三个（旧②`weeklySarSecondBar`、旧⑤`dailyFourEmaExpansion`、
        // 旧⑦`dailyTripleEmaSarBearish`），旧①③④⑥⑧ 重编成 ①②③④⑤**；同日稍后追加
        // `weeklyTripleEma` 成 ⑥、再稍后追加 `weeklySarBearish` 成 ⑦（都追加在末尾 ⇒ 既有
        // 编号未动）；**2026-08-18 追加 `weeklyTwoBullExact` 成 ⑧**（同样追加在末尾 ⇒ 既有编号未动）。
        // ①~⑧ 是 rail 位置编号，后端 docstring / CLAUDE.md / 本文件多处按它互相引用，别留缺口。
        // ⚠️ 引用某个榜时**优先写 key、别写榜号** —— 榜号会随增删位移，本项目已经因此烂过两轮。
        // ⚠️ 现存**两个**"事件"型 SAR 榜（④ 日线首根＋EMA / ⑤ 月线首根，周期不同 ⇒ 无包含
        // 关系；曾经的孪生对家「周线SAR多头首根」2026-08-16 已移除，⑤ 现在是站内唯一的
        // 纯 SAR 首根榜）+ 一个"趋势＋结构双确认"榜（② 周线9/21扩张＋SAR多头）
        // + 一个纯 SAR 三级共振"状态"型榜（①）+ 一个纯 EMA 结构"状态"型榜（⑥ 周线三线
        // 张开，完全不看 SAR 也不看资金）+ **两个"找回调"榜（⑦ 周线阴K＋SAR多头〔周线级〕与
        // ⑩ 日线9/21扩张＋SAR多头＋阴K〔日线级、2026-09-03 新增，多一道 9/21 扩张门〕，都反过来
        // 问"哪些在强势里回踩"；「⑦ 是唯一阴K/找回调榜」那句 09-03 起作废）**
        // + **一个纯 K 线形态榜（⑧ 周线两连阳第二根，站内唯一不看任何指标、只数阴阳的榜）**
        // + **一个纯 SAR 多头"状态"型全集（⑨ 周线SAR多头，2026-08-19 新增 —— ①②⑦ 都是它
        // 的严格子集，见下方那三对结构性包含）**。
        // ⚠️ **周线榜现为五个（②⑥⑦⑧⑨，2026-08-19 加 ⑨`weeklySarUptrend`）**。②⑥⑦⑧
        // 之间两两互不包含：②⑥ 都蕴含周线 9/21 扩张（② 再加 SAR 门、⑥ 再加 EMA55 档）；
        // ②⑦ 都蕴含周线 SAR 多头（② 再加扩张、⑦ 再加阴K，60 周回放两个方向 0/60、反例
        // 2814 + 729 人次 ⇒ 结构性独立）；⑥⑦ 更无交集条件；⑧ 完全不看 EMA/SAR、与 ②⑥ 两个
        // 方向都不包含（60 周回放反例 1782/681、1869/249）。
        // ⚠️⚠️⚠️ **但 ⑨ 一上线，「站内没有任何一对结构性包含」当场作废**：⑨ 是周线 SAR 多头
        // 全集，而 ①②⑦ 都以「周线 SAR 多头」为条件之一 ⇒ **①⊊⑨、②⊊⑨、⑦⊊⑨ 三对结构性
        // 严格包含**（判据保证）。⑥⑧ 不看 SAR ⇒ 与 ⑨ 互不包含。这是「『站内已经没有 X 了』
        // 下一条指令就把 X 加回来」的第三次应验（阴K/互斥/包含）。
        // ⚠️⚠️ 互斥那句 2026-08-18 起也不成立：⑦ 要求当根周 K 阴、⑧ 要求当根阳 ⇒ 交集恒为空
        // （60 周回放 0/60）。**互斥 ≠ 包含，两句话别混。**
        // （⑥ 上线当天 n=1 恰好落在 ② 里、穷举会报一个"包含对"——60 周回放 25 周有反例，
        // 是巧合不是结构性的，别照单日快照下结论；那对与 ⑦⑧ 无关，别当成它们引入的。）
        // ⚠️ **②⑥ 的 `weeklyEmaGap` 恒为正、⑦⑧⑨ 可正可负**（⑦⑧⑨ 都完全不看 EMA）—— 五个
        // 周线榜里唯独 ⑦⑧⑨ 不适用那条自检点，别互抄。
        // ⚠️⚠️ **站内现有三对结构性包含的 live 榜**（2026-08-19 起，全部因 ⑨ 而生：①②⑦ 各
        // ⊊ ⑨）：此前 2026-08-12～08-19 期间是"零对"（更早的两对 ① ⊊ `monthlyWeeklySar`、
        // `weeklyEmaSarBull` ⊊ `weeklyEma921Expansion` 的对家当天被移除）。⚠️ **别照旧注释
        // 去写"站内零对/没有任何一对包含"** —— 那句自 ⑨ 上线起作废。
        // **各榜轴集已于 2026-07-30 对齐成同一套**（2026-08-12 加「日涨跌幅」后为 17 轴）。
        label: "加密策略", asset: "加密", tf: "月线",
        tabs: [
            { key: "monthlyWeeklyDaily", name: "月线SAR × 周线SAR × 日线SAR",
              desc: "月线、周线、日线三个周期的 SAR 全部多头——最大级别方向、中级别趋势、短期节奏同时向上，纯趋势共振的一档，不看 EMA 也不看资金。上市不足 3 个月、还算不出月线 SAR 的新合约不入榜。范围是全部加密 USDT 永续合约，表格显示的是日线数值。" },
            // ⚠️ 四线族曾经的三个榜都已移除，判据存档见后端 build_rankings：
            //   · `dailyFourEmaAligned`「日线四线多头排列」（2026-07-26 新增 → 07-28 与
            //     下面那个二选一被移除）：只要四条线排好了，不要求任何一档间距在扩大。
            //   · `dailyFourEmaPersist`「日线9/21/55/200扩张存续」（2026-07-28 新增 →
            //     **2026-08-09 站长「移除：日线9/21/55/200扩张存续」，纯移除、无替代**）：
            //     四线排列还立着 且 这段排列里出现过一次三档间距同时张大的首次扩张（状态型）。
            //   · `dailyFourEmaExpansion`「日线9/21/55/200扩张」（2026-08-09 新增 →
            //     **2026-08-16 站长移除**）：最新那一根正在扩张（事件型）。
            // ⇒ 四线族现在一个 live 榜都不剩。
            // ⚠️ **name 用「排列」不用「扩张」**：站内「扩张」专指间距在变大，两个词混用
            // 会把判据说反 —— 复活任一四线榜时这条用词规矩仍然管着它的 name。
            // ⚠️ 「日线SAR多头第二根」`dailySarSecondBar` **2026-08-11 站长移除**、
            // 「周线SAR多头首根」`weeklySarSecondBar` **2026-08-16 站长移除**（都是纯移除、
            // 无替代）。判据存档在后端 build_rankings；compute 层旗标（日线 `sarSecondBar` /
            // 周线 `sarFirstBar`）照常产出为保留组 ⇒ 复活 = 后端重建列表 + 这里与
            // TABS_CONFIG 各加回一条，零抓取/缓存改动。
            // ⚠️ `weeklySarSecondBar` 的 key 里 "SecondBar" 名不副实（2026-08-11 判据改成
            // "首根"、槽位规矩 key 固定）——复活时沿用原 key、别按名字推判据。
            // tf 周线：两个条件都在周线。⚠️ 2026-07-30 站长逐字：「新增一个TAB，逻辑是：最新
            // 已收盘周线是EMA9/21扩张，且SAR多头。支持当前各种升降序。」（没点资产 ⇒ 加密）
            // ⚠️⚠️ 这是同日移除的「周线SAR多头」榜槽位第二版判据的**新榜化身**（key 全新）：
            // 在"周线 SAR 站多头"之上再叠一道"EMA9/21 结构在张开"，命中比纯 SAR 多头少得多。
            // ⚠️ name 写「9/21扩张」不写「两线扩张」：后者是 (9/21 ∪ 9/26) 并集专称，本榜严格 9/21。
            { key: "weeklyEmaSarBull", name: "周线9/21扩张＋SAR多头", tf: "周线",
              desc: "最新已收盘周线要同时满足两条：一是 EMA9 在 EMA21 上方、而且两者的间距比上一周更大（均线正在张开，不是单纯的多头排列），二是这根周线的 Parabolic SAR 站在多头一侧。它在「周线 SAR 站多头」这个方向门槛之上，还要求 EMA9/21 均线结构本身正在加速张开，所以命中数比单看方向少得多，找的是「趋势方向和结构强度双双确认」的标的，而不是「方向朝上但可能还在磨」的一大批。用法上，SAR 保证了方向，EMA 扩张保证了力度，两者叠加天然偏强势；排序时按周ADX 或周MACD强弱 能进一步区分「大级别力度足」和「刚起步」。需要至少 22 根已收盘周 K 才算得出 EMA9/21 扩张，所以上市不足约半年的新合约不入榜。表格里的日线八轴不参与筛选，用来在这批标的里再看日线强弱。范围是全部加密 USDT 永续合约。" },
            // tf 日线：两个条件都在日线。⚠️ 2026-09-05 站长逐字：「日线9/21/55扩张＋CVD递增
            // 这个TAB的逻辑改为：日线EMA9/21两线扩张＋CVD递增。」⇒ 条件 ① 由三线放宽回 9/21
            // （建榜口径见后端存档）。**纯放宽**：旧成员集 ⊆ 新成员集，命中 55 → 88。
            // ⚠️⚠️ **key 没改**（`dailyTripleEmaCvd` 里的 "TripleEma" 从此名不副实）——
            // "槽位逻辑会迭代、key 固定"，改 key 要连累 KV / paidMeta / 前端 / 用户
            // localStorage 四处，而本榜还是橱窗 TEASER_TAB。
            // ⚠️ **name 把周期数写全**（9/21），遵守加密这边"不用「N 线扩张」说法"的规矩
            // ——「两线扩张」在站内是 (9/21 ∪ 9/26) **并集**的专称，而本榜是严格 9/21；
            // 站长原话里的"两线扩张"已写死了 9/21 ⇒ 照抄反而会把口径说宽（完整词义约定见
            // 后端 build_rankings 的「显示名的两条用词规矩」）。
            // ⚠️ 与 ④「日线9/21扩张＋SAR多头首根」、⑩「日线9/21扩张＋SAR多头＋阴K」现在
            // **共用同一个底（9/21 扩张）**，靠第二个条件分开、两两互不包含；desc 里已把
            // 「它挑的是资金那一侧」这层差别写给用户，免得三张榜看起来重复。
            // ⚠️ ＋ 连接同周期条件（× 是留给跨周期的），两个条件都在日线 ⇒ 用 ＋。
            { key: "dailyTripleEmaCvd", name: "日线9/21扩张＋CVD递增", tf: "日线",
              desc: "两个条件都看最新已收盘的那根日线：① EMA9 在 EMA21 上方，而且两者的间距比前一天更大——均线正在张开，不是单纯的多头排列；② CVD 在 0 轴上方且比前一天更高，也就是资金这一侧同步在跟。这张榜 2026-09-05 起把均线那一条从「9/21/55 三条依次张开」放宽回了「9/21 两条张开」：中周期那道 EMA55 门槛去掉之后，那些短周期刚翻上来、中周期还没转过来的标的也进得来，池子明显变大，代价是里面混进了更多刚起步、还没被中周期确认的机会。它挑的是「结构在张开、资金也在跟」这一对同时成立的标的，与另外两张同样以 9/21 扩张打底的日线榜分工不同：那两张一张看 SAR 是不是刚翻多、一张看这根 K 是不是回踩的阴线，本榜看的是资金那一侧。成员跨天比盯单日事件的榜稳一些：只要均线还在张开、CVD 没掉头，同一个标的可以连着好几天都在。需要至少 23 根已收盘日 K，上市不足约一个月的新合约不入榜。范围是全部加密 USDT 永续合约。" },
            // ⚠️ 四线族第三张「日线9/21/55/200扩张」`dailyFourEmaExpansion` **2026-08-16
            // 站长移除**（判据存档见后端；四线族至此一个 live 榜都不剩）。
            // tf 日线。⚠️ 2026-08-11 站长逐字：「新增一个TAB，逻辑是：最新已收盘日线是
            // 首根SAR多头的日K，且EMA9/21扩张。」判据 ＝ compute 层 `daily_sar_flip_data`
            // 的成员资格（那个 dict 写在 9/21 扩张块内部 ⇒ 两个条件都在里面，见后端注释）。
            // ⚠️ 与「日线SAR多头第二根」那对结构性互斥**已随该榜 2026-08-11 被移除而消失**
            // （⚠️ 但"站内已没有互斥对"这个推论 2026-08-18 起不成立了：新榜 ⑧ 与 ⑦ 是新的一对），
            // desc 里原先讲这层关系的那一整段（约 100 字）也已删掉 —— 那个榜一没，那段就成了
            // board-head 上指向一个不存在的榜的文字（**用户可见**）。⇒ 移除榜时必须 grep 它的
            // 显示名，把每个"顺带提到它"的 desc 都扫一遍，不只是注释。
            // ⚠️ name 把 EMA 周期数写全（加密不用「N 线扩张」的说法）；两个条件同周期 ⇒ 用 ＋。
            // ⚠️ 命中天然极小、空榜正常（事件型 × 结构过滤），desc 里已如实写给用户。
            { key: "dailyEmaSarFlip", name: "日线9/21扩张＋SAR多头首根", tf: "日线",
              desc: "两个条件都看最新已收盘的那根日线：① Parabolic SAR 刚刚由空翻多，而且翻多的就是这一根——前一天还在空头一侧，今天是这一轮多头的第一根；② EMA9 在 EMA21 上方，并且两条均线的间距比前一天更大，也就是均线结构同一天也在张开。只看 SAR 翻多，每天都会冒出一批标的，其中不少只是下跌途中的一次反抽；再要求均线正在张开，留下的是方向刚转过来、结构也已经跟上的那一小撮，这就是它比单纯的翻多信号挑剔的地方。要留意这是一张一次性的事件清单：同一个标的在一轮行情里只会在这一天出现，第二天起就不在了，所以成员几乎每天全换、命中数天然很小，遇到空榜也是正常的。范围是全部加密 USDT 永续合约。" },
            // ⚠️ 「日线9/21/55扩张＋SAR多头＋阴K」`dailyTripleEmaSarBearish` **2026-08-16
            // 站长移除**（判据存档见后端）。⚠️⚠️ 那句「站内不再有要求阴K 的榜、也不再有
            // "找回调"的榜」**同日稍后即作废** —— 站长新增了 `weeklySarBearish`
            // 「周线阴K＋SAR多头」（见本组末条）。⚠️ 而「它是站内唯一要求阴K/找回调的榜」那句
            // **2026-09-03 又作废**：新增了 ⑩ `dailyEmaSarBearish`（日线级同类，且叠一道 9/21
            // 扩张门）⇒ 站内现有两个偏阴线侧的榜（周线 ⑦ / 日线 ⑩）。别照那些旧话去找。
            // tf 月线：唯一的条件在月线。⚠️ 2026-08-13 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘月线的SAR是首个SAR多头。」（没点资产 ⇒ 加密）＝ 倒1（最新已收盘
            // 月 K）SAR 多头 且 倒2 空头。后端判据字段 `sarUptrend`/`sarUptrendPrev` 都是
            // 月线缓存早就产出的（原供已移除的 `monthlySarBreakout` —— 那个还要收盘价突破
            // 空头段末根圆点价，判据不同 ⇒ 开的新 key）。
            // ⚠️ 建榜时与「周线SAR多头首根」判据同构、只差周期，显示名刻意对称——**那个榜
            // 2026-08-16 已移除**，本榜现在是站内唯一的纯 SAR 首根榜。
            // ⚠️ 命中天然很小、空榜正常（事件型，36 个月回放中位 8、2 个月为 0）；
            // **月内成员恒定**（月线缓存每月 1 号 UTC 才刷新）—— 这两条 desc 里都写给用户了。
            { key: "monthlySarFirstBar", name: "月线SAR多头首根", tf: "月线",
              desc: "最新已收盘的那根月线，正好是这一轮 Parabolic SAR 多头趋势的首根——SAR 圆点刚刚在这个月由价格上方翻到下方，而上个月还停在空头一侧。月线是全站最大的周期，同一个标的平均要好几年才轮到一次月线翻多，它抓的是超大级别趋势反转刚被确认的那一刻：日线、周线的翻多都可能只是更大级别下跌里的一次反弹，月线翻多意味着按月计的下跌结构被扭转，大级别行情的起点多半伴随这个信号；代价是它天然滞后于真正的底部，而且月线级别的信号一旦走坏，等到再翻空确认时，回撤也是按月计的。这是一次性的事件清单不是持续清单——同一个标的只在翻多的那个月出现，下个月它就成了第二根、不再在榜上，所以命中数天然不多、遇到空榜也正常：回放过去三年，多数月份是个位数到十几个，全市场一起转折的大月份能到几十个，也有整月一个都没有的时候。本榜只看 SAR，完全不看均线与资金。另外月线数据每月 1 号（UTC）新月线收盘后才刷新一次，整个月之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线各轴都不参与筛选，用来在这批标的里再分强弱。上市不足 3 个月的新合约看不出「翻多的前一个月是空头」，不入榜；日线数据不足 23 天的，日线那几轴会显示「—」。范围是全部加密 USDT 永续合约。" },
            // tf 周线：唯一的条件在周线。⚠️ 2026-08-16 站长逐字：「新增TAB，逻辑是：最新
            // 已经收盘的周线是EMA9/21/55三线扩张。」（没点资产 ⇒ 加密）
            // ⚠️⚠️ **key 复用 2026-07-08 被移除的同名旧榜**——判据逐字相同（「同判据 ⇒
            // 复用旧 key」规矩，同 weeklyEmaBearish / monthlyWeeklySar 两先例）；唯一判据
            // 是周线缓存的 `emaExpansion` 字段（EMA9>21>55 排列 + 双间距扩张，≥56 根已收盘
            // 周 K），闲置五周后转正、零 compute / 零 schema 改动。
            // ⚠️ 与 ② 互不包含（都蕴含周线 9/21 扩张，② 多 SAR 门、本榜多 EMA55 档）。
            // ⚠️ name 把 EMA 周期数写全（加密不用「N 线扩张」说法）；一个条件 ⇒ 名字里无 ＋。
            // ⚠️ 状态型 + 周内成员恒定（周线缓存每周一 00:00 UTC 才刷新）—— desc 里写给用户了。
            { key: "weeklyTripleEma", name: "周线9/21/55扩张", tf: "周线",
              desc: "只看最新已收盘的那根周线：EMA9 在 EMA21 上方、EMA21 又在 EMA55 上方，而且 9 与 21、21 与 55 这两档间距都比上一周更大——三条周线级的均线依次排开并且同时在张开，不是单纯的多头排列。这种三条均线同时加速张开的形态放在日线上几天就可能走完一轮，放在周线上一旦成立，对应的往往是按周计的中期趋势正在加速，短线噪音基本被抹平；本榜只看均线结构本身，完全不看 SAR 也不看资金，是站内衡量「中期结构是否在加速」最纯粹的一档。它是一张状态清单不是事件清单：只要三条均线还在依次张开，同一个标的可以连着几周都在榜上。另外周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。需要至少 56 根已收盘周 K（约 13 个月）才算得出 EMA55 的扩张，所以上市一年出头以内的新合约不入榜。表格里的日线各轴不参与筛选，用来在这批标的里再看日线强弱；按周ADX 或周MACD强弱 排序能进一步区分「大级别已经跑起来的」和「刚开始张开的」。范围是全部加密 USDT 永续合约。" },
            // tf 周线：两个条件都在周线。⚠️ 2026-08-16 站长逐字：「新增一个TAB，逻辑：最新
            // 已收盘的周线是阴线，且SAR是多头。」（没点资产 ⇒ 加密）
            // ⚠️ 站长同一条消息里先发过两条随即打断改口（日线版、周线版都带 EMA9/21 扩张）
            // ——**那两条被撤回了**，以本判据为准。
            // ⚠️⚠️ **本榜当时是站内唯一要求阴K/"找回调"的榜**（别的榜问"哪些在启动/在延续"，
            // 本榜问"哪些在强势里回踩"）——同日移除 dailyTripleEmaSarBearish 后那句「站内不再有
            // 阴K 榜」只成立了约两小时，见上方 dailyEmaSarFlip 那段。⚠️ **"唯一"2026-09-03 又
            // 作废**：⑩ `dailyEmaSarBearish` 是日线级同类（本榜是周线级那个），见本组末条。
            // ⚠️ key 全新（与已移除的 weeklyEmaBearish 三个版本判据都不同）；「Bearish」在
            // 站内一律指**阴K**不是"空头"。
            // ⚠️ 与另两个周线榜互不包含（60 周回放两个方向 0/60，反例 2814 + 729 人次）。
            // ⚠️ 门槛只要 3 根已收盘周 K ＝ **站内门槛最低的周线榜**（另两个 22 / 56 根），
            // 收得进上市三周的新合约 ⇒ 那批的日线轴常显示「—」，是正确行为。
            // ⚠️ name：两个条件同周期 ⇒ 用 ＋；判据里没有 EMA ⇒「写全 EMA 周期数」那条规矩
            // 不适用（同 monthlySarFirstBar 先例）。
            { key: "weeklySarBearish", name: "周线阴K＋SAR多头", tf: "周线",
              desc: "两个条件都看最新已收盘的那根周线：① 它是一根阴线，也就是这一周的收盘价低于开盘价；② Parabolic SAR 仍站在多头一侧，圆点还在价格下方。两条合起来找的是同一件事——周线级的上升趋势还没有走坏，但这一周价格在回撤。站内其余各榜问的都是「哪些标的在启动、在延续」，天然偏在阳线一侧；本榜是唯一反过来问「哪些在强势里回踩」的一张，适合等回调再上车、而不是追已经拉起来的那一根。要留意它的成员换得很快：SAR 多头是一个能连续维持很多周的状态，而「这一周收阴」是单周事件，下一周多半就不是了，所以池子稳但名单每周大约换掉四分之三，回放过去 60 周，每周命中数中位在 40 上下，最少 3 个、全市场普遍回调的那种周最多到过 170 个，还没有出现过空榜。另外周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。它只需要 3 根已收盘周 K 就能判断，是全站门槛最低的周线榜，上市满三周的新合约就可能出现在这里——这类标的日线数据往往还不足 23 天，日线那几轴会显示「—」。还有一点与另外两个周线榜相反：本榜完全不看均线，所以表格里的周线EMA间距 可正可负，负值对应「SAR 已经翻多、但 9 与 21 两条均线还没张开」的更早期形态。范围是全部加密 USDT 永续合约。" },
            // tf 周线：唯一的条件在周线。⚠️ 2026-08-18 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘周线是两连阳。恰好是第二根。」（没点资产 ⇒ 加密）。那两句话是
            // **一件事不是两件**："两连阳"给成分、"恰好是第二根"把段长钉死成恰好 2。
            // ⚠️⚠️ 后端判据字段是 `twoBullExact`（本轮新增、bump 了周线 schema 17→18），
            // **不是** 早就有的保留字段 `twoBull`（那是「≥2 连阳」的真超集）。
            // ⚠️⚠️ 与上一条 `weeklySarBearish` **结构性互斥**（一个要当根周 K 阳、一个要阴）
            // ⇒ 两张榜永远不会出现同一个标的。**这是站内重新出现的第一对结构性互斥 live 榜。**
            // ⚠️ 纯事件型：相邻两周成员交集恒为空（判据保证，60 周回放 59 对全空）；
            // 但周线走缓存 ⇒ 周内纹丝不动是正确行为。两条 desc 里都写给用户了。
            // ⚠️ name 逐字取站长原话「两连阳」+「第二根」——"第二根"本身就编进了"恰好"
            // 这层意思；判据里没有 EMA ⇒「写全 EMA 周期数」那条规矩不适用（同 ⑤⑦ 先例）；
            // 一个条件 ⇒ 名字里无 ＋。
            { key: "weeklyTwoBullExact", name: "周线两连阳第二根", tf: "周线",
              desc: "只有一个条件，看的是最新已收盘的那根周线：它是一段两连阳里的第二根——这一周收阳、上一周也收阳，而再往前那一周不是阳线。也就是说这段连阳的长度恰好是二，本周刚好走完第二根。它不是「至少连涨两周」：如果眼下已经是第三根、第四根阳线，就不在这张榜上，本榜要的是刚起步的那一档。判据里既没有均线也没有 SAR，是站内唯一一张只数 K 线阴阳、不看任何指标的榜，所以它和另外三个周线榜找的完全不是一回事——本榜的成员完全可能均线还没张开、SAR 还站在空头一侧，表格里的周线EMA间距 因此可正可负，实测多数还是负的，正好对应「刚从下跌里翻上来两周、均线还没跟上」的更早期形态。它和「周线阴K＋SAR多头」那张榜永远不会出现同一个标的：一个要求这根周线收阳、一个要求收阴，同一根 K 不可能两者都是。要留意这是一张一次性的事件清单：这一周的第二根，下一周要么变成第三根、要么连阳已经断掉，所以相邻两周的名单完全没有重合，成员每周全换、偶尔出现空榜都是正常的。回放过去 60 周（口径上只统计了上市够久、能一路回溯的那批合约，所以数字比今天页面上看到的偏小），每周命中数中位在十几个，最少的一周是空的，全市场普遍反弹的那种周最多到过两百多个。另外周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。它只需要 3 根已收盘周 K 就能判断，上市满三周的新合约就可能出现在这里——这类标的日线数据往往还不足 23 天，日线那几轴会显示「—」。范围是全部加密 USDT 永续合约。" },
            // tf 周线：唯一的条件在周线。⚠️ 2026-08-19 站长逐字：「新增一个TAB，逻辑：最新
            // 已收盘的周线是SAR多头即可。」（没点资产 ⇒ 加密）＝ 站内"周线 SAR 多头"全集。
            // ⚠️⚠️⚠️ **本榜引入三对结构性严格包含**：① `monthlyWeeklyDaily`、② `weeklyEmaSarBull`、
            // ⑦ `weeklySarBearish` 都以「周线 SAR 多头」为条件之一 ⇒ ①②⑦ 全都 ⊊ 本榜。
            // ⇒ 上方那两处「站内没有任何一对结构性包含的 live 榜」已就地改掉。这是"『站内已经
            // 没有 X 了』下一条指令就把 X 加回来"的第三次应验（阴K/互斥/包含）。
            // ⚠️ 严格子集但**不该取代**（子集⇒取代只针对九成保留率的双胞胎）：①②⑦ 量级差
            // 一个数量级、语义各异、站长说"新增" ⇒ 并列是对的。周线榜由此变**五个**。
            // ⚠️ key 新建、刻意不复用已移除的 `weeklyEmaBearish`（判据虽逐字命中它第三版，但
            // "Ema/Bearish"对纯SAR多头误导 + 复用价值为零）；也没用 `weeklySarBull`（与
            // `weeklyEmaSarBull` 危险近亲）。现名与字段 `sarUptrend` 同名。
            // ⚠️ name：一个条件 ⇒ 无 ＋；判据无 EMA ⇒「写全 EMA 周期数」不适用（同 ⑤⑦⑧）。
            // ⚠️ 状态型 + 周内成员恒定；门槛只要 3 根周 K（同 ⑦⑧ 最低）；weeklyEmaGap 可正可负。
            { key: "weeklySarUptrend", name: "周线SAR多头", tf: "周线",
              desc: "只有一个条件，看的是最新已收盘的那根周线：它的 Parabolic SAR 站在多头一侧，也就是圆点已经翻到价格下方。这是站内所有「用到周线 SAR 多头」的榜里最宽的一张——它就是「周线 SAR 处于多头」的全部标的，不再叠加任何别的门槛。站内另外三张榜其实都是在它的基础上再收一道：「月线SAR × 周线SAR × 日线SAR」是在它之上再要求月线和日线的 SAR 也多头，「周线9/21扩张＋SAR多头」是再要求均线正在张开，「周线阴K＋SAR多头」是再要求这一周收阴，所以那三张的成员都一定在本榜里、只是各自更少更专。它找的是最朴素的一件事：这个标的按周计的方向，眼下站在多头这一侧。它是一张状态清单不是事件清单——SAR 多头是能连续维持很多周的状态，所以同一个标的可以连着好几周都在，历来也是站内命中数最大的一类。用它当宽口径的候选池、再靠排序条按周ADX 或周MACD强弱 挑力度，或者切到日线各轴看短周期是否也跟上，都比直接看更专的那三张多留了一批「方向已经朝上、但还没叠上额外条件」的早期标的。要留意它完全不看均线，所以表格里的周线EMA间距 可正可负，负值正对应「SAR 已经翻多、但 9 与 21 两条均线还没张开」的更早期形态。另外周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。它只需要 3 根已收盘周 K 就能判断，是全站门槛最低的周线榜之一，上市满三周的新合约就可能出现在这里——这类标的日线数据往往还不足 23 天，日线那几轴会显示「—」。范围是全部加密 USDT 永续合约。" },
            // tf 日线：三个条件都在日线。⚠️ 2026-09-03 站长逐字：「新增一个TAB，逻辑是：
            // 最新已收盘日线是EMA9/21扩张，且是阴线，且日线SAR是多头。」（没点资产 ⇒ 加密）
            // ⚠️⚠️ 这条 2026-08-16 发过一次、被站长自己打断撤回（当天最后定的是 ⑦ 的周线版）；
            //   本次正式下达。实现 ＝ 后端 ema921_expansion_data ∩ daily_sar_bearish_data
            //   两个现成保留组的交集，零 compute / 零 schema 改动。
            // ⚠️⚠️ **它让「⑦ 是站内唯一要求阴K/找回调的榜」当场作废** —— 本榜是日线级的第二个
            //   （且多一道 9/21 扩张门）。这是「『站内只有一个 X』下一条指令就推翻」的第四次应验
            //   （前三次：08-16 阴K、08-18 互斥、08-19 包含）。
            // ⚠️ 与 ⑦ 不是孪生：⑦ 完全不看 EMA（2 条件），本榜多一道 9/21 扩张（3 条件）⇒ 周期
            //   不同 + 条件不同，两个方向都不包含。真正与 ⑦ 逐字同判据的是 daily_sar_bearish_data
            //   全集本身，那不是本榜（本榜 ＝ 它再过一道 9/21 扩张门）。
            // ⚠️ 与已移除的 dailyTripleEmaSarBearish 是超集关系（那个把 9/21 收成 9/21/55）⇒ 显示名
            //   刻意只差「/55」一节，让包含关系在 rail 上一眼可见。
            // ⚠️ 行里 emaGap **恒为正**（条件①含 EMA9 在 EMA21 上方）—— 与 ⑦ 相反；emaGap 恒正的
            //   榜由此变三个（dailyTripleEmaCvd / dailyEmaSarFlip / 本榜）。
            // ⚠️ **别为阴K/SAR 加轴**（布尔值排不了序）；17 轴照旧、共用同一个 sorts 对象。
            // ⚠️ 事件×结构：命中天然很小、空榜正常（阴K 是单日事件、名单天天换）。
            { key: "dailyEmaSarBearish", name: "日线9/21扩张＋SAR多头＋阴K", tf: "日线",
              desc: "三个条件都看最新已收盘的那根日线：① EMA9 在 EMA21 上方，而且两条均线的间距比前一天更大，也就是均线结构正在张开；② 这一根收阴，收盘价低于开盘价；③ Parabolic SAR 仍站在多头一侧，圆点还在价格下方。三条合起来找的是同一件事——日线级的上升结构还没走坏、当天却在回撤，也就是强势里的一次日线级回踩。它和「周线阴K＋SAR多头」是同一个想法的两个周期：那张看整周是不是在回调、本榜看当天这一根，而且本榜额外要求两条均线正在张开，比周线版多一道结构门，节奏也更快——适合已经用更大周期定了方向、想在日线上等一根回调 K 再上车，而不是追已经拉起来的那一根。要留意它换得很快：均线张开加 SAR 多头是能维持一阵的状态，但「今天收阴」是单日事件，明天多半就不是了，所以池子相对稳、名单几乎天天换，命中数天然很小，遇到空榜也是正常的。还有两处能当自检点看：本榜要求均线正在张开，所以表格里的日EMA间距 一定是正数；而入榜就要求这根日 K 收阴，所以日涨跌幅 那一列在这张榜上必然是负数——这两件都是判据决定的，不是数据出错。范围是全部加密 USDT 永续合约。" },
            // tf 日线：两个条件都在日线。⚠️ 2026-09-05 站长逐字：「新增一个TAB，逻辑：
            // 日线9/21扩张＋SAR多头第二根K线」（没点资产 ⇒ 加密）。后端 ＝ ema921_expansion_data
            // ∩ daily_lookup 的 `sarSecondBar` 旗标（自 2026-08-11 起零消费者的保留组，本榜是
            // 它转正后第一个消费者），零 compute / 零 schema 改动。
            // ⚠️⚠️ 与 ④`dailyEmaSarFlip`「首根」**结构性互斥、且对称**：④ ＝ 9/21扩张 ∩ 倒2空头、
            //   本榜 ＝ 9/21扩张 ∩ 倒2多头+倒3空头 ⇒ 倒2 不可能既空又多 ⇒ 两榜永远不会有同一
            //   个标的。这是站内第 2 对结构性互斥 live 榜（第一对是 ⑦∩⑧）。显示名与 ④ 刻意只差
            //   末节（首根/第二根），让这层"相邻两根且互斥"在 rail 上一眼可见。
            // ⚠️ 与已移除的纯 `dailySarSecondBar`（无 EMA 门）判据不同 ⇒ 新 key；名字里有 Ema ＝
            //   带 EMA 门（同 ④ 的区分方式），刻意不叫 `dailyEmaSarSecondBar`（避免与旧 key 近亲）。
            // ⚠️ 行里 emaGap 恒为正（条件①）⇒ emaGap 恒正的榜由三个变四个；别为 SAR 加轴。
            // ⚠️ 事件型：相邻两日成员交集恒为空、命中天然很小、空榜正常（同 ④）—— desc 里写给用户了。
            { key: "dailyEmaSarSecond", name: "日线9/21扩张＋SAR多头第二根", tf: "日线",
              desc: "两个条件都看最新已收盘的那根日线：① Parabolic SAR 站在多头一侧，而且这一根正好是这一轮多头的第二根——前天还在空头，昨天翻多是第一根，今天是紧接着站住的第二根；② EMA9 在 EMA21 上方，并且两条均线的间距比前一天更大，也就是均线结构同一天也在张开。它和「日线9/21扩张＋SAR多头首根」是同一件事、只差一天：那张抓的是翻多当天的第一根，本榜抓的是次日站住的第二根，两张榜永远不会出现同一个标的（同一根 K 不可能既是第一根又是第二根），合起来正好是「均线在张开的这一轮日线多头」的头两根。比起只看翻多首根，多等一天能滤掉那些翻多当天就掉头、连第二根都站不住的假信号，留下的是方向确实转过来、结构也已经跟上的那一小撮，适合想让翻多再被确认一天、而不是抢在翻多当天进场的人。要留意这是一张一次性的事件清单：同一个标的在一轮行情里只会在这一天出现，今天的第二根，明天要么成了第三根、要么已经翻空，所以成员几乎每天全换、命中数天然很小，遇到空榜也是正常的。另外表格里的日EMA间距 一定是正数（判据要求均线正在张开），这是判据决定的、不是数据出错。范围是全部加密 USDT 永续合约。" },
        ],
    },
    // === A股（2026-07-24 站长定版「A股只保留这个TAB」，2026-07-29 改判据 + 加三个涨跌幅榜）===
    // ⚠️⚠️ **2026-08-16 起股票系只剩 A股 一个资产**（站长「移除美股，移除ETF」，那两组
    // 由 singleStrategyGroup 工厂生成、已连工厂一起删）。
    // A股 的判据 2026-07-29 就与美股/ETF 分家了（当天从工厂里拆出来手写），所以移除那两个
    // 资产**没动 A股 一个字**。判据两轮迭代：2026-08-16 五条共振 → 单条件「周线 9/21/55
    // 三线扩张」；**2026-08-19 又改成「周线 9/21 两线扩张 ＋ 周线 SAR 多头」**（2 个条件、
    // 都在周线，与加密 `weeklyEmaSarBull` 逐字同判据同名），组 tf 保持周线。
    // ⚠️ **2026-08-19 同一条指令还把轴序改成与加密对齐**（首轴由日线RSI→日成交额，见
    // singleStrategySorts 定义处）——轴数仍 16、字段集没动，只是重排 + 换首轴默认排序。
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
    // ⚠️ 组 tf 2026-08-16 由「月线」改成「周线」：判据整个搬到了周线（此前月/周/日三级共振，
    //    tf 跟着最大的那个周期走）。board-head 的「A股 · 周期 · 榜名」读的就是这里。
    { label: "A股策略", asset: "A股", tf: "周线",
      tabs: [
        { key: "ashareMonthlyWeeklyDaily", name: "周线9/21扩张＋SAR多头",
          desc: "最新已收盘的那根周线要同时满足两条：一是 EMA9 在 EMA21 上方、而且两者的间距比上一周更大（均线正在张开，不是单纯的多头排列），二是这根周线的 Parabolic SAR 站在多头一侧。它在「周线 SAR 站多头」这道方向门槛之上，还要求 EMA9/21 均线结构本身正在加速张开，所以命中数比单看方向少得多，找的是「趋势方向和结构强度双双确认」的股票，而不是「方向朝上但可能还在磨」的一大批。用法上，SAR 保证了方向、EMA 扩张保证了力度，两者叠加天然偏强势；排序时按周ADX 或周MACD强弱 能进一步区分「大级别力度足」和「刚起步」。它是一张状态清单不是事件清单：只要这两条还成立，同一只股票可以连着几周在榜上；而且周线要到本周最后一个交易日收盘后才定型，同一周之内反复打开本榜，看到的名单基本不变，这是正确行为不是数据卡住了。需要至少 22 根已收盘周 K（约 5 个月）才算得出 EMA9/21 扩张，所以上市不足约半年的次新股不入榜；当日停牌的也不入榜。范围是全部沪深 A 股。表格里的日线各轴（RSI、成交额、量比、CVD强弱等）不参与筛选，用来在这批股票里再看短期强弱；默认按日成交额从高到低排。" },
      ] },
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
// 免费橱窗留 TEASER_TAB（现为加密榜 dailyTripleEmaCvd）里 日线 RSI 最高的 1 行，
// 其余全部榜锁定后 data[tab] 是 undefined（公开 JSON 根本不含这个 key）——不是"给个
// 空数组"那种锁法。2026-07-25 起全站每一个榜都付费，这 1 行是唯一的榜单类免费内容。
// 总开关：必须跟后端 fetch_data.py 的 PAYWALL_ENABLED 保持一致，留作紧急回滚
// 开关（两处一起改回 false，不用逐处回退 diff）。
const PAYWALL_ENABLED = true;
const WORKER_API = "https://bishuju-api.fanshenpan.workers.dev";
// ⚠️ 必须与后端 fetch_data.py 的 TEASER_TAB 一致。历经 dailyCvd → dailyEma921
// （2026-07-22 日线策略收敛）→ monthlyWeeklyDaily（2026-07-25 加密收敛成单一榜）→
// usMonthlyWeeklyDaily（同日站长「移除加密所有TAB」，加密一个榜都不剩）→
// **dailyTripleEmaCvd**（2026-08-16 站长「移除美股，移除ETF」，橱窗又一次被迫搬家）。
// ⚠️⚠️ **选榜的唯一硬指标是「从不空榜」**：橱窗是全站唯一的榜单类免费内容 + 默认落地
// 榜，空一天 = 新访客落在什么都没有的页面上、转化钩子当天死掉且不报错。2026-08-16 按
// 此对三个候选做了回放：dailyTripleEmaCvd 90 天 min **7** / 中位 15 / **0 天为空**；
// weeklyEmaSarBull 60 周 min 3 / 0 周为空；weeklySarSecondBar 60 周 **1 周为空**（出局）。
// 取地板最高的那个，它还是日线榜（成员每天换血，橱窗不会整周不动）。完整依据见后端
// fetch_data.py 的 TEASER_TAB 上方注释。
// ⚠️ 换榜要同时改四处：这里 + 后端同名常量 + 下面的 currentTab 默认值 + currentAsset
// 默认值（三者必须同属一个资产，只改落地页不改橱窗 ⇒ 新访客落在全锁空榜上）。
// 全站 15 个榜全付费，这 1 行橱窗 + marketOverview 是仅存的两个免费面。
const TEASER_TAB = "dailyTripleEmaCvd";
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
// 默认落地榜 = TEASER_TAB（加密）：未解锁的新访客一进来就能看到唯一那行免费内容 +
// 「解锁查看剩余 N 个」的转化位。履历：加密 monthlyWeeklyDaily → 2026-07-25 晚改美股
// （加密全部 TAB 已移除）→ **2026-08-16 移除美股/ETF 后回到加密 dailyTripleEmaCvd**。
// 改这里要同步 currentAsset 的默认值（两者必须同属一个资产）。
let currentTab = "dailyTripleEmaCvd";
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

// ⚠️ `isUsTab` / `isEtfTab` 已于 2026-08-16 随美股/ETF 整族移除一并删除（连同它们在
// staleBanner / renderUpdatePill / 收盘快照横幅 / 脉搏磁贴里的全部调用点）。复活时
// 从 git 捞，并记住它们的两条语义：`"etf"` 前缀不会撞 `"us"`；ETF 数据与美股同管道
// 产出、**共用 usUpdateTime**，所有"按时间戳分流"的地方要把 etf 归到美股一侧。

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
    // === 平局 tie-break：日成交额降序（2026-09-04 加）===
    // ⚠️⚠️ **它在此之前是"隐式"存在的**：原来平局 `return 0`，靠 JS 排序的**稳定性**保住
    // 入场顺序，而入场顺序正是后端按 `value` 降序排好的 ⇒ 事实上早就是"平局按日成交额降序"。
    // 现在写成显式的，收益不是"更好看"，是**确定性**：同一份数据每次渲染顺序恒定，不再依赖
    // 引擎的稳定排序保证（也不再依赖"后端一定先排好"这个隐含前提）。
    //
    // **为什么现在才需要**：此前 17 根轴**全是连续浮点**（成交额/涨跌幅/RSI/CVD/订单流/量比/
    // EMA间距/ADX/+DI/MACD/波动幅度/周线各轴/月线RSI），两个标的撞到小数点后 6 位几乎不可能
    // ⇒ 平局在本站从没真正发生过，也就从没人定过规则。**`sarBullBars` 是全站第一根整数轴，
    // 平局是常态**（「值==1」那一档全市场实测个位数到十几个），必须给个确定的说法。
    //
    // 选 `value`（策略榜＝日成交额）而不是别的三条理由：① 它是全站默认排序量、**永不平局**
    // （浮点成交额）；② **中性** —— 不替用户判断"哪个刚翻多更值钱"，符合站内"轴披露事实、
    // 不下判断"的纪律（同 atrPct 那条"不许写低波动会跑赢"）；③ 它就是现在事实上的行为，
    // 改成显式**不改变任何人看到的顺序**（本轮验证里有一条断言专门守这一点）。
    // ⚠️ **tie-break 恒为降序，不跟随 dir 翻转**：升序看新鲜度时，同样是先看大票。
    // ⚠️ `|| 0` 与后端排序键 `x["value"] or 0` 同款兜底（低门槛周线榜真有 value 为 null 的行）。
    // ⚠️ 三个涨跌幅榜的 `value` 是涨跌幅不是成交额，但那三个榜的 `value` 平局才会走到这里，
    // 此时 tie(a,b) 恒为 0、退化成原行为 ⇒ 无影响。
    // ⚠️ 同档内部要再分高下**不该靠加 tie-break**，而是切轴（「值==1」那一批最该看
    // 日ADX/日+DI 分"真趋势 vs 震荡里的假突破"、日EMA间距 分"结构张没张开"）——
    // 排序条本来就是干这个的。**别把判断塞进 tie-break。**
    const tie = (a, b) => (b.value || 0) - (a.value || 0);
    items.sort((a, b) => {
        const av = a[key], bv = b[key];
        const an = av == null || Number.isNaN(av);
        const bn = bv == null || Number.isNaN(bv);
        if (an && bn) return tie(a, b);   // 沉底那一块内部也要有确定顺序
        if (an) return 1;
        if (bn) return -1;
        if (av === bv) return tie(a, b);
        return dir * (av - bv);
    });
    return items;
}

// === master-detail 左栏导航（Claude Design 重设计落地）===
// 左栏 rail：顶部 加密/A股 分段控件 + 当前资产的分组榜单（组数由 TAB_GROUPS 决定，
// 别写死），「资产·周期·策略」同屏全见、一键直达；rail 激活态随资产变色
// （--asset-accent）。移动端 rail 隐藏，同一份导航渲染进抽屉。
// **资产变迁**：crypto 曾有 12H策略组（2026-07-22 移除）；A股 曾整体退役过一次
// （2026-07-24 白天，当晚复活为单 tab）；加密于 2026-07-25 晚整体退役过几十分钟
// （站长「移除加密所有TAB」），同晚随新增 dailyEmaExpansion 榜复活；
// **美股 与 ETF 于 2026-08-16 整族移除**（站长「移除美股，移除ETF」）——分段控件因此
// 从四段回到两段，复活清单见后端 fetch_us.py 顶部 docstring。
const TF_SHORT = { "日线": "日", "周线": "周", "月线": "月" };
// ⚠️ 两张映射表**刻意不保留 us/etf 条目**（对比 2026-07-25 加密退役时保留了 crypto 条目
// ——那次胶囊与 data-asset 主题色还在用它）：这次两个资产的胶囊、分段按钮、CSS 主题色
// 全都一并删了，留着就是死条目。复活时两处一起加回来。
const ASSET_KEY = { "加密": "crypto", "A股": "ashare" };   // TAB_GROUPS.asset → data-asset
const ASSET_CN = { crypto: "加密", ashare: "A股" };        // data-asset → TAB_GROUPS.asset
// ⚠️ 默认资产 = 默认落地 tab 所属资产，**2026-08-16 起回到加密**（美股/ETF 移除，橱窗
// 随之搬回加密榜）——落地榜刻意跟着 TEASER_TAB 走（未解锁的新访客一进来就能看到那 1 行
// 免费内容 + 转化位）。换落地页**必须同时**改 currentTab、这里、以及前后端两处
// TEASER_TAB —— 只改落地页不改橱窗，新访客会落在一个全锁的空榜上，转化位直接消失。
let currentAsset = "crypto";                            // 当前资产（由 tab 派生/资产切换驱动）
// 各资产记住上次看的榜；这里是"还没看过时"的初值 = 该资产 TAB_GROUPS 里的第一个榜。
// A股 只有一个策略榜 + 三个涨跌幅榜，初值取策略榜；加密初值取默认落地的橱窗榜
// （＝ TEASER_TAB，未解锁时它是加密侧唯一有内容的榜，回到加密时不该落在全锁的榜上）。
const lastTabByAsset = { crypto: "dailyTripleEmaCvd", ashare: "ashareMonthlyWeeklyDaily" };

function assetOfTab(tab) {
    const m = TAB_META[tab];
    return m ? ASSET_KEY[m.asset] : "crypto";   // 兜底跟默认落地 tab 走
}

// rail 组标签统一显示"周期/行情"（资产已由分段控件表达,组名不再重复"A股"前缀）
function navGroupLabel(g) {
    return g.label.replace(/^(A股)/, "") || g.label;
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
        // 一律写**标的范围**而不是数量——写 tabCount(某个榜) 会变成"监控 N 只"却是
        // 命中数，是误导（这条规矩定于三个股票系资产各只有 1 个策略榜的年代，现在两个
        // 资产都有全量涨跌幅榜了，但"范围"仍然比"某一个榜的命中数"更准确）。
        const uni = currentAsset === "ashare" ? "沪深 A 股全市场"
            : "加密 USDT 永续合约全市场";
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
    // ⚠️ 只有 A股 需要显式加类：加密走 .asset-tag 的默认（品牌色）样式，
    // is-us / is-etf 两个类随 2026-08-16 移除美股/ETF 一并删掉（CSS 侧也删了）。
    tagEl.classList.toggle("is-ashare", m.asset === "A股");
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
        // "每交易日收盘后更新"的日更资产用另一套文案（加密是「合约/整点后重算」）。
        // ⚠️ 2026-08-16 前这里还要 || isUsTab || isEtfTab —— 美股/ETF 移除后只剩 A股，
        // 复活那两个资产时**必须把它们加回这一行**，否则它们会落进 else 显示加密的
        // 「整点后重算」文案、误导更新预期（2026-07-20 审计就修过一次同款漏判）。
        const dailyAsset = isAshareTab(currentTab);
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
            // "今日无人命中"。这个分支诞生于 2026-07-25~08-16 橱窗挂在美股榜的年代：
            // 那时橱窗由美股管道（每交易日 21:20 UTC）写、公开文件每小时被加密任务重写
            // 一次，两条管道错位就有一段空窗（改动当天就撞上了）。
            // ⚠️ 2026-08-16 橱窗搬回加密榜后写入方与公开文件同源、错位窗口消失，**但这个
            // 分支要留着**：paidMeta 与橱窗行来自同一枪、理论上同生同灭，可一旦哪天又
            // 不同源（或 _teaser_rows 出别的意外），走下面的 strict 分支页面会说"今日没有
            // 标的命中"而导航徽标同时显示 25，自相矛盾且是假话。这里如实说 + 给转化位。
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
    // 也要落在本资产自己的榜上。⚠️ **写成显式逐资产映射、别写二分**：2026-07-20 审计
    // 补这条防御时的原话是"二分写法会把「ETF」误跳去别的资产"——现在只剩两个资产，
    // 三元看着像二分，**再加资产时必须继续逐个列**。
    const fallback = assetK === "ashare" ? "ashareMonthlyWeeklyDaily" : "dailyTripleEmaCvd";
    switchTab(lastTabByAsset[assetK] || fallback);
}

// 收盘快照说明横幅：切到日更资产时显示,关闭一次永久不再弹（localStorage——"这个资产是
// 收盘快照不是盘中实时"是常识型说明,看过一次就够）。各资产独立的 dismiss key,互不影响。
// （2026-07-24 A股 退役后连同 DOM id 一并从 ashareBanner 改名 snapshotBanner——它从
// 2026-07-20 起就覆盖多个资产，名字早已名不副实。⚠️ localStorage 的 key 保持原样不动：
// 改了会让所有已关过横幅的老用户重新看到它。）
// ⚠️⚠️ **2026-08-16 美股/ETF 移除后只剩 A股 一个日更资产**（加密 7×24 不需要这条横幅）。
// 那两个资产的文案与 dismiss key（bsj_us_banner_dismissed / bsj_etf_banner_dismissed）
// 一并删除；**复活时 key 必须写回原来那两个字面量**，否则老用户会重新看到已关过的横幅。
const SNAPSHOT_BANNER_TEXT = {
    ashare: "A股 数据为每个交易日收盘后更新的快照，不是盘中实时行情。",
};
function snapshotBannerDismissKey() {
    return "bsj_ashare_banner_dismissed";
}
function renderSnapshotBanner() {
    const el = document.getElementById("snapshotBanner");
    if (!el) return;
    const applicable = currentAsset === "ashare";
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

    if (isAshareTab(currentTab)) {
        // A股 每个交易日收盘后更新一次，阈值远比 crypto 的小时级宽松（容忍节假日/偶发
        // 延迟），跟 check-freshness.yml 的 30 小时口径一致。
        // ⚠️ 2026-08-16 前这里还并着 isUsTab/isEtfTab（读 usUpdateTime）——美股/ETF 移除
        // 后只剩 A股；复活那两个资产时要把分支和 usUpdateTime 一起加回来。
        const t = parseUpdateTime(data.ashareUpdateTime);
        el.hidden = !(t && Date.now() - t > 30 * 3600 * 1000);
        return;
    }
    // 加密走小时级 updateTime（每小时抓一次，2.5h 未动就亮横幅），与收盘日更资产的阈值
    // 差一个数量级——这条分支 2026-07-25 晚随加密榜移除短暂不可达，同晚已复活。
    const t = parseUpdateTime(data.updateTime);
    // 数据每小时更新；超过 2.5 小时没动就亮横幅
    el.hidden = !(t && Date.now() - t > 2.5 * 3600 * 1000);
}

/** 顶栏新鲜度胶囊（Claude Design 重设计）：加密（小时级倒计时）+ A股（收盘日更）并置，
 *  当前资产侧高亮、另一侧 .is-dim；移动端 CSS 只显示激活侧。
 *  A股 显示 ashareDataDate（数据实际对应的交易日）——任务跑了但数据源迟发布时它会落后
 *  于更新时间，显示出来用户能看出"今天的数据其实还是昨天的"。
 *  ⚠️ 2026-08-16 起**只有两个胶囊**：第三个 `freshUS`（美股，ETF 复用它）随美股/ETF
 *  移除一并删除，DOM 与点击处理器都清了。移动端 CSS 只显示非 .is-dim 的那一个 ⇒
 *  **任何时候必须恰好有一个胶囊是亮的**，加资产时别忘了给它一个胶囊或归并到某一侧。 */
function renderUpdatePill() {
    const elC = document.getElementById("freshCrypto");
    const elA = document.getElementById("freshAshare");
    if (!elC || !elA || !data) return;

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

    // --- A股胶囊（收盘日更；ashareDataDate 是 tushare 的 'YYYYMMDD'，**无分隔符**，
    // slice 位置是 4..6 / 6..8；已移除的美股那个是 ISO 'YYYY-MM-DD'、位置 5..7 / 8..10，
    // 复活时别把两套 slice 抄混）---
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

    // 状态类 + 当前资产侧高亮（移动端只显非 dim 的那一个，必须恰好有一个亮着）。
    elC.className = `fresh ${clsC}${currentAsset === "crypto" ? "" : " is-dim"}`;
    elA.className = `fresh ${clsA}${currentAsset === "ashare" ? "" : " is-dim"}`;
}

// 各资产的策略 tab 数，pulse "N 榜" 用；按资产从 TAB_GROUPS 算，不硬编码。
const CRYPTO_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "加密").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;
const ASHARE_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "A股").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;

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
    const tiles = currentAsset === "ashare" ? asharePulseTiles() : cryptoPulseTiles();
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
//    不会撑破磁贴——所以这里可以放榜名，不用怕最长的（现为「日线9/21扩张＋SAR多头首根」；
//    A股 那张 2026-08-16 改判据后已缩成「周线9/21/55扩张」，不再是最长的那个）。
// 单榜资产（A股 只有 1 个策略榜——三个涨跌幅榜不算策略榜）说"命中最多"是废话，
// 故分两种措辞。判据是 keys.length，不写死资产名，加资产自动跟随。
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

// A股 脉搏：走同一条 lockedPulseTile 路径（"拿不到具体行、但命中数是公开数据
// (paidMeta)"），锁定态/解锁态都正确。
// ⚠️ **别为了凑满 4 格去 data[某个榜] 里取行**：那是筛选结果不是全市场，
// 写成"监控 N 只"会把命中数说成标的总数，是实打实的误导。
// ⚠️ 2026-08-16 随美股/ETF 移除删掉了 `usPulseTiles` / `etfPulseTiles`（以及它们依赖的
// US_STRATEGY_TABS / ETF_STRATEGY_TABS 两个常量）。更早的、每个资产四格全市场磁贴的
// 三份实现（含美股 ticker vs 全名的宽度取舍、ETF「涨跌分布」的措辞理由）见 git。
function asharePulseTiles() { return lockedPulseTile("A股", ASHARE_STRATEGY_TABS); }

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
        // crypto/A股 两条管道独立写各自的时间戳，缺一个检查就会被另一个放过——
        // 只查 updateTime 会让 ashareUpdateTime 被回滚（它每天只更新一次，回滚后要等
        // 下一次 crypto 整点刷新 updateTime 才会被下面的 render-key 检查带出来重渲染）。
        // ⚠️ 2026-08-16 移除美股/ETF 后删掉了第三对 usUpdateTime 守卫（那个字段已不再
        // 写进公开文件）。复活美股要把它加回来——**并且要连下面 paidFetchKey / renderKey /
        // 初始化处的 lastPaidUpdateTime 一起加**，那四处必须同构。
        const freshT = parseUpdateTime(fresh.updateTime);
        const haveT = data ? parseUpdateTime(data.updateTime) : null;
        const freshAshareT = parseUpdateTime(fresh.ashareUpdateTime);
        const haveAshareT = data ? parseUpdateTime(data.ashareUpdateTime) : null;
        const rolledBack = (haveT && freshT && freshT < haveT)
            || (haveAshareT && freshAshareT && freshAshareT < haveAshareT);
        // 强穿退避：这次强穿真拿回更新的数据 → 复位到 2.5min；否则（同一/更旧的
        // updateTime，线上还在陈旧）退避加倍，最多 20min 一次（bustStreak 封 3）。
        if (busted) bustStreak = (freshT != null && (haveT == null || freshT > haveT)) ? 0 : Math.min(bustStreak + 1, 3);
        if (rolledBack) {
            renderUpdatePill();   // 倒计时照常走（用手头数据）
            renderStaleBanner();
            return;
        }

        // 免费橱窗和付费全量来自同一批管道，所以只在任一资产的时间戳变化时才打
        // Worker，否则每 30s 轮询会把 CF 免费额度打爆。触发键用两时间戳组合（与下方
        // renderKey 同款）：A股 收盘后只刷新自己的时间戳，只盯 crypto 的 updateTime
        // 会让它写进 KV 的新付费数据最多晚 ~1 小时（等下一个 crypto 整点）才被拉取。
        // 付费墙关闭时 fresh 本身已是全量，完全不打 Worker。
        // ⚠️ 本键与下方 renderKey、以及初始化处的 lastPaidUpdateTime **必须同构**
        // （同样的字段、同样的顺序），改一处要三处一起改（2026-08-16 去掉 usUpdateTime
        // 那一段时就是三处同时改的）。
        const paidFetchKey = fresh.updateTime + "|" + fresh.ashareUpdateTime;
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

        // 渲染键 = updateTime + ashareUpdateTime 组合：两条管道各自独立刷新，只看其中
        // 一个会让另一条的更新落地却不触发重渲染——A股 数据到位后表格/导航/脉搏条会
        // 停留在上一交易日的行，直到下一次 crypto 整点刷新才顺带带出来（此时顶部胶囊
        // 已经先一步显示新日期，出现"胶囊新、表格旧"的错位）。
        // ⚠️ 2026-08-16 去掉了第三段 usUpdateTime（美股/ETF 移除）；与上面 paidFetchKey、
        // 初始化处 lastPaidUpdateTime 三处同构，改一处要三处一起改。
        // 另加两个付费维度（2026-07-22 审计）：paidData 的到位时刻（首轮拉取失败、次轮
        // 成功时免费时间戳没变，不加这维付费内容落地也不重渲染，锁定态要钉到下个整点）
        // 和 license.valid（挂机中被吊销/过期时表格要重新上锁，不能冻结在旧付费内容）。
        const renderKey = fresh.updateTime + "|" + fresh.ashareUpdateTime
            + "|" + (paidData ? paidData.updateTime : "") + "|" + (license.valid ? "1" : "0");
        if (renderKey !== lastRenderKey) {
            lastRenderKey = renderKey;
            renderPulse();
            renderNav();
            renderTable();
        }
    } catch (e) {
        // 失败指示染**当前资产**的胶囊：移动端只显示非 dim 的那一个,写死 freshCrypto 时
        // 用户在 A股 视图下失败完全不可见(2026-07-20 审计修正)。当前资产的胶囊本就
        // 无 is-dim,另一个保持原样(dim 状态由 renderUpdatePill 管理)。
        // ⚠️ 加资产时**必须在这里给它一个胶囊 id**——2026-07-21 审计就补过一次同款漏
        // （etf 落进兜底 freshCrypto，而 ETF 视图下它是 dim 的、移动端整个被隐藏 ⇒
        // 加载失败在手机上完全不可见）。
        const pillId = currentAsset === "ashare" ? "freshAshare" : "freshCrypto";
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
            // KV 带来的上传时刻，否则它可能晚于公开文件的 build 时刻（A股 上传也刷它），
            // 下一轮 loadData 的单调性守卫会把正常公开数据误判成"回滚"整段拒收，
            // 免费面空窗直到公开 updateTime 追过 KV 时刻（最长 ~1 小时）。
            else delete data.updateTime;
            // ⚠️ 必须与 loadData 的 paidFetchKey **同构**（同字段同顺序，2026-08-16 移除
            // 美股/ETF 后为两时间戳；连 renderKey 共三处，改一处要三处一起改）
            lastPaidUpdateTime = data ? (data.updateTime + "|" + data.ashareUpdateTime) : null;
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
        <button class="asset-seg__opt is-active" data-k="crypto"><span class="asset-seg__dot"></span>加密</button>
        <button class="asset-seg__opt" data-k="ashare"><span class="asset-seg__dot"></span>A股</button>
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
// ⚠️ 曾有第三个 freshUS 胶囊,它被 ETF 视图复用、需要一句显式空操作才不会把用户切离
// ETF(2026-07-21 审计)——随 2026-08-16 移除美股/ETF 一并删除。**日后再出现"某个资产
// 没有自己的胶囊、复用别人的"这种归并,那句空操作要一起加回来。**
document.getElementById("freshCrypto").addEventListener("click", () => switchAsset("crypto"));
document.getElementById("freshAshare").addEventListener("click", () => switchAsset("ashare"));

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
// ⚠️ 2026-07-27 修:**首访者的 data-asset 一直是错的**。index.html 把 `data-asset` 写死
// 在 .app 上，而只有 switchTab() 会去纠正它 —— 上面那行在「没有 savedTab」或
// 「savedTab 恰好等于默认 tab」时都不会触发。当时默认落地是美股，于是新访客看到的是
// 美股榜、资产标签也写「美股」，但 CSS 作用域仍是写死的 crypto ⇒ --asset-accent、
// nav 选中底色、tf-chip、排序 chip 选中态、行悬停装饰条全部用成加密琥珀而不是美股紫。
// 涨跌语义碰巧没错（美股与加密同为涨绿跌红），所以它一直没被当成 bug 发现；**换成 A股
// 做默认落地资产就会当场变成红绿颠倒**（A股 是涨红跌绿）。
// 修法是无条件把 DOM 同步到 JS 的 currentAsset，别依赖 switchTab 的副作用——
// 这一行现在是"改默认落地资产"唯一不需要再改一遍 index.html 的保障，别删。
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
