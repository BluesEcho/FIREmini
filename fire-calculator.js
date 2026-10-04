/**
 * FIRE 财务自由计算器 - 核心计算引擎
 *
 * 计算公式：
 * - FIRE目标资产 = 每年消费 / 消费占比
 * - 资产增长：asset(t) = asset(t-1) × (1 + rate) + saving - downPayment - mortgagePayment
 * - 通胀调整：实际目标 = 目标资产 × (1 + inflationRate)^n
 * - 储蓄增长：可选随通胀增长
 */

const FireCalculator = {
    API_VERSION: 1,

    // 默认配置
    DEFAULTS: {
        WITHDRAW_RATE: 0.033,
        MORTGAGE_RATE: 0.035,
        MORTGAGE_YEARS: 30,
        DOWN_PAYMENT_RATE: 0.3,
        PURCHASE_MONTH: 1,
        MAX_SIMULATE_YEARS: 100
    },

    // 参数参考范围
    REFERENCE_RANGES: {
        withdrawRate: [
            { min: 1, max: 3, label: '较低提取率', desc: '同等消费需要更多目标资产，仍受退休年限和市场波动影响' },
            { min: 3, max: 4, label: '提取率假设', desc: '用于计算目标资产，不能保证退休后的资金持续性' },
            { min: 4, max: 10, label: '较高提取率', desc: '目标资产较少，对退休后的收益和支出更敏感' }
        ],
        rate: [
            { min: -99, max: 30, label: '固定收益假设', desc: '按有效年收益率计算，未模拟市场波动、税费和投资成本' }
        ],
        inflationRate: [
            { min: 0, max: 30, label: '通胀假设', desc: '生活费和目标资产按此比例逐年增长' }
        ]
    },

    /**
     * 获取参数建议描述
     */
    getParameterSuggestion(param, value) {
        const ranges = this.REFERENCE_RANGES[param];
        if (!ranges) return null;

        const v = param === 'rate' || param === 'inflationRate' ? value * 100 : value;
        for (const range of ranges) {
            if (v >= range.min && v <= range.max) {
                return { label: range.label, desc: range.desc };
            }
        }
        return null;
    },

    /**
     * 精确舍入到2位小数
     */
    round(value) {
        return Math.round(value * 100) / 100;
    },

    /**
     * 计算FIRE目标资产
     */
    calcTargetAsset(annualExpense, withdrawRate) {
        return annualExpense / (withdrawRate ?? this.DEFAULTS.WITHDRAW_RATE);
    },

    /**
     * 计算通胀调整后的目标资产
     */
    adjustForInflation(targetAsset, inflationRate, years) {
        if (inflationRate <= 0) return targetAsset;
        return targetAsset * Math.pow(1 + inflationRate, years);
    },

    /**
     * 计算等额本息月供
     */
    calcMonthlyMortgage(principal, annualRate, years) {
        if (principal <= 0 || years <= 0) return 0;
        if (annualRate === 0) return principal / (years * 12);

        const monthlyRate = annualRate / 12;
        const months = years * 12;
        const factor = Math.pow(1 + monthlyRate, months);
        return principal * (monthlyRate * factor) / (factor - 1);
    },

    /**
     * 计算年还款额
     */
    calcAnnualMortgage(principal, annualRate, years) {
        return this.calcMonthlyMortgage(principal, annualRate, years) * 12;
    },

    /**
     * 计算房贷详细信息
     */
    calcMortgageInfo(mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return { hasMortgage: false };
        const downPayment = m.housePrice * m.downPaymentRate;
        const loans = this.getMortgageLoans(m).map(loan => {
            const monthlyPayment = this.calcMonthlyMortgage(loan.principal, loan.rate, loan.years);
            const totalPayment = monthlyPayment * loan.years * 12;
            return { ...loan, monthlyPayment, totalPayment, totalInterest: totalPayment - loan.principal };
        });
        const monthlyPayment = loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);
        const totalPayment = loans.reduce((sum, loan) => sum + loan.totalPayment, 0);
        return {
            hasMortgage: true, housePrice: m.housePrice,
            downPayment: this.round(downPayment), loanPrincipal: this.round(m.housePrice - downPayment),
            monthlyPayment: this.round(monthlyPayment), annualPayment: this.round(monthlyPayment * 12),
            totalPayment: this.round(totalPayment), totalInterest: this.round(totalPayment - (m.housePrice - downPayment)),
            loans
        };
    },

    // 两部分分别计息和到期，保留原有纯商贷参数的兼容性。
    getMortgageLoans(mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return [];
        const total = m.housePrice * (1 - m.downPaymentRate);
        const provident = m.provident?.principal ?? 0;
        const loans = [];
        if (total - provident > 0) loans.push({ kind: 'commercial', principal: total - provident, rate: m.rate, years: m.years });
        if (provident > 0) loans.push({ kind: 'provident', principal: provident,
            rate: m.provident.rate, years: m.provident.years ?? m.years });
        return loans;
    },

    getProvidentRate(homeType = 'first', years = 30) {
        return homeType === 'second' ? (years <= 5 ? 0.02525 : 0.03075) : (years <= 5 ? 0.021 : 0.026);
    },

    /**
     * 获取房贷参数（带默认值）
     */
    getMortgageParams(mortgage) {
        if (!mortgage || !mortgage.housePrice || mortgage.housePrice <= 0) {
            return null;
        }
        return {
            provident: mortgage.provident,
            housePrice: mortgage.housePrice,
            purchaseYear: mortgage.purchaseYear,
            purchaseMonth: mortgage.purchaseMonth ?? this.DEFAULTS.PURCHASE_MONTH,
            downPaymentRate: mortgage.downPaymentRate ?? this.DEFAULTS.DOWN_PAYMENT_RATE,
            rate: mortgage.rate ?? this.DEFAULTS.MORTGAGE_RATE,
            years: mortgage.years ?? this.DEFAULTS.MORTGAGE_YEARS
        };
    },

    /**
     * 获取某年的房贷还款额
     */
    getMortgagePaymentForYear(year, mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return 0;
        let total = 0;
        for (let month = 1; month <= 12; month++) {
            total += this.getMortgagePaymentForMonth(year, month, m);
        }
        return total;
    },

    /**
     * 获取某月的房贷月供
     */
    getMortgagePaymentForMonth(year, month, mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return 0;

        // 购房当月之前
        if (year < m.purchaseYear || (year === m.purchaseYear && month < m.purchaseMonth)) {
            return 0;
        }

        // 计算已还款月数
        const monthsElapsed = (year - m.purchaseYear) * 12 + (month - m.purchaseMonth);
        return this.getMortgageLoans(m).reduce((sum, loan) => sum +
            (monthsElapsed < loan.years * 12 ? this.calcMonthlyMortgage(loan.principal, loan.rate, loan.years) : 0), 0);
    },

    /**
     * 获取某年的购房首付
     */
    getDownPaymentForYear(year, mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return 0;
        if (year !== m.purchaseYear) return 0;
        return m.housePrice * m.downPaymentRate;
    },

    /**
     * 获取某月的购房首付
     */
    getDownPaymentForMonth(year, month, mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return 0;
        if (year !== m.purchaseYear || month !== m.purchaseMonth) return 0;
        return m.housePrice * m.downPaymentRate;
    },

    /**
     * 获取某年的储蓄金额（支持通胀增长）
     */
    getSavingForYear(year, baseSaving, inflationRate, growWithInflation, startYear) {
        if (!growWithInflation || inflationRate <= 0) return baseSaving;
        const yearsElapsed = year - startYear;
        return baseSaving * Math.pow(1 + inflationRate, yearsElapsed);
    },

    // 所有轨迹从起始年 1 月 1 日开始。现金流在期末发生，记录下一期初的余额。
    // 按年模式把该年的首付和月供汇总至年末；按月模式在各月末扣款。
    _simulate(params) {
        const { startYear, startAsset, annualSaving = 0, rate, inflationRate = 0,
            savingGrowWithInflation = false, monthlyCalc = false, years, mortgage = null } = params;
        const periods = monthlyCalc ? 12 : 1;
        const periodRate = Math.expm1(Math.log1p(rate) / periods);
        let asset = startAsset;
        let savingWeight = 0;
        let cumulativeMortgage = 0;
        const trajectory = [];
        for (let step = 0; step <= Math.round(years * periods); step++) {
            let mortgagePayment = 0;
            let downPayment = 0;
            if (step > 0) {
                const cashYear = startYear + Math.floor((step - 1) / periods);
                const cashMonth = (step - 1) % periods + 1;
                mortgagePayment = monthlyCalc
                    ? this.getMortgagePaymentForMonth(cashYear, cashMonth, mortgage)
                    : this.getMortgagePaymentForYear(cashYear, mortgage);
                downPayment = monthlyCalc
                    ? this.getDownPaymentForMonth(cashYear, cashMonth, mortgage)
                    : this.getDownPaymentForYear(cashYear, mortgage);
                const weight = this.getSavingForYear(cashYear, 1, inflationRate, savingGrowWithInflation, startYear) / periods;
                savingWeight = savingWeight * (1 + periodRate) + weight;
                asset = asset * (1 + periodRate) + annualSaving * weight - downPayment - mortgagePayment;
                cumulativeMortgage += downPayment + mortgagePayment;
            }
            const elapsedYears = step / periods;
            trajectory.push({
                year: startYear + Math.floor(elapsedYears),
                month: monthlyCalc ? step % 12 + 1 : undefined,
                elapsedYears,
                asset,
                realAsset: asset / Math.pow(1 + inflationRate, elapsedYears),
                mortgagePayment, downPayment, cumulativeMortgage, savingWeight
            });
        }
        return trajectory;
    },

    simulateYearly(params) { return this._simulate({ ...params, monthlyCalc: false }); },
    simulateMonthly(params) { return this._simulate({ ...params, monthlyCalc: true }); },
    getTrajectory(params) { return this._simulate(params); },

    validate(mode, p) {
        const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
        const year = value => Number.isInteger(value) && range(value, 1900, 9999);
        if (!year(p.startYear)) return '起始年份须为 1900 至 9999 的整数';
        if (!range(p.startAsset, 0, 1e12)) return '起始资金须为 0 至 1 万亿元';
        if (!range(p.annualExpense, 0.01, 1e12)) return '每年消费须大于 0，且不超过 1 万亿元';
        if (!range(p.withdrawRate ?? this.DEFAULTS.WITHDRAW_RATE, 0.0001, 1)) return '提取率须在 0.01% 至 100% 之间';
        if (!range(p.rate, -0.99, 0.3)) return '年收益率须在 -99% 至 30% 之间';
        if (!range(p.inflationRate ?? 0, 0, 0.3)) return '通胀率须在 0% 至 30% 之间';
        if (mode === 'saving' && (!year(p.targetYear) || p.targetYear <= p.startYear || p.targetYear - p.startYear > 100)) {
            return '目标年份须晚于起始年份，且相隔不超过 100 年';
        }
        if (mode === 'year' && !range(p.annualSaving, 0, 1e12)) return '每年储蓄须为 0 至 1 万亿元';
        if (p.mortgage) {
            const m = p.mortgage;
            if (!year(m.purchaseYear) || m.purchaseYear < p.startYear) return '购房年份须为不早于起始年份的整数';
            if (!range(m.housePrice, 0.01, 1e12)) return '房屋总价须大于 0，且不超过 1 万亿元';
            if (!range(m.downPaymentRate ?? this.DEFAULTS.DOWN_PAYMENT_RATE, 0, 1)) return '首付比例须在 0% 至 100% 之间';
            if (!range(m.rate ?? this.DEFAULTS.MORTGAGE_RATE, 0, 0.2)) return '房贷利率须在 0% 至 20% 之间';
            const years = m.years ?? this.DEFAULTS.MORTGAGE_YEARS;
            if (!Number.isInteger(years) || !range(years, 1, 50)) return '还款期限须为 1 至 50 年的整数';
            const month = m.purchaseMonth ?? this.DEFAULTS.PURCHASE_MONTH;
            if (!Number.isInteger(month) || !range(month, 1, 12)) return '购房月份须为 1 至 12 的整数';
            if (m.provident) {
                const total = m.housePrice * (1 - (m.downPaymentRate ?? this.DEFAULTS.DOWN_PAYMENT_RATE));
                if (!range(m.provident.principal, 0, total)) return '公积金贷款金额须在 0 与贷款总额之间';
                if (!range(m.provident.rate, 0, 0.2)) return '公积金贷款利率须在 0% 至 20% 之间';
                const providentYears = m.provident.years ?? years;
                if (!Number.isInteger(providentYears) || !range(providentYears, 1, 30)) return '公积金还款期限须为 1 至 30 年的整数';
            }
        }
        return null;
    },

    calcRequiredSaving(params) {
        const error = this.validate('saving', params);
        if (error) return { error };
        const years = params.targetYear - params.startYear;
        const baseTargetAsset = this.calcTargetAsset(params.annualExpense, params.withdrawRate);
        const targetAsset = this.adjustForInflation(baseTargetAsset, params.inflationRate ?? 0, years);
        // 现金流对储蓄额是线性的。直接累计每元储蓄的终值，避免二分上界不足。
        const baselinePoints = this._simulate({ ...params, years, annualSaving: 0 });
        const baseline = baselinePoints[baselinePoints.length - 1];
        const annualSaving = Math.max(0, (targetAsset - baseline.asset) / baseline.savingWeight);
        const periods = params.monthlyCalc ? 12 : 1;
        // 向上取整到分，使显示金额足以达到目标。
        const periodicSaving = Math.ceil(annualSaving / periods * 100) / 100;
        const result = {
            success: true, mode: 'saving', calculationMode: params.monthlyCalc ? 'monthly' : 'yearly',
            baseTargetAsset: this.round(baseTargetAsset), targetAsset: this.round(targetAsset), years,
            savingGrowWithInflation: params.savingGrowWithInflation ?? false,
            noAdditionalSaving: periodicSaving === 0,
            mortgageInfo: this.calcMortgageInfo(params.mortgage),
            trajectory: this._simulate({ ...params, years, annualSaving: periodicSaving * periods })
        };
        if (params.monthlyCalc) {
            result.requiredMonthlySaving = periodicSaving;
            result.requiredAnnualSaving = this.round(periodicSaving * 12);
        } else result.requiredSaving = periodicSaving;
        return result;
    },

    calcAchievementYear(params) {
        const error = this.validate('year', params);
        if (error) return { error };
        const baseTargetAsset = this.calcTargetAsset(params.annualExpense, params.withdrawRate);
        const all = this._simulate({ ...params, years: this.DEFAULTS.MAX_SIMULATE_YEARS });
        const index = all.findIndex(p => p.asset >= this.adjustForInflation(baseTargetAsset, params.inflationRate ?? 0, p.elapsedYears));
        if (index < 0) return { error: '按当前参数，100 年内无法达到目标资产' };
        const point = all[index];
        return {
            success: true, mode: 'year', calculationMode: params.monthlyCalc ? 'monthly' : 'yearly',
            baseTargetAsset: this.round(baseTargetAsset),
            targetAsset: this.round(this.adjustForInflation(baseTargetAsset, params.inflationRate ?? 0, point.elapsedYears)),
            achievementYear: point.year, achievementMonth: point.month,
            monthsNeeded: params.monthlyCalc ? index : index * 12,
            yearsNeeded: this.round(point.elapsedYears), alreadyAchieved: index === 0,
            trajectory: all.slice(0, index + 1), mortgageInfo: this.calcMortgageInfo(params.mortgage)
        };
    },

    calculate(mode, params) {
        if (mode === 'saving') return this.calcRequiredSaving(params);
        if (mode === 'year') return this.calcAchievementYear(params);
        return { error: '未知模式' };
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = FireCalculator;

if (typeof window !== 'undefined') window.FireCalculator = FireCalculator;
