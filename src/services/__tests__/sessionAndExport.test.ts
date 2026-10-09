import { describe, expect, it } from 'vitest';
import seedMembers from '../../data/seed/members.json';
import seedSessions from '../../data/seed/sessions.json';
import seedSettings from '../../data/seed/settings.json';
import { formatVND, formatVNDCompact, getDayOfWeek, parseMoneyInput } from '../../utils/format';
import { exportCSV, exportJSON, generateZaloPairingText, generateZaloPaymentText } from '../exportService';
import { findMembersByName, parseNameList, searchMembers, sortMembersBy, type MemberSort } from '../memberService';
import { generateMatches, getEligiblePlayers, createSeededRng } from '../pairingService';
import { calculateSessionPayments } from '../paymentService';
import {
  createSession,
  duplicateSession,
  getDefaultShuttleBoxPrice,
  isShuttleCostAuto,
  makeSessionId,
  removePlayer,
  setManualShuttleCost,
  syncPayments,
  updatePaymentEntry,
  updateShuttleUsage,
} from '../sessionService';
import { parseAppData, parseBackupText, validateForPairing, validatePayments } from '../validationService';
import { LEVELS, makePlayer, makeSession, patchPayment, SETTINGS } from './testHelpers';

function loadSeed() {
  const { data, errors } = parseAppData({ members: seedMembers, sessions: seedSessions, settings: seedSettings });
  expect(errors).toEqual([]);
  return data!;
}

describe('định dạng', () => {
  it('hiển thị tiền VNĐ có dấu chấm phân cách', () => {
    expect(formatVND(35000)).toBe('35.000 ₫');
    expect(formatVND(120000)).toBe('120.000 ₫');
    expect(formatVND(1250000)).toBe('1.250.000 ₫');
    expect(formatVND(0)).toBe('0 ₫');
    expect(formatVNDCompact(94000)).toBe('94.000đ');
    expect(parseMoneyInput('1.250.000 ₫')).toBe(1250000);
  });

  it('tính thứ trong tuần từ ngày', () => {
    expect(getDayOfWeek('2026-09-26')).toBe('Thứ 7');
    expect(getDayOfWeek('2026-09-27')).toBe('Chủ nhật');
  });
});

