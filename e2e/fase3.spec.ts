import { expect, test, type Page } from '@playwright/test';

const SENHA = 'E2eSenha123';

async function entrar(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username: 'admin.e2e', password: SENHA },
  });
  expect(res.ok()).toBe(true);
}

async function escolherCidade(page: Page, campo: string, termo: string, nome: RegExp) {
  await page.locator(`#${campo}`).click();
  await page
    .locator('[data-slot="popover-content"][data-state="open"]')
    .getByPlaceholder('Digite a cidade (ex.: feira ba)')
    .fill(termo);
  await page.getByRole('option', { name: nome }).first().click();
}

async function preencherCabecalho(page: Page) {
  await page.locator('#spot-cliente').click();
  await page.getByPlaceholder('Buscar cliente…').fill('fiat');
  await page.getByRole('option', { name: 'Fiat Automóveis S.A.' }).click();
  await escolherCidade(page, 'spot-origem', 'sao paulo sp', /^São Paulo\s*SP/);
  await escolherCidade(page, 'spot-destino', 'feira ba', /^Feira de Santana\s*BA/);
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('Spot rodoviário (app atual): 350 + pedágio 150, markup 70% → R$ 745,00; salvar e copiar', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/spot');
  await expect(page.getByText('Aguardando cálculo')).toBeVisible();
  await preencherCabecalho(page);
  await page.getByRole('radio', { name: 'Rodoviário' }).click();
  await page.locator('#spot-custo-RODOVIARIO').fill('350');
  await page.locator('#spot-pedagio').fill('150');
  await page.locator('#spot-markup').fill('70');
  await page.locator('#spot-markup').blur();

  await expect(page.getByTestId('spot-total')).toHaveText('R$ 745,00');
  await expect(page.getByTestId('spot-mkup')).toHaveText('R$ 245,00');
  await expect(page.getByTestId('spot-subtotal')).toHaveText('R$ 595,00');
  await expect(page.locator('#spot-custo-RODOVIARIO')).toHaveValue('350,00');
  await expect(page.getByText('Ad valorem de 0,15% sobre o valor da nota fiscal')).toBeVisible();

  await page.keyboard.press('Control+s');
  await expect(page.getByText(/Cotação JQ-\d{6} salva\./)).toBeVisible();
  await expect(page.getByText(/^Cotação JQ-\d{6}$/)).toBeVisible();

  await page.getByRole('button', { name: 'Copiar' }).click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  expect(texto).toContain('*COTAÇÃO DE FRETE JQ-');
  expect(texto).toContain('Destino: Feira de Santana, BA');
  expect(texto).toContain('*Valor do frete: R$ 745,00*');
  expect(texto).toContain('Validade: 30 dias');
  expect(texto).not.toContain('MKUP');
});

test('Spot aéreo (app atual): 300 + 600 + 150, pedágio 150, markup 70% → R$ 1.935,00 e PDF', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/spot');
  await expect(page.getByText('Aguardando cálculo')).toBeVisible();
  await preencherCabecalho(page);
  await page.getByRole('radio', { name: 'Aéreo' }).click();
  await page.locator('#spot-custo-COLETA').fill('300');
  await page.locator('#spot-custo-AEREO').fill('600');
  await page.locator('#spot-custo-ENTREGA').fill('150');
  await page.locator('#spot-pedagio').fill('150');
  await page.locator('#spot-markup').fill('70');
  await page.locator('#spot-markup').blur();
  await expect(page.getByTestId('spot-total')).toHaveText('R$ 1.935,00');
  await expect(page.getByTestId('spot-mkup')).toHaveText('R$ 735,00');
  await expect(page.getByTestId('spot-subtotal')).toHaveText('R$ 1.785,00');
  await expect(page.getByText('Ad valorem de 0,47% sobre o valor da nota fiscal')).toBeVisible();
  await page.getByRole('button', { name: 'Detalhar custos com MKUP' }).click();
  await expect(page.getByText('R$ 1.020,00')).toBeVisible();

  // PDF salva antes e abre em nova aba
  await page.getByRole('button', { name: /^PDF/ }).click();
  const [aba] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('menuitem', { name: /PDF para o cliente/ }).click(),
  ]);
  // No Chromium headless o PDF vira download; conferimos a resposta da aba.
  const resp = await aba.waitForResponse(/\/api\/quotes\/.+\/pdf\?visao=cliente/);
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toBe('application/pdf');
  await expect(page.getByText(/Cotação JQ-\d{6} salva\./)).toBeVisible();
  await aba.close();
});

