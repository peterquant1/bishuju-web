// === 排序轴（2026-07-17 加 CVD强弱 第三轴 + 订单流；OI增仓 曾于 2026-07-19 加、07-20 移除；
// 2026-07-20 深夜给 A股/美股/ETF 加 量比/EMA间距 两进阶轴；2026-07-22 深夜给加密日线策略
// 行家族〔dailyEma921/weeklyStrategy〕加 参与度/距前高 两轴 + weeklyStrategy 周线强度轴）===
// 每个 tab 的每一行 payload 统一带 rsi / volume / volumeFormatted / cvdStrength 字段
// （加密行另带 takerStrength，A股/美股/ETF 行另带 volRatio/emaGap；加密日线策略行家族
// 另带 volRatio/emaGap/highDist，weeklyStrategy 再带 weeklyRsi），排序键稳定：
//   A股/美股/ETF 策略 tab 五轴 [RSI, 成交额, CVD强弱, 量比, EMA间距]、涨跌幅六轴 [涨幅, ...]；
//   加密 普通策略 tab 四轴（+订单流）、加密 涨跌幅五轴；加密日线策略行家族 七/八轴。
//   默认轴＝该 tab 本来的主指标排最前。
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

// 副行：显示当前排序轴**之外**的其余轴摘要（值列已展示当前轴，副行是快览、不承诺穷尽）。
// volLabel 区分 成交额/周成交额/月成交额；extra 是可选的价格/回顾上下文（涨跌幅/信号根等）。
// ⚠️ 轴摘要封顶 SUB_AXES_MAX 段（2026-07-22 深夜审美 PASS 修复）：桌面端 .sub 是
// white-space:normal，超过 ~5 段会折行、行高 60→76px 节奏破坏——etfChange 当天就已实测
// 60/76 混排（7 段），日线策略行家族扩到 7-8 轴后必然全员折行。被裁掉的轴不丢功能：
// 排序条 chip 一键切换后进值列展示。extra（价格上下文）永远保留、不占轴额度。
// 段落顺序即优先级——weeklyRsi 排在 cvdStrength 后（周线强度是 weeklyStrategy 的锚点
// 维度；只有该榜的行有这个 key，其他榜不受影响）。移动端 .sub 本就 nowrap 截断，不受此限。
const SUB_AXES_MAX = 4;
function axesSub(item, sf, volLabel, extra) {
    const seg = [];
    if (sf !== "rsi") seg.push(`强度 ${fmtRsiVal(item.rsi)}`);
    if (sf !== "volume") seg.push(`${volLabel} ${fmtVolVal(item)}`);
    if (sf !== "cvdStrength") seg.push(`资金强弱 ${fmtCvdVal(item.cvdStrength)}`);
    if ("weeklyRsi" in item && sf !== "weeklyRsi") seg.push(`周线强度 ${fmtRsiVal(item.weeklyRsi)}`);
    // 订单流（真实 taker 归边比）只有加密行有——A股 数据源无归边字段，行上没这个 key，
    // 数据驱动判断即可，无需 per-tab 配置。与 CVD强弱 背离时（阴线+订单流正=借跌吸筹）
    // 正是这轴的价值所在。
    if ("takerStrength" in item && sf !== "takerStrength") seg.push(`买卖失衡 ${fmtCvdVal(item.takerStrength)}`);
    // 量比/EMA间距：A股/美股/ETF 行 + 加密日线策略行家族（dailyEma921/weeklyStrategy）有，
    // 数据驱动判断。距前高 只有加密日线策略行家族有。
    if ("volRatio" in item && sf !== "volRatio") seg.push(`参与度 ${fmtRatioVal(item.volRatio)}`);
    if ("emaGap" in item && sf !== "emaGap") seg.push(`结构张开 ${fmtGapVal(item.emaGap)}`);
    if ("highDist" in item && sf !== "highDist") seg.push(`距前高 ${fmtGapVal(item.highDist)}`);
    // 振幅 只有免费行情榜（涨跌幅/成交额/振幅）的行有——策略榜行没这个 key，数据驱动跳过。
    if ("amplitude" in item && sf !== "amplitude") seg.push(`振幅 ${fmtAmpVal(item.amplitude)}`);
    const shown = seg.slice(0, SUB_AXES_MAX);
    if (extra) shown.push(extra);
    return shown.join(" | ");
}
// 周线 RSI tab 的动能上下文（rsiPrev→rsiCurr 箭头），并入副行
function momentumStr(v) {
    if (v.rsiPrev == null || v.rsiCurr == null) return "";
    const a = v.rsiCurr > v.rsiPrev ? "↑" : v.rsiCurr < v.rsiPrev ? "↓" : "→";
    return `动能 ${v.rsiPrev.toFixed(2)} → ${v.rsiCurr.toFixed(2)} ${a}`;
}
// 涨跌幅 tab 副行：排「涨幅」轴时展示价格上下文（原始开收/昨收→收），排其他轴时改展示
// 「涨幅 +X%」——涨幅是涨跌幅 tab 的核心数字，值列被别的轴占用时不能让它彻底消失。
function changeSub(v, sf, volLabel, priceCtx) {
    const tail = sf === "value" ? priceCtx : `涨幅 ${formatPercent(v.value)}`;
    return axesSub(v, sf, volLabel, tail);
}

// 共享 sort-item 定义（key = 行字段名，全 tab 统一）
// ⚠️ 2026-07-21 晚：**label 一并脱敏**。榜名/desc 已经不写指标了，但排序轴原来直接叫
// 「RSI」「CVD强弱」「订单流」「EMA间距」——配上榜名等于把用了哪些指标又漏回去
// （例：一个叫「趋势启动」的榜挂着「EMA间距」轴 = 明示它看均线间距）。改为行情语言，
// **key 不动**（key 是行字段名，动了要连累后端 payload 和 getSortedItems）。
const AXIS_RSI = { key: "rsi", label: "强度", format: v => fmtRsiVal(v.rsi) };
const AXIS_CVD = { key: "cvdStrength", label: "资金强弱", format: v => fmtCvdVal(v.cvdStrength) };
// **加密独有轴**：A股/美股 数据源没有主动买卖归边字段，物理上给不了，股票系 tab 不挂。
const AXIS_TAKER = { key: "takerStrength", label: "买卖失衡", format: v => fmtCvdVal(v.takerStrength) };
const axisVol = label => ({ key: "volume", label, format: v => fmtVolVal(v) });
const axisChg = label => ({ key: "value", label, format: v => formatPercent(v.value) });
// 参与度/结构张开度（2026-07-20 深夜加，A股/美股/ETF 独有轴——「参与度」补成交活跃
// 程度维度（「资金强弱」只量方向失衡），「结构张开」升序=结构刚成立的早期、降序=最
// 舒展的阶段）。crypto 管道未挂：后端未产出这两个字段（挂上要动周/月线缓存 schema，
// 站长没要求前不扩），crypto 行上没这两个 key。
const AXIS_VOLRATIO = { key: "volRatio", label: "参与度", format: v => fmtRatioVal(v.volRatio) };
const AXIS_EMAGAP = { key: "emaGap", label: "结构张开", format: v => fmtGapVal(v.emaGap) };
// 距前高/周线强度（2026-07-22 深夜加，加密日线策略行家族独有——dailyEma921/weeklyStrategy）：
// 距前高 = (收盘−近499日最高)/最高×100，恒 ≤0（0=正在创新高）——价格结构位置维度，
// 降序=贴近前高的强势（上方无套牢盘），升序=深水区早期反转（空间大但阻力多）。
// 周线强度 = 周线 RSI（仅 weeklyStrategy 行有，锚定大级别强弱；日线 RSI 看「谁启动最热」，
// 周线 RSI 看「谁的大趋势最强」，两个维度都要给交易员）。
const AXIS_HIGHDIST = { key: "highDist", label: "距前高", format: v => fmtGapVal(v.highDist) };
const AXIS_WRSI = { key: "weeklyRsi", label: "周线强度", format: v => fmtRsiVal(v.weeklyRsi) };
// A股/美股/ETF 五/六轴：主轴（RSI 或 成交额 或 涨幅）排最前，其余跟上
const sortsRsiFirst = volLabel => [AXIS_RSI, axisVol(volLabel), AXIS_CVD, AXIS_VOLRATIO, AXIS_EMAGAP];
const sortsVolFirst = volLabel => [axisVol(volLabel), AXIS_RSI, AXIS_CVD, AXIS_VOLRATIO, AXIS_EMAGAP];
const sortsChange = (chgLabel, volLabel) => [axisChg(chgLabel), AXIS_RSI, axisVol(volLabel), AXIS_CVD, AXIS_VOLRATIO, AXIS_EMAGAP];
// 加密变体：**独立定义、不再 spread 股票系 factory**（2026-07-20 起两族轴集分叉：股票系
// 有 量比/EMA间距 无 订单流，加密反之——spread 会让加密 tab 多出两个恒 null 轴）
const cryptoRsiFirst = volLabel => [AXIS_RSI, axisVol(volLabel), AXIS_CVD, AXIS_TAKER];
const cryptoVolFirst = volLabel => [axisVol(volLabel), AXIS_RSI, AXIS_CVD, AXIS_TAKER];
const cryptoChange = (chgLabel, volLabel) => [axisChg(chgLabel), AXIS_RSI, axisVol(volLabel), AXIS_CVD, AXIS_TAKER];

