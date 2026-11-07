import { expect, test } from '@playwright/test';

const viewports = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

test('página chama a API, que lê o banco (ponta a ponta)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Todos os serviços operacionais')).toBeVisible();
  await expect(page.getByTestId('status-Banco de dados')).toContainText(/PostgreSQL \d+/);
  await expect(page.getByTestId('status-Núcleo de cálculo')).toContainText('R$ 1.234,57');
});

test('rotas desconhecidas do site devolvem a aplicação (SPA)', async ({ page }) => {
  await page.goto('/qualquer/rota');
  await expect(page.getByRole('heading', { name: 'Status do sistema' })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  for (const vp of viewports) {
    test(`screenshot ${theme} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), theme);
      await page.goto('/');
      await expect(page.getByText('Todos os serviços operacionais')).toBeVisible();
      await page.waitForTimeout(400); // fim da animação de entrada
      await page.screenshot({
        path: `e2e/screenshots/fase0-${theme}-${vp.width}x${vp.height}.png`,
        fullPage: true,
      });
    });
  }
}
