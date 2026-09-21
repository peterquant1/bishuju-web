// === 排序轴 ===
// 轴的 key ＝ 行字段名，sortField 直接按它取值比较（null 沉底）。默认轴 sorts[0] 必须与后端 `value` 取的量一致，
// 否则首屏值列显示的是另一根轴的数。轴数别写进注释，要数就数下面的 sorts 常量。
//
// CVD强弱 ＝ 归一化买卖失衡比 ∈ [−1,+1]（后端 calc_cvd_strength）。不排原始 CVD：它随成交量缩放，跨标的排序≈排成交量。
// 带符号两位小数、不带 %（与涨跌幅共用值列，免得 +0.58 与 +5% 混淆）；中性不上色。
function fmtCvdVal(x) { return x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2); }
// 订单流三轴（同一个失衡比，量的是真实主动成交）刻意例外：值天然挤在 0 附近、绝大多数是个位数百分比的负值，
//   toFixed(2) 会把几百个币压成十几档、还冒出「+0.00 / −0.00」⇒ ×100 按百分比两位小数显示（% 在这里有实义：净主动买占成交量）。
// ⚠️ 别复用 fmtCvdVal，也别反过来把 CVD强弱 改成百分比（它分布宽、两位小数够用）。舍入后为 0 一律显示「0.00%」，不带正负号。
function fmtTakerVal(x) {
    if (x == null) return "—";
    const s = (x * 100).toFixed(2);
    return (s === "0.00" || s === "-0.00" ? "0.00" : (x > 0 ? "+" : "") + s) + "%";
}
function fmtRsiVal(x) { return x == null ? "N/A" : x.toFixed(2); }
function fmtVolVal(v) { return v.volumeFormatted != null ? v.volumeFormatted : "N/A"; }
// 周 / 月成交额读各自的显示串。⚠️ 别复用 fmtVolVal（写死读日成交额的 volumeFormatted）：
// 套上去会显示日成交额、却按周 / 月成交额排序，不报错。
function fmtWeeklyVolVal(v) { return v.weeklyVolumeFormatted != null ? v.weeklyVolumeFormatted : "N/A"; }
function fmtMonthlyVolVal(v) { return v.monthlyVolumeFormatted != null ? v.monthlyVolumeFormatted : "N/A"; }
// 全市场成交额名次「TOP N」徽标（写成工厂，别拆成三份近亲函数）：只在按对应「X成交额」轴排序时挂在值列数字左侧
// （renderTable 读轴定义上的 `badge`）。名次字段：日 volumeRank / 周 weeklyVolumeRank / 月 monthlyVolumeRank，
// 「全市场」＝ 同周期涨跌幅榜的全部行。
// ⚠️ 一个周期一个名次 key，别合并成 volumeRank：涨跌幅榜的 `volume` 装的是本周期成交额，共用 key 会让徽标说错周期。
// 数据驱动：行上没有该整数字段就不渲染（名次进 innerHTML，只认整数）。A股 行不带名次字段 ⇒ ashareUniverseTab 是休眠参数
// （真给 A股 挂名次时，四位数名次要重测窄屏值列宽度）。
function volRankBadgeFor(rankKey, tf, universeTab, ashareUniverseTab) {
    return v => {
        const r = v[rankKey];
        if (!Number.isInteger(r)) return "";
        const n = tabCount(isAshareTab(currentTab) ? ashareUniverseTab : universeTab);
        const tip = `全市场${n != null ? ` ${n} 个标的` : ""}里${tf}成交额排第 ${r} 名`;
        return `<span class="val-rank" title="${tip}">TOP ${r}</span>`;
    };
}
const volRankBadge = volRankBadgeFor("volumeRank", "日", "dailyChange", "ashareDailyChange");
const weeklyVolRankBadge = volRankBadgeFor("weeklyVolumeRank", "周", "weeklyChange", "ashareWeeklyChange");
const monthlyVolRankBadge = volRankBadgeFor("monthlyVolumeRank", "月", "monthlyChange", "ashareMonthlyChange");
// 量比：无量纲倍数。间距 / 涨跌幅这类百分比量：带符号两位小数 + %。
function fmtRatioVal(x) { return x == null ? "—" : x.toFixed(2); }
function fmtGapVal(x) { return x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2) + "%"; }
// 振幅 / 波动幅度：恒非负的百分比，不带符号。
function fmtAmpVal(x) { return x == null ? "—" : x.toFixed(2) + "%"; }
// ADX / +DI：0–100 的无量纲指数，不带 %（同 TV 显示口径）。
function fmtDmiVal(x) { return x == null ? "—" : x.toFixed(2); }
// 日 / 周RSI缺口：RSI 点数之差、有正有负 ⇒ 带符号两位小数、不带 %（与 fmtCvdVal 同格式，分开写免得两边口径一改互相牵连）。
function fmtRsiGapVal(x) { return x == null ? "—" : (x >= 0 ? "+" : "") + x.toFixed(2); }
// 整数根数（日SAR多头根数）：带「根」不写「天」（A股 一根是交易日）。别复用 toFixed(2) 的格式化，会显示成「3.00」。
function fmtBarsVal(x) { return x == null ? "—" : x + " 根"; }

// 副行：当前排序轴之外的其余轴摘要（快览、不承诺穷尽）；extra 是可选的价格上下文，永远保留、不占轴额度。
// 轴摘要封顶 SUB_AXES_MAX 段：桌面端 .sub 会折行，段数一多行高就乱；被裁掉的轴切到对应排序 chip 即可在值列看到。
const SUB_AXES_MAX = 4;
/** 副行里某个轴的标签：取当前 tab 自己 sorts 里的 label（别硬编码，否则排序条改名后副行对不上），取不到才用兜底。 */
function axisLabelFor(key, fallback) {
    const sorts = (TABS_CONFIG[currentTab] || {}).sorts || [];
    const hit = sorts.find(x => x.key === key);
    return hit ? hit.label : fallback;
}
// 各段按白名单逐个写、数据驱动：行上有该 key 才渲染（同一个轴常量跨资产共用也不会串）。段落顺序即优先级，
// 超过 SUB_AXES_MAX 的段默认不显示 ⇒ 加轴时新段放在末尾（默认副行零变化）；每根在用的轴都该有一段，别当多余代码删。
// ⚠️ 删轴三处同批：轴集 + 这里的对应段 + 用户可见 desc。只删轴不删段时 axisLabelFor 退回兜底标签、段照样渲染
//    ⇒ 副行冒出排序条上没有的孤儿摘要。
function axesSub(item, sf, volLabel, extra) {
    const seg = [];
    if (sf !== "rsi") seg.push(`${axisLabelFor("rsi", "RSI")} ${fmtRsiVal(item.rsi)}`);
    // volLabel 由调用方显式传：同一个 volume 字段在日 / 周 / 月榜含义不同。
    if (sf !== "volume") seg.push(`${volLabel} ${fmtVolVal(item)}`);
    if (sf !== "cvdStrength") seg.push(`${axisLabelFor("cvdStrength", "CVD强弱")} ${fmtCvdVal(item.cvdStrength)}`);
    if ("weeklyRsi" in item && sf !== "weeklyRsi") seg.push(`${axisLabelFor("weeklyRsi", "周线RSI")} ${fmtRsiVal(item.weeklyRsi)}`);
    if ("monthlyRsi" in item && sf !== "monthlyRsi") seg.push(`${axisLabelFor("monthlyRsi", "月线RSI")} ${fmtRsiVal(item.monthlyRsi)}`);
    if ("takerStrength" in item && sf !== "takerStrength") seg.push(`${axisLabelFor("takerStrength", "订单流")} ${fmtTakerVal(item.takerStrength)}`);
    // 距前高：现役行都不带这个 key（休眠段）。
    if ("highDist" in item && sf !== "highDist") seg.push(`${axisLabelFor("highDist", "距前高")} ${fmtGapVal(item.highDist)}`);
    if ("adx" in item && sf !== "adx") seg.push(`${axisLabelFor("adx", "ADX")} ${fmtDmiVal(item.adx)}`);
    if ("diPlus" in item && sf !== "diPlus") seg.push(`${axisLabelFor("diPlus", "+DI")} ${fmtDmiVal(item.diPlus)}`);
    if ("macdStrength" in item && sf !== "macdStrength") seg.push(`${axisLabelFor("macdStrength", "MACD强弱")} ${fmtGapVal(item.macdStrength)}`);
    // 涨跌幅榜的行去掉了与 `value` 重复的那个 key（日线榜 changePercent、周线榜 weeklyChangePercent；尾巴由 changeSub 处理）⇒ 不会重复显示。
    if ("changePercent" in item && sf !== "changePercent") seg.push(`${axisLabelFor("changePercent", "涨跌幅")} ${fmtGapVal(item.changePercent)}`);
    if ("weeklyChangePercent" in item && sf !== "weeklyChangePercent") seg.push(`${axisLabelFor("weeklyChangePercent", "周涨跌幅")} ${fmtGapVal(item.weeklyChangePercent)}`);
    if ("sarBullBars" in item && sf !== "sarBullBars") seg.push(`${axisLabelFor("sarBullBars", "SAR多头根数")} ${fmtBarsVal(item.sarBullBars)}`);
    // 周 / 月成交额用各自的 fmt*VolVal；涨跌幅榜的行没有这两个 key（那边成交额就是 `volume`）。
    if ("weeklyVolume" in item && sf !== "weeklyVolume") seg.push(`${axisLabelFor("weeklyVolume", "周成交额")} ${fmtWeeklyVolVal(item)}`);
    if ("monthlyVolume" in item && sf !== "monthlyVolume") seg.push(`${axisLabelFor("monthlyVolume", "月成交额")} ${fmtMonthlyVolVal(item)}`);
    if ("weeklyCvdStrength" in item && sf !== "weeklyCvdStrength") seg.push(`${axisLabelFor("weeklyCvdStrength", "周CVD强弱")} ${fmtCvdVal(item.weeklyCvdStrength)}`);
    // 只在对应周期涨跌幅榜的行上有（策略榜行不带）。
    if ("weeklyTakerStrength" in item && sf !== "weeklyTakerStrength") seg.push(`${axisLabelFor("weeklyTakerStrength", "周订单流")} ${fmtTakerVal(item.weeklyTakerStrength)}`);
    if ("monthlyCvdStrength" in item && sf !== "monthlyCvdStrength") seg.push(`${axisLabelFor("monthlyCvdStrength", "月CVD强弱")} ${fmtCvdVal(item.monthlyCvdStrength)}`);
    if ("monthlyTakerStrength" in item && sf !== "monthlyTakerStrength") seg.push(`${axisLabelFor("monthlyTakerStrength", "月订单流")} ${fmtTakerVal(item.monthlyTakerStrength)}`);
    if ("weeklyDiPlus" in item && sf !== "weeklyDiPlus") seg.push(`${axisLabelFor("weeklyDiPlus", "周+DI")} ${fmtDmiVal(item.weeklyDiPlus)}`);
    // 振幅：现役行都不带这个 key（休眠段）。
    if ("amplitude" in item && sf !== "amplitude") seg.push(`振幅 ${fmtAmpVal(item.amplitude)}`);
    // 日 / 周RSI缺口：排在末尾（超出 SUB_AXES_MAX，默认副行不变）。
    if ("rsiSmaGap" in item && sf !== "rsiSmaGap") seg.push(`${axisLabelFor("rsiSmaGap", "RSI缺口")} ${fmtRsiGapVal(item.rsiSmaGap)}`);
    if ("weeklyRsiSmaGap" in item && sf !== "weeklyRsiSmaGap") seg.push(`${axisLabelFor("weeklyRsiSmaGap", "周RSI缺口")} ${fmtRsiGapVal(item.weeklyRsiSmaGap)}`);
    const shown = seg.slice(0, SUB_AXES_MAX).map(s => `<span class="sub__seg">${s}</span>`);
    // extra（涨跌幅榜的价格上下文 / 当前轴不是涨跌幅时的涨跌幅）带 --ctx：≤860px 排到最前，两行放不下时先让掉的是末尾的轴。
    if (extra) shown.push(`<span class="sub__seg sub__seg--ctx">${extra}</span>`);
    // 每段包一层 span：桌面照旧用「 | 」连成一行；≤860px 的 CSS 隐藏分隔符、按整段折成最多两行（不再截在数字中间）。
    return shown.join('<span class="sub__sep"> | </span>');
}
// 零消费者保留：周线 RSI 动能上下文（rsiPrev → rsiCurr 箭头），供复活 weeklyRsi 榜时作 axesSub 的 extra。
function momentumStr(v) {
    if (v.rsiPrev == null || v.rsiCurr == null) return "";
    const a = v.rsiCurr > v.rsiPrev ? "↑" : v.rsiCurr < v.rsiPrev ? "↓" : "→";
    return `动能 ${v.rsiPrev.toFixed(2)} → ${v.rsiCurr.toFixed(2)} ${a}`;
}
// 涨跌幅榜副行：排涨跌幅轴（sf === "value"）时尾巴是价格上下文，排别的轴时改显示「周涨跌幅 +X%」这类（标签取当前榜首轴），核心数字不会消失。
// 价格上下文由调用方传入：两资产口径不同（加密 K 线实体「开 → 收」、A股 close-to-close「前收 → 收」）。
function changeSub(v, sf, volLabel, priceCtx) {
    const tail = sf === "value" ? priceCtx(v) : `${axisLabelFor("value", "涨跌幅")} ${fmtGapVal(v.value)}`;
    return axesSub(v, sf, volLabel, tail);
}
// 加密：K 线实体口径「开 X → 收 Y」，美元价。
const cryptoPriceCtx = v => `开 ${fmtMktPrice(v.open)} → 收 ${fmtMktPrice(v.close)}`;
// A股（休眠件）：close-to-close，前收 / 现收标签随周期不同，人民币价；preClose / close 由后端行提供。
const asharePriceCtx = (preLabel, curLabel) => v => `${preLabel} ${fmtCnyPrice(v.preClose)} → ${curLabel} ${fmtCnyPrice(v.close)}`;

// === 轴常量 { key, label, format, hint?, badge? }：key ＝ 行字段名（改 key 要连带后端行字段）===
// 策略榜行里日线字段不带前缀、周 / 月线字段带 weekly / monthly 前缀，同一行并存 —— 两个周期别共用 key（会互相覆盖）。
// 标签一律写明周期（日 / 周 / 月）：策略榜的筛选横跨多个周期、行里同时装着各周期的值，光写「RSI」看不出是哪根 K。
const AXIS_WRSI = { key: "weeklyRsi", label: "周线RSI", format: v => fmtRsiVal(v.weeklyRsi) };
const AXIS_MRSI = { key: "monthlyRsi", label: "月线RSI", format: v => fmtRsiVal(v.monthlyRsi) };
const AXIS_D_RSI = { key: "rsi", label: "日线RSI", format: v => fmtRsiVal(v.rsi) };
const AXIS_D_RSIGAP = { key: "rsiSmaGap", label: "日RSI缺口", format: v => fmtRsiGapVal(v.rsiSmaGap),
                        hint: "日线RSI(14)减去它自己的14日SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几天动能冲得越急。只看相对排名；回放360天里缺口最大的一成次日收涨40.8%、全市场45.7%，更像短线过热、不是买点；上市不足28天显示「—」" };
// 周RSI缺口：同一个后端 calc_rsi_sma_gap 喂已收盘周 K（周线缓存 rsiSmaGap）；标签「周」开头 ⇒ 自动进周线共振卡。
const AXIS_W_RSIGAP = { key: "weeklyRsiSmaGap", label: "周RSI缺口", format: v => fmtRsiGapVal(v.weeklyRsiSmaGap),
                        hint: "周线RSI(14)减去它自己的14周SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几周动能冲得越急。只看相对排名；回放104周里缺口最大的一成下周收涨40.2%、全市场42.3%，不是买点；一周只更新一次，上市不足28周显示「—」" };
