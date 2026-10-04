const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function page(t, reduced = false) {
    const dom = new JSDOM(fs.readFileSync(require.resolve('../index.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://firemini.test/' });
    t.after(() => dom.window.close());
    const w = dom.window;
    const motions = [], scrolls = [];
    w.matchMedia = () => ({ matches: reduced });
    w.HTMLElement.prototype.animate = function(frames, options) { motions.push({ frames, options, element: this }); return { cancel() {} }; };
    w.scrollTo = options => scrolls.push(options);
    w.HTMLElement.prototype.scrollIntoView = () => {};
    for (const name of ['fire-calculator.js', 'fire-plan.js', 'app.js']) w.eval(fs.readFileSync(require.resolve('../' + name), 'utf8'));
    const q = selector => w.document.querySelector(selector);
    function fill(key, value) {
        const el = q(`[data-key="${key}"]`);
        assert.ok(el, key);
        if (el.type === 'checkbox') { el.checked = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); }
        else { el.value = String(value); el.dispatchEvent(new w.Event(el.type === 'number' ? 'input' : 'change', { bubbles: true })); }
    }
    function choose(key, value) {
        const el = q(`[data-key="${key}"][value="${value}"]`); assert.ok(el, `${key} ${value}`); el.click();
    }
    const submit = () => q('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    const click = selector => { assert.ok(q(selector), selector); q(selector).click(); };
    return { w, q, fill, choose, submit, click, motions, scrolls, text: () => w.document.body.textContent };
}

test('默认零资金和 LPR；输入校验；计算后修改显示旧结果提示', t => {
    const p = page(t);
    assert.equal(p.q('#startAsset').value, '0');
    p.submit();
    assert.match(p.text(), /请选择想计算的内容/);
    p.choose('mode', 'saving');
    p.fill('expense', 40000); p.fill('expenseUnit', 'year'); // 切换单位自动换算
    p.fill('expense', 40000);
    p.fill('targetYear', Number(p.q('#startYear').value) + 10);
    p.fill('withdrawRate', 4); p.fill('rate', 0); p.fill('inflationRate', 0);
    p.submit();
    assert.match(p.q('#result-content').textContent, /8,333.34/);
    assert.ok(p.q('svg.chart'));
    p.fill('startAsset', 10);
    assert.match(p.q('#calculation-status').textContent, /参数已修改/);
    p.fill('startYear', 2026.5); p.submit();
    assert.match(p.q('#error-startYear').textContent, /整数/);
});

test('引导完成预测时间，跳过贷款页，按顺序经过通胀与储蓄增长', t => {
    const p = page(t);
    p.click('#guideToggle');
    assert.match(p.text(), /Financial Independence, Retire Early/);
    assert.equal(p.q('details'), null);
    p.click('[data-action="start"]'); p.choose('mode', 'year'); p.submit();
    assert.ok(p.q('#startYear')); p.fill('startYear', 2026); p.submit();
    assert.ok(p.q('#startAsset')); p.submit();
    p.fill('expense', 2000); p.submit();
    p.fill('saving', 100000); p.submit();
    assert.ok(p.q('#house')); p.submit();
    assert.ok(p.q('#inflationRate')); p.fill('inflationRate', 0); p.submit();
    assert.ok(p.q('[data-key="grow"]')); p.choose('grow', true); p.submit();
    p.fill('rate', 0); p.submit(); p.fill('withdrawRate', 4); p.submit();
    assert.match(p.text(), /确认你的计划/);
    p.submit();
    assert.ok(p.q('#plan-form'));
    assert.match(p.q('#result-content').textContent, /2026/);
    assert.match(p.q('#result-content').textContent, /7 月初/);
    assert.equal(p.q('#expense').value, '2000');
    assert.equal(p.q('#saving').value, '100000');
});

test('组合贷款自动利率、全公积金、独立期限及手动覆盖', t => {
    const p = page(t);
    p.fill('house', true); p.fill('housePrice', 3000000);
    assert.equal(p.q('#mortgageRate').value, '3.5');
    p.fill('provident', true); p.fill('providentAmount', 1000000);
    assert.match(p.q('#loan-estimate').textContent, /公积金/);
    p.choose('homeType', 'second');
    assert.equal(Number(p.q('#providentRate').value), 3.075);
    p.fill('mortgageYears', 5);
    assert.equal(Number(p.q('#providentRate').value), 2.525);
    p.fill('providentRate', 2.7); p.fill('mortgageYears', 30);
    assert.equal(Number(p.q('#providentRate').value), 2.7);
    p.click('[data-action="auto-provident"]');
    assert.equal(Number(p.q('#providentRate').value), 3.075);
    p.fill('separateYears', true); p.fill('providentYears', 5);
    assert.equal(Number(p.q('#providentRate').value), 2.525);
    p.click('[data-action="all-provident"]');
    assert.equal(Number(p.q('#providentAmount').value), 2100000);
    p.fill('fullCash', true); assert.equal(p.q('#mortgageRate'), null);
    p.fill('fullCash', false); assert.equal(Number(p.q('#providentAmount').value), 2100000);
});

test('引导中切换完整表单，月年单位换算及分支切换保留答案', t => {
    const p = page(t);
    p.choose('mode', 'year'); p.fill('expense', 6000); p.fill('saving', 8000);
    p.fill('expenseUnit', 'year'); assert.equal(Number(p.q('#expense').value), 72000);
    p.fill('expenseUnit', 'month'); assert.equal(Number(p.q('#expense').value), 6000);
    p.click('#guideToggle'); p.click('[data-action="start"]'); p.submit();
    p.click('#guideToggle');
    assert.equal(Number(p.q('#saving').value), 8000);
    p.choose('mode', 'saving'); assert.equal(p.q('#saving'), null);
    p.choose('mode', 'year'); assert.equal(Number(p.q('#saving').value), 8000);
});

test('全款引导跳过贷款，核对修改后校验公积金额度', t => {
    const p = page(t);
    p.choose('mode', 'saving'); p.fill('expense', 6000);
    p.fill('targetYear', Number(p.q('#startYear').value) + 10);
    p.fill('house', true); p.fill('housePrice', 1000000); p.fill('fullCash', true);
    p.click('#guideToggle'); p.click('[data-action="start"]');
    for (let i = 0; i < 6; i++) p.submit();
    assert.ok(p.q('#inflationRate'));
    for (let i = 0; i < 4; i++) p.submit();
    assert.match(p.text(), /确认你的计划/);
    p.click('[data-edit="house"]'); p.fill('fullCash', false); p.submit();
    p.submit(); // 核对时发现新启用的贷款缺少参数才跳回；纯商贷默认有效
    assert.ok(p.q('#plan-form'));
    p.fill('provident', true); p.fill('providentAmount', 900000); p.submit();
    assert.match(p.q('#error-providentAmount').textContent, /公积金贷款金额/);
});

test('收益配置分档、通胀比较和无需新增储蓄', t => {
    const p = page(t);
    p.fill('rate', 1); assert.match(p.q('#real-return').textContent, /购买力会下降/);
    p.fill('rate', 2); assert.match(p.q('#real-return').textContent, /基本不变/);
    p.fill('rate', 5); assert.match(p.q('#real-return').textContent, /2.94/);
    assert.match(p.q('#return-band').textContent, /40%～70%/);
    p.fill('rate', 11); assert.match(p.q('#return-warning').textContent, /较低收益率/);
    p.choose('mode', 'saving'); p.fill('expense', 6000); p.fill('startAsset', 10000000);
    p.fill('targetYear', Number(p.q('#startYear').value) + 10); p.submit();
    assert.match(p.q('#result-content').textContent, /无需新增储蓄/);
    const slider = p.q('#trajectory-period'); slider.value = 0; slider.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    assert.match(p.q('#chart-readout').textContent, /10,000,000/);
});

test('隐藏设置错误自动展开，通胀修改同步到增长选项', t => {
    const p = page(t);
    p.choose('mode', 'year'); p.fill('expense', 6000); p.fill('saving', 10000);
    p.fill('inflationRate', 3);
    assert.match(p.q('[data-key="grow"][value="true"]').closest('label').textContent, /每年增加 3%/);
    p.fill('house', true); p.fill('housePrice', 1000000); p.fill('provident', true); p.fill('providentAmount', 500000);
    p.fill('providentRate', -1); p.submit();
    assert.equal(p.q('#providentRate').closest('details').open, true);
    assert.equal(p.w.document.activeElement.id, 'providentRate');
});


test('引导前进与返回的方向相反，输入不重复触发导航动效', t => {
    const p = page(t);
    p.click('#guideToggle'); p.click('[data-action="start"]');
    p.choose('mode', 'year'); p.submit();
    const enter = p.motions.at(-1);
    assert.equal(enter.frames[0].transform, 'translateX(14px)');
    const before = p.motions.length;
    p.fill('startYear', 2027);
    assert.equal(p.motions.length, before);
    p.click('[data-action="back"]');
    assert.equal(p.motions.at(-1).frames[0].transform, 'translateX(-14px)');
});

test('减少动态效果保留短淡入，不移动内容或平滑滚屏', t => {
    const p = page(t, true);
    p.click('#guideToggle'); p.click('[data-action="start"]');
    p.choose('mode', 'year'); p.submit();
    assert.ok(p.motions.length > 0);
    assert.ok(p.motions.every(m => m.options.duration === 80 && m.frames.every(f => !('transform' in f) && !('clipPath' in f))));
    assert.ok(p.scrolls.every(s => s.behavior !== 'smooth'));
});

test('图表时间滑块同步指示线与准确金额', t => {
    const p = page(t);
    p.choose('mode', 'year'); p.fill('expense', 6000); p.fill('saving', 10000); p.submit();
    const slider = p.q('#trajectory-period');
    slider.value = '0'; slider.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    assert.equal(Number(p.q('#chart-point').getAttribute('cx')), 64);
    assert.match(p.q('#chart-readout').textContent, /资产 0 元/);
    slider.value = slider.max; slider.dispatchEvent(new p.w.Event('input', { bubbles: true }));
    assert.equal(Number(p.q('#chart-cursor').getAttribute('x1')), 504);
    assert.equal(Number(p.q('#chart-point').getAttribute('cx')), 504);
});

test('月供预估不依赖购房年份，并明确指出缺失或超限参数', t => {
    const p = page(t);
    p.fill('house', true);
    assert.match(p.q('#loan-estimate').textContent, /请填写房屋总价/);
    p.fill('housePrice', 1000000);
    p.fill('purchaseYear', 2000);
    assert.match(p.q('#loan-estimate').textContent, /预计每月还款 3,143.31 元/);
    assert.match(p.q('#loan-estimate').textContent, /购房年份/);
    p.fill('provident', true);
    assert.match(p.q('#loan-estimate').textContent, /请填写公积金贷款金额/);
    p.fill('providentAmount', 800000);
    assert.match(p.q('#loan-estimate').textContent, /公积金贷款金额须为/);
    p.fill('providentAmount', 700000);
    p.fill('mortgageRate', '');
    assert.match(p.q('#loan-estimate').textContent, /预计每月还款/);
    p.fill('purchaseYear', Number(p.q('#startYear').value) + 2);
    p.choose('mode', 'year'); p.fill('expense', 6000); p.fill('saving', 10000);
    p.submit();
    assert.ok(p.q('.result-primary'));
    assert.equal(p.q('[aria-invalid="true"]'), null);
});

for (const mode of ['year', 'saving']) test(`不支持 Array.at 时核对页返回和计算正常：${mode}`, t => {
    const p = page(t);
    p.w.eval('Array.prototype.at = undefined');
    const errors = [];
    p.w.addEventListener('error', e => errors.push(e.message));
    p.choose('mode', mode); p.fill('expense', 6000);
    if (mode === 'year') p.fill('saving', 10000);
    else p.fill('targetYear', Number(p.q('#startYear').value) + 20);
    p.click('#guideToggle'); p.click('[data-action="start"]');
    for (let i = 0; i < 10; i++) p.click('button[type="submit"]');
    assert.equal(p.q('h1').textContent, '确认你的计划');
    p.click('[data-action="back"]');
    assert.ok(p.q('#withdrawRate'));
    p.click('button[type="submit"]');
    assert.equal(p.q('h1').textContent, '确认你的计划');
    p.click('button[type="submit"]');
    assert.ok(p.q('.result-primary'));
    p.click('#guideToggle');
    assert.ok(p.q('[data-action="start"]'));
    p.click('#guideToggle');
    assert.ok(p.q('#plan-form'));
    assert.ok(p.q('.result-primary'));
    assert.match(p.q('#guideToggle').textContent, /引导填写/);
    assert.deepEqual(errors, []);
});

for (const loan of ['commercial', 'provident', 'mixed', 'cash']) test(`反推月储蓄并购房，核对计算及页面切换：${loan}`, t => {
    const p = page(t), errors = [];
    p.w.addEventListener('error', e => errors.push(e.message));
    p.choose('mode', 'saving'); p.fill('expense', 6000);
    p.fill('targetYear', loan === 'commercial' ? 2047 : Number(p.q('#startYear').value) + 20);
    p.fill('house', true); p.fill('housePrice', loan === 'commercial' ? 5000000 : 1000000);
    if (loan === 'cash') p.fill('fullCash', true);
    if (loan === 'mixed' || loan === 'provident') {
        p.fill('provident', true);
        p.fill('providentAmount', loan === 'mixed' ? 400000 : 700000);
    }
    p.click('#guideToggle'); p.click('[data-action="start"]');
    for (let i = 0; i < (loan === 'cash' ? 10 : 11); i++) p.click('button[type="submit"]');
    assert.equal(p.q('h1').textContent, '确认你的计划');
    p.click('button[type="submit"]');
    assert.match(p.q('.result-primary').textContent, /元／月/);
    assert.ok(p.q('.chart'));
    p.click('#guideToggle'); p.click('#guideToggle');
    assert.ok(p.q('#plan-form'));
    assert.ok(p.q('.result-primary'));
    assert.deepEqual(errors, []);
});

test('资源引用携带当前内容指纹，避免读取旧缓存', () => {
    const crypto = require('node:crypto');
    const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
    for (const file of ['app.js', 'fire-plan.js', 'fire-calculator.js', 'styles.css']) {
        const hash = crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../' + file))).digest('hex').slice(0, 12);
        assert.ok(html.includes(`${file}?v=${hash}`), `${file} 修改后须运行 npm run assets`);
    }
});

test('旧计算引擎混入时明确提示更新，不继续计算', t => {
    const p = page(t);
    delete p.w.FireCalculator.API_VERSION;
    p.w.eval(fs.readFileSync(require.resolve('../app.js'), 'utf8'));
    assert.match(p.q('[role="alert"]').textContent, /页面需要更新/);
    assert.ok(p.q('#reload-page'));
    assert.equal(p.q('#guideToggle').hidden, true);
    assert.equal(p.q('form'), null);
});