describe('dữ liệu mẫu', () => {
  const data = loadSeed();
  const session = data.sessions[0]!;

  it('đọc được và đúng cấu trúc', () => {
    expect(data.members).toHaveLength(18);
    expect(session.players).toHaveLength(18);
    expect(session.players.filter((p) => p.playerType === 'walk_in')).toHaveLength(3);
    expect(data.settings.levels.map((l) => l.score)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('xếp cặp buổi mẫu: 17 người sẵn sàng -> 4 trận, 1 người chờ', () => {
    const eligible = getEligiblePlayers(session.players, data.settings.levels);
    expect(eligible).toHaveLength(17);
    const result = generateMatches(eligible, { levels: data.settings.levels, courtCount: 2, rng: createSeededRng(7) });
    expect(result.matches).toHaveLength(4);
    expect(result.unassignedPlayerIds).toHaveLength(1);
    expect(result.balanceScore).toBeGreaterThanOrEqual(80);
  });

  it('tính tiền buổi mẫu khớp tổng chi', () => {
    const { rows, reconciliation } = calculateSessionPayments(session, data.settings);
    expect(rows).toHaveLength(15); // 3 khách được gộp
    expect(reconciliation.totalCost).toBe(469000);
    expect(reconciliation.difference).toBe(reconciliation.roundingAdjustment);
    expect(reconciliation.roundingAdjustment).toBeGreaterThanOrEqual(0);
    expect(reconciliation.roundingAdjustment).toBeLessThan(500 * 18);
    expect(rows.find((r) => r.name === 'Hảo')!.shuttleShare).toBe(0);
  });
});

describe('sessionService', () => {
  it('tạo id theo ngày và tránh trùng', () => {
    expect(makeSessionId('2026-09-26', [])).toBe('session_2026_09_26');
    expect(makeSessionId('2026-09-26', ['session_2026_09_26'])).toBe('session_2026_09_26_2');
  });

  it('createSession dùng giá trị mặc định từ cài đặt', () => {
    const session = createSession(SETTINGS, [], '2026-10-03');
    expect(session).toMatchObject({ dayOfWeek: 'Thứ 7', courtCount: 1, time: '08:00-10:00', courtCost: 0, players: [] });
  });

  it('duplicateSession giữ người chơi, reset chi phí / thanh toán / xếp cặp', () => {
    const source = loadSeed().sessions[0]!;
    const paired = {
      ...source,
      pairingLocked: true,
      paymentLocked: true,
      pairings: generateMatches(getEligiblePlayers(source.players, LEVELS), { levels: LEVELS, courtCount: 2 }).matches,
    };
    const copy = duplicateSession(paired, { date: '2026-10-03', keepGuests: true }, [paired]);
    expect(copy.id).toBe('session_2026_10_03');
    expect(copy.date).toBe('2026-10-03');
    expect(copy.players).toHaveLength(18);
    expect(copy).toMatchObject({ courtCost: 0, shuttleCost: 0, pairings: [], pairingLocked: false, paymentLocked: false });
    for (const entry of copy.payments) {
      expect(entry).toMatchObject({ advancePayment: 0, paidAmount: 0, shuttleContribution: 0, playFraction: 1 });
    }
    // Quan hệ khách – người giới thiệu được giữ lại.
    expect(copy.payments.filter((e) => e.referrerPlayerId !== null)).toHaveLength(3);

    const noGuests = duplicateSession(paired, { date: '2026-10-03', keepGuests: false }, [paired, copy]);
    expect(noGuests.id).toBe('session_2026_10_03_2');
    expect(noGuests.players).toHaveLength(15);
    expect(noGuests.payments.every((e) => e.referrerPlayerId === null)).toBe(true);
  });

  it('xoá người chơi: bỏ dòng thanh toán và tham chiếu người giới thiệu', () => {
    const players = [makePlayer('a', 'TB'), makePlayer('b', 'TB', 'male', true)];
    const session = patchPayment(makeSession(players), 'b', { referrerPlayerId: 'a' });
    const next = removePlayer(session, 'a');
    expect(next.players.map((p) => p.id)).toEqual(['b']);
    expect(next.payments).toHaveLength(1);
    expect(next.payments[0]!.referrerPlayerId).toBeNull();
  });

  it('chuyển sang "không chơi" tự tắt tính tiền cầu', () => {
    const session = makeSession([makePlayer('a', 'TB')]);
    const off = updatePaymentEntry(session, 'a', { playFraction: 0 });
    expect(off.payments[0]).toMatchObject({ playFraction: 0, payShuttle: false, payCourt: true });
    const on = updatePaymentEntry(off, 'a', { playFraction: 1 });
    expect(on.payments[0]!.payShuttle).toBe(true);
  });

  it('đổi giá hộp hoặc số quả thì tiền cầu tự tính lại', () => {
    const base = makeSession([makePlayer('a', 'TB')], { shuttleCost: 0 });
    const withPrice = updateShuttleUsage(base, { shuttleBoxPrice: 324000 }, 12);
    expect(withPrice).toMatchObject({ shuttleBoxPrice: 324000, shuttleCount: null, shuttleCost: 0 });
    const counted = updateShuttleUsage(withPrice, { shuttleCount: 7 }, 12);
    expect(counted).toMatchObject({ shuttleCount: 7, shuttleCost: 189000 });
    expect(updateShuttleUsage(counted, { shuttleCount: 9 }, 12).shuttleCost).toBe(243000);
    expect(updateShuttleUsage(counted, { shuttleBoxPrice: 360000 }, 12).shuttleCost).toBe(210000);
    expect(updateShuttleUsage(counted, { shuttleCount: 0 }, 12).shuttleCost).toBe(0);
    // Tiền cầu tự tính đi thẳng vào phần chia tiền.
    expect(calculateSessionPayments(counted, SETTINGS).reconciliation.totalShuttle).toBe(189000);
  });

  it('xoá giá hộp hoặc số quả khi tiền cầu đang tự tính thì tiền cầu về 0', () => {
    const counted = updateShuttleUsage(makeSession([makePlayer('a', 'TB')]), { shuttleBoxPrice: 324000, shuttleCount: 5 }, 12);
    expect(counted.shuttleCost).toBe(135000);
    expect(isShuttleCostAuto(counted)).toBe(true);

    const noCount = updateShuttleUsage(counted, { shuttleCount: null }, 12);
    expect(noCount).toMatchObject({ shuttleCount: null, shuttleBoxPrice: 324000, shuttleCost: 0 });
    const noPrice = updateShuttleUsage(counted, { shuttleBoxPrice: null }, 12);
    expect(noPrice).toMatchObject({ shuttleCount: 5, shuttleBoxPrice: null, shuttleCost: 0 });

    // Xoá cả hai ô, theo thứ tự nào thì tiền cầu cũng bằng 0.
    expect(updateShuttleUsage(noCount, { shuttleBoxPrice: null }, 12)).toMatchObject({ shuttleCount: null, shuttleBoxPrice: null, shuttleCost: 0 });
    expect(updateShuttleUsage(noPrice, { shuttleCount: null }, 12)).toMatchObject({ shuttleCount: null, shuttleBoxPrice: null, shuttleCost: 0 });
    expect(calculateSessionPayments(noCount, SETTINGS).reconciliation.totalShuttle).toBe(0);

    // Nhập lại thì tính lại ngay.
    expect(updateShuttleUsage(noCount, { shuttleCount: 2 }, 12).shuttleCost).toBe(54000);
    expect(updateShuttleUsage(noPrice, { shuttleBoxPrice: 330000 }, 12).shuttleCost).toBe(137500);
  });

  it('tiền cầu nhập tay không bị xoá khi mới điền một trong hai ô', () => {
    const manual = makeSession([makePlayer('a', 'TB')], { shuttleCost: 150000 });
    expect(isShuttleCostAuto(manual)).toBe(false);
    expect(updateShuttleUsage(manual, { shuttleCount: 5 }, 12)).toMatchObject({ shuttleCount: 5, shuttleCost: 150000 });
    expect(updateShuttleUsage(manual, { shuttleBoxPrice: 330000 }, 12)).toMatchObject({ shuttleBoxPrice: 330000, shuttleCost: 150000 });
    expect(updateShuttleUsage(manual, { shuttleCount: null }, 12).shuttleCost).toBe(150000);
  });

  it('nhập tay tiền cầu thì bỏ số quả để không bị tính đè', () => {
    const counted = updateShuttleUsage(makeSession([makePlayer('a', 'TB')]), { shuttleBoxPrice: 324000, shuttleCount: 7 }, 12);
    expect(setManualShuttleCost(counted, 200000)).toMatchObject({ shuttleCost: 200000, shuttleCount: null, shuttleBoxPrice: 324000 });
  });

  it('buổi mới lấy giá hộp từ Cài đặt, nếu chưa đặt thì lấy của buổi gần nhất', () => {
    expect(createSession({ ...SETTINGS, shuttleBoxPrice: 300000 }, [], '2026-10-10')).toMatchObject({ shuttleBoxPrice: 300000, shuttleCount: null, shuttleCost: 0 });
    const older = makeSession([], { id: 'old', date: '2026-09-01', shuttleBoxPrice: 280000 });
    const newer = makeSession([], { id: 'new', date: '2026-09-20', shuttleBoxPrice: 324000 });
    const noPrice = makeSession([], { id: 'none', date: '2026-09-27' });
    const unset = { ...SETTINGS, shuttleBoxPrice: 0 };
    expect(getDefaultShuttleBoxPrice(unset, [older, newer, noPrice])).toBe(324000);
    expect(createSession(unset, [older, newer, noPrice], '2026-10-10').shuttleBoxPrice).toBe(324000);
    expect(createSession(unset, [], '2026-10-10').shuttleBoxPrice).toBeNull();
    // Mặc định của ứng dụng là 330.000 ₫ một hộp.
    expect(SETTINGS.shuttleBoxPrice).toBe(330000);
    expect(createSession(SETTINGS, [older, newer], '2026-10-10').shuttleBoxPrice).toBe(330000);
  });

  it('nhân bản buổi giữ giá hộp, đặt lại số quả và tiền cầu', () => {
    const source = updateShuttleUsage(makeSession([makePlayer('a', 'TB')]), { shuttleBoxPrice: 324000, shuttleCount: 7 }, 12);
    expect(duplicateSession(source, { date: '2026-10-03', keepGuests: true }, [source])).toMatchObject({ shuttleBoxPrice: 324000, shuttleCount: null, shuttleCost: 0 });
  });

  it('dữ liệu cũ không có giá hộp / số quả vẫn đọc được', () => {
    const { shuttleBoxPrice: _price, shuttleCount: _count, ...legacy } = makeSession([makePlayer('a', 'TB')]);
    const { data } = parseAppData({ members: [], sessions: [legacy], settings: { levels: LEVELS } });
    expect(data!.sessions[0]).toMatchObject({ shuttleCost: 189000, shuttleBoxPrice: null, shuttleCount: null });
    expect(data!.settings).toMatchObject({ shuttleBoxPrice: 330000, shuttlesPerBox: 12 });
  });

  it('syncPayments thêm dòng thanh toán cho người mới', () => {
    const session = makeSession([makePlayer('a', 'TB')], { payments: [] });
    expect(syncPayments(session).payments).toHaveLength(1);
  });
});

describe('validation', () => {
  it('báo lỗi tiếng Việt cho các trường hợp thiếu thông tin', () => {
    const players = [
      { ...makePlayer('a', 'TB'), name: '' },
      { ...makePlayer('b', 'TB'), gender: null },
      { ...makePlayer('c', 'TB'), level: null },
      { ...makePlayer('d', 'TB'), memberId: 'member_b' },
    ];
    const issues = validateForPairing(makeSession(players), [], LEVELS);
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['NAME_EMPTY', 'GENDER_EMPTY', 'LEVEL_EMPTY', 'DUPLICATE_PLAYER', 'MEMBER_MISSING', 'NOT_ENOUGH_PLAYERS']));
    expect(validateForPairing(makeSession([]), [], LEVELS)[0]!.message).toBe('Chưa có người chơi nào trong buổi.');
  });

  it('kiểm tra dữ liệu tính tiền', () => {
    const players = [makePlayer('a', 'TB'), makePlayer('b', 'TB')];
    let session = makeSession(players, { courtCost: -1 });
    session = patchPayment(session, 'a', { referrerPlayerId: 'a', playFraction: 0, payShuttle: true });
    session = patchPayment(session, 'b', { referrerPlayerId: 'ghost' });
    const codes = validatePayments(session).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['COURT_NEGATIVE', 'REFERRER_SELF', 'REFERRER_MISSING', 'SHUTTLE_NOT_PLAYING']));
  });

  it('import JSON lỗi không làm crash và trả về thông báo', () => {
    expect(parseBackupText('{ không phải json').errors).toEqual(['File không phải JSON hợp lệ.']);
    expect(parseBackupText('[]').data).toBeNull();
    const bad = parseAppData({ members: [{ id: 'x', name: '', gender: 'male', level: 'TB' }], sessions: [], settings: seedSettings });
    expect(bad.data).toBeNull();
    expect(bad.errors[0]).toContain('thiếu tên');
  });
});