// 日成交额：最新已收盘那根日 K 的单日成交额（不是累计、不是均值）；badge ＝ 全市场名次「TOP N」，见 volRankBadgeFor。
const AXIS_D_VOL = { key: "volume", label: "日成交额", format: v => fmtVolVal(v), badge: volRankBadge };
// 日涨跌幅：只挂策略榜；涨跌幅榜刻意不挂（首轴 `value` 本身就是涨跌幅，挂了就是同一个量出现两次）。
// ⚠️ key 是 `changePercent` 不是 `value`（策略榜的 `value` 是日成交额）⇒ 按它排序时值列不上红绿（上色要求 tab 在
//    CHANGE_PCT_TABS 且 `sortField === "value"`），靠正负号区分，是知情取舍。
// 两资产口径不同是刻意的（加密 K 线实体、A股 相对前收含跳空），别"统一"。hint 只写口径、不写策略断言。
const AXIS_D_CHGPCT = { key: "changePercent", label: "日涨跌幅", format: v => fmtGapVal(v.changePercent),
                        hint: "最新已收盘那根日K的涨跌幅。加密＝K线实体(收−开)/开；A股＝相对上一根收盘、含跳空" };
// 日CVD强弱：买卖量按 K 线形态推断（对齐 TV 上那个 CVD 指标），不是真实成交归边，横截面上更接近价格动能；
// 真钱流向看「日订单流」。别删、也别改公式（换成 k[9] 就与订单流逐字相同，等于删轴）。
const AXIS_D_CVD = { key: "cvdStrength", label: "日CVD强弱", format: v => fmtCvdVal(v.cvdStrength),
                     hint: "按K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「日订单流」" };
// 日量比 ＝ 当期成交量 / 前 5 期均量；日EMA间距 ＝ (EMA9 − EMA21)/EMA21 × 100。两轴已移除、后端行字段照发 ⇒
// 零消费者保留；复活 ＝ 加回轴集 + axesSub 对应段（下文其余零消费者轴常量同理）。
const AXIS_D_VOLRATIO = { key: "volRatio", label: "日量比", format: v => fmtRatioVal(v.volRatio) };
const AXIS_D_EMAGAP = { key: "emaGap", label: "日EMA间距", format: v => fmtGapVal(v.emaGap) };
// 日订单流：币安 K 线自带的真实 taker 归边（k[9]），加密独有（股票系日线没有归边字段）。与 CVD强弱 互为对照，
// 但别在文案里说"两者背离是信号"（审计不支持）。绝对值常态偏负（hint 已说明）；排序只看相对位置，别动公式。
// 显示走 fmtTakerVal（百分比）；hint 别写具体占比 / 中位数（会发霉），「与之后涨跌几乎无关」是 360 天回放的结论。
const AXIS_D_TAKER = { key: "takerStrength", label: "日订单流", format: v => fmtTakerVal(v.takerStrength),
                       hint: "真实主动成交（币安taker数据）：日线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，回放里与之后涨跌几乎无关，不是买卖信号" };

// === ADX / DMI（后端 calc_adx_dmi，对齐 TV `ta.dmi(14, 14)`）：纯排序轴，不参与任何筛选 ===
// 只留 日ADX + 日+DI（−DI / DI差 已砍，别自行加回；后端仍在算 diMinus / diSpread，复活只需加行字段与轴）。
// ADX 只量趋势强度、不含方向：降序＝最有趋势，升序＝最安静（不是"蓄势待突破"，审计已推翻这个读法）。+DI ＝ 多方方向压力。
const AXIS_D_ADX = { key: "adx", label: "日ADX", format: v => fmtDmiVal(v.adx) };
const AXIS_D_DIPLUS = { key: "diPlus", label: "日+DI", format: v => fmtDmiVal(v.diPlus) };
// 两个资产族共用同一个数组常量，别复制成两份近亲列表。
const dmiSorts = [AXIS_D_ADX, AXIS_D_DIPLUS];

// === 日MACD强弱 ＝ (PPO线 + 3×PPO柱)/4 ＝ (4·MACD − 3·Signal)/(4·EMA26) × 100（占慢线的百分比）===
// ⚠️ 不是原始 MACD：原始值带价格单位，跨标的排序≈排价格（同 CVD 轴一律归一化）。权重 3 与周线版的 5 不同也不是笔误
//    （日线更吵）—— 取值依据见后端 calc_macd_strength 上方常量块，改前先读。
// 与近期涨幅动能高度相关，已知并接受，别拿冗余度砍它。
const AXIS_D_MACD = { key: "macdStrength", label: "日MACD强弱",
                      format: v => fmtGapVal(v.macdStrength) };

// === 日波动幅度 ＝ ATR(14) / 最新已收盘价 × 100（零消费者保留，复活方式同上）===
// ⚠️ 风险披露轴、不是选股轴：文案里绝不写"低波动会跑赢"（审计显示那只是跌市 beta）。排 atrPct 不排 ATR（ATR 带价格量纲）；
//    恒非负 ⇒ 用 fmtAmpVal、别用带符号的 fmtGapVal。
const AXIS_D_ATR = { key: "atrPct", label: "日波动幅度", format: v => fmtAmpVal(v.atrPct),
                     hint: "平均每天晃价格的百分之几（ATR14）。用来判断仓位和止损宽度，不是用来判断谁会涨" };

// === 日SAR多头根数：这轮日线 SAR 多头已跑了几根已收盘 K（翻多那根记 1）；SAR 空头为 null，升降序都沉底 ===
// 升序头部＝刚翻多，降序头部＝这轮多头跑得最久。标签写「根数」不写「新鲜度」（数字越大越不新鲜，会被反着读）。
// ⚠️ 全站唯一的整数轴，平局是常态 ⇒ getSortedItems 里有显式 tie-break（平局恒按 value 降序、不跟随升降序），别当无用代码删。
const AXIS_D_SARBARS = { key: "sarBullBars", label: "日SAR多头根数",
                         format: v => fmtBarsVal(v.sarBullBars),
                         hint: "日线SAR翻多至今第几根K线（翻多那根算第1根）。升序＝刚翻多最新鲜，降序＝这轮多头跑最久；SAR 空头显示「—」" };

// === 周ADX / 周+DI（同一个 calc_adx_dmi，喂最新已收盘周 K，≥28 根）：周+DI 在役（各轴集周线块、周CVD强弱之后）；周ADX 零消费者保留 ===
// 复活周ADX ＝ 各轴集在 AXIS_W_DIPLUS 前补 AXIS_W_ADX ＋ axesSub 段（别再建一个把两根一起展开的数组：周+DI 会出现两次）。
const AXIS_W_ADX = { key: "weeklyAdx", label: "周ADX", format: v => fmtDmiVal(v.weeklyAdx) };
const AXIS_W_DIPLUS = { key: "weeklyDiPlus", label: "周+DI", format: v => fmtDmiVal(v.weeklyDiPlus),
                        hint: "最新已收盘周K的+DI（DMI 14，对齐TV）：多方方向压力，0–100；上市不足28周显示「—」" };

// === 周MACD强弱 ＝ (PPO线 + 5×PPO柱)/6（权重依据见后端 calc_macd_strength）：零消费者保留，复活方式同上 ===
// 百分比量 ⇒ 用 fmtGapVal（别用不带 % 的 fmtDmiVal）。
const AXIS_W_MACD = { key: "weeklyMacdStrength", label: "周MACD强弱",
                      format: v => fmtGapVal(v.weeklyMacdStrength) };

// === 周 / 月成交额：最新已收盘那一根周 / 月 K 的成交额（与周 / 月涨跌幅榜同 symbol 那行的 volume 同一个数），不是滚动累计 ===
// 各挂本周期的全市场名次徽标。与日成交额高度相关是已知的，别拿冗余度删它们。
const AXIS_W_VOL = { key: "weeklyVolume", label: "周成交额", format: v => fmtWeeklyVolVal(v), badge: weeklyVolRankBadge,
                     hint: "最新已收盘那一根周K的成交额（不是近7天滚动累计），一周只更新一次" };
const AXIS_M_VOL = { key: "monthlyVolume", label: "月成交额", format: v => fmtMonthlyVolVal(v), badge: monthlyVolRankBadge,
                     hint: "最新已收盘那一根月K的成交额（不是近30天滚动累计），一个月只更新一次" };
// 周涨跌幅：最新已收盘那一根周 K 的涨跌幅，与周涨跌幅榜同 symbol 那行的 `value` 是同一个数（后端取同一份缓存字段、别另算）。
// 其余同 AXIS_D_CHGPCT：只挂策略榜、两资产口径不同别统一、hint 只写口径。
const AXIS_W_CHGPCT = { key: "weeklyChangePercent", label: "周涨跌幅", format: v => fmtGapVal(v.weeklyChangePercent),
                        hint: "最新已收盘那一根周K的涨跌幅，一周只更新一次。加密＝K线实体(收−开)/开；A股＝相对上周收盘" };
// 周CVD强弱：同「日CVD强弱」的算法（K 线形态拆买卖量 → EMA14 → 归一化失衡比 ∈ [−1,+1]），喂已收盘周 K；≥15 根周 K 才有值、
// 不够显示「—」并在两个方向都沉底。与周涨跌幅榜排序条上的「周CVD强弱」是同一个数（后端取同一份周线缓存字段）。
// 形态推断、不是真实归边 ⇒ 横截面上主要在读周线级「最近在涨」；hint 只写口径，别写成资金流信号。
const AXIS_W_CVD = { key: "weeklyCvdStrength", label: "周CVD强弱", format: v => fmtCvdVal(v.weeklyCvdStrength),
                     hint: "按周K线形态推断的买卖失衡（约14周平滑），不是真实成交归边；上市不足15周显示「—」" };
// 周线EMA间距 ＝ (周EMA9 − 周EMA21)/周EMA21 × 100，可正可负；零消费者保留，复活方式同上。
// 文案里别断言哪一端更强（审计显示方向性只是跌市 beta）。
const AXIS_W_EMAGAP = { key: "weeklyEmaGap", label: "周线EMA间距", format: v => fmtGapVal(v.weeklyEmaGap) };

// A股 策略榜轴集（休眠件）：与 cryptoStrategySorts 逐根对齐，少「日订单流」（tushare 日线无 taker 归边，数据源硬边界）——
// 另少「日 / 周RSI缺口」（加轴时 A股 已休眠、没同补，见 fetch_ashare.py 复活清单 ⑦）——
// 别并进加密那套、也别硬凑（会成永远全 null 的幽灵轴）；首轴日成交额须与 fetch_ashare.py 行构造的 `value` 一致。
const singleStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_CVD,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                             AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_CVD, AXIS_W_DIPLUS,
                             AXIS_M_VOL, AXIS_MRSI];
// 加密全部策略榜共用的轴集（行统一由后端 `_strategy_row` 产出）。别拆成几份近亲常量：选错一个不报错、只能肉眼发现。
// ⚠️ 首轴即默认排序，必须与后端 `value`（日成交额）一致 ⇒ 别把新轴插到最前。按「日 → 周 → 月」分块，新轴加在所属周期块内、
//    别打乱既有 chip 的相对位置；排序条桌面端换行、移动端横滑，加轴后在 1280 / 768 / 375 三档实测。
// 加轴要后端 `_strategy_row` 先补字段（只加轴＝永远全 null 的幽灵轴），并同批加 axesSub 段；一改就是全部加密策略榜一起变，
//   下方三张涨跌幅榜的轴集照抄本数组 ⇒ 同批改那三份。
// 已移除的轴后端行字段照发 ⇒ audit A 项把它们列成「行上未挂轴的字段」是预期提示，不是失败。
const cryptoStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                             AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_DIPLUS,
                             AXIS_M_VOL, AXIS_MRSI];