// 免费行情榜专用轴（2026-07-22 引流层）。振幅=非负幅度、资金费率=永续独有带符号费率。
const AXIS_AMPLITUDE = { key: "amplitude", label: "振幅", format: v => fmtAmpVal(v.amplitude) };
const AXIS_FUNDING = { key: "fundingRate", label: "资金费率", format: v => v.fundingRate == null ? "—" : formatPercent(v.fundingRate) };
// 成交额/振幅榜复用涨跌幅的富行（有 rsi/cvd/amplitude…），只换主轴顺序；资金费率榜行
// 只有 费率+成交额 两字段，轴集单独定义。股票系另带 参与度/结构张开（数据源有）。
const cryptoTurnoverSorts = [axisVol("成交额"), AXIS_AMPLITUDE, AXIS_RSI, AXIS_CVD, AXIS_TAKER];
const cryptoAmpSorts = [AXIS_AMPLITUDE, axisVol("成交额"), AXIS_RSI, AXIS_CVD, AXIS_TAKER];
const cryptoFundingSorts = [AXIS_FUNDING, axisVol("成交额")];
const stockTurnoverSorts = volLabel => [axisVol(volLabel), AXIS_AMPLITUDE, AXIS_RSI, AXIS_CVD, AXIS_VOLRATIO, AXIS_EMAGAP];
const stockAmpSorts = volLabel => [AXIS_AMPLITUDE, axisVol(volLabel), AXIS_RSI, AXIS_CVD, AXIS_VOLRATIO, AXIS_EMAGAP];