describe('memberService', () => {
  const members = loadSeed().members;

  it('autocomplete không phân biệt dấu', () => {
    expect(searchMembers(members, 'hu').map((m) => m.name)).toEqual(['Hùng']);
    expect(searchMembers(members, 'ha').map((m) => m.name)).toEqual(['Hà', 'Hạnh', 'Hảo']);
    expect(searchMembers(members, '')).toEqual([]);
  });

  it('thành viên trùng tên được trả về đầy đủ để admin chọn', () => {
    const twins = [...members, { id: 'member_x', name: 'Quang', gender: 'female' as const, level: 'Y', note: '' }];
    expect(findMembersByName(twins, 'quang')).toHaveLength(2);
  });

  it('sắp xếp theo cột, trình độ so theo điểm và tên là tiêu chí phụ', () => {
    const names = (sort: MemberSort) => sortMembersBy(members, sort, LEVELS).map((m) => m.name);
    expect(names({ key: 'level', direction: 'desc' }).slice(0, 4)).toEqual(['Đạt', 'Tuấn', 'Hùng', 'Quang']);
    expect(names({ key: 'level', direction: 'asc' }).slice(0, 3)).toEqual(['Hạnh', 'Hảo', 'Luân']);
    expect(names({ key: 'name', direction: 'asc' })[0]).toBe('Duy');
    expect(names({ key: 'gender', direction: 'desc' }).slice(0, 2)).toEqual(['Hà', 'Hạnh']);
  });

  it('tách danh sách tên dán vào', () => {
    expect(parseNameList('1. Quang\n2) Hùng\n- Sáng\n\n  Việt  ')).toEqual(['Quang', 'Hùng', 'Sáng', 'Việt']);
  });
});

