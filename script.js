// === 排序轴 ===
// 轴的 key ＝ 行字段名，sortField 直接按它取值比较（null 沉底）。默认轴 sorts[0] 必须与后端 `value` 取的量一致，
// 否则首屏值列显示的是另一根轴的数。轴数别写进注释，要数就数下面的 sorts 常量。
//
// CVD强弱 ＝ 归一化买卖失衡比 ∈ [−1,+1]（后端 calc_cvd_strength）。不排原始 CVD：它随成交量缩放，跨标的排序≈排成交量。
// 带符号两位小数、不带 %（与涨跌幅共用值列，免得 +0.58 与 +5% 混淆）；中性不上色。
// 舍入后为 0 一律写「0.00」、不带正负号（同 fmtTakerVal）：后端 round 掉的小负数是 -0.0，写 `x >= 0` 会印成「+0.00」；
//   fmtGapVal / fmtRsiGapVal 同一条规则、各写各的（见 fmtRsiGapVal 上方）。
function fmtCvdVal(x) {
    if (x == null) return "—";
    const s = x.toFixed(2);
    return s === "0.00" || s === "-0.00" ? "0.00" : (x > 0 ? "+" : "") + s;
}
// 订单流三轴（同一个失衡比，量的是真实主动成交）刻意例外：值天然挤在 0 附近、绝大多数是个位数百分比的负值，
//   toFixed(2) 会把几百个币压成十几档、还冒出「+0.00 / −0.00」⇒ ×100 按百分比两位小数显示（% 在这里有实义：净主动买占成交量）。
// ⚠️ 别复用 fmtCvdVal，也别反过来把 CVD强弱 改成百分比（它分布宽、两位小数够用）。舍入后为 0 一律显示「0.00%」，不带正负号。
function fmtTakerVal(x) {
    if (x == null) return "—";
    const s = (x * 100).toFixed(2);
    return (s === "0.00" || s === "-0.00" ? "0.00" : (x > 0 ? "+" : "") + s) + "%";
}
function fmtRsiVal(x) { return x == null ? "—" : x.toFixed(2); }
// 成交额显示串是后端拼好的字符串、原样进 innerHTML ⇒ 转义（其余格式化都对数字做 toFixed，混不进标记；
// 付费 KV 凭上传 token 可写，别让那把 token 顺带变成往付费用户页面里塞脚本的口子）。
function fmtVolVal(v) { return v.volumeFormatted != null ? escapeHtml(v.volumeFormatted) : "—"; }
// 周 / 月成交额读各自的显示串。⚠️ 别复用 fmtVolVal（写死读日成交额的 volumeFormatted）：
// 套上去会显示日成交额、却按周 / 月成交额排序，不报错。
function fmtWeeklyVolVal(v) { return v.weeklyVolumeFormatted != null ? escapeHtml(v.weeklyVolumeFormatted) : "—"; }
function fmtMonthlyVolVal(v) { return v.monthlyVolumeFormatted != null ? escapeHtml(v.monthlyVolumeFormatted) : "—"; }
// 全市场成交额名次「TOP N」徽标（写成工厂，别拆成三份近亲函数）：只在按对应「X成交额」轴排序时挂在值列数字左侧
// （renderTable 读轴定义上的 `badge`）。名次字段：日 volumeRank / 周 weeklyVolumeRank / 月 monthlyVolumeRank，
// 「全市场」＝ 同周期涨跌幅榜的全部行（悬停提示里的总数取 paidMeta；那张榜不在时退化成不带总数，文字照样正确）。
// ⚠️ 一个周期一个名次 key，别合并成 volumeRank：行上的通用 key（`volume` / `volumeRank`）在所有榜里都是日线值，
//    周 / 月线值带前缀（`weeklyVolume` / `monthlyVolume`）；共用 key 会让徽标说错周期。
// 数据驱动：行上没有该整数字段就不渲染（名次进 innerHTML，只认整数）。A股（10-19 复活）行也带名次、在 A股 全市场里排 ⇒ 悬停的总数取 ashareUniverseTab；
// 四位数名次 10-19 在 320 / 375 / 641 / 700 / 860 / 1280 宽量过不撑出值列（641–700 宽是代码列截成「000…」，见 frontend.md）。
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
// 舍入后为 0 不带正负号（理由见 fmtCvdVal）：「周涨跌幅恒为负」那类说明碰上 -0.0 别印成「+0.00%」。
function fmtGapVal(x) {
    if (x == null) return "—";
    const s = x.toFixed(2);
    return (s === "0.00" || s === "-0.00" ? "0.00" : (x > 0 ? "+" : "") + s) + "%";
}
// 振幅 / 波动幅度：恒非负的百分比，不带符号。
function fmtAmpVal(x) { return x == null ? "—" : x.toFixed(2) + "%"; }
// ADX / +DI：0–100 的无量纲指数，不带 %（同 TV 显示口径）。
function fmtDmiVal(x) { return x == null ? "—" : x.toFixed(2); }
// 日 / 周 / 月 / N 日 / 小时级RSI缺口：RSI 点数之差、有正有负 ⇒ 带符号两位小数、不带 %（与 fmtCvdVal 同格式，分开写免得两边口径一改互相牵连）。
function fmtRsiGapVal(x) {
    if (x == null) return "—";
    const s = x.toFixed(2);
    return s === "0.00" || s === "-0.00" ? "0.00" : (x > 0 ? "+" : "") + s;
}
// 整数根数（日SAR多头根数）：带「根」不写「天」（A股 一根是交易日）。别复用 toFixed(2) 的格式化，会显示成「3.00」。
function fmtBarsVal(x) { return x == null ? "—" : escapeHtml(x) + " 根"; }

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
// 休眠件（10-18 拆成八张前「1~8日线」并集那张用；复活 ＝ 那张的 subFormat 前面拼回它）：行上 `hitDays`（如 [1, 3, 8]）→ 副行最前一段「命中 1·3·8日」，
// 不占轴额度、不是排序轴。
function hitDaysSub(item) {
    const d = Array.isArray(item.hitDays) ? item.hitDays.filter(n => Number.isInteger(n)) : [];
    if (!d.length) return "";
    const tip = `命中周期：${d.map(n => n + "日").join("、")}K线`;
    return `<span class="sub__seg sub__seg--hit" title="${escapeHtml(tip)}">命中 ${escapeHtml(d.join("·"))}日</span><span class="sub__sep"> | </span>`;
}
// 休眠件（「4H~12H…」10-18 移除；复活 ＝ TABS_CONFIG 那张的 subFormat 前面拼回它）：行上 `hitHours`（如 [4, 12]）→ 副行最前一段「命中 4·12H」。
function hitHoursSub(item) {
    const d = Array.isArray(item.hitHours) ? item.hitHours.filter(n => Number.isInteger(n)) : [];
    if (!d.length) return "";
    const tip = `命中周期：${d.map(n => n + "H").join("、")}K线`;
    return `<span class="sub__seg sub__seg--hit" title="${escapeHtml(tip)}">命中 ${escapeHtml(d.join("·"))}H</span><span class="sub__sep"> | </span>`;
}
// 行上命中周期列表（`key` 指字段，默认 `hitTfs`）如 ["1D", "1W"] → 副行最前一段「命中 日·周」（同 hitDaysSub 的金字段、不占 SUB_AXES_MAX 额度、不是排序轴）。
const HIT_TF_LABEL = { "1D": "日", "2D": "2日", "3D": "3日", "1W": "周", "1M": "月" };
function hitTfsSub(item, key = "hitTfs") {
    const t = Array.isArray(item[key]) ? item[key].filter(x => HIT_TF_LABEL[x]) : [];
    if (!t.length) return "";
    const tip = `命中周期：${t.map(x => HIT_TF_LABEL[x] + "线").join("、")}`;
    return `<span class="sub__seg sub__seg--hit" title="${escapeHtml(tip)}">命中 ${escapeHtml(t.map(x => HIT_TF_LABEL[x]).join("·"))}</span><span class="sub__sep"> | </span>`;
}
function axesSub(item, sf, volLabel, extra) {
    const seg = [];
    // 小时级六张 / 2~8 日线七张 / 月线各张：本周期 RSI 缺口排第一段（`hourRsiSmaGap` / `multiDayRsiSmaGap` / `monthlyRsiSmaGap` 只在各自那几张的行上，
    //   别的榜副行不变）。「距历史高点」那段休眠（`athDistPct` 现役行不带）。
    if ("athDistPct" in item && sf !== "athDistPct") seg.push(`${axisLabelFor("athDistPct", "距历史高点")} ${fmtAthDistVal(item.athDistPct)}`);
    if ("hourRsiSmaGap" in item && sf !== "hourRsiSmaGap") seg.push(`${axisLabelFor("hourRsiSmaGap", "RSI缺口")} ${fmtRsiGapVal(item.hourRsiSmaGap)}`);
    if ("multiDayRsiSmaGap" in item && sf !== "multiDayRsiSmaGap") seg.push(`${axisLabelFor("multiDayRsiSmaGap", "RSI缺口")} ${fmtRsiGapVal(item.multiDayRsiSmaGap)}`);
    if ("monthlyRsiSmaGap" in item && sf !== "monthlyRsiSmaGap") seg.push(`${axisLabelFor("monthlyRsiSmaGap", "月RSI缺口")} ${fmtRsiGapVal(item.monthlyRsiSmaGap)}`);
    if (sf !== "rsi") seg.push(`${axisLabelFor("rsi", "RSI")} ${fmtRsiVal(item.rsi)}`);
    // volLabel 由调用方显式传：同一个 volume 字段在日 / 周 / 月榜含义不同。
    if (sf !== "volume") seg.push(`${volLabel} ${fmtVolVal(item)}`);
    if (sf !== "cvdStrength") seg.push(`${axisLabelFor("cvdStrength", "CVD强弱")} ${fmtCvdVal(item.cvdStrength)}`);
    if ("weeklyRsi" in item && sf !== "weeklyRsi") seg.push(`${axisLabelFor("weeklyRsi", "周线RSI")} ${fmtRsiVal(item.weeklyRsi)}`);
    if ("takerStrength" in item && sf !== "takerStrength") seg.push(`${axisLabelFor("takerStrength", "订单流")} ${fmtTakerVal(item.takerStrength)}`);
    // 距前高：现役行都不带这个 key（休眠段）。
    if ("highDist" in item && sf !== "highDist") seg.push(`${axisLabelFor("highDist", "距前高")} ${fmtGapVal(item.highDist)}`);
    if ("adx" in item && sf !== "adx") seg.push(`${axisLabelFor("adx", "ADX")} ${fmtDmiVal(item.adx)}`);
    if ("diPlus" in item && sf !== "diPlus") seg.push(`${axisLabelFor("diPlus", "+DI")} ${fmtDmiVal(item.diPlus)}`);
    if ("macdStrength" in item && sf !== "macdStrength") seg.push(`${axisLabelFor("macdStrength", "MACD强弱")} ${fmtGapVal(item.macdStrength)}`);
    // 涨跌幅榜的行去掉了与 `value` 重复的那个 key（日线榜 changePercent、周线榜 weeklyChangePercent、月线榜 monthlyChangePercent；尾巴由 changeSub 处理）⇒ 不会重复显示。
    if ("changePercent" in item && sf !== "changePercent") seg.push(`${axisLabelFor("changePercent", "涨跌幅")} ${fmtGapVal(item.changePercent)}`);
    if ("weeklyChangePercent" in item && sf !== "weeklyChangePercent") seg.push(`${axisLabelFor("weeklyChangePercent", "周涨跌幅")} ${fmtGapVal(item.weeklyChangePercent)}`);
    if ("sarBullBars" in item && sf !== "sarBullBars") seg.push(`${axisLabelFor("sarBullBars", "SAR多头根数")} ${fmtBarsVal(item.sarBullBars)}`);
    // 周 / 月成交额用各自的 fmtWeeklyVolVal / fmtMonthlyVolVal（别套 fmtVolVal，那个写死读日成交额）；月成交额 / 月线RSI 两段在截断线之后（默认副行不变）。
    if ("weeklyVolume" in item && sf !== "weeklyVolume") seg.push(`${axisLabelFor("weeklyVolume", "周成交额")} ${fmtWeeklyVolVal(item)}`);
    if ("monthlyVolume" in item && sf !== "monthlyVolume") seg.push(`${axisLabelFor("monthlyVolume", "月成交额")} ${fmtMonthlyVolVal(item)}`);
    // 月涨跌幅：月涨跌幅榜的行不带这个 key（与 `value` 重复，同上面日 / 周涨跌幅）。
    if ("monthlyChangePercent" in item && sf !== "monthlyChangePercent") seg.push(`${axisLabelFor("monthlyChangePercent", "月涨跌幅")} ${fmtGapVal(item.monthlyChangePercent)}`);
    if ("monthlyRsi" in item && sf !== "monthlyRsi") seg.push(`${axisLabelFor("monthlyRsi", "月线RSI")} ${fmtRsiVal(item.monthlyRsi)}`);
    if ("weeklyCvdStrength" in item && sf !== "weeklyCvdStrength") seg.push(`${axisLabelFor("weeklyCvdStrength", "周CVD强弱")} ${fmtCvdVal(item.weeklyCvdStrength)}`);
    // 只在对应周期涨跌幅榜的行上有（策略榜行不带）。
    if ("weeklyTakerStrength" in item && sf !== "weeklyTakerStrength") seg.push(`${axisLabelFor("weeklyTakerStrength", "周订单流")} ${fmtTakerVal(item.weeklyTakerStrength)}`);
    if ("monthlyCvdStrength" in item && sf !== "monthlyCvdStrength") seg.push(`${axisLabelFor("monthlyCvdStrength", "月CVD强弱")} ${fmtCvdVal(item.monthlyCvdStrength)}`);
    if ("monthlyTakerStrength" in item && sf !== "monthlyTakerStrength") seg.push(`${axisLabelFor("monthlyTakerStrength", "月订单流")} ${fmtTakerVal(item.monthlyTakerStrength)}`);
    if ("weeklyAdx" in item && sf !== "weeklyAdx") seg.push(`${axisLabelFor("weeklyAdx", "周ADX")} ${fmtDmiVal(item.weeklyAdx)}`);
    if ("weeklyDiPlus" in item && sf !== "weeklyDiPlus") seg.push(`${axisLabelFor("weeklyDiPlus", "周+DI")} ${fmtDmiVal(item.weeklyDiPlus)}`);
    if ("monthlyDiPlus" in item && sf !== "monthlyDiPlus") seg.push(`${axisLabelFor("monthlyDiPlus", "月+DI")} ${fmtDmiVal(item.monthlyDiPlus)}`);
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
// 行情榜四张（日 / 3日 / 周 / 月线涨跌幅）的副行：只列本榜排序条上的轴（全是本周期的；后端行上也只带本周期字段 ⇒ 不会冒出别的周期），
// 当前排序轴与首轴涨跌幅不重复列；尾巴同 changeSub（排涨跌幅时是「开 → 收」，排别的轴时补一段本周期涨跌幅）。
// 别换回 changeSub / axesSub：那两个按固定白名单出段、成交额那段写死读日成交额，套在周 / 月 / 3日行上会显示「—」。
function marketSub(v, sf) {
    const sorts = (TABS_CONFIG[currentTab] || {}).sorts || [];
    const seg = sorts.filter(a => a.key !== "value" && a.key !== sf).slice(0, SUB_AXES_MAX)
        .map(a => `<span class="sub__seg">${a.label} ${a.format(v)}</span>`);
    const tail = sf === "value" ? (isAshareTab(currentTab) ? ashareMktCtx(v) : cryptoPriceCtx(v)) : `${axisLabelFor("value", "涨跌幅")} ${fmtGapVal(v.value)}`;
    seg.push(`<span class="sub__seg sub__seg--ctx">${tail}</span>`);
    return seg.join('<span class="sub__sep"> | </span>');
}
// A股：close-to-close，前收 / 现收标签随周期不同（ASHARE_PRICE_LABELS），人民币价；preClose / close 由后端行提供。
const asharePriceCtx = (preLabel, curLabel) => v => `${preLabel} ${fmtCnyPrice(v.preClose)} → ${curLabel} ${fmtCnyPrice(v.close)}`;
function ashareMktCtx(v) {
    const [a, b] = ASHARE_PRICE_LABELS[(TAB_META[currentTab] || {}).tf] || ["前收", "收"];
    return asharePriceCtx(a, b)(v);
}

// === 轴常量 { key, label, format, hint?, badge? }：key ＝ 行字段名（改 key 要连带后端行字段）===
// 策略榜行里日线字段不带前缀、周 / 月线字段带 weekly / monthly 前缀，同一行并存 —— 两个周期别共用 key（会互相覆盖）。
// 标签一律写明周期（日 / 周 / 月）：策略榜的筛选横跨多个周期、行里同时装着各周期的值，光写「RSI」看不出是哪根 K。
const AXIS_WRSI = { key: "weeklyRsi", label: "周线RSI", format: v => fmtRsiVal(v.weeklyRsi) };
// 月线RSI：≥16 根已收盘月 K 才有值（不足显示「—」、两个方向都沉底）；与月成交额都是站长删过又要回来的，别拿冗余度删。
const AXIS_MRSI = { key: "monthlyRsi", label: "月线RSI", format: v => fmtRsiVal(v.monthlyRsi) };
const AXIS_D_RSI = { key: "rsi", label: "日线RSI", format: v => fmtRsiVal(v.rsi) };
const AXIS_D_RSIGAP = { key: "rsiSmaGap", label: "日RSI缺口", format: v => fmtRsiGapVal(v.rsiSmaGap),
                        hint: "日线RSI(14)减去它自己的14日SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几天动能冲得越急。只看相对排名；回放360天里缺口最大的一成次日收涨40.8%、全市场45.7%，更像短线过热、不是买点；上市不足28天显示「—」" };
// 周RSI缺口：同一个后端 calc_rsi_sma_gap 喂已收盘周 K（周线缓存 rsiSmaGap）；标签「周」开头 ⇒ 自动进周线共振卡。
const AXIS_W_RSIGAP = { key: "weeklyRsiSmaGap", label: "周RSI缺口", format: v => fmtRsiGapVal(v.weeklyRsiSmaGap),
                        hint: "周线RSI(14)减去它自己的14周SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几周动能冲得越急。只看相对排名；回放104周里缺口最大的一成下周收涨40.2%、全市场42.3%，不是买点；一周只更新一次，上市不足28周显示「—」" };
// 小时级六张的本周期 RSI 缺口：同一个后端 calc_rsi_sma_gap 喂该周期的小时 K（1H 用 1h 存档、其余用 2h 存档拼）。key 六根同名 `hourRsiSmaGap`（行字段只在这六张的行上、
// 值按本张周期取），标签各写周期；标签不以「日 / 周 / 月」开头 ⇒ 进不了共振卡（休眠件，本就不该进）。
const AXIS_H1_RSIGAP = { key: "hourRsiSmaGap", label: "1H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "1H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 1H K 收盘才更新，不足28根显示「—」" };
const AXIS_H2_RSIGAP = { key: "hourRsiSmaGap", label: "2H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "2H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 2H K 收盘才更新，不足28根显示「—」" };
const AXIS_H4_RSIGAP = { key: "hourRsiSmaGap", label: "4H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "4H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 4H K 收盘才更新，不足28根显示「—」" };
const AXIS_H6_RSIGAP = { key: "hourRsiSmaGap", label: "6H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "6H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 6H K 收盘才更新，不足28根显示「—」" };
const AXIS_H8_RSIGAP = { key: "hourRsiSmaGap", label: "8H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "8H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 8H K 收盘才更新，不足28根显示「—」" };
const AXIS_H12_RSIGAP = { key: "hourRsiSmaGap", label: "12H RSI缺口", format: v => fmtRsiGapVal(v.hourRsiSmaGap),
                         hint: "12H RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 12H K 收盘才更新，不足28根显示「—」" };
// 2~8 日线七张的本周期 RSI 缺口：同一个后端 calc_rsi_sma_gap 喂全历史日 K 拼的 TV 年锚 N 日K（同那七张的判据用的 K）。key 七根同名 `multiDayRsiSmaGap`
// （行字段只在这七张的行上、值按本张周期取），标签各写周期；标签以数字开头 ⇒ 进不了共振卡。
const AXIS_D2_RSIGAP = { key: "multiDayRsiSmaGap", label: "2日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "2日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 2日K 收盘才更新，不足28根显示「—」" };
const AXIS_D3_RSIGAP = { key: "multiDayRsiSmaGap", label: "3日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "3日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 3日K 收盘才更新，不足28根显示「—」" };
const AXIS_D4_RSIGAP = { key: "multiDayRsiSmaGap", label: "4日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "4日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 4日K 收盘才更新，不足28根显示「—」" };
const AXIS_D5_RSIGAP = { key: "multiDayRsiSmaGap", label: "5日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "5日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 5日K 收盘才更新，不足28根显示「—」" };
const AXIS_D6_RSIGAP = { key: "multiDayRsiSmaGap", label: "6日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "6日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 6日K 收盘才更新，不足28根显示「—」" };
const AXIS_D7_RSIGAP = { key: "multiDayRsiSmaGap", label: "7日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "7日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 7日K 收盘才更新，不足28根显示「—」" };
const AXIS_D8_RSIGAP = { key: "multiDayRsiSmaGap", label: "8日RSI缺口", format: v => fmtRsiGapVal(v.multiDayRsiSmaGap),
                         hint: "8日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；每根 8日K 收盘才更新，不足28根显示「—」" };
// 月RSI缺口：月线缓存只有 RSI、没有缺口 ⇒ 后端拿全历史日 K 拼月K 算（只认已收盘月 K，同月线RSI）；只挂月线各张（行字段 `monthlyRsiSmaGap` 只在那几张的行上）。
// 标签「月」开头，但共振卡的轴集取自三张涨跌幅榜（休眠）、不含它 ⇒ 不进月线共振卡。
const AXIS_M_RSIGAP = { key: "monthlyRsiSmaGap", label: "月RSI缺口", format: v => fmtRsiGapVal(v.monthlyRsiSmaGap),
                        hint: "月线RSI(14)减去它自己的14个月SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几个月动能冲得越急。只看相对排名、不是买点；一个月只更新一次，上市不足28个月显示「—」" };
// 日成交额：最新已收盘那根日 K 的单日成交额（不是累计、不是均值）；badge ＝ 全市场名次「TOP N」，见 volRankBadgeFor。
const AXIS_D_VOL = { key: "volume", label: "日成交额", format: v => fmtVolVal(v), badge: volRankBadge };
// 日涨跌幅：挂在全部策略榜与周 / 月涨跌幅榜；日涨跌幅榜自己刻意不挂（首轴 `value` 本身就是日涨跌幅，挂了就是同一个量出现两次）。
// ⚠️ key 是 `changePercent` 不是 `value`（策略榜的 `value` 是日成交额）⇒ 按它排序时值列不上红绿（上色要求 tab 在
//    CHANGE_PCT_TABS 且 `sortField === "value"`），靠正负号区分，是知情取舍。
// 两资产口径不同是刻意的（加密 K 线实体、A股 相对前收含跳空），别"统一"。hint 只写口径、不写策略断言。
// hint 写加密口径；A股 的版本见 ASHARE_AXIS_HINT（镜像时按轴 key 换掉），改这里时看一眼那边。
const AXIS_D_CHGPCT = { key: "changePercent", label: "日涨跌幅", format: v => fmtGapVal(v.changePercent),
                        hint: "最新已收盘那根日K的涨跌幅：K线实体(收−开)/开，不含跳空" };
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
                       hint: "真实主动成交（taker 数据）：日线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，回放里与之后涨跌几乎无关，不是买卖信号" };

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

// === 距历史高点（休眠：行字段 athDistPct 后端照发、现役行不带）：（上市以来最高价 ÷ 最新日收盘 − 1）× 100，恒 ≥ 0 ===
// 复活 ＝ TABS_CONFIG 那张写回 sorts: athDistSorts + TAB_GROUPS 条目 + 后端列表（后端也要按它排）。
// 这张的 sorts[0]（后端也按它降序排，两边一起改）。跨度极大（回放最大约 7 万 %）⇒ 值列紧凑写法、不画深度条（线性条会被头几名压扁）；
//   标签不以「日 / 周 / 月」开头 ⇒ group 自成一组。与休眠的「距前高」highDist（窗口最高价、≤ 0）不是一回事。
function fmtAthDistVal(x) {
    if (x == null) return "—";
    // 档位按舍入后的值判（999.96 别印成「+1000.0%」、9999.6 别印成「+10,000%」）
    if (Math.round(x) >= 10000) return "+" + (x / 10000).toFixed(1) + "万%";
    if (Math.round(x * 10) / 10 >= 1000) return "+" + Math.round(x).toLocaleString("en-US") + "%";
    return "+" + x.toFixed(1) + "%";
}
const AXIS_ATH_DIST = { key: "athDistPct", label: "距历史高点", format: v => fmtAthDistVal(v.athDistPct), noBar: true, group: "高点",
    hint: "回到历史高点还要涨多少：上市以来全部已收盘日K的最高价（含影线）÷ 最新已收盘日K的收盘价 − 1。降序＝离高点最远；上市当天的插针也算历史高点" };

// 日线 TV 内置指标十四根（日SMIO … 日PPO柱，2026-09-22 加）2026-10-01 站长删了、后端停算停发：复活要先恢复后端 compute 块与行字段
//   （只加轴＝永远全 null 的幽灵轴，见后端 pipeline.md「休眠件」），轴常量 / tvDailySorts / axesSub 段 / fmtOscVal·fmtLevelVal 去 web 的 git 历史拿。

// === 周ADX / 周+DI（同一个 calc_adx_dmi，喂最新已收盘周 K，≥28 根）：两根都在役，各轴集周线块「周CVD强弱 → 周ADX → 周+DI」（同日线 ADX 在 +DI 前）===
// 别再建一个把两根一起展开的数组（各轴集是逐个挂的，一起展开会重复）。周ADX 不含方向 ⇒ hint 写明降序＝趋势最强（涨跌都算）、别写成看涨信号。
const AXIS_W_ADX = { key: "weeklyAdx", label: "周ADX", format: v => fmtDmiVal(v.weeklyAdx),
                     hint: "最新已收盘周K的ADX（DMI 14，对齐TV）：只量趋势有多强、不分涨跌，0–100；降序＝趋势最强（大涨大跌都会高），升序＝最没趋势；上市不足28周显示「—」" };
const AXIS_W_DIPLUS = { key: "weeklyDiPlus", label: "周+DI", format: v => fmtDmiVal(v.weeklyDiPlus),
                        hint: "最新已收盘周K的+DI（DMI 14，对齐TV）：多方方向压力，0–100；上市不足28周显示「—」" };
// === 月+DI（同一个 calc_adx_dmi，喂最新已收盘月 K）：各轴集月线块的最后一根（月成交额 → 月涨跌幅 → 月线RSI → 月+DI；月线涨跌幅榜里接着是月CVD强弱、月订单流）===
// 门槛 15 根 ＝ TV 的 +DI 起画根数、不是日 / 周线的 28 根（月线 15–27 根的合约约占三成，理由见后端 get_monthly_rsi）⇒ hint 别照抄周线那句「28」。
// 标签「月」开头 ⇒ 自动进月线共振卡。hint 的回放数字只含现存合约，别写成买点。
const AXIS_M_DIPLUS = { key: "monthlyDiPlus", label: "月+DI", format: v => fmtDmiVal(v.monthlyDiPlus),
                        hint: "最新已收盘月K的+DI（DMI 14，对齐TV）：多方方向压力，0–100，一个月只更新一次。回放48个月里+DI最高的一成下个月收涨39.4%、全市场37.0%，按月比只有一半略多的月份跑赢，不是买点；上市不足15个月显示「—」" };
// 「月POC距离」轴（连同 monthlyPocSorts / pocSub / fmtPocPrice）2026-10-06 随用它的那张榜移除删掉、后端停算停发：
//   复活要先恢复后端 POC 抓取与行字段（见后端 pipeline.md「休眠件」），前端这几样去 web 的 git 历史拿（移除前最后一版 c3d4c4a）。

// === 周MACD强弱 ＝ (PPO线 + 5×PPO柱)/6（权重依据见后端 calc_macd_strength）：只挂行情榜周线那张（策略榜没挂）===
// 百分比量 ⇒ 用 fmtGapVal（别用不带 % 的 fmtDmiVal）。
const AXIS_W_MACD = { key: "weeklyMacdStrength", label: "周MACD强弱",
                      format: v => fmtGapVal(v.weeklyMacdStrength) };

// === 周 / 月成交额：最新已收盘那一根周 / 月 K 的成交额（与周 / 月涨跌幅榜同 symbol 那行的 weeklyVolume / monthlyVolume 同一个数），不是滚动累计 ===
// 各挂本周期的全市场名次徽标。两根都在役：与日成交额高度相关是已知的，站长都删过又要回来，别拿冗余度删。
const AXIS_W_VOL = { key: "weeklyVolume", label: "周成交额", format: v => fmtWeeklyVolVal(v), badge: weeklyVolRankBadge,
                     hint: "最新已收盘那一根周K的成交额（不是近7天滚动累计），一周只更新一次" };
const AXIS_M_VOL = { key: "monthlyVolume", label: "月成交额", format: v => fmtMonthlyVolVal(v), badge: monthlyVolRankBadge,
                     hint: "最新已收盘那一根月K的成交额（不是近30天滚动累计），一个月只更新一次" };
// 周涨跌幅：最新已收盘那一根周 K 的涨跌幅，与周涨跌幅榜同 symbol 那行的 `value` 是同一个数（后端取同一份缓存字段、别另算）。
// 其余同 AXIS_D_CHGPCT：挂在全部策略榜与日 / 月涨跌幅榜、周涨跌幅榜自己不挂；两资产口径不同别统一、hint 只写口径。
const AXIS_W_CHGPCT = { key: "weeklyChangePercent", label: "周涨跌幅", format: v => fmtGapVal(v.weeklyChangePercent),
                        hint: "最新已收盘那一根周K的涨跌幅：K线实体(收−开)/开，一周只更新一次" };
// 月涨跌幅：同周涨跌幅，换成最新已收盘那一根月 K（与月涨跌幅榜同 symbol 那行的 `value` 同一个数）。月涨跌幅榜自己不挂
//   （首轴 AXIS_M_CHG 就是它）⇒ 月线共振卡的轴不变。A股 照用（镜像），悬停提示换成 A股 口径（ASHARE_AXIS_HINT）。
const AXIS_M_CHGPCT = { key: "monthlyChangePercent", label: "月涨跌幅", format: v => fmtGapVal(v.monthlyChangePercent),
                        hint: "最新已收盘那一根月K的涨跌幅：K线实体(收−开)/开，一个月只更新一次" };
// 周CVD强弱：同「日CVD强弱」的算法（K 线形态拆买卖量 → EMA14 → 归一化失衡比 ∈ [−1,+1]），喂已收盘周 K；≥15 根周 K 才有值、
// 不够显示「—」并在两个方向都沉底。与周涨跌幅榜排序条上的「周CVD强弱」是同一个数（后端取同一份周线缓存字段）。
// 形态推断、不是真实归边 ⇒ 横截面上主要在读周线级「最近在涨」；hint 只写口径，别写成资金流信号。
const AXIS_W_CVD = { key: "weeklyCvdStrength", label: "周CVD强弱", format: v => fmtCvdVal(v.weeklyCvdStrength),
                     hint: "按周K线形态推断的买卖失衡（约14周平滑），不是真实成交归边；上市不足15周显示「—」" };
// 周线EMA间距 ＝ (周EMA9 − 周EMA21)/周EMA21 × 100，可正可负；零消费者保留，复活方式同上。
// 文案里别断言哪一端更强（审计显示方向性只是跌市 beta）。
const AXIS_W_EMAGAP = { key: "weeklyEmaGap", label: "周线EMA间距", format: v => fmtGapVal(v.weeklyEmaGap) };

// A股 策略榜轴集（休眠件）：与 cryptoStrategySorts 逐根对齐，少「日订单流」（tushare 日线无 taker 归边，数据源硬边界）——
// 另少「日 / 周RSI缺口」「月涨跌幅」与「月+DI」（加轴时 A股 已休眠、没同补，见 fetch_ashare.py 复活清单 ⑦）——
// 别并进加密那套、也别硬凑（会成永远全 null 的幽灵轴）；首轴日成交额须与 fetch_ashare.py 行构造的 `value` 一致。
const singleStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_CVD,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                             AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_CVD, AXIS_W_ADX, AXIS_W_DIPLUS,
                             AXIS_M_VOL, AXIS_MRSI];
// 加密全部策略榜共用的轴集（行统一由后端 `_strategy_row` 产出）。别拆成几份近亲常量：选错一个不报错、只能肉眼发现。
// ⚠️ 首轴即默认排序，必须与后端 `value`（日成交额）一致 ⇒ 别把新轴插到最前。按「日 → 周 → 月」分块，新轴加在所属周期块内、
//    别打乱既有 chip 的相对位置；排序条桌面端换行、移动端横滑，加轴后在 1280 / 768 / 375 三档实测。
// 加轴要后端 `_strategy_row` 先补字段（只加轴＝永远全 null 的幽灵轴），并同批加 axesSub 段；一改就是全部加密策略榜一起变，
//   下方三张涨跌幅榜的轴集照抄本数组 ⇒ 同批改那三份。
// 已移除的轴后端行字段照发 ⇒ audit A 项把它们列成「行上未挂轴的字段」是预期提示，不是失败。
const cryptoStrategySorts = [AXIS_D_VOL, AXIS_D_CHGPCT, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                             ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS,
                             AXIS_W_VOL, AXIS_W_CHGPCT, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_ADX, AXIS_W_DIPLUS,
                             AXIS_M_VOL, AXIS_M_CHGPCT, AXIS_MRSI, AXIS_M_DIPLUS];

// 小时级六张：全部加密策略榜那套轴 ＋ 末尾一根本周期的 RSI 缺口（排序条上自成一组）。写成 `[...cryptoStrategySorts, AXIS_*]`：audit A 认得展开、
// 改 cryptoStrategySorts 自动跟着变；别改成 slice / 运行时拼（audit 的正则解析不了，会报「解析不到」）。
const hour4StrategySorts = [...cryptoStrategySorts, AXIS_H4_RSIGAP];
const hour6StrategySorts = [...cryptoStrategySorts, AXIS_H6_RSIGAP];
const hour8StrategySorts = [...cryptoStrategySorts, AXIS_H8_RSIGAP];
const hour12StrategySorts = [...cryptoStrategySorts, AXIS_H12_RSIGAP];
const hour1StrategySorts = [...cryptoStrategySorts, AXIS_H1_RSIGAP];
const hour2StrategySorts = [...cryptoStrategySorts, AXIS_H2_RSIGAP];
// 2~8 日线七张 / 月线各张：同上，末尾挂本周期的 RSI 缺口（N 日那根在排序条上自成一组；月那根接在月线块末尾、同组）。
const day2StrategySorts = [...cryptoStrategySorts, AXIS_D2_RSIGAP];
const day3StrategySorts = [...cryptoStrategySorts, AXIS_D3_RSIGAP];
const day4StrategySorts = [...cryptoStrategySorts, AXIS_D4_RSIGAP];
const day5StrategySorts = [...cryptoStrategySorts, AXIS_D5_RSIGAP];
const day6StrategySorts = [...cryptoStrategySorts, AXIS_D6_RSIGAP];
const day7StrategySorts = [...cryptoStrategySorts, AXIS_D7_RSIGAP];
const day8StrategySorts = [...cryptoStrategySorts, AXIS_D8_RSIGAP];
const monthlyStrategySorts = [...cryptoStrategySorts, AXIS_M_RSIGAP];
const athDistSorts = [AXIS_ATH_DIST, ...cryptoStrategySorts];   // 休眠（见 AXIS_ATH_DIST）

// === TG 通知监控（tgWatch：rail「TG 通知」组那一项，站长 10-22）专用的四根轴：行字段 tg* 由后端 `_tg_watch` 挂，只在这张的行上 ===
// 时刻是 epoch 秒、显示北京时间。轴上三个开关只有这几根用：`noBar` ＝ 值列不画深度条（时刻比不出强弱）、`signed` ＝ 值列按正负上红绿、
//   `group` ＝ 排序条上自成一组（renderSortStrip 按标签开头的周期分组，这几根的标签不以周期开头）。
const AXIS_TG_AT = { key: "tgPushAt", label: "推送时间", format: v => fmtTgTime(v.tgPushAt), noBar: true, group: "TG",
    hint: "最早那次推送的时刻（北京时间）；默认按它从新到旧排，最上面是刚推的" };
const AXIS_TG_CHG = { key: "tgChangePct", label: "推送以来涨跌", format: v => fmtTgPct(v.tgChangePct), signed: true, group: "TG",
    hint: "现价比最早那次推送时的价。价格都取整点那根 1 小时 K 的收盘价（每小时更新一次，不是盘中实时价）" };
const AXIS_TG_GAP = { key: "tgGap", label: "现在缺口", format: v => fmtRsiGapVal(v.tgGap), group: "TG",
    hint: "最早推送的那个周期现在的 RSI 缺口（该周期 RSI(14) 减去它自己的 14 根均线）；挂了几个周期的，各周期的数在副行" };
const AXIS_TG_PUSHGAP = { key: "tgPushGap", label: "推送时缺口", format: v => fmtRsiGapVal(v.tgPushGap), group: "TG",
    hint: "最早那次推送时该周期的 RSI 缺口（推送门槛：大于 5）" };
const tgWatchSorts = [AXIS_TG_AT, AXIS_TG_CHG, AXIS_TG_GAP, AXIS_TG_PUSHGAP, ...cryptoStrategySorts];
// 北京时间「10-22 17:00」（TG 通知监控的时刻都是 epoch 秒）
function fmtTgTime(sec) {
    if (sec == null) return "—";
    const d = new Date(sec * 1000 + 8 * 3600000);
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
// 推送以来涨跌：同 fmtGapVal（带符号两位小数 + %，舍入后为 0 不带符号）
const fmtTgPct = fmtGapVal;

// === 行情榜四张（日 / 3日 / 周 / 月线涨跌幅）的轴集：每张只看本周期（站长 10-19「里面的排序都单独看对应时间的排序」）===
// 同一套 10 根：本周期涨跌幅（首轴）· 成交额 · RSI · RSI缺口 · CVD强弱 · 订单流 · ADX · +DI · MACD强弱 · SAR多头根数；行由后端按本周期单独产出
//   （日线用通用 key，3日 / 周 / 月线带 threeDay / weekly / monthly 前缀），副行用 marketSub 按本榜轴集列 ⇒ 不再照抄 cryptoStrategySorts，策略榜加删轴不用跟着改这四份。
// ⚠️ 写成显式数组：audit A 项靠正则静态抽取数组里的 AXIS_* 常量。
// ⚠️ 首轴 key 必须是 `value`，别"语义化"改成 changePercent：renderTable 的红绿上色写死 `sortField === "value"`，
//    另需 tab key 在 CHANGE_PCT_TABS 里，缺一红绿静默失效。
const AXIS_D_CHG = { key: "value", label: "日涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_W_CHG = { key: "value", label: "周涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_M_CHG = { key: "value", label: "月涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_W_TAKER = { key: "weeklyTakerStrength", label: "周订单流", format: v => fmtTakerVal(v.weeklyTakerStrength),
                       hint: "真实主动成交（taker 数据）：周线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，不是买卖信号" };
const AXIS_M_CVD = { key: "monthlyCvdStrength", label: "月CVD强弱", format: v => fmtCvdVal(v.monthlyCvdStrength),
                     hint: "按月K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「月订单流」" };
const AXIS_M_TAKER = { key: "monthlyTakerStrength", label: "月订单流", format: v => fmtTakerVal(v.monthlyTakerStrength),
                       hint: "真实主动成交（taker 数据）：月线EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，不是买卖信号" };
// 周 / 月线补的几根（只挂行情榜周 / 月线那两张）：后端拿全历史日 K 拼周K / 月K 算（周 / 月线缓存里没有；10-19 全市场核过拼出来的周K / 月K 与币安原生一致）。
const AXIS_W_SARBARS = { key: "weeklySarBullBars", label: "周SAR多头根数", format: v => fmtBarsVal(v.weeklySarBullBars),
                         hint: "周线SAR翻多至今第几根周K（翻多那根算第1根）。升序＝刚翻多，降序＝这轮多头跑最久；SAR 空头显示「—」" };
const AXIS_M_ADX = { key: "monthlyAdx", label: "月ADX", format: v => fmtDmiVal(v.monthlyAdx),
                     hint: "最新已收盘月K的ADX（DMI 14，对齐TV）：只量趋势有多强、不分涨跌；要28根月K，上市不足约两年半显示「—」" };
const AXIS_M_MACD = { key: "monthlyMacdStrength", label: "月MACD强弱", format: v => fmtGapVal(v.monthlyMacdStrength),
                      hint: "月线 (PPO线 + 5×PPO柱)/6：月线级动能的相对强弱，只看排名；要35根月K，不够显示「—」" };
const AXIS_M_SARBARS = { key: "monthlySarBullBars", label: "月SAR多头根数", format: v => fmtBarsVal(v.monthlySarBullBars),
                         hint: "月线SAR翻多至今第几根月K（翻多那根算第1根）。升序＝刚翻多，降序＝这轮多头跑最久；SAR 空头显示「—」" };
// 3日线那张的 10 根（key 一律 threeDay 前缀，只挂 threeDayChange）：最新已收盘 3日K（TV 年锚切法，同 3日线策略榜）。价格类后端喂全历史日 K 拼的 3日K
//   （与 TV 3D 周期一致；3日RSI缺口与策略榜那份逐位相同），量类（成交额 / CVD强弱 / 订单流）喂近 499 天日 K 拼的 3日K。名次徽标同日 / 周 / 月成交额。
function fmtThreeDayVolVal(v) { return v.threeDayVolumeFormatted != null ? escapeHtml(v.threeDayVolumeFormatted) : "—"; }
const threeDayVolRankBadge = volRankBadgeFor("threeDayVolumeRank", "3日", "threeDayChange", "ashareThreeDayChange");
const AXIS_3D_CHG = { key: "value", label: "3日涨跌幅", format: v => fmtGapVal(v.value) };
const AXIS_3D_VOL = { key: "threeDayVolume", label: "3日成交额", format: v => fmtThreeDayVolVal(v), badge: threeDayVolRankBadge,
                      hint: "最新已收盘那一根3日K三天成交额之和" };
const AXIS_3D_RSI = { key: "threeDayRsi", label: "3日线RSI", format: v => fmtRsiVal(v.threeDayRsi) };
const AXIS_3D_RSIGAP = { key: "threeDayRsiSmaGap", label: "3日RSI缺口", format: v => fmtRsiGapVal(v.threeDayRsiSmaGap),
                         hint: "3日K RSI(14)减去它自己的14根SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝最近几根动能冲得越急。只看相对排名、不是买点；不足28根显示「—」" };
const AXIS_3D_CVD = { key: "threeDayCvdStrength", label: "3日CVD强弱", format: v => fmtCvdVal(v.threeDayCvdStrength),
                      hint: "按3日K线形态推断的买卖失衡，不是真实成交归边；想看真钱流向用「3日订单流」" };
const AXIS_3D_TAKER = { key: "threeDayTakerStrength", label: "3日订单流", format: v => fmtTakerVal(v.threeDayTakerStrength),
                        hint: "真实主动成交（taker 数据）：3日K EMA14平滑后的（主动买−主动卖）÷成交量。全市场绝大多数为负，负值是常态；只看相对排名，不是买卖信号" };
const AXIS_3D_ADX = { key: "threeDayAdx", label: "3日ADX", format: v => fmtDmiVal(v.threeDayAdx),
                      hint: "最新已收盘3日K的ADX（DMI 14，对齐TV）：只量趋势有多强、不分涨跌；不足28根显示「—」" };
const AXIS_3D_DIPLUS = { key: "threeDayDiPlus", label: "3日+DI", format: v => fmtDmiVal(v.threeDayDiPlus),
                         hint: "最新已收盘3日K的+DI（DMI 14，对齐TV）：多方方向压力，0–100；不足28根显示「—」" };
const AXIS_3D_MACD = { key: "threeDayMacdStrength", label: "3日MACD强弱", format: v => fmtGapVal(v.threeDayMacdStrength),
                       hint: "3日K (PPO线 + 3×PPO柱)/4：动能的相对强弱，只看排名；不足35根显示「—」" };
const AXIS_3D_SARBARS = { key: "threeDaySarBullBars", label: "3日SAR多头根数", format: v => fmtBarsVal(v.threeDaySarBullBars),
                          hint: "3日K SAR翻多至今第几根（翻多那根算第1根）。升序＝刚翻多，降序＝这轮多头跑最久；SAR 空头显示「—」" };
const dailyChangeSorts = [AXIS_D_CHG, AXIS_D_VOL, AXIS_D_RSI, AXIS_D_RSIGAP, AXIS_D_CVD, AXIS_D_TAKER,
                          ...dmiSorts, AXIS_D_MACD, AXIS_D_SARBARS];
const threeDayChangeSorts = [AXIS_3D_CHG, AXIS_3D_VOL, AXIS_3D_RSI, AXIS_3D_RSIGAP, AXIS_3D_CVD, AXIS_3D_TAKER,
                             AXIS_3D_ADX, AXIS_3D_DIPLUS, AXIS_3D_MACD, AXIS_3D_SARBARS];
const weeklyChangeSorts = [AXIS_W_CHG, AXIS_W_VOL, AXIS_WRSI, AXIS_W_RSIGAP, AXIS_W_CVD, AXIS_W_TAKER,
                           AXIS_W_ADX, AXIS_W_DIPLUS, AXIS_W_MACD, AXIS_W_SARBARS];
const monthlyChangeSorts = [AXIS_M_CHG, AXIS_M_VOL, AXIS_MRSI, AXIS_M_RSIGAP, AXIS_M_CVD, AXIS_M_TAKER,
                            AXIS_M_ADX, AXIS_M_DIPLUS, AXIS_M_MACD, AXIS_M_SARBARS];
// A股 涨跌幅榜轴集工厂（休眠件）：仍是旧形 —— 通用 key 装本周期的值、比加密少「订单流」（tushare 日线无归边字段）。
// 复活 A股 时要么照加密这样对齐（后端 fetch_ashare.py 行构造一起改），要么保持旧形，别混用。
// ⚠️ 写成独立工厂、别加开关：audit A 项靠正则静态抽取工厂体里的 key，看不懂运行时裁剪。
const stockChangeSorts = (tf, rsiLabel) => [
    { key: "value",       label: `${tf}涨跌幅`,  format: v => fmtGapVal(v.value) },
    { key: "volume",      label: `${tf}成交额`,  format: v => fmtVolVal(v) },
    { key: "rsi",         label: rsiLabel,       format: v => fmtRsiVal(v.rsi) },
    { key: "cvdStrength", label: `${tf}CVD强弱`, format: v => fmtCvdVal(v.cvdStrength),
      hint: "按K线形态推断的买卖失衡，不是真实成交归边（日线没有逐笔归边数据）" },
];
const ashareDailyChangeSorts = stockChangeSorts("日", "日线RSI");
const ashareWeeklyChangeSorts = stockChangeSorts("周", "周线RSI");
const ashareMonthlyChangeSorts = stockChangeSorts("月", "月线RSI");

// 每个 tab 一条 { sorts, subFormat }。按 key 取的平查找表（顺序无意义）；导航 / 显示名 / desc / rail 顺序在 TAB_GROUPS，
// 增删榜两处都要改。
const TABS_CONFIG = {
    // === 加密行情榜四张（无筛选、全市场入榜；10-18 移除三张、10-19 恢复并新增 3日线）：排序轴与副行都只看本周期 ===
    // ⚠️ 两处缺一不报错但会静默坏：① sorts 首轴 key ＝ `value`；② tab key 在 CHANGE_PCT_TABS 里（缺了值列恒不上红绿）。共振卡读这几张的整榜行，10-19 站长定先不恢复（RESO_ENABLED）。
    dailyChange: { sorts: dailyChangeSorts, subFormat: (v, sf) => marketSub(v, sf) },
    threeDayChange: { sorts: threeDayChangeSorts, subFormat: (v, sf) => marketSub(v, sf) },
    weeklyChange: { sorts: weeklyChangeSorts, subFormat: (v, sf) => marketSub(v, sf) },
    monthlyChange: { sorts: monthlyChangeSorts, subFormat: (v, sf) => marketSub(v, sf) },

    // === 加密策略榜：全部共用 cryptoStrategySorts（月线各张与 2~8 日线另在末尾挂一根本周期 RSI 缺口）、副行 axesSub(…, "日成交额")，
    //     行由后端统一产出，各榜只差筛选条件 ===
    // 轴是描述值、不是判据镜像：改判据不动轴，也别按判据增删轴。⚠️ 尤其别为布尔判据加轴 —— 布尔值排不了序、后端也不发 ⇒ 幽灵轴。
    // key ＝ 公开编号（同 TAB_GROUPS）；新 key 别以后端 RETIRED_KEY_PREFIXES 里的前缀开头，否则后端自愈会静默删掉整张榜。
    // s20 的行另带 `hitTfs`（命中的周期）⇒ 副行最前一段「命中 日·周」。s23–s30 加密不单独出榜，条目留着只给 A股 镜像用（ASHARE_ONLY_TABS / ASHARE_ONLY_SRC）。
    s01: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s02: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s03: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s04: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s05: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s06: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s07: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s08: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s09: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s10: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s11: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s12: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s13: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s14: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s15: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s16: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s17: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s18: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s19: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s20: { sorts: cryptoStrategySorts, subFormat: (v, sf) => hitTfsSub(v) + axesSub(v, sf, "日成交额") },
    s21: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s22: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s23: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s24: { sorts: day2StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s25: { sorts: day3StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s26: { sorts: day4StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s27: { sorts: day5StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s28: { sorts: day6StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s29: { sorts: day7StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s30: { sorts: day8StrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s31: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s32: { sorts: cryptoStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },
    s33: { sorts: monthlyStrategySorts, subFormat: (v, sf) => axesSub(v, sf, "日成交额") },

    // === TG 通知监控（rail「TG 通知」组；不是策略榜，见 MODULE_TABS）：首轴推送时间、副行 tgWatchSub；表格下面另有「最近离榜 / 通知记录」两块（renderTgPanel）===
    // subClass：≤860px 别的榜副行限两行、整段不折，这张的周期段长 ⇒ 放开（style.css .sub--tg）。
    // [已撤下 2026-10-24] tgWatch: { sorts: tgWatchSorts, subClass: "sub--tg", subFormat: (v, sf) => tgWatchSub(v, sf) },

    // 美股 / ETF 的配置已随资产整族退役删除（复活清单见 fetch_us.py 顶部；后端 RETIRED_KEY_PREFIXES 不拿掉对应前缀，数据照跑也进不了站）。
    // A股（10-19 复活）的条目不在这里写：由下方镜像块从加密条目生成；旧 A股 轴集（singleStrategySorts / stockChangeSorts）是休眠件。
};

// 分组导航：rail、周期角标、表格上方「资产 · 周期 · 策略」标识栏与说明行的唯一数据源，数组顺序 ＝ rail 顺序（TAB_META 由它派生）。
// 增删榜两处都要配：这里（name / desc，desc 必填）＋ TABS_CONFIG（排序轴集、副行格式）。
// ⚠️ 条目保持 `{ key: …, name: …` 写在同一行：audit_consistency.py 与 make_og.py 用正则在全文（含注释）里数榜。
// 组上的 tf 只是 tab 没写 tf 时的兜底（t.tf || g.tf）；tf 取值要在 TF_SHORT 里有缩写（跨周期写组合值如「日线/周线」），
//   查不到时 rail 徽标静默消失。full ＝ 标识栏用的完整名，缺省用 name。hourly: true ＝ 日线条件、成员每小时都可能变（现在没有这种榜）；
//   hourlyList: true ＝ 周 / 月线条件照常收盘才换、成员名单每个整点重新圈定 —— 两者影响 0 命中时的「下次换批」提示与榜头的 batchMeta()。
// 策略榜：key 是公开编号，name / desc 是给未付费访客看的风格名与一句话说明 —— 不写指标名、参数和具体条件；
//   付费用户的榜名与完整说明随付费包的 tabMeta 下发，解锁后由 tabMetaOf 换上（见 TAB_META）。行情榜四张没有筛选条件，写真名。
const TAB_GROUPS = [
    {
        // 置顶组：rail 最上方（排在其余各组之前），组名前挂图钉。本组第一张 ＝ 橱窗 TEASER_TAB ＝ 默认落地榜，三者必须统一（第二张起只是置顶位置、不动橱窗）；
        //   换置顶要连动前后端 TEASER_TAB、currentTab、lastTabByAsset、switchAsset 兜底与 index.html FAQ「哪些免费」里的榜名。
        //   版式见 HERO_LAYOUT / SINGLE_BOARD（榜恒在主栏最上；只剩一张时另外不出 rail）。
        label: "置顶", asset: "加密", pinned: true,
        tabs: [
            { key: "s01", name: "周线长期弱势", tf: "周线",
              desc: "看合约上市以来的全部周线：一直没走出过像样的上涨趋势、长期偏弱的合约，多是近一两年上市、一路走低的币。" },
            { key: "s32", name: "日线动能转弱期", tf: "日线",
              desc: "日线动能转弱之后、还没重新转强的合约，重新转强当天离开。是一份大名单：平常约占全市场三四成，普跌时能占到大多数。" },
            { key: "s12", name: "日线动能转强初期", tf: "日线",
              desc: "日线动能由弱转强后的头几天里的合约，转强过了初期或重新转弱就离开。" },
            { key: "s31", name: "日线强势回调", tf: "日线",
              desc: "日线大方向仍然向上、上涨动能也还在，这一天却收跌的合约——强势中的一次回调。每天换一批，普跌的日子会一下子多出很多。" },
            { key: "s02", name: "日线资金异动", tf: "日线",
              desc: "日线走势正在转强、成交比平时活跃，而且短线强度和买盘力度都排在全市场最前列的合约。每天换一批，大多数日子有几个。" },
            { key: "s03", name: "周线资金涌入", tf: "周线",
              desc: "周线级别买盘力度持续走强、达到上市以来少见水平的合约。成员少、换得快。" },
            { key: "s04", name: "日周动能共振", tf: "日线/周线/月线",
              desc: "日线和周线的上涨动能同时占优、更大的月线级别也还没转弱的合约。" },
            { key: "s05", name: "周线趋势加速（精选名单）", tf: "周线", hourlyList: true,
              desc: "精选潜力名单里，周线趋势正在逐周加强、多方占优的合约。名单每个整点重新圈定。" },
            { key: "s06", name: "周线强势回调", tf: "周线",
              desc: "周线大方向仍然向上、这一周却收跌的合约——强势中的一次回调。普跌的那一周会一下子多出很多。" },
            { key: "s07", name: "月线突破（精选名单）", tf: "周线/月线", hourlyList: true,
              desc: "精选潜力名单里，月线收盘突破一个关键价位、最近一周买盘也占优的合约。名单每个整点重新圈定。" },
            { key: "s08", name: "精选潜力名单", tf: "名单",
              desc: "一份精选的潜力合约名单，不看任何 K 线条件；名单每个整点重新圈定。" },
            { key: "s09", name: "日线资金创新高", tf: "日线",
              desc: "日线大方向向上、买盘力度同时创出上市以来新高的合约。每天换一批，约三分之一的日子一个都没有。" },
        ],
    },
    {
        // 加密行情（10-18 随「移除其他所有的TAB」移除，10-19 站长「无逻辑的日线，周线，月线榜要恢复，我主要用来看排序」恢复并新增 3日线）：无筛选、全市场。
        // 本组横跨多个周期 ⇒ tf 挂在每个 tab 上；name 只写周期（rail 很窄），full 统一写「涨跌幅」。行情榜 / 策略榜之分只看 CHANGE_PCT_TABS、不看分组 ⇒ 新增涨跌幅榜要同时加进去。
        label: "加密行情", asset: "加密",
        tabs: [
            { key: "dailyChange", name: "日线", full: "涨跌幅", tf: "日线",
              desc: "最新已收盘日 K 的涨跌幅（当根收盘 ÷ 当根开盘，日 K 每天 00:00 UTC 收盘，所以看的是昨天那一整根）。没有任何筛选条件——全部加密 USDT 永续合约都在里面，主要用来看排序：排序条上只有日线自己的轴（日涨跌幅、日成交额、日线RSI、日RSI缺口、日CVD强弱、日订单流、日ADX、日+DI、日MACD强弱、日SAR多头根数），每行下面那行小字也只显示日线的数。默认按涨幅从高到低；比如切成日成交额看涨得多是不是也有人接、日线RSI 看是不是已经超买、日CVD强弱与日订单流看近期买卖力量在全市场里谁相对更强。每天 00:00 UTC（北京时间 08:00）收盘后换一批，同一天之内数值不变是正确行为。上市当天、还没有一根已收盘日 K 的新合约不入榜；上市不足约 23 天的合约涨跌幅和日成交额照常显示，但日线RSI、日CVD强弱、日订单流、日SAR多头根数这类要暖机的轴会显示「—」，排序时自动沉底；日RSI缺口、日ADX、日+DI 要约 28 天，日MACD强弱要约 35 天，不够的同样显示「—」；日线 SAR 空头时日SAR多头根数也是「—」。" },
            { key: "threeDayChange", name: "3日线", full: "涨跌幅", tf: "3日线",
              desc: "最新已收盘 3日K 的涨跌幅（这根 3日K 的收盘 ÷ 开盘）。3日K 的切法和 TradingView 一样：每年 1 月 1 日（UTC）起每 3 天一根，年底那根到 12 月 31 日为止（一年的天数除不尽 3 时不满 3 天）；只认已收盘的那根，所以只在一根 3日K 收盘那天的 00:00 UTC（北京时间 08:00）换一批，其余日子数值不变（榜头写着下一根哪天收盘）。没有任何筛选条件，全部加密 USDT 永续合约，主要用来看排序：排序条上全是 3日K 版本的轴（3日涨跌幅、3日成交额、3日线RSI、3日RSI缺口、3日CVD强弱、3日订单流、3日ADX、3日+DI、3日MACD强弱、3日SAR多头根数），每行下面那行小字也只显示 3日K 的数。价格类的轴（RSI、RSI缺口、ADX、+DI、MACD强弱、SAR多头根数）从合约上市第一根算起（本站存着每个合约上市以来的全部日K），和 TradingView 图上 3D 周期的数值一致；3日成交额是这根 3日K 三天成交额之和，3日CVD强弱、3日订单流用近 499 天的日K 拼成 3日K 来算。默认按 3日涨跌幅从高到低。3日线RSI 要 16 根 3日K、3日RSI缺口 / ADX / +DI 要 28 根、MACD强弱要 35 根，上市不够久的显示「—」并在排序时沉底；3日K SAR 空头时 3日SAR多头根数也是「—」。" },
            { key: "weeklyChange", name: "周线", full: "涨跌幅", tf: "周线",
              desc: "最新已收盘周 K 的涨跌幅（周 K 每周一 00:00 UTC 收盘，所以整周之内这张榜的数值是不变的，下周一才换一批）。没有任何筛选条件，全部加密 USDT 永续合约，主要用来看排序：排序条上只有周线自己的轴（周涨跌幅、周成交额、周线RSI、周RSI缺口、周CVD强弱、周订单流、周ADX、周+DI、周MACD强弱、周SAR多头根数），每行下面那行小字也只显示周线的数。它比日线那张钝得多，正好用来分辨「这几天的涨只是反弹」还是「整周都在往上走」。「周成交额」是那一根周 K 的成交额，不是 7 天滚动也不是日均。只要有 1 根已收盘周 K 就入榜，所以刚上市一两周的新合约也在；但周线RSI 要 16 根周 K、周CVD强弱和周订单流要 15 根、周RSI缺口 / 周ADX / 周+DI 要 28 根、周MACD强弱要 35 根，不够的显示「—」并在排序时沉底；周线 SAR 空头时周SAR多头根数也是「—」。" },
            { key: "monthlyChange", name: "月线", full: "涨跌幅", tf: "月线",
              desc: "最新已收盘月 K 的涨跌幅（月 K 每月 1 号 00:00 UTC 收盘，所以整个月之内这张榜是不动的——那是正确行为，不是数据卡住了）。没有任何筛选条件，全部加密 USDT 永续合约，主要用来看排序：排序条上只有月线自己的轴（月涨跌幅、月成交额、月线RSI、月RSI缺口、月CVD强弱、月订单流、月ADX、月+DI、月MACD强弱、月SAR多头根数），每行下面那行小字也只显示月线的数。这是站内周期最长的一张行情榜，看的是「这个月谁真的走出来了」，短线噪音基本被抹平。只要有 1 根已收盘月 K 就入榜（上市当月的新合约还没有，暂不入榜）；月线RSI 要 16 根月 K，月+DI、月CVD强弱、月订单流要 15 根，月RSI缺口和月ADX 要 28 根，月MACD强弱要 35 根——都得一两年以上，所以不少合约这些轴会显示「—」并在排序时沉底，这本身也是一种信息：显示「—」的就是还没走完一轮周期的品种。月线 SAR 空头时月SAR多头根数也是「—」。" },
        ],
    },
    {
        // 加密策略：新增榜默认追加在本组末尾。
        label: "加密策略", asset: "加密", tf: "月线",
        tabs: [
            { key: "s10", name: "周线转强·趋势持有", tf: "周线",
              desc: "周线由弱转强时入选，之后只要大方向不破就一直留在榜上，同一个合约会连着好几周出现。" },
            { key: "s11", name: "月线转强·趋势持有", tf: "月线",
              desc: "月线由弱转强时入选，之后只要大方向不破就一直留在榜上，同一个合约会连着好几个月出现。" },
            { key: "s13", name: "月线刚转多", tf: "月线",
              desc: "月线大方向刚刚由空转多的那个月，每月换一批全新的合约。" },
            { key: "s14", name: "月线收复关键位", tf: "月线",
              desc: "月线收盘重新站上一个关键价位的合约，站上就在、跌回去就走。" },
            { key: "s15", name: "三周期同向多头", tf: "日线/周线/月线",
              desc: "日线、周线、月线三个级别的大方向同时向上的合约，任何一个级别转弱就离开。" },
            { key: "s16", name: "周线逆势吸筹", tf: "周线",
              desc: "周线大方向还在向下、买盘却已经占上风的合约。" },
            { key: "s17", name: "三周期齐升", tf: "日线/周线/月线",
              desc: "日线、周线、月线三个级别的短期走势同时向上的合约。" },
            { key: "s18", name: "周线买盘占优", tf: "周线",
              desc: "最新一周买盘力量占上风的合约，成员多。" },
            { key: "s19", name: "日线弱势突破", tf: "日线",
              desc: "日线大方向还在向下、价格却已经突破一个关键位置的合约。" },
            { key: "s20", name: "多周期高位转弱", tf: "日线/周线/月线",
              desc: "日线、周线或月线在历史高位刚刚转弱的合约，每行副行最前面标着是哪个周期。" },
            { key: "s21", name: "月线连涨初期", tf: "月线",
              desc: "月线刚走出一小段连涨、还在初期的合约。" },
            { key: "s22", name: "日线全市场最强", tf: "日线",
              desc: "日线多项强弱指标同时排进全市场最前列、趋势和买盘一起走强的合约。换得快，一半多的日子没有。" },
            { key: "s33", name: "月线买盘占优", tf: "月线",
              desc: "最新一个月买盘力量占上风的合约，成员多。" },
        ],
    },
    // A股「行情」「策略」两组不在这里写：由下方镜像块从加密组运行时生成
    //   （前端要连同 TABS_CONFIG、CHANGE_PCT_TABS、资产分段控件与 A股 新鲜度胶囊一起加回）。
];

// 只给 A股 镜像用的八张：加密这边不单独列榜，A股 照常列。不进加密 rail / TAB_META；下方「A股 镜像」块按 after 把它们插回 A股 那两组里的位置。
//   TABS_CONFIG 里的同名条目留着（镜像要用它的轴集与副行）。ASHARE_ONLY_TABS 必须与后端对应的集合一致（audit C）；
//   audit / make_og 靠这个字面量与下面 `{ key: …, name: …` 写在同一行认出它们。
const ASHARE_ONLY_TABS = new Set(["s23", "s24", "s25", "s26", "s27", "s28", "s29", "s30"]);
const ASHARE_ONLY_SRC = [
    { key: "s23", name: "日线强势转多·持有", tf: "日线", after: "s09",
      desc: "日线由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s24", name: "2日线强势转多·持有", tf: "2日线", after: "s11",
      desc: "按 2 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s25", name: "3日线强势转多·持有", tf: "3日线", after: "s24",
      desc: "按 3 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s26", name: "4日线强势转多·持有", tf: "4日线", after: "s25",
      desc: "按 4 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s27", name: "5日线强势转多·持有", tf: "5日线", after: "s26",
      desc: "按 5 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s28", name: "6日线强势转多·持有", tf: "6日线", after: "s27",
      desc: "按 6 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s29", name: "7日线强势转多·持有", tf: "7日线", after: "s28",
      desc: "按 7 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
    { key: "s30", name: "8日线强势转多·持有", tf: "8日线", after: "s29",
      desc: "按 8 日K 看：由弱转强、而且转强那一刻动能很足时入选，之后只要大方向不破就一直留在榜上。" },
];

// tab key → {asset, tf, name, full, desc}：组的 asset / tf 下发到每个 tab（tab 自带 tf 优先），full 缺省用 name。
// 策略榜的 name / full / desc 是 getter：拿得到真名（tabMetaOf，付费包里的 tabMeta）就用真名与完整说明，否则用 TAB_GROUPS 里的风格名。
// src ＝ 去 tabMeta 里查哪个编号（A股 镜像查加密那张）；descOf 把说明加工成最终文本（A股 镜像补 A股 说明，见下方镜像块）。
function tabMetaEntry(asset, t, tf, src = t.key, descOf = d => d) {
    return {
        asset, tf, hourly: !!t.hourly, hourlyList: !!t.hourlyList,
        get name() { const r = tabMetaOf(src); return r ? r.name : t.name; },
        get full() { const r = tabMetaOf(src); return r ? r.name : t.full || t.name; },
        get desc() { const r = tabMetaOf(src); return descOf(r ? r.desc : t.desc || ""); },
    };
}
const TAB_META = {};
for (const g of TAB_GROUPS) {
    for (const t of g.tabs) TAB_META[t.key] = tabMetaEntry(g.asset, t, t.tf || g.tf);
}
// 榜在最上（站长 10-18「重构布局，放在一个最醒目的地方」）：榜单（标题 + 排序条 + 表格）挪到主栏最上面、榜头放大成头条、
// 命中数后接换批提示，「策略命中 N 次 · N 榜」脉搏磁贴收起；市场概览接在表格下面。恒开 —— 改回旧版式 ＝ 这里 false + index.html 去掉 is-hero。
const HERO_LAYOUT = true;
// 只剩一张榜时另外不出 rail（一张榜的导航没有意义）。按 TAB_GROUPS 现算、别写死：再加榜就自动回到 rail。
// index.html 的 .app 静态写着当前该有的类（免得首帧先画错再改），初始化时按这两个值校正。
const SINGLE_BOARD = TAB_GROUPS.reduce((n, g) => n + g.tabs.length, 0) === 1;

// === 付费墙配置 ===
// 总开关，必须与后端 fetch_data.py 的 PAYWALL_ENABLED 一致（audit C）；紧急回滚时两处一起改 false。
const PAYWALL_ENABLED = true;
const WORKER_API = "https://bishuju-api.fanshenpan.workers.dev";
// 免费橱窗榜：公开 JSON 只含它的第 1 行（默认视图第一名）。必须与后端同名常量一致（audit C）。
// 橱窗 ＝ 默认落地榜 ＝ 置顶组第一张（TAB_GROUPS 第一组的 tabs[0]），换榜七处同改：这里 + 后端 + currentTab + lastTabByAsset.crypto
// + switchAsset 兜底 + TAB_GROUPS 置顶组那一条 + index.html FAQ「哪些免费」的榜名（只改落地页不改橱窗 ⇒ 新访客落在全锁空榜上）。
const TEASER_TAB = "s01";
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
// 置顶组组名前的图钉（同理写死尺寸）。
const PIN_SVG = '<svg class="grp-pin" width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M7.9 1.1a.7.7 0 0 1 1 0l2 2a.7.7 0 0 1 0 1l-.7.4-1.6 1.6.2 2.2a.7.7 0 0 1-1.2.5L5.8 7 2.4 10.4a.5.5 0 0 1-.8-.8L5 6.2 3.2 4.4A.7.7 0 0 1 3.7 3.2l2.2.2 1.6-1.6.4-.7Z"/></svg>';
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
let currentTab = "s01";
let sortAsc = false; // false=降序, true=升序
// 当前排序字段（切 tab 时重置为该 tab 首轴）。初值也必须是默认落地榜的首轴：首访不走 switchTab，写死 "value" 会让
// 排序条上没有一个高亮 chip、副行多重复一段首轴、第一次点表头不翻方向（策略榜首轴的 key 是 volume 不是 value）。
let sortField = TABS_CONFIG[currentTab].sorts[0].key;
let searchQuery = ""; // 表格搜索（代码/名称子串），切 tab 时清空
let lastBustAt = 0; // 上次带 cache-buster 强拉的时间（限流用，见 loadData）
let bustStreak = 0; // 连续强穿仍拿到同一 updateTime 的次数，驱动 loadData 的指数退避（线上抓取中断时省带宽）
let license = { key: safeStore.get("localStorage", LS_LICENSE) || "", valid: false, expiresAt: null, plan: null, reason: null };
// 卡密三态：valid（Worker 认了）/ 确定失效（401 · 402，reason 有值）/ 待验证（本机有 key、还没拿到 Worker 的明确答复：
// 刚开页，或 Worker 5xx / 网络不通）。待验证不是失效 ⇒ 不挂锁、不出「已失效…续费」，只说正在验证；每轮轮询照常重试。
const licensePending = () => !!license.key && !license.valid && !license.reason;
let paidData = null; // Worker 返回的全量付费数据（未解锁或未拉到时为 null）
// 策略榜的真名与完整说明：付费包里的 tabMeta（{编号: {name, desc}}）。已解锁（或付费墙关、公开文件里就带）才用；
// 待验证（刚开页）先用本机上次存的那份，免得付费用户每次开页榜名先闪一下风格名。没卡密的访客不读也不存。
const LS_TAB_META = "bishuju_tab_meta";
let cachedTabMeta = null;
if (license.key) { try { cachedTabMeta = JSON.parse(safeStore.get("localStorage", LS_TAB_META) || "null"); } catch (e) { cachedTabMeta = null; } }
function tabMetaOf(key) {
    const src = !PAYWALL_ENABLED ? data && data.tabMeta
        : license.valid ? (paidData && paidData.tabMeta) || cachedTabMeta
        : licensePending() ? cachedTabMeta : null;
    const r = src && src[key];
    return r && typeof r.name === "string" && typeof r.desc === "string" ? r : null;
}
// 拿到新付费包时记下它的 tabMeta（只存真名表，不存行）。
function rememberTabMeta(pd) {
    if (!pd || !pd.tabMeta || typeof pd.tabMeta !== "object") return;
    cachedTabMeta = pd.tabMeta;
    safeStore.set("localStorage", LS_TAB_META, JSON.stringify(pd.tabMeta));
}
let lastPaidUpdateTime = null; // 上次拉付费数据时的 paidFetchKey（与 loadData 同构），避免每 30s 轮询都打 Worker
// A股 那包（Worker 单独的 KV key `?asset=ashare`，十几 MB）：只在看 A股 的榜时才拉，按 ashareUpdateTime（一天一变）记拉过的那份；
// 鉴权跟加密那包同一把卡（这次也会顺带更新 license）。见 loadData / switchTab。
let asharePaidData = null;
let lastAsharePaidKey = null;
// A股 那包没拉成（5xx / 断网 / 超时 / 拉回来比公开文件旧）的连续次数与下次可重试时刻：一包十几 MB，按 1、2、4、8、16 分钟退避，拉成即复位（见 loadData）
let ashareFailStreak = 0, ashareRetryAt = 0;
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

/** 通行证规范化，比 Worker 那份更严（Worker 收到的已是干净串，它那份只当兜底）：NFKC（全角字母 / 数字 / 横线折成半角）→ 大写 →
 * 各种横线 / 减号统一成 "-" → 只留 A-Z 0-9 "-"（空白、零宽字符、引号、前后缀文字一并去掉）。必须在存储和发请求头之前做：
 * X-License-Key 头含非 Latin-1 字符会让 fetch() 抛 TypeError —— 落进「网络错误」分支，页面永远停在「验证中…」、Worker 一次都收不到。 */
function normalizeKey(raw) {
    const s = String(raw || "").normalize("NFKC").toUpperCase()
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
        .replace(/[^A-Z0-9-]/g, "");
    // 多选了一行（邮件里卡密下一行就是到期时间）、或续费时贴在预填的旧卡后面 ⇒ 规范化后粘成一串、Worker 回「不存在」：
    // 取其中最后一张完整卡密（Worker generateKey 的格式；最后一张 ＝ 刚贴进来的那张）。一张都认不出就原样返回，交给 Worker 判。
    const m = s.match(/BSJ(?:-[A-Z0-9]{4}){4}/g);
    return m ? m[m.length - 1] : s;
}

/** 某榜命中数：优先 paidMeta（服务端按完整名单算），数组长度只兜底——橱窗榜的 data[key] 只有 1 行，
 * 反过来锁定态会显示「命中 1 个」。data 未就绪或两边都没有时返回 null。 */
function tabCount(key) {
    if (!data) return null;
    // 只认数字：命中数会原样进 innerHTML 与 title（导航、锁定卡片、脉搏），理由同 fmtVolVal
    if (data.paidMeta && key in data.paidMeta) return Number.isFinite(data.paidMeta[key]) ? data.paidMeta[key] : null;
    if (Array.isArray(data[key])) return data[key].length;
    return null;
}

// 涨跌幅榜（无筛选、全市场入榜），行情榜 / 策略榜的唯一分界。同时决定 ① 值列红绿（另需 sortField === "value"）
// ② 导航不挂命中徽标、量词说「共」③ 空状态走「暂无数据」；漏加则一起静默失效。A股 那几张由下方「A股 镜像」块自动加。
const CHANGE_PCT_TABS = new Set(["dailyChange", "threeDayChange", "weeklyChange", "monthlyChange"]);

// 整榜免费的榜：必须与后端 fetch_data.py 同名 FREE_TABS 一致（audit C；后端据此整榜写进公开文件，前端据此不锁）。
// 空集不是漏写：全站没有免费整榜，免费面只剩橱窗 1 行 + marketOverview。
const FREE_TABS = new Set([]);
// 策略榜 ＝ 有筛选条件的榜（0 命中是正常信号）：空状态文案、脉搏计数、导航命中徽标据此。
// 必须同时排除 CHANGE_PCT_TABS：涨跌幅榜也付费，只判 FREE_TABS 会把行情榜当策略榜（是不是策略榜与免费 / 付费无关）。
// 不是榜的模块（rail「TG 通知」组那一项 tgWatch，休眠）：有表格、能排序导出、锁定照常，但不算策略榜（不进策略榜张数 / 脉搏 / rail 底部的榜单数，
//   make_og.py 解析这一行、og 图上的榜数也不算它）；rail 照样挂个数、榜头写「监控中 N 个」。
const MODULE_TABS = new Set(["tgWatch"]);
const isStrategyTab = tab => !FREE_TABS.has(tab) && !CHANGE_PCT_TABS.has(tab) && !MODULE_TABS.has(tab);

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
    // 搜索过滤：代码/名称都大小写不敏感（ST股名字含 ASCII 前缀，小写 st 也要能搜到）。
    // 加密合约的输入不带 USDT 时只比去掉后缀的部分：全部合约都以 USDT 结尾，按整串比的话搜 S / T / US 会命中全部、SUSDT 这类反而找不到；
    // 带 USDT 的输入（BTCUSDT）照旧按整串比。
    if (searchQuery) {
        const q = searchQuery.toUpperCase();
        items = items.filter(i =>
            (!q.includes("USDT") && isCryptoSymbol(i.symbol) ? stripUSDT(i.symbol) : i.symbol).toUpperCase().includes(q)
            || (i.name && i.name.toUpperCase().includes(q)));
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
// TF_SHORT：tf → rail 徽标缩写，查不到时徽标静默消失（跨周期榜要在这里补，两个字及以上自动套 .tf-chip--wide）。tf 纯展示用。
const TF_SHORT = { "日线": "日", "周线": "周", "月线": "月", "日线/周线": "日周", "日线/月线": "日月", "日线/周线/月线": "日周月", "日线/3日线": "日3日", "周线/月线": "周月", "4H/6H/8H/12H": "时",
    "2日线": "2日", "3日线": "3日", "4日线": "4日", "5日线": "5日", "6日线": "6日", "7日线": "7日", "8日线": "8日",
    "1H": "1H", "2H": "2H", "4H": "4H", "6H": "6H", "8H": "8H", "12H": "12H", "1H~8日线": "TG", "日线~月线": "日~月", "名单": "名单" };
// 资产名双向映射，两张一起维护。
const ASSET_KEY = { "加密": "crypto", "A股": "ashare" };   // TAB_GROUPS.asset → data-asset
const ASSET_CN = { crypto: "加密", ashare: "A股" };        // data-asset → TAB_GROUPS.asset
// 默认资产 ＝ 默认落地 tab（currentTab）所属资产，两者同改。
let currentAsset = "crypto";                            // 当前资产（由 tab 派生/资产切换驱动）
// 各资产上次看的榜；加密初值 ＝ TEASER_TAB（未解锁时唯一有内容的榜）；A股 初值由「A股 镜像」块填（ASHARE_HOME_TAB）。
const lastTabByAsset = { crypto: "s01" };

function assetOfTab(tab) {
    const m = TAB_META[tab];
    return m ? ASSET_KEY[m.asset] : "crypto";   // 兜底跟默认落地 tab 走
}

// rail 组标签去掉 "A股" 前缀（资产本由分段控件表达）；现有组名不带该前缀，原样返回
function navGroupLabel(g) {
    return g.label.replace(/^(A股)/, "") || g.label;
}

// 榜名分两层包 inline-block，让折行落在读得通的地方（rail 与榜头标题共用；纯展示，榜名本身不动）：
// ① 按「＋」分段（.nm-seg）：整段放得下就不在段内折，「＋」领起下一行；
// ② 段内在「汉字后接拉丁缩写 / 数字」处再切一刀（.nm-part，如「日线|RSI缺口」「月线突破|ABC通道…」）：
//    一行放不下整段时先折在缩写前。缩写后面不再跟两个以上汉字的（句尾的「SAR」「K」）不切，免得它单独掉到下一行。
// 再放不下才在 part 内逐字折（CSS balance 匀成两行）。tailHtml（rail 的锁图标）并进最后一块，免得单独掉行。
// ⚠️ 正则别改写成后行断言 (?<=…)：旧 Safari 不认、整份脚本会在解析期报错。
function nameSegHtml(name, tailHtml = "") {
    const segs = name.split("＋");
    return segs.map((seg, i) => {
        const parts = ((i ? "＋" : "") + seg)
            .replace(/([\u4e00-\u9fff])(?=[A-Za-z0-9][A-Za-z0-9/.%]*[\u4e00-\u9fff]{2})/g, "$1\u0000").split("\u0000");
        const tail = i === segs.length - 1 ? tailHtml : "";
        return `<span class="nm-seg">` + parts.map((p, j) =>
            `<span class="nm-part">${escapeHtml(p)}${j === parts.length - 1 ? tail : ""}</span>`).join("") + `</span>`;
    }).join("");
}

function navHtml() {
    const assetCn = ASSET_CN[currentAsset];
    return TAB_GROUPS.filter(g => g.asset === assetCn).map(g => `
        <div class="nav-group${g.pinned ? " nav-group--pinned" : ""}">
            <div class="nav-group__label">${g.pinned ? PIN_SVG : ""}${navGroupLabel(g)}</div>
            ${g.tabs.map(t => {
                const m = TAB_META[t.key];
                const tf = TF_SHORT[m.tf] || "";
                // 策略榜挂命中数（锁定态也挂，走 paidMeta）；涨跌幅榜恒为全市场数量、不挂。数据未到时不渲染，loadData 后补上。
                const hits = isStrategyTab(t.key) || MODULE_TABS.has(t.key) ? tabCount(t.key) : null;
                const locked = PAYWALL_ENABLED && !license.valid && !licensePending() && t.key !== TEASER_TAB && !FREE_TABS.has(t.key);
                return `<button class="nav-item${t.key === currentTab ? " is-active" : ""}" data-tab="${t.key}"${t.key === currentTab ? ' aria-current="page"' : ''} title="${g.label} · ${escapeHtml(m.name)}${hits != null ? ` · ${MODULE_TABS.has(t.key) ? "监控中" : "命中"} ${hits}` : ""}${locked ? " · 未解锁" : ""}">
                    <span class="nav-item__bar"></span>
                    ${tf ? `<span class="tf-chip${tf.length > 1 ? " tf-chip--wide" : ""}">${tf}</span>` : ""}
                    <span class="nav-item__name">${nameSegHtml(m.name, locked ? " " + LOCK_SVG : "")}</span>
                    ${hits != null ? `<span class="nav-item__count${hits === 0 ? " is-zero" : ""}">${hits}</span>` : ""}
                </button>`;
            }).join("")}
        </div>`).join("");
}

function renderNav() {
    // 资产分段控件激活态（rail / drawer 两份 DOM）
    document.querySelectorAll(".asset-seg__opt").forEach(b => {
        const on = b.dataset.k === currentAsset;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", String(on)); // SR 能读出当前选中的是哪个资产
    });
    // 两份导航都是整块重建 ⇒ 焦点在某个榜名上时记下它（哪一份、哪张榜），渲染后还回去（否则键盘焦点掉到 body）
    const act = document.activeElement;
    const focusRootId = act && act.classList.contains("nav-item") ? (act.closest("#boardNav,#drawerNav") || {}).id : null;
    const focusTab = focusRootId ? act.dataset.tab : null;
    const nav = document.getElementById("boardNav");
    if (nav) nav.innerHTML = navHtml();
    const dnav = document.getElementById("drawerNav");
    if (dnav) dnav.innerHTML = navHtml();
    if (focusRootId) document.querySelector(`#${focusRootId} .nav-item[data-tab="${focusTab}"]`)?.focus({ preventScroll: true });
    // rail 底部统计
    const foot = document.getElementById("railFoot");
    if (foot && data) {
        const assetCn = ASSET_CN[currentAsset];
        const n = TAB_GROUPS.filter(g => g.asset === assetCn).reduce((s, g) => s + g.tabs.filter(t => !MODULE_TABS.has(t.key)).length, 0);
        // 写标的范围而不是数量（tabCount 是某个榜的命中数，写成「监控 N 只」会误导）。
        const uni = currentAsset === "ashare" ? "沪深 A 股全市场" : "加密 USDT 永续合约全市场";
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
    document.getElementById("bhName").innerHTML = nameSegHtml(m.full);
    // 命中数挂在标题旁（说明收起时也看得到）；说明行只放 desc（完整规则，导航名可以短）。
    const note = document.getElementById("bhNote");
    const hitEl = document.getElementById("bhHit");
    const n = tabCount(currentTab);
    // 量词随榜的语义：策略榜说「命中」；行情榜无筛选，说「共」（与表尾同一判据）。
    // 数字包一层 <b>（HERO_LAYOUT 恒开 ⇒ `.is-hero .board-head__hit b` 放大成头条数字；关掉 HERO 才与正文同字重）。n 只会是数字（tabCount 只认数字），可直接进 innerHTML。
    const hit = n == null ? "" : MODULE_TABS.has(currentTab) ? `监控中 <b>${n}</b> 个`
        : `${isStrategyTab(currentTab) ? "命中" : "共"} <b>${n}</b> 个标的`;
    hitEl.innerHTML = hit;
    hitEl.hidden = !hit;
    // 榜在最上的版式：命中数后面接一句「按哪根 K 判、什么时候换批」（旧版式不加）。
    const metaEl = document.getElementById("bhMeta");
    if (metaEl) {
        const meta = HERO_LAYOUT ? batchMeta(currentTab) : "";
        metaEl.textContent = meta;
        metaEl.hidden = !meta;
    }
    note.innerHTML = noteHtml(m.desc || "");
    note.hidden = !m.desc;
    head.hidden = false;
    syncNoteClamp();
}

// N 日K（TradingView 切法：每年 1 月 1 日 UTC 起每 N 天一根、年底那根截断；与后端 tv_nd_bars 同一套）下一根的收盘时刻（那天 00:00 UTC）。
// 2~8 日线榜只在这一刻换成员 ⇒ 标题行与 0 命中空状态都按它写「下次换批」。
function nDayNextClose(n, now = Date.now()) {
    const y = new Date(now).getUTCFullYear();
    const ys = Date.UTC(y, 0, 1), nys = Date.UTC(y + 1, 0, 1);
    const day = Math.floor((now - ys) / 86400000);
    return new Date(Math.min(ys + (Math.floor(day / n) + 1) * n * 86400000, nys));
}
// 参考时刻用当前数据的 updateTime（表里的名单就是按那一刻已收盘的 K 判的），没数据才用本机时钟：换根那天 00:00 UTC 之后、
// 新数据到达之前（整点后约 2 分钟 + Pages 缓存），名单还是旧的 ⇒ due（已收盘、等这一枪换批），别说成「下一根」。
function nDayClose(n) {
    const d = nDayNextClose(n, parseUpdateTime(data && data.updateTime) || Date.now());
    return { due: d.getTime() <= Date.now(), when: `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日 00:00 UTC（北京时间 08:00）` };
}

// 小时级K（UTC 0 点起每 h 小时一根，h 整除 24 ⇒ 按毫秒取整就对齐 UTC 0 点）下一根的收盘时刻；参考时刻同 nDayClose（当前数据的 updateTime）。
function hourClose(h) {
    const step = h * 3600000;
    const t = (Math.floor((parseUpdateTime(data && data.updateTime) || Date.now()) / step) + 1) * step;
    const hh = ms => String(new Date(ms).getUTCHours()).padStart(2, "0") + ":00";
    return { due: t <= Date.now(), when: `${hh(t)} UTC（北京时间 ${hh(t + 8 * 3600000)}）` };
}

// 榜头的换批提示（HERO 版式下每张榜都有；短句，0 命中空状态那段长提示见 renderTable 的 nextBatch）。查不到周期就不写。
// `hourlyList: true` 的榜周 / 月线条件照常收盘才换，但成员名单每个整点重新圈定 ⇒ 后面补一句，别让人以为整周 / 整月不变。
function batchMeta(tab) {
    const base = batchMetaBase(tab);
    return base && (TAB_META[tab] || {}).hourlyList ? `${base} · 成员每个整点可能变化` : base;
}

function batchMetaBase(tab) {
    const m = TAB_META[tab] || {};
    const tf = m.tf || "";
    if (MODULE_TABS.has(tab)) return "各周期 K 收盘后随数据更新（整点后约 1–2 分钟）· 价格取整点那根 1 小时 K 的收盘价";
    if (isAshareTab(tab)) {
        const and = /^([2-8])日线$/.exec(tf);
        return and ? `按最新已收盘 ${and[1]} 日K 判 · 这根 ${and[1]} 日K 最后一个交易日收盘后换批（每年第一个交易日起每 ${and[1]} 个交易日一根）`
            : (ASHARE_BATCH_META[tf] || "");
    }
    if (m.hourly) return "日线条件按最新已收盘日 K 判 · 币种圈定每小时重拉";
    const nd = /^([2-8])日线$/.exec(tf);
    if (nd) {
        const c = nDayClose(+nd[1]);
        return c.due ? `按最新已收盘 ${nd[1]} 日K 判 · 新一根已于 ${c.when}收盘，整点后约 2 分钟换批`
            : `按最新已收盘 ${nd[1]} 日K 判 · 下一根 ${c.when}收盘后换批`;
    }
    const hm = /^(1|2|4|6|8|12)H$/.exec(tf);
    if (hm) {
        const c = hourClose(+hm[1]);
        return c.due ? `按最新已收盘 ${hm[1]}H K 判 · 新一根已于 ${c.when}收盘，整点后约 2 分钟换批`
            : `按最新已收盘 ${hm[1]}H K 判 · 下一根 ${c.when}收盘、约 2 分钟后换批`;
    }
    if (tf === "日线") return "按最新已收盘日 K 判 · 每天 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "周线") return "按最新已收盘周 K 判 · 每周一 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "月线") return "按最新已收盘月 K 判 · 每月 1 号 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "日线/周线/月线") return "按最新已收盘日 K、周 K、月 K 判 · 每天 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "周线/月线") return "按最新已收盘周 K、月 K 判 · 每周一或每月 1 号 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "名单") return "按名单判 · 每个整点重新圈定（整点后约 2 分钟）";
    if (tf === "日线~月线") return "按最新已收盘日 K、2日K、3日K、周 K、月 K 判 · 每天 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "日线/周线") return "按最新已收盘日 K、周 K 判 · 每天 00:00 UTC（北京时间 08:00）换一批";
    if (tf === "4H/6H/8H/12H") return "按最新已收盘的 4H / 6H / 8H / 12H K 判 · UTC 0/4/6/8/12/16/18/20 点收盘后约 2 分钟换批";
    return "";
}

// 说明分段（纯展示，desc 原文一字不改）：在下面这些句首之前另起一段。站内 desc 的固定写法是
// 「判据 → 有 N 处要先说清楚（第一…第二…）→ 和其他榜的关系 → 命中数 / 回放 → 也要如实说一句 → 表格里的各轴 / 范围」，
// 一千多字连成一段读不动。句首对不上就少分几段、整段照旧；新写 desc 沿用这些句首就自动分段。
// 收起态（.is-clamped）下 CSS 把 <p> 压回 inline，两行截断照旧按一整段算。
const NOTE_BREAK_RE = /。(?=有[一二三四五六七八九十两]处(?:要)?先说清楚|第[一二三四五六七八九十]，|和站内其他榜|和另外两张|命中数|也要如实说一句|代价也要说清楚|表格里的|这是加密同名榜的 A股 版)/g;
function noteHtml(desc) {
    return desc ? "<p>" + escapeHtml(desc).replace(NOTE_BREAK_RE, "。</p><p>") + "</p>" : "";
}

// === A股 镜像（2026-10-19 复活：站长「恢复A股的TAB，逻辑和加密同步一致」）===
// A股 的榜 ＝ 加密现役榜逐张镜像：后端同一个 build_rankings 产出（判据只有一份），key ＝ ashareKey(加密 key)。这里按加密那几组自动生成「A股行情」「A股策略」两组
// （榜名 / 周期跟着加密走；说明 ＝ ASHARE_NOTE ＋ 加密那张说明的第一段判据；三张行情榜的说明单独写：涨跌幅口径不同）⇒ 改加密榜不用另改 A股。
// 轴集 ＝ 加密那张去掉订单流（tushare 没有主动买卖数据，后端行上恒 null）。不镜像的加密榜（与后端 fetch_data.ASHARE_SKIP_TABS 必须一致，audit C 项在盯）：
// 加密专属名单圈定的三张（A股 没有对应的名单）；后端那份另含几张加密这边不出的榜（前端用不到，audit C 只比有公开编号的）。A股 的 N 日K（2~8 日线、3日线）按交易日切：每年第一个交易日起每 N 个交易日一格
// （10-19 在 TradingView 上核过；后端 `nd` 时间轴），说明里补一句（ASHARE_ND_NOTE）、换批提示不写日期（前端没有交易日历）。
// ⚠️ 要放在 NOTE_BREAK_RE 之后、首次渲染之前：用它切加密说明的第一段，也要往 TAB_GROUPS / TAB_META / TABS_CONFIG / CHANGE_PCT_TABS 里补 A股 那几张。
const ASHARE_SKIP_TABS = new Set(["s05", "s07", "s08"]);
const ashareKey = k => "ashare" + k[0].toUpperCase() + k.slice(1);
const ASHARE_ONLY_NOTE = "加密那边这一套已不展示；A股 这边照旧整张保留。";
const ASHARE_NOTE = "这是加密同名榜的 A股 版。A股 这边有几处不同：日 K 一个交易日一根（北京时间 15:00 收盘），等当天数据发布（一般 16:00 前后）才换一批；周 K、月 K 以本周、本月最后一个交易日收盘为准；价格按前复权；涨跌幅按交易所口径、比的是上一根收盘；停牌的股票不入榜；没有订单流（A股 数据里没有主动买卖归边）。范围是沪深 A 股，不含北交所。A股 没有单独做回放：加密那张说明里的回放、命中数和表现都是加密市场的数字，这里只摘了判据。";
const ASHARE_MARKET_DESC = {
    threeDayChange: "最新已收盘 3日K 的涨跌幅：这根 3日K 的收盘比上一根 3日K 的收盘（前复权；新股只有一根时比发行价）。A股 的 3日K 按交易日切：每年第一个交易日起每 3 个交易日一根，休市日不占格，年底那根可能不满 3 个——和 TradingView 一样；只认已收盘的那根，所以只在一根 3日K 的最后一个交易日收盘后换一批。没有任何筛选条件，全部沪深 A 股，主要用来看排序：排序条上全是 3日K 版本的轴，每行下面那行小字也只显示 3日K 的数。",
    dailyChange: "最新已收盘日 K 的涨跌幅，按交易所口径：比的是上一个交易日的收盘（含集合竞价跳空；主板涨停约 +10%、创业板 / 科创板 +20%、ST +5%），和行情软件一致。没有任何筛选条件——全部沪深 A 股（不含北交所，停牌的不在）都在里面，主要用来看排序：排序条上只有日线自己的轴（日涨跌幅、日成交额、日线RSI、日RSI缺口、日CVD强弱、日ADX、日+DI、日MACD强弱、日SAR多头根数；A股 没有订单流），每行下面那行小字也只显示日线的数。每个交易日收盘、当天数据发布后（一般北京时间 16:00 前后）换一批，周末和节假日停在上一个交易日。价格按前复权。",
    weeklyChange: "最新已收盘周 K 的涨跌幅：这一周最后一个交易日的收盘比上一周的收盘（前复权）。本周最后一个交易日收盘、数据发布后就换成这一周，下一周之内数值不变。没有任何筛选条件，全部沪深 A 股，主要用来看排序：排序条上只有周线自己的轴，每行下面那行小字也只显示周线的数。「周成交额」是那一根周 K 的成交额，不是 5 日滚动。",
    monthlyChange: "最新已收盘月 K 的涨跌幅：这个月最后一个交易日的收盘比上个月的收盘（前复权）。本月最后一个交易日收盘、数据发布后就换成这个月，下个月之内数值不变。没有任何筛选条件，全部沪深 A 股，主要用来看排序：排序条上只有月线自己的轴，每行下面那行小字也只显示月线的数。",
};
// A股 行情榜副行的价格上下文（close-to-close，见 ashareMktCtx）、榜头换批提示（batchMeta 的 A股 分支）。
// 周 / 月线不写「上周收 → 本周收」：显示的是最新已收盘那根，周一到周四它是上周、整个月里它是上个月（10-19 审计）。
const ASHARE_PRICE_LABELS = { "日线": ["昨收", "收"], "3日线": ["上一根收", "收"], "周线": ["上一根收", "收"], "月线": ["上一根收", "收"] };
// 加密说明的第一段（判据）；其中「…就离开：日线看每天 00:00（UTC）那次收盘…」这种加密换批时刻的从句去掉（A股 的换批见 ASHARE_NOTE / 榜头）。
const ashareCriteria = desc => (desc || "").split(NOTE_BREAK_RE)[0].replace(/。$/, "").replace(/：[^。：]*UTC[^。]*/g, "");
const ASHARE_ND_NOTE = n => `A股 的 ${n} 日K 按交易日切：每年第一个交易日起每 ${n} 个交易日一根（休市日不占格、停牌的股票那几格空着），年底那根可能不满 ${n} 个——和 TradingView 一样。`;
const ASHARE_BATCH_META = {
    "日线": "按最新已收盘日 K 判 · 每个交易日收盘、数据发布后（约北京时间 16:00）换一批",
    "周线": "按最新已收盘周 K 判 · 本周最后一个交易日收盘后换一批",
    "月线": "按最新已收盘月 K 判 · 本月最后一个交易日收盘后换一批",
    "日线/周线": "按最新已收盘日 K、周 K 判 · 每个交易日收盘后换一批",
    "日线/周线/月线": "按最新已收盘日 K、周 K、月 K 判 · 每个交易日收盘后换一批",
    "日线~月线": "按最新已收盘日 K、2日K、3日K、周 K、月 K 判 · 每个交易日收盘后换一批",
};
// A股 轴的悬停提示：涨跌幅比的是上一根收盘（前复权、含跳空；加密是 K 线实体）、没有订单流可指、加密的回放数字不适用 ⇒ 按轴 key 换掉，没列的照用加密那句。
// 加密那边改这几根轴的 hint 时看一眼这里要不要跟。
const ASHARE_AXIS_HINT = {
    changePercent: "最新已收盘那根日K的涨跌幅：比上一个交易日收盘（前复权、含跳空），和行情软件一致",
    weeklyChangePercent: "最新已收盘那一根周K的涨跌幅：比上一周收盘（前复权），一周只更新一次",
    monthlyChangePercent: "最新已收盘那一根月K的涨跌幅：比上个月收盘（前复权），一个月只更新一次",
    cvdStrength: "按K线形态推断的买卖失衡，不是真实成交归边",
    threeDayCvdStrength: "按3日K线形态推断的买卖失衡，不是真实成交归边",
    monthlyCvdStrength: "按月K线形态推断的买卖失衡，不是真实成交归边",
    rsiSmaGap: "日线RSI(14)减去它自己的14日SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几天动能冲得越急。只看相对排名、不是买点；不足28个交易日显示「—」",
    weeklyRsiSmaGap: "周线RSI(14)减去它自己的14周SMA（TV的RSI指标里那条均线）：正值＝RSI站在均线上方，越大＝这几周动能冲得越急。只看相对排名、不是买点；一周只更新一次，不足28周显示「—」",
    monthlyDiPlus: "最新已收盘月K的+DI（DMI 14，对齐TV）：多方方向压力，0–100，一个月只更新一次；不足15个月显示「—」",
    athDistPct: "回到历史高点还要涨多少：上市以来全部日K的最高价（前复权、含影线）÷ 最新收盘 − 1。降序＝离高点最远；除权后的高点按前复权算，和行情软件的前复权图一致",
};
let ASHARE_HOME_TAB = null;   // A股 默认落地 ＝ A股策略组第一张（加密置顶组第一张的 A股 版），下面填
{
    const src = TAB_GROUPS.filter(g => g.asset === "加密")
        .flatMap(g => g.tabs.map(t => ({ ...t, tf: t.tf || g.tf })))
        .filter(t => !ASHARE_SKIP_TABS.has(t.key) && TABS_CONFIG[t.key]);   // 漏配 TABS_CONFIG 的加密榜跳过：顶层这里一抛就整页白屏（只坏那一张才对）
    // 只给 A股 的那几张按 after 插回原来的位置（anchor 找不到就排到最后）
    for (const t of ASHARE_ONLY_SRC) {
        if (!TABS_CONFIG[t.key]) continue;
        const i = src.findIndex(x => x.key === t.after);
        src.splice(i < 0 ? src.length : i + 1, 0, t);
    }
    // 名字 / 说明跟着加密那张走（含解锁后的真名，见 tabMetaEntry）：说明 ＝ 加密那张说明的第一段 ＋ A股 说明；行情榜的说明单独写。
    const mirror = t => {
        const tail = `${ASHARE_NOTE}${/^[2-8]日线$/.test(t.tf) ? ASHARE_ND_NOTE(t.tf[0]) : t.tf === "日线~月线" ? ASHARE_ND_NOTE("2、3") : ""}${ASHARE_ONLY_TABS.has(t.key) ? ASHARE_ONLY_NOTE : ""}`;
        return { key: ashareKey(t.key), src: t.key, name: t.name, full: t.full, tf: t.tf, hourly: t.hourly, desc: t.desc,
            descOf: d => ASHARE_MARKET_DESC[t.key] || `判据和加密同名榜一字不差：${ashareCriteria(d)}。${tail}` };
    };
    const groups = [
        { label: "A股行情", asset: "A股", tabs: src.filter(t => CHANGE_PCT_TABS.has(t.key)).map(mirror) },
        { label: "A股策略", asset: "A股", tabs: src.filter(t => !CHANGE_PCT_TABS.has(t.key)).map(mirror) },
    ];
    for (const t of src) {
        const k = ashareKey(t.key);
        TABS_CONFIG[k] = { ...TABS_CONFIG[t.key], sorts: TABS_CONFIG[t.key].sorts.filter(a => !/takerStrength$/i.test(a.key))
            .map(a => ASHARE_AXIS_HINT[a.key] ? { ...a, hint: ASHARE_AXIS_HINT[a.key] } : a) };
        if (CHANGE_PCT_TABS.has(t.key)) CHANGE_PCT_TABS.add(k);
    }
    for (const g of groups) {
        TAB_GROUPS.push(g);
        for (const t of g.tabs) TAB_META[t.key] = tabMetaEntry(g.asset, t, t.tf, t.src, t.descOf);
    }
    ASHARE_HOME_TAB = (groups[1].tabs[0] || groups[0].tabs[0] || {}).key || null;
    lastTabByAsset.ashare = ASHARE_HOME_TAB;
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
    // 重建 innerHTML 会把焦点丢到 body（键盘用户在 chip 上回车后，再按 Tab 又回到页首）⇒ 记下焦点所在的轴，渲染后还回去
    const act = document.activeElement;
    const focusKey = act && strip.contains(act) ? act.dataset.sortkey : null;
    const arrow = sortAsc ? "▲" : "▼";
    // 标签开头的周期（日 / 周 / 月，或小时级的「4H」「12H」、N 日的「2日」「8日」…）一变就插一道分隔：把排序轴按周期分成组
    let prevTf = null;
    strip.innerHTML = `<span class="sort-strip__label">排序</span><div class="sort-strip__chips">` +
        config.sorts.map(s => {
            const act = s.key === sortField;
            const tf = s.group || ("日周月".includes(s.label[0]) ? s.label[0] : (/^\d+(?:H|日)/.exec(s.label) || [null])[0]);
            const sep = prevTf && tf && tf !== prevTf ? `<span class="sort-strip__sep" aria-hidden="true"></span>` : "";
            prevTf = tf || prevTf;
            return `${sep}<button type="button" class="sort-chip${act ? " is-active" : ""}" data-sortkey="${s.key}"
                aria-pressed="${act}" title="${(act ? "再点一次切换升/降序" : `按${s.label}排序`) + (s.hint ? "　·　" + s.hint : "")}">${s.label}${act ? `<span class="sort-chip__arrow">${arrow}</span>` : ""}</button>`;
        }).join("") + `</div>`;
    // 重建 innerHTML 会把横向滚动位归零（刚点的右侧轴会滚出视野），同 tab 内重渲染时手动还原
    const chips = strip.querySelector(".sort-strip__chips");
    if (chips && keepScroll) chips.scrollLeft = keepScroll;
    if (focusKey) strip.querySelector(`.sort-chip[data-sortkey="${focusKey}"]`)?.focus({ preventScroll: true });
    lastStripTab = currentTab;
    strip.hidden = false;
}

// 锁定态的模糊预览行：确定性假数据，宽度写死不用随机（避免每次重渲染抖动）。
const LOCK_PREVIEW_ROWS = [
    { sym: 82, bar: 96 }, { sym: 104, bar: 78 }, { sym: 66, bar: 64 }, { sym: 92, bar: 55 },
    { sym: 74, bar: 47 }, { sym: 110, bar: 39 }, { sym: 70, bar: 30 }, { sym: 88, bar: 23 },
];
// firstRank：预览行的起始名次（橱窗榜的预览接在免费那一行后面，从第 2 名起）；null ＝ 名次未知、一律写「—」（见 renderTable 的 rankUnknown）。
// count：画几行 ＝ 锁住的那部分有几个标的（全锁榜 ＝ 命中数，橱窗榜 ＝ 命中数减公开行数），最多 8 行；null（命中数未知）才画满。
//   别改回恒画 8 行：命中 1 个的榜会在锁后面印出带奖牌的第 2–8 名（不存在的名次）。
function lockPreviewRowsHtml(firstRank = 1, count = null) {
    const rows = count == null ? LOCK_PREVIEW_ROWS : LOCK_PREVIEW_ROWS.slice(0, Math.max(0, count));
    return `<div class="lockgate__rows" aria-hidden="true">` + rows.map((r, i) => {
        const rank = firstRank == null ? null : i + firstRank;
        const rankCell = rank == null ? `<span class="rank-num">—</span>`
            : rank <= 3
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
// 锁定卡片：预览行 + 锁图标 + 命中数 + CTA。n ＝ 命中数（paidMeta，可为 null）；opts.countHtml 可整句替换标题（橱窗榜用）；
// opts.previewCount ＝ 预览画几行（见 lockPreviewRowsHtml 的 count）。
// 文案与动作走 lockGateCopy / bindLockGate，全锁榜与未解锁的橱窗榜共用同一张卡。
function lockGateHtml(n, opts) {
    const count = opts.countHtml || (n != null ? `已找到 <b>${n}</b> 个标的` : "该榜已锁定");
    return `<div class="lockgate">
        ${lockPreviewRowsHtml(opts.firstRank, opts.previewCount)}
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
// 没有 key → 去购买，另给「已有通行证」入口（回访用户直接输码，不必先进购买弹窗）；有 key 但 !valid（过期 / 吊销）→ 重新输入 / 续费；
// 查无此卡（not_found：Worker 抖动时输入的一串没验就存下了、恢复后才查出来，多半是输错）→ 只请他重新输入，别催续费（可能刚付过钱）。
function lockGateCopy() {
    const expired = !!license.key;
    const notFound = expired && license.reason === "not_found";
    return {
        expired,
        notFound,
        desc: notFound
            ? "查不到这张通行证<br>请检查是否粘贴完整，重新输入即可"
            : expired
            ? "通行证已失效（过期或被停用）<br>续费后即可继续查看完整名单"
            // 写「全部榜单」不写「全部策略榜」：涨跌幅榜同样付费
            : "购买通行证，解锁本站全部榜单的完整名单与多轴排序",
        ctaLabel: notFound ? "重新输入" : expired ? "重新输入 / 续费" : "立即解锁",
        hintHtml: expired ? ""
            : `<button type="button" class="lockgate__link" id="lockgateEnterBtn">已有通行证？点此输入</button>`,
    };
}
function bindLockGate(expired) {
    const cta = document.getElementById("emptyUnlockBtn");
    if (cta) cta.addEventListener("click", expired ? () => openUnlockDialog(LOCK_REASON[license.reason]) : openPurchaseDialog);
    const enter = document.getElementById("lockgateEnterBtn");
    if (enter) enter.addEventListener("click", () => openUnlockDialog());
}
// 锁定态收起无数据可操作的搜索框 / 排序条 / 表头，让 CTA 卡片顶到首屏；非锁定态恢复显示。
// hideSearchOnly：未解锁的橱窗榜只收搜索框（排序条与表头留着，那一行免费内容还要用）。
function setLockedChrome(hide, hideSearchOnly) {
    const search = document.querySelector(".board-head .search");
    if (search) search.hidden = hide || !!hideSearchOnly;
    // renderSortStrip 已按 config 置 hidden=false;锁定时在其之后覆盖为收起
    if (hide) { const strip = document.getElementById("sortStrip"); if (strip) strip.hidden = true; }
    const thead = document.querySelector(".table .thead");
    if (thead) thead.hidden = hide;
}

// === TG 通知监控（tgWatch）的副行与表格下面两块卡片（行字段 / tgWatchLog 见后端 `_tg_watch`）===
// 副行：每个周期一段「1H 10-22 17:00 推 · 缺口 +7.52 → +6.10」（推送时 → 现在），末段「推送价 → 现价」（带 --ctx：≤860px 排最前，两行放不下先让掉的是周期段）。
//   不走 axesSub：这张表默认要讲的是推送，日线各轴在排序条上照样能切。
function tgWatchSub(v) {
    const seg = (v.tgTfs || []).map(t =>
        `<span class="sub__seg"><b class="sub__tf">${escapeHtml(t.tf)}</b> ${fmtTgTime(t.at)} 推 · 缺口 ${fmtRsiGapVal(t.pushGap)} → ${fmtRsiGapVal(t.gap)}</span>`);
    seg.push(`<span class="sub__seg sub__seg--ctx">${fmtMktPrice(v.tgPushPrice)} → ${fmtMktPrice(v.tgPrice)}</span>`);
    return seg.join('<span class="sub__sep"> | </span>');
}
// 通知记录里的币链到 TradingView 时带上该周期（同 TG 消息里的链接）
const TG_TV_INTERVAL = { "1H": 60, "2H": 120, "4H": 240, "6H": 360, "8H": 480, "12H": 720, "日线": "D", "2日线": "2D", "3日线": "3D",
    "4日线": "4D", "5日线": "5D", "6日线": "6D", "7日线": "7D", "8日线": "8D" };
const TG_KIND = { in: ["🟢", "入榜"], out: ["🔴", "离榜"], start: ["📋", "开始记录时在榜"] };   // 同 TG 消息的写法「🟢 1H 入榜 2 个」
let lastTgPanelKey = null;   // 同一份数据、同一张表重渲染时（切轴、搜索）不重建，免得两块卡片的滚动位回到顶
// #tgPanel：最近离榜（推过入榜、24 小时内离开那张榜的）＋ 通知记录（最近 7 天每一枪推了什么）。只在当前是 MODULE_TABS 那一项、
//   且付费包里有这张表时显示（锁定态 / 换到别的榜都收起）。
function renderTgPanel() {
    const el = document.getElementById("tgPanel");
    if (!el) return;
    const log = data && MODULE_TABS.has(currentTab) && Array.isArray(data[currentTab]) ? data.tgWatchLog : null;
    if (!log || typeof log !== "object") {
        el.hidden = true;
        el.innerHTML = "";
        lastTgPanelKey = null;
        return;
    }
    const key = `${data.updateTime}|${currentTab}`;
    if (key === lastTgPanelKey && !el.hidden) return;
    const exits = Array.isArray(log.exits) ? log.exits : [];
    const events = Array.isArray(log.events) ? log.events : [];
    const link = (sym, tf) => {
        const iv = TG_TV_INTERVAL[tf];
        return `<a class="tgp__sym" href="${escapeHtml(tvUrlFor(sym) + (iv ? `&interval=${iv}` : ""))}" target="_blank" rel="noopener noreferrer"
            title="在 TradingView 打开 ${escapeHtml(sym)} 的 ${escapeHtml(tf)} 图表">${escapeHtml(symbolDisplayParts(sym).base)}</a>`;
    };
    const chg = (a, b) => {
        if (!(a > 0) || b == null) return `<span class="tgp__chg">—</span>`;
        const x = (b / a - 1) * 100;
        return `<span class="tgp__chg${x >= 0.005 ? " val--up" : x <= -0.005 ? " val--down" : ""}">${fmtTgPct(x)}</span>`;
    };
    const exitsHtml = exits.length
        ? `<div class="tgp__rows">` + exits.map(e => `<div class="tgp__row">
                <span class="tgp__tf">${escapeHtml(e.tf)}</span>${link(e.symbol, e.tf)}
                <span class="tgp__when">${fmtTgTime(e.inAt)} 推送 → ${fmtTgTime(e.outAt)} 离榜</span>
                <span class="tgp__px">${fmtMktPrice(e.inPrice)} → ${fmtMktPrice(e.outPrice)}</span>${chg(e.inPrice, e.outPrice)}
            </div>`).join("") + `</div>`
        : `<div class="tgp__empty">24 小时内没有推送过的币离榜</div>`;
    const blockHtml = b => {
        const items = (b.items || []).filter(Array.isArray);
        const [ico, word] = TG_KIND[b.kind] || ["", escapeHtml(b.kind)];
        return `<div class="tgp__blk">${ico} <b>${escapeHtml(b.tf)}</b> ${word} ${items.length} 个：`
            + items.map(([s, g]) => `${link(s, b.tf)} ${fmtRsiGapVal(g)}`).join("、") + `</div>`;
    };
    const eventsHtml = events.length
        ? `<ol class="tgp__feed">` + events.map(ev => `<li class="tgp__ev">
                <span class="tgp__time">${fmtTgTime(ev.at)}</span>
                <div class="tgp__blocks">${(ev.blocks || []).map(blockHtml).join("")}</div>
            </li>`).join("") + `</ol>`
        : `<div class="tgp__empty">最近 7 天还没有推送</div>`;
    el.innerHTML = `
        <div class="tgp__card">
            <div class="tgp__head"><h2 class="tgp__title">最近离榜</h2><span class="tgp__meta">推送过的币离开所在那张榜后留 24 小时 · ${exits.length} 条</span></div>
            ${exitsHtml}
        </div>
        <div class="tgp__card">
            <div class="tgp__head"><h2 class="tgp__title">通知记录</h2><span class="tgp__meta">最近 7 天 · 北京时间 · 币后面是该周期的 RSI 缺口${log.since ? ` · ${fmtTgTime(log.since)} 起记录` : ""}</span></div>
            ${eventsHtml}
        </div>`;
    el.hidden = false;
    lastTgPanelKey = key;
}

function renderTable() {
    // 标识与排序条不依赖数据，放在 !data 早退之前（否则首屏数据未到时切 tab，标识栏停在旧内容）
    renderBoardHead();
    renderSortStrip();
    renderTgPanel();

    if (!data) return;

    const config = TABS_CONFIG[currentTab];
    if (!config) return;

    const foot = document.getElementById("tableFoot");

    const tbody = document.getElementById("rankBody");
    const header = document.getElementById("valueHeader");
    if (!tbody || !header) return;

    // 锁定态 ＝ 公开 JSON 不含该 key（undefined，不是空数组）。提前判定：收起假控件，下方空状态渲染橱窗卡片。
    const locked = PAYWALL_ENABLED && data[currentTab] === undefined && currentTab !== TEASER_TAB && !FREE_TABS.has(currentTab);
    const pending = licensePending();
    // 未解锁的橱窗榜：公开文件里只有免费那 1 行，行下面接锁定卡片（见渲染行那段）。pending 时不出卡片（理由见 licensePending）。
    const teaserLocked = PAYWALL_ENABLED && currentTab === TEASER_TAB && !license.valid && !pending;
    // 有卡（有效或待验证）但付费整包里还没有橱窗榜（首开碰上 KV 边缘缓存回吐上一小时的包被拒收、或还在等 Worker 答复）：
    // 表里同样只有公开文件那 1 行 ⇒ 同样收起搜索、表尾别写成「共 1 个标的」（标题旁的命中数取自 paidMeta，两边会打架）。
    const teaserPartial = PAYWALL_ENABLED && currentTab === TEASER_TAB && !teaserLocked
        && !(license.valid && paidData && Array.isArray(paidData[TEASER_TAB]));
    // 搜索框：全锁榜没有行可搜；橱窗榜只有 1 行时，搜别的币只会得到「没有匹配」—— 而它其实在榜上 ⇒ 都收起，
    // 并清掉残留的搜索词（必须在 getSortedItems 之前）。排序条与表头只在全锁时收起。
    setLockedChrome(locked, teaserLocked || teaserPartial);
    if ((locked || teaserLocked || teaserPartial) && searchQuery) {
        searchQuery = "";
        const sb = document.getElementById("searchBox");
        if (sb) sb.value = "";
    }
    // 锁定卡片在场时表体不限高（卡片别被内滚动切掉）
    tbody.classList.toggle("tbody--gated", locked || teaserLocked);
    const items = getSortedItems();

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
        // 日更资产（A股）的空榜文案跟榜头换批提示（batchMeta 的 A股 分支）；再加日更资产要并进 dailyAsset，否则落进加密的「整点后重算」。
        const dailyAsset = isAshareTab(currentTab);
        const strict = isStrategyTab(currentTab);
        // 锁定态优先：未解锁 / 通行证确定失效 → 橱窗卡片；通行证有效（或还在等 Worker 答复）只是付费数据没拉到 → 加载态
        // （别催已付费的人重复付款：Worker 一抖就对持有效卡的人显示「已失效…续费」，是这里出过的真问题）。
        if (locked && !license.valid && !pending) {
            const copy = lockGateCopy();
            const n = tabCount(currentTab);
            // 预览行按命中数画（0 命中时背后不垫假行）。0 命中照样出锁定卡片（「已找到 0 个」+ 解锁）是在案设计，改不改归站长。
            tbody.innerHTML = lockGateHtml(n, { ...copy, previewCount: n });
            bindLockGate(copy.expired);
            // 页脚（role=status / aria-live）给读屏用户播报一句状态（#rankBody 不设 live）；行情榜同样付费 ⇒ 说「该榜」不说「该策略榜」
            if (foot) { foot.textContent = copy.notFound ? "查不到这张通行证，请重新输入" : copy.expired ? "通行证已失效，续费后可继续查看" : "该榜需通行证解锁"; foot.hidden = false; }
            updateExportBar();  // 锁定态也要刷：否则切榜后导出坞仍显示上一榜的「已选 N 个」+ 表头勾选态残留
            return;
        }
        let ico, title, desc;
        if (locked) {   // 走到这里 ＝ license.valid 或 pending（确定失效的上面已 return）
            const n = tabCount(currentTab);
            // 三种情况分开说：a) paidData == null（整包没拉到）：fetchPaidData 失败不推进 lastPaidUpdateTime，下一轮确会重试；
            // b) 整包有但缺这个 key（服务端没产出）：paidFetchKey 不变、数据更新前不再打 Worker ⇒ 别许诺「30 秒重试」，也别自动重试；
            // c) pending：本机有卡、Worker 还没给出明确答复 ⇒ 不说「有效」也不说「失效」，同样每轮重试。
            // A股 那包另拉（asharePaidData）：还没到 ＝ 加载中，别说成「服务端缺这个榜」。
            const pd = isAshareTab(currentTab) ? asharePaidData : paidData;
            const missingKey = license.valid && pd && !(currentTab in pd);
            const ashareLoading = license.valid && isAshareTab(currentTab) && !asharePaidData;
            ico = missingKey ? "🛠️" : "⏳";
            if (missingKey) {
                title = n != null ? `该榜暂时缺数据（命中 ${n} 个）` : "该榜暂时缺数据";
                desc = "通行证有效，但服务端本次未提供这个榜<br>下次数据更新后自动恢复，无需重新解锁";
            } else if (ashareLoading && ashareFailStreak) {
                title = n != null ? `已找到 ${n} 个标的，A股 数据暂时没拉到` : "A股 数据暂时没拉到";
                desc = "A股 这一包有十几 MB，这次没拉下来<br>稍后自动重试，无需任何操作";
            } else if (ashareLoading) {
                title = n != null ? `已找到 ${n} 个标的，A股 数据加载中…` : "A股 数据加载中…";
                desc = "A股 这一包有十几 MB，切过来第一次要等几秒<br>之后一天只拉一次";
            } else if (pending) {
                title = "正在验证通行证…";
                desc = "验证服务暂时没连上<br>30 秒内自动重试，无需任何操作";
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
        } else if (MODULE_TABS.has(currentTab)) {
            ico = "🔔";
            title = "目前没有监控中的币";
            desc = "有币新入榜就会出现在这里<br>各周期 K 收盘后约 1–2 分钟更新；最近离榜和通知记录在下面";
        } else if (strict) {
            ico = "🎯";
            // 加密策略榜一律按最新已收盘 K 判，周期内名单不变 ⇒ 别暗示「下个整点可能就有」，写清下次换批的时刻。
            // 跨周期榜按变得最快的那个周期算（含日线 ⇒ 每天换；周＋月 ⇒ 周一或 1 号先到的那个）；tf 取 TAB_META（同 rail 徽标）。
            const tf = (TAB_META[currentTab] || {}).tf || "";
            // hourly（币种圈定每小时重拉）：日线条件照样 00:00 UTC 才换，但成员每小时都可能变 ⇒ 别写「同一天之内不变」。
            const nd = /^([2-8])日线$/.exec(tf);   // 2~8 日线：要排在 tf.includes("日线") 之前
            const ndc = nd ? nDayClose(+nd[1]) : null;
            const hm = /^(1|2|4|6|8|12)H$/.exec(tf);
            const hc = hm ? hourClose(+hm[1]) : null;
            const nextBatch = (TAB_META[currentTab] || {}).hourly ? "日线条件按最新已收盘日 K 判（每天 00:00 UTC 换），币种圈定每小时重拉<br>整点后约 2 分钟可能有变化"
                : (TAB_META[currentTab] || {}).hourlyList ? (tf === "周线" ? "周线条件按最新已收盘周 K 判（每周一 00:00 UTC 换）" : "周线、月线条件按最新已收盘周 K、月 K 判（每周一 / 每月 1 号 00:00 UTC 换）")
                    + "，成员名单每个整点重新圈定<br>整点后约 2 分钟可能有变化"
                : nd ? (ndc.due ? `按最新已收盘 ${nd[1]} 日K 判，新一根已于 ${ndc.when}收盘<br>整点后约 2 分钟换批`
                    : `按最新已收盘 ${nd[1]} 日K 判，当前这根收完之前名单不变<br>下次换批：${ndc.when}这根 ${nd[1]} 日K 收盘后`)
                : hm ? (hc.due ? `按最新已收盘 ${hm[1]}H K 判，新一根已于 ${hc.when}收盘<br>整点后约 2 分钟换批`
                    : `按最新已收盘 ${hm[1]}H K 判，两次收盘之间名单不变<br>下次换批：${hc.when}这根 ${hm[1]}H K 收盘后约 2 分钟`)
                : tf.includes("日线") ? "按最新已收盘日 K 判，同一天之内名单不变<br>下次换批：每天 00:00 UTC（北京时间 08:00）收盘后"
                : tf === "周线" ? "按最新已收盘周 K 判，整周之内名单不变<br>下次换批：下周一 00:00 UTC（北京时间周一 08:00）收盘后"
                : tf === "月线" ? "按最新已收盘月 K 判，整个月之内名单不变<br>下次换批：下月 1 号 00:00 UTC（北京时间 1 号 08:00）收盘后"
                : tf === "4H/6H/8H/12H" ? "按最新已收盘的 4H / 6H / 8H / 12H K 判，其余整点名单不变<br>下次换批：下一根 4H 或 6H K 收盘后约 2 分钟（UTC 0/4/6/8/12/16/18/20 点）"
                : tf === "名单" ? "名单每个整点重新圈定<br>整点后约 2 分钟可能有变化"
                : tf === "周线/月线" ? "按最新已收盘周 K 与月 K 判，名单只在周 K 或月 K 收盘时换<br>下次换批：下周一或下月 1 号 00:00 UTC（北京时间 08:00），以先到的为准"
                : "筛选条件较严，命中数会随行情波动<br>整点后约 2 分钟自动重算";
            title = dailyAsset ? "目前没有标的命中该策略" : "目前没有合约命中该策略";
            desc = dailyAsset
                ? `筛选条件较严，命中数会随行情波动<br>${batchMeta(currentTab).replace(" · ", "，") || "每个交易日收盘后自动重算"}`
                : nextBatch;
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

    // 未解锁的橱窗榜：免费那一行下面接模糊预览 + 锁定卡片（与全锁榜同一张卡，预览名次接着往下排）——
    // 新访客的落地页就是这张榜，整张表只剩孤零零一行会被当成「就这么点内容」。
    const total = (data[currentTab] || []).length;
    const teaserHits = tabCount(currentTab); // paidMeta 的真实命中数（不是被截成 1 行的数组长度）
    const teaserRest = teaserHits != null && teaserHits > total ? teaserHits - total : null;
    // 橱窗命中数不超过公开行数（现任橱窗不少日子只有 1 个；0 个的日子走上面的空状态、到不了这里）：公开的就是整张榜 ⇒ 名次照常、背后不垫预览行、
    //   别写「完整榜单已锁定 / 还有 N 个」（不实：付了钱也只有这几行）。锁定卡片照出 —— 它是落地页的购买入口（在案设计，去不去归站长）。
    const teaserComplete = (teaserLocked || teaserPartial) && teaserHits != null && teaserHits <= total;
    // 橱窗榜只有公开那 1 行时（未解锁 / 付费包还没到），它是**默认视图**（首轴降序）的第一名：换了轴或切成升序，它在完整榜单里
    // 多半不是第 1 ⇒ 名次与预览行一律写「—」，别在免费面上印假名次。
    const rankUnknown = (teaserLocked || teaserPartial) && !teaserComplete && !(config.sorts && sortField === config.sorts[0].key && !sortAsc);
    const gateCopy = teaserLocked ? lockGateCopy() : null;
    const gateHtml = gateCopy ? lockGateHtml(null, {
        ...gateCopy, firstRank: rankUnknown ? null : shown.length + 1, previewCount: teaserComplete ? 0 : teaserRest,
        countHtml: teaserComplete ? `这张榜本期就这 <b>${teaserHits}</b> 个标的`
            : teaserRest != null ? `还有 <b>${teaserRest}</b> 个标的` : "完整榜单已锁定",
    }) : "";

    tbody.innerHTML = shown
        .map((item, i) => {
            const rank = rankUnknown ? null : i + 1;
            // 只在值列展示涨跌幅时红绿上色：涨跌幅榜首轴 key 就是 value（别改名，否则红绿失效）；切到其它轴一律 neutral。
            // 轴上标了 signed（TG 通知监控的「推送以来涨跌」）的也按正负上色。
            const colorClass = sortField === "value" ? getColorClass(item.value, currentTab)
                : sortDef && sortDef.signed ? (item[sortField] > 0 ? "positive" : item[sortField] < 0 ? "negative" : "neutral") : "neutral";
            // 涨跌语义只标 up/down，红绿由 CSS 的 [data-asset] 作用域决定（A股 涨红跌绿）
            const valCls = colorClass === "positive" ? " val--up" : colorClass === "negative" ? " val--down" : "";
            const displayValue = sortDef ? sortDef.format(item) : config.format(item);
            // 值列数字左侧的成交额名次小标（volRankBadgeFor）；轴上没有 badge 或行上无名次字段时为空串
            const badge = sortDef && sortDef.badge ? sortDef.badge(item) : "";
            const checked = selectedSymbols.has(item.symbol) ? "checked" : "";

            const rankCell = rank == null ? `<span class="rank-num">—</span>`
                : rank <= 3
                ? `<span class="medal medal--${rank}">${rank}</span>`
                : `<span class="rank-num">${rank}</span>`;

            const barVal = Math.abs(item[barKey] ?? 0);
            const barW = Math.max(3, Math.round(barVal / maxAbs * 100));

            const subInfo = config.subFormat ? `<div class="sub${config.subClass ? " " + config.subClass : ""}">${config.subFormat(item, sortField)}</div>` : "";

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
                <div class="c-check" role="cell"><span class="row-accent"></span><input type="checkbox" class="chk symbol-check" data-symbol="${symSafe}" aria-label="选择 ${symSafe}" ${checked}></div>
                <div class="c-rank" role="cell">${rankCell}</div>
                <div class="c-sym" role="cell">
                    <a class="sym" href="${escapeHtml(tvUrl)}" target="_blank" rel="noopener noreferrer" title="在 TradingView 打开 ${symSafe} 图表">
                        <span class="sym__base">${symLabel}</span>
                        <span class="sym__tv">TV ↗</span>
                    </a>${subInfo}
                </div>
                <div class="c-val${badge ? " c-val--badged" : ""}" role="cell">
                    ${badge}<span class="val${valCls}">${displayValue}${sortDef && sortDef.noBar ? "" : `<span class="val__bar" style="width:${barW}%"></span>`}</span>
                </div>
            </div>`;
        })
        .join("") + gateHtml;
    if (gateCopy) bindLockGate(gateCopy.expired);

    if (foot) {
        // 表尾：橱窗未解锁说清「免费 1 行 + 其余上锁」（别只写「共 1 个」；解锁入口在行下面那张卡片上）· 搜索给「匹配 / 总数」· 截断提示 · 平常「共 N」
        // 量词随榜的语义走（与 renderBoardHead 同一判据）：策略榜「命中」、行情榜「共」
        const q = isStrategyTab(currentTab) ? "命中" : "共";
        if (teaserLocked) {
            // 排在搜索分支之前：这时 total 是被截成 1 行的数组长度，写成「匹配 1 / 命中 1 个」会与标题旁的命中数打架
            // 「其余榜单」只在多榜时成立；单榜布局下公开的就是整张榜 ⇒ 别暗示还有别的榜锁着。
            foot.textContent = teaserComplete ? (SINGLE_BOARD ? `共 ${total} 个标的，本期已全部公开` : `共 ${total} 个标的，其余榜单需通行证解锁`)
                : `免费预览第 1 名，${teaserRest != null ? `其余 ${teaserRest} 个标的` : "完整榜单"}需通行证解锁`;
        } else if (teaserPartial && !teaserComplete) {
            // 同样是被截成 1 行的橱窗榜，只是还在等 Worker 答复 / 付费整包还没到：别写成「共 1 个标的」
            foot.textContent = pending ? "正在验证通行证，完整榜单稍后自动出现" : "通行证有效，完整榜单正在加载，稍后自动出现";
        } else if (searchQuery) {
            foot.textContent = `匹配 ${items.length} / ${q} ${total} 个${capped ? ` · 仅渲染前 ${RENDER_CAP} 行` : ""}`;
        } else if (capped) {
            foot.textContent = `显示 ${RENDER_CAP} / ${q} ${total} 个 · 单榜最多渲染 ${RENDER_CAP} 行,其余可用搜索定位`;
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
    // 切到 A股 而那包还没拉（或已换新的一天）：立刻拉一次，别等 30 秒轮询（loadData 正在跑时这次跳过、下一轮补上）。
    if (currentAsset === "ashare" && PAYWALL_ENABLED && license.valid && data && data.ashareUpdateTime
        && data.ashareUpdateTime !== lastAsharePaidKey) loadData();
}

// 切资产（分段控件 / 胶囊）：回到该资产上次看的榜单
function switchAsset(assetK) {
    if (assetK === currentAsset) return;
    // 兜底（lastTabByAsset 缺项时）也要落在本资产自己的榜上：再加资产时逐个列映射、别写成二分。加密兜底 ＝ TEASER_TAB。
    const fallback = assetK === "ashare" ? ASHARE_HOME_TAB : "s01";
    switchTab(lastTabByAsset[assetK] || fallback);
}

// 收盘快照说明横幅：切到日更资产（A股）时显示，关一次永久不弹（localStorage，各资产独立 key）。
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
        // A股 每个交易日收盘后更新，阈值放宽到 30 小时（容忍节假日 / 偶发延迟）
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
    // 两个胶囊（加密 / A股）的 DOM 与这里的引用同增同删：任何一个取不到都会让整个胶囊渲染早退、另一个也永不更新。
    const elC = document.getElementById("freshCrypto");
    const elA = document.getElementById("freshAshare");
    if (!elC || !elA || !data) return;

    const tC = parseUpdateTime(data.updateTime);
    const ageC = tC ? (Date.now() - tC) / 60000 : Infinity;
    const clsC = ageC <= 75 ? "fresh--ok" : ageC <= 150 ? "fresh--warn" : "fresh--bad";
    const now = new Date();
    // 后端整点 :00 起跑（10-18 由 :02 提前，TG 要及时），数据通常整点后 1–2 分钟到 ⇒ 按「下个整点 + 2 分」倒数；整点后头两分钟（正在跑）写「刷新中…」。
    let nextMin = 62 - now.getUTCMinutes();
    if (nextMin > 60) nextMin -= 60;
    const nextTxt = ageC > 150 ? "" :
        nextMin <= 2 ? ' <span class="fresh__next">· 刷新中…</span>' :
        ` <span class="fresh__next">· 下次 ≈ ${nextMin} 分</span>`;
    document.getElementById("freshCryptoTxt").innerHTML = data.updateTime
        ? ` · <b>${data.updateTime.slice(11, 16)}</b>&nbsp;UTC${nextTxt}` : " · —";

    // --- A股胶囊（收盘日更；ashareDataDate 是 tushare 的 'YYYYMMDD'，无分隔符 ⇒ slice 4..6 / 6..8）---
    const tA = parseUpdateTime(data.ashareUpdateTime);
    let clsA = "fresh--bad";
    if (tA) {
        const ageA = (Date.now() - tA) / 60000;
        // 每天 07:05 UTC 触发、等 tushare 发布 → 25.5h 内新鲜，30h（与 check-freshness 同阈值）以上才红
        clsA = ageA <= 25.5 * 60 ? "fresh--ok" : ageA <= 30 * 60 ? "fresh--warn" : "fresh--bad";
    }
    const dd = data.ashareDataDate
        ? `<b>${data.ashareDataDate.slice(4, 6)}-${data.ashareDataDate.slice(6, 8)}</b> 收盘`
        : (tA ? `<b>${data.ashareUpdateTime.slice(11, 16)}</b> UTC` : "—");
    document.getElementById("freshAshareTxt").innerHTML = ` · ${dd} <span class="fresh__next">· 日更</span>`;

    // 移动端 CSS 只显示非 .is-dim 的胶囊 ⇒ 任何时候必须恰好有一个亮着（当前资产那个）。
    elC.className = `fresh ${clsC}${currentAsset === "crypto" ? "" : " is-dim"}`;
    elA.className = `fresh ${clsA}${currentAsset === "ashare" ? "" : " is-dim"}`;
}

// 加密策略榜数（脉搏「N 榜」用），从 TAB_GROUPS 算、不硬编码。
const CRYPTO_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "加密").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;
const ASHARE_STRATEGY_TABS = TAB_GROUPS.filter(g => g.asset === "A股").flatMap(g => g.tabs).filter(t => isStrategyTab(t.key)).length;

/** 某资产全部策略榜的命中总数。走 paidMeta（同 tabCount 口径）而不是数组长度：锁定态下多数 data[k] 是 undefined。 */
function strategyHits(asset) {
    if (!data || !data.paidMeta) return null;
    return Object.keys(data.paidMeta)
        .filter(k => isStrategyTab(k) && TAB_META[k] && TAB_META[k].asset === asset)
        .reduce((s, k) => s + (tabCount(k) || 0), 0);
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
// A股 价格（供 asharePriceCtx）：沪深报价精度 0.01 ⇒ 两位小数即完整。
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
    // 概览里直接印出来的值一律转义：付费包的同名 key 会盖过公开文件那份（loadData 的合并顺序），理由同 fmtVolVal。
    const e = escapeHtml;

    // 第一块自报「加密市场」+ 刷新时刻：概览条对所有资产可见，不写明会被当成当前资产的指标。
    if (data.updateTime) items.push(`<div class="mkt__item mkt__item--time" title="加密 USDT 永续合约全市场，每小时更新">
        <span class="mkt__k">加密市场</span>
        <span class="mkt__v"><b>${e(data.updateTime.slice(11, 16))}</b> UTC<span class="mkt__sub">每小时</span></span>
    </div>`);

    items.push(`<div class="mkt__item mkt__item--senti" title="市场情绪指数（0-100）：基于全市场涨跌宽度与平均涨跌幅自算，非第三方指数">
        <span class="mkt__k">市场情绪</span>
        <span class="mkt__senti">
            <span class="mkt__gauge"><i class="mkt__marker" style="left:${Math.max(0, Math.min(100, Number(s) || 0))}%"></i></span>
            <span class="mkt__score mkt-z--${zone}">${e(s)}<em>${e(mo.sentimentLabel)}</em></span>
        </span>
    </div>`);

    if (b.total) items.push(`<div class="mkt__item" title="全市场 24h 上涨/下跌合约家数（市场宽度）">
        <span class="mkt__k">涨跌家数</span>
        <span class="mkt__v"><span class="is-up">${e(b.up)}↑</span> <span class="is-down">${e(b.down)}↓</span><span class="mkt__sub">${e(b.upPct)}% 上涨</span></span>
    </div>`);

    items.push(`<div class="mkt__item" title="全市场加密 USDT 永续合约 24h 总成交额">
        <span class="mkt__k">24h 合约成交额</span>
        <span class="mkt__v">$${e(mo.totalVolumeFormatted)}</span>
    </div>`);

    if (mo.funding) items.push(`<div class="mkt__item" title="全市场平均资金费率 + 正费率占比（正=多头付费，反映杠杆持仓偏向）">
        <span class="mkt__k">资金费率</span>
        <span class="mkt__v">均 <span class="${mo.funding.avg >= 0 ? "is-up" : "is-down"}">${fmtMktPct(mo.funding.avg, 4)}</span><span class="mkt__sub">正 ${e(mo.funding.positivePct)}%</span></span>
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
// 门槛各卡各写、回放定（一空就空一整个月 ⇒ 周 / 月线卡的硬指标是回放不空卡）：日 / 周线「前 10 ≥3」；
//   月线 5 根轴（月涨跌幅 / 月线RSI / 月CVD强弱 / 月订单流 / 月+DI）「前 10 ≥2」：回放 48 个月（2022-10 → 2026-09、现存合约）每月中位 10.5 个、
//   最少 7、没空过，约一半的月份超过 10 个（卡上只列前 10）；「前 10 ≥3」会空 1 个月、「前 20 ≥3」中位 11。再删 / 加月线轴要重跑回放。
// 纯前端现算、不进后端产出：用的全是付费榜的行，锁定态没有这三张榜 ⇒ 整块隐藏，别拿公开文件去凑。
const RESO_ROWS = 10;
// 站长 10-19 恢复行情榜时定：共振卡先不恢复（门槛是按旧的跨周期轴集回放定的，周 / 月线这次各加了轴，要恢复先重新回放门槛）。
const RESO_ENABLED = false;
const RESO_CARDS = [
    { tab: "dailyChange", tf: "日", sorts: dailyChangeSorts, volKey: "volume", rankKey: "volumeRank",
      top: 10, min: 3, wide: true, period: "今天", refresh: "日线每天 00:00 UTC 换一批" },
    { tab: "weeklyChange", tf: "周", sorts: weeklyChangeSorts, volKey: "weeklyVolume", rankKey: "weeklyVolumeRank",
      top: 10, min: 3, wide: false, period: "本周", refresh: "周线每周一 00:00 UTC 换一批" },
    { tab: "monthlyChange", tf: "月", sorts: monthlyChangeSorts, volKey: "monthlyVolume", rankKey: "monthlyVolumeRank",
      top: 10, min: 2, wide: false, period: "本月", refresh: "月线每月 1 号 00:00 UTC 换一批" },
];

function resonanceBoard(card) {
    // 读的那张涨跌幅榜不在 TAB_GROUPS 里（2026-10-18 三张都已移除）⇒ 不出卡：付费包里残留的旧行（移榜上线、后端下一枪自愈之前）别再露出来。
    if (!TAB_META[card.tab]) return null;
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
    if (!RESO_ENABLED) { el.hidden = true; return; }
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
    // 榜在最上的版式：「策略命中 N 次 · N 榜」与标题旁 / rail 上的命中数重复、又会被挤到表格下面 ⇒ 收起（锁定态的购买入口在表格里的锁定卡片上；橱窗 0 命中那天没有锁定卡片 ⇒ 未解锁访客只能从顶栏 / 抽屉进购买，手机首屏没有入口 —— 在案代价，加不加归站长）。
    if (HERO_LAYOUT) { el.hidden = true; return; }
    const tiles = currentAsset === "ashare" ? asharePulseTiles() : cryptoPulseTiles();
    if (!tiles) { el.hidden = true; return; }
    el.innerHTML = tiles.join("");
    el.hidden = false;
}

// 脉搏只放「策略命中」一块：领涨这类磁贴要具体行数据，锁定态拿不到也不能伪造；命中数来自公开的 paidMeta。
function lockedPulseTile(asset, totalTabs) {
    const hits = strategyHits(asset);
    if (hits == null) return null;
    // 锁图标与「解锁查看」CTA 只在锁定态出（别对已付费用户喊去解锁；pending 同理）；命中数两态共用。
    const locked = PAYWALL_ENABLED && !license.valid && !licensePending();
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
    const top = keys.reduce((a, k) => ((tabCount(k) || 0) > (tabCount(a) || 0) ? k : a), keys[0]);
    return keys.length === 1
        ? `全部来自「${escapeHtml(TAB_META[top].name)}」`
        : `命中最多：${escapeHtml(TAB_META[top].name)} ${tabCount(top) || 0} 个`;
}

// ⚠️ 别为了凑满磁贴去 data[某个榜] 里取行：那是筛选结果不是全市场，写成「监控 N 个」会把命中数说成标的总数。
function cryptoPulseTiles() { return lockedPulseTile("加密", CRYPTO_STRATEGY_TABS); }
function asharePulseTiles() { return lockedPulseTile("A股", ASHARE_STRATEGY_TABS); }

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

// fetch 超时信号：连接挂起（对端黑洞、半开连接）时 fetch 自己不会失败 ⇒ loadData 一直停在 await 上、页面停在骨架屏，
// loadInFlight 还把之后的轮询全挡掉。超时按「整个请求含读完响应体」算；没有 AbortSignal.timeout 的旧浏览器不设（行为照旧）。
const timeoutSignal = ms => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

/** 拉付费数据（asset："crypto" ＝ 加密那包；"ashare" ＝ A股 那包 `?asset=ashare`），返回 {data, authFailed}。authFailed=true ＝ 确定性鉴权失败（401/402）：
 *  调用方据此推进 lastPaidUpdateTime，免得失效卡密的常开标签页每 30s 空打 Worker。 */
async function fetchPaidData(asset = "crypto") {
    if (!license.key) {
        license.valid = false;
        license.reason = "missing";
        return { data: null, authFailed: true };
    }
    // 发请求时的那把 key：await 期间卡密表单可能把 license.key 换成新输入的、验不过又换回原卡 ⇒ await 回来 key 已变就丢掉结果、
    // 不动 license（否则轮询那一路晚到的 402 会把刚换回来的原有效卡挂成「已失效」，直到下个整点）。
    const key = license.key;
    const stale = () => license.key !== key;
    try {
        const resp = await fetch(WORKER_API + "/api/data" + (asset === "ashare" ? "?asset=ashare" : ""), {
            headers: { "X-License-Key": normalizeKey(key) },
            signal: timeoutSignal(asset === "ashare" ? 90000 : 30000),   // A股 那包十几 MB
        });
        if (stale()) return { data: null, authFailed: false, stale: true };
        if (resp.ok) {
            license.valid = true;
            license.reason = null;
            license.expiresAt = resp.headers.get("X-License-Expires");
            license.plan = resp.headers.get("X-License-Plan"); // 供徽标「已解锁 · 季付」
            const body = await resp.json();
            return stale() ? { data: null, authFailed: false, stale: true } : { data: body, authFailed: false };
        }
        if (resp.status === 401 || resp.status === 402) {
            let reason = "not_found";
            try { reason = (await resp.json()).error || reason; } catch (e) { /* 忽略,用默认 reason */ }
            if (stale()) return { data: null, authFailed: false, stale: true };
            license.valid = false;
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
        const resp = await fetch(url, { cache: "no-cache", signal: timeoutSignal(20000) });
        const fresh = await resp.json();

        // 单调性守卫：强穿之后，普通请求可能从 CDN 边缘拿回上一小时的旧体 ⇒ 旧于手头的直接丢弃。
        // 每条管道的时间戳各查一个（A股 那对 10-19 复活）；增删管道时与下方 paidFetchKey、
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

        // 有卡密且加密的时间戳变了才打 Worker（否则 30s 轮询会打爆免费额度）；付费墙关闭时 fresh 已是全量、不打。
        // 只认加密的 updateTime：A股 那包 10-19 起单独拉、单独记（lastAsharePaidKey），A股 换批不该让加密那 1 MB 多再拉一遍（10-19 审计）。
        // ⚠️ 卡密表单里写 lastPaidUpdateTime 要与本键同构。
        const paidFetchKey = fresh.updateTime;
        if (PAYWALL_ENABLED && license.key && paidFetchKey !== lastPaidUpdateTime) {
            const paid = await fetchPaidData();
            // KV 的 updateTime 是上传时刻、公开文件的是 build 时刻（秒级字符串可能跨秒）⇒ 绝不能用严格相等；
            // 解析成时间后 >= 即采纳，早于免费数据的是 KV 边缘缓存回吐的旧付费体、拒收。
            const paidT = paid.data ? parseUpdateTime(paid.data.updateTime) : null;
            if (paid.data && paidT != null && (freshT == null || paidT >= freshT)) {
                paidData = paid.data;
                rememberTabMeta(paidData);
                lastPaidUpdateTime = paidFetchKey;
            } else if (paid.authFailed) {
                // 确定性鉴权失败：推进 lastPaidUpdateTime，本周期不再重试
                lastPaidUpdateTime = paidFetchKey;
            }
            // 其余（付费数据滞后、5xx、网络错误）不推进，下一轮继续追。
            // fetchPaidData 会改 license.valid / reason（自动解锁、挂机中过期吊销）⇒ 徽标必须在这里跟着刷新。
            renderLicenseStatus();
        }

        // A股 那包：只在看 A股 的榜时拉（十几 MB）、按 ashareUpdateTime 记。
        // 鉴权失败（401 / 402）不记键：fetchPaidData 已把 license.valid 置 false，上面的条件就挡住了空打；续费 / 换卡后 license 一变有效就接着拉
        //   （记了键的话要等 A股 下一次换批才再拉，A股 各榜一直停在「加载中」；10-19 审计）。
        // 没拉成（5xx / 断网 / 超时）或拉回来比公开文件旧（KV 边缘缓存回吐）：一包十几 MB，别每 30 秒重拉 ⇒ 退避（ashareRetryAt），拉成即复位。
        if (PAYWALL_ENABLED && license.key && license.valid && currentAsset === "ashare" && fresh.ashareUpdateTime
            && fresh.ashareUpdateTime !== lastAsharePaidKey && Date.now() >= ashareRetryAt) {
            const ap = await fetchPaidData("ashare");
            const apT = ap.data ? parseUpdateTime(ap.data.updateTime) : null;
            if (ap.data && apT != null && (freshAshareT == null || apT >= freshAshareT)) {
                asharePaidData = ap.data;
                lastAsharePaidKey = fresh.ashareUpdateTime;
                ashareFailStreak = 0;
                ashareRetryAt = 0;
            } else if (!ap.authFailed && !ap.stale) {
                ashareFailStreak = Math.min(ashareFailStreak + 1, 5);
                ashareRetryAt = Date.now() + 30000 * 2 ** ashareFailStreak;
            }
            renderLicenseStatus();
        }

        data = { ...fresh, ...(license.valid && paidData ? paidData : {}), ...(license.valid && asharePaidData ? asharePaidData : {}) };
        data.updateTime = fresh.updateTime; // 新鲜度基准恒以免费文件（30s 轮询）为准（两个付费包都带自己的上传时刻）

        renderUpdatePill();   // 倒计时每轮都要走
        renderStaleBanner();

        // 渲染键 ＝ 各管道时间戳（各自独立刷新，漏一个它的更新就不重渲染）+ A股 那包是否正在退避（换「没拉到」文案）
        // + paidData 到位时刻（付费数据晚一轮才拉到时免费时间戳没变）+ 卡密三态（挂机中失效要重新上锁；
        //   待验证 → 确定失效时 valid 一直是 false，只看它就不会重渲染、页面停在「正在验证」）。
        const renderKey = fresh.updateTime + "|" + fresh.ashareUpdateTime
            + "|" + (paidData ? paidData.updateTime : "") + "|" + (asharePaidData ? asharePaidData.updateTime : "")
            + "|" + (license.valid ? "1" : licensePending() ? "p" : "0") + "|" + (ashareFailStreak ? "f" : "");
        if (renderKey !== lastRenderKey) {
            renderPulse();
            renderNav();
            renderTable();
            // 渲染成功后才记键：先记的话，渲染中途抛一次错（某行字段类型不对）就整小时不再重试，屏上留着旧行、胶囊却显示新时刻
            lastRenderKey = renderKey;
        }
    } catch (e) {
        // 失败染当前资产的胶囊（移动端只显示非 dim 的那一个）；加资产时必须在这里给它映射胶囊 id，别落进兜底。
        const pillId = currentAsset === "ashare" ? "freshAshare" : "freshCrypto";
        const pill = document.getElementById(pillId);
        if (pill) {
            pill.className = "fresh fresh--bad";
            // 文案别加长：≤640px 顶栏余量只够这么宽（原来那句「数据加载失败，稍后自动重试」在 375 宽把整页撑出横向滚动）；轮询本来就会自动重试
            document.getElementById(pillId + "Txt").textContent = " · 加载失败";
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
    // 点 backdrop 关闭：必须按坐标判「落在对话框外」。dialog 自带 28px 内距，点到内距或子元素之间的缝，target 同样是
    // <dialog> 本身 ⇒ 只判 target 会在框内误关（购买弹窗里套餐卡与邮箱之间那道缝就中招）。按下时也得在框外：
    // 在输入框里拖选文字、松手落到框外不该关。键盘触发的 click 的 target 是按钮本身，走不到这里。
    document.querySelectorAll("dialog.modal").forEach(d => {
        const outside = e => {
            const r = d.getBoundingClientRect();
            return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let downOutside = false;
        d.addEventListener("mousedown", e => { downOutside = e.target === d && outside(e); });
        d.addEventListener("click", e => {
            if (e.target === d && downOutside && outside(e)) d.close();
            downOutside = false;
        });
    });
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
        } else if (licensePending()) {
            // 本机有卡、Worker 还没答复（刚开页 / 验证服务没连上）：中性样式，别先挂红色的「失效」
            badge.className = base + " lic-off";
            badge.textContent = "验证中…";
            if (btnEl) btnEl.textContent = "管理通行证";
        } else if (license.key) {
            badge.className = base + " lic-expired";
            badge.textContent = license.reason === "not_found" ? "通行证无效" : LOCK_REASON[license.reason] ? "通行证失效" : "未解锁";
            if (btnEl) btnEl.textContent = "输入通行证";
        } else {
            badge.className = base + " lic-off";
            badge.textContent = "未解锁";
            if (btnEl) btnEl.textContent = "输入通行证";
        }
        // 已解锁 / 待验证时按钮退成灰色次按钮（CSS .is-quiet）：黄色主按钮只留给要去输入 / 购买的人
        if (btnEl) btnEl.classList.toggle("is-quiet", !!license.valid || licensePending());
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
    // 预填的旧卡整段选中：续费后直接粘贴新卡就整段替换，别接在旧卡后面（normalizeKey 另有兜底）
    if (input && input.value) input.select();
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
        syncPlanButtons();
    });
    // 选中态同时写 class 与 aria-pressed（只有 class 时读屏器听不出选的是哪一档）
    const syncPlanButtons = () => document.querySelectorAll(".buy-plan").forEach(b => {
        const on = b.dataset.plan === selectedPlan;
        b.classList.toggle("is-selected", on);
        b.setAttribute("aria-pressed", String(on));
    });
    syncPlanButtons();

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
        // 先验后存：fetchPaidData 会就地改 license，留一份原状 —— 输错一位不该把本机原来那张有效卡冲掉（见下面失败分支）。
        const prev = { ...license };
        license.key = key;
        license.reason = null;
        if (msg) { msg.textContent = "校验中…"; msg.className = "lic-msg"; }
        const sbtn = document.querySelector("#licenseForm .btn-primary");
        if (sbtn) sbtn.disabled = true; // 校验期间禁用"解锁",防慢网并发重复提交(与 checkout 一致)
        lastPaidUpdateTime = null; // 强制这次不跳过，立即真实校验一次
        const result = await fetchPaidData();
        if (result.data) {
            if (sbtn) sbtn.disabled = false;
            safeStore.set("localStorage", LS_LICENSE, key);
            paidData = result.data;
            rememberTabMeta(paidData);
            // 合并后恢复免费文件的 updateTime：paidData 带的是 KV 上传时刻，留着会让下一轮单调性守卫把正常数据误判为回滚。
            const freeUpdateTime = data ? data.updateTime : null;
            data = { ...data, ...paidData };
            if (freeUpdateTime) data.updateTime = freeUpdateTime;
            // 公开数据还没到（没有 build 时刻可恢复）就删掉 KV 的上传时刻，理由同上。
            else delete data.updateTime;
            // 付费包比公开文件旧（整点刚过、KV 边缘缓存还在回吐上一小时的包）：照样先解锁，但别推进 lastPaidUpdateTime ——
            // 留 null 让下一轮轮询接着追新包（同 loadData 的单调性守卫）；推进了就会整小时停在旧包上、胶囊却显示新时刻。
            const paidT = parseUpdateTime(paidData.updateTime);
            const freeT = freeUpdateTime ? parseUpdateTime(freeUpdateTime) : null;
            const stalePaid = paidT == null || (freeT != null && paidT < freeT);
            // 与 loadData 的 paidFetchKey 同构（只认加密的 updateTime），改一处两处一起改。
            lastPaidUpdateTime = stalePaid ? null : data ? data.updateTime : null;
            ashareFailStreak = 0;
            ashareRetryAt = 0;
            renderLicenseStatus();
            if (msg) { msg.textContent = "解锁成功！"; msg.className = "lic-msg lic-ok"; }
            // 公开数据已在手就立即渲染；还没到时 data 只有付费部分、直接渲会瞬时空白 ⇒ 交给 loadData 合并后再渲。
            if (freeUpdateTime) { renderNav(); renderTable(); renderPulse(); if (currentAsset === "ashare") loadData(); }
            else loadData();
            setTimeout(() => document.getElementById("licenseDialog").close(), 700);
        } else {
            if (sbtn) sbtn.disabled = false;
            // reason：这把新 key 的失败原因；null ＝ 网络 / 5xx，没验出结果。
            const reason = license.reason;
            // 退回原状的三种情况：原来那张是有效的（新 key 不管为什么没过，都别动它）；原来那张还在待验证（Worker 抖动时它可能
            // 就是有效的 —— 别拿一串没验过 / 已失效的冲掉它）；新 key 查无此卡（多半是输错，存下来只会让页面一直挂着「通行证失效」）。
            // 其余 ＝ 原来没有卡或原卡已确定失效、且新 key 是过期 / 吊销（状态如实挂出来）或没验出结果（存下来让轮询接着验）⇒ 这时才落盘。
            const prevPending = !!prev.key && !prev.valid && !prev.reason;
            const keepPrev = prev.valid || prevPending || reason === "not_found";
            if (keepPrev) Object.assign(license, prev);
            else safeStore.set("localStorage", LS_LICENSE, key);
            renderLicenseStatus();
            if (data) { renderNav(); renderTable(); renderPulse(); }
            if (msg) {
                msg.textContent = LOCK_REASON[reason]
                    || (keepPrev ? "暂时连不上验证服务，请稍后再试（原通行证不受影响）" : "暂时连不上验证服务，通行证已记下，稍后自动重试");
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
                signal: timeoutSignal(30000),
            });
            const body = await resp.json().catch(() => null);
            if (resp.ok && body && body.payment_url) {
                location.href = body.payment_url;
                return; // 即将离开页面，不需要恢复按钮状态
            }
            // 按 Worker 回的 error 分开说：邮箱格式（Worker 要求域名里有点 —— `name@gmail` 浏览器放行、Worker 拒）/ 限流 / 其余
            const err = body && body.error;
            const text = err === "bad_email" ? "邮箱格式不对，请检查（比如是不是漏了 .com）"
                : err === "rate_limited" ? "操作太频繁，请过一分钟再试"
                : "创建订单失败，请稍后重试";
            if (msg) { msg.textContent = text; msg.className = "lic-msg lic-err"; }
        } catch (e) {
            if (msg) { msg.textContent = "网络错误，请稍后重试"; msg.className = "lic-msg lic-err"; }
        }
        btn.disabled = false;
        btn.textContent = "去支付";
    });
    // 从 OxaPay 收银台点浏览器「返回」、页面走 bfcache 原样恢复时，按钮还停在「跳转中…」且禁用 ⇒ 复位
    window.addEventListener("pageshow", e => {
        const btn = document.getElementById("checkoutSubmitBtn");
        if (e.persisted && btn) { btn.disabled = false; btn.textContent = "去支付"; }
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
    // 别在 click 之后同步撤销：部分浏览器（Safari / iOS）异步才开始读 blob，立刻 revoke 会让下载失败
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
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
        // 切资产不关抽屉（让用户接着选榜），选中具体榜才关。
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

// 抽屉体：资产分段控件 + 导航容器（renderNav 往 #drawerNav 填）。⚠️ 分段控件与 index.html rail 里那份同款结构，增删资产两处一起改。
document.getElementById("drawerBody").innerHTML = `
    <div class="asset-seg">
        <button class="asset-seg__opt is-active" data-k="crypto"><span class="asset-seg__dot"></span>加密</button>
        <button class="asset-seg__opt" data-k="ashare"><span class="asset-seg__dot"></span>A股</button>
    </div>
    <nav class="board-nav" id="drawerNav" style="margin-top:14px"></nav>`;

// === 亮/暗主题切换（token 覆盖,组件零分叉）。默认深色，本机存过 "light" 才是浅色（与 index.html 内联防闪脚本同一判据）===
const LS_THEME = "bishuju_theme";
// 主题钮图标显示「当前」主题：深色 ＝ 月亮、浅色 ＝ 太阳（常量串，不含外部数据）
const THEME_ICON = {
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
};
function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const btn = document.getElementById("themeBtn");
    if (btn) btn.innerHTML = THEME_ICON[t] || THEME_ICON.dark;
    // 切换时同步手机浏览器工具栏色（加载时由 index.html 内联脚本设）。
    // ⚠️ 两个 hex ＝ style.css 的 --header-bg；index.html 内联脚本与 manifest 各有一份硬编码，改品牌色一起改。
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = t === "light" ? "#ffffff" : "#181a20";
}
applyTheme(safeStore.get("localStorage", LS_THEME) === "light" ? "light" : "dark");
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

// 收盘快照横幅关闭（永久记忆，见 renderSnapshotBanner；只有 A股 用）
document.getElementById("snapshotBannerClose").addEventListener("click", () => {
    safeStore.set("localStorage", snapshotBannerDismissKey(), "1");
    document.getElementById("snapshotBanner").hidden = true;
});

// 新鲜度胶囊可点：切到对应资产（点当前资产是空操作）；若某资产复用别人的胶囊，要补显式空操作，否则会把用户切走。
document.getElementById("freshCrypto").addEventListener("click", () => switchAsset("crypto"));
document.getElementById("freshAshare").addEventListener("click", () => switchAsset("ashare"));
// 删某个胶囊时把它的监听一起删：胶囊 DOM 不在时 getElementById 是 null、这里一抛错，后面的监听全不绑定。

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
// 另判 TAB_META：TABS_CONFIG 里留着只给 A股 镜像用的加密 key（ASHARE_ONLY_TABS），上次停在并掉的榜上的回访者别切到一张不存在的榜。
if (savedTab && TABS_CONFIG[savedTab] && TAB_META[savedTab] && savedTab !== currentTab) switchTab(savedTab);
// ⚠️ 无条件把 .app 的 data-asset 同步到 currentAsset：index.html 写死了一个值，而上面那行不一定调 switchTab
// （无 savedTab 或它就是默认 tab）⇒ 默认资产与写死值不同时 CSS 作用域会错（A股 红绿颠倒）。别依赖 switchTab 的副作用。
const appEl = document.getElementById("app");
if (appEl) {
    appEl.dataset.asset = currentAsset;
    appEl.classList.toggle("is-hero", HERO_LAYOUT);
    appEl.classList.toggle("is-single", SINGLE_BOARD);   // index.html 静态写着当前该有的类，这里按两个常量校正
}
initFooterUI();
initPaywallUI();
renderNav();
renderSkeleton();
loadData();

// 每 30 秒轮询；后台标签页跳过（常开标签页的空轮询最费带宽 / 配额），回到前台立即补一轮。
setInterval(() => { if (!document.hidden) loadData(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
