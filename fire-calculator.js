/**
 * FIRE 财务自由计算器 - 核心计算引擎
 *
 * 计算公式：
 * - FIRE目标资产 = 每年消费 / 消费占比
 * - 资产增长：asset(t) = asset(t-1) × (1 + rate) + saving - mortgagePayment
 * - 通胀调整：实际目标 = 目标资产 × (1 + inflationRate)^n
 * - 储蓄增长：可选随通胀增长
 */

const FireCalculator = {

    // 默认配置
    DEFAULTS: {
        WITHDRAW_RATE: 0.033,
        MORTGAGE_RATE: 0.04,
        MORTGAGE_YEARS: 30,
        DOWN_PAYMENT_RATE: 0.3,
        PURCHASE_MONTH: 1,
        MAX_SIMULATE_YEARS: 100,
        MAX_BINARY_ITERATIONS: 100,
        BINARY_TOLERANCE_YEARLY: 100,
        BINARY_TOLERANCE_MONTHLY: 10
    },

    // 参数参考范围
    REFERENCE_RANGES: {
        withdrawRate: [
            { min: 2.5, max: 3.0, label: '极保守', desc: '几乎不可能亏完，适合超长期FIRE' },
            { min: 3.0, max: 3.5, label: '保守', desc: '学术界推荐范围，4%法则的保守版本' },
            { min: 3.5, max: 4.0, label: '适中', desc: '经典4%法则，历史回测成功率约95%' },
            { min: 4.0, max: 5.0, label: '激进', desc: '有一定风险，适合有灵活调整能力的人' },
            { min: 5.0, max: 6.0, label: '高风险', desc: '需要较强的市场适应能力或副业收入' }
        ],
        rate: [
            { min: 3, max: 5, label: '保守', desc: '纯债券/存款，几乎无风险' },
            { min: 5, max: 7, label: '稳健', desc: '债券为主+少量股票，历史长期均值' },
            { min: 7, max: 9, label: '适中', desc: '股债混合配置，长期市场均值' },
            { min: 9, max: 12, label: '积极', desc: '股票为主，适合风险承受能力强的投资者' },
            { min: 12, max: 15, label: '激进', desc: '高风险高收益，需要较强的投资能力' }
        ],
        inflationRate: [
            { min: 1, max: 2, label: '低通胀', desc: '通缩或低通胀环境，如日本近年' },
            { min: 2, max: 3, label: '正常', desc: '央行目标通胀率，发达国家典型值' },
            { min: 3, max: 5, label: '温和通胀', desc: '发展中国家或通胀较高时期' },
            { min: 5, max: 8, label: '高通胀', desc: '需要警惕，实际购买力下降较快' },
            { min: 8, max: 15, label: '恶性通胀', desc: '需要采取特殊资产配置策略' }
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
        return annualExpense / (withdrawRate || this.DEFAULTS.WITHDRAW_RATE);
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
        if (!mortgage || !mortgage.housePrice || mortgage.housePrice <= 0) {
            return { hasMortgage: false };
        }

        const downPaymentRate = mortgage.downPaymentRate || this.DEFAULTS.DOWN_PAYMENT_RATE;
        const mortgageRate = mortgage.rate || this.DEFAULTS.MORTGAGE_RATE;
        const mortgageYears = mortgage.years || this.DEFAULTS.MORTGAGE_YEARS;

        const downPayment = mortgage.housePrice * downPaymentRate;
        const loanPrincipal = mortgage.housePrice - downPayment;
        const annualPayment = this.calcAnnualMortgage(loanPrincipal, mortgageRate, mortgageYears);
        const totalPayment = annualPayment * mortgageYears;

        return {
            hasMortgage: true,
            housePrice: mortgage.housePrice,
            downPayment: this.round(downPayment),
            loanPrincipal: this.round(loanPrincipal),
            annualPayment: this.round(annualPayment),
            totalPayment: this.round(totalPayment),
            totalInterest: this.round(totalPayment - loanPrincipal)
        };
    },

    /**
     * 获取房贷参数（带默认值）
     */
    getMortgageParams(mortgage) {
        if (!mortgage || !mortgage.housePrice || mortgage.housePrice <= 0) {
            return null;
        }
        return {
            housePrice: mortgage.housePrice,
            purchaseYear: mortgage.purchaseYear,
            purchaseMonth: mortgage.purchaseMonth || this.DEFAULTS.PURCHASE_MONTH,
            downPaymentRate: mortgage.downPaymentRate || this.DEFAULTS.DOWN_PAYMENT_RATE,
            rate: mortgage.rate || this.DEFAULTS.MORTGAGE_RATE,
            years: mortgage.years || this.DEFAULTS.MORTGAGE_YEARS
        };
    },

    /**
     * 获取某年的房贷还款额
     */
    getMortgagePaymentForYear(year, mortgage) {
        const m = this.getMortgageParams(mortgage);
        if (!m) return 0;
        if (year <= m.purchaseYear) return 0;
        if (year > m.purchaseYear + m.years) return 0;

        const downPayment = m.housePrice * m.downPaymentRate;
        const loanPrincipal = m.housePrice - downPayment;
        return this.calcAnnualMortgage(loanPrincipal, m.rate, m.years);
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
        if (monthsElapsed >= m.years * 12) return 0;

        const downPayment = m.housePrice * m.downPaymentRate;
        const loanPrincipal = m.housePrice - downPayment;
        return this.calcMonthlyMortgage(loanPrincipal, m.rate, m.years);
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

    /**
     * 按年模拟资产增长轨迹
     */
    simulateYearly({ startYear, startAsset, rate, inflationRate = 0, annualSaving, savingGrowWithInflation = false, years, mortgage = null }) {
        const trajectory = [];
        let asset = startAsset;

        for (let i = 0; i <= years; i++) {
            const year = startYear + i;
            const mortgagePayment = this.getMortgagePaymentForYear(year, mortgage);
            const downPayment = this.getDownPaymentForYear(year, mortgage);
            const saving = this.getSavingForYear(year, annualSaving, inflationRate, savingGrowWithInflation, startYear);

            // 年末资产 = 年初资产 × (1+利率) + 储蓄 - 首付 - 房贷
            asset = asset * (1 + rate) + saving - downPayment - mortgagePayment;

            const realAsset = inflationRate > 0 ? asset / Math.pow(1 + inflationRate, i) : asset;
            trajectory.push({
                year,
                asset: this.round(asset),
                realAsset: this.round(realAsset),
                mortgagePayment: this.round(mortgagePayment),
                downPayment: this.round(downPayment)
            });
        }

        return trajectory;
    },

    /**
     * 按月模拟资产增长轨迹
     */
    simulateMonthly({ startYear, startAsset, rate, inflationRate = 0, annualSaving, savingGrowWithInflation = false, years, mortgage = null }) {
        const trajectory = [];
        let asset = startAsset;
        const monthlyRate = rate / 12;
        const monthlyInflation = inflationRate / 12;
        let cumulativeMortgage = 0;

        for (let i = 0; i <= years * 12; i++) {
            const year = startYear + Math.floor(i / 12);
            const month = (i % 12) + 1;

            if (i < years * 12) {
                const yearlySaving = this.getSavingForYear(year, annualSaving, inflationRate, savingGrowWithInflation, startYear);
                const monthlySaving = yearlySaving / 12;
                const mortgagePayment = this.getMortgagePaymentForMonth(year, month, mortgage);
                const downPayment = this.getDownPaymentForMonth(year, month, mortgage);

                // 更新资产和累计房贷
                asset = asset * (1 + monthlyRate) + monthlySaving - downPayment - mortgagePayment;
                cumulativeMortgage += downPayment + mortgagePayment;
            }

            // 每年1月或首月记录
            if (month === 1 || i === 0) {
                const realAsset = inflationRate > 0 ? asset / Math.pow(1 + monthlyInflation, i) : asset;
                trajectory.push({
                    year,
                    month,
                    asset: this.round(asset),
                    realAsset: this.round(realAsset),
                    cumulativeMortgage: this.round(cumulativeMortgage)
                });
            }
        }

        return trajectory;
    },

    /**
     * 模式1：计算所需每年储蓄
     */
    calcRequiredSaving({ startYear, startAsset, targetYear, annualExpense, withdrawRate = this.DEFAULTS.WITHDRAW_RATE, rate, inflationRate = 0, savingGrowWithInflation = false, monthlyCalc = false, mortgage = null }) {
        const baseTargetAsset = this.calcTargetAsset(annualExpense, withdrawRate);
        const years = targetYear - startYear;

        if (years <= 0) return { error: '目标年份必须大于起始年份' };

        const targetAsset = this.adjustForInflation(baseTargetAsset, inflationRate, years);

        if (savingGrowWithInflation) {
            return this._calcSavingWithGrowth({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, monthlyCalc, mortgage });
        }

        if (monthlyCalc) {
            return this._calcSavingMonthly({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, mortgage });
        }

        return this._calcSavingYearly({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, mortgage });
    },

    _calcSavingWithGrowth({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, monthlyCalc, mortgage }) {
        const tolerance = monthlyCalc
            ? this.DEFAULTS.BINARY_TOLERANCE_MONTHLY
            : this.DEFAULTS.BINARY_TOLERANCE_YEARLY;
        let low = 0;
        let high = targetAsset;
        let mid;
        let trajectory;

        for (let iter = 0; iter < this.DEFAULTS.MAX_BINARY_ITERATIONS; iter++) {
            mid = (low + high) / 2;

            let finalAsset;
            if (monthlyCalc) {
                trajectory = this.simulateMonthly({
                    startYear, startAsset, rate, inflationRate,
                    annualSaving: mid * 12,
                    savingGrowWithInflation: true,
                    years, mortgage
                });
                finalAsset = trajectory[trajectory.length - 1].asset;
            } else {
                trajectory = this.simulateYearly({
                    startYear, startAsset, rate, inflationRate,
                    annualSaving: mid,
                    savingGrowWithInflation: true,
                    years, mortgage
                });
                finalAsset = trajectory[trajectory.length - 1].asset;
            }

            if (Math.abs(finalAsset - targetAsset) < tolerance) {
                break;
            }

            if (finalAsset < targetAsset) {
                low = mid;
            } else {
                high = mid;
            }
        }

        return this._buildSavingResult(monthlyCalc, mid, baseTargetAsset, targetAsset, years, true, mortgage, trajectory);
    },

    _calcSavingYearly({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, mortgage }) {
        const factor = Math.pow(1 + rate, years);
        const annuityFactor = rate === 0 ? years : (factor - 1) / rate;

        let mortgageFutureValue = 0;
        for (let i = 0; i < years; i++) {
            const year = startYear + i;
            const mortgagePayment = this.getMortgagePaymentForYear(year, mortgage);
            const downPayment = this.getDownPaymentForYear(year, mortgage);
            mortgageFutureValue += (mortgagePayment + downPayment) * Math.pow(1 + rate, years - i - 1);
        }

        const requiredSaving = (targetAsset - startAsset * factor + mortgageFutureValue) / annuityFactor;

        return {
            success: true,
            mode: 'saving',
            calculationMode: 'yearly',
            baseTargetAsset: this.round(baseTargetAsset),
            targetAsset: this.round(targetAsset),
            requiredSaving: this.round(requiredSaving),
            savingGrowWithInflation: false,
            years,
            mortgageInfo: this.calcMortgageInfo(mortgage)
        };
    },

    _calcSavingMonthly({ startYear, startAsset, baseTargetAsset, targetAsset, years, rate, inflationRate, mortgage }) {
        const monthlyRate = rate / 12;
        const totalMonths = years * 12;
        const factor = Math.pow(1 + monthlyRate, totalMonths);
        const annuityFactor = monthlyRate === 0 ? totalMonths : (factor - 1) / monthlyRate;

        let mortgageFutureValue = 0;
        for (let i = 0; i < totalMonths; i++) {
            const year = startYear + Math.floor(i / 12);
            const month = (i % 12) + 1;
            const mortgagePayment = this.getMortgagePaymentForMonth(year, month, mortgage);
            const downPayment = this.getDownPaymentForMonth(year, month, mortgage);
            mortgageFutureValue += (mortgagePayment + downPayment) * Math.pow(1 + monthlyRate, totalMonths - i - 1);
        }

        const requiredMonthlySaving = (targetAsset - startAsset * factor + mortgageFutureValue) / annuityFactor;
        const requiredAnnualSaving = requiredMonthlySaving * 12;

        return {
            success: true,
            mode: 'saving',
            calculationMode: 'monthly',
            baseTargetAsset: this.round(baseTargetAsset),
            targetAsset: this.round(targetAsset),
            requiredMonthlySaving: this.round(requiredMonthlySaving),
            requiredAnnualSaving: this.round(requiredAnnualSaving),
            savingGrowWithInflation: false,
            years,
            mortgageInfo: this.calcMortgageInfo(mortgage)
        };
    },

    _buildSavingResult(monthlyCalc, saving, baseTargetAsset, targetAsset, years, growWithInflation, mortgage = null, trajectory = null) {
        const result = {
            success: true,
            mode: 'saving',
            calculationMode: monthlyCalc ? 'monthly' : 'yearly',
            baseTargetAsset: this.round(baseTargetAsset),
            targetAsset: this.round(targetAsset),
            savingGrowWithInflation: growWithInflation,
            years,
            mortgageInfo: this.calcMortgageInfo(mortgage)
        };

        if (trajectory) {
            result.trajectory = trajectory;
        }

        if (monthlyCalc) {
            result.requiredMonthlySaving = this.round(saving);
            result.requiredAnnualSaving = this.round(saving * 12);
        } else {
            result.requiredSaving = this.round(saving);
        }

        return result;
    },

    /**
     * 模式2：计算达成年份
     */
    calcAchievementYear({ startYear, startAsset, annualExpense, withdrawRate = this.DEFAULTS.WITHDRAW_RATE, rate, inflationRate = 0, annualSaving, savingGrowWithInflation = false, monthlyCalc = false, mortgage = null }) {
        const baseTargetAsset = this.calcTargetAsset(annualExpense, withdrawRate);

        if (monthlyCalc) {
            return this._calcYearMonthly({ startYear, startAsset, baseTargetAsset, rate, inflationRate, annualSaving, savingGrowWithInflation, mortgage });
        }

        return this._calcYearYearly({ startYear, startAsset, baseTargetAsset, rate, inflationRate, annualSaving, savingGrowWithInflation, mortgage });
    },

    _calcYearYearly({ startYear, startAsset, baseTargetAsset, rate, inflationRate, annualSaving, savingGrowWithInflation, mortgage }) {
        let asset = startAsset;
        const maxYears = this.DEFAULTS.MAX_SIMULATE_YEARS;
        const trajectory = [];

        for (let i = 0; i <= maxYears; i++) {
            const year = startYear + i;
            const mortgagePayment = this.getMortgagePaymentForYear(year, mortgage);
            const downPayment = this.getDownPaymentForYear(year, mortgage);
            const saving = this.getSavingForYear(year, annualSaving, inflationRate, savingGrowWithInflation, startYear);

            asset = asset * (1 + rate) + saving - downPayment - mortgagePayment;

            const targetAsset = this.adjustForInflation(baseTargetAsset, inflationRate, i);
            const realAsset = inflationRate > 0 ? asset / Math.pow(1 + inflationRate, i) : asset;

            trajectory.push({
                year,
                asset: this.round(asset),
                realAsset: this.round(realAsset),
                mortgagePayment: this.round(mortgagePayment),
                downPayment: this.round(downPayment)
            });

            if (asset >= targetAsset) {
                return {
                    success: true,
                    mode: 'year',
                    calculationMode: 'yearly',
                    baseTargetAsset: this.round(baseTargetAsset),
                    targetAsset: this.round(targetAsset),
                    achievementYear: year,
                    yearsNeeded: i,
                    trajectory,
                    mortgageInfo: this.calcMortgageInfo(mortgage)
                };
            }
        }

        return { error: '100年内无法达成FIRE目标' };
    },

    _calcYearMonthly({ startYear, startAsset, baseTargetAsset, rate, inflationRate, annualSaving, savingGrowWithInflation, mortgage }) {
        let asset = startAsset;
        const monthlyRate = rate / 12;
        const monthlyInflation = inflationRate / 12;
        const maxMonths = this.DEFAULTS.MAX_SIMULATE_YEARS * 12;
        let cumulativeMortgage = 0;
        const trajectory = [];

        for (let i = 0; i < maxMonths; i++) {
            const year = startYear + Math.floor(i / 12);
            const month = (i % 12) + 1;

            // 计算当月房贷
            const monthlyMortgage = this.getMortgagePaymentForMonth(year, month, mortgage);
            const monthlyDown = this.getDownPaymentForMonth(year, month, mortgage);

            // 更新资产和累计房贷
            const yearlySaving = this.getSavingForYear(year, annualSaving, inflationRate, savingGrowWithInflation, startYear);
            const monthlySaving = yearlySaving / 12;
            asset = asset * (1 + monthlyRate) + monthlySaving - monthlyDown - monthlyMortgage;
            cumulativeMortgage += monthlyDown + monthlyMortgage;

            // 每年1月或首月记录
            if (month === 1 || i === 0) {
                const targetAsset = this.adjustForInflation(baseTargetAsset, inflationRate, i / 12);
                const realAsset = inflationRate > 0 ? asset / Math.pow(1 + monthlyInflation, i) : asset;

                trajectory.push({
                    year,
                    month,
                    asset: this.round(asset),
                    realAsset: this.round(realAsset),
                    cumulativeMortgage: this.round(cumulativeMortgage)
                });

                if (asset >= targetAsset) {
                    return {
                        success: true,
                        mode: 'year',
                        calculationMode: 'monthly',
                        baseTargetAsset: this.round(baseTargetAsset),
                        targetAsset: this.round(targetAsset),
                        achievementYear: year,
                        achievementMonth: month,
                        monthsNeeded: i,
                        yearsNeeded: this.round(i / 12),
                        trajectory,
                        mortgageInfo: this.calcMortgageInfo(mortgage)
                    };
                }
            }
        }

        return { error: '100年内无法达成FIRE目标' };
    },

    /**
     * 通用计算入口
     */
    calculate(mode, params) {
        switch (mode) {
            case 'saving':
                return this.calcRequiredSaving(params);
            case 'year':
                return this.calcAchievementYear(params);
            default:
                return { error: '未知模式' };
        }
    },

    /**
     * 获取资产轨迹
     */
    getTrajectory(params) {
        const { monthlyCalc = false } = params;
        if (monthlyCalc) {
            return this.simulateMonthly(params);
        }
        return this.simulateYearly(params);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FireCalculator;
}
