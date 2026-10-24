import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentCommissionForProfessional } from '../artifacts/barber-manager/src/data/appointment-commissions.ts';
import { planValuePerUse, subscriberServiceUsesRemaining } from '../artifacts/barber-manager/src/data/plan-usage.ts';

const rateFor = service => ({ 'Prótese Capilar': 0.2, Mentoria: 0.3, Barbearia: 0.4 })[service] ?? 0;
const appointment = (overrides = {}) => ({
  professionalId: 'executor',
  service: 'Prótese Capilar',
  value: 1000,
  ...overrides,
});

test('appointment executor earns the configured service commission', () => {
  assert.equal(appointmentCommissionForProfessional(appointment(), 'executor', rateFor), 200);
});

test('commission lookup receives the stable service ID after a service is renamed', () => {
  const lookupCalls = [];
  const rateById = (serviceName, serviceId) => {
    lookupCalls.push({ serviceName, serviceId });
    return serviceId === 'service-corte' ? 0.25 : 0;
  };

  assert.equal(
    appointmentCommissionForProfessional(
      appointment({ service: 'Corte atualizado', serviceId: 'service-corte' }),
      'executor',
      rateById,
    ),
    250,
  );
  assert.deepEqual(lookupCalls, [{ serviceName: 'Corte atualizado', serviceId: 'service-corte' }]);
});

test('different seller earns the same service-specific commission independently', () => {
  const sale = appointment({ sellerProfessionalId: 'seller' });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 200);
  assert.equal(appointmentCommissionForProfessional(sale, 'seller', rateFor), 200);
});

test('the same professional earns both role commissions without duplicating revenue', () => {
  const sale = appointment({ sellerProfessionalId: 'executor', service: 'Mentoria' });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 600);
  assert.equal(sale.value, 1000);
});

test('company-attributed sales do not credit a seller commission', () => {
  const sale = appointment({ sellerIsCompany: true });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 200);
  assert.equal(appointmentCommissionForProfessional(sale, 'seller', rateFor), 0);
});

test('legacy and ordinary appointments retain executor-only commissions', () => {
  assert.equal(appointmentCommissionForProfessional(appointment(), 'executor', rateFor), 200);
  assert.equal(
    appointmentCommissionForProfessional(
      appointment({ service: 'Barbearia', sellerProfessionalId: undefined }),
      'executor',
      rateFor,
    ),
    400,
  );
});

test('plan-use commission uses the prorated plan price instead of service revenue', () => {
  const planAttendance = appointment({ value: 0, planUsageValue: 37.5 });
  assert.equal(appointmentCommissionForProfessional(planAttendance, 'executor', rateFor), 7.5);
});

test('multiple professionals receive only their manually assigned commission amounts', () => {
  const sharedAppointment = appointment({
    value: 100,
    professionalCommissions: [
      { professionalId: 'executor', amount: 18.5 },
      { professionalId: 'second', amount: 12 },
    ],
  });

  assert.equal(appointmentCommissionForProfessional(sharedAppointment, 'executor', rateFor), 18.5);
  assert.equal(appointmentCommissionForProfessional(sharedAppointment, 'second', rateFor), 12);
  assert.equal(appointmentCommissionForProfessional(sharedAppointment, 'unassigned', rateFor), 0);
});

test('plan cost is divided across every included use and cancelled visits do not consume quota', () => {
  const plan = {
    id: 'plan',
    name: 'Plano mensal',
    price: 120,
    duration: 'Mensal',
    services: [
      { serviceId: 'cut', serviceName: 'Corte', usesPerCycle: 4 },
      { serviceId: 'beard', serviceName: 'Barba', usesPerCycle: 2 },
    ],
  };
  const subscriber = {
    id: 'subscriber',
    name: 'Cliente',
    phone: '',
    planId: 'plan',
    startDate: '2026-10-01',
    nextPayment: '2026-11-01',
    status: 'ativo',
    usageStartedAt: '2026-10-01T00:00:00.000Z',
  };
  const appointments = [
    { planSubscriberId: 'subscriber', serviceId: 'cut', attendanceRecordedAt: '2026-10-02T12:00:00.000Z', status: 'confirmed' },
    { planSubscriberId: 'subscriber', serviceId: 'cut', attendanceRecordedAt: '2026-10-03T12:00:00.000Z', status: 'cancelled' },
    { planSubscriberId: 'subscriber', serviceId: 'cut', attendanceRecordedAt: '2026-09-30T12:00:00.000Z', status: 'completed' },
  ];

  assert.equal(planValuePerUse(plan), 20);
  assert.equal(subscriberServiceUsesRemaining(appointments, subscriber, plan.services[0]), 3);
});
