import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appointmentCommissionForProfessional,
  clampManualCommissionAmount,
  manualCommissionAmountLimit,
  manualCommissionAllocationMatches,
  professionalCommissionPool,
} from '../artifacts/barber-manager/src/data/appointment-commissions.ts';
import { planValuePerUse, subscriberServiceUsesRemaining } from '../artifacts/barber-manager/src/data/plan-usage.ts';

const rateFor = service => ({ 'Prótese Capilar': 0.2, Mentoria: 0.3, Barbearia: 0.4 })[service] ?? 0;
const appointment = (overrides = {}) => ({
  professionalId: 'executor',
  service: 'Prótese Capilar',
  value: 1000,
  ...overrides,
});

test('new attended service gives the executor half of the gross service value', () => {
  assert.equal(
    appointmentCommissionForProfessional(
      appointment({ serviceCommissionRateSnapshot: 0.5 }),
      'executor',
      rateFor,
    ),
    500,
  );
});

test('commission lookup receives the stable service ID after a service is renamed', () => {
  const lookupCalls = [];
  const rateById = (serviceName, serviceId) => {
    lookupCalls.push({ serviceName, serviceId });
    return serviceId === 'service-corte' ? 0.25 : 0;
  };
  const soldService = appointment({
    service: 'Corte atualizado',
    serviceId: 'service-corte',
    sellerProfessionalId: 'seller',
    serviceCommissionRateSnapshot: 0.5,
  });

  assert.equal(
    appointmentCommissionForProfessional(soldService, 'executor', rateById),
    500,
  );
  assert.equal(
    appointmentCommissionForProfessional(soldService, 'seller', rateById),
    250,
  );
  assert.deepEqual(lookupCalls, [{ serviceName: 'Corte atualizado', serviceId: 'service-corte' }]);
});

test('different seller earns the same service-specific commission independently', () => {
  const sale = appointment({ sellerProfessionalId: 'seller', serviceCommissionRateSnapshot: 0.5 });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 500);
  assert.equal(appointmentCommissionForProfessional(sale, 'seller', rateFor), 200);
});

test('the same professional earns both role commissions without duplicating revenue', () => {
  const sale = appointment({
    sellerProfessionalId: 'executor',
    service: 'Mentoria',
    serviceCommissionRateSnapshot: 0.5,
  });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 800);
  assert.equal(sale.value, 1000);
});

test('company-attributed sales do not credit a seller commission', () => {
  const sale = appointment({ sellerIsCompany: true, serviceCommissionRateSnapshot: 0.5 });
  assert.equal(appointmentCommissionForProfessional(sale, 'executor', rateFor), 500);
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
  const planAttendance = appointment({
    value: 0,
    planUsageValue: 37.5,
    serviceCommissionRateSnapshot: 0.5,
  });
  assert.equal(appointmentCommissionForProfessional(planAttendance, 'executor', rateFor), 18.75);
});

test('historical appointments without a commission snapshot keep their configured rate', () => {
  const legacyAppointment = appointment({ value: 100, serviceCommissionRateSnapshot: undefined });
  assert.equal(appointmentCommissionForProfessional(legacyAppointment, 'executor', rateFor), 20);
  const legacyPlanAttendance = appointment({
    value: 0,
    planUsageValue: 37.5,
    serviceCommissionRateSnapshot: undefined,
  });
  assert.equal(appointmentCommissionForProfessional(legacyPlanAttendance, 'executor', rateFor), 7.5);
});

test('manual multi-professional amounts must total exactly half of the service base', () => {
  assert.equal(professionalCommissionPool(100), 50);
  assert.equal(
    manualCommissionAllocationMatches(100, [
      { professionalId: 'executor', amount: 18.5 },
      { professionalId: 'second', amount: 31.5 },
    ]),
    true,
  );
  assert.equal(
    manualCommissionAllocationMatches(100, [
      { professionalId: 'executor', amount: 18.5 },
      { professionalId: 'second', amount: 12 },
    ]),
    false,
  );
});

test('manual commission entry is capped at the remaining professional pool', () => {
  assert.equal(manualCommissionAmountLimit(50, [18.5]), 31.5);
  assert.equal(clampManualCommissionAmount(50, [18.5], 40), 31.5);
  assert.equal(clampManualCommissionAmount(50, [50], 8), 0);
  assert.equal(clampManualCommissionAmount(18.75, [3.25], 20), 15.5);
});

test('plan commission pool is half of the prorated plan value per use', () => {
  const planAttendance = appointment({ value: 0, planUsageValue: 37.5 });
  assert.equal(professionalCommissionPool(planAttendance.planUsageValue), 18.75);
});

test('legacy plan-use commission still uses the historic configured rate', () => {
  const planAttendance = appointment({ value: 0, planUsageValue: 37.5 });
  assert.equal(appointmentCommissionForProfessional(planAttendance, 'executor', rateFor), 7.5);
});

test('multiple professionals receive only their manually assigned commission amounts', () => {
  const sharedAppointment = appointment({
    value: 100,
    professionalCommissions: [
      { professionalId: 'executor', amount: 18.5 },
      { professionalId: 'second', amount: 31.5 },
    ],
  });

  assert.equal(appointmentCommissionForProfessional(sharedAppointment, 'executor', rateFor), 18.5);
  assert.equal(appointmentCommissionForProfessional(sharedAppointment, 'second', rateFor), 31.5);
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
