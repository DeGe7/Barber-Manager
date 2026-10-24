import { randomBytes } from 'node:crypto';
import { professionalHistoryRequest } from './provision';
import { today } from './fixtures';

export const historyTables = [
  'appointments', 'blocks', 'prothesis_sales', 'mentoria_sessions',
  'subscription_plans', 'subscribers', 'subscription_payments',
] as const;

export async function seedProfessionalHistory() {
  const prefix = `Exclusão E2E ${randomBytes(6).toString('hex')}`;
  const professionalId = `${prefix}-professional`;
  const planId = `${prefix}-plan`;
  const subscriberId = `${prefix}-subscriber`;
  const date = today();
  await professionalHistoryRequest('professionals', 'POST', {
    id: professionalId, name: prefix, initials: 'EX',
    commissions: { barbearia: 0.5, protese: 0.2, mentoria: 0.3 },
  });
  await professionalHistoryRequest('appointments', 'POST', {
    id: `${prefix}-appointment`, professional_id: professionalId, date, time: '09:00',
    client: `${prefix} atendimento`, service: 'Barbearia', status: 'completed',
    value: 125.5, tip: 14.5, pay_method: 'pix',
    payment_splits: [{ method: 'pix', amount: 140 }],
  });
  await professionalHistoryRequest('blocks', 'POST', {
    id: `${prefix}-block`, professional_id: professionalId, date,
    slots: ['12:00'], reason: `${prefix} bloqueio`,
  });
  await professionalHistoryRequest('prothesis_sales', 'POST', {
    id: `${prefix}-sale`, seller_id: professionalId, date, client: `${prefix} prótese`,
    value: 1200, installments: 3, installments_paid: 2,
    pay_method1: 'pix', pay_amount1: 800,
  });
  await professionalHistoryRequest('mentoria_sessions', 'POST', {
    id: `${prefix}-mentoring`, seller_id: professionalId, date,
    client: `${prefix} mentoria`, value: 450.75, status: 'completed',
  });
  await professionalHistoryRequest('subscription_plans', 'POST', {
    id: planId, name: `${prefix} plano`, price: 149.9,
  });
  await professionalHistoryRequest('subscribers', 'POST', {
    id: subscriberId, professional_id: professionalId, plan_id: planId,
    name: `${prefix} assinante`, start_date: date, next_payment: date,
  });
  // The subscriber trigger creates this cycle; mark it paid without advancing
  // the cycle so the exact same payment can be compared before/after deletion.
  await professionalHistoryRequest('subscription_payments', 'PATCH', {
    amount: 149.9, status: 'pago', paid_at: date, payment_method: 'pix',
    note: `${prefix} mensalidade`,
  }, { column: 'subscriber_id', value: subscriberId });
  return { prefix, professionalId };
}

export async function historySnapshot(prefix: string) {
  const entries = await Promise.all(historyTables.map(async table => {
    const rows = await professionalHistoryRequest(table, 'GET');
    return [table, rows.filter(row => table === 'subscription_payments'
      ? row.subscriber_id === `${prefix}-subscriber`
      : String(row.id).startsWith(prefix))] as const;
  }));
  return Object.fromEntries(entries);
}

/** Only attribution and automatic timestamps may change; all business data stays identical. */
export function withoutAttribution(snapshot: Awaited<ReturnType<typeof historySnapshot>>) {
  return Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [
    table,
    rows.map(({ professional_id, seller_id, updated_at, ...businessData }) => businessData),
  ]));
}
