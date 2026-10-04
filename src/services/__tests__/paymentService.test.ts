import { describe, expect, it } from 'vitest';
import {
  applyPaidToRow,
  calculateCourtShare,
  calculateOutstanding,
  calculatePlayerPayment,
  calculateSessionPayments,
  calculateShuttleShare,
  mergeGuestPayment,
  calculateSessionPlayerPayments,
  reconcileSession,
  splitCost,
} from '../paymentService';
import { roundPayment } from '../roundingService';
import { makePlayer, makeSession, patchPayment, SETTINGS } from './testHelpers';

describe('roundPayment', () => {
  it.each([
    [62100, 62500],
    [62400, 62500],
    [62500, 62500],
    [62600, 63000],
    [62900, 63000],
    [63000, 63000],
    [22312.5, 22500],
    [0, 0],
  ])('%d -> %d', (input, expected) => {
    expect(roundPayment(input)).toBe(expected);
  });

  it('không bị đẩy lên bậc trên vì sai số dấu phẩy động', () => {
    expect(roundPayment(62500.0000000001)).toBe(62500);
    expect(roundPayment(0.1 * 3 * 100000)).toBe(30000);
  });
});

describe('splitCost', () => {
  it('chia đều khi mọi người chơi cả buổi', () => {
    expect(splitCost(100000, [1, 1, 1, 1])).toEqual([25000, 25000, 25000, 25000]);
  });

  it('người nửa buổi trả 50% suất, phần còn lại chia đều cho người chơi cả buổi', () => {
    // Suất chuẩn 30.000; nửa buổi 15.000; 2 người còn lại (90.000 - 15.000) / 2 = 37.500.
    expect(splitCost(90000, [0.5, 1, 1])).toEqual([15000, 37500, 37500]);
  });

  it('bỏ qua người hệ số 0 và xử lý trường hợp không ai trả', () => {
    expect(splitCost(60000, [0, 1, 1])).toEqual([0, 30000, 30000]);
    expect(splitCost(60000, [0, 0])).toEqual([0, 0]);
    expect(splitCost(60000, [0.5, 0.5])).toEqual([30000, 30000]);
  });
});

describe('calculateOutstanding', () => {
  it('còn thiếu = phải đóng - đã ứng - đã thu', () => {
    expect(calculateOutstanding(65000, 35000, 0)).toEqual({ remaining: 30000, outstanding: 30000, overpaid: 0 });
    expect(calculateOutstanding(65000, 35000, 10000)).toMatchObject({ outstanding: 20000, overpaid: 0 });
  });

  it('đóng dư hiển thị thành "Dư", không phải số âm', () => {
    expect(calculateOutstanding(65000, 35000, 50000)).toEqual({ remaining: -20000, outstanding: 0, overpaid: 20000 });
  });
});

/**
 * Kịch bản tổng hợp: sân 280.000, cầu 189.000, 10 người.
 *  p1 không chơi (chỉ tính sân) | p2 nửa buổi | p3 đã ứng 35.000 | p4 góp cầu 27.000
 *  p5 có 2 khách (g1, g2) | p6, p7, p8 bình thường.
 */
function buildScenario() {
  const players = [
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => makePlayer(id, 'TB')),
    makePlayer('g1', 'TBY', 'male', true),
    makePlayer('g2', 'TBY', 'female', true),
  ];
  let session = makeSession(players);
  session = patchPayment(session, 'p1', { playFraction: 0, payCourt: true, payShuttle: false });
  session = patchPayment(session, 'p2', { playFraction: 0.5 });
  session = patchPayment(session, 'p3', { advancePayment: 35000 });
  session = patchPayment(session, 'p4', { shuttleContribution: 27000 });
  session = patchPayment(session, 'g1', { referrerPlayerId: 'p5' });
  session = patchPayment(session, 'g2', { referrerPlayerId: 'p5' });
  return session;
}

