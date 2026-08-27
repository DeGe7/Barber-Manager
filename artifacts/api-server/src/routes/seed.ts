/**
 * Seed the database with initial data if tables are empty.
 * Called once on server startup.
 */
import { db, professionals, appointments, products, clients, expenses, prothesisSales, mentoriaSessions, subscriptionPlans, subscribers, config } from "@workspace/db";

const today = new Date();
const d = (offset: number): string => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  return dt.toISOString().slice(0, 10);
};

export async function seedIfEmpty() {
  try {
    const existing = await db.select({ id: professionals.id }).from(professionals).limit(1);
    if (existing.length > 0) return; // already seeded

    await db.insert(professionals).values([
      { id: 'prof-1', name: 'Kauan Carvalho', role: 'barbeiro', initials: 'KC', color: '#3b82f6', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-2', name: 'Kauã Gonçalves', role: 'barbeiro', initials: 'KG', color: '#8b5cf6', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-3', name: 'Cristiano Nogueira', role: 'barbeiro', initials: 'CN', color: '#06b6d4', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-4', name: 'Claudio Carvalho', role: 'barbeiro', initials: 'CC', color: '#f59e0b', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-5', name: 'Marcos Macedo', role: 'barbeiro', initials: 'MM', color: '#10b981', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-6', name: 'Silvia Gomes', role: 'barbeiro', initials: 'SG', color: '#ef4444', isActive: true, commissions: { barbearia: 0.5, manutencao: 0.4, manicure: 0, protese: 0, mentoria: 0 } },
      { id: 'prof-7', name: 'Irani', role: 'manicure', initials: 'IR', color: '#64748b', isActive: true, commissions: { barbearia: 0, manutencao: 0, manicure: 0.65, protese: 0, mentoria: 0 } },
      { id: 'prof-8', name: 'Vinicius', role: 'vendedor', initials: 'VM', color: '#059669', isActive: true, commissions: { barbearia: 0, manutencao: 0, manicure: 0, protese: 0.07, mentoria: 0.1 } },
      { id: 'prof-9', name: 'Davi', role: 'vendedor', initials: 'DV', color: '#6366f1', isActive: true, commissions: { barbearia: 0, manutencao: 0, manicure: 0, protese: 0.03, mentoria: 0 } },
      { id: 'prof-10', name: 'Giovanna', role: 'vendedor', initials: 'GV', color: '#ec4899', isActive: true, commissions: { barbearia: 0, manutencao: 0, manicure: 0, protese: 0.03, mentoria: 0 } },
    ]);

    await db.insert(products).values([
      { id: 'p1', name: 'Heineken Long Neck', category: 'Cerveja', price: 15, cost: 8, stock: 48, minStock: 10 },
      { id: 'p2', name: 'Stella Artois', category: 'Cerveja', price: 12, cost: 6.5, stock: 36, minStock: 10 },
      { id: 'p3', name: 'Corona Extra', category: 'Cerveja', price: 14, cost: 7.5, stock: 2, minStock: 10 },
      { id: 'p4', name: 'Spaten', category: 'Cerveja', price: 13, cost: 7, stock: 3, minStock: 10 },
      { id: 'p5', name: 'Coca Cola 350ml', category: 'Refrigerante', price: 6, cost: 3, stock: 24, minStock: 15 },
      { id: 'p6', name: 'Coca Cola 200ml', category: 'Refrigerante', price: 4.5, cost: 2, stock: 1, minStock: 15 },
      { id: 'p7', name: 'Guaraná 200ml', category: 'Refrigerante', price: 4, cost: 1.8, stock: 18, minStock: 15 },
      { id: 'p8', name: 'Água Mineral 500ml', category: 'Água', price: 3, cost: 1, stock: 50, minStock: 20 },
    ]);

    await db.insert(appointments).values([
      { id: 'a1', date: d(0), time: '09:00', client: 'João Silva', clientPhone: '11999990001', professionalId: 'prof-1', service: 'Barbearia', duration: 30, status: 'confirmed', value: 50, tip: 5, products: [{ productId: 'p1', quantity: 1 }], payMethod: 'pix', notes: '' },
      { id: 'a2', date: d(0), time: '10:30', client: 'Carlos Santos', clientPhone: '11999990002', professionalId: 'prof-3', service: 'Barbearia', duration: 30, status: 'pending', value: 30, tip: 0, products: [], payMethod: 'debito', notes: '' },
      { id: 'a3', date: d(0), time: '14:00', client: 'Maria Oliveira', clientPhone: '11999990003', professionalId: 'prof-6', service: 'Manutenção', duration: 30, status: 'confirmed', value: 75, tip: 10, products: [{ productId: 'p2', quantity: 2 }], payMethod: 'credito', notes: '' },
      { id: 'a4', date: d(0), time: '15:30', client: 'Ana Costa', clientPhone: '11999990004', professionalId: 'prof-7', service: 'Manicure', duration: 60, status: 'pending', value: 35, tip: 3, products: [], payMethod: 'pix', notes: '' },
      { id: 'a5', date: d(0), time: '11:00', client: 'Rafael Mendes', clientPhone: '11999990005', professionalId: 'prof-1', service: 'Barbearia', duration: 30, status: 'confirmed', value: 50, tip: 0, products: [], payMethod: 'pix', notes: '' },
      { id: 'a6', date: d(-1), time: '09:30', client: 'Pedro Lima', clientPhone: '11999990006', professionalId: 'prof-2', service: 'Barbearia', duration: 30, status: 'confirmed', value: 50, tip: 5, products: [], payMethod: 'pix', notes: '' },
      { id: 'a7', date: d(-1), time: '11:00', client: 'Lucas Ferreira', clientPhone: '11999990007', professionalId: 'prof-4', service: 'Manutenção', duration: 30, status: 'no_show', value: 40, tip: 0, products: [], payMethod: 'pix', notes: '' },
      { id: 'a8', date: d(-2), time: '14:30', client: 'Bruno Alves', clientPhone: '11999990008', professionalId: 'prof-5', service: 'Barbearia', duration: 30, status: 'confirmed', value: 50, tip: 10, products: [], payMethod: 'credito', notes: '' },
      { id: 'a9', date: d(1), time: '09:00', client: 'Felipe Torres', clientPhone: '11999990009', professionalId: 'prof-1', service: 'Barbearia', duration: 30, status: 'pending', value: 50, tip: 0, products: [], payMethod: 'pix', notes: '' },
      { id: 'a10', date: d(1), time: '10:30', client: 'Rodrigo Nunes', clientPhone: '11999990010', professionalId: 'prof-3', service: 'Manutenção', duration: 30, status: 'confirmed', value: 40, tip: 0, products: [], payMethod: 'debito', notes: '' },
    ]);

    await db.insert(clients).values([
      { id: 'c1', name: 'João Silva', email: 'joao@email.com', whatsapp: '11999990001', birthday: '1990-03-15', source: 'Indicação', createdAt: d(-60), visits: [{ id: 'v1', date: d(0), type: 'servico', description: 'Corte + Barba', professional: 'Kauan Carvalho', amount: 55 }] },
      { id: 'c2', name: 'Carlos Santos', email: 'carlos@email.com', whatsapp: '11999990002', birthday: '1985-08-12', source: 'Instagram', createdAt: d(-45), visits: [{ id: 'v2', date: d(-7), type: 'servico', description: 'Corte', professional: 'Cristiano Nogueira', amount: 30 }] },
      { id: 'c3', name: 'Maria Oliveira', email: 'maria@email.com', whatsapp: '11999990003', source: 'Google', createdAt: d(-30), visits: [{ id: 'v3', date: d(-3), type: 'servico', description: 'Manutenção', professional: 'Silvia Gomes', amount: 75 }] },
      { id: 'c4', name: 'Ana Costa', email: 'ana@email.com', whatsapp: '11999990004', birthday: '1995-11-20', source: 'Indicação', createdAt: d(-90), visits: [] },
      { id: 'c5', name: 'Rafael Mendes', email: 'rafael@email.com', whatsapp: '11999990005', source: 'Anúncio', createdAt: d(-15), visits: [{ id: 'v5', date: d(-14), type: 'servico', description: 'Corte', professional: 'Kauan Carvalho', amount: 50 }] },
      { id: 'c6', name: 'Pedro Lima', email: 'pedro@email.com', whatsapp: '11999990006', birthday: '1988-05-07', source: 'Passou na rua', createdAt: d(-120), visits: [{ id: 'v6', date: d(-50), type: 'servico', description: 'Corte', professional: 'Kauã Gonçalves', amount: 50 }] },
    ]);

    await db.insert(expenses).values([
      { id: 'e1', date: d(-5), description: 'Aluguel agosto', amount: 3500, category: 'Aluguel' },
      { id: 'e2', date: d(-3), description: 'Reposição de produtos', amount: 850, category: 'Produtos' },
      { id: 'e3', date: d(-1), description: 'Impulsionamento Instagram', amount: 200, category: 'Marketing' },
      { id: 'e4', date: d(-10), description: 'Manutenção cadeira', amount: 150, category: 'Manutenção' },
      { id: 'e5', date: d(-20), description: 'Folha de pagamento julho', amount: 8000, category: 'Folha de pagamento' },
    ]);

    await db.insert(prothesisSales).values([
      { id: 'ps1', date: d(-10), client: 'André Souza', whatsapp: '11999991001', value: 1800, sellerId: 'prof-8', installments: 3, installmentsPaid: 1, payMethod1: 'credito', payAmount1: 600, lastMaintenance: d(-10), notes: 'Prótese capilar premium' },
      { id: 'ps2', date: d(-25), client: 'Marcos Vieira', whatsapp: '11999991002', value: 2200, sellerId: 'prof-9', installments: 4, installmentsPaid: 2, payMethod1: 'pix', payAmount1: 550, lastMaintenance: d(-30), notes: '' },
      { id: 'ps3', date: d(-5), client: 'Ricardo Almeida', whatsapp: '11999991003', value: 1500, sellerId: 'prof-10', installments: 1, installmentsPaid: 1, payMethod1: 'pix', payAmount1: 1500, lastMaintenance: d(-5), notes: 'Cliente novo' },
    ]);

    await db.insert(mentoriaSessions).values([
      { id: 'm1', date: d(2), client: 'Lucas Barbosa', sellerId: 'prof-8', value: 350, durationHours: 2, status: 'scheduled', notes: 'Mentoria individual — técnicas de prótese' },
      { id: 'm2', date: d(-15), client: 'Thiago Rocha', sellerId: 'prof-8', value: 350, durationHours: 2, status: 'completed', notes: '' },
    ]);

    await db.insert(subscriptionPlans).values([
      { id: 'pl1', name: 'Plano Corte', price: 140, services: ['4 Cortes por mês'], duration: 'Mensal' },
      { id: 'pl2', name: 'Plano Corte + Barba', price: 180, services: ['4 Cortes por mês', '4 Barbas por mês'], duration: 'Mensal' },
      { id: 'pl3', name: 'Plano Premium', price: 250, services: ['4 Cortes por mês', '4 Barbas por mês', '2 Manutenções por mês'], duration: 'Mensal' },
    ]);

    await db.insert(subscribers).values([
      { id: 'sb1', name: 'João Silva', phone: '11999990001', planId: 'pl1', professionalId: 'prof-1', startDate: d(-20), nextPayment: d(10), status: 'ativo' },
      { id: 'sb2', name: 'Pedro Lima', phone: '11999990006', planId: 'pl2', professionalId: 'prof-3', startDate: d(-35), nextPayment: d(-5), status: 'vencido' },
      { id: 'sb3', name: 'Carlos Santos', phone: '11999990002', planId: 'pl3', professionalId: 'prof-5', startDate: d(-10), nextPayment: d(20), status: 'ativo' },
    ]);

    await db.insert(config).values([
      { key: 'barbeariaConfig', value: JSON.stringify({ name: 'Barber Manager', cnpj: '', address: '' }) },
    ]);

    console.log('[seed] Database seeded with initial data');
  } catch (err) {
    console.error('[seed] Seed error:', err);
  }
}
