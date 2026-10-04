const { test } = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fire-calculator.js');
const base = { startYear: 2026, targetYear: 2036, startAsset: 0, annualExpense: 40000,
    withdrawRate: 0.04, rate: 0, inflationRate: 0, annualSaving: 100000 };
const close = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('十年现金流与起始余额、目标时点一致', () => {
    for (const monthlyCalc of [false, true]) {
        const points = f.getTrajectory({ ...base, years: 10, monthlyCalc });
        assert.equal(points[0].asset, 0);
        close(points.at(-1).asset, 1000000);
        assert.equal(points.at(-1).year, 2036);
        assert.equal(points.at(-1).elapsedYears, 10);
    }
});
test('零通胀时增长开关不改变储蓄额', () => {
    for (const monthlyCalc of [false, true]) {
        const a = f.calculate('saving', { ...base, monthlyCalc });
        const b = f.calculate('saving', { ...base, monthlyCalc, savingGrowWithInflation: true });
        assert.equal(a.requiredSaving, b.requiredSaving);
        assert.equal(a.requiredMonthlySaving, b.requiredMonthlySaving);
        assert.ok(a.trajectory.at(-1).asset >= a.targetAsset);
    }
});
test('达标检测覆盖每月、完整年数和初始已达标', () => {
    assert.equal(f.calculate('year', base).yearsNeeded, 10);
    const result = f.calculate('year', { ...base, annualExpense: 24000, annualSaving: 1200000, monthlyCalc: true });
    assert.equal(result.monthsNeeded, 6);
    assert.equal(result.achievementYear, 2026);
    assert.equal(result.achievementMonth, 7); // 六月末结算后的七月初余额
    assert.equal(result.trajectory.at(-1).asset, 600000);
    for (const monthlyCalc of [false, true]) {
        assert.equal(f.calculate('year', { ...base, startAsset: 1000000, monthlyCalc }).monthsNeeded, 0);
        assert.equal(f.calculate('saving', { ...base, startAsset: 2000000, monthlyCalc }).noAdditionalSaving, true);
    }
});
test('有效年收益和实际购买力不因粒度改变', () => {
    for (const monthlyCalc of [false, true]) {
        const point = f.getTrajectory({ ...base, startAsset: 100, annualSaving: 0, rate: 0.12, inflationRate: 0.12, years: 1, monthlyCalc }).at(-1);
        close(point.asset, 112);
        close(point.realAsset, 100);
    }
});
test('零利率、零首付、全款及完整还款期限', () => {
    const mortgage = { housePrice: 120000, downPaymentRate: 0, rate: 0, years: 1, purchaseYear: 2026, purchaseMonth: 7 };
    const info = f.calcMortgageInfo(mortgage);
    assert.equal(info.totalInterest, 0);
    assert.equal(info.downPayment, 0);
    assert.equal(f.getMortgagePaymentForYear(2026, mortgage), 60000);
    assert.equal(f.getMortgagePaymentForYear(2027, mortgage), 60000);
    assert.equal(f.getMortgagePaymentForYear(2028, mortgage), 0);
    assert.equal(f.getMortgagePaymentForMonth(2027, 7, mortgage), 0);
    assert.equal(f.calcMortgageInfo({ ...mortgage, downPaymentRate: 1 }).annualPayment, 0);
    for (const monthlyCalc of [false, true]) {
        close(f.getTrajectory({ ...base, annualSaving: 0, startAsset: 200000, years: 2, monthlyCalc, mortgage }).at(-1).asset, 80000);
    }
});
test('反推储蓄再模拟达到目标，包括高购房支出和增长储蓄', () => {
    for (const monthlyCalc of [false, true]) for (const savingGrowWithInflation of [false, true]) {
        const p = { ...base, rate: 0.07, inflationRate: 0.02, monthlyCalc, savingGrowWithInflation,
            mortgage: { housePrice: 3000000, downPaymentRate: 0.3, rate: 0.04, years: 30, purchaseYear: 2028 } };
        const result = f.calculate('saving', p);
        assert.equal(result.success, true);
        const end = result.trajectory.at(-1);
        assert.ok(end.asset >= result.targetAsset - 0.01);
        assert.ok(end.asset - result.targetAsset < 3);
        const reduced = f.getTrajectory({ ...p, years: 10, annualSaving: monthlyCalc ? result.requiredAnnualSaving - 0.12 : result.requiredSaving - 0.01 }).at(-1);
        assert.ok(reduced.asset < end.asset);
    }
    const result = f.calculate('saving', { ...base, targetYear: 2027, savingGrowWithInflation: true,
        mortgage: { housePrice: 10000000, downPaymentRate: 1, rate: 0, years: 1, purchaseYear: 2026 } });
    assert.equal(result.requiredSaving, 11000000);
});
test('无效输入返回错误，不返回 NaN 成功结果', () => {
    for (const patch of [{ startAsset: NaN }, { startAsset: -1 }, { startYear: 2026.5 }, { targetYear: 2026 },
        { targetYear: 2200 }, { withdrawRate: 0 }, { annualExpense: 0 }, { rate: Infinity }, { inflationRate: -0.01 },
        { mortgage: { housePrice: 100000, purchaseYear: 2025 } },
        { mortgage: { housePrice: NaN, purchaseYear: 2027 } },
        { mortgage: { housePrice: 100000, purchaseYear: 2027, years: 0 } }]) {
        assert.ok(f.calculate('saving', { ...base, ...patch }).error, JSON.stringify(patch));
    }
    assert.ok(f.calculate('year', { ...base, annualSaving: NaN }).error);
});
test('100年边界和无法达标', () => {
    for (const monthlyCalc of [false, true]) {
        assert.equal(f.calculate('year', { ...base, annualSaving: 10000, monthlyCalc }).yearsNeeded, 100);
        assert.ok(f.calculate('year', { ...base, annualSaving: 0, monthlyCalc }).error);
    }
});