describe('kịch bản tính tiền tổng hợp (10 người)', () => {
  const session = buildScenario();
  const result = calculateSessionPayments(session, SETTINGS);
  const byId = new Map(result.players.map((p) => [p.playerId, p]));
  const rowByKey = new Map(result.rows.map((r) => [r.key, r]));

  it('tiền sân chia đều cho 10 người, kể cả người không chơi', () => {
    for (const payment of result.players) expect(payment.courtShare).toBe(28000);
    expect(calculateCourtShare('p1', session, SETTINGS)).toBe(28000);
  });

  it('người không chơi không tính tiền cầu', () => {
    const p1 = byId.get('p1')!;
    expect(p1.shuttleShare).toBe(0);
    expect(calculateShuttleShare('p1', session)).toBe(0);
    expect(p1.roundedPayable).toBe(28000);
  });

  it('half-play: trả 50% suất cầu, vẫn tính đủ tiền sân (mode full)', () => {
    const p2 = byId.get('p2')!;
    // 9 người chịu cầu -> suất chuẩn 21.000 -> nửa buổi 10.500.
    expect(p2.shuttleShare).toBe(10500);
    expect(p2.courtShare).toBe(28000);
    expect(p2.roundedPayable).toBe(38500);
  });

  it('người chơi cả buổi gánh phần cầu còn lại và được làm tròn sau khi cộng', () => {
    const p6 = byId.get('p6')!;
    expect(p6.shuttleShare).toBeCloseTo(22312.5, 6); // (189.000 - 10.500) / 8
    expect(p6.grossAmount).toBeCloseTo(50312.5, 6);
    expect(p6.roundedPayable).toBe(50500);
    expect(calculatePlayerPayment('p6', session, SETTINGS).roundedPayable).toBe(50500);
  });

  it('advance payment: trừ tiền đã ứng vào số còn phải thu', () => {
    const p3 = byId.get('p3')!;
    expect(p3.roundedPayable).toBe(50500);
    expect(p3.outstanding).toBe(15500);
  });

  it('shuttle contribution: trừ trước khi làm tròn, không đổi tổng chi', () => {
    const p4 = byId.get('p4')!;
    expect(p4.netAmount).toBeCloseTo(23312.5, 6);
    expect(p4.roundedPayable).toBe(23500);
    expect(rowByKey.get('p4')!.notes).toContain('Đã đóng góp cầu – 27.000 ₫');
    expect(result.reconciliation.totalCost).toBe(469000);
  });

  it('2 guest merge: người giới thiệu trả phần mình + 2 khách', () => {
    const row = rowByKey.get('p5')!;
    expect(row.guestCount).toBe(2);
    expect(row.playerIds).toEqual(['p5', 'g1', 'g2']);
    expect(row.roundedPayable).toBe(151500); // 3 × 50.500, làm tròn từng người rồi mới gộp
    expect(row.notes[0]).toBe('Bao gồm 2 bạn');
    expect(rowByKey.has('g1')).toBe(false);
    expect(result.rows).toHaveLength(8);
  });

  it('guest không gộp: mỗi người một dòng', () => {
    const rows = mergeGuestPayment(calculateSessionPlayerPayments(session, SETTINGS), false);
    expect(rows).toHaveLength(10);
    const guest = rows.find((r) => r.key === 'g1')!;
    expect(guest.roundedPayable).toBe(50500);
    expect(guest.notes).toContain('Khách của p5');
    expect(rows.find((r) => r.key === 'p5')!.roundedPayable).toBe(50500);
  });

  it('reconcile: tổng phải thu, đã thu, còn thiếu và rounding adjustment', () => {
    const r = result.reconciliation;
    expect(r.totalCourt).toBe(280000);
    expect(r.totalShuttle).toBe(189000);
    expect(r.totalCost).toBe(469000);
    // 28.000 + 38.500 + 7 × 50.500 + 23.500
    expect(r.totalPayable).toBe(443500);
    expect(r.totalContribution).toBe(27000);
    expect(r.totalCollected).toBe(35000);
    expect(r.totalOutstanding).toBe(408500);
    expect(r.totalOverpaid).toBe(0);
    expect(r.roundingAdjustment).toBe(1500); // 8 người × 187,5
    expect(r.difference).toBe(1500);
    expect(r.unallocatedCourt).toBe(0);
    expect(r.unallocatedShuttle).toBe(0);
  });

  it('tổng các dòng gộp bằng tổng từng người', () => {
    const sumRows = result.rows.reduce((s, row) => s + row.roundedPayable, 0);
    expect(sumRows).toBe(result.reconciliation.totalPayable);
  });
});