// === 三张涨跌幅榜的轴集：与策略榜对齐 ===
// 行由后端 `_strategy_row` ＋ 本周期 `value` / `open` / `close` 产出 ⇒ 通用 key 与策略榜同义（日线值），周 / 月线值带前缀。
// 轴集 ＝ 首轴本周期涨跌幅 ＋ 照抄 cryptoStrategySorts 的顺序、删掉与首轴重复的那根（日线榜「日涨跌幅」、周线榜「周涨跌幅」）
//   ＋ 该周期独有的轴补在所属周期块末尾（周订单流；月CVD强弱、月订单流 —— 策略榜没有，后端也只在对应涨跌幅榜发字段）。
// ⚠️ 写成显式数组、别改成运行时从 cryptoStrategySorts 裁剪：audit A 项靠正则静态抽取数组里的 AXIS_* 常量 ⇒ 加删策略榜的轴要这三份同批改。
// ⚠️ 首轴 key 必须是 `value`，别"语义化"改成 changePercent：renderTable 的红绿上色写死 `sortField === "value"`，
//    另需 tab key 在 CHANGE_PCT_TABS 里，缺一红绿静默失效。
const AXIS_D_CHG = { key: "value", label: "日涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_W_CHG = { key: "value", label: "周涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_M_CHG = { key: "value", label: "月涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_W_TAKER = { key: "weeklyTakerStrength", label: "周订单流", format: v => fmtTakerVal(v.weeklyTakerStrength),
                       hint: "真实主动成交（币安taker数据）：周线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，不是买卖信号" };
const AXIS_M_CVD = { key: "monthlyCvdStrength", label: "月CVD强弱", format: v => fmtCvdVal(v.monthlyCvdStrength),
                     hint: "按月K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「月订单流」" };
const AXIS_M_TAKER = { key: "monthlyTakerStrength", label: "月订单流", format: v => fmtTakerVal(v.monthlyTakerStrength),
                       hint: "真实主动成交（币安taker数据）：月线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，不是买卖信号" };
const dailyChangeSorts = [AXIS_D_CHG, AXIS_D_VOL, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                          ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                          AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_DIPLUS,
                          AXIS_M_VOL, AXIS_MRSI];
const weeklyChangeSorts = [AXIS_W_CHG, AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                           ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                           AXIS_W_VOL, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_DIPLUS, AXIS_W_TAKER,
                           AXIS_M_VOL, AXIS_MRSI];
const monthlyChangeSorts = [AXIS_M_CHG, AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                            ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                            AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_DIPLUS,
                            AXIS_M_VOL, AXIS_MRSI, AXIS_M_CVD, AXIS_M_TAKER];
// A股 涨跌幅榜轴集工厂（休眠件）：仍是旧形 —— 通用 key 装本周期的值、比加密少「订单流」（tushare 日线无归边字段）。
// 复活 A股 时要么照加密这样对齐（后端 fetch_ashare.py 行构造一起改），要么保持旧形，别混用。
// ⚠️ 写成独立工厂、别加开关：audit A 项靠正则静态抽取工厂体里的 key，看不懂运行时裁剪。
const stockChangeSorts = (tf, rsiLabel) => [
    { key: "value",       label: `${tf}涨跌幅`,  format: v => fmtGapVal(v.value) },
    { key: "volume",      label: `${tf}成交额`,  format: v => fmtVolVal(v) },
    { key: "rsi",         label: rsiLabel,       format: v => fmtRsiVal(v.rsi) },
    { key: "cvdStrength", label: `${tf}CVD强弱`, format: v => fmtCvdVal(v.cvdStrength),
      hint: "按K线形态推断的买卖失衡，不是真实成交归边（tushare 日线无逐笔归边数据）" },
];
const ashareDailyChangeSorts = stockChangeSorts("日", "日线RSI");
const ashareWeeklyChangeSorts = stockChangeSorts("周", "周线RSI");
const ashareMonthlyChangeSorts = stockChangeSorts("月", "月线RSI");

// 每个 tab 一条 { sorts, subFormat }。按 key 取的平查找表（顺序无意义）；导航 / 显示名 / desc / rail 顺序在 TAB_GROUPS，
// 增删榜两处都要改。
const TABS_CONFIG = {
    // === 加密涨跌幅榜（无筛选、全市场入榜）===
    // ⚠️ 三处缺一不报错但会静默坏：① sorts 首轴 key ＝ `value`；② tab key 进 CHANGE_PCT_TABS（行情榜 / 策略榜的唯一分界，
    //    缺了值列恒不上红绿）；③ subFormat 的 volLabel 写「日成交额」（三张榜行里的 volume 都是日成交额；axesSub 不会自己反查成交额标签）。
    dailyChange: { sorts: dailyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", cryptoPriceCtx) },
    weeklyChange: { sorts: weeklyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", cryptoPriceCtx) },
    monthlyChange: { sorts: monthlyChangeSorts, subFormat: (v, sf) => changeSub(v, sf, "日成交额", cryptoPriceCtx) },

    // === 加密策略榜：全部共用 cryptoStrategySorts、副行 axesSub(…, "日成交额")，行由后端 `_strategy_row` 产出，各榜只差筛选条件 ===
    // 轴是描述值、不是判据镜像：改判据不动轴，也别按判据增删轴。⚠️ 尤其别为布尔判据（SAR 方向 / 连阳 / 扩张 / RSI 门槛 /
    //    哪一支命中）加轴 —— 布尔值排不了序、后端也不发 ⇒ 幽灵轴。
    // 改判据时 key 不动 ⇒ 不少 key 已名不副实，以 TAB_GROUPS 的 name 为准。新 key 别以后端 RETIRED_KEY_PREFIXES 里的前缀开头
    // （如 weeklyDaily），否则后端自愈会静默删掉整张榜。
    // 已移除的榜：判据存档在后端 build_rankings 原位；复活 ＝ 这里加回一行 + TAB_GROUPS 加回条目 + 后端重建列表。
    monthlySarFirstBar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    weeklySarSecondBar: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    weeklyEma921Expansion: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    monthlyVolRising: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    // 橱窗兼默认落地榜：改这个 key 要连动 TEASER_TAB 等前后端多处（见 TEASER_TAB）。
    monthlySarBearish: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    monthlyFourToSixBull: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    dailySarBearFirstDivergence: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    weeklyBreakBearSarFirstBull: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    monthlySecondLowDailyEmaSarBull: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    dailyEmaSarBullFirstDivergence: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    dailyEmaCvdSarTwoBreakBearDot: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    weeklyAdxDiRising: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // A股 / 美股 / ETF 的配置已随资产整族退役删除（复活清单见 fetch_ashare.py / fetch_us.py 顶部；后端 RETIRED_KEY_PREFIXES
    // 不拿掉对应前缀，数据照跑也进不了站）。A股 用到的轴集 / 价格上下文常量保留为休眠件。
};

// 分组导航：rail、周期角标、表格上方「资产 · 周期 · 策略」标识栏与说明行的唯一数据源，数组顺序 ＝ rail 顺序（TAB_META 由它派生）。
// 增删榜两处都要配：这里（name / desc，desc 必填）＋ TABS_CONFIG（排序轴集、副行格式）。
// ⚠️ 条目保持 `{ key: …, name: …` 写在同一行：audit_consistency.py 与 make_og.py 用正则在全文（含注释）里数榜。
// 组上的 tf 只是 tab 没写 tf 时的兜底（t.tf || g.tf）；tf 取值要在 TF_SHORT 里有缩写（跨周期写组合值如「日线/周线」），
//   查不到时 rail 徽标静默消失。full ＝ 标识栏用的完整名，缺省用 name。
// 命名：name 写「怎么算」，条件用 ＋ / × 连接（都表示同时满足，并集写「或」）；根数用汉字（四连阳、前四根），
//   指标参数照写（9/21、RSI≥70）；「扩张」专指间距在变大（只是排好了写「排列」），「两线扩张」专指 9/21 ∪ 9/26 并集
//   （只看 9/21 写「9/21扩张」）。desc 用白话讲这张榜在找什么行情。
// key：改判据时 key 不动、只改 name / desc（不少 key 已名不副实，别按 key 推判据）；新榜的判据与某个退役 key
//   逐字相同才复用它（先确认公开 JSON / paidMeta / 付费镜像里没有残留），否则开新 key。

const TAB_GROUPS = [
    {
        // 本组横跨日 / 周 / 月 ⇒ tf 挂在每个 tab 上；name 只写周期（rail 很窄），full 统一写「涨跌幅」（标识栏里周期已由 tf 表达）。
        // 行情榜 / 策略榜之分只看 CHANGE_PCT_TABS、不看分组 ⇒ 新增涨跌幅榜要同时加进去。
        label: "加密行情", asset: "加密",
        tabs: [
            { key: "dailyChange", name: "日线", full: "涨跌幅", tf: "日线",
              desc: "最新已收盘日 K 的涨跌幅（当根收盘 ÷ 当根开盘，币安日 K 每天 00:00 UTC 收盘，所以看的是昨天那一整根）。没有任何筛选条件——全部加密 USDT 永续合约都在里面，谁涨谁跌一眼看全，是先看清全市场在发生什么、再去策略榜里筛的入口。默认按涨幅从高到低；排序条和策略榜是同一套（日线、周线、月线各轴，按钮上都写明了周期），比如切成日成交额看涨得多是不是也有人接、日线RSI 看是不是已经超买、日CVD强弱与日订单流看近期买卖力量在全市场里谁相对更强。上市当天、还没有一根已收盘日 K 的新合约不入榜；上市不足约 23 天的合约涨跌幅和日成交额照常显示，但 RSI、CVD强弱、订单流、ADX、MACD 这类要暖机的轴会显示「—」，排序时自动沉底。" },
            { key: "weeklyChange", name: "周线", full: "涨跌幅", tf: "周线",
              desc: "最新已收盘周 K 的涨跌幅（周 K 每周一 00:00 UTC 收盘，所以整周之内这张榜的数值是不变的，下周一才换一批）。没有任何筛选条件，全部加密 USDT 永续合约。它比日线那张钝得多，正好用来分辨「这几天的涨只是反弹」还是「整周都在往上走」。排序条和策略榜是同一套，日线、周线、月线各轴都在、按钮上写明了周期：「周线RSI」「周CVD强弱」「周+DI」「周订单流」看的是那一根周 K，「日线RSI」「日成交额」这些是最新那根日 K 的值；「周成交额」是那一根周 K 的成交额，不是 7 天滚动也不是日均。只要有 1 根已收盘周 K 就入榜，所以刚上市一两周的新合约也在；但它们的周线 RSI 要 16 根周 K、周+DI 要 28 根才算得出来，不够的显示「—」并在排序时沉底。" },
            { key: "monthlyChange", name: "月线", full: "涨跌幅", tf: "月线",
              desc: "最新已收盘月 K 的涨跌幅（月 K 每月 1 号 00:00 UTC 收盘，所以整个月之内这张榜是不动的——那是正确行为，不是数据卡住了）。没有任何筛选条件，全部加密 USDT 永续合约。这是站内周期最长的一张行情榜，看的是「这个月谁真的走出来了」，短线噪音基本被抹平。排序条和策略榜是同一套，日线、周线、月线各轴都在、按钮上写明了周期：「月线RSI」「月CVD强弱」「月订单流」「月成交额」看的是那一根月 K，其余是日线、周线的值。只要有 1 根已收盘月 K 就入榜（上市当月的新合约还没有，暂不入榜）；月线 RSI 需要 16 根月 K、约一年半才算得出来，所以有四成左右的合约月线RSI、月CVD强弱、月订单流这几根轴会显示「—」并在排序时沉底——这本身也是一种信息：显示「—」的就是还没走完一轮周期的品种。" },
        ],
    },
    {
        // 各榜判据、结构性关系、型别与自检点以 CLAUDE.md 为准，这里不维护；已移除榜的 name / desc 查 git 历史，
        //   判据存档在后端 build_rankings。
        label: "加密策略", asset: "加密", tf: "月线",
        tabs: [
            // 本组第一个 ＝ 橱窗 TEASER_TAB ＝ 默认落地榜，三者必须统一：挪位置或换 key 要连动前后端 TEASER_TAB、
            //   currentTab、lastTabByAsset、switchAsset 兜底与 index.html FAQ「哪些免费」里的榜名。
            { key: "monthlySarBearish", name: "月线突破SAR空头第二根低点", tf: "月线",
              desc: "最新已收盘那根月线的收盘价，站上了最近一轮月线 SAR 空头段里第 2 根 K 线的最低价。拆开说：先在月线上找到最近一轮 SAR 处在空头（圆点在 K 线上方）的那一段，取这一段第 2 根月 K 的最低价当参照线，再看最新已收盘那根月线的收盘价有没有高过这条线。只有这一个条件。有四处要先说清楚。第一，「最近一轮」不要求那一段已经结束：如果最新这根月线的 SAR 还在空头侧，参照的就是正在进行的这一轮下跌——收盘价站上这轮下跌第 2 根的低点，是抢在 SAR 翻多之前的领先信号，改判据当天 120 个命中里有 94 个正是这一类；如果 SAR 已经翻多，参照的就是刚刚结束的那一段。第二，本榜完全不问当前 SAR 是多头还是空头（这一点和它上一版判据正相反，上一版只问 SAR 方向）。第三，有一个退化的情形：当那个参照根恰好就是最新已收盘的这根月线时，「收盘价高于自己的最低价」按 K 线定义必然成立，这类标的会自动命中（改判据当天 120 个里有 18 个属于此类）——这是刻意保留的，不是漏做。第四，参照价取的是那一段第 2 根的最低价，不是收盘价、也不是第 1 根。命中数：改判据当天 120 个（上一版是 469 个、占全市场九成，那是一张背景名单，这一版不是）。回放过去 48 个月：中位 96 个、最少的一个月 14 个、最多 184 个，48 个月里一个月都没有空过；占当月可判标的中位约27.6%，也就是四分之一上下。本榜是免费橱窗榜：没有通行证也能看到这张榜里排在第一位的那个标的（按日成交额排序的第一名）——成员一个月才换一次，但排序看的是每天的成交额，所以这个第一名在月内也可能换人。这是一张门槛清单：参照线只在 SAR 换段时才会变，而收盘价每个月都在动，所以成员会随收盘价在那条线上下进出——上个月的成员这个月还在的比例中位数 84%，已经结束的在榜段中位只有 2 个月，最长的一段39 个月。也要如实说一句：它不是择时信号。回放里成员下个月收盘更高的比例是 37.0%（3994 个样本），当月可判全体是37.4%，两者几乎没有差别——它标记的是「价格已经从这轮月线级下跌里抬起头」这个事实，而不是预测下个月。它和「月线SAR多头首根＋收盘价反包所有空头SAR」那张榜大多数时候会重叠（那张要求收盘价越过整段空头 SAR 的圆点，位置比本榜这条线更高，站上更高的线自然也站上了这条），但不是必然：如果那一轮空头段只有 1 根月 K，本榜就没有「第 2 根」可参照、那个标的不会出现在本榜上——改判据当天就有这样一个。另有一张「月线突破SAR空头第二根低点＋成交量递增或缩量阳K」是本榜的子集——在本榜这一条之上再要求这个月放量、或者缩量收阳，它的每一个标的都必然在本榜上，回放里每个月大约占本榜的六成多。「月线突破SAR空头第二根低点＋至少二连阳」则更窄——在本榜这一条之上再要求这个月和上个月都收阳，它的每一个标的也必然在本榜上，回放里每个月中位约占本榜的一成半。日线那张「日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点」的每一个标的同样必然在本榜上——它的月线那一条和本榜一字不差，只是再要求这一天日线 SAR 刚刚由多翻空、而且圆点高过前一轮空头首根的圆点，所以每天通常只有零到几个。「月线突破SAR空头第二根低点＋日线9/21扩张＋SAR多头」也一样：月线那一条和本榜一字不差，再要求最新一根日线 EMA9/21 正在扩张、日线 SAR 在多头一侧，它的每一个标的也必然在本榜上。门槛：算 SAR 至少要 3 根已收盘月 K；另外那一轮空头段必须有第 2 根，段里只有 1 根、或者可用历史里一次空头都没出现过的标的不入榜（改判据当天有 16 个因此不在）。另外月线数据每月 1 号 00:00（UTC）新月线收盘后才刷新一次，同一个月之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线、月线各轴都不参与筛选，用来在这批标的里再分强弱。范围是全部加密 USDT 永续合约。" },
            { key: "dailyEmaCvdSarTwoBreakBearDot", name: "日线9/21扩张＋SAR多头前两根＋突破最近一轮空头最后SAR点＋CVD递增", tf: "日线",
              desc: "四个条件都看最新已收盘的那根日线：一是 EMA9 在 EMA21 上方、而且两条均线的间距比前一天更大（结构正在张开）；二是它正好是这一轮 Parabolic SAR 多头的第 1 根或第 2 根——SAR 圆点刚翻到价格下方不久；三是它的收盘价，高过了刚结束那一轮 SAR 空头段里最后一根 K 线的圆点；四是 CVD 比前一天走强。拆开说第三条：SAR 空头期间圆点在价格上方、一路往下压，那一段最后一根的圆点是整段里最低的一个，也是价格翻多之前最后一道压制线；本榜要求收盘价已经站上它，不是盘中碰一下就算。有四处要先说清楚。第一，「前两根」是两个「恰好」旗标的并集——翻多当天是第 1 根、第二天是第 2 根，到第 3 根就掉出，所以同一个标的最多连着两天出现。第二，比较是严格大于，一样高不算；参照圆点取不到（不足 3 根、窗口内没出现过空头）的标的不入榜。第三，CVD 用的是站内一贯口径：当根为正、而且比前一天大，不是单纯看方向。第四，扩张是两半合起来才算：光是间距在变大还不够，EMA9 必须已经站到 EMA21 上方。和站内其他榜的关系：和「日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点」一定不会同时出现（那张要求最新一根日线刚翻到空头）；和「日线9/21扩张＋SAR多头首根＋最近一轮空头首根SAR点高于前一轮」都要 9/21 扩张、也都收翻多首根，但那张看的是两轮空头首根圆点谁更高、本榜看的是收盘价有没有站上上一轮的最后一个圆点，还多一条 CVD，两张互不包含（上线这一天 84 个里有 17 个同时在那张上）。命中数：回放过去 360 天，每天中位 2 个、最多 104 个，有 48 天一个都没有（约七分之一的天数）；上线这一天是 84 个，是全市场刚集中翻多之后的罕见高位，别当常态。四条里最卡人的是后两条：只看前两条每天中位 6 个，加上「站上最后一个圆点」剩 3 个，再加 CVD 剩 2 个。也要如实说一句：它不是买入信号。回放里成员次日收涨的比例是 42.3%（1571 个样本），全市场 45.9%；5 天后收盘比入榜那天更高的比例 37.2%，全市场 42.7%——都低于大盘。它更适合当成「刚翻多、而且已经站上上一轮压制线、资金同步转强」的观察名单，而不是追进去的理由。表格里的各轴都不参与筛选，用来在这批标的里再分强弱。日线每天 00:00（UTC）收盘后才换一批，同一天之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。上市不足 23 天的新合约日线数据不够，不入榜。范围是全部加密 USDT 永续合约。" },
            { key: "dailyEmaSarBullFirstDivergence", name: "日线9/21扩张＋SAR多头首根＋最近一轮空头首根SAR点高于前一轮", tf: "日线",
              desc: "三个条件都看最新已收盘的那根日线：一是 EMA9 在 EMA21 上方、而且两条均线的间距比前一天更大（结构正在张开）；二是它正好是这一轮 Parabolic SAR 多头的首根——SAR 圆点刚刚在这一天由价格上方翻到下方，前一天还在空头一侧；三是翻多之前刚刚结束的那一轮 SAR 空头，它首根日线上的 SAR 圆点，比再前一轮空头首根的 SAR 圆点更高。拆开说第三条：SAR 由多翻空的那一根，圆点会直接跳到刚结束那一波上涨的最高价附近，所以「空头首根的圆点」基本就是那一波上涨的顶；拿刚结束这一轮空头的首根圆点和再前一轮比，比的是这次回调之前的波段高点，有没有高过再前一个波段高点。三条合起来找的是：上一波已经创出更高的高点，回调一段之后，日线 SAR 重新翻多、均线也重新张开的那一天。它和「日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点」比的是同一对圆点：那张在这一轮空头开始的那天比，本榜等这一轮空头结束、SAR 重新翻多的那天再比，而且不看月线。有四处要先说清楚。第一，两个「空头首根」都必须是真正由多翻空的那一根——日线只取最近约 500 根，最早那段空头的开头可能不在窗口里，这种没有可靠参照的标的不入榜。第二，两个圆点的比较是严格大于，一样高不算。第三，扩张是两半合起来才算：光是间距在变大还不够，EMA9 必须已经站到 EMA21 上方。第四，除了 EMA9/21 和日线 SAR，本榜不看成交量、RSI 和其他指标。和站内其他榜的关系：和「日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点」一定不会同时出现（那张要求最新一根日线的 SAR 刚翻到空头）；和「月线突破SAR空头第二根低点＋日线9/21扩张＋SAR多头」没有包含关系——那张不要求刚翻多、本榜不看月线，但本榜里月线那一条也满足的标的，一定也在那张上（上线这一天 52 个里有 7 个）。这是一张事件清单：翻多当天出现，第二天它要么成了多头第二根、要么又翻回空头，都会离开本榜，同一个标的不会连着两天出现；表格里的「日SAR多头根数」在本榜上一定是 1。次日去向：回放里约 98% 第二天仍在多头（成了第二根），约 2% 第二天就翻回空头；这一轮多头从翻多那天算起维持的天数中位 9 天，约一成在三天之内结束，四成多能撑到十天以上。命中数很少，空榜很常见：回放过去 360 天，每天中位 2 个、最多 52 个，有 72 天一个都没有（约五分之一的天数）；只看前两条时每天中位 3 个、39 天空榜，加上第三条大约留下六成。上线这一天（最新已收盘的是 2026 年 9 月 18 日那根日线）是 52 个，正是这 360 天里最多的一天——那天全市场有 125 个标的日线 SAR 同时翻多，是普涨后的集中翻多，别当成常态。也要如实说一句：它不是买入信号，回放里略跑输大盘。成员次日收涨的比例是 41.1%（1094 个样本），全市场 45.8%；5 天后收盘比入榜那天更高的比例 39.9%，全市场 42.6%。只看前两条时是 42.1% 和 39.4%，所有日线 SAR 刚翻多的标的是 43.6% 和 41.7%——加上第三条并没有让它更会挑。它更适合当成「前高在抬高、回调后刚转多」的观察名单，而不是追进去的理由。日线每天 00:00（UTC）收盘后才换一批，同一天之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的各轴都不参与筛选，用来在这批标的里再分强弱。上市不足 23 天的新合约日线数据不够，不入榜。范围是全部加密 USDT 永续合约。" },
            { key: "dailySarBearFirstDivergence", name: "日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点", tf: "日线/月线",
              desc: "三个条件：前两个落在最新已收盘的那根日线上，第三个看最新已收盘的那根月线。一是这根日线是这一轮 Parabolic SAR 空头的首根——SAR 圆点刚刚在这一天由价格下方翻到上方，前一天还在多头一侧；二是这根日线上的 SAR 圆点，比前一轮空头趋势首根那根日线上的 SAR 圆点更高；三是最新已收盘那根月线的收盘价，站上了最近一轮月线 SAR 空头段里第 2 根 K 线的最低价（和「月线突破SAR空头第二根低点」那张榜的条件一字不差）。拆开说第二条：SAR 由多翻空的那一根，圆点会直接跳到刚结束那一波上涨的最高价附近，所以「空头首根的圆点」基本就是这一波上涨的顶；拿它和前一轮空头首根的圆点比，比的是这一波的顶有没有高过上一波的顶——这一波创了更高的高点、日线趋势却翻了空，也就是这里说的背离。再拆开说第三条：在月线上找到最近一轮 SAR 处在空头（圆点在 K 线上方）的那一段，取这一段第 2 根月 K 的最低价当参照线，最新已收盘月线的收盘价高过这条线才算——也就是只在月线级别已经从最近一轮下跌里抬起头的标的里找日线上的这种背离；「最近一轮」不要求那一段已经结束，段里只有 1 根、或者可用历史里一次空头都没出现过的标的没有参照线，不入榜。有四处要先说清楚。第一，「前一轮空头」是从这根日线往回数、越过刚结束的那段多头之后遇到的那一段日线空头，取它的第一根；那一根必须是真正由多翻空的——日线只取最近约 500 根，最早那段空头的开头可能不在窗口里，这种没有可靠参照的标的不入榜。第二，两个圆点的比较是严格大于，一样高不算。第三，除了日线 SAR 和月线收盘价，本榜不看成交量和其他指标。第四，本榜的每一个标的必然都在「月线突破SAR空头第二根低点」上（第三条和那张一字不差），反过来差得很远：那张是月线门槛清单、成员常年几十到一两百个，本榜只是其中恰好这一天日线翻空、SAR 顶又高过上一轮的那几个。和「月线突破SAR空头第二根低点＋日线9/21扩张＋SAR多头」「日线9/21扩张＋SAR多头首根＋最近一轮空头首根SAR点高于前一轮」正好相反：那两张都要求最新一根日线的 SAR 在多头一侧，本榜要求刚翻到空头，同一个标的不会同时出现在本榜和那两张上（最后这张的第三条，就是本榜前两条在那一轮空头开始那天成立——它等这一轮空头结束、SAR 重新翻多那天才出现）；表格里的「日SAR多头根数」在本榜上一定显示「—」。这是一张事件清单：翻空当天出现，第二天要么继续空头成了第二根、要么翻回多头，都会离开本榜，同一个标的不会连着两天出现；月线那一条每月 1 号 00:00（UTC）新月线收盘后才换一次，同一个月之内能入选的范围不变。命中数很少，空榜很常见：回放过去 360 天，每天中位 1 个、最多 31 个，有 94 天一个都没有（约四分之一的天数）；只看前两条时每天中位 4 个、19 天空榜，加上月线这一条后大约只留下四分之一；改成现在这个判据时（最新已收盘的是 2026 年 9 月 13 日那根日线）从 12 个变成 3 个。次日去向：约 97% 第二天仍在空头（成了第二根），约 3% 翻回多头。也要如实说一句：加上月线这一条并没有让它更会挑。回放里本榜成员次日收涨的比例 46.2%（691 个样本），只看前两条时 46.5%，同期全市场 45.3%；5 天后收涨的比例 43.7%，只看前两条时 45.3%，全市场 42.1%——差距都很小，它不是做空或做多信号。表格里的各轴都不参与筛选，用来在这批标的里再分强弱。上市不足 23 天的新合约日线数据不够、已收盘月线不足 3 根的算不出月线参照线，都不入榜；日线数据每天 00:00（UTC）收盘后才换一批，同一天之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。范围是全部加密 USDT 永续合约。" },
            { key: "monthlySarFirstBar", name: "月线SAR多头首根＋收盘价反包所有空头SAR", tf: "月线",
              desc: "两个条件都看最新已收盘的那根月线：① 它正好是这一轮 Parabolic SAR 多头趋势的首根——SAR 圆点刚刚在这个月由价格上方翻到下方，而上个月还停在空头一侧；② 这根月线的收盘价，站在了刚刚结束的那一轮空头趋势里所有 SAR 圆点的上方，也就是把整轮下跌期间的每一个空头圆点都「反包」了。第二条比光翻多严格得多：空头趋势里 SAR 圆点是一路往下移的，最高的那个就是这轮下跌开始时的第一个圆点；SAR 翻多只需要价格刺破最近、也是最低的那个圆点，而本榜要求收盘价在一个月之内站上整轮下跌起点的那个圆点——相当于按月计的整段下行轨道被一根 K 线全部收复，找的是强到直接把下跌结构吞掉的月线反转，而不是跌久了之后的一次翻多。回放过去四年，月线翻多的标的里只有大约五分之一能同时做到反包。月线是全站最大的周期，同一个标的平均要好几年才轮到一次月线翻多，再叠上反包这一条，命中数天然很小：回放过去 48 个月，每月中位只有 1 个、最多 11 个，接近四成的月份一个都没有——遇到空榜是正常的。代价也要说清楚：月线信号天然滞后于真正的底部，能做到反包的往往已经离底部很远了。这是一次性的事件清单不是持续清单——同一个标的只在翻多的那个月出现，下个月它就成了第二根、不再在榜上，所以相邻两个月的名单不会有重叠。本榜只看 SAR 与收盘价，完全不看均线与资金。另外月线数据每月 1 号（UTC）新月线收盘后才刷新一次，整个月之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线各轴都不参与筛选，用来在这批标的里再分强弱。上市不足 3 个月的新合约看不出「翻多的前一个月是空头」，不入榜；日线数据不足 23 天的，日线那几轴会显示「—」。范围是全部加密 USDT 永续合约。" },
            { key: "weeklyEma921Expansion", name: "周线首次9/21扩张", tf: "周线",
              desc: "只看最新已收盘的两根周线：最新这根是 EMA9/21 扩张，上一根不是——也就是这一周才刚开始扩张。「扩张」是两半合起来才算：EMA9 在 EMA21 上方，而且两条均线的间距比上一周更大；光是间距在变大还不够，一个标的的间距从 −6.2% 收窄到 −5.9%，数字确实变大了，但那时 EMA9 还在下面，不算扩张。「上一根不是」包括两种情况：上一周 EMA9 还在 EMA21 下方，或者已经在上方、但间距没有变大。这是一张事件清单不是状态清单：这周上榜的标的，到下周它的上一根就成了扩张，所以必然离开本榜，同一个标的不会连着两周出现；已经连续扩张两周以上的也都不在这里。命中数不多，遇到空榜也正常：回放过去 60 周，每周中位 6 到 7 个、最多 36 个，有 1 周一个都没有；改判据这一周是 23 个。次周去向：回放里约六成成员下一周继续扩张（成了第二根），九成以上下一周 EMA9 仍在 EMA21 上方。但它不是买入信号：过去 60 周本榜成员下一周收涨的比例约 34%，同期全市场约 40.5%；拉长到 104 周是 43% 对 42%，差不多。另外周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。需要至少 23 根已收盘周 K（约五个多月）才判断得了上一周是不是扩张，所以上市不足半年的新合约不入榜。表格里的日线各轴不参与筛选，用来在这批标的里再看日线强弱。范围是全部加密 USDT 永续合约。" },
            { key: "monthlyVolRising", name: "月线突破SAR空头第二根低点＋成交量递增或缩量阳K", tf: "月线",
              desc: "两个条件都看最新已收盘的那根月线：一是它的收盘价站上了最近一轮月线 SAR 空头段里第 2 根 K 线的最低价（和「月线突破SAR空头第二根低点」那张榜的条件一字不差）；二是在此基础上，这个月要么放量——成交量比上个月大，这根月线收阳收阴都算，要么缩量收阳——成交量没有比上个月大（缩量，或者正好持平），但这根月线收了阳线。换句话说：先要求价格已经从最近一轮月线下跌里抬起头，再把「量没放大、又没收阳」的那一类挡在外面。有三处先说清楚。第一，第一条的细节和那张榜完全相同：「最近一轮」不要求那一段已经结束，SAR 还在空头侧时参照的就是正在进行的这一轮下跌；参照价取的是那一段第 2 根的最低价；段里只有 1 根、或者可用历史里一次空头都没出现过的标的不入榜。第二，成交量按标的数量计（比如 BTC 合约就是这个月成交了多少个 BTC），不是按 USDT 计的成交额；「放量」只比最新这一个月和上一个月，不要求连续好几个月都在放大；「阳线」看的是这根月线自己的收盘高于开盘，不是和上个月的收盘比。第三，本榜的每一个标的必然都在「月线突破SAR空头第二根低点」上——那张只要第一条，本榜在它上面再加一道量能门槛。回放过去 48 个月，本榜每个月大约是那张榜的六成多（中位 64%，最少的月份不到两成、最多的月份全员都在）；本榜改成现在这个判据时（最新已收盘的是 2026 年 8 月）是 92 个，占那张榜 120 个里的 77%——其中放量的 63 个（里面 16 个是放量收阴），缩量收阳的 29 个。反过来，「月线突破SAR空头第二根低点＋至少二连阳」那张的每一个标的也必然在本榜上：它的第一条和本榜一字不差，而连着两个月收阳，最新这根自然是阳线，放量或者没放量都满足本榜的第二条；回放里它每个月中位约占本榜的四分之一。命中数：回放过去 48 个月，每月中位 50 个左右，最少 5 个、最多 182 个，没有一个月是空的。它换得比那张榜快：上个月的成员这个月还在的比例中位数约 44%（那张榜约 84%），已经结束的在榜段中位只有 1 个月、最长 9 个月——量能这一条每个月都重新判一次。也要如实说一句：加上量能这一条并没有让它更会挑。回放里成员下个月收盘更高的比例是 35.9%（2543 个样本），当月可判全体是 37.3%，只看第一条的那张榜是 36.9%；按每个月和当月全市场的中位数比，成员下个月跑赢的比例约 50.9%，也比那张榜（约 52%）略低——它更适合当成「价格已经抬头、这个月交易也跟着热起来」的观察名单，而不是择时信号。月线数据每月 1 号 00:00（UTC）新月线收盘后才刷新一次，同一个月之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线、月线各轴都不参与筛选，用来在这批标的里再分强弱；表格里有「月成交额」这一列（这个月成交了多少 USDT，按它排序时左边还标着全市场排第几），但没有「月成交量增幅」这一列，排不出「放大了多少」。门槛：算 SAR 至少要 3 根已收盘月 K，所以上市不足三个月的新合约不入榜。范围是全部加密 USDT 永续合约。" },
            { key: "monthlyFourToSixBull", name: "月线突破SAR空头第二根低点＋至少二连阳", tf: "月线",
              desc: "两个条件都看最新已收盘的那根月线：一是它的收盘价站上了最近一轮月线 SAR 空头段里第 2 根 K 线的最低价（和「月线突破SAR空头第二根低点」那张榜的条件一字不差），二是它至少是连续第 2 根阳线——这个月和上个月都收阳，连涨三个月、十个月的也都算，不设上限。先拆开说第一条：在月线上找到最近一轮 SAR 处在空头（圆点在 K 线上方）的那一段，取这一段第 2 根月 K 的最低价当参照线，再看最新已收盘那根月线的收盘价有没有高过这条线。第二条把「价格只是刚好蹭到线上方」和「按月计的上涨已经连起来」分开：站上了参照线、但这个月或上个月收了阴的，不在本榜上。有四处要先说清楚。第一，「最近一轮」不要求那一段已经结束：如果最新这根月线的 SAR 还在空头侧，参照的就是正在进行的这一轮下跌——收盘价站上这轮下跌第 2 根的低点、又已经连涨两个月，是抢在 SAR 翻多之前的领先信号；如果 SAR 已经翻多，参照的就是刚刚结束的那一段。本榜完全不问当前 SAR 是多头还是空头。第二，有一个退化的情形：当那个参照根恰好就是最新已收盘的这根月线时，收了阳线的 K 线收盘价必然高于自己的最低价，这类标的只要连涨两个月就一定命中——这是刻意保留的，不是漏做。第三，参照价取的是那一段第 2 根的最低价，不是收盘价、也不是第 1 根；段里只有 1 根、或者可用历史里一次空头都没出现过的标的没有参照线，不入榜。第四，连阳这一条是至少不是恰好，这和本榜上一版正相反：上一版只数连阳根数，要求恰好是第 2 根、或恰好是第 4 到第 8 根（刻意不要第 3 根），完全不看价格位置；现在正好连涨三个月、九个月以上的都可以在榜上，只是连涨、却还没站上参照线的则不在。和另外两张月线榜的关系：本榜的每一个标的必然同时在「月线突破SAR空头第二根低点」和「月线突破SAR空头第二根低点＋成交量递增或缩量阳K」上——第一条和它们一字不差，而连着两个月收阳，最新这根自然是阳线，放量的满足那张的放量一支，没放量的满足缩量收阳一支。回放过去 48 个月，本榜每个月中位约是后一张的四分之一、前一张的一成半。命中数：改成现在这个判据时（最新已收盘的是 2026 年 8 月）是 38 个——连涨两个月的 30 个、三个月的 6 个、五个月的 2 个；上一版同一根月线是 139 个，两版重叠 32 个。回放过去 48 个月，每月中位 12 个、最多 75 个，有 2 个月一个都没有；成员的连阳根数以两个月最多、三个月次之，连涨七个月的很少，八个月以上的这 48 个月里一次都没出现过。这是一张门槛清单：成员随收盘价在参照线上下进出，连阳一断也会离开——上个月的成员这个月还在的比例中位数约 46%（上一版只有 3% 左右），已经结束的在榜段中位只有 1 个月、最长 6 个月。也要如实说一句：它不是择时信号。回放里成员下个月收盘更高的比例是 42.6%（767 个样本），当月可判全体是 37.3%，上一版是 39.1%（1147 个样本）；按每个月和当月全市场的中位数比，成员下个月跑赢的比例约 54.5%，上一版约 51%——比上一版略好，但样本只有七百多个，撑不起一个结论。门槛：算 SAR 至少要 3 根已收盘月 K，所以上市不足三个月的新合约不入榜；日线数据不足 23 天的，日线那几轴会显示「—」。另外月线数据每月 1 号 00:00（UTC）新月线收盘后才刷新一次，同一个月之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线、月线各轴都不参与筛选，用来在这批标的里再分强弱。范围是全部加密 USDT 永续合约。" },
            { key: "weeklyBreakBearSarFirstBull", name: "周线突破SAR空头最新阳线收盘价＋SAR多头", tf: "周线",
              desc: "两个条件都看最新已收盘的那根周线：一是它的收盘价，高过了最近一轮周线 SAR 空头段里最新一根阳线的收盘价；二是这根周线的 Parabolic SAR 站在多头一侧（圆点在价格下方，不管已经多头了几周）。拆开说第一条：因为第二条要求 SAR 已经翻到多头，「最近一轮空头段」一定是刚刚结束的那一段下跌——在这一段里从最后一根往前找，遇到的第一根收阳的周 K（收盘高于开盘，也就是这轮下跌里最后一次反弹），把它的收盘价当参照线，再看最新已收盘那根周线的收盘价有没有高过这条线。两条合起来找的是：周线趋势已经翻多、价格也站上了上一轮下跌里最后一次反弹收盘价的标的。有四处要先说清楚。第一，参照线在整个多头期间不会动：它只取刚结束那一段空头里的阳线，SAR 翻多之后再收多少根阳线都不换；要等下一轮空头出现、再翻回多头，才会换成新的一条。第二，收盘价正好等于开盘价的十字星不算阳线；那一段空头里一根阳线都没有的、或者可用历史里一次空头都没出现过的，没有参照线，不入榜，也不会去更早的一段里找——改判据这一周，周线 SAR 多头的 262 个标的里有 5 个因此不在，另有 50 个收盘价还没站上参照线。第三，比较是严格大于，一样高不算。第四，本榜只看周线 K 线和周线 SAR，不看成交量、均线和 RSI。和上一版的区别：上一版不问 SAR 方向——周线 SAR 还在空头侧时，拿正在进行的这一轮下跌里上一次反弹的收盘价当参照，是抢在 SAR 翻多之前的信号；这一版把这一类去掉了。改判据这一周（最新已收盘的是 2026 年 9 月 7 日那一周）从 231 个变成 207 个，去掉的 24 个正是周线 SAR 还在空头侧的那批，其余一个没变。和站内其他榜的关系：和「月线突破SAR空头第二根低点」是同一类思路（收盘价站上最近一轮空头段里的一条参照线），但周期、参照的那根 K 线和参照价都不同，那张也不问 SAR 方向，两张之间没有包含关系。这是一张状态清单（再叠一道门槛）：SAR 保持多头、收盘价保持在参照线上方就一直在——回放里上一周的成员这一周还在的比例中位数 86%（上一版 64%），已经结束的在榜段中位 3 周、最长 38 周，约四分之一只待了 1 周；次周去向：约八成下一周仍在榜，约一成是 SAR 还在多头、收盘跌回参照线下方而离开，约 9% 是周线 SAR 翻空离开。命中数：回放过去 105 周，每周中位 48 个、最少 3 个、最多 215 个，没有哪一周是空的，每周中位约占周线 SAR 多头标的的六成；改判据这一周的 207 个接近这 105 周里的最高，属于高位，别当成常态。也要如实说一句：它不是择时信号。回放里成员下一周收涨的比例是 41.1%（7269 个样本），全市场 42.3%，上一版 40.7%，周线 SAR 多头的标的全体是 40.9%——在 SAR 多头之上再要求站上参照线，几乎没有差别，仍略低于大盘。周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线、月线各轴都不参与筛选，用来在这批标的里再分强弱。门槛：算 SAR 至少要 3 根已收盘周 K，上市不足三周的新合约不入榜。范围是全部加密 USDT 永续合约。" },
            { key: "monthlySecondLowDailyEmaSarBull", name: "月线突破SAR空头第二根低点＋日线9/21扩张＋SAR多头", tf: "日线/月线",
              desc: "三个条件：第一个看最新已收盘的那根月线，后两个看最新已收盘的那根日线。一是月线的收盘价站上了最近一轮月线 SAR 空头段里第 2 根 K 线的最低价（和「月线突破SAR空头第二根低点」那张榜的条件一字不差）；二是日线 EMA9 在 EMA21 上方、而且两条均线的间距比前一天更大（结构正在张开）；三是这根日线的 Parabolic SAR 站在多头一侧（圆点在价格下方，不管已经多头了几天）。三条合起来找的是：在月线级别已经从最近一轮下跌里抬起头的标的里，日线趋势朝上、均线也正在张开的那一批。有三处要先说清楚。第一，月线那一条的细节和那张榜完全相同：「最近一轮」不要求那一段已经结束，参照价取那一段第 2 根的最低价，段里只有 1 根、或者可用历史里一次空头都没出现过的标的没有参照线，不入榜；这一条每月 1 号 00:00（UTC）新月线收盘后才换一次，同一个月之内能入选的范围不变，每天变的只是日线那两条。第二，扩张是两半合起来才算：光是间距在变大还不够，EMA9 必须已经站到 EMA21 上方；一个标的的间距从 −6.2% 收窄到 −5.9%，数字确实变大了，但那时 EMA9 还在下面，不算扩张。第三，SAR 这一条不限第几根：刚翻多的第一天和已经多头一个月的都算——表格里的「日SAR多头根数」在本榜上一定有数字、不会显示「—」，想只看刚翻多的，按它升序排；上线这一天的 21 个里有 10 个是刚翻多的第一根。三条里真正卡人的是日线 9/21 扩张：回放过去 360 天，月线那一条每天中位约 100 个，再要求日线 SAR 多头剩 40 个左右，再要求 9/21 扩张就只剩 13 个左右，约占月线那一批的一成三。和站内其他榜的关系：本榜的每一个标的必然都在「月线突破SAR空头第二根低点」上（月线那一条一字不差），反过来远不是；和「日线SAR空头首根＋SAR点高于前一轮空头首根＋月线突破SAR空头第二根低点」一定不会同时出现（那张要求最新一根日线的 SAR 刚翻到空头）；和「日线9/21扩张＋SAR多头首根＋最近一轮空头首根SAR点高于前一轮」没有包含关系（那张里月线那一条也满足的标的，一定也在本榜上）。命中数：回放过去 360 天，每天中位 13 个、最少 0 个、最多 59 个，有 2 天一个都没有；上线这一天（最新已收盘的是 2026 年 9 月 18 日那根日线）是 21 个。这是一张状态清单（再叠一道月线门槛）：日线 9/21 还在扩张、SAR 还在多头就一直在，间距一停止变大、或者 SAR 翻空就离开——回放里前一天的成员第二天还在的比例中位约 70%，已经结束的在榜段中位 3 天、最长 15 天。也要如实说一句：它不是买入信号。回放里成员次日收涨的比例是 44.7%（5291 个样本），全市场 45.8%；5 天后收盘比入榜那天更高的比例 41.1%，全市场 42.6%——都略低于大盘。加上月线这一条比只看日线两条（9/21 扩张＋SAR 多头、不看月线）好一点，那样是 43.1% 和 38.7%。它更适合当成「月线已经抬头、日线结构正在走强」的观察名单，而不是追进去的理由。表格里的各轴都不参与筛选，用来在这批标的里再分强弱。门槛：日线要至少 23 根已收盘日 K、月线要至少 3 根已收盘月 K，所以上市不足三个月的新合约不入榜；日线数据每天 00:00（UTC）收盘后才换一批，同一天之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。范围是全部加密 USDT 永续合约。" },
            { key: "weeklySarSecondBar", name: "周线SAR多头首根", tf: "周线",
              desc: "只看最新已收盘的那根周线：它正好是这一轮 Parabolic SAR 多头的第 1 根——SAR 圆点刚刚在这一周由价格上方翻到下方，上一周还在空头一侧。除了周线 SAR，本榜不看均线、RSI 和成交量。有两处要先说清楚。第一，「首根」按周算：下一周它就成了第 2 根、必然离开本榜，所以同一个标的不会连着两周出现。第二，上市早期那一根播种出来的空头也算数——周线取 499 根，对现有合约就是全部历史，和 TradingView 上看到的一样。命中数：回放过去 104 周，每周中位 8 到 9 个、最多 102 个，只有 4 周一个都没有；上线这一周是 38 个。次周去向：约 97% 第二周仍在多头（成了第 2 根），约 3% 直接翻回空头；这一轮周线多头从翻多那周算起维持的周数中位 7 周，四成多能撑过 8 周。也要如实说一句：它不是买入信号，回放里反而跑输大盘——成员下一周收涨的比例 36.9%（1405 个样本），全市场 42.3%；4 周后收盘比入榜那周更高的比例 34.4%，全市场 36.7%，涨跌幅中位数也更低。它更适合当成「周线级别刚转多」的观察名单，配合别的榜一起看。和「周线突破SAR空头最新阳线收盘价＋SAR多头」没有包含关系：那张不限第几根、另要求收盘价站上上一轮下跌里最后一次反弹的收盘价（上线这一周 38 个里有 27 个同时在那张上）。周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线各轴不参与筛选，用来在这批标的里再看日线强弱。门槛：算 SAR 至少要 3 根已收盘周 K，上市不足三周的新合约不入榜。范围是全部加密 USDT 永续合约。" },
            { key: "weeklyAdxDiRising", name: "周线ADX递增或+DI递增", tf: "周线",
              desc: "只看最新已收盘的两根周线：这一周的 ADX 比上一周高，或者这一周的 +DI 比上一周高，两条满足任意一条就入榜。ADX 和 +DI 都来自 TradingView 自带的 DMI 指标（默认参数：DI 长度 14、ADX 平滑 14），数值和 TradingView 周线图上看到的一致：+DI 量的是多方的方向压力，越高说明往上推的力量越强；ADX 只量趋势有多强、不分方向——涨得越来越猛它会升，跌得越来越猛它也会升。有四处要先说清楚。第一，「递增」是严格大于上一周，一样高不算；只比最新这两根，不要求连着好几周都在升。第二，因为 ADX 不分方向，本榜里常有下跌正在加速的标的：回放里成员有六成多的时候是 −DI 在 +DI 上方（空方占优），上线这一周行情偏多、297 个里是 46 个。表格里没有 −DI 这一列，想分清是多方还是空方在变强，要点开图表看 −DI。第三，两条是「或」、不是同时满足：上线这一周（最新已收盘的是 2026 年 9 月 14 日那一周）297 个里，只有 ADX 在升的 131 个、只有 +DI 在升的 82 个、两个都在升的 84 个。第四，两条都要至少 29 根已收盘周 K（ADX 要 28 根才算得出来，再多一根用来比较），所以上市不足约七个月的新合约不入榜；TradingView 上 +DI 线从第 15 根周线就开始画，上市 16 到 28 周的新合约在那边能看到 +DI 在升、在这里不入榜——上线这一周有 6 个这样的标的。这是一张很宽的背景名单，不是精选：回放过去 104 周，每周中位 190 个、最少 30 个、最多 395 个，一周都没有空过，中位约占可判标的的六成；上一周的成员这一周还在的比例中位约 85%。也要如实说一句：它不是择时信号。回放里成员下一周收涨的比例是 41.9%（19849 个样本），全市场 42.5%，可判但不在榜的 44.0%；4 周后收盘比入榜那周更高的比例 37.7%，全市场 36.7%——都和大盘几乎没有差别；按每周和当周全市场的中位数比，成员下一周跑赢的比例 49.9%，和抛硬币一样。它更适合当成「周线级别趋势正在变强」的底池，配合别的榜或表格里的各轴再筛。和站内其他周线榜没有判据上的包含关系，但重叠很多：上线这一周「周线SAR多头首根」33 个里 31 个、「周线首次9/21扩张」34 个里 29 个也在本榜上。周线数据每周一 00:00（UTC）新周线收盘后才刷新一次，同一周之内反复打开本榜，看到的标的完全一样，这是正确行为不是数据卡住了。表格里的日线、周线、月线各轴都不参与筛选，用来在这批标的里再分强弱。范围是全部加密 USDT 永续合约。" },
        ],
    },
    // A股「行情」「策略」两组已随整族退役删除（前端最后一版在 bishuju-web ddc693e）；复活清单见后端 fetch_ashare.py 顶部
    //   （前端要连同 TABS_CONFIG、CHANGE_PCT_TABS、资产分段控件与 A股 新鲜度胶囊一起加回）。
];

// tab key → {asset, tf, name, full, desc}：组的 asset / tf 下发到每个 tab（tab 自带 tf 优先），full 缺省用 name。
const TAB_META = {};
for (const g of TAB_GROUPS) {
    for (const t of g.tabs) {
        TAB_META[t.key] = { asset: g.asset, tf: t.tf || g.tf, name: t.name, full: t.full || t.name, desc: t.desc || "" };
    }
}

// === 付费墙配置 ===
// 总开关，必须与后端 fetch_data.py 的 PAYWALL_ENABLED 一致（audit C）；紧急回滚时两处一起改 false。
const PAYWALL_ENABLED = true;
const WORKER_API = "https://bishuju-api.fanshenpan.workers.dev";
// 免费橱窗榜：公开 JSON 只含它的第 1 行（默认视图第一名）。必须与后端同名常量一致（audit C）。
// 橱窗 ＝ 默认落地榜 ＝ 策略组第一个，换榜六处同改：这里 + 后端 + currentTab + lastTabByAsset.crypto
// + switchAsset 兜底 + index.html FAQ「哪些免费」的榜名（只改落地页不改橱窗 ⇒ 新访客落在全锁空榜上）。
const TEASER_TAB = "monthlySarBearish";
const LS_LICENSE = "bishuju_license";
const PLAN_LABEL = { monthly: "月付", quarterly: "季付", yearly: "年付" };
// 仅供页面标价；实际扣款以 Worker 同名常量为准，两处必须一致（audit C）。
const PRICES = { monthly: 19, quarterly: 49, yearly: 149 };
let selectedPlan = "quarterly"; // 购买弹窗默认选中项，对应 UI 上标"最划算"的那档
const LOCK_REASON = {
    not_found: "通行证不存在，请检查是否粘贴完整",
    expired: "通行证已过期，续费后可继续使用",
    revoked: "通行证已被停用，如有疑问请联系我",
    missing: "请输入通行证",
};
// 内联锁图标。width/height 必须写在属性里：它会进无 CSS 作用域的容器（如导航项），不能只靠样式给尺寸。
const LOCK_SVG = '<svg class="tab-lock" width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 1a2.7 2.7 0 0 0-2.7 2.7V5H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-.3V3.7A2.7 2.7 0 0 0 6 1Zm1.5 4h-3V3.7a1.5 1.5 0 1 1 3 0V5Z"/></svg>';

// 存储安全包装：禁用存储时裸调 localStorage 会抛异常（顶层一抛整个脚本死掉、页面全白），降级为不记忆。
const safeStore = {
    get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } },
    set(store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* 禁存储:本次会话内不记忆 */ } },
    del(store, k) { try { window[store].removeItem(k); } catch (e) {} },
};