const TABS_CONFIG = {
    // === 加密 涨跌幅（五轴：涨幅 / RSI / 成交额 / CVD强弱 / 订单流）===
    yesterdayChange: { sorts: cryptoChange("涨幅", "成交额"), subFormat: (v, sf) => changeSub(v, sf, "成交额", `${v.open} → ${v.close}`) },
    weeklyChange: { sorts: cryptoChange("周涨幅", "周成交额"), subFormat: (v, sf) => changeSub(v, sf, "周成交额", `${v.open} → ${v.close}`) },
    monthlyChange: { sorts: cryptoChange("月涨幅", "月成交额"), subFormat: (v, sf) => changeSub(v, sf, "月成交额", `${v.open} → ${v.close}`) },

    // === 加密 免费行情榜（引流）：成交额（日/周/月）/ 振幅 / 资金费率 ===
    turnover: { sorts: cryptoTurnoverSorts, subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    // 周/月成交额榜复用周/月涨跌幅行（无 amplitude），排序轴不含振幅，走 cryptoVolFirst
    weeklyTurnover: { sorts: cryptoVolFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额", v.value != null ? `周涨幅 ${formatPercent(v.value)}` : null) },
    monthlyTurnover: { sorts: cryptoVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.value != null ? `月涨幅 ${formatPercent(v.value)}` : null) },
    amplitude: { sorts: cryptoAmpSorts, subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    // 资金费率榜行字段稀疏（只有 费率+成交额），不走 axesSub（会硬显 强度/资金强弱 的 N/A）
    fundingRate: { sorts: cryptoFundingSorts, subFormat: (v, sf) => sf === "fundingRate" ? `成交额 ${fmtVolVal(v)}` : `资金费率 ${formatPercent(v.fundingRate)}` },

    // === A股/美股/ETF 免费行情榜（引流）：成交额 / 振幅（复用各自涨跌幅的富行切片；
    // 股票系无资金费率——无永续合约）。TABS_CONFIG 是平查找表，与 TAB_GROUPS 分离，
    // 故这 6 条手写；stockGroups 工厂只管导航，不管这里。===
    ashareTurnover: { sorts: stockTurnoverSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    ashareWeeklyTurnover: { sorts: sortsVolFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额", v.value != null ? `周涨幅 ${formatPercent(v.value)}` : null) },
    ashareMonthlyTurnover: { sorts: sortsVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.value != null ? `月涨幅 ${formatPercent(v.value)}` : null) },
    ashareAmplitude: { sorts: stockAmpSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    usTurnover: { sorts: stockTurnoverSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    usWeeklyTurnover: { sorts: sortsVolFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额", v.value != null ? `周涨幅 ${formatPercent(v.value)}` : null) },
    usMonthlyTurnover: { sorts: sortsVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.value != null ? `月涨幅 ${formatPercent(v.value)}` : null) },
    usAmplitude: { sorts: stockAmpSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    etfTurnover: { sorts: stockTurnoverSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    etfWeeklyTurnover: { sorts: sortsVolFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额", v.value != null ? `周涨幅 ${formatPercent(v.value)}` : null) },
    etfMonthlyTurnover: { sorts: sortsVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.value != null ? `月涨幅 ${formatPercent(v.value)}` : null) },
    etfAmplitude: { sorts: stockAmpSorts("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },

    // === 加密 月线策略（四轴：成交额 / RSI / CVD强弱 / 订单流，默认按成交额——月线 RSI 对新合约常缺）===
    // （monthlySarBreakoutPrev「SAR翻多突破·上根」已于 2026-07-20 移除,后端字段保留,复活看 git）
    monthlySarBreakout: { sorts: cryptoVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.changePercent != null ? `月涨幅 ${formatPercent(v.changePercent)}` : null) },
    monthlyFourBull: { sorts: cryptoVolFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.changePercent != null ? `月涨幅 ${formatPercent(v.changePercent)}` : null) },

    // === 加密 周线策略 weeklyStrategy「周线趋势 × 日线启动」（2026-07-22 深夜站长定版，
    // 取代 weeklyEma921 母集；weeklyRsi 周线强度池 同日早些时候已移除）===
    // 逻辑：周线 SAR 多头（硬过滤）∩ 日线策略 dailyEma921 命中集。行 payload 全部日线
    // 数值（入场扫描视角，镜像 A股 月×日共振先例）+ weeklyRsi（周线强度轴）。
    // 八轴 = 加密基础四轴 + 参与度/结构张开/距前高 + 周线强度（key 固定，调条件不改 key）。
    weeklyStrategy: { sorts: [...cryptoRsiFirst("成交额"), AXIS_VOLRATIO, AXIS_EMAGAP, AXIS_HIGHDIST, AXIS_WRSI], subFormat: (v, sf) => axesSub(v, sf, "成交额") },

    // === 加密 日线策略（七轴：基础四轴 + 参与度/结构张开/距前高，2026-07-22 深夜扩充）===
    // 行本就带 ema9/ema21（emaGap build 层现算），volRatio/highDist 由 get_daily_indicators
    // 随行产出，全部零额外抓取；周/月榜不挂——那要动缓存 schema。故不改共享的
    // cryptoRsiFirst（基础四轴工厂保持通用，行上没这些字段的榜用它不会多出恒 null 轴），
    // 而是就地追加，只影响日线策略行家族（本榜 + 上方 weeklyStrategy）。
    dailyEma921: { sorts: [...cryptoRsiFirst("成交额"), AXIS_VOLRATIO, AXIS_EMAGAP, AXIS_HIGHDIST], subFormat: (v, sf) => axesSub(v, sf, "成交额") },

    // === A股（2026-07-20 晚站长定版「纯多周期 EMA 矩阵」：涨跌幅 3 + 日线四线扩张 +
    // 周线三线扩张 + 月线两线扩张·SAR多头 = 6 tab；其余策略 tab 已移除，后端为保留组）===
    // 涨跌幅为交易所口径（相对昨收，含跳空）；v.preClose ?? v.open 容忍部署切换窗口内前后端错开
    ashareChange: { sorts: sortsChange("涨幅", "成交额"), subFormat: (v, sf) => changeSub(v, sf, "成交额", `昨收 ${v.preClose ?? v.open} → ${v.close}`) },
    ashareWeeklyChange: { sorts: sortsChange("周涨幅", "周成交额"), subFormat: (v, sf) => changeSub(v, sf, "周成交额", `上周收 ${v.preClose} → ${v.close}`) },
    ashareMonthlyChange: { sorts: sortsChange("月涨幅", "月成交额"), subFormat: (v, sf) => changeSub(v, sf, "月成交额", `上月收 ${v.preClose} → ${v.close}`) },
    ashareDailyTripleEmaCvd: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    ashareDailyFourEma: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    ashareWeeklyEma921: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    ashareWeeklyTripleEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    ashareWeeklyFourEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    ashareMonthlyStrategy: { sorts: sortsRsiFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.changePercent != null ? `月涨幅 ${formatPercent(v.changePercent)}` : null) },
    // 月线×日线共振两档:行 payload 是日线数值(RSI/成交额/量比/间距均日线口径,入场扫描视角)
    ashareMonthlyDailyTriple: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    ashareMonthlyDailyFour: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },

    // === 美股 日线策略（跟 crypto/A股 共用同一套指标/表格组件，见 fetch_us.py）===
    // 三轴 sorts 用跟 A股 同一组 factory（sortsRsiFirst/sortsVolFirst/sortsChange，无订单流
    // 末轴）——Massive 分组日线跟 tushare 日线一样没有 taker 买卖归边字段，是数据源硬边界，
    // 不是遗漏，误用 cryptoRsiFirst 等带订单流的 factory 会导致排序条多出一个恒 null 的轴。
    // 涨跌幅副行用 v.preClose（不像 ashareChange 需要 ?? v.open 兼容旧字段——美股是全新
    // 管道没有历史包袱）。
    usChange: { sorts: sortsChange("涨幅", "成交额"), subFormat: (v, sf) => changeSub(v, sf, "成交额", `昨收 ${v.preClose} → ${v.close}`) },
    usWeeklyChange: { sorts: sortsChange("周涨幅", "周成交额"), subFormat: (v, sf) => changeSub(v, sf, "周成交额", `上周收 ${v.preClose} → ${v.close}`) },
    usMonthlyChange: { sorts: sortsChange("月涨幅", "月成交额"), subFormat: (v, sf) => changeSub(v, sf, "月成交额", `上月收 ${v.preClose} → ${v.close}`) },
    usDailyTripleEmaCvd: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    usDailyFourEma: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    usWeeklyEma921: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    usWeeklyTripleEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    usWeeklyFourEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    usMonthlyStrategy: { sorts: sortsRsiFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.changePercent != null ? `月涨幅 ${formatPercent(v.changePercent)}` : null) },
    usMonthlyDailyTriple: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    usMonthlyDailyFour: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },

    // === ETF·大类资产（2026-07-20 加：黄金/白银/原油/指数/国别等 ~42 个精选主流 ETF，
    // 清单见 fetch_us.py US_ETF_UNIVERSE）。与美股同一条管道同一次运行产出（共用
    // usUpdateTime），tab 结构/factory 与美股 21 tab 完全镜像，只是标的池换成精选 ETF、
    // name 是中文标注（"GLD 黄金"）。同样无订单流轴（同一数据源边界）。===
    etfChange: { sorts: sortsChange("涨幅", "成交额"), subFormat: (v, sf) => changeSub(v, sf, "成交额", `昨收 ${v.preClose} → ${v.close}`) },
    etfWeeklyChange: { sorts: sortsChange("周涨幅", "周成交额"), subFormat: (v, sf) => changeSub(v, sf, "周成交额", `上周收 ${v.preClose} → ${v.close}`) },
    etfMonthlyChange: { sorts: sortsChange("月涨幅", "月成交额"), subFormat: (v, sf) => changeSub(v, sf, "月成交额", `上月收 ${v.preClose} → ${v.close}`) },
    etfDailyTripleEmaCvd: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    etfDailyFourEma: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    etfWeeklyEma921: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    etfWeeklyTripleEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    etfWeeklyFourEma: { sorts: sortsRsiFirst("周成交额"), subFormat: (v, sf) => axesSub(v, sf, "周成交额") },
    etfMonthlyStrategy: { sorts: sortsRsiFirst("月成交额"), subFormat: (v, sf) => axesSub(v, sf, "月成交额", v.changePercent != null ? `月涨幅 ${formatPercent(v.changePercent)}` : null) },
    etfMonthlyDailyTriple: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
    etfMonthlyDailyFour: { sorts: sortsRsiFirst("成交额"), subFormat: (v, sf) => axesSub(v, sf, "成交额") },
};

// 分组导航。每组带 asset（资产类别）、tf（周期）：驱动组标签、chip 上的周期角标、
// 以及表格上方的「资产 · 周期 · 策略」标识栏——让用户任何时候都能一眼看出当前榜单
// 是加密还是 A股、日线周线还是月线（2026-07-16 用户反馈"分不清周期"后加）。
// tf 放在组上（组内所有 tab 同周期）；涨跌幅组是例外（横跨日/周/月），tf 放在 tab 上。
// full = 标识栏用的完整名（涨跌幅组的 chip 名是"昨天/周线/月线"=周期本身，标识栏里
// 周期已由 tf 角标表达，名字统一显示"涨跌幅"不重复）。data-tab key 不变。

/** A股/美股/ETF 三个资产的四组导航生成器（它们结构与口径完全一致，见下方调用处注释）。
 *  assetCN = "A股"/"美股"/"ETF"（也是 TAB_GROUPS.asset 的值）；
 *  p = tab key 前缀（"ashare"/"us"/"etf"）；
 *  changeDescs = 涨跌幅三榜的说明（当日/周线/月线），只有这三条按资产不同。 */
const stockGroups = (assetCN, p, changeDescs) => [
    {
        // 行情组＝免费引流层（2026-07-22 站长定：通用行情开放引流，策略筛选付费）。
        // 涨跌幅 3（全量）+ 成交额榜 + 振幅榜（各 TOP200）；股票系无资金费率（无永续）。
        label: `${assetCN}行情`, asset: assetCN,
        tabs: [
            { key: `${p}Change`, name: "当日", tf: "日线", full: "涨跌幅", desc: changeDescs[0] },
            { key: `${p}WeeklyChange`, name: "周线", tf: "周线", full: "涨跌幅", desc: changeDescs[1] },
            { key: `${p}MonthlyChange`, name: "月线", tf: "月线", full: "涨跌幅", desc: changeDescs[2] },
            { key: `${p}Turnover`, name: "成交额", tf: "日线", full: "成交额榜", desc: "最新交易日成交额最大的标的（最活跃 TOP200）" },
            { key: `${p}WeeklyTurnover`, name: "周成交额", tf: "周线", full: "成交额榜", desc: "最新已收盘周 K 成交额最大的标的（TOP200）" },
            { key: `${p}MonthlyTurnover`, name: "月成交额", tf: "月线", full: "成交额榜", desc: "最新已收盘月 K 成交额最大的标的（TOP200）" },
            { key: `${p}Amplitude`, name: "振幅", tf: "日线", full: "振幅榜", desc: "最新交易日振幅（日内高低波动幅度）最大的标的（TOP200）" },
        ],
    },
    {
        // 宽→严（后者 ⊆ 前者）
        label: `${assetCN}日线策略`, asset: assetCN, tf: "日线",
        tabs: [
            { key: `${p}DailyTripleEmaCvd`, name: "主升结构 · 资金",
              desc: "中短期结构完整成型、多周期同向，且资金正在持续流入的标的。" },
            { key: `${p}DailyFourEma`, name: "主升结构 · 资金强化",
              desc: "在上一榜基础上追加长周期确认，更严格，命中通常明显更少。" },
        ],
    },
    {
        // 宽→严（子集链）
        label: `${assetCN}周线策略`, asset: assetCN, tf: "周线",
        tabs: [
            { key: `${p}WeeklyEma921`, name: "周线趋势 · 确认",
              desc: "周线级别结构转强，并通过方向与资金双重确认。级别比日线大、持续性更强。" },
            { key: `${p}WeeklyTripleEma`, name: "周线主升 · 确认",
              desc: "周线结构完整成型并通过双重确认，比上一榜严格。" },
            { key: `${p}WeeklyFourEma`, name: "周线主升 · 强化确认",
              desc: "在上一榜基础上追加长周期确认，本组最严格的一档。" },
        ],
    },
    {
        // key 固定 MonthlyStrategy 不再随条件改名（历史上改过四次 key，见 CLAUDE.md）。
        // 共振两档 = 月线命中 ∩ 日线两档（母集→子集排列）
        label: `${assetCN}月线策略`, asset: assetCN, tf: "月线",
        tabs: [
            { key: `${p}MonthlyStrategy`, name: "月线趋势",
              desc: "月线级别结构转强的标的——级别最大、信号最少，是下面两个共振榜的母集。" },
            { key: `${p}MonthlyDailyTriple`, name: "月线趋势 × 日线主升",
              desc: "大级别定方向、小级别定时机：月线级别已转强，同时日线级别结构成型且资金流入。表格显示的是日线数值。" },
            { key: `${p}MonthlyDailyFour`, name: "月线趋势 × 日线主升强化",
              desc: "同上，但日线一侧换成更严格的那一档。" },
        ],
    },
];

const TAB_GROUPS = [
    // ⚠️⚠️ 2026-07-21 晚二次重命名：**筛选规则从此不对外公开**（站长要求"把所有 TAB 的
    // 真实逻辑隐藏起来并重新取名"）。站点当晚已改为付费制——**筛选规则本身就是商品**，
    // 白纸黑字写在页面上等于免费送。
    //
    // **本次规矩，与同日早些时候那版正好相反，改名前务必读完**：
    //   ① **名字和 desc 只描述"这个榜在找什么样的行情"，绝不描述怎么算出来的。**
    //   ② **禁用词**（name 和 desc 里一律不许出现）：EMA / RSI / SAR / CVD / 均线 /
    //      两线·三线·四线 / 扩张 / 连阳 / 间距 / 金叉，以及任何参数数字（9/21/55/200/50…）。
    //   ③ **仍然要能让站长自己分得清哪个是哪个**——他每天在用。所以保留「宽→严」的
    //      语义梯度（母集叫「趋势启动」，加严的叫「趋势启动 · X」），只是梯度用行情
    //      语言表达，不用条件个数表达。
    //
    // **同日早些时候那版规矩（"名字必须写全筛选条件"）已作废**，别照着它把名字改回去：
    // 那是站点还全站免费时定的，当时目标是"规则一个字都不能丢"；现在目标正相反。
    // 历史版本要考古见 git（PR #121）。
    //
    // ⚠️ **内部 key 一律不动**（`dailyEma921` 等）：改 key 会连累三条抓取管道 + 公开
    // JSON + 缓存 schema，且 key 本身已在公开 JSON 的 paidMeta 里暴露——那是另一个
    // 层面的问题，见 CLAUDE.md「残留暴露面」，不在改名范围内解决。
    // `desc` 渲染在表格上方（renderBoardHead），现在讲的是"这榜干什么用"，不是"怎么算"。
    {
        // 行情组＝免费引流层（2026-07-22）：涨跌幅 3（全量）+ 成交额/振幅（TOP200）+
        // 资金费率（永续独有）。都是通用公开行情，不泄露任何策略逻辑，整榜免费。
        label: "行情", asset: "加密",
        tabs: [
            { key: "yesterdayChange", name: "昨天", tf: "日线", full: "涨跌幅",
              desc: "最新一根已收盘日 K 的涨跌幅；全部 USDT 永续合约，无任何筛选" },
            { key: "weeklyChange", name: "周线", tf: "周线", full: "涨跌幅",
              desc: "最新一根已收盘周 K 的涨跌幅；全部 USDT 永续合约，无任何筛选" },
            { key: "monthlyChange", name: "月线", tf: "月线", full: "涨跌幅",
              desc: "最新一根已收盘月 K 的涨跌幅；全部 USDT 永续合约，无任何筛选" },
            { key: "turnover", name: "成交额", tf: "日线", full: "成交额榜",
              desc: "最新交易日成交额最大的标的（最活跃 TOP200）；全部 USDT 永续合约" },
            { key: "weeklyTurnover", name: "周成交额", tf: "周线", full: "成交额榜",
              desc: "最新已收盘周 K 成交额最大的标的（TOP200）；全部 USDT 永续合约" },
            { key: "monthlyTurnover", name: "月成交额", tf: "月线", full: "成交额榜",
              desc: "最新已收盘月 K 成交额最大的标的（TOP200）；全部 USDT 永续合约" },
            { key: "amplitude", name: "振幅", tf: "日线", full: "振幅榜",
              desc: "最新交易日振幅（日内高低波动幅度）最大的标的（TOP200）" },
            { key: "fundingRate", name: "资金费率", tf: "日线", full: "资金费率榜",
              desc: "当前资金费率排序：正值多头付费、负值空头付费，反映永续市场多空情绪" },
        ],
    },
    {
        // 2026-07-22 站长把日线策略收敛成单一母集：短期结构刚转强、上行趋势初步成立；
        // 同日又要求资金必须同步跟上（CVD走强）才入榜。曾短暂加过"周线大级别趋势也要
        // 同向"的跨周期门槛，当天晚些时候站长要求撤销（见 fetch_data.py daily_ema921
        // 注释）——desc 里"多周期共振"那句是那层门槛的措辞，跟着一起去掉，别再写回去。
        label: "日线策略", asset: "加密", tf: "日线",
        tabs: [
            { key: "dailyEma921", name: "趋势启动",
              desc: "短期结构刚刚转强、资金同步流入——早期趋势启动信号。" },
        ],
    },
    {
        label: "周线策略", asset: "加密", tf: "周线",
        tabs: [
            { key: "weeklyStrategy", name: "周线趋势 × 日线启动",
              desc: "周线大级别方向已确认向上，且日线端刚出现启动信号——顺大势、做小势的入场扫描视角。" },
        ],
    },
    {
        label: "月线策略", asset: "加密", tf: "月线",
        tabs: [
            { key: "monthlySarBreakout", name: "月线拐点突破",
              desc: "月线级别方向发生反转、且价格已确认突破的标的——级别最大、信号最少。" },
            { key: "monthlyFourBull", name: "月线加速",
              desc: "月线级别连续推进的标的；纯价格行为判断，不带结构条件。" },
        ],
    },
    // A股（2026-07-16 补齐周期矩阵、2026-07-20 补齐月线策略组，与上面 crypto 四组一一
    // 对应：涨跌幅 / 日线策略 / 周线策略 / 月线策略，同站同订阅解锁）。周线/月线策略名
    // 逐字对齐 crypto 对应组。（crypto 曾有 12H策略组，2026-07-22 移除，四资产现均为此四组。）
    // === A股 / 美股 / ETF ===
    // 这三个资产的四组结构、筛选口径、显示名**完全相同**（2026-07-20 晚站长定版
    // 「纯多周期 EMA 矩阵」，A股/美股/ETF 同步；其余策略后端为保留组）。
    // 2026-07-21 重命名时改成由 stockGroups() 工厂生成，不再三份手写——这个项目吃过
    // 多次"三处该同步的地方漏改一处"的亏（排序轴 factory 选错、tab 计数不一致…），
    // 生成式让它们**结构上不可能漂移**。只有涨跌幅三榜的 desc 按资产不同（停牌/
    // 上市首日/标的范围各有各的说明），用 changeDescs 参数注入。
    // 各资产独有的差异（前缀、成交额单位、TV 代码格式、涨红跌绿）都不在这里，
    // 分别由后端 build_* 和 CSS 的 [data-asset] 处理。
    ...stockGroups("A股", "ashare", [
        "最新交易日涨跌幅（交易所口径，相对昨收、含跳空，涨停必显 +10.0%）；全部沪深 A 股，已剔除当日停牌",
        "最新已收盘周 K：本周收盘价 vs 上周收盘价（含周一跳空）",
        "最新已收盘月 K：本月收盘价 vs 上月收盘价",
    ]),
    ...stockGroups("美股", "us", [
        "最新交易日涨跌幅（相对上一交易日收盘）；上市首日的标的只有一根收盘价、算不出涨跌幅，不入榜",
        "最新已收盘周 K：本周收盘价 vs 上周收盘价",
        "最新已收盘月 K：本月收盘价 vs 上月收盘价",
    ]),
    ...stockGroups("ETF", "etf", [
        "最新交易日涨跌幅（相对上一交易日收盘）；范围是约 42 个精选大类资产 ETF（黄金/白银/原油/指数/债券/国别/行业/加密现货）",
        "最新已收盘周 K：本周收盘价 vs 上周收盘价",
        "最新已收盘月 K：本月收盘价 vs 上月收盘价",
    ]),
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
// 免费橱窗留 TEASER_TAB（日线策略母集「趋势启动」）里 RSI 最高的 1 行，其余全部榜
// 锁定后 data[tab] 是 undefined（公开 JSON 根本不含这个 key）——不是"给个空数组"那种锁法。
// 总开关：必须跟后端 fetch_data.py 的 PAYWALL_ENABLED 保持一致，留作紧急回滚
// 开关（两处一起改回 false，不用逐处回退 diff）。
const PAYWALL_ENABLED = true;
const WORKER_API = "https://bishuju-api.fanshenpan.workers.dev";
// ⚠️ 必须与后端 fetch_data.py 的 TEASER_TAB 一致。2026-07-22 从 dailyCvd 改指母集
// dailyEma921（日线策略收敛成单一母集后 dailyCvd 已移除）。
const TEASER_TAB = "dailyEma921";
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
let currentTab = "yesterdayChange";
let sortAsc = false; // false=降序, true=升序
let sortField = "value"; // 当前排序字段；默认 value，带 sorts 的 tab 可切 RSI/成交额
let searchQuery = ""; // 表格搜索（代码/名称子串），切 tab 时清空
let lastBustAt = 0; // 上次带 cache-buster 强拉的时间（限流用，见 loadData）
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
const CHANGE_PCT_TABS = new Set(["yesterdayChange", "weeklyChange", "monthlyChange", "ashareChange", "ashareWeeklyChange", "ashareMonthlyChange", "usChange", "usWeeklyChange", "usMonthlyChange", "etfChange", "etfWeeklyChange", "etfMonthlyChange"]);

// 免费引流层（2026-07-22 站长定：通用行情开放引流，策略筛选付费）。整榜免费的通用
// 行情榜：涨跌幅 + 成交额 + 振幅 + 资金费率。**必须跟后端 fetch_data.py 的同名
// FREE_TABS 一致**——后端据此把这些榜整榜写进公开文件，前端据此判断"不锁"；漏一处
// 会让已免费的榜被前端当付费锁上、或后端没写进公开文件导致空榜。CHANGE_PCT_TABS
// ⊂ FREE_TABS（涨跌幅走红绿，成交额/振幅/资金费率走中性色——是量级/带符号数不是涨跌方向）。
const FREE_TABS = new Set([
    ...CHANGE_PCT_TABS,
    "turnover", "weeklyTurnover", "monthlyTurnover", "amplitude", "fundingRate",
    "ashareTurnover", "ashareWeeklyTurnover", "ashareMonthlyTurnover", "ashareAmplitude",
    "usTurnover", "usWeeklyTurnover", "usMonthlyTurnover", "usAmplitude",
    "etfTurnover", "etfWeeklyTurnover", "etfMonthlyTurnover", "etfAmplitude",
]);
// 策略榜 = 非免费榜（有筛选条件，"0 命中"是正常信号而非故障，值是 RSI/成交额等指标）。
// 空状态文案、脉搏策略计数、导航命中徽标都据此——免费行情榜不参与这些语义。
const isStrategyTab = tab => !FREE_TABS.has(tab);

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

// A股 symbol 形如 "600000.SH"/"000001.SZ"：6 位数字 + 点 + 交易所后缀，精确正则匹配。
// **不能再用"带不带点"当判据**（2026-07-20 接入美股时修：美股有些 ticker 本身带点，
// 如 BRK.B / BF.B 这类 class share 后缀，若仍用 symbol.includes(".") 会把它们误判成
// A股 代码，导致 symbolDisplayParts/tvSymbolFor 按 A股 逻辑错误拆分）。
function isAshareSymbol(symbol) {
    return /^\d{6}\.(SH|SZ)$/.test(symbol);
}

function isCryptoSymbol(symbol) {
    return symbol.endsWith("USDT");
}

function isAshareTab(tab) {
    return tab.startsWith("ashare");
}

function isUsTab(tab) {
    return tab.startsWith("us");
}

// ETF tab（"etf" 前缀不会撞 "us"/"ashare"）。数据与美股同管道产出，新鲜度共用
// usUpdateTime——所有"按时间戳分流"的地方（staleBanner/pill）把 etf 归到美股一侧。
function isEtfTab(tab) {
    return tab.startsWith("etf");
}

// TradingView 符号：A股 "600000.SH"/"000001.SZ" -> "SSE:600000"/"SZSE:000001"；
// crypto "BTCUSDT" -> "BINANCE:BTCUSDT.P"（永续合约后缀）；美股裸 ticker（如 "AAPL"）
// 原样返回不加交易所前缀——后端（Massive 分组日线）没有把 primary_exchange 带进
// 每行 payload，而 TV 的 symbol 搜索对美股裸 ticker 足够智能、能自动解析到正确交易所
// （不像 A股/加密那样交易所前缀是消歧义必需的），故不为此单独多传一个字段。
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

// 表格里符号列的展示拆分：主代码 + 后缀（A股用交易所后缀，crypto 用计价币种，美股用
// 裸 ticker 无后缀——item.name 存在时 renderTable 优先显示公司名，suffix 派不上用场，
// 但仍返回空串保持函数签名一致，防御 name 缺失的边缘情况）。
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
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
// 左栏 rail：顶部 加密/A股 分段控件 + 当前资产的分组榜单（加密/A股/美股/ETF 均 4 组：
// 涨跌幅/日线/周线/月线——组数由 TAB_GROUPS 决定，别写死；crypto 曾有 12H策略组，
// 2026-07-22 移除），「资产·周期·策略」同屏全见、一键直达；rail 激活态随资产变色
// （--asset-accent）。移动端 rail 隐藏，同一份导航渲染进抽屉（#drawerBody）。
const TF_SHORT = { "日线": "日", "周线": "周", "月线": "月" };
const ASSET_KEY = { "加密": "crypto", "A股": "ashare", "美股": "us", "ETF": "etf" };   // TAB_GROUPS.asset → data-asset
const ASSET_CN = { crypto: "加密", ashare: "A股", us: "美股", etf: "ETF" };            // data-asset → TAB_GROUPS.asset
let currentAsset = "crypto";                                // 当前资产（由 tab 派生/资产切换驱动）
const lastTabByAsset = { crypto: "yesterdayChange", ashare: "ashareChange", us: "usChange", etf: "etfChange" }; // 各资产记住上次看的榜

function assetOfTab(tab) {
    const m = TAB_META[tab];
    return m ? ASSET_KEY[m.asset] : "crypto";
}

// rail 组标签统一显示"周期/涨跌幅"（资产已由分段控件表达,组名不再重复"A股"/"美股"/"ETF"前缀）
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
        const uni = currentAsset === "ashare" ? `${tabCount("ashareChange") || 0} 只 A 股`
            : currentAsset === "us" ? `${tabCount("usChange") || 0} 只美股`
            : currentAsset === "etf" ? `${tabCount("etfChange") || 0} 只大类资产 ETF`
            : `${tabCount("yesterdayChange") || 0} 个合约`;
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
    const hit = n != null ? `命中 ${n} 个标的` : "";
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
                aria-pressed="${act}" title="${act ? "再点一次切换升/降序" : `按${s.label}排序`}">${s.label}${act ? `<span class="sort-chip__arrow">${arrow}</span>` : ""}</button>`;
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
        // 修正：此前只判 A股、美股落进 else 显示加密的「合约/整点后重算」——误导更新预期）
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
                : "购买通行证，解锁本站全部策略榜的完整名单与多轴排序";
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
            if (foot) foot.hidden = true; // 命中数已在橱窗卡片里说清,页脚不再重复
            return;
        }
        let ico, title, desc;
        if (locked && license.valid) {
            const n = tabCount(currentTab);
            ico = "⏳";
            title = n != null ? `已找到 ${n} 个标的，解锁数据加载中…` : "解锁数据加载中…";
            desc = "通行证有效，付费数据暂时拉取失败<br>30 秒内自动重试，无需任何操作";
        } else if (searchQuery) {
            ico = "🔍";
            // escapeHtml：searchQuery 是唯一进 innerHTML 的用户输入，必须转义（自 XSS）
            title = `没有匹配「${escapeHtml(searchQuery)}」的标的`;
            desc = "试试换个代码或名称关键词";
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
        return;
    }

    // 渲染上限：ashareChange 全市场 5000+ 行，一次性 innerHTML 在中低端机型是数百毫秒
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
            const { base: symBase, suffix: symSuffix } = symbolDisplayParts(item.symbol);
            // A股行带 name（股票名），比 "/ SH" 后缀对用户有用得多；crypto 行维持 "/ USDT"。
            // name 来自数据管道,进 innerHTML 前防御性转义(审计 P2-8)
            const symLabel = item.name
                ? `${symBase} <span class="sym__suffix">${escapeHtml(item.name)}</span>`
                : `${symBase} <span class="sym__suffix">/ ${symSuffix}</span>`;
            return `<div class="tr" role="row">
                <div class="c-check" role="cell"><span class="row-accent"></span><input type="checkbox" class="chk chk--row symbol-check" data-symbol="${item.symbol}" aria-label="选择 ${item.symbol}" ${checked}></div>
                <div class="c-rank" role="cell">${rankCell}</div>
                <div class="c-sym" role="cell">
                    <a class="sym" href="${tvUrl}" target="_blank" rel="noopener noreferrer" title="在 TradingView 打开 ${item.symbol} 图表">
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
        if (searchQuery) {
            foot.textContent = `匹配 ${items.length} / 命中 ${total} 个${capped ? ` · 仅渲染前 ${RENDER_CAP} 行` : ""}`;
        } else if (capped) {
            foot.textContent = `显示 ${RENDER_CAP} / 命中 ${total} 个 · 单榜最多渲染 ${RENDER_CAP} 行,其余可用搜索定位`;
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
    renderAshareBanner();
}

// 切资产（rail/drawer 顶部分段控件）：回到该资产上次看的榜单
function switchAsset(assetK) {
    if (assetK === currentAsset) return;
    // 兜底四分：lastTabByAsset 全量初始化后正常不可达，但兜底若被触发（未来改坏），
    // 二分写法会把「美股」/「ETF」误跳去加密榜（2026-07-20 审计补的防御）
    const fallback = assetK === "ashare" ? "ashareChange" : assetK === "us" ? "usChange"
        : assetK === "etf" ? "etfChange" : "yesterdayChange";
    switchTab(lastTabByAsset[assetK] || fallback);
}

// 收盘快照说明横幅：切到 A股/美股 显示,关闭一次永久不再弹（localStorage——"这个资产是
// 收盘快照不是盘中实时"是常识型说明,看过一次就够）。DOM 元素/函数名仍叫 ashareBanner
// （2026-07-20 接入美股时复用同一个元素扩展覆盖两个资产,没有重命名——见下方
// SNAPSHOT_BANNER_TEXT 动态换文案;两个资产各自独立的 dismiss key,互不影响）。
const SNAPSHOT_BANNER_TEXT = {
    ashare: "A股 数据为每个交易日收盘后更新的快照，不是盘中实时行情。",
    us: "美股 数据为每个交易日收盘后更新的快照，不是盘中实时行情。",
    etf: "ETF 数据为每个美股交易日收盘后更新的快照，不是盘中实时行情。",
};
function ashareBannerDismissKey() {
    return currentAsset === "us" ? "bsj_us_banner_dismissed"
        : currentAsset === "etf" ? "bsj_etf_banner_dismissed"
        : "bsj_ashare_banner_dismissed";
}
function renderAshareBanner() {
    const el = document.getElementById("ashareBanner");
    if (!el) return;
    const applicable = currentAsset === "ashare" || currentAsset === "us" || currentAsset === "etf";
    if (applicable) {
        const textEl = el.querySelector("[data-banner-text]");
        if (textEl) textEl.textContent = SNAPSHOT_BANNER_TEXT[currentAsset];
    }
    const dismissed = applicable && safeStore.get("localStorage", ashareBannerDismissKey()) === "1";
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
    const t = parseUpdateTime(data.updateTime);
    // 数据每小时更新；超过 2.5 小时没动就亮横幅
    el.hidden = !(t && Date.now() - t > 2.5 * 3600 * 1000);
}

/** 顶栏双新鲜度胶囊（Claude Design 重设计）：加密（小时级倒计时）+ A股（收盘日更）并置，
 *  当前资产侧高亮、另一侧 .is-dim；移动端 CSS 只显示激活侧。
 *  A股 显示 ashareDataDate（数据实际对应的交易日）——任务跑了但 tushare 迟发布时
 *  它会落后于更新时间，显示出来用户能看出"今天的数据其实还是昨天的"。 */
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

    // --- A股胶囊 ---
    const tA = parseUpdateTime(data.ashareUpdateTime);
    let clsA = "fresh--bad";
    if (tA) {
        const ageA = (Date.now() - tA) / 60000;
        // 每天 08:30 UTC 更新 → 25.5h 内新鲜,30h(与 check-freshness 同阈值)以上才红
        clsA = ageA <= 25.5 * 60 ? "fresh--ok" : ageA <= 30 * 60 ? "fresh--warn" : "fresh--bad";
    }
    const dd = data.ashareDataDate
        ? `<b>${data.ashareDataDate.slice(4, 6)}-${data.ashareDataDate.slice(6, 8)}</b> 收盘`
        : (tA ? `<b>${data.ashareUpdateTime.slice(11, 16)}</b> UTC` : "—");
    document.getElementById("freshAshareTxt").innerHTML = ` · ${dd} <span class="fresh__next">· 日更</span>`;

    // --- 美股胶囊（机制同 A股 胶囊，日更阈值一致；usDataDate 是 'YYYY-MM-DD' ISO 格式，
    // 不是 A股 tushare 那种 'YYYYMMDD'，slice 位置不同）---
    const tU = parseUpdateTime(data.usUpdateTime);
    let clsU = "fresh--bad";
    if (tU) {
        const ageU = (Date.now() - tU) / 60000;
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

// 价格/百分比格式化（市场概览用）：大额无小数带千分位、小额留精度
function fmtMktPrice(p) {
    if (p == null) return "—";
    if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
    if (p >= 1) return "$" + p.toFixed(2);
    if (p >= 0.01) return "$" + p.toFixed(4);
    return "$" + Number(p).toPrecision(2);
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

/** 市场概览全局条（免费引流,crypto 独有）：全市场 24h 内生指标 + 合约情绪,数据来自
 *  data.marketOverview（后端 get_market_overview 从币安全市场 24h 行情 + 资金费率自算）。
 *  仅加密视图显示（这是永续合约市场数据）,其余资产隐藏。参考 CMC/CoinGecko 顶部全局条,
 *  但指标为合约市场定制（涨跌宽度/资金费率持仓/合约总成交额）。 */
function renderMarketOverview() {
    const el = document.getElementById("marketOverview");
    if (!el) return;
    const mo = data && data.marketOverview;
    if (currentAsset !== "crypto" || !mo) { el.hidden = true; return; }

    const b = mo.breadth || {};
    const s = mo.sentiment;
    const zone = s < 25 ? "fear2" : s < 45 ? "fear" : s < 55 ? "neutral" : s < 75 ? "greed" : "greed2";
    const items = [];

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

    items.push(`<div class="mkt__item" title="全市场 USDT 永续合约 24h 总成交额">
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
        : currentAsset === "us" ? usPulseTiles()
        : currentAsset === "etf" ? etfPulseTiles()
        : cryptoPulseTiles();
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
    return [pulseTile("策略命中" + " " + LOCK_SVG, `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${totalTabs} 榜</span>`, "解锁查看完整榜单与领涨标的")];
}

function cryptoPulseTiles() {
    const yc = data.yesterdayChange || [];
    if (!yc.length) return lockedPulseTile("加密", CRYPTO_STRATEGY_TABS);
    const topD = yc.reduce((a, b) => (b.value > a.value ? b : a), yc[0]);
    const wc = data.weeklyChange || [];
    const topW = wc.length ? wc.reduce((a, b) => (b.value > a.value ? b : a), wc[0]) : null;
    const hits = strategyHits("加密");
    return [
        pulseTile("监控合约", `${yc.length}<span class="pulse__suffix is-muted">个</span>`, "币安 USDT 永续全量"),
        pulseTile("昨日领涨", `${stripUSDT(topD.symbol)}<span class="pulse__suffix ${topD.value >= 0 ? "is-up" : "is-down"}">${topD.value >= 0 ? "+" : ""}${topD.value.toFixed(1)}%</span>`, "日 K 收盘涨跌幅第一"),
        topW ? pulseTile("周线领涨", `${stripUSDT(topW.symbol)}<span class="pulse__suffix ${topW.value >= 0 ? "is-up" : "is-down"}">${topW.value >= 0 ? "+" : ""}${topW.value.toFixed(1)}%</span>`, "最新已收盘周 K") : "",
        hits != null ? pulseTile("策略命中", `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${CRYPTO_STRATEGY_TABS} 榜</span>`, "加密策略筛选当前命中") : "",
    ].filter(Boolean);
}

function asharePulseTiles() {
    const ac = data.ashareChange || [];
    if (!ac.length) return lockedPulseTile("A股", ASHARE_STRATEGY_TABS);
    const top = ac.reduce((a, b) => (b.value > a.value ? b : a), ac[0]);
    const up = ac.filter(x => x.value > 0).length;
    const down = ac.filter(x => x.value < 0).length;
    const hits = strategyHits("A股");
    const topLabel = escapeHtml(top.name || top.symbol);
    return [
        pulseTile("监控标的", `${ac.length}<span class="pulse__suffix is-muted">只</span>`, "沪深 A 股全市场"),
        pulseTile("今日领涨", `${topLabel}<span class="pulse__suffix ${top.value >= 0 ? "is-up" : "is-down"}">${top.value >= 0 ? "+" : ""}${top.value.toFixed(1)}%</span>`, "当日涨幅第一"),
        pulseTile("红盘家数", `<span class="is-up">${up}</span><span class="pulse__suffix is-muted">涨 · ${down} 跌</span>`, "全市场今日涨跌家数"),
        hits != null ? pulseTile("策略命中", `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${ASHARE_STRATEGY_TABS} 榜</span>`, "A股策略筛选当前命中") : "",
    ].filter(Boolean);
}

// 美股涨跌语义走 crypto 那套（绿涨红跌，不像 A股 翻转）——is-up/is-down 是语义类名，
// 实际颜色由 [data-asset] 作用域的 CSS 变量决定，这里不用关心具体色值。
function usPulseTiles() {
    const uc = data.usChange || [];
    if (!uc.length) return lockedPulseTile("美股", US_STRATEGY_TABS);
    const top = uc.reduce((a, b) => (b.value > a.value ? b : a), uc[0]);
    const up = uc.filter(x => x.value > 0).length;
    const down = uc.filter(x => x.value < 0).length;
    const hits = strategyHits("美股");
    // 主文本用 ticker 而非公司全名：美股 name 中位 29 字符、75.8% 超过 20 字符（Nasdaq
    // 全称如 "... Class A Ordinary Shares"），塞进 nowrap+ellipsis 的 .pulse__value 会把
    // 排在名字后面的涨幅 suffix 整个裁掉（2026-07-21 审计实测 685px 内容宽 vs 232px 单元
    // 格）。ticker 短且是美股用户认的主标识，全名降级进 .pulse__sub（自带 ellipsis）。
    const topLabel = escapeHtml(top.symbol);
    return [
        pulseTile("监控标的", `${uc.length}<span class="pulse__suffix is-muted">只</span>`, "美股全市场普通股"),
        pulseTile("今日领涨", `${topLabel}<span class="pulse__suffix ${top.value >= 0 ? "is-up" : "is-down"}">${top.value >= 0 ? "+" : ""}${top.value.toFixed(1)}%</span>`, escapeHtml(top.name || "当日涨幅第一")),
        // 「上涨家数」不用 A股 版的「红盘家数」：红盘=A股红涨语境，美股作用域涨显绿色，
        // 沿用会出现"红盘"标签配绿色数字的自相矛盾（2026-07-20 审计修正）
        pulseTile("上涨家数", `<span class="is-up">${up}</span><span class="pulse__suffix is-muted">涨 · ${down} 跌</span>`, "全市场今日涨跌家数"),
        hits != null ? pulseTile("策略命中", `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${US_STRATEGY_TABS} 榜</span>`, "美股策略筛选当前命中") : "",
    ].filter(Boolean);
}

// ETF·大类资产：标的是精选清单（~42 只），"上涨家数"对固定小样本意义有限，
// 换成「涨/跌分布」照常显示；name 是中文标注（"黄金"/"纳指100"），领涨直接显示它。
function etfPulseTiles() {
    const ec = data.etfChange || [];
    if (!ec.length) return lockedPulseTile("ETF", ETF_STRATEGY_TABS);
    const top = ec.reduce((a, b) => (b.value > a.value ? b : a), ec[0]);
    const up = ec.filter(x => x.value > 0).length;
    const down = ec.filter(x => x.value < 0).length;
    const hits = strategyHits("ETF");
    const topLabel = escapeHtml(top.name || top.symbol);
    return [
        pulseTile("监控标的", `${ec.length}<span class="pulse__suffix is-muted">只</span>`, "精选大类资产 ETF"),
        pulseTile("今日领涨", `${topLabel}<span class="pulse__suffix ${top.value >= 0 ? "is-up" : "is-down"}">${top.value >= 0 ? "+" : ""}${top.value.toFixed(1)}%</span>`, "当日涨幅第一"),
        pulseTile("涨跌分布", `<span class="is-up">${up}</span><span class="pulse__suffix is-muted">涨 · ${down} 跌</span>`, "大类资产今日涨跌分布"),
        hits != null ? pulseTile("策略命中", `<span class="is-gold">${hits}</span><span class="pulse__suffix is-muted">次 · ${ETF_STRATEGY_TABS} 榜</span>`, "ETF策略筛选当前命中") : "",
    ].filter(Boolean);
}

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

async function loadData() {
    try {
        // 带宽策略（rankings.json 已 ~5.5MB / gzip ~1MB，绝不能每 30s 全量拉）：
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
        if (due && Date.now() - lastBustAt > 150000) {
            url += "?" + Date.now();
            lastBustAt = Date.now();
        }
        const resp = await fetch(url, { cache: "no-cache" });
        const fresh = await resp.json();

        // 单调性守卫：busted 请求直穿源站拿到新数据后，下一次普通轮询可能从 CDN 边缘
        // 缓存拿回**上一小时的旧体**（max-age=600 内边缘不回源）。无条件采信会出现
        // 新旧数据每小时来回翻转 + 反复触发 due→全量强拉。旧于手头的数据直接丢弃。
        // crypto/A股/美股 三条管道独立写各自的时间戳，缺一个检查就会被另一个放过——
        // 只查 updateTime 会让 ashareUpdateTime/usUpdateTime 被回滚（A股/美股 每天只
        // 更新一次，回滚後要等下一次 crypto 整点刷新 updateTime 才会被下面的 render-key
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
        if (rolledBack) {
            renderUpdatePill();   // 倒计时照常走（用手头数据）
            renderStaleBanner();
            return;
        }

        // 免费橱窗和付费全量来自同一批管道，所以只在任一资产的时间戳变化时才打
        // Worker，否则每 30s 轮询会把 CF 免费额度打爆。触发键用三时间戳组合（与下方
        // renderKey 同款）：A股/美股 各自收盘后只刷新自己的时间戳，只盯 crypto 的
        // updateTime 会让它们写进 KV 的新付费数据最多晚 ~1 小时（等下一个 crypto 整点）
        // 才被拉取。付费墙关闭时 fresh 本身已是全量，完全不打 Worker。
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
        // 用户在 A股/美股 视图下失败完全不可见(2026-07-20 审计修正)。当前资产的胶囊
        // 本就无 is-dim,其余两个保持原样(各自的 dim 状态由 renderUpdatePill 管理)。
        // ETF 没有第四胶囊,与 renderUpdatePill 同款归并到美股胶囊(2026-07-21 审计补漏:
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
            // 与 loadData 的 paidFetchKey 同款组合串语义（三时间戳）
            lastPaidUpdateTime = data ? (data.updateTime + "|" + data.ashareUpdateTime + "|" + data.usUpdateTime) : null;
            renderLicenseStatus();
            if (msg) { msg.textContent = "解锁成功！"; msg.className = "lic-msg lic-ok"; }
            renderNav();
            renderTable();
            renderPulse();
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
        <button class="asset-seg__opt" data-k="us"><span class="asset-seg__dot"></span>美股</button>
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
    // ⚠️ 两个 hex 必须跟 style.css 的 --bg1(暗/亮)保持一致(2026-07-22 视觉系统 v4
    // 改配色时这里是第三份独立硬编码的拷贝,当时只同步了 index.html 和 manifest 两处,
    // 漏了这里——审计发现每次切换主题/每次刷新页面都会把 index.html 刚设对的值又
    // 覆盖回旧金色时代的 #07090d/#f3f5f9，三处以后要一起改）
    const meta = document.getElementById("themeColorMeta");
    if (meta) meta.content = t === "light" ? "#ffffff" : "#0d1117";
}
applyTheme(safeStore.get("localStorage", LS_THEME) === "light" ? "light" : "dark");
document.getElementById("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    safeStore.set("localStorage", LS_THEME, next);
    applyTheme(next);
});

// 收盘快照横幅关闭（永久,按当前资产分别记忆,见 renderAshareBanner）
document.getElementById("ashareBannerClose").addEventListener("click", () => {
    safeStore.set("localStorage", ashareBannerDismissKey(), "1");
    document.getElementById("ashareBanner").hidden = true;
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
initFooterUI();
initPaywallUI();
renderNav();
renderSkeleton();
loadData();

// Auto refresh every 30s。后台标签页跳过轮询（回到前台立即补一轮）——
// 交易员常年挂着几十个标签页，后台空轮询是带宽/配额的最大浪费源。
setInterval(() => { if (!document.hidden) loadData(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