describe('các trường hợp tính tiền khác', () => {
  it('guest merge 1 khách: Phi 70.000 + bạn Phi 35.000 = 105.000', () => {
    const players = [makePlayer('Phi', 'TB'), makePlayer('Bạn Phi', 'TBY', 'male', true)];
    let session = makeSession(players, { courtCost: 70000, shuttleCost: 35000 });
    session = patchPayment(session, 'Bạn Phi', { referrerPlayerId: 'Phi', payCourt: false });
    const rows = calculateSessionPayments(session, SETTINGS).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Phi', roundedPayable: 105000, guestCount: 1 });
    expect(rows[0]!.notes[0]).toBe('Bao gồm 1 bạn');
  });

  it('halfPlayCourtMode = half: người nửa buổi chỉ trả 50% suất sân', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id, 'TB'));
    const session = patchPayment(makeSession(players, { courtCost: 90000, shuttleCost: 0 }), 'a', { playFraction: 0.5 });
    const half = calculateSessionPayments(session, { halfPlayCourtMode: 'half' }).players;
    expect(half.map((p) => p.courtShare)).toEqual([15000, 37500, 37500]);
    const full = calculateSessionPayments(session, { halfPlayCourtMode: 'full' }).players;
    expect(full.map((p) => p.courtShare)).toEqual([30000, 30000, 30000]);
  });

  it('đã thu thêm và đóng dư', () => {
    const players = ['a', 'b'].map((id) => makePlayer(id, 'TB'));
    let session = makeSession(players, { courtCost: 100000, shuttleCost: 30000 });
    session = patchPayment(session, 'a', { advancePayment: 35000, paidAmount: 10000 });
    session = patchPayment(session, 'b', { paidAmount: 100000 });
    const { players: payments, reconciliation, rows } = calculateSessionPayments(session, SETTINGS);
    expect(payments[0]).toMatchObject({ roundedPayable: 65000, outstanding: 20000, overpaid: 0 });
    expect(payments[1]).toMatchObject({ roundedPayable: 65000, outstanding: 0, overpaid: 35000 });
    expect(rows.map((r) => r.status)).toEqual(['partial', 'overpaid']);
    expect(reconciliation.totalCollected).toBe(145000);
    expect(reconciliation.totalOutstanding).toBe(20000);
    expect(reconciliation.totalOverpaid).toBe(35000);
  });

  it('làm tròn từng người chứ không làm tròn tổng: 3 người chia 100.000', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id, 'TB'));
    const session = makeSession(players, { courtCost: 100000, shuttleCost: 0 });
    const { players: payments, reconciliation } = calculateSessionPayments(session, SETTINGS);
    expect(payments.map((p) => p.roundedPayable)).toEqual([33500, 33500, 33500]);
    expect(reconciliation.totalPayable).toBe(100500);
    expect(reconciliation.roundingAdjustment).toBe(500);
  });

  it('không có ai chịu tiền cầu -> báo phần chi chưa phân bổ', () => {
    const players = ['a', 'b'].map((id) => makePlayer(id, 'TB'));
    let session = makeSession(players, { courtCost: 60000, shuttleCost: 40000 });
    session = patchPayment(session, 'a', { playFraction: 0, payShuttle: false });
    session = patchPayment(session, 'b', { playFraction: 0, payShuttle: false });
    const r = reconcileSession(session, SETTINGS);
    expect(r.unallocatedShuttle).toBe(40000);
    expect(r.difference).toBe(-40000);
  });

  it('người giới thiệu không hợp lệ (chính mình, không tồn tại, vòng lặp) bị bỏ qua', () => {
    const players = ['a', 'b', 'c'].map((id) => makePlayer(id, 'TB'));
    let session = makeSession(players, { courtCost: 90000, shuttleCost: 0 });
    session = patchPayment(session, 'a', { referrerPlayerId: 'a' });
    session = patchPayment(session, 'b', { referrerPlayerId: 'c' });
    session = patchPayment(session, 'c', { referrerPlayerId: 'b' });
    const rows = calculateSessionPayments(session, SETTINGS).rows;
    expect(rows).toHaveLength(3);
    session = patchPayment(session, 'c', { referrerPlayerId: 'ghost' });
    expect(calculateSessionPayments(session, SETTINGS).rows.map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('applyPaidToRow phân bổ tiền đã thu cho cả nhóm gộp', () => {
    const players = [makePlayer('Phi', 'TB'), makePlayer('g1', 'TB', 'male', true), makePlayer('g2', 'TB', 'male', true)];
    let session = makeSession(players, { courtCost: 90000, shuttleCost: 0 });
    session = patchPayment(session, 'g1', { referrerPlayerId: 'Phi' });
    session = patchPayment(session, 'g2', { referrerPlayerId: 'Phi' });
    const row = calculateSessionPayments(session, SETTINGS).rows[0]!;
    const payments = applyPaidToRow(session, SETTINGS, row, 100000);
    expect(payments.map((p) => p.paidAmount)).toEqual([40000, 30000, 30000]);
    const after = calculateSessionPayments({ ...session, payments }, SETTINGS).rows[0]!;
    expect(after).toMatchObject({ paidAmount: 100000, outstanding: 0, overpaid: 10000 });
  });
});
