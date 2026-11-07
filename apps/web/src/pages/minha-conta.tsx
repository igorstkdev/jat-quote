import { toast } from 'sonner';
import { ChangePasswordForm } from '@/components/change-password-form';
import { ROTULO_PERFIL } from '@/components/layout/user-menu';
import { Page, PageHeader } from '@/components/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/auth';

export default function MinhaContaPage() {
  const { data: user } = useMe();
  if (!user) return null;
  return (
    <Page className="max-w-3xl">
      <PageHeader titulo="Minha conta" descricao="Seus dados de acesso." />
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>@{user.username}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Perfil</span>
              <span className="font-medium">{ROTULO_PERFIL[user.role]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pode editar tarifas</span>
              <span className="font-medium">
                {user.role === 'ADMIN' || user.canEditRates ? 'Sim' : 'Não'}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trocar senha</CardTitle>
            <CardDescription>As outras sessões abertas serão encerradas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm onSucesso={() => toast.success('Senha alterada com sucesso.')} />
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
