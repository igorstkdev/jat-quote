import { expect, test, type Page } from '@playwright/test';
import { SENHA_MESTRE_TESTE } from '../apps/api/test/licenca-teste';

const SENHA = 'E2eSenha123';
const RODAPE = 'JAT Quote © 2027 - Sistema de Cotações Logísticas | Desenvolvido por Igor Cruz';

async function entrar(page: Page, username = 'admin.e2e') {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username, password: SENHA },
  });
  expect(res.ok()).toBe(true);
}

/** Simula a API com o sistema bloqueado (o fluxo real é coberto nos testes da API). */
async function simularBloqueio(page: Page, motivo: 'NAO_ATIVADA' | 'VENCIDA') {
  let bloqueado = true;
  await page.route('**/api/licenca/estado', (r) =>
    r.fulfill({
      json: bloqueado
        ? { bloqueado: true, motivo, mensagem: 'Bloqueado.' }
        : { bloqueado: false, motivo: null, mensagem: null },
    }),
  );
  await page.route('**/api/licenca/ativar', async (r) => {
    const corpo = r.request().postDataJSON() as { senhaMestre: string };
    if (corpo.senhaMestre !== SENHA_MESTRE_TESTE) {
      return r.fulfill({
        status: 400,
        json: {
          status: 'erro',
          message: 'Senha mestre de ativação incorreta.',
          campo: 'senhaMestre',
        },
      });
    }
    bloqueado = false;
    return r.fulfill({
      json: { bloqueado: false, motivo: null, mensagem: null, vencimento: '2027-11-14' },
    });
  });
}

test('rodapé e logo com link para o site do Grupo JAT', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText(RODAPE)).toBeVisible();
  await entrar(page);
  await page.goto('/');
  await expect(page.getByText(RODAPE)).toBeVisible();
  const logo = page
    .getByLabel('Menu principal')
    .getByRole('link', { name: 'Grupo JAT: abrir o site em nova aba' });
  await expect(logo).toHaveAttribute('href', 'https://www.grupojat.com.br/');
  await expect(logo).toHaveAttribute('target', '_blank');
  await expect(logo).toHaveAttribute('rel', /noopener/);
});

test('Admin vê o plano em Configurações e renova com a senha mestre', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/configuracoes?aba=licenca');
  await expect(page.getByRole('tab', { name: 'Plano de vigência' })).toHaveAttribute(
    'data-state',
    'active',
  );
  const vence = page
    .locator('dd')
    .filter({ hasText: /\d{2}\/\d{2}\/\d{4}/ })
    .first();
  const antes = await vence.textContent();
  await expect(page.getByText('Ativo', { exact: true })).toBeVisible();

  await page.getByLabel('Senha mestre de ativação').fill('senha-errada');
  await page.getByRole('radio', { name: /Mensal/ }).click();
  await page.getByRole('button', { name: 'Renovar plano' }).click();
  await expect(page.getByText('Senha mestre de ativação incorreta.')).toBeVisible();

  await page.getByLabel('Senha mestre de ativação').fill(SENHA_MESTRE_TESTE);
  await page.getByRole('button', { name: 'Renovar plano' }).click();
  await expect(page.getByText(/Sistema ativo até/)).toBeVisible();
  await expect(vence).not.toHaveText(antes ?? '');
});

test('Operacional não vê a aba nem detalhes do plano', async ({ page }) => {
  await entrar(page, 'bruno.lima');
  const r = await page.request.get('/api/licenca/estado');
  expect(await r.json()).toEqual({ bloqueado: false, motivo: null, mensagem: null });
});

test('sistema bloqueado: só a tela de ativação; libera com a senha mestre', async ({ page }) => {
  await simularBloqueio(page, 'VENCIDA');
  await page.goto('/spot');
  await expect(page.getByRole('heading', { name: 'Plano de vigência vencido' })).toBeVisible();
  await expect(page.getByText(RODAPE)).toBeVisible();
  await expect(page.getByLabel('Menu principal')).toHaveCount(0);

  await page.getByLabel('Usuário do Admin').fill('admin.e2e');
  await page.getByLabel('Senha do Admin').fill(SENHA);
  await page.getByLabel('Senha mestre de ativação').fill(SENHA_MESTRE_TESTE);
  await page.getByRole('button', { name: 'Liberar sistema' }).click();
  await expect(page.getByText('Escolha o plano.')).toBeVisible();
  await page.getByRole('radio', { name: /1 ano/ }).click();
  await page.getByRole('button', { name: 'Liberar sistema' }).click();
  await expect(page.getByText('Sistema ativo até 14/11/2027.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plano de vigência vencido' })).toHaveCount(0);
});

test('aviso de vencimento aparece só para Admin', async ({ page }) => {
  await page.route('**/api/licenca/estado', (r) =>
    r.fulfill({
      json: {
        bloqueado: false,
        motivo: null,
        mensagem: null,
        plano: 'MENSAL',
        inicio: '2026-11-14',
        vencimento: '2026-12-14',
        diasRestantes: 7,
        aviso: true,
      },
    }),
  );
  await entrar(page);
  await page.goto('/');
  const aviso = page.getByRole('status').filter({ hasText: 'plano de vigência' });
  await expect(aviso).toContainText('vence em 7 dias');
  await aviso.getByRole('link', { name: 'Renovar' }).click();
  await expect(page).toHaveURL(/aba=licenca/);

  await page.context().clearCookies();
  await entrar(page, 'bruno.lima');
  await page.goto('/');
  await expect(page.getByText(RODAPE)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'plano de vigência' })).toHaveCount(0);
});

// ── Screenshots ──

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots v1 ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
      const foto = async (nome: string) => {
        await page.waitForTimeout(600);
        await page.screenshot({
          path: `e2e/screenshots/v1-${nome}-${tema}-${vp.width}x${vp.height}.png`,
          fullPage: true,
        });
      };
      await page.goto('/login');
      await expect(page.getByText(RODAPE)).toBeVisible();
      await foto('login');

      await entrar(page);
      await page.goto('/admin/configuracoes?aba=licenca');
      await expect(page.getByText('Plano atual')).toBeVisible();
      await foto('configuracoes-plano');

      await page.route('**/api/licenca/estado', (r) =>
        r.fulfill({
          json: {
            bloqueado: false,
            motivo: null,
            mensagem: null,
            plano: 'MENSAL',
            vencimento: '2026-12-14',
            diasRestantes: 7,
            aviso: true,
          },
        }),
      );
      await page.goto('/');
      await expect(page.getByText('vence em 7 dias')).toBeVisible();
      await foto('inicio-aviso');
      await page.unrouteAll();

      await simularBloqueio(page, 'NAO_ATIVADA');
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Ativação do sistema' })).toBeVisible();
      await foto('ativacao');
      await page.unrouteAll();
      await simularBloqueio(page, 'VENCIDA');
      await page.goto('/');
      await page.getByRole('button', { name: 'Liberar sistema' }).click();
      await expect(page.getByText('Escolha o plano.')).toBeVisible();
      await foto('bloqueado');
    });
  }
}
