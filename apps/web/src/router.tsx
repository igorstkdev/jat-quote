import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { TODOS_ITENS } from '@/components/layout/nav';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { ehAdmin, useMe } from '@/lib/auth';

// Cada tela é carregada só quando aberta (code splitting).
const LoginPage = lazy(() => import('@/pages/login'));
const TrocarSenhaPage = lazy(() => import('@/pages/trocar-senha'));
const InicioPage = lazy(() => import('@/pages/inicio'));
const EmBrevePage = lazy(() => import('@/pages/em-breve'));
const ClientesPage = lazy(() => import('@/pages/clientes'));
const SpotPage = lazy(() => import('@/pages/spot'));
const CubagemPage = lazy(() => import('@/pages/cubagem'));
const TarifasAereasPage = lazy(() => import('@/pages/tarifas-aereas'));
const FtlPage = lazy(() => import('@/pages/ftl'));
const RelatoriosPage = lazy(() => import('@/pages/relatorios'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const MinhaContaPage = lazy(() => import('@/pages/minha-conta'));
const UsuariosPage = lazy(() => import('@/pages/admin/usuarios'));
const ConfiguracoesPage = lazy(() => import('@/pages/admin/configuracoes'));
const AuditoriaPage = lazy(() => import('@/pages/admin/auditoria'));
const NaoEncontradaPage = lazy(() => import('@/pages/nao-encontrada'));

function TelaCarregando() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="animate-pulse">
        <Logo link={false} />
      </div>
    </div>
  );
}

function ErroCarregar({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo link={false} />
      <p role="alert" className="text-destructive max-w-sm text-sm">
        {mensagem}
      </p>
      <Button variant="outline" onClick={onTentar}>
        Tentar novamente
      </Button>
    </div>
  );
}

/** Exige login (e troca de senha concluída). */
function Protegido({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <TelaCarregando />;
  if (me.isError)
    return <ErroCarregar mensagem={me.error.message} onTentar={() => void me.refetch()} />;
  if (!me.data)
    return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />;
  if (me.data.mustChangePassword) return <Navigate to="/trocar-senha" replace />;
  return <>{children}</>;
}

/** Área administrativa: a API também recusa (403); aqui só evita mostrar a tela. */
function SomenteAdmin() {
  const { data } = useMe();
  if (!ehAdmin(data)) return <NaoEncontradaPage />;
  return <Outlet />;
}

const emBreve = TODOS_ITENS.filter((i) => i.emBreve).map((i) => ({
  path: i.to.slice(1),
  element: <EmBrevePage />,
}));

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/trocar-senha', element: <TrocarSenhaPage /> },
  {
    path: '/',
    element: (
      <Protegido>
        <AppLayout />
      </Protegido>
    ),
    children: [
      { index: true, element: <InicioPage /> },
      ...emBreve,
      { path: 'spot', element: <SpotPage /> },
      { path: 'cubagem', element: <CubagemPage /> },
      { path: 'tarifas-aereas', element: <TarifasAereasPage /> },
      { path: 'ftl', element: <FtlPage /> },
      { path: 'ftl/:aba', element: <FtlPage /> },
      { path: 'relatorios', element: <RelatoriosPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'minha-conta', element: <MinhaContaPage /> },
      {
        path: 'admin',
        element: <SomenteAdmin />,
        children: [
          { path: 'usuarios', element: <UsuariosPage /> },
          { path: 'configuracoes', element: <ConfiguracoesPage /> },
          { path: 'auditoria', element: <AuditoriaPage /> },
        ],
      },
      { path: '*', element: <NaoEncontradaPage /> },
    ],
  },
]);