let data = null;
let lastRenderKey = null; // loadData 上次重渲染时的 updateTime，用于跳过无变化的重建
// 默认落地榜 ＝ TEASER_TAB（未解锁的新访客一进来就看到那行免费内容 + 转化位）；改这里要同步 currentAsset 默认值。
let currentTab = "monthlySarBearish";
let sortAsc = false; // false=降序, true=升序
let sortField = "value"; // 当前排序字段（切 tab 时重置为该 tab 首轴）
let searchQuery = ""; // 表格搜索（代码/名称子串），切 tab 时清空
let lastBustAt = 0; // 上次带 cache-buster 强拉的时间（限流用，见 loadData）
let bustStreak = 0; // 连续强穿仍拿到同一 updateTime 的次数，驱动 loadData 的指数退避（线上抓取中断时省带宽）
let license = { key: safeStore.get("localStorage", LS_LICENSE) || "", valid: false, expiresAt: null, plan: null, reason: null };
let paidData = null; // Worker 返回的全量付费数据（未解锁或未拉到时为 null）
let lastPaidUpdateTime = null; // 上次拉付费数据时的 paidFetchKey（与 loadData 同构），避免每 30s 轮询都打 Worker
// 页面折叠状态（本机记忆、全站共用、不分榜）：榜单说明默认收起、共振卡默认收成速览条 ——
// 两块全展开时手机上表格在四屏以下、桌面近三屏以下。按钮见 #bhNoteToggle / #resoToggle。
const LS_NOTE_OPEN = "bishuju_note_open";
const LS_RESO_OPEN = "bishuju_reso_open";
let noteOpen = safeStore.get("localStorage", LS_NOTE_OPEN) === "1";
let resoOpen = safeStore.get("localStorage", LS_RESO_OPEN) === "1";

