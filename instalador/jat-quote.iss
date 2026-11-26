; JAT Quote — instalador gráfico (Inno Setup 6).
; Gerado por scripts\gerar-instalador.ps1, que monta instalador\pacote\app e chama:
;   ISCC.exe /DAppVersion=<versão> instalador\jat-quote.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

; Edição de DEMONSTRAÇÃO (25/11/2026): ISCC /DDemo ... gera o Quote-Demo-Setup, que instala ao lado
; do sistema real sem conflito (outra pasta, porta, serviço e tarefa), com dados fictícios.
#ifdef Demo
  #define Nome "Quote Demo"
  #define IdApp "{{3C8E9A71-5B2D-4F60-A1C4-7D9E2B6F0A13}"
  #define Editora "Quote"
  #define Comentario "Demonstração do Quote (dados fictícios)"
  #define Arquivo "Quote-Demo-Setup-"
  #define PortaPadrao "3334"
#else
  #define Nome "JAT Quote"
  #define IdApp "{{6F2C8B1E-4D7A-4C3B-9E21-5A1F0C7D3B42}"
  #define Editora "JAT Transportes e Logística"
  #define Comentario "Cotação de Fretes (uso interno)"
  #define Arquivo "JAT-Quote-Setup-"
  #define PortaPadrao "3333"
#endif