test('rascunho é mantido ao recarregar; validação mostra erro no campo', async ({ page }) => {
  await entrar(page);
  await page.goto('/spot');
  await page.getByRole('radio', { name: 'Rodoviário' }).click();
  await page.locator('#spot-custo-RODOVIARIO').fill('1000');
  await page.locator('#spot-markup').fill('10');
  await page.locator('#spot-pedagio').fill('100');
  await page.locator('#spot-pedagio').blur();
  await expect(page.getByTestId('spot-total')).toHaveText('R$ 1.200,00');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('#spot-custo-RODOVIARIO')).toHaveValue('1.000,00');
  await expect(page.getByTestId('spot-total')).toHaveText('R$ 1.200,00');
  // Salvar sem cliente: erro do servidor no campo Cliente
  await page.getByRole('button', { name: 'Salvar cotação' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Selecione o cliente.' })).toBeVisible();
});

test('Cubagem rodoviário com 2 volumes (app atual) → taxado 203,00 kg', async ({ page }) => {
  await entrar(page);
  await page.goto('/cubagem');
  await page.getByRole('radio', { name: /Rodoviário/ }).click();
  await page.locator('#v1-c').fill('0,50');
  await page.locator('#v1-l').fill('0,80');
  await page.locator('#v1-a').fill('1,20');
  await page.locator('#v1-peso').fill('200');
  await page.getByRole('button', { name: 'Adicionar volume' }).click();
  await page.locator('#v2-c').fill('0,20');
  await page.locator('#v2-l').fill('0,40');
  await page.locator('#v2-a').fill('0,45');
  await page.locator('#v2-peso').fill('3');
  await page.locator('#v2-peso').blur();
  await expect(page.getByTestId('cubagem-bruto')).toHaveText('203,00 kg');
  await expect(page.getByTestId('cubagem-cubado')).toHaveText('154,80 kg');
  await expect(page.getByTestId('cubagem-taxado')).toHaveText('203,00 kg');
});

test('Cubagem aéreo com 3 volumes (app atual) → cubado 102,88 kg e taxado 207,00 kg', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/cubagem');
  await page.getByRole('radio', { name: /Aéreo/ }).click();
  for (const [n, c, l, a, p] of [
    [1, '0,50', '0,80', '1,20', '200'],
    [2, '0,20', '0,40', '0,45', '3'],
  ] as const) {
    if (n > 1) await page.getByRole('button', { name: 'Adicionar volume' }).click();
    await page.locator(`#v${n}-c`).fill(c);
    await page.locator(`#v${n}-l`).fill(l);
    await page.locator(`#v${n}-a`).fill(a);
    await page.locator(`#v${n}-peso`).fill(p);
  }
  // o 3º volume nasce duplicando o 2º e depois é ajustado
  await page.getByRole('button', { name: 'Duplicar volume 2' }).click();
  await page.locator('#v3-c').fill('0,50');
  await page.locator('#v3-l').fill('0,45');
  await page.locator('#v3-a').fill('0,45');
  await page.locator('#v3-peso').fill('4');
  await page.locator('#v3-peso').blur();
  await expect(page.getByTestId('volume-3')).toContainText('Volume 3');
  await expect(page.getByTestId('cubagem-cubado')).toHaveText('102,88 kg');
  await expect(page.getByTestId('cubagem-taxado')).toHaveText('207,00 kg');
  await expect(page.getByText('Cubado 16,88 kg')).toBeVisible();
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots fase 3 ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await entrar(page);
      const me = (await (await page.request.get('/api/auth/me')).json()).user;
      const fiat = (await (await page.request.get('/api/clients?search=fiat')).json()).clients[0];
      await page.addInitScript(
        ({ t, u, c }) => {
          localStorage.setItem('jat-theme', t);
          localStorage.setItem(
            `jat-rascunho-spot:${u}`,
            JSON.stringify({
              editandoId: null,
              form: {
                cliente: { id: c.id, name: c.name, email: c.email },
                origem: { nome: 'São Paulo', uf: 'SP' },
                destino: { nome: 'Feira de Santana', uf: 'BA' },
                modal: 'AEREO',
                custos: { RODOVIARIO: '', COLETA: '300,00', AEREO: '600,00', ENTREGA: '150,00' },
                pedagio: '150,00',
                markup: '70',
                adValorem: '',
                mercadoria: '50.000,00',
                obs: 'Coleta até as 17h.',
              },
            }),
          );
          localStorage.setItem(
            `jat-rascunho-cubagem:${u}`,
            JSON.stringify({
              modal: 'AEREO',
              linhas: [
                { id: 'a', c: '0,50', l: '0,80', a: '1,20', peso: '200', qtd: '1' },
                { id: 'b', c: '0,20', l: '0,40', a: '0,45', peso: '3', qtd: '1' },
                { id: 'c', c: '0,50', l: '0,45', a: '0,45', peso: '4', qtd: '2' },
              ],
            }),
          );
        },
        { t: tema, u: me.id, c: fiat },
      );
      await page.goto('/spot');
      await expect(page.getByRole('heading', { name: 'Frete Spot' })).toBeVisible();
      await page
        .getByRole('button', { name: 'Detalhar custos com MKUP' })
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `e2e/screenshots/fase3-spot-${tema}-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
      await page.goto('/cubagem');
      await expect(page.getByTestId('cubagem-taxado')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `e2e/screenshots/fase3-cubagem-${tema}-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
    });
  }
}