function formatPercent(val) {
    const sign = val >= 0 ? "+" : "";
    return `${sign}${val.toFixed(2)}%`;
}

/** 与 Worker 的 normalizeKey 对齐：trim / 大写 / 去空白 / 全角横线→半角。必须在存储和发请求头之前做：
 * X-License-Key 头含非 Latin-1 字符会让 fetch() 同步抛 TypeError（表现为验证通过但榜单全空）。 */
function normalizeKey(raw) {
    return (raw || "").trim().toUpperCase().replace(/\s+/g, "").replace(/[—–－]/g, "-");
}

/** 某榜命中数：优先 paidMeta（服务端按完整名单算），数组长度只兜底——橱窗榜的 data[key] 只有 1 行，
 * 反过来锁定态会显示「命中 1 个」。data 未就绪或两边都没有时返回 null。 */
function tabCount(key) {
    if (!data) return null;
    if (data.paidMeta && key in data.paidMeta) return data.paidMeta[key];
    if (Array.isArray(data[key])) return data[key].length;
    return null;
}

// 涨跌幅榜（无筛选、全市场入榜），行情榜 / 策略榜的唯一分界。同时决定 ① 值列红绿（另需 sortField === "value"）
// ② 导航不挂命中徽标、量词说「共」③ 空状态走「暂无数据」；漏加则一起静默失效。复活 A股 时加回它的三个涨跌幅 key。
const CHANGE_PCT_TABS = new Set(["dailyChange", "weeklyChange", "monthlyChange"]);

