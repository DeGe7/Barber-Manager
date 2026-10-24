# Baseline remoto e remoção da integração de atendimento

`2026-09-07` continua sendo o último estado verificado remotamente. O usuário
informou que as migrações anteriores de Chatwoot foram aplicadas nos dois
projetos Supabase. A remoção foi preparada na fonte, mas a nova migração ainda
precisa ser aplicada e verificada nos dois projetos.

## Fonte e contratos

- `supabase/schema.sql` é a fonte única do schema, funções RPC, triggers, RLS e
  Storage. A fonte espera `app_schema_version = 2026-10-14.1` e não inclui
  objetos de Chatwoot.
- `supabase/tests/access_control.sql` é a suíte de regressão das fronteiras de
  organização, profissional, permissões e Storage privado.
- `artifacts/barber-manager/src/data/api.ts` é o contrato de acesso do cliente
  para tabelas e RPCs atuais.
- `e2e/provision.ts` valida o marcador e o formato das tabelas antes de criar
  qualquer fixture; `e2e/playwright.config.ts` define o runner e o servidor
  isolado da suíte. A expectativa de `2026-09-30` ainda não foi verificada no
  projeto E2E.

## Garantias incluídas

- Cada registro de negócio é associado à organização atual e protegido por
  RLS.
- Gestores e profissionais têm limites distintos para agenda, vendas,
  mensalidades, financeiro, estoque e configurações.
- Auth cria e sincroniza perfis; onboarding e convites usam os RPCs do schema,
  com token armazenado somente como hash SHA-256.
- Os buckets `avatars` e `logos` são privados. O acesso é limitado ao próprio
  avatar ou à organização do gestor, usando URL assinada quando necessário.
- Baixas de estoque e atualizações de mensalidades são confirmadas pelo
  servidor antes de refletir sucesso no cliente.

## Registros da validação remota

- `pnpm typecheck`: aprovado.
- `pnpm e2e:validate`: aprovado; 35 títulos E2E sem duplicidade.
- `CI=true E2E_PROVISION=true E2E_START_SERVER=true pnpm exec playwright test
  --config=e2e/playwright.config.ts --retries=1`: último resultado registrado
  como aprovado; 35/35 testes em 9,6 minutos, usando somente o projeto
  Supabase de teste dedicado. Esse resultado não prova a aplicação da migração
  de remoção descrita nesta baseline.
- `PORT=23945 BASE_PATH=/ pnpm --filter @workspace/barber-manager run build`:
  aprovado. O build precisa dessas variáveis; executá-lo sem elas é uma falha
  de invocação, não uma falha do artefato.
- O deployment público foi republicado e está ativo em
  `https://ms-manager.replit.app`, com visibilidade pública, tipo `autoscale` e
  build bem-sucedido.
- O smoke público foi repetido em 15/09/2026: a rota protegida redirecionou
  para `/login`; `/cadastro` exibe `Nome e sobrenome`, rejeita senhas
  diferentes, permanece na rota e não emite requisição ao Supabase após o
  envio inválido. Resultado: 2/2 verificações aprovadas.
- A checagem REST remota respondeu HTTP 200 para
  `communication_sends`, `subscription_payments` e `schema_metadata`. O
  marcador `app_schema_version` estava aplicado como `2026-09-07`. O probe
  público do Storage retornou `400`, como esperado para um bucket privado.

## Remoção da integração de atendimento

- A migração `supabase/migrations/2026-10-12-remove-chatwoot.sql` apaga as
  conexões e credenciais armazenadas, remove a tabela, limpa permissões antigas
  e atualiza o marcador para `2026-10-12`.
- Ela precisa ser executada manualmente nos dois projetos Supabase. Até a
  aplicação e verificação, não se afirma paridade remota com a fonte.

## Decisão sobre a paridade de produção

### Exclusão de profissionais preservando histórico

A migração `supabase/migrations/2026-10-13-delete-professionals-preserve-history.sql`
permite excluir profissionais mantendo atendimentos, bloqueios, vendas,
mentorias, assinaturas e pagamentos. Os vínculos ficam nulos; gestores continuam
visualizando os registros. Contas vinculadas são desativadas no estabelecimento
e convites pendentes são revogados. O usuário confirmou que esta migração foi
aplicada nos dois projetos Supabase.

### Exclusão do histórico de convites

A migração `supabase/migrations/2026-10-14-delete-invitation-history.sql`
adiciona um RPC que permite apenas a gestores excluírem permanentemente um
convite do próprio estabelecimento. O usuário confirmou que ela foi aplicada nos
dois projetos Supabase; a publicação atualizada da aplicação ainda é necessária.

A migração `supabase/migrations/2026-10-14-invitation-history-bulk-cleanup.sql`
adiciona a limpeza em lote de convites expirados ou revogados, preservando
convites aceitos e pendentes. A aplicação dessa migração deve atualizar o
marcador para `2026-10-14.1`; a execução remota ainda não foi confirmada.

A fonte do repositório e o último estado remoto verificado `2026-09-07` são
diferentes até que a migração de remoção seja aplicada e os probes sejam
repetidos.

Para preservar essa paridade em mudanças futuras, repetir:

1. o probe das tabelas e Storage;
2. `CI=true pnpm e2e:isolated` no projeto de teste;
3. o smoke autenticado/publicado com o bundle recém-publicado.

## Regra de congelamento

Até o planejamento explícito da etapa de integração, não alterar tabelas,
colunas, enums, funções RPC, triggers, políticas RLS, buckets, contratos de
API ou o marcador do schema. Alterações futuras devem:

1. apresentar diff não destrutivo e plano de migração, quando necessário;
2. atualizar a fonte e a checagem de schema em conjunto;
3. repetir a suíte de acesso, a suíte E2E completa e a verificação publicada;
4. revisar novamente Auth, RLS, permissões e Storage antes de aplicar em
   produção.

Nenhuma alteração destrutiva deve ser aplicada automaticamente durante essa
  etapa.

## Congelamento formal

O baseline está pronto para a etapa 5. Permanecem congelados:

- tabelas, colunas, constraints e índices;
- funções RPC, triggers, grants e políticas RLS;
- Auth, perfis, permissões, convites e Storage privado;
- contratos de acesso em `artifacts/barber-manager/src/data/api.ts`;
- marcador `app_schema_version` e formato usado por `e2e/provision.ts`.

O planejamento do n8n pode começar sem modificar esses contratos. Qualquer
mudança posterior deve ser tratada como nova migração, com diff não destrutivo,
atualização da fonte, aplicação coordenada em E2E e produção, além da repetição
das validações estruturais, E2E completa e smoke publicado.