(() => {
    'use strict';
    const F = window.FireCalculator, P = window.FirePlan;
    if (F?.API_VERSION !== 1 || !P) {
        document.getElementById('app').innerHTML = '<section class="panel result-panel" role="alert"><h1>页面需要更新</h1><p>计算脚本未完整加载或版本不一致。刷新会清空当前填写内容，请先记录已填参数。</p><button type="button" class="button" id="reload-page">重新加载页面</button></section>';
        document.getElementById('guideToggle').hidden = true;
        document.getElementById('reload-page').addEventListener('click', () => window.location.reload());
        return;
    }
    const state = P.defaults();
    let view = 'main', current = 'intro', fieldErrors = {}, result = null, resultParams = null, dirty = false, returnToReview = false;
    const app = document.getElementById('app');
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const scrollBehavior = () => reducedMotion() ? 'instant' : 'smooth';
    function animateElement(element, frames, duration = 220) {
        if (!element?.animate) return;
        // Repeated actions cancel previous movement instead of queuing it.
        element.getAnimations?.().forEach(animation => animation.cancel());
        element.animate(reducedMotion() ? [{ opacity: .85 }, { opacity: 1 }] : frames,
            { duration: reducedMotion() ? 80 : duration, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
    function navigationMotion(direction = 1) {
        animateElement(app.querySelector('.guide-card'), [
            { opacity: .65, transform: `translateX(${direction * 14}px)` },
            { opacity: 1, transform: 'translateX(0)' }
        ]);
    }
    function icons() {
        const arrow = direction => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction === 'left' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}"/></svg>`;
        document.querySelectorAll('button').forEach(button => {
            for (const child of [...button.childNodes]) {
                if (child.nodeType === 3 && /[→←↗]/.test(child.textContent)) {
                    const left = child.textContent.includes('←');
                    child.textContent = child.textContent.replace(/[→←↗]/g, '').trim();
                    button.insertAdjacentHTML(left ? 'afterbegin' : 'beforeend', arrow(left ? 'left' : 'right'));
                } else if (child.nodeType === 1 && child.getAttribute('aria-hidden') === 'true' && /[→←↗]/.test(child.textContent)) {
                    child.outerHTML = arrow(child.textContent.includes('←') ? 'left' : 'right');
                }
            }
        });
        const empty = app.querySelector('.empty-symbol');
        if (empty) empty.innerHTML = '<svg class="icon" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6v28h30M10 27l8-6 6 2 10-14m-7 0h7v7"/></svg>';
    }

    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = value => Number.isFinite(Number(value)) && value !== '' ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '待填写';
    const percent = value => Number.isFinite(Number(value)) && value !== '' ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 }) : '待填写';
    const short = value => Math.abs(value) >= 1e8 ? `${money(value / 1e8)} 亿` : Math.abs(value) >= 1e4 ? `${money(value / 1e4)} 万` : money(value);
    const error = key => `<p class="field-error" id="error-${key}" ${fieldErrors[key] ? '' : 'hidden'}>${escape(fieldErrors[key] || '')}</p>`;
    const info = (title, text) => `<details><summary>${title}</summary><div class="disclosure-body">${text}</div></details>`;
    const dynamic = (id, className = 'hint') => `<div id="${id}" class="${className}"></div>`;
    function input(key, label, unit, { help = '', min = 0, max = 1e12, step = 'any', period = '' } = {}) {
        return `<div class="field"><label for="${key}">${label}</label><div class="input-wrap"><input id="${key}" name="${key}" data-key="${key}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${escape(state[key])}" aria-invalid="${!!fieldErrors[key]}" aria-describedby="error-${key}${help ? ` help-${key}` : ''}">${period ? `<select data-key="${period}" aria-label="${label}周期"><option value="month" ${state[period] === 'month' ? 'selected' : ''}>元／月</option><option value="year" ${state[period] === 'year' ? 'selected' : ''}>元／年</option></select>` : `<span>${unit}</span>`}</div>${help ? `<p class="field-help" id="help-${key}">${help}</p>` : ''}${error(key)}</div>`;
    }
    function choices(key, options) {
        return `<div class="choices" role="group">${options.map(([value, title, desc]) => `<label class="choice"><input type="radio" name="${key}" data-key="${key}" value="${value}" ${String(state[key]) === String(value) ? 'checked' : ''}><span><strong>${title}</strong>${desc ? `<small>${desc}</small>` : ''}</span></label>`).join('')}</div>${error(key)}`;
    }
    const check = (key, label) => `<label class="check"><input type="checkbox" data-key="${key}" id="${key}" ${state[key] ? 'checked' : ''}>${label}</label>`;
    const titles = {
        purpose: '你想计算什么？', start: '从哪一年开始计算？', asset: '开始时，你有多少资金可以投入？',
        expense: '达到财务自由后，你希望花多少钱生活？', saving: '你能为这个计划存下多少钱？', target: '你希望在哪一年达到目标？',
        house: '准备什么时候买房，预算是多少？', loan: '这笔贷款准备怎么安排？', inflation: '预计物价每年上涨多少？',
        growth: '以后每年存入的钱要增加吗？', return: '预计投资平均每年获得多少收益？', withdrawal: '用多大的资产规模支撑生活开支？'
    };
    const sources = {
        lpr: 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125440/3876551/2026092008384254324/index.html',
        provident: 'https://www.zzz.gov.cn/html/ywzn/dkyw1/18947.html'
    };
    function fields(step) {
        switch (step) {
            case 'purpose': return choices('mode', [['year', '多久能达到目标', '根据我能存下的钱，估算达成时间。'], ['saving', '需要存多少钱', '根据目标年份，估算需要存入的金额。']]);
            case 'start': return input('startYear', '计划起始年份', '年', { min: 1900, max: 9999, step: 1, help: '从所选年份的年初开始计算。' });
            case 'asset': return input('startAsset', '起始资金', '元', { help: '填写准备投入这个计划的资金总额。' });
            case 'expense': return input('expense', '生活支出', '', { min: 0.01, period: 'expenseUnit', help: '按起始年份的物价估计。' });
            case 'saving': return input('saving', '新增储蓄', '', { period: 'savingUnit', help: '填写扣除生活费后、支付本计划首付和房贷前的结余。启用购房计划后，系统会自动扣除首付和还款，请勿提前扣减。投资收益另行计算。' }) + dynamic('saving-hint');
            case 'target': return input('targetYear', 'FIRE 目标年份', '年', { min: P.number(state.startYear) + 1, max: Math.min(9999, P.number(state.startYear) + 100), step: 1 }) + dynamic('target-hint');
            case 'house': return check('house', '计入未来购房计划') + (state.house ? `<div class="conditional"><div class="two-col">${input('purchaseYear', '购房年份', '年', { min: P.number(state.startYear), max: 9999, step: 1 })}${input('housePrice', '房屋总价', '元', { min: 0.01 })}</div>${check('fullCash', '全款购买')}${!state.fullCash ? input('downPaymentRate', '首付比例', '%', { max: 100 }) : ''}${dynamic('house-estimate', 'estimate')}<p class="note">购房按所选年份的 1 月计算。房屋市值不计入可投资资产。</p>${dynamic('house-warning', 'warning')}</div>` : '<p class="hint">启用后，从计划资金中扣除首付和还款。</p>');
            case 'loan': return `<div class="two-col">${input('mortgageYears', state.separateYears && state.provident ? '商贷还款期限' : '还款期限', '年', { min: 1, max: state.provident && !state.separateYears ? 30 : 50, step: 1 })}${input('mortgageRate', '商贷年利率', '%', { max: 20 })}</div><p class="note">商贷默认参考 <a href="${sources.lpr}" target="_blank" rel="noopener">2026 年 9 月的 5 年期以上 LPR 3.50%</a>。实际按银行报价修改，不含财政贴息。</p>${check('provident', '使用公积金贷款')}${state.provident ? `<div class="conditional"><span class="field-label">住房套数</span>${choices('homeType', [['first', '首套住房'], ['second', '二套住房']])}${input('providentAmount', '公积金贷款金额', '元', { min: 0.01, max: P.loanTotal(state) })}<button type="button" class="text-button" data-action="all-provident">全部使用公积金</button><p class="note">金额须在当地批准的可贷额度内，剩余部分自动使用商贷。</p>${dynamic('provident-summary')}<details><summary>公积金利率与更多设置</summary>${input('providentRate', '公积金年利率', '%', { max: 20 })}<button type="button" class="text-button" data-action="auto-provident">恢复按套数和期限确定利率</button>${check('separateYears', '分别设置还款期限')}${state.separateYears ? input('providentYears', '公积金还款期限', '年', { min: 1, max: 30, step: 1 }) : ''}<p>根据<a href="${sources.provident}" target="_blank" rel="noopener">公积金贷款利率表（2025 年 5 月 8 日执行）</a>填入，支持手动修改。</p></details></div>` : ''}${dynamic('loan-estimate', 'estimate')}<p class="note">按等额本息、利率不变计算。还款从新增储蓄中扣除，不足时动用已有资金。例如每月新增储蓄 10,000 元、月供 4,000 元，还贷后剩余 6,000 元用于积累资产。首付在购房时另行扣除。</p>${info('等额本息', '<p>利率不变时，每月偿还相同的总金额，其中包括本金和利息。随着还款进行，本金部分逐渐增加，利息部分逐渐减少。</p>')}`;
            case 'inflation': return input('inflationRate', '预期通胀率', '%', { max: 30, help: '示例值为 2%，用于估算未来维持相同生活水平所需的开支。' }) + dynamic('inflation-hint') + info('通胀与购买力', '<p>通胀表示整体物价水平上涨。金额相同的钱，在未来可能买到更少的商品和服务。</p><p>名义金额是未来实际需要的金额；实际购买力则把它换算成起始年份的物价，方便比较。</p>');
            case 'growth': return `<span class="field-label">每年新增储蓄</span>${choices('grow', [['false', '保持不变', '每年存入相同的金额。'], ['true', '按通胀率增加', `每年增加 ${money(state.inflationRate)}%。`]])}${dynamic('growth-hint')}`;
            case 'return': return input('rate', '有效年收益率', '%', { min: -99, max: 30, help: '示例值为 7%。计算中假设每年收益相同，实际投资会有涨跌。' }) + dynamic('real-return', 'estimate') + dynamic('return-band') + dynamic('return-warning', 'warning') + info('查看各收益区间的配置参考', `<table><thead><tr><th>年收益率假设</th><th>配置思路与风险</th></tr></thead><tbody>${P.bands.map(b => `<tr><td>${b[0]}</td><td>${b[1]} ${b[2]}</td></tr>`).join('')}</tbody></table>`) + '<p class="note">这些是规划情景的参考，配置与收益率没有固定对应关系。实际收益受市场、买入价格、期限、费用和税收影响。</p>' + info('有效年收益率', '<p>有效年收益率表示资金经过一年后的增长比例。例如 10 万元按 5% 增长，一年后为 10.5 万元。</p><p>按月计算时，系统换算为对应的月收益率，使连续 12 个月的复利增长与年收益率一致。</p>');
            case 'withdrawal': return input('withdrawRate', '提取率', '%', { min: 0.01, max: 100 }) + '<p class="hint">目标资产＝每年生活开支÷提取率。</p><div class="estimate">建议先用 <b>3%～3.5%</b> 规划试算，默认 3.3%。这个范围比 4% 要求准备更多资产，仍不能保证退休后资金始终够用。</div>' + dynamic('withdrawal-hint') + info('提取率的适用条件', '<p>提取率是第一年生活开支占目标资产的比例。比例越低，需要准备的资产越多。</p><p>常见的 4% 法则源于特定美国历史市场数据下、约 30 年退休期的研究，通常指首年提取初始资产的 4%，以后按通胀调整提取金额。</p><p>提取率用于确定目标资产，收益率用于模拟积累过程。本工具未模拟退休后的逐年提取，推荐范围仅用于开始试算。</p>');
            default: return '';
        }
    }
    function mainFields(step) {
        const html = fields(step);
        if (!['return', 'withdrawal'].includes(step)) return html;
        const end = html.indexOf('</div>', html.indexOf('</div>') + 6) + 6;
        return html.slice(0, end) + info(step === 'return' ? '收益率与配置参考' : '提取率与目标资产说明', html.slice(end));
    }
    function derived() {
        const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const p = P.params(state), inf = P.number(state.inflationRate), rate = P.number(state.rate);
        put('saving-hint', Number.isFinite(p.annualSaving) ? `每年新增储蓄 ${money(p.annualSaving)} 元。${p.annualSaving === 0 ? '将只依靠起始资金的投资增长计算。' : state.savingUnit === 'year' && state.monthlyCalc ? '按月计算时平均分配到 12 个月。' : ''}` : '');
        put('target-hint', Number.isFinite(p.targetYear) ? `从 ${p.startYear} 年初到 ${p.targetYear} 年初，共 ${p.targetYear - p.startYear} 年。` : '');
        const growthOption = app.querySelector('[data-key="grow"][value="true"]')?.closest('label').querySelector('small');
        if (growthOption) growthOption.textContent = `每年增加 ${money(inf)}%。`;
        const total = P.loanTotal(state);
        put('house-estimate', Number.isFinite(total) ? `首付 ${money(P.number(state.housePrice) - total)} 元，需要贷款 ${money(total)} 元。` : '填写房价后查看首付与贷款金额。');
        put('house-warning', state.mode === 'saving' && P.number(state.purchaseYear) >= p.targetYear ? '购房发生在目标时点或之后，本次目标储蓄计算不会扣除这笔购房支出。' : '');
        put('provident-summary', `公积金年利率 ${percent(state.providentRate)}%，${state.providentRateAuto ? '按套数与期限自动确定' : '已手动设置'}。商贷金额 ${money(total - P.number(state.providentAmount))} 元。`);
        const loanErrors = { ...P.errors(state, 'house'), ...P.errors(state, 'loan') };
        const purchaseYearError = loanErrors.purchaseYear;
        delete loanErrors.purchaseYear; // 年份影响扣款时间，不影响月供金额。
        if (state.house && !Object.keys(loanErrors).length) {
            const m = F.calcMortgageInfo(p.mortgage);
            put('loan-estimate', `预计每月还款 ${money(m.monthlyPayment)} 元。${m.loans.length > 1 ? m.loans.map(l => `${l.kind === 'provident' ? '公积金' : '商贷'} ${money(l.monthlyPayment)} 元`).join('，') + '。' : ''}${purchaseYearError ? ` ${purchaseYearError}；请在购房计划中修改后再计算完整计划。` : ''}`);
        } else put('loan-estimate', Object.values(loanErrors).join('；') + '。');
        put('inflation-hint', Number.isFinite(p.annualExpense) && Number.isFinite(inf) ? `现在每年 ${money(p.annualExpense)} 元的生活开支，按 ${money(inf)}% 的涨幅计算，一年后约需 ${money(p.annualExpense * (1 + inf / 100))} 元。` : '');
        put('growth-hint', !state.grow ? '每年新存入的金额保持不变。' : state.mode === 'year' && Number.isFinite(p.annualSaving) ? `首年存 ${money(p.annualSaving)} 元，按 ${money(inf)}% 递增，第二年存 ${money(p.annualSaving * (1 + inf / 100))} 元。同一年内每月金额相同。` : `系统将计算首年需要存入的金额，之后每年增加 ${money(inf)}%。同一年内每月金额相同。`);
        put('real-return', !Number.isFinite(rate) || !Number.isFinite(inf) ? '填写收益率和通胀率后查看购买力变化。' : rate < inf ? '投资增长赶不上物价上涨，这部分资金的购买力会下降。' : rate === inf ? '投资增长刚好抵消物价上涨，这部分资金的购买力基本不变。' : `扣除通胀后，这部分资金的购买力预计每年增长约 ${money(((1 + rate / 100) / (1 + inf / 100) - 1) * 100)}%。`);
        const band = P.band(state.rate);
        put('return-band', band ? `${band[0]}：${band[1]} ${band[2]}` : '');
        document.getElementById('return-band')?.classList.add('hint');
        put('return-warning', rate > 10 ? '这个假设会明显缩短预计达成时间。建议再用较低收益率试算，检查计划是否仍可接受。' : '');
        const wr = P.number(state.withdrawRate);
        put('withdrawal-hint', Number.isFinite(p.annualExpense) && wr > 0 ? `每年生活费 ${money(p.annualExpense)} 元，按 ${money(wr)}% 计算，需要约 ${money(p.annualExpense / (wr / 100))} 元资产（起始年份购买力）。${wr > 4 ? '高于 4% 时，需要更谨慎评估长期资金耗尽风险。' : wr < 3 ? '较低提取率需要更多资产，预计积累时间通常更长。' : wr > 3.5 ? '需要关注退休期限和市场下跌时调整支出的能力。' : ''}` : '');
    }
    const stepGroup = step => ['purpose','start','asset','expense'].includes(step) ? 0 : ['saving','target'].includes(step) ? 1 : ['house','loan'].includes(step) ? 2 : step === 'review' ? 4 : 3;
    function review() {
        const p = P.params(state);
        const row = (label, value, step, sub = '') => `<div class="review-row"><span>${label}</span><div>${escape(value)}${sub ? `<small>${escape(sub)}</small>` : ''}<button type="button" class="text-button" data-edit="${step}">修改</button></div></div>`;
        return row('计算目的', state.mode === 'year' ? '多久能达到目标' : '需要存多少钱', 'purpose') +
            row('计划起始年份', `${p.startYear} 年初`, 'start') + row('起始资金', `${money(p.startAsset)} 元`, 'asset') +
            row('每年消费', `${money(p.annualExpense)} 元`, 'expense') +
            (state.mode === 'year' ? row('每年储蓄', `${money(p.annualSaving)} 元`, 'saving') : row('FIRE 目标年份', Number.isFinite(p.targetYear) ? `${p.targetYear} 年初` : '待填写', 'target')) +
            row('购房计划', state.house ? `${state.purchaseYear} 年，${money(state.housePrice)} 元` : '未启用', 'house') +
            (P.hasLoan(state) ? row('贷款方案', state.provident ? `公积金 ${money(state.providentAmount)} 元，商贷 ${money(P.loanTotal(state) - P.number(state.providentAmount))} 元` : '商业贷款', 'loan', `商贷 ${percent(state.mortgageRate)}%，${state.mortgageYears} 年${state.provident ? `；公积金 ${percent(state.providentRate)}%，${P.providentYears(state)} 年` : ''}`) : '') +
            row('预期通胀率', `${money(state.inflationRate)}%`, 'inflation', state.inflationRate === 2 || state.inflationRate === '2' ? '示例值' : '') +
            row('新增储蓄', state.grow ? `每年增加 ${money(state.inflationRate)}%` : '每年金额相同', 'growth') +
            row('有效年收益率', `${money(state.rate)}%`, 'return', Number(state.rate) === 7 ? '示例值' : '') +
            row('提取率', `${money(state.withdrawRate)}%`, 'withdrawal') +
            `<div class="field"><label for="monthlyCalc">计算粒度</label>${granularity()}</div>${state.house ? '<p class="hint">系统扣除首付和房贷，储蓄请填支付这些支出前的结余。未计房屋市值、装修税费和财政贴息。</p>' : ''}`;
    }
    function granularity() { return `<select data-key="monthlyCalc" id="monthlyCalc" aria-label="计算粒度"><option value="true" ${state.monthlyCalc ? 'selected' : ''}>按月计算</option><option value="false" ${state.monthlyCalc ? '' : 'selected'}>按年计算</option></select>`; }
    function render(focus = false) {
        const openDetails = [...app.querySelectorAll('details[open]')].map(el => el.querySelector('summary').textContent);
        document.getElementById('guideToggle').textContent = view === 'guide' ? '切换到完整表单' : '引导填写 ↗';
        if (view === 'main') {
            const group = (n, title, body) => `<section class="group"><div class="group-title"><h2>${title}</h2></div>${body}</section>`;
            app.innerHTML = `<section class="hero"><div><h1>让财务自由，有一个计划。</h1><p>从今天的收支出发，算出目标所需的时间与储蓄。</p></div><div class="hero-aside">第一次使用？<br>跟随引导，逐步填写你的计划。</div></section><div class="workspace"><form class="panel" id="plan-form" novalidate>${group(1, '基本情况', fields('purpose') + `<div class="two-col">${fields('start')}${fields('asset')}</div>` + fields('expense'))}${group(2, '储蓄计划', state.mode ? fields(state.mode === 'year' ? 'saving' : 'target') : '<p class="hint">先选择想计算的内容。</p>')}${group(3, '购房计划', fields('house') + (P.hasLoan(state) ? `<div class="conditional">${fields('loan')}</div>` : ''))}${group(4, '计算假设', fields('inflation') + `<div class="field">${fields('growth')}</div>` + mainFields('return') + mainFields('withdrawal'))}<div class="form-footer">${granularity()}<button type="submit" class="button">计算我的计划 <span aria-hidden="true">→</span></button></div></form><aside class="result-column" aria-label="计算结果"><div id="result-content">${resultMarkup()}</div><p class="result-foot">结果表示首次达到目标资产，未模拟退休后的生活支出、剩余房贷和市场波动。</p></aside></div>`;
        } else if (current === 'intro') {
            app.innerHTML = `<div class="guide-shell"><section class="panel guide-card intro"><h1 tabindex="-1">算一算，距离财务自由<br>还有多远</h1><p class="intro-definition">FIRE 是 Financial Independence, Retire Early 的缩写，意思是“财务独立，提前退休”。</p><p>它的基本思路是积累足够的资产，让资产能够支撑生活开支，从而减少对工作收入的依赖。</p><p>接下来，你可以估算多久能达到目标，或者为了在指定年份达到目标，每年需要存多少钱。</p><p class="note">结果基于你填写的收支和投资假设，不代表未来的实际表现。</p><button class="button" type="button" data-action="start">开始填写 <span aria-hidden="true">→</span></button></section></div>`;
        } else {
            const stages = ['基本情况', '储蓄计划', '购房计划', '计算假设', '核对'];
            app.innerHTML = `<div class="guide-shell"><nav class="guide-progress" aria-label="填写进度">${stages.map((name, i) => `<span class="${stepGroup(current) >= i ? 'active' : ''}" ${stepGroup(current) === i ? 'aria-current="step"' : ''}>${name}</span>`).join('')}</nav><form id="guide-form" novalidate><section class="panel guide-card"><h1 tabindex="-1">${current === 'review' ? '确认你的计划' : titles[current]}</h1>${current === 'review' ? review() : fields(current)}</section><div class="guide-actions"><button class="button quiet" type="button" data-action="back">← 上一步</button><button class="button" type="submit">${current === 'review' ? '确认并计算' : returnToReview ? '返回核对' : '继续'} <span aria-hidden="true">→</span></button></div></form></div>`;
        }
        for (const el of app.querySelectorAll('details')) if (openDetails.includes(el.querySelector('summary').textContent)) {
            el.dataset.restored = 'true';
            el.open = true;
        }
        derived();
        icons();
        if (focus) (app.querySelector('h1') || app).focus({ preventScroll: true });
    }
    function chartMarkup(points, p, baseTarget) {
        const targets = points.map(pt => F.adjustForInflation(baseTarget, p.inflationRate, pt.elapsedYears));
        const values = points.flatMap((pt, i) => [pt.asset, pt.realAsset, targets[i]]);
        const low = Math.min(0, ...values), high = Math.max(1, ...values), spread = high - low;
        const x = i => 64 + i / Math.max(1, points.length - 1) * 440;
        const y = v => 225 - (v - low) / spread * 190;
        const line = data => data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
        const grid = Array.from({ length: 5 }, (_, i) => {
            const value = low + spread * i / 4, pos = y(value);
            return `<line x1="64" x2="504" y1="${pos}" y2="${pos}" stroke="var(--line)"/><text x="54" y="${pos + 4}" text-anchor="end" fill="var(--muted)" font-size="10">${escape(short(value))}</text>`;
        }).join('');
        return `<section class="panel chart-panel" style="margin-top:20px"><h2>资产与目标</h2><div class="chart-legend"><span><i></i>资产金额</span><span><i class="target"></i>目标金额</span>${p.inflationRate > 0 ? '<span><i class="real"></i>实际购买力</span>' : ''}</div><svg class="chart" data-low="${low}" data-spread="${spread}" viewBox="0 0 530 265" role="img" aria-label="资产增长与目标金额曲线。下方滑块可查看每期准确数值。"><title>资产增长与目标金额</title>${grid}<path class="asset-line" pathLength="1" d="${line(points.map(pt => pt.asset))}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><path d="${line(targets)}" fill="none" stroke="var(--chart-target)" stroke-width="2" stroke-dasharray="5 5"/>${p.inflationRate > 0 ? `<path class="real-line" d="${line(points.map(pt => pt.realAsset))}" fill="none" stroke="var(--chart-real)" stroke-width="1.8"/>` : ''}<line id="chart-cursor" class="chart-cursor" x1="${x(points.length - 1)}" x2="${x(points.length - 1)}" y1="35" y2="225"/><circle id="chart-point" class="chart-point" cx="${x(points.length - 1)}" cy="${y(points[points.length - 1].asset)}" r="4"/>${points.length === 1 ? `<circle cx="64" cy="${y(points[0].asset)}" r="4" fill="var(--accent)"/>` : ''}<text x="64" y="253" fill="var(--muted)" font-size="11">${points[0].year} 年初</text>${points.length > 1 ? `<text x="504" y="253" text-anchor="end" fill="var(--muted)" font-size="11">${points[points.length - 1].year}${points[points.length - 1].month ? '/' + points[points.length - 1].month : ' 年初'}</text>` : ''}</svg><label class="note" for="trajectory-period">拖动查看各期金额</label><input class="chart-range" id="trajectory-period" type="range" min="0" max="${points.length - 1}" value="${points.length - 1}" ${points.length === 1 ? 'disabled' : ''}><div id="chart-readout" class="chart-readout" aria-live="polite">${periodText(points.length - 1)}</div></section>`;
    }
    function periodText(index) {
        if (!result?.trajectory) return '';
        const pt = result.trajectory[index];
        return `${pt.year} 年${pt.month ? pt.month + ' 月初' : '初'}：资产 ${money(pt.asset)} 元，目标 ${money(F.adjustForInflation(result.baseTargetAsset, resultParams.inflationRate, pt.elapsedYears))} 元${resultParams.inflationRate > 0 ? `，实际购买力 ${money(pt.realAsset)} 元` : ''}。`;
    }
    function resultMarkup() {
        const status = `<p id="calculation-status" class="status ${dirty ? 'dirty' : ''}" role="status">${dirty ? '参数已修改，请重新计算。下方保留上次结果。' : result ? '结果已按当前参数更新。' : '填写参数后开始计算'}</p>`;
        if (!result) return `<section class="panel result-panel">${status}<div class="empty-result"><div class="empty-symbol" aria-hidden="true">↗</div><h2>你的计划，从这里开始</h2><p>填写起始资金和生活支出，再选择想计算的目标。</p><button type="button" class="button secondary" data-action="guide">跟随引导填写 →</button></div></section>`;
        if (result.error) return `<section class="panel result-panel">${status}<h2>当前计划尚未达到目标</h2><p class="warning" role="alert">${escape(result.error)}</p><p class="hint">可以调整新增储蓄、生活支出或购房计划后重新计算。</p></section>`;
        const r = result, p = resultParams;
        let title, primary, description;
        if (r.mode === 'saving') {
            title = r.savingGrowWithInflation ? '首年需要存入' : '需要存入';
            primary = `${money(r.requiredMonthlySaving ?? r.requiredSaving)} <small>元／${p.monthlyCalc ? '月' : '年'}</small>`;
            description = `目标时间为 ${p.targetYear} 年初，共 ${r.years} 年。`;
            if (r.savingGrowWithInflation) description += `之后每年递增 ${money(p.inflationRate * 100)}%，第二年每${p.monthlyCalc ? '月' : '年'}存 ${money((r.requiredMonthlySaving ?? r.requiredSaving) * (1 + p.inflationRate))} 元。`;
            if (r.noAdditionalSaving) description = '按当前假设，到目标年份无需新增储蓄。';
        } else {
            title = '预计首次达到目标';
            primary = `${r.achievementYear}<small> 年${p.monthlyCalc ? ` ${r.achievementMonth} 月初` : '初'}</small>`;
            description = r.alreadyAchieved ? '起始资金已达到当前目标资产。' : `从起点起需要 ${Math.floor(r.monthsNeeded / 12)} 年${r.monthsNeeded % 12 ? ` ${r.monthsNeeded % 12} 个月` : ''}。`;
        }
        const gap = r.trajectory.find(pt => pt.asset < 0);
        const m = r.mortgageInfo;
        if (m.hasMortgage) description += r.mode === 'saving'
            ? '上述储蓄金额为还贷前金额，计算中已扣除房贷还款。'
            : '计算中已从新增储蓄中扣除房贷还款，不足时动用已有资金。';
        return `<section class="panel result-panel">${status}<div class="result-heading">${title}</div><div class="result-primary">${primary}</div><p class="result-description">${description}</p><div class="metrics"><div class="metric"><span>目标时点所需资产</span><strong>${short(r.targetAsset)} 元</strong></div><div class="metric"><span>相当于起始年份购买力</span><strong>${short(r.baseTargetAsset)} 元</strong></div></div>${gap ? `<p class="warning">${gap.year} 年${gap.month ? gap.month + ' 月初' : '初'}首次出现资金缺口，约 ${money(-gap.asset)} 元。请调整购房计划或储蓄额。负余额未计实际借款成本。</p>` : ''}${m.hasMortgage ? `<div class="metrics"><div class="metric"><span>购房首付</span><strong>${short(m.downPayment)} 元</strong></div><div class="metric"><span>贷款开始时合计月供</span><strong>${money(m.monthlyPayment)} 元</strong></div></div>${info('贷款明细', m.loans.map(l => `<p>${l.kind === 'provident' ? '公积金' : '商业'}贷款 ${money(l.principal)} 元，利率 ${percent(l.rate * 100)}%，${l.years} 年，每月 ${money(l.monthlyPayment)} 元。</p>`).join('') + `<p>贷款全期利息合计 ${money(m.totalInterest)} 元，不含财政贴息。</p>`)}` : ''}${p.mortgage && p.mortgage.purchaseYear >= (r.mode === 'saving' ? p.targetYear : r.achievementYear + (r.achievementMonth > 1 ? 1 : 0)) ? '<p class="warning">购房发生在达成时点或之后。后续购房支出可能使资产再次低于目标。</p>' : ''}${info('计算口径与假设', `<p>从 ${p.startYear} 年 1 月 1 日起算。储蓄在期末计入，图表记录结算后的下一期初余额。</p><p>收益率 ${money(p.rate * 100)}%，通胀率 ${money(p.inflationRate * 100)}%，提取率 ${money(p.withdrawRate * 100)}%。本次${p.monthlyCalc ? '按月' : '按年'}计算，${p.savingGrowWithInflation ? '新增储蓄每年随通胀递增' : '新增储蓄每年保持相同金额'}。</p><p>储蓄为扣除生活费后、支付首付和房贷前的结余。按年模式把全年购房支出汇总至年末；按月模式从购房当月末还款。房屋市值、装修税费和财政贴息未计入。</p>`)}</section>${chartMarkup(r.trajectory, p, r.baseTargetAsset)}`;
    }
    function showErrors(errors) {
        fieldErrors = errors;
        render();
        const key = Object.keys(errors)[0];
        const el = app.querySelector(`[data-key="${key}"]`);
        for (let ancestor = el?.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor.tagName === 'DETAILS') ancestor.open = true;
        }
        el?.focus();
        el?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }
    function calculate() {
        const errors = P.validate(state);
        if (Object.keys(errors).length) {
            if (view === 'guide') {
                current = P.steps(state).find(step => Object.keys(P.errors(state, step)).length);
                returnToReview = true;
            }
            showErrors(errors); return;
        }
        resultParams = P.params(state);
        result = F.calculate(state.mode, resultParams);
        view = 'main'; fieldErrors = {}; dirty = false; returnToReview = false;
        render();
        const el = document.getElementById('result-content');
        el.classList.add('is-calculated');
        el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
    function markDirty() {
        if (!result) return;
        dirty = true;
        const status = document.getElementById('calculation-status');
        if (status) { status.textContent = '参数已修改，请重新计算。下方保留上次结果。'; status.classList.add('dirty'); }
    }
    function updateField(target) {
        const key = target.dataset.key;
        if (!key) return;
        let value = target.type === 'checkbox' ? target.checked : target.value;
        if (['grow', 'monthlyCalc'].includes(key)) value = value === true || value === 'true';
        P.set(state, key, value);
        delete fieldErrors[key];
        target.setAttribute('aria-invalid', 'false');
        const message = document.getElementById(`error-${key}`); if (message) message.hidden = true;
        // 自动利率随期限变化；手动覆盖的利率保持不变。
        const autoRate = document.getElementById('providentRate');
        if (autoRate && state.providentRateAuto) autoRate.value = state.providentRate;
        markDirty();
    }
    app.addEventListener('input', event => {
        const target = event.target;
        if (target.id === 'trajectory-period') {
            const index = Number(target.value);
            document.getElementById('chart-readout').textContent = periodText(index);
            const svg = app.querySelector('.chart');
            const x = 64 + index / Math.max(1, result.trajectory.length - 1) * 440;
            const y = 225 - (result.trajectory[index].asset - Number(svg.dataset.low)) / Number(svg.dataset.spread) * 190;
            for (const attr of ['x1', 'x2']) document.getElementById('chart-cursor').setAttribute(attr, x);
            document.getElementById('chart-point').setAttribute('cx', x);
            document.getElementById('chart-point').setAttribute('cy', y);
            return;
        }
        if (target.type === 'number') { updateField(target); derived(); }
    });
    app.addEventListener('change', event => {
        const target = event.target;
        if (!target.dataset.key || target.type === 'number') return;
        updateField(target);
        const key = target.dataset.key, value = target.value;
        render();
        const candidates = [...app.querySelectorAll(`[data-key="${key}"]`)];
        const active = candidates.find(el => el.value === value) || candidates[0];
        active?.focus({ preventScroll: true });
        if (target.type === 'radio') animateElement(active?.closest('.choice'), [{ backgroundColor: '#fff' }, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--soft').trim() }], 150);
        if (target.type === 'checkbox' && target.checked) {
            const conditional = active?.closest('label')?.nextElementSibling;
            animateElement(conditional, [{ opacity: .55, clipPath: 'inset(0 0 18% 0)' }, { opacity: 1, clipPath: 'inset(0)' }], 200);
        }
    });
    app.addEventListener('submit', event => {
        event.preventDefault();
        if (view === 'main' || current === 'review') { calculate(); return; }
        const errors = P.errors(state, current);
        if (Object.keys(errors).length) { showErrors(errors); return; }
        if (returnToReview) { current = 'review'; returnToReview = false; }
        else { const steps = P.steps(state); current = steps[steps.indexOf(current) + 1] || 'review'; }
        fieldErrors = {}; render(true);
        navigationMotion(1);
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });
    app.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.edit) { current = button.dataset.edit; returnToReview = true; render(true); return; }
        switch (button.dataset.action) {
            case 'guide': view = 'guide'; current = 'intro'; fieldErrors = {}; returnToReview = false; break;
            case 'start': current = 'purpose'; break;
            case 'back': {
                if (returnToReview) { current = 'review'; returnToReview = false; }
                else { const steps = P.steps(state); current = current === 'review' ? steps[steps.length - 1] : steps[steps.indexOf(current) - 1] || 'intro'; }
                fieldErrors = {}; break;
            }
            case 'all-provident': if (Number.isFinite(P.loanTotal(state))) P.set(state, 'providentAmount', P.loanTotal(state)); markDirty(); break;
            case 'auto-provident': state.providentRateAuto = true; P.set(state, 'homeType', state.homeType); markDirty(); break;
            default: return;
        }
        render(true);
        if (['guide', 'start', 'back'].includes(button.dataset.action)) navigationMotion(button.dataset.action === 'back' ? -1 : 1);
    });
    app.addEventListener('toggle', event => {
        if (event.target.tagName !== 'DETAILS' || !event.target.open) return;
        if (event.target.dataset.restored) { delete event.target.dataset.restored; return; }
        animateElement(event.target.querySelector('.disclosure-body'), [{ opacity: .6, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'translateY(0)' }], 160);
    }, true);
    document.getElementById('guideToggle').addEventListener('click', () => {
        view = view === 'main' ? 'guide' : 'main';
        if (view === 'guide') { current = 'intro'; returnToReview = false; }
        fieldErrors = {}; render(true);
        navigationMotion(1);
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });
    render();
})();