// 整榜免费的榜：必须与后端 fetch_data.py 同名 FREE_TABS 一致（audit C；后端据此整榜写进公开文件，前端据此不锁）。
// 空集不是漏写：全站没有免费整榜，免费面只剩橱窗 1 行 + marketOverview。
const FREE_TABS = new Set([]);
// 策略榜 ＝ 有筛选条件的榜（0 命中是正常信号）：空状态文案、脉搏计数、导航命中徽标据此。
// 必须同时排除 CHANGE_PCT_TABS：涨跌幅榜也付费，只判 FREE_TABS 会把行情榜当策略榜（是不是策略榜与免费 / 付费无关）。
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

// A股 symbol 形如 "600000.SH"，精确正则匹配；别改成「带不带点」判据（BRK.B 这类 ticker 本身带点）。
function isAshareSymbol(symbol) {
    return /^\d{6}\.(SH|SZ)$/.test(symbol);
}

function isAshareTab(tab) {
    return tab.startsWith("ashare");
}

// TradingView 符号：加密 "BTCUSDT" → "BINANCE:BTCUSDT.P"（永续后缀）；A股 "600000.SH" → "SSE:600000"；其余原样返回。
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

// 符号列展示拆分：主代码 + 后缀（加密为计价币种，A股 为交易所，其余空串）。
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
    // null / NaN 两个方向都沉底（裸相减得 NaN 会打乱排序），只对有值的行按 dir 比较。
    // 平局一律按 value 降序（策略榜 ＝ 日成交额）、不跟随 dir：显式写出保证渲染顺序确定、不依赖引擎稳定排序；
    // sarBullBars 这类整数轴平局是常态，别当无用代码删。`|| 0` 与后端排序键 `x["value"] or 0` 同款兜底。
    // 同档内要再分高下就切轴，别把判断塞进 tie-break。
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

// === 左栏导航（master-detail）===
// rail：当前资产的分组榜单（组数由 TAB_GROUPS 决定、别写死），激活态随资产变色；移动端 rail 隐藏，同一份导航渲染进抽屉。
// TF_SHORT：tf → rail 徽标缩写，查不到时徽标静默消失（跨周期榜要在这里补，两个字自动套 .tf-chip--wide）。tf 纯展示用。
const TF_SHORT = { "日线": "日", "周线": "周", "月线": "月", "日线/周线": "日周", "日线/月线": "日月" };
// 资产名双向映射，两张一起维护（ashare 为休眠条目）。
const ASSET_KEY = { "加密": "crypto", "A股": "ashare" };   // TAB_GROUPS.asset → data-asset
const ASSET_CN = { crypto: "加密", ashare: "A股" };        // data-asset → TAB_GROUPS.asset
// 默认资产 ＝ 默认落地 tab（currentTab）所属资产，两者同改。
let currentAsset = "crypto";                            // 当前资产（由 tab 派生/资产切换驱动）
// 各资产上次看的榜；加密初值 ＝ TEASER_TAB（未解锁时唯一有内容的榜）。复活 A股 时加回 ashare: "ashareMonthlyWeeklyDaily"。
const lastTabByAsset = { crypto: "monthlySarBearish" };

function assetOfTab(tab) {
    const m = TAB_META[tab];
    return m ? ASSET_KEY[m.asset] : "crypto";   // 兜底跟默认落地 tab 走
}

// rail 组标签去掉 "A股" 前缀（资产本由分段控件表达）；现有组名不带该前缀，原样返回
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
                // 策略榜挂命中数（锁定态也挂，走 paidMeta）；涨跌幅榜恒为全市场数量、不挂。数据未到时不渲染，loadData 后补上。
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
    // 资产分段控件激活态（休眠件：rail / drawer 两份 DOM 随 A股 退役已删，这里空转）
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
        // 写标的范围而不是数量（tabCount 是某个榜的命中数，写成「监控 N 只」会误导）；复活 A股 时按资产写「沪深 A 股全市场」。
        const uni = "加密 USDT 永续合约全市场";
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
    // 加密走 .asset-tag 默认样式，只有 A股 需要显式加类。
    tagEl.classList.toggle("is-ashare", m.asset === "A股");
    const tfEl = document.getElementById("bhTf");
    tfEl.textContent = m.tf || "";
    tfEl.style.display = m.tf ? "" : "none";
    document.getElementById("bhName").textContent = m.full;
    // 命中数挂在标题旁（说明收起时也看得到）；说明行只放 desc（完整规则，导航名可以短）。
    const note = document.getElementById("bhNote");
    const hitEl = document.getElementById("bhHit");
    const n = tabCount(currentTab);
    // 量词随榜的语义：策略榜说「命中」；行情榜无筛选，说「共」（与表尾同一判据）。
    const hit = n != null ? `${isStrategyTab(currentTab) ? "命中" : "共"} ${n} 个标的` : "";
    hitEl.textContent = hit;
    hitEl.hidden = !hit;
    note.textContent = m.desc || "";
    note.hidden = !m.desc;
    head.hidden = false;
    syncNoteClamp();
}

// 说明收起 ＝ 桌面两行、手机三行（CSS line-clamp）。收起时没溢出（说明本来就短）不出按钮；展开时一律给「收起说明」。
// 要在 head 可见之后量高度；换宽度（转屏、拖窗口）会改变是否溢出 ⇒ resize 时重算。
function syncNoteClamp() {
    const note = document.getElementById("bhNote");
    const btn = document.getElementById("bhNoteToggle");
    if (!note || !btn) return;
    note.classList.toggle("is-clamped", !noteOpen);
    const overflow = note.scrollHeight > note.clientHeight + 1;
    btn.hidden = note.hidden || (!noteOpen && !overflow);
    btn.textContent = noteOpen ? "收起说明" : "展开说明";
    btn.setAttribute("aria-expanded", String(noteOpen));
}

// 排序条：选轴在表格上方的 chip 条（真按钮、键盘可达、移动端横向滑动）；表头只标当前轴 + 方向，点击切升 / 降序。
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
    // 重建 innerHTML 会把横向滚动位归零（刚点的右侧轴会滚出视野），同 tab 内重渲染时手动还原
    const chips = strip.querySelector(".sort-strip__chips");
    if (chips && keepScroll) chips.scrollLeft = keepScroll;
    lastStripTab = currentTab;
    strip.hidden = false;
}

// 锁定态的模糊预览行：确定性假数据，宽度写死不用随机（避免每次重渲染抖动）。
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
// 锁定卡片：预览行 + 锁图标 + 命中数 + CTA。n ＝ 命中数（paidMeta，可为 null）；CTA 的 #emptyUnlockBtn 由调用方绑定动作。
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
// 锁定态收起无数据可操作的搜索框 / 排序条 / 表头，让 CTA 卡片顶到首屏；非锁定态恢复显示。
function setLockedChrome(hide) {
    const search = document.querySelector(".board-head .search");
    if (search) search.hidden = hide;
    // renderSortStrip 已按 config 置 hidden=false;锁定时在其之后覆盖为收起
    if (hide) { const strip = document.getElementById("sortStrip"); if (strip) strip.hidden = true; }
    const thead = document.querySelector(".table .thead");
    if (thead) thead.hidden = hide;
}

