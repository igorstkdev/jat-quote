import { expect, test, type Page } from '@playwright/test';

const RODAPE = 'Quote © 2027 - Sistema de Cotações Logísticas | Desenvolvido por Igor Cruz';

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Preencher acesso' }).click();
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/Boa (manhã|tarde|noite)/)).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('login da demo: acesso pronto, só a marca Quote, sem JAT', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('Acesso de demonstração')).toBeVisible();
  await expect(page.getByText('Ambiente de demonstração · dados fictícios')).toBeVisible();
  await expect(page.getByAltText('Grupo JAT')).toHaveCount(0);
  await expect(page.getByText(RODAPE, { exact: true })).toBeVisible();
  await entrar(page);
  await expect(page.getByRole('note')).toContainText('Ambiente de demonstração');
  await expect(page.getByRole('link', { name: /Grupo JAT/ })).toHaveCount(0);
  await expect(page.getByAltText(/Quote/).first()).toBeVisible();
  await expect(page).toHaveTitle(/· Quote$/);
});

test('dados fictícios: dashboard e relatório cheios, sem bloqueio de licença', async ({ page }) => {
  await entrar(page);
  await page.goto('/dashboard');
  await expect(page.getByTestId('grafico-mensal')).toBeVisible();
  await page.goto('/relatorios');
  await expect(page.getByText('Transportadora Exemplo')).toHaveCount(0); // empresa não é cliente
  await expect(page.getByRole('table', { name: 'Cotações Spot' })).toContainText(/JQ-\d{6}/);
  await page.goto('/admin/configuracoes?aba=licenca');
  await expect(page.getByRole('tab', { name: 'Demonstração' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restaurar demo' })).toBeVisible();
});

test('Restaurar demo: confirma, recria os dados e volta para o login', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/configuracoes?aba=licenca');
  await page.getByRole('button', { name: 'Restaurar demo' }).click();
  await page.getByLabel(/Digite RESTAURAR DEMO/).fill('RESTAURAR DEMO');
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar demo' }).click();
  await expect(page.getByText(/Demonstração restaurada: \d+ cotações fictícias/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots demo ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
      const foto = async (nome: string) => {
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `e2e/screenshots/demo-${nome}-${tema}-${vp.width}x${vp.height}.png`,
          fullPage: true,
        });
      };
      await page.goto('/login');
      await foto('login');
      await entrar(page);
      await foto('inicio');
      await page.goto('/dashboard');
      await expect(page.getByTestId('grafico-mensal')).toBeVisible();
      await foto('dashboard');
      await page.goto('/admin/configuracoes?aba=licenca');
      await foto('configuracoes');
    });
  }
}