[Setup]
AppId={#IdApp}
AppName={#Nome}
AppVersion={#AppVersion}
AppVerName={#Nome} {#AppVersion}
AppPublisher={#Editora}
AppComments={#Comentario}
DefaultDirName={sd}\{#Nome}
DisableProgramGroupPage=yes
DisableDirPage=auto
UsePreviousAppDir=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
OutputDir=saida
OutputBaseFilename={#Arquivo}{#AppVersion}
; "max" com o compressor em processo separado (64 bits): "ultra64" estoura a memória do compilador.
Compression=lzma2/max
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=2
CloseApplications=no
UninstallDisplayName={#Nome}
UninstallDisplayIcon={app}\jat-quote.ico
SetupIconFile=jat-quote.ico
SetupLogging=yes

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
#ifdef Demo
ptbr.WelcomeLabel2=Este assistente vai instalar o [name/ver]: uma demonstração do Quote com dados 100% fictícios, para apresentar o produto.%n%nEla fica separada do sistema real (outra pasta, porta e banco de dados) e pode ser instalada no mesmo computador.%n%nNão é necessário internet nem instalar mais nada.
#else
ptbr.WelcomeLabel2=Este assistente vai instalar o [name/ver] neste computador, que passará a ser o servidor do sistema.%n%nTudo o que é preciso vai junto (banco de dados PostgreSQL, Node.js e o gerador de PDF); não é necessário internet nem instalar mais nada.%n%nOs operadores acessam pelo navegador, de qualquer máquina da rede.
#endif
ptbr.FinishedHeadingLabel=Instalação concluída

[Files]
Source: "pacote\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "jat-quote.ico"; DestDir: "{app}"; Flags: ignoreversion
#ifdef Demo
Source: "edicao-demo.txt"; DestDir: "{app}"; Flags: ignoreversion
#endif

[INI]
Filename: "{app}\{#Nome}.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:ValorPorta}"
Filename: "{app}\{#Nome}.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\jat-quote.ico"
Filename: "{app}\{#Nome}.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"

[Icons]
Name: "{autoprograms}\{#Nome}"; Filename: "{app}\{#Nome}.url"; IconFilename: "{app}\jat-quote.ico"; Comment: "Abrir o {#Nome} no navegador"
Name: "{autodesktop}\{#Nome}"; Filename: "{app}\{#Nome}.url"; IconFilename: "{app}\jat-quote.ico"; Tasks: atalhodesktop

[Tasks]
Name: "atalhodesktop"; Description: "Criar atalho na Área de Trabalho"

[Run]
Filename: "http://localhost:{code:ValorPorta}"; Description: "Abrir o {#Nome} no navegador"; Flags: postinstall shellexec nowait skipifsilent; Check: InstalacaoOk

[UninstallDelete]
Type: files; Name: "{app}\{#Nome}.url"

[Code]
const
  ChaveDados = 'JATQuote';

var
  PaginaAcesso: TInputQueryWizardPage;
  PaginaPastaBackup: TInputDirWizardPage;
  PaginaBackup: TInputQueryWizardPage;
  PaginaRede: TInputOptionWizardPage;
  MemoFinal: TNewMemo;
  Falhou: Boolean;
  MensagemFalha: String;
  AdminCriado: Boolean;
  AdminLogin, AdminSenha: String;
  RemoverDados: Boolean;

{ ───── Utilidades ───── }

function Atualizacao: Boolean;
begin
  Result := FileExists(AddBackslash(WizardDirValue) + '.env');
end;

function ValorPorta(Param: String): String;
begin
  if PaginaAcesso <> nil then
    Result := Trim(PaginaAcesso.Values[0])
  else
    Result := GetPreviousData('Porta', '{#PortaPadrao}');
  if Result = '' then Result := '{#PortaPadrao}';
end;

{ Login do administrador: na demonstração é sempre o visitante (sem pergunta). }
function LoginAdmin: String;
begin
#ifdef Demo
  Result := 'visitante';
#else
  Result := PaginaAcesso.Values[1];
#endif
end;

function InstalacaoOk: Boolean;
begin
  Result := not Falhou;
end;

function SoDigitos(S: String): Boolean;
var I: Integer;
begin
  Result := Length(S) > 0;
  for I := 1 to Length(S) do
    if (S[I] < '0') or (S[I] > '9') then Result := False;
end;

function LoginValido(S: String): Boolean;
var I: Integer; C: Char;
begin
  Result := (Length(S) >= 3) and (Length(S) <= 40);
  for I := 1 to Length(S) do
  begin
    C := S[I];
    if not (((C >= 'a') and (C <= 'z')) or ((C >= '0') and (C <= '9')) or (C = '.') or (C = '-') or (C = '_')) then
      Result := False;
  end;
end;

function HoraValida(S: String): Boolean;
var H, M: Integer;
begin
  Result := (Length(S) = 5) and (S[3] = ':') and SoDigitos(Copy(S, 1, 2)) and SoDigitos(Copy(S, 4, 2));
  if Result then
  begin
    H := StrToInt(Copy(S, 1, 2));
    M := StrToInt(Copy(S, 4, 2));
    Result := (H <= 23) and (M <= 59);
  end;
end;

function PowerShell: String;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

{ Porta livre nesta máquina? (tenta abrir e fechar um listener) }
function PortaLivre(Porta: String): Boolean;
var Codigo: Integer;
begin
  { Confere quem já escuta na porta (qualquer endereço) e depois tenta abrir: só abrir em 0.0.0.0
    passa mesmo com outro programa escutando em 127.0.0.1 (25/11/2026). }
  Result := Exec(PowerShell, '-NoProfile -NonInteractive -Command "if (Get-NetTCPConnection -State Listen -LocalPort ' + Porta + ' -ErrorAction SilentlyContinue) { exit 1 }; try { $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, ' + Porta + '); $l.Start(); $l.Stop(); exit 0 } catch { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0);
end;

{ ───── Páginas ───── }

procedure InitializeWizard;
begin
#ifdef Demo
  PaginaAcesso := CreateInputQueryPage(wpSelectDir,
    'Acesso à demonstração', 'Porta de acesso do {#Nome}.',
    'A demonstração abre pelo navegador em http://<este computador>:<porta>. ' +
    'Use uma porta diferente da do sistema real (que normalmente é a 3333).');
  PaginaAcesso.Add('Porta de acesso (1024 a 65535):', False);
  PaginaAcesso.Values[0] := GetPreviousData('Porta', '{#PortaPadrao}');
#else
  PaginaAcesso := CreateInputQueryPage(wpSelectDir,
    'Acesso ao sistema', 'Porta de acesso e administrador do JAT Quote.',
    'Os operadores vão acessar pelo navegador em http://<este computador>:<porta>. ' +
    'O administrador inicial recebe uma senha temporária no fim da instalação.');
  PaginaAcesso.Add('Porta de acesso (1024 a 65535):', False);
  PaginaAcesso.Add('Login do administrador (letras minúsculas, números, ponto, hífen):', False);
  PaginaAcesso.Values[0] := GetPreviousData('Porta', '{#PortaPadrao}');
  PaginaAcesso.Values[1] := GetPreviousData('Admin', 'admin');
#endif

  PaginaPastaBackup := CreateInputDirPage(PaginaAcesso.ID,
    'Backup do banco de dados', 'Onde guardar as cópias de segurança.',
    'O backup é automático, todo dia. Recomendado: uma pasta em outro disco ou na rede.',
    False, '');
  PaginaPastaBackup.Add('Pasta dos backups:');
  PaginaPastaBackup.Values[0] := GetPreviousData('PastaBackup', '');

  PaginaBackup := CreateInputQueryPage(PaginaPastaBackup.ID,
    'Backup do banco de dados', 'Horário e quantidade de cópias.',
    'As cópias mais antigas são apagadas automaticamente.');
  PaginaBackup.Add('Horário do backup diário (hh:mm):', False);
  PaginaBackup.Add('Quantas cópias guardar:', False);
  PaginaBackup.Values[0] := GetPreviousData('HoraBackup', '23:00');
  PaginaBackup.Values[1] := GetPreviousData('Copias', '30');

  PaginaRede := CreateInputOptionPage(PaginaBackup.ID,
    'Rede', 'Acesso pelas outras máquinas.',
    'O Firewall do Windows será liberado na porta escolhida, só para a rede local. ' +
    'Se a rede deste computador estiver como "Pública" no Windows, o acesso das outras máquinas ' +
    'fica bloqueado; o recomendado é mudá-la para "Privada" (Configurações > Rede e Internet).',
    False, False);
  PaginaRede.Add('Liberar o acesso mesmo se a rede estiver como Pública (ainda só para a rede local)');
  PaginaRede.Values[0] := GetPreviousData('RedePublica', '0') = '1';

  MemoFinal := TNewMemo.Create(WizardForm);
  MemoFinal.Parent := WizardForm.FinishedPage;
  MemoFinal.Left := WizardForm.FinishedLabel.Left;
  MemoFinal.Width := WizardForm.FinishedLabel.Width;
  MemoFinal.ReadOnly := True;
  MemoFinal.ScrollBars := ssVertical;
  MemoFinal.Visible := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { Atualização: mantém as respostas da instalação anterior. }
#ifdef Demo
  { A demonstração não tem backup. }
  if (PageID = PaginaPastaBackup.ID) or (PageID = PaginaBackup.ID) then begin Result := True; exit; end;
#endif
  Result := Atualizacao and ((PageID = PaginaAcesso.ID) or (PageID = PaginaPastaBackup.ID) or
    (PageID = PaginaBackup.ID) or (PageID = PaginaRede.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var Porta: String;
begin
  Result := True;
  if CurPageID = PaginaAcesso.ID then
  begin
    Porta := Trim(PaginaAcesso.Values[0]);
#ifndef Demo
    PaginaAcesso.Values[1] := Lowercase(Trim(PaginaAcesso.Values[1]));
#endif
    if (not SoDigitos(Porta)) or (StrToIntDef(Porta, 0) < 1024) or (StrToIntDef(Porta, 0) > 65535) then
    begin
      MsgBox('Informe uma porta entre 1024 e 65535.', mbError, MB_OK);
      Result := False;
    end
    else if not PortaLivre(Porta) then
    begin
      MsgBox('A porta ' + Porta + ' já está em uso neste computador. Escolha outra (por exemplo, 3334).', mbError, MB_OK);
      Result := False;
    end
    else if not LoginValido(LoginAdmin) then
    begin
      MsgBox('Login do administrador: de 3 a 40 caracteres, só letras minúsculas sem acento, números, ponto, hífen ou sublinhado.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaBackup.ID then
  begin
    if not HoraValida(Trim(PaginaBackup.Values[0])) then
    begin
      MsgBox('Informe o horário no formato hh:mm (por exemplo, 23:00).', mbError, MB_OK);
      Result := False;
    end
    else if (StrToIntDef(Trim(PaginaBackup.Values[1]), 0) < 1) or (StrToIntDef(Trim(PaginaBackup.Values[1]), 0) > 365) then
    begin
      MsgBox('Quantidade de cópias: de 1 a 365.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine;
  if Atualizacao then
    Result := Result + 'Atualização de uma instalação existente:' + NewLine +
      Space + 'antes de atualizar será feito um backup do banco; dados e configurações são mantidos.'
  else
    Result := Result +
      'Acesso:' + NewLine + Space + 'http://' + Lowercase(GetComputerNameString) + ':' + ValorPorta('') + NewLine +
#ifdef Demo
      Space + 'Usuário: visitante  ·  senha: quote2026' + NewLine + NewLine +
      'Dados 100% fictícios, sem backup e sem plano de vigência.';
#else
      Space + 'Administrador: ' + PaginaAcesso.Values[1] + NewLine + NewLine +
      'Backup diário às ' + Trim(PaginaBackup.Values[0]) + ', guardando ' + Trim(PaginaBackup.Values[1]) + ' cópias em:' + NewLine +
      Space + PaginaPastaBackup.Values[0];
#endif
  if MemoTasksInfo <> '' then Result := Result + NewLine + NewLine + MemoTasksInfo;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'Porta', ValorPorta(''));
  SetPreviousData(PreviousDataKey, 'Admin', LoginAdmin);
  SetPreviousData(PreviousDataKey, 'PastaBackup', PaginaPastaBackup.Values[0]);
  SetPreviousData(PreviousDataKey, 'HoraBackup', Trim(PaginaBackup.Values[0]));
  SetPreviousData(PreviousDataKey, 'Copias', Trim(PaginaBackup.Values[1]));
  if PaginaRede.Values[0] then
    SetPreviousData(PreviousDataKey, 'RedePublica', '1')
  else
    SetPreviousData(PreviousDataKey, 'RedePublica', '0');
end;

{ ───── Etapas da instalação ───── }

function Etapa(Nome, Rotulo, Extra: String; Passo, Total: Integer): Boolean;
var Codigo: Integer;
begin
  if Falhou then begin Result := False; exit; end;
  WizardForm.StatusLabel.Caption := Rotulo;
  WizardForm.FilenameLabel.Caption := '';
  WizardForm.ProgressGauge.Min := 0;
  WizardForm.ProgressGauge.Max := Total;
  WizardForm.ProgressGauge.Position := Passo;
  Log('Etapa ' + Nome + ': ' + Rotulo);
  Result := Exec(PowerShell,
    '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\scripts\configurar.ps1') +
    '" -Etapa ' + Nome + ' ' + Extra, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0);
  if not Result then
  begin
    Falhou := True;
    MensagemFalha := Rotulo;
    Log('Etapa ' + Nome + ' falhou, código ' + IntToStr(Codigo));
  end;
end;

{ Antes de copiar os arquivos de uma atualização: backup e parada do sistema e do banco. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var Codigo: Integer;
begin
  Result := '';
  if Atualizacao and FileExists(AddBackslash(WizardDirValue) + 'scripts\configurar.ps1') then
  begin
    WizardForm.PreparingLabel.Caption := 'Fazendo backup e parando o {#Nome} para atualizar...';
    if not Exec(PowerShell, '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
      AddBackslash(WizardDirValue) + 'scripts\configurar.ps1" -Etapa parar', WizardDirValue, SW_HIDE,
      ewWaitUntilTerminated, Codigo) or (Codigo <> 0) then
      Result := 'Não foi possível fazer o backup e parar o sistema antes de atualizar. ' +
        'Nada foi alterado. Veja ' + AddBackslash(WizardDirValue) + 'logs\instalacao.log.';
  end;
end;

procedure LerAdmin;
var Linhas: TArrayOfString;
begin
  AdminCriado := False;
  if LoadStringsFromFile(ExpandConstant('{tmp}\admin.txt'), Linhas) and (GetArrayLength(Linhas) >= 3) and (Linhas[0] = 'criado') then
  begin
    AdminCriado := True;
    AdminLogin := Linhas[1];
    AdminSenha := Linhas[2];
  end;
  DeleteFile(ExpandConstant('{tmp}\admin.txt'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
var Rede, Backup: String;
begin
  if CurStep <> ssPostInstall then exit;
  if PaginaRede.Values[0] then Rede := '-PermitirRedePublica' else Rede := '';
  Backup := '-HoraBackup ' + Trim(PaginaBackup.Values[0]) + ' ' + Rede;
  if Atualizacao and FileExists(ExpandConstant('{app}\dados\postgres.json')) then
  begin
    Etapa('iniciar-banco', 'Iniciando o banco de dados...', '', 1, 5);
    Etapa('migrations', 'Atualizando a estrutura do banco...', '', 2, 5);
    { Só cria se não existir nenhum Admin (instalação anterior interrompida antes desta etapa). }
    Etapa('admin', 'Conferindo o administrador...',
      '-AdminUsuario ' + LoginAdmin + ' -SaidaAdmin "' + ExpandConstant('{tmp}\admin.txt') + '"', 3, 5);
    LerAdmin;
    Etapa('servico', 'Iniciando o {#Nome}...', Backup, 4, 5);
  end
  else
  begin
    Etapa('postgres', 'Preparando o banco de dados PostgreSQL...', '', 1, 7);
    Etapa('configuracao', 'Gravando a configuração...',
      '-Porta ' + ValorPorta('') + ' -PastaBackup "' + PaginaPastaBackup.Values[0] + '" -Copias ' + Trim(PaginaBackup.Values[1]), 2, 7);
    Etapa('banco', 'Criando o banco do sistema...', '', 3, 7);
    Etapa('migrations', 'Criando as tabelas...', '', 4, 7);
    Etapa('admin', 'Criando o administrador...',
      '-AdminUsuario ' + LoginAdmin + ' -SaidaAdmin "' + ExpandConstant('{tmp}\admin.txt') + '"', 5, 7);
    LerAdmin;
    Etapa('servico', 'Configurando a inicialização com o Windows, o backup e o Firewall...', Backup, 6, 7);
  end;
  WizardForm.ProgressGauge.Position := WizardForm.ProgressGauge.Max;
  if Falhou then
    MsgBox('A instalação não foi concluída na etapa:' + #13#10 + MensagemFalha + #13#10#13#10 +
      'Veja os detalhes em ' + ExpandConstant('{app}\logs\instalacao.log') +
      '. Depois de corrigir, rode este instalador de novo.', mbCriticalError, MB_OK);
end;

function Endereco: String;
begin
  Result := 'http://' + Lowercase(GetComputerNameString) + ':' + ValorPorta('');
end;

procedure MostrarFinal;
var Texto: String;
begin
  if Falhou then
  begin
    WizardForm.FinishedLabel.Caption := 'A instalação não foi concluída. Veja ' +
      ExpandConstant('{app}\logs\instalacao.log') + ' e rode o instalador de novo.';
    exit;
  end;
  Texto := 'Acesse pelo navegador, de qualquer máquina da rede:' + #13#10 + '    ' + Endereco + #13#10 +
    '    (neste computador: http://localhost:' + ValorPorta('') + ')' + #13#10#13#10;
  if AdminCriado then
    Texto := Texto + 'Administrador:  ' + AdminLogin + #13#10 + 'Senha temporária:  ' + AdminSenha + #13#10#13#10 +
      'ANOTE A SENHA AGORA: ela não será mostrada de novo. No primeiro acesso o sistema pede para trocá-la.'
  else
    Texto := Texto + 'Os usuários e senhas existentes foram mantidos.';
#ifdef Demo
  Texto := 'Abra pelo navegador:' + #13#10 + '    http://localhost:' + ValorPorta('') + #13#10 +
    '    (de outra máquina da rede: ' + Endereco + ')' + #13#10#13#10 +
    'Usuário:  visitante' + #13#10 + 'Senha:  quote2026' + #13#10#13#10 +
    'Depois de uma apresentação, use Configurações > Demonstração > Restaurar demo.';
  WizardForm.FinishedLabel.Caption := 'A demonstração do Quote está instalada, com dados 100% fictícios.';
#else
  WizardForm.FinishedLabel.Caption := 'O JAT Quote está instalado e já está funcionando. ' +
    'Ele inicia sozinho com o Windows e faz backup do banco todos os dias.';
#endif
  MemoFinal.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(12);
  MemoFinal.Height := ScaleY(150);
  MemoFinal.Text := Texto;
  MemoFinal.Visible := True;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = PaginaPastaBackup.ID) and (PaginaPastaBackup.Values[0] = '') then
    PaginaPastaBackup.Values[0] := AddBackslash(WizardDirValue) + 'backups';
  if CurPageID = wpFinished then MostrarFinal;
end;

{ ───── Desinstalação ───── }

function InitializeUninstall: Boolean;
begin
  Result := True;
  RemoverDados := MsgBox('Remover também o banco de dados, os backups e os registros (logs)?' + #13#10#13#10 +
    'Escolha "Não" para manter os dados (recomendado se for reinstalar ou atualizar).',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

{ Antes de apagar os arquivos: remove tarefas, Firewall e o serviço do PostgreSQL (e os dados, se pedido). }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Codigo: Integer; Extra: String;
begin
  if CurUninstallStep <> usUninstall then exit;
  if RemoverDados then Extra := ' -RemoverDados' else Extra := '';
  if FileExists(ExpandConstant('{app}\scripts\configurar.ps1')) then
    Exec(PowerShell, '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
      ExpandConstant('{app}\scripts\configurar.ps1') + '" -Etapa remover' + Extra,
      ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Codigo);
end;