describe('export', () => {
  const players = [
    makePlayer('Hạnh', 'New', 'female'),
    makePlayer('Luân', 'Y'),
    makePlayer('Phi', 'TB'),
    makePlayer('Bạn Phi', 'TBY', 'male', true),
  ];
  let session = makeSession(players, { courtCost: 112000, shuttleCost: 76000 });
  session = patchPayment(session, 'Luân', { advancePayment: 17000 });
  session = patchPayment(session, 'Bạn Phi', { referrerPlayerId: 'Phi' });

  it('nội dung Zalo thu tiền: gộp khách, trừ tiền ứng, không có thông tin kỹ thuật', () => {
    expect(generateZaloPaymentText(session, SETTINGS)).toBe(
      [
        '💰 THU TIỀN CẦU LÔNG',
        '📅 Thứ 7 – 26/09/2026',
        '',
        'Hạnh: 47.000đ',
        'Luân: 30.000đ',
        'Phi: 94.000đ (bao gồm 1 bạn)',
        '',
        'Tổng: 171.000đ',
      ].join('\n'),
    );
  });

  it('nội dung Zalo xếp cặp', () => {
    const paired = {
      ...session,
      pairings: [{ id: 'm1', round: 1, matchNumber: 1, court: 1, teamA: ['Phi', 'Hạnh'] as [string, string], teamB: ['Luân', 'Bạn Phi'] as [string, string] }],
    };
    expect(generateZaloPairingText(paired, { levels: LEVELS })).toBe(
      ['🏸 XẾP CẶP CẦU LÔNG', '📅 Thứ 7 – 26/09/2026', '', '🏟 SÂN 1', '', 'Trận 1', 'Phi + Hạnh', 'VS', 'Luân + Bạn Phi'].join('\n'),
    );
  });

  it('CSV có BOM, tiêu đề và dòng tổng', () => {
    const csv = exportCSV(session, SETTINGS);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain('Thành tiền');
    expect(lines[2]).toContain('Luân,Mặc định,Nam,Y,Cả buổi,28000,19000,0,47000,17000,0,30000,0');
  });

  it('JSON export đọc lại được nguyên vẹn', () => {
    expect(JSON.parse(exportJSON(session))).toEqual(session);
  });
});