function renderTable() {
    // 标识与排序条不依赖数据，放在 !data 早退之前（否则首屏数据未到时切 tab，标识栏停在旧内容）
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

    // 锁定态 ＝ 公开 JSON 不含该 key（undefined，不是空数组）。提前判定：收起假控件，下方空状态渲染橱窗卡片。
    const locked = PAYWALL_ENABLED && data[currentTab] === undefined && currentTab !== TEASER_TAB && !FREE_TABS.has(currentTab);
    setLockedChrome(locked);

    const arrow = sortAsc ? " ▲" : " ▼";
    if (config.sorts) {
        const active = config.sorts.find(s => s.key === sortField) || config.sorts[0];
        header.innerHTML = `<span class="sort-opt active" data-sortkey="${active.key}" title="点击切换升/降序">${active.label}<span class="sort-arrow">${arrow}</span></span>`;
    } else {
        // 兜底：现在所有 tab 都带 sorts、走不到这里；防未来无 sorts 的 tab 印出 "undefined"
        header.innerHTML = (config.header || "值") + `<span class="sort-arrow">${arrow}</span>`;
    }
    const sortDef = config.sorts ? (config.sorts.find(s => s.key === sortField) || config.sorts[0]) : null;

    if (items.length === 0) {
        // 空状态：锁定 / 搜索无匹配 / 橱窗行未到 / 策略榜 0 命中（筛选严格，不是故障）/ 数据未生成。
        // 日更资产（A股，休眠件）用「收盘后重算」文案；再加日更资产要并进 dailyAsset，否则落进加密的「整点后重算」。
        const dailyAsset = isAshareTab(currentTab);
        const strict = isStrategyTab(currentTab);
        // 锁定态优先：未解锁 / 通行证失效 → 橱窗卡片；通行证有效只是付费数据没拉到 → 加载态（别催已付费的人重复付款）。
        if (locked && !license.valid) {
            const n = tabCount(currentTab);
            const expired = !!license.key; // 有 key 但 !valid = 过期/吊销
            const desc = expired
                ? "通行证已失效（过期或被停用）<br>续费后即可继续查看完整名单"
                // 写「全部榜单」不写「全部策略榜」：涨跌幅榜同样付费
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
            // 页脚（role=status / aria-live）给读屏用户播报一句状态（#rankBody 不设 live）
            if (foot) { foot.textContent = expired ? "通行证已失效，续费后可继续查看" : "该策略榜需通行证解锁"; foot.hidden = false; }
            updateExportBar();  // 锁定态也要刷：否则切榜后导出坞仍显示上一榜的「已选 N 个」+ 表头勾选态残留
            return;
        }
        let ico, title, desc;
        if (locked && license.valid) {
            const n = tabCount(currentTab);
            // 两种情况分开说：a) paidData == null（整包没拉到）：fetchPaidData 失败不推进 lastPaidUpdateTime，下一轮确会重试；
            // b) 整包有但缺这个 key（服务端没产出）：paidFetchKey 不变、数据更新前不再打 Worker ⇒ 别许诺「30 秒重试」，也别自动重试。
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
            // 橱窗榜命中数 > 0 却一行没有 ＝ 免费那 1 行还没进公开文件，不是 0 命中。
            // 别删这个分支：一旦橱窗行与 paidMeta 不同源，落进 strict 会与导航徽标自相矛盾。
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
        // 页脚同样播报（#rankBody 不设 live：30s 刷新会朗读上千行）。搜索分支用原始 searchQuery：
        // title 里是 escapeHtml 过的，进 textContent 会双重转义。
        if (foot) { foot.textContent = searchQuery ? `没有匹配「${searchQuery}」的标的` : title; foot.hidden = false; }
        updateExportBar();  // 同上：空状态也要刷导出坞
        return;
    }

    // 渲染上限：大表一次性 innerHTML 在中低端机型卡顿数百毫秒；排序 / 搜索仍作用于全量，尾部靠搜索定位
    const RENDER_CAP = 1000;
    const capped = items.length > RENDER_CAP;
    const shown = capped ? items.slice(0, RENDER_CAP) : items;

    // 数值相对强度条：以当前列表 |值| 最大者为 100%
    const barKey = sortDef ? sortField : "value";
    const maxAbs = Math.max(...shown.map(x => Math.abs(x[barKey] ?? 0)), 1e-9);

    tbody.innerHTML = shown
        .map((item, i) => {
            const rank = i + 1;
            // 只在值列展示涨跌幅时红绿上色：涨跌幅榜首轴 key 就是 value（别改名，否则红绿失效）；切到其它轴一律 neutral。
            const colorClass = sortField === "value" ? getColorClass(item.value, currentTab) : "neutral";
            // 涨跌语义只标 up/down，红绿由 CSS 的 [data-asset] 作用域决定（A股 涨红跌绿，休眠件）
            const valCls = colorClass === "positive" ? " val--up" : colorClass === "negative" ? " val--down" : "";
            const displayValue = sortDef ? sortDef.format(item) : config.format(item);
            // 值列数字左侧的成交额名次小标（volRankBadgeFor）；轴上没有 badge 或行上无名次字段时为空串
            const badge = sortDef && sortDef.badge ? sortDef.badge(item) : "";
            const checked = selectedSymbols.has(item.symbol) ? "checked" : "";

            const rankCell = rank <= 3
                ? `<span class="medal medal--${rank}">${rank}</span>`
                : `<span class="rank-num">${rank}</span>`;

            const barVal = Math.abs(item[barKey] ?? 0);
            const barW = Math.max(3, Math.round(barVal / maxAbs * 100));

            const subInfo = config.subFormat ? `<div class="sub">${config.subFormat(item, sortField)}</div>` : "";

            const tvUrl = tvUrlFor(item.symbol);
            // symbol 与 name 都来自数据管道，一律转义后再进 innerHTML；data-symbol 转义无副作用（读 dataset 时自动解码）
            const symSafe = escapeHtml(item.symbol);
            const { base: symBase0, suffix: symSuffix0 } = symbolDisplayParts(item.symbol);
            const symBase = escapeHtml(symBase0), symSuffix = escapeHtml(symSuffix0);
            // 行上有 name（A股 股票名）时显示 name，否则显示 "/ USDT" 这类后缀
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
                <div class="c-val${badge ? " c-val--badged" : ""}" role="cell">
                    ${badge}<span class="val${valCls}">${displayValue}<span class="val__bar" style="width:${barW}%"></span></span>
                </div>
            </div>`;
        })
        .join("");

    if (foot) {
        // 表尾：搜索给「匹配 / 总数」· 截断提示 · 橱窗未解锁给解锁 CTA（别只写「共 1 个」）· 平常「共 N」
        const total = (data[currentTab] || []).length;
        const teaserLocked = PAYWALL_ENABLED && currentTab === TEASER_TAB && !license.valid;
        // 量词随榜的语义走（与 renderBoardHead 同一判据）：策略榜「命中」、行情榜「共」
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
    // 表体是容器内滚动（.tbody），切榜必须回顶，否则新榜停留在上一榜的滚动位置
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

// 切资产（分段控件，休眠件）：回到该资产上次看的榜单
function switchAsset(assetK) {
    if (assetK === currentAsset) return;
    // 兜底（lastTabByAsset 缺项时）也要落在本资产自己的榜上：再加资产时逐个列映射、别写成二分。加密兜底 ＝ TEASER_TAB。
    const fallback = assetK === "ashare" ? "ashareMonthlyWeeklyDaily" : "monthlySarBearish";
    switchTab(lastTabByAsset[assetK] || fallback);
}

// 收盘快照说明横幅（休眠件）：切到日更资产（A股）时显示，关一次永久不弹（localStorage，各资产独立 key）。
// dismiss key 字面量别改：改了老用户会重新看到已关过的横幅。
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

/** updateTime 形如 "YYYY-MM-DD HH:MM:SS UTC" */
function parseUpdateTime(s) {
    if (!s) return null;
    const t = Date.parse(s.replace(" UTC", "Z").replace(" ", "T"));
    return Number.isNaN(t) ? null : t;
}

function renderStaleBanner() {
    const el = document.getElementById("staleBanner");
    if (!el || !data) return;

    if (isAshareTab(currentTab)) {
        // A股（休眠件）每个交易日收盘后更新，阈值放宽到 30 小时（容忍节假日 / 偶发延迟）
        const t = parseUpdateTime(data.ashareUpdateTime);
        el.hidden = !(t && Date.now() - t > 30 * 3600 * 1000);
        return;
    }
    const t = parseUpdateTime(data.updateTime);
    // 加密每小时更新；超过 2.5 小时没动就亮横幅
    el.hidden = !(t && Date.now() - t > 2.5 * 3600 * 1000);
}

/** 顶栏新鲜度胶囊：加密数据的更新时刻 + 下次刷新倒计时。 */
function renderUpdatePill() {
    // A股 胶囊已连 DOM 删除（复活见 git ddc693e）；删胶囊 DOM 必须同批删这里的引用，否则早退会让加密胶囊也永不更新。
    const elC = document.getElementById("freshCrypto");
    if (!elC || !data) return;

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

    // 移动端 CSS 只显示非 .is-dim 的胶囊 ⇒ 任何时候必须恰好有一个亮着（现只剩加密、恒亮）。
    elC.className = `fresh ${clsC}`;
}

// 加密策略榜数（脉搏「N 榜」用），从 TAB_GROUPS 算、不硬编码。
const CRYPTO_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "加密").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;

/** 某资产全部策略榜的命中总数。走 paidMeta（同 tabCount 口径）而不是数组长度：锁定态下多数 data[k] 是 undefined。 */
function strategyHits(asset) {
    if (!data || !data.paidMeta) return null;
    return Object.keys(data.paidMeta)
        .filter(k => isStrategyTab(k) && TAB_META[k] && TAB_META[k].asset === asset)
        .reduce((s, k) => s + data.paidMeta[k], 0);
}

function pulseTile(k, v, sub) {
    return `<div class="pulse__cell"><div class="pulse__label">${k}</div><div class="pulse__value">${v}</div><div class="pulse__sub">${sub}</div></div>`;
}

// 价格 / 百分比格式化：大额取整带千分位、小额留精度（永续价格跨好几个数量级，固定小数位总有一头是废的）。
// ⚠️ fmtMktPrice 有两个消费者：市场概览的 BTC/ETH 锚点 + 涨跌幅榜副行「开 X → 收 Y」（cryptoPriceCtx）。
function fmtMktPrice(p) {
    if (p == null) return "—";
    if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
    if (p >= 1) return "$" + p.toFixed(2);
    if (p >= 0.01) return "$" + p.toFixed(4);
    // 4 位有效数字：副行两个价格要对得上涨跌幅（2 位会让低价币差出几个点）；Number() 去掉 toPrecision 补的尾零。
    return "$" + Number(p.toPrecision(4));
}
// A股 价格（休眠，供 asharePriceCtx）：沪深报价精度 0.01 ⇒ 两位小数即完整。
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
    return `<div class="mkt__item mkt__item--anchor" title="${name} 最新价与 24h 涨跌幅">
        <span class="mkt__k">${name}</span>
        <span class="mkt__v">${fmtMktPrice(a.price)} <span class="${cls}">${fmtMktPct(a.change)}</span></span>
    </div>`;
}

/** 市场概览全局条（免费）：加密永续全市场 24h 指标，数据来自后端 data.marketOverview。 */
function renderMarketOverview() {
    const el = document.getElementById("marketOverview");
    if (!el) return;
    const mo = data && data.marketOverview;
    if (!mo) { el.hidden = true; return; }

    const b = mo.breadth || {};
    const s = mo.sentiment;
    const zone = s < 25 ? "fear2" : s < 45 ? "fear" : s < 55 ? "neutral" : s < 75 ? "greed" : "greed2";
    const items = [];

    // 第一块自报「加密市场」+ 刷新时刻：概览条对所有资产可见，不写明会被当成当前资产的指标。
    if (data.updateTime) items.push(`<div class="mkt__item mkt__item--time" title="加密 USDT 永续合约全市场，每小时更新">
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

// === 共振卡（脉搏条与榜单之间）：日线一张通栏，周线 / 月线两张并排（≤1080px 叠放）===
// 每张卡：本周期涨跌幅榜排序条上的本周期轴（标签以「日 / 周 / 月」开头的，去掉本周期成交额——体量不是强弱）逐轴全市场降序排名，
// 数每个币排进前 top 名的轴数，≥ min 根才上卡；同分依次比「第一的个数 → 名次之和 → 日成交额」。
// 轴集从三张涨跌幅榜的排序条派生：加删轴卡片自动跟随，不用另改；⚠️ 轴标签别去掉周期前缀（会静默掉出卡片）。
// 全市场 ＝ 对应涨跌幅榜的全部行（与策略榜同形，value 装的是本周期涨跌幅）。
// 排名规则同策略榜上的 getSortedItems：null / NaN 不参评、平局按日成交额降序。
// 周 / 月线的轴比日线少得多：月线取前 10 时回放里约两成月份一个都没有（一空就空一整个月）⇒ 月线放宽到前 20，「≥3 根」三张卡一致。
// 纯前端现算、不进后端产出：用的全是付费榜的行，锁定态没有这三张榜 ⇒ 整块隐藏，别拿公开文件去凑。
const RESO_ROWS = 10;
const RESO_CARDS = [
    { tab: "dailyChange", tf: "日", sorts: dailyChangeSorts, volKey: "volume", rankKey: "volumeRank",
      top: 10, min: 3, wide: true, period: "今天", refresh: "日线每天 00:00 UTC 换一批" },
    { tab: "weeklyChange", tf: "周", sorts: weeklyChangeSorts, volKey: "weeklyVolume", rankKey: "weeklyVolumeRank",
      top: 10, min: 3, wide: false, period: "本周", refresh: "周线每周一 00:00 UTC 换一批" },
    { tab: "monthlyChange", tf: "月", sorts: monthlyChangeSorts, volKey: "monthlyVolume", rankKey: "monthlyVolumeRank",
      top: 20, min: 3, wide: false, period: "本月", refresh: "月线每月 1 号 00:00 UTC 换一批" },
];

function resonanceBoard(card) {
    const list = data && data[card.tab];
    if (!Array.isArray(list) || !list.length) return null;
    const axes = card.sorts.filter(a => a.label.startsWith(card.tf) && a.key !== card.volKey);
    const hits = new Map();
    for (const ax of axes) {
        list.filter(r => r[ax.key] != null && !Number.isNaN(r[ax.key]))
            .sort((a, b) => (b[ax.key] - a[ax.key]) || ((b.volume || 0) - (a.volume || 0)))
            .slice(0, card.top)
            .forEach((r, i) => {
                if (!hits.has(r.symbol)) hits.set(r.symbol, { item: r, hits: [] });
                hits.get(r.symbol).hits.push({ ax, rank: i + 1 });
            });
    }
    const rows = [...hits.values()]
        .filter(x => x.hits.length >= card.min)
        .map(x => ({
            item: x.item,
            hits: x.hits.sort((a, b) => a.rank - b.rank),
            top1: x.hits.filter(h => h.rank === 1).length,
            rankSum: x.hits.reduce((s, h) => s + h.rank, 0),
        }))
        .sort((a, b) => b.hits.length - a.hits.length || b.top1 - a.top1 || a.rankSum - b.rankSum
            || ((b.item.volume || 0) - (a.item.volume || 0)));
    return { axes, rows };
}

function resonanceCardHtml(card, board) {
    const { axes, rows } = board;
    const tfName = `${card.tf}线`;
    const shown = rows.slice(0, RESO_ROWS);
    const body = shown.length ? shown.map((x, i) => {
        const it = x.item;
        const chips = x.hits.map(h => {
            const medal = h.rank <= 3 ? ` medal--${h.rank}` : "";
            const label = escapeHtml(h.ax.label);
            return `<span class="reso__chip${medal}" title="${label} 全市场第 ${h.rank} 名：${escapeHtml(h.ax.format(it))}">${label}<b>${h.rank === 1 ? "第一" : "#" + h.rank}</b></span>`;
        }).join("");
        const chg = it.value;
        const chgCls = chg == null ? "" : chg >= 0 ? "is-up" : "is-down";
        const rank = it[card.rankKey];
        const volRank = Number.isInteger(rank) ? ` · ${card.tf}成交额 TOP ${rank}` : "";
        // 名字下面一行放本周期涨跌幅与成交额名次，把整行宽度留给 chip（多数行一行排得下，一眼扫得完）
        return `<div class="reso__row">
            <span class="reso__rank">${i + 1}</span>
            <span class="reso__id">
                <a class="reso__sym" href="${escapeHtml(tvUrlFor(it.symbol))}" target="_blank" rel="noopener noreferrer" title="在 TradingView 打开 ${escapeHtml(it.symbol)} 图表">${escapeHtml(symbolDisplayParts(it.symbol).base)}</a>
                <span class="reso__ctx" title="${card.tf}涨跌幅${volRank ? `，${card.tf}成交额全市场名次` : ""}"><span class="${chgCls}">${fmtGapVal(chg)}</span>${volRank}</span>
            </span>
            <span class="reso__score" title="${axes.length} 根${tfName}轴里排进全市场前 ${card.top} 的根数（其中第一 ${x.top1} 根）"><b>${x.hits.length}</b>/${axes.length}</span>
            <span class="reso__chips">${chips}</span>
        </div>`;
    }).join("") : `<div class="reso__empty">${card.period}没有标的在 ${card.min} 根以上${tfName}轴同时排进全市场前 ${card.top}。</div>`;
    const more = rows.length > shown.length ? `，下面是前 ${shown.length} 个` : "";
    return `<div class="reso ${card.wide ? "reso--wide" : "reso--half"}">
        <div class="reso__head">
            <span class="reso__title">${tfName}共振</span>
            <span class="reso__meta" title="${escapeHtml(axes.map(a => a.label).join("、"))}">${axes.length} 根${tfName}排序轴里，全市场排进前 ${card.top} 名的根数 ≥ ${card.min} · 共 ${rows.length} 个${more} · ${card.refresh}</span>
        </div>${body}
    </div>`;
}

// 速览条每个周期列出的币名个数（多了在手机上一行放不下，后面的看展开的卡片）
const RESO_BAR_NAMES = 6;

// 默认只显示速览条：每个周期一行「N 个 + 前几个币名」；点「展开共振卡」才显示三张完整卡片（resoOpen，本机记忆）。
// 卡片 DOM 照常渲染、只切 hidden ⇒ 展开 / 收起不重算，也不影响排名口径。
function renderResonance() {
    const el = document.getElementById("resonance");
    if (!el) return;
    // 逐张 try：一张出错不连累另外两张
    const parts = RESO_CARDS.map(card => {
        try {
            const board = resonanceBoard(card);
            return board ? { card, board, html: resonanceCardHtml(card, board) } : null;
        } catch (e) { console.warn(`${card.tf}线共振卡渲染失败`, e); return null; }
    }).filter(Boolean);
    if (!parts.length) { el.hidden = true; return; }
    const lines = parts.map(({ card, board }) => {
        const names = board.rows.slice(0, RESO_BAR_NAMES).map(x => escapeHtml(symbolDisplayParts(x.item.symbol).base));
        const more = board.rows.length > names.length ? "、…" : "";
        const txt = names.length ? names.join("、") + more : `${card.period}没有`;
        return `<div class="reso-bar__line"><span class="reso-bar__tf">${card.tf}线共振</span><b class="reso-bar__n">${board.rows.length}</b><span class="reso-bar__names">${txt}</span></div>`;
    }).join("");
    el.innerHTML = `<div class="reso-bar">
        <div class="reso-bar__lines">${lines}</div>
        <button type="button" class="btn btn--ghost btn--sm reso-bar__toggle" id="resoToggle" aria-controls="resoCards" aria-expanded="${resoOpen}">${resoOpen ? "收起共振卡" : "展开共振卡"}</button>
    </div>
    <div class="resos" id="resoCards"${resoOpen ? "" : " hidden"}>${parts.map(p => p.html).join("")}</div>`;
    el.hidden = false;
}

/** 市场脉搏速览条（无缝状态条）：跟随当前资产切换,切 tab 立即重渲染。 */
function renderPulse() {
    // 概览条搭脉搏的调用点一起刷新；try 包住，它出错不能连累脉搏与主渲染链。
    try { renderMarketOverview(); } catch (e) { console.warn("市场概览渲染失败", e); }
    try { renderResonance(); } catch (e) { console.warn("共振卡渲染失败", e); }
    const el = document.getElementById("pulse");
    if (!el || !data) return;
    const tiles = cryptoPulseTiles();
    if (!tiles) { el.hidden = true; return; }
    el.innerHTML = tiles.join("");
    el.hidden = false;
}

// 脉搏只放「策略命中」一块：领涨这类磁贴要具体行数据，锁定态拿不到也不能伪造；命中数来自公开的 paidMeta。
function lockedPulseTile(asset, totalTabs) {
    const hits = strategyHits(asset);
    if (hits == null) return null;
    // 锁图标与「解锁查看」CTA 只在锁定态出（别对已付费用户喊去解锁）；命中数两态共用。
    const locked = PAYWALL_ENABLED && !license.valid;
    const sub = locked ? "解锁查看完整榜单与领涨标的" : unlockedPulseSub(asset);
    return [pulseTile("策略命中" + (locked ? " " + LOCK_SVG : ""), `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${totalTabs} 榜</span>`, sub)];
}

// 解锁态副标题：命中最多的策略榜（数据仍是公开的 paidMeta）；.pulse__sub 带省略号截断，长榜名撑不破磁贴。
// 只有一个策略榜的资产换一种措辞，按 keys.length 判、不写死资产名。
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

// ⚠️ 别为了凑满磁贴去 data[某个榜] 里取行：那是筛选结果不是全市场，写成「监控 N 个」会把命中数说成标的总数。
function cryptoPulseTiles() { return lockedPulseTile("加密", CRYPTO_STRATEGY_TABS); }

/** 首屏骨架行(静态灰条,无动画——GPU 硬约束) */
function renderSkeleton() {
    const tbody = document.getElementById("rankBody");
    if (!tbody) return;
    // 复用真实行的四列 class ⇒ 数据到位时不重排；pointer-events:none 关掉骨架 hover。
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

/** 拉付费全量数据，返回 {data, authFailed}。authFailed=true ＝ 确定性鉴权失败（401/402）：
 *  调用方据此推进 lastPaidUpdateTime，免得失效卡密的常开标签页每 30s 空打 Worker。 */
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
            license.plan = resp.headers.get("X-License-Plan"); // 供徽标「已解锁 · 季付」
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

// in-flight 守卫：setInterval 不 await、visibilitychange 也直接调，慢网下调用会叠加；
// 重叠调用都在 lastPaidUpdateTime 写入前读到旧值 ⇒ 同一小时重复打 Worker。
let loadInFlight = false;
async function loadData() {
    if (loadInFlight) return;
    loadInFlight = true;
    try {
        // ⚠️ 带宽：30 秒轮询绝不全量强拉。默认 no-cache 走条件请求（没变 ＝ 304），
        // 只有手头数据旧于 61 分钟（新一轮抓取该到了）才带 cache-buster 强穿 CDN。
        // 冷启动（data 为 null）不算到期：cache-buster 是全新缓存键，会白白放弃本可命中的 304。
        const lastT = data ? parseUpdateTime(data.updateTime) : null;
        const due = lastT != null && Date.now() - lastT > 61 * 60 * 1000;
        let url = "data/rankings.json";
        // 强穿间隔 2.5 分钟起；连续强穿都没拿到更新的数据（线上抓取中断）就指数退避到 20 分钟封顶，拿到即复位。
        let busted = false;
        const bustGap = Math.min(150000 * (2 ** bustStreak), 20 * 60 * 1000);
        if (due && Date.now() - lastBustAt > bustGap) {
            url += "?" + Date.now();
            lastBustAt = Date.now();
            busted = true;
        }
        const resp = await fetch(url, { cache: "no-cache" });
        const fresh = await resp.json();

        // 单调性守卫：强穿之后，普通请求可能从 CDN 边缘拿回上一小时的旧体 ⇒ 旧于手头的直接丢弃。
        // 每条管道的时间戳各查一个（ashareUpdateTime 这对现为休眠件）；增删管道时与下方 paidFetchKey、
        // renderKey、卡密表单里的 lastPaidUpdateTime 一起改。
        const freshT = parseUpdateTime(fresh.updateTime);
        const haveT = data ? parseUpdateTime(data.updateTime) : null;
        const freshAshareT = parseUpdateTime(fresh.ashareUpdateTime);
        const haveAshareT = data ? parseUpdateTime(data.ashareUpdateTime) : null;
        const rolledBack = (haveT && freshT && freshT < haveT)
            || (haveAshareT && freshAshareT && freshAshareT < haveAshareT);
        if (busted) bustStreak = (freshT != null && (haveT == null || freshT > haveT)) ? 0 : Math.min(bustStreak + 1, 3);
        if (rolledBack) {
            renderUpdatePill();   // 倒计时照常走（用手头数据）
            renderStaleBanner();
            return;
        }

        // 有卡密且任一管道时间戳变了才打 Worker（否则 30s 轮询会打爆免费额度）；付费墙关闭时 fresh 已是全量、不打。
        // ⚠️ 本键与下方 renderKey 前两段、卡密表单里的 lastPaidUpdateTime 必须同构（同字段同顺序）。
        const paidFetchKey = fresh.updateTime + "|" + fresh.ashareUpdateTime;
        if (PAYWALL_ENABLED && license.key && paidFetchKey !== lastPaidUpdateTime) {
            const paid = await fetchPaidData();
            // KV 的 updateTime 是上传时刻、公开文件的是 build 时刻（秒级字符串可能跨秒）⇒ 绝不能用严格相等；
            // 解析成时间后 >= 即采纳，早于免费数据的是 KV 边缘缓存回吐的旧付费体、拒收。
            const paidT = paid.data ? parseUpdateTime(paid.data.updateTime) : null;
            if (paid.data && paidT != null && (freshT == null || paidT >= freshT)) {
                paidData = paid.data;
                lastPaidUpdateTime = paidFetchKey;
            } else if (paid.authFailed) {
                // 确定性鉴权失败：推进 lastPaidUpdateTime，本周期不再重试
                lastPaidUpdateTime = paidFetchKey;
            }
            // 其余（付费数据滞后、5xx、网络错误）不推进，下一轮继续追。
            // fetchPaidData 会改 license.valid / reason（自动解锁、挂机中过期吊销）⇒ 徽标必须在这里跟着刷新。
            renderLicenseStatus();
        }

        data = { ...fresh, ...(license.valid && paidData ? paidData : {}) };
        data.updateTime = fresh.updateTime; // 新鲜度基准恒以免费文件（30s 轮询）为准

        renderUpdatePill();   // 倒计时每轮都要走
        renderStaleBanner();

        // 渲染键 ＝ 各管道时间戳（各自独立刷新，漏一个它的更新就不重渲染；与 paidFetchKey 同构）
        // + paidData 到位时刻（付费数据晚一轮才拉到时免费时间戳没变）+ license.valid（挂机中失效要重新上锁）。
        const renderKey = fresh.updateTime + "|" + fresh.ashareUpdateTime
            + "|" + (paidData ? paidData.updateTime : "") + "|" + (license.valid ? "1" : "0");
        if (renderKey !== lastRenderKey) {
            lastRenderKey = renderKey;
            renderPulse();
            renderNav();
            renderTable();
        }
    } catch (e) {
        // 失败染当前资产的胶囊（移动端只显示非 dim 的那一个）；加资产时必须在这里给它映射胶囊 id，别落进兜底。
        const pillId = currentAsset === "ashare" ? "freshAshare" : "freshCrypto";
        const pill = document.getElementById(pillId);
        if (pill) {
            pill.className = "fresh fresh--bad";
            document.getElementById(pillId + "Txt").textContent = " · 数据加载失败,稍后自动重试";
        }
        // 只有从未加载成功才在表格区报错；已有数据时单次失败别清掉用户正在看的榜单。
        if (!data) {
            document.getElementById("rankBody").innerHTML =
                '<div class="empty"><div class="empty__icon">⚠️</div><div class="empty__title">无法加载数据</div><div class="empty__desc">稍后自动重试</div></div>';
        }
    } finally {
        loadInFlight = false;   // 必须在 finally 里复位，否则一次异常就把轮询永久卡死
    }
}

// === 弹窗 ===

function initFooterUI() {
    document.querySelectorAll(".flink[data-dialog]").forEach(b =>
        b.addEventListener("click", () => document.getElementById(b.dataset.dialog).showModal()));
    document.querySelectorAll(".dialog-close").forEach(b =>
        b.addEventListener("click", () => document.getElementById(b.dataset.dialog).close()));
    // 点 backdrop 也能关：backdrop 点击的 target 是 <dialog> 本身，内容区的是子元素。
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
        // 先剥掉三种状态 class 再加当前的：本函数每轮轮询都会调，不剥自身会无限累积重复 class。
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

    document.getElementById("buyPlans")?.addEventListener("click", e => {
        const btn = e.target.closest(".buy-plan");
        if (!btn) return;
        selectedPlan = btn.dataset.plan;
        document.querySelectorAll(".buy-plan").forEach(b => b.classList.toggle("is-selected", b === btn));
    });
    document.querySelector(`.buy-plan[data-plan="${selectedPlan}"]`)?.classList.add("is-selected");

    // 输入通行证：直接拉一次付费数据判有效性（Worker 是唯一真相源，前端不另写校验）。
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
            // 合并后恢复免费文件的 updateTime：paidData 带的是 KV 上传时刻，留着会让下一轮单调性守卫把正常数据误判为回滚。
            const freeUpdateTime = data ? data.updateTime : null;
            data = { ...data, ...paidData };
            if (freeUpdateTime) data.updateTime = freeUpdateTime;
            // 公开数据还没到（没有 build 时刻可恢复）就删掉 KV 的上传时刻，理由同上。
            else delete data.updateTime;
            // 与 loadData 的 paidFetchKey / renderKey 同构，改一处三处一起改。
            lastPaidUpdateTime = data ? (data.updateTime + "|" + data.ashareUpdateTime) : null;
            renderLicenseStatus();
            if (msg) { msg.textContent = "解锁成功！"; msg.className = "lic-msg lic-ok"; }
            // 公开数据已在手就立即渲染；还没到时 data 只有付费部分、直接渲会瞬时空白 ⇒ 交给 loadData 合并后再渲。
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

    // 付款完成跳回本站会带 ?unlock=1（Worker 的 return_url）；webhook 异步发卡，此刻卡密未必已到邮箱，提示要如实。
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

// 清空勾选：selectedSymbols 跨榜累积（换 tab 不丢），而「全选」只管当前榜可见行。
document.getElementById("clearSelBtn").addEventListener("click", () => {
    selectedSymbols.clear();
    document.querySelectorAll(".symbol-check").forEach(c => { c.checked = false; });
    const ca = document.getElementById("checkAll");
    if (ca) ca.checked = false;
    updateExportBar();
});

document.getElementById("exportBtn").addEventListener("click", exportTradingViewTxt);

// === rail / 抽屉 导航事件（事件委托,nav 由 renderNav 动态生成）===
function bindNavEvents(rootId, closeDrawerAfter) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.addEventListener("click", e => {
        const seg = e.target.closest(".asset-seg__opt");
        // 切资产不关抽屉（让用户接着选榜；分段控件现为休眠件），选中具体榜才关。
        if (seg) { switchAsset(seg.dataset.k); return; }
        const item = e.target.closest(".nav-item");
        if (item) { switchTab(item.dataset.tab); if (closeDrawerAfter) closeDrawer(); }
    });
}
bindNavEvents("rail", false);
bindNavEvents("drawer", true);

// === 移动抽屉 ===
// 焦点管理：打开时背景设 inert（Tab 困在抽屉内、读屏读不到背景）并把焦点移入；关闭时撤掉 inert、焦点还给汉堡。
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
    // 只有真从打开态关闭才还焦点（未打开时全局 Esc 也会调到这里，别抢焦点）；清 inert 必须在 focus 之前。
    if (wasOpen) document.getElementById("hamburger").focus();
}
// Esc 关抽屉(dialog 自带 Esc,抽屉是自绘的要手动补;未开时是无害空操作)
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
document.getElementById("hamburger").addEventListener("click", openDrawer);
document.getElementById("drawerClose").addEventListener("click", closeDrawer);
document.getElementById("drawerScrim").addEventListener("click", closeDrawer);

// 抽屉体只注入导航容器（renderNav 往 #drawerNav 填）。资产分段控件已从这里与 index.html 的 rail 删除；
// .asset-seg 的 CSS、switchAsset 与点击委托保留为休眠件，复活 A股 时把两处 DOM 加回即可。
document.getElementById("drawerBody").innerHTML = `
    <nav class="board-nav" id="drawerNav"></nav>`;

// === 亮/暗主题切换（token 覆盖,组件零分叉）===
const LS_THEME = "bishuju_theme";
function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = t === "light" ? "☀" : "◐";
    // 切换时同步手机浏览器工具栏色（加载时由 index.html 内联脚本设）。
    // ⚠️ 两个 hex ＝ style.css 的 --bg1；index.html 内联脚本与 manifest 各有一份硬编码，改品牌色一起改。
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = t === "light" ? "#f0eee6" : "#141413";
}
applyTheme(safeStore.get("localStorage", LS_THEME) === "dark" ? "dark" : "light");
document.getElementById("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    safeStore.set("localStorage", LS_THEME, next);
    applyTheme(next);
});

// 榜单说明展开 / 收起（全站共用、本机记忆，见 syncNoteClamp）
document.getElementById("bhNoteToggle").addEventListener("click", () => {
    noteOpen = !noteOpen;
    safeStore.set("localStorage", LS_NOTE_OPEN, noteOpen ? "1" : "0");
    syncNoteClamp();
});
// 共振卡展开 / 收起：#resonance 每轮重渲染 innerHTML ⇒ 委托在外层；只切 hidden 与按钮文字，不重算。
document.getElementById("resonance").addEventListener("click", e => {
    const btn = e.target.closest("#resoToggle");
    if (!btn) return;
    resoOpen = !resoOpen;
    safeStore.set("localStorage", LS_RESO_OPEN, resoOpen ? "1" : "0");
    const cards = document.getElementById("resoCards");
    if (cards) cards.hidden = !resoOpen;
    btn.textContent = resoOpen ? "收起共振卡" : "展开共振卡";
    btn.setAttribute("aria-expanded", String(resoOpen));
});
// 宽度变了（转屏 / 拖窗口）说明是否溢出会变 ⇒ 重算「展开说明」按钮要不要出
let noteResizeTimer = 0;
window.addEventListener("resize", () => {
    clearTimeout(noteResizeTimer);
    noteResizeTimer = setTimeout(syncNoteClamp, 150);
});

// 收盘快照横幅关闭（永久记忆，见 renderSnapshotBanner；现只有休眠的 A股 用）
document.getElementById("snapshotBannerClose").addEventListener("click", () => {
    safeStore.set("localStorage", snapshotBannerDismissKey(), "1");
    document.getElementById("snapshotBanner").hidden = true;
});

// 新鲜度胶囊可点：切到对应资产（点当前资产是空操作）；若某资产复用别人的胶囊，要补显式空操作，否则会把用户切走。
document.getElementById("freshCrypto").addEventListener("click", () => switchAsset("crypto"));
// 复活 A股 时把 #freshAshare 的监听加回；胶囊 DOM 不在时留着监听会抛错、后面的监听全不绑定。

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

// 表格搜索（代码 / 名称过滤当前 tab，切 tab 清空）；150ms 防抖，大榜上每键全量重建 tbody 会卡输入。
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

// === 初始化 ===
const LS_TAB = "bishuju_last_tab";
const savedTab = safeStore.get("localStorage", LS_TAB);
if (savedTab && TABS_CONFIG[savedTab] && savedTab !== currentTab) switchTab(savedTab);
// ⚠️ 无条件把 .app 的 data-asset 同步到 currentAsset：index.html 写死了一个值，而上面那行不一定调 switchTab
// （无 savedTab 或它就是默认 tab）⇒ 默认资产与写死值不同时 CSS 作用域会错（A股 红绿颠倒）。别依赖 switchTab 的副作用。
const appEl = document.getElementById("app");
if (appEl) appEl.dataset.asset = currentAsset;
initFooterUI();
initPaywallUI();
renderNav();
renderSkeleton();
loadData();

// 每 30 秒轮询；后台标签页跳过（常开标签页的空轮询最费带宽 / 配额），回到前台立即补一轮。
setInterval(() => { if (!document.hidden) loadData(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
