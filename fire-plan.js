(function (root, factory) {
    const api = factory(typeof module === 'object' ? require('./fire-calculator.js') : root.FireCalculator);
    if (typeof module === 'object') module.exports = api;
    else root.FirePlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (calculator) {
    const defaults = (year = new Date().getFullYear()) => ({
        mode: '', startYear: year, startAsset: 0, expense: '', expenseUnit: 'month',
        saving: '', savingUnit: 'month', targetYear: '', inflationRate: 2, grow: false,
        rate: 7, withdrawRate: 3.3, monthlyCalc: true, house: false, purchaseYear: year + 2,
        housePrice: '', downPaymentRate: 30, fullCash: false, mortgageRate: 3.5, mortgageYears: 30,
        provident: false, providentAmount: '', homeType: 'first', providentRate: 2.6,
        providentRateAuto: true, separateYears: false, providentYears: 30
    });
    const number = value => value === '' || value == null ? NaN : Number(value);
    const loanTotal = s => number(s.housePrice) * (1 - (s.fullCash ? 1 : number(s.downPaymentRate) / 100));
    const hasLoan = s => s.house && !s.fullCash && number(s.downPaymentRate) < 100;
    const providentYears = s => s.separateYears ? number(s.providentYears) : number(s.mortgageYears);
    function set(s, key, value) {
        if ((key === 'expenseUnit' || key === 'savingUnit') && s[key] !== value) {
            const amount = key === 'expenseUnit' ? 'expense' : 'saving';
            if (s[amount] !== '') s[amount] = number(s[amount]) * (value === 'year' ? 12 : 1 / 12);
        }
        s[key] = value;
        if (key === 'providentRate') s.providentRateAuto = false;
        if (['homeType', 'mortgageYears', 'providentYears', 'separateYears'].includes(key) && s.providentRateAuto) {
            s.providentRate = Number((calculator.getProvidentRate(s.homeType, providentYears(s)) * 100).toFixed(3));
        }
    }
    const steps = s => ['purpose', 'start', 'asset', 'expense', ...(s.mode === 'year' ? ['saving'] : s.mode === 'saving' ? ['target'] : []),
        'house', ...(hasLoan(s) ? ['loan'] : []), 'inflation', 'growth', 'return', 'withdrawal'];
    function params(s) {
        const p = {
            startYear: number(s.startYear), startAsset: number(s.startAsset),
            annualExpense: number(s.expense) * (s.expenseUnit === 'month' ? 12 : 1),
            annualSaving: number(s.saving) * (s.savingUnit === 'month' ? 12 : 1),
            targetYear: number(s.targetYear), inflationRate: number(s.inflationRate) / 100,
            rate: number(s.rate) / 100, withdrawRate: number(s.withdrawRate) / 100,
            savingGrowWithInflation: s.grow, monthlyCalc: s.monthlyCalc, mortgage: null
        };
        if (s.house) {
            p.mortgage = { purchaseYear: number(s.purchaseYear), housePrice: number(s.housePrice),
                downPaymentRate: s.fullCash ? 1 : number(s.downPaymentRate) / 100,
                rate: hasLoan(s) ? number(s.mortgageRate) / 100 : 0,
                years: hasLoan(s) ? number(s.mortgageYears) : 30 };
            if (hasLoan(s) && s.provident) p.mortgage.provident = {
                principal: number(s.providentAmount), rate: number(s.providentRate) / 100, years: providentYears(s)
            };
        }
        return p;
    }
    function errors(s, step) {
        const e = {};
        function check(key, min, max, label, integer = false) {
            const n = number(s[key]);
            if (!Number.isFinite(n)) e[key] = `请填写${label}`;
            else if (n < min || n > max || (integer && !Number.isInteger(n))) e[key] = `${label}须为 ${min} 至 ${max}${integer ? ' 的整数' : ' 之间的数值'}`;
        }
        if (step === 'purpose' && !['saving', 'year'].includes(s.mode)) e.mode = '请选择想计算的内容';
        if (step === 'start') check('startYear', 1900, 9999, '起始年份', true);
        if (step === 'asset') check('startAsset', 0, 1e12, '起始资金');
        if (step === 'expense') check('expense', 0.01, s.expenseUnit === 'month' ? 1e12 / 12 : 1e12, '生活支出');
        if (step === 'saving') check('saving', 0, s.savingUnit === 'month' ? 1e12 / 12 : 1e12, '新增储蓄');
        if (step === 'target') check('targetYear', number(s.startYear) + 1, Math.min(9999, number(s.startYear) + 100), '目标年份', true);
        if (step === 'house' && s.house) {
            check('purchaseYear', number(s.startYear), 9999, '购房年份', true);
            check('housePrice', 0.01, 1e12, '房屋总价');
            if (!s.fullCash) check('downPaymentRate', 0, 100, '首付比例');
        }
        if (step === 'loan' && hasLoan(s)) {
            check('mortgageRate', 0, 20, '商贷年利率');
            check('mortgageYears', 1, s.provident && !s.separateYears ? 30 : 50, '还款期限', true);
            if (s.provident) {
                check('providentAmount', 0.01, Math.max(0, loanTotal(s)), '公积金贷款金额');
                check('providentRate', 0, 20, '公积金年利率');
                if (s.separateYears) check('providentYears', 1, 30, '公积金还款期限', true);
            }
        }
        if (step === 'inflation') check('inflationRate', 0, 30, '通胀率');
        if (step === 'return') check('rate', -99, 30, '有效年收益率');
        if (step === 'withdrawal') check('withdrawRate', 0.01, 100, '提取率');
        return e;
    }
    function validate(s) { return Object.assign({}, ...steps(s).map(step => errors(s, step))); }
    const bands = [
        ['0% 至低于 3%', '现金、存款、货币基金、短期高信用债券为主。', '重视流动性和减少波动，收益可能低于通胀；债券基金也可能亏损。'],
        ['3% 至低于 5%', '以债券为主，搭配分散股票资产，例如股票占 20%～40%。', '通过部分市场风险争取增长。股债都可能下跌，不能按固定利息理解。'],
        ['5% 至低于 8%', '股债混合，例如分散股票资产占 40%～70%，其余主要为债券。', '依靠较高比例的股票争取长期收益，需要承受阶段性亏损。'],
        ['8%～10%', '股票占比较高，例如分散股票资产占 70%～100%。', '较乐观的长期假设，可能经历较大回撤和多年低收益。'],
        ['超过 10%', '没有可稳定对应的常规配置。追求此类收益的做法包括集中持股、偏重行业或成长股、使用杠杆。', '风险增加，也可能长期跑输分散配置，不建议作为唯一规划依据。']
    ];
    function band(rate) {
        if (!Number.isFinite(number(rate))) return null;
        if (number(rate) < 0) return ['负收益情景', '用于观察投资缩水对计划的影响。', '不对应特定资产配置。'];
        return bands[rate < 3 ? 0 : rate < 5 ? 1 : rate < 8 ? 2 : rate <= 10 ? 3 : 4];
    }
    return { defaults, number, set, steps, params, errors, validate, loanTotal, hasLoan, providentYears, bands, band };
});
