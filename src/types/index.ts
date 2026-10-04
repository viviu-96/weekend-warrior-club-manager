export type Gender = 'male' | 'female';
export type PlayerType = 'default' | 'walk_in';
export type PlayFraction = 0 | 0.5 | 1;
export type HalfPlayCourtMode = 'full' | 'half';

export interface Level {
  name: string;
  score: number;
}

export interface Settings {
  clubName: string;
  levels: Level[];
  /** Cách tính tiền sân cho người chơi nửa buổi. */
  halfPlayCourtMode: HalfPlayCourtMode;
  defaultCourtCount: number;
  defaultTime: string;
  mergeGuestsByDefault: boolean;
}

export interface Member {
  id: string;
  name: string;
  gender: Gender;
  level: string;
  note: string;
}

/**
 * Người tham gia một buổi chơi. Là bản chụp (snapshot) tại thời điểm chơi:
 * thành viên CLB (memberId != null) hoặc người vãng lai (memberId = null).
 * gender/level có thể null khi vừa import và chưa xác định.
 */
export interface SessionPlayer {
  id: string;
  memberId: string | null;
  name: string;
  gender: Gender | null;
  level: string | null;
  playerType: PlayerType;
  /** Nghỉ, không tham gia xếp cặp. */
  resting: boolean;
}

export type TeamIds = [string, string];

export interface Match {
  id: string;
  /** Lượt đấu trong buổi (1, 2, 3...). Mỗi người chỉ xuất hiện một lần trong một lượt. */
  round: number;
  matchNumber: number;
  court: number;
  teamA: TeamIds;
  teamB: TeamIds;
  /** Tỉ số của đội A / đội B; để trống khi chưa ghi kết quả. */
  scoreA?: number | null;
  scoreB?: number | null;
}

export interface PaymentEntry {
  playerId: string;
  playFraction: PlayFraction;
  payCourt: boolean;
  payShuttle: boolean;
  advancePayment: number;
  shuttleContribution: number;
  paidAmount: number;
  referrerPlayerId: string | null;
  note: string;
}

export interface Session {
  id: string;
  date: string;
  dayOfWeek: string;
  time: string;
  courtCount: number;
  courtCost: number;
  shuttleCost: number;
  players: SessionPlayer[];
  pairings: Match[];
  payments: PaymentEntry[];
  notes: string;
  pairingLocked: boolean;
  paymentLocked: boolean;
  mergeGuests: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  members: Member[];
  sessions: Session[];
  settings: Settings;
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  playerId?: string;
}
