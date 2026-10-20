const { chromium } = require(process.env.FLOW_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.FLOW_TEST_URL || 'http://127.0.0.1:4329/';

(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.FLOW_CHROME_PATH || undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Denver', serviceWorkers: 'block' });
        await context.route('**/*', route => {
            const url = route.request().url();
            if (new URL(url).pathname.endsWith('/js/cloud-config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'const flowCloudUrl="";const flowCloudKey="";' });
            return url.startsWith(base) ? route.continue() : route.abort();
        });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.stack));
        page.setDefaultTimeout(6000);
        // This UTC date is already Oct 21, but the user's local date is still Oct 20.
        await page.clock.install({ time: new Date('2026-10-21T05:30:00Z') });
        const go = file => page.goto(base + file, { waitUntil: 'domcontentloaded' });
        const totals = async (income, expenses, balance) => {
            assert.equal(await page.locator('#home-income').innerText(), income);
            assert.equal(await page.locator('#home-expenses').innerText(), expenses);
            assert.equal(await page.locator('#home-balance').innerText(), balance);
        };
        const add = async (name, type, category, amount) => {
            await go('add-transaction.html?month=2000-01&from=transactions');
            assert.equal(await page.locator('#transaction-date').inputValue(), '2026-10-20');
            await page.locator('#transaction-type').selectOption(type);
            await page.locator('#transaction-name').fill(name);
            await page.locator('#transaction-category').selectOption(category);
            await page.locator('#transaction-amount').fill(amount);
            await Promise.all([page.waitForURL('**/transactions.html?month=2026-10'), page.locator('#save-transaction-button').click()]);
            assert.ok((await page.locator('#transaction-history').innerText()).includes(name));
        };

        await go('index.html');
        await totals('$0.00', '$0.00', '$0.00');
        assert.match(await page.locator('.home-category-chart').innerText(), /No expenses recorded/);
        await add('Sample pay', 'Income', 'Salary', '1000');
        await add('Sample food', 'Expense', 'Food', '100');
        await add('Sample fuel', 'Expense', 'Transport', '50');
        await go('index.html');
        await totals('$1,000.00', '$150.00', '$850.00');
        assert.equal(await page.locator('#home-overview-title').innerText(), 'October 2026');
        assert.equal(await page.locator('.home-overview a').getAttribute('href'), 'transactions.html?month=2026-10');

        // Freshly delivered records update the open Home without a navigation.
        await page.evaluate(() => {
            const rows = loadTransactions();
            rows.push(
                { id: 'sample-refund', name: 'Sample return', amount: 25, type: 'Refund', category: 'Food', date: '2026-10-20' },
                { id: 'sample-transfer-out', name: 'Sample move', amount: -700, type: 'Transfer', category: 'Other', date: '2026-10-20' },
                { id: 'sample-transfer-in', name: 'Sample move', amount: 700, type: 'Transfer', category: 'Other', date: '2026-10-20' },
                { id: 'sample-pending', name: 'Sample hold', amount: -80, type: 'Expense', category: 'Shopping', date: '2026-10-20', status: 'pending' },
                { id: 'sample-prior', name: 'Earlier pay', amount: 500, type: 'Income', category: 'Salary', date: '2026-09-09' },
                { id: 'sample-prior-expense', name: 'Earlier food', amount: -20, type: 'Expense', category: 'Food', date: '2026-09-09' }
            );
            flowStorage.setItem('transactions', JSON.stringify(rows));
            document.dispatchEvent(new Event('flow-transaction-data-updated'));
        });
        await totals('$1,000.00', '$125.00', '$875.00');
        const categories = page.locator('.home-category-chart [role=listitem]');
        assert.equal(await categories.count(), 2);
        assert.match(await categories.nth(0).innerText(), /Food\s+\$75.00/);
        assert.match(await categories.nth(1).innerText(), /Transport\s+\$50.00/);

        const foodId = await page.evaluate(() => loadTransactions().find(t => t.name === 'Sample food').id);
        await go('add-transaction.html?edit=' + encodeURIComponent(foodId) + '&month=2026-10');
        assert.equal(await page.locator('#transaction-date').inputValue(), '2026-10-20');
        await page.locator('#transaction-amount').fill('80');
        await Promise.all([page.waitForURL('**/transactions.html?month=2026-10'), page.locator('#save-transaction-button').click()]);
        assert.equal(await page.locator('#history-expenses').innerText(), '$105.00');
        await go('index.html');
        await totals('$1,000.00', '$105.00', '$895.00');
        assert.match(await page.locator('.category-mini').first().innerText(), /Food\s+\$55.00/);

        await go('transactions.html?month=2026-10');
        page.once('dialog', dialog => dialog.accept());
        await Promise.all([page.waitForEvent('domcontentloaded'), page.getByRole('button', { name: 'Delete Sample fuel', exact: true }).click()]);
        assert.equal(await page.locator('#history-expenses').innerText(), '$55.00');
        await go('index.html');
        await totals('$1,000.00', '$55.00', '$945.00');
        assert.equal(await page.locator('.category-mini').count(), 1);

        await go('index.html?month=2026-09');
        await totals('$500.00', '$20.00', '$480.00');
        assert.equal(await page.locator('#home-overview-title').innerText(), 'September 2026');
        await go('add-transaction.html?edit=sample-prior&month=2000-01');
        assert.equal(await page.locator('#transaction-date').inputValue(), '2026-09-09');

        await go('index.html');
        // A month with more refunds than expenses still has a visible, signed chart value.
        await page.evaluate(() => {
            const rows = loadTransactions();
            rows.push({ id: 'sample-larger-refund', name: 'Another return', type: 'Refund', amount: 100, category: 'Food', date: '2026-10-20' });
            flowStorage.setItem('transactions', JSON.stringify(rows));
            document.dispatchEvent(new Event('flow-transaction-data-updated'));
        });
        await totals('$1,000.00', '-$45.00', '$1,045.00');
        assert.match(await page.locator('.category-mini.net-refund').innerText(), /-\$45.00/);
        for (const width of [1440, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 1100 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Home overflow at ' + width);
            assert.equal(await page.locator('.category-mini .progress-fill').evaluate(node => node.getBoundingClientRect().width > 0), true);
        }

        await go('demo/index.html');
        await page.waitForFunction(() => document.querySelector('.home-hero h3')?.textContent.includes('265.00'));
        const hero = await page.locator('.home-hero h3').innerText();
        await totals('$1,250.00', '$70.80', '$1,179.20');
        for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: 1100 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Demo overflow at ' + width);
            assert.equal(await page.locator('.home-hero h3').innerText(), hero);
            await page.screenshot({ path: '/private/tmp/flow-home-overview-' + width + '.png', fullPage: true, animations: 'disabled' });
        }
        assert.deepEqual(errors, []);
        console.log('PASS: local-today defaults, historical edit dates, add/edit/delete persistence, live Home totals, monthly charts, refunds/transfers/pending handling, historical links, unchanged demo payday estimate, and desktop/tablet/phone layouts.');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
