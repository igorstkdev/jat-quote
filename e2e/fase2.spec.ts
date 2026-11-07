import { expect, test, type Page } from '@playwright/test';

const SENHA = 'E2eSenha123';

async function entrarPelaApi(page: Page, username: string, senha = SENHA) {
  const res = await page.request.post('/api/auth/login', {
    headers: { 'x-jat-requested': '1' },
    data: { username, password: senha },
  });
  expect(res.ok()).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test('sem login, qualquer tela leva ao login', async ({ page }) => {
  await page.goto('/clientes');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('login com senha errada mostra erro em português', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('admin.e2e');
  await page.getByLabel('Senha', { exact: true }).fill('errada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Usuário ou senha inválidos.');
});

test('Admin entra pelo formulário e volta para a tela que pediu', async ({ page }) => {
  await page.goto('/clientes');
  await page.getByLabel('Usuário').fill('ADMIN.E2E');
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usuários' })).toBeVisible();
});

test('primeiro acesso exige trocar a senha; Operacional não vê a administração', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill('oper.e2e');
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/trocar-senha$/);
  await page.getByLabel('Senha atual').fill(SENHA);
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha2026');
  await page.getByLabel('Confirme a nova senha').fill('NovaSenha2026');
  await page.getByRole('button', { name: 'Definir senha e entrar' }).click();
  await expect(page.getByRole('heading', { name: /Otávio/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
  // tentar abrir a área administrativa direto pela URL
  await page.goto('/admin/usuarios');
  await expect(page.getByText('Página não encontrada')).toBeVisible();
});

test('clientes: cadastrar, buscar e desativar com confirmação', async ({ page }) => {
  await entrarPelaApi(page, 'admin.e2e');
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Novo cliente' }).first().click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nome').fill('Stellantis Betim');
  await dialogo.getByLabel('CNPJ / CPF').fill('123');
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(dialogo.getByRole('alert')).toHaveText(
    'CNPJ deve ter 14 dígitos (ou CPF, 11 dígitos).',
  );
  await dialogo.getByLabel('CNPJ / CPF').fill('16.701.716/0001-56');
  await dialogo.getByRole('button', { name: 'Cadastrar' }).click();
  await expect(page.getByText('Cliente Stellantis Betim cadastrado.')).toBeVisible();

  await page.getByLabel('Buscar clientes').fill('stellantis');
  await expect(page.getByRole('row')).toHaveCount(2); // cabeçalho + 1
  await page.getByRole('button', { name: 'Ações de Stellantis Betim' }).click();
  await page.getByRole('menuitem', { name: 'Desativar' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'deixará de aparecer para novas cotações',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Desativar' }).click();
  await expect(page.getByText('Stellantis Betim desativado.')).toBeVisible();
  await expect(page.getByText('Nenhum cliente encontrado')).toBeVisible();
});

test('paleta de comandos (Ctrl+K) navega e executa ações', async ({ page }) => {
  await entrarPelaApi(page, 'admin.e2e');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Procure uma tela ou ação…').fill('auditoria');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/auditoria$/);
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Procure uma tela ou ação…').fill('novo usuário');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Novo usuário');
});

test('Admin cria usuário e vê a senha temporária uma vez', async ({ page }) => {
  await entrarPelaApi(page, 'admin.e2e');
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Novo usuário' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome').fill('Carla Mendes');
  await d.getByLabel('Usuário (login)').fill('carla.mendes');
  await d.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByRole('dialog')).toContainText('Senha temporária');
  await expect(page.getByTestId('senha-temporaria')).toHaveText(/^[A-Za-z0-9]{12}$/);
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('cell', { name: /Carla Mendes/ }).first()).toBeVisible();
  await expect(page.getByText('Aguardando 1º acesso')).toBeVisible();
});

test('sair encerra a sessão', async ({ page }) => {
  await entrarPelaApi(page, 'admin.e2e');
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu do usuário' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/clientes');
  await expect(page).toHaveURL(/\/login$/);
});

// ── Screenshots (claro/escuro, 1366×768 e 1920×1080) ──

const telas = [
  { nome: 'login', url: '/login', logado: false, espera: 'Entrar' },
  { nome: 'inicio', url: '/', logado: true, espera: /Ana/ },
  { nome: 'clientes', url: '/clientes', logado: true, espera: 'Clientes' },
  { nome: 'usuarios', url: '/admin/usuarios', logado: true, espera: 'Usuários' },
  { nome: 'configuracoes', url: '/admin/configuracoes', logado: true, espera: 'Configurações' },
  { nome: 'auditoria', url: '/admin/auditoria', logado: true, espera: 'Auditoria' },
] as const;

for (const tema of ['light', 'dark'] as const) {
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`screenshots ${tema} ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.addInitScript((t) => localStorage.setItem('jat-theme', t), tema);
      for (const t of telas) {
        if (t.logado) await entrarPelaApi(page, 'admin.e2e');
        else await page.context().clearCookies();
        await page.goto(t.url);
        await expect(page.getByRole('heading', { name: t.espera }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(350);
        await page.screenshot({
          path: `e2e/screenshots/fase2-${t.nome}-${tema}-${vp.width}x${vp.height}.png`,
        });
      }
    });
  }
}