test('组合贷款分别计息，在各自期限结束后停止扣款', () => {
    const mortgage = { housePrice: 240000, downPaymentRate: 0, rate: 0, years: 2, purchaseYear: 2026,
        provident: { principal: 120000, rate: 0, years: 1 } };
    const m = f.calcMortgageInfo(mortgage);
    assert.equal(m.monthlyPayment, 15000);
    assert.equal(m.totalInterest, 0);
    assert.equal(m.totalPayment, 240000);
    assert.equal(f.getMortgagePaymentForMonth(2026, 12, mortgage), 15000);
    assert.equal(f.getMortgagePaymentForMonth(2027, 1, mortgage), 5000);
    assert.equal(f.getMortgagePaymentForMonth(2028, 1, mortgage), 0);
    assert.equal(f.getMortgagePaymentForYear(2026, mortgage), 180000);
    assert.equal(f.getMortgagePaymentForYear(2027, mortgage), 60000);
});
test('真实利率的组合月供等于两笔独立贷款月供之和', () => {
    const mortgage = { housePrice: 3000000, downPaymentRate: 0.3, rate: 0.035, years: 30, purchaseYear: 2028,
        provident: { principal: 1000000, rate: 0.026, years: 20 } };
    const commercial = f.calcMonthlyMortgage(1100000, 0.035, 30);
    const provident = f.calcMonthlyMortgage(1000000, 0.026, 20);
    close(f.calcMortgageInfo(mortgage).monthlyPayment, commercial + provident);
    close(f.getMortgagePaymentForMonth(2048, 1, mortgage), commercial);
    for (const monthlyCalc of [true, false]) {
        const r = f.calcRequiredSaving({ ...base, mortgage, monthlyCalc, rate: 0.07, inflationRate: 0.02, savingGrowWithInflation: true });
        assert.ok(r.trajectory.at(-1).asset >= r.targetAsset - 0.01);
    }
});
test('纯公积金、公积金额度校验及利率表', () => {
    const mortgage = { housePrice: 100000, downPaymentRate: 0, rate: 0.035, years: 30, purchaseYear: 2026,
        provident: { principal: 100000, rate: 0.026, years: 30 } };
    assert.equal(f.calcMortgageInfo(mortgage).loans.length, 1);
    assert.equal(f.calcMortgageInfo(mortgage).loans[0].kind, 'provident');
    assert.ok(f.calcRequiredSaving({ ...base, mortgage: { ...mortgage, provident: { ...mortgage.provident, principal: 100001 } } }).error);
    assert.ok(f.calcRequiredSaving({ ...base, mortgage: { ...mortgage, provident: { ...mortgage.provident, years: 31 } } }).error);
    assert.equal(f.getProvidentRate('first', 5), 0.021);
    assert.equal(f.getProvidentRate('first', 6), 0.026);
    assert.equal(f.getProvidentRate('second', 5), 0.02525);
    assert.equal(f.getProvidentRate('second', 6), 0.03075);
});
