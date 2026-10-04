import type { ReactNode } from 'react';
import { MoneyInput, Select, TextInput } from '../../components/ui';
import { getPaymentEntry } from '../../services/paymentService';
import { updatePaymentEntry } from '../../services/sessionService';
import type { PaymentEntry, PlayFraction, Session } from '../../types';
import { PlayerTypeBadge } from '../members/fields';

interface Props {
  session: Session;
  disabled: boolean;
  onChange: (session: Session) => void;
}

function Labelled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-500 lg:hidden">{label}</span>
      {children}
    </div>
  );
}

const GRID = 'lg:grid-cols-[minmax(8.5rem,1.2fr)_8.5rem_3.5rem_3.5rem_6.5rem_6.5rem_minmax(8.5rem,1fr)_minmax(4rem,0.8fr)]';

/** Thiết lập tính tiền cho từng người: tham gia, tính sân/cầu, đã ứng, góp cầu, người giới thiệu. */
export function PaymentConfigList({ session, disabled, onChange }: Props) {
  const patch = (playerId: string, change: Partial<PaymentEntry>) => onChange(updatePaymentEntry(session, playerId, change));

  return (
    <div>
      <div className={`hidden gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-600 lg:grid ${GRID}`} aria-hidden="true">
        <span>Tên</span>
        <span>Tham gia</span>
        <span>Tính sân</span>
        <span>Tính cầu</span>
        <span>Đã ứng</span>
        <span>Góp cầu</span>
        <span>Người giới thiệu</span>
        <span>Ghi chú</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {session.players.map((player) => {
          const entry = getPaymentEntry(session, player.id);
          const name = player.name || '(chưa có tên)';
          return (
            <li key={player.id} className={`grid grid-cols-2 items-center gap-2 py-3 lg:py-2 ${GRID}`}>
              <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
                <span className="text-sm font-semibold text-slate-900">{name}</span>
                {player.playerType === 'walk_in' && <PlayerTypeBadge type="walk_in" />}
              </div>

              <Labelled label="Tham gia">
                <Select
                  aria-label={`Mức tham gia của ${name}`}
                  disabled={disabled}
                  value={String(entry.playFraction)}
                  onChange={(event) => patch(player.id, { playFraction: Number(event.target.value) as PlayFraction })}
                >
                  <option value="1">Cả buổi</option>
                  <option value="0.5">Nửa buổi</option>
                  <option value="0">Không chơi</option>
                </Select>
              </Labelled>

              <div className="col-span-1 flex items-center gap-4 lg:contents">
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-700"
                    aria-label={`Tính tiền sân cho ${name}`}
                    disabled={disabled}
                    checked={entry.payCourt}
                    onChange={(event) => patch(player.id, { payCourt: event.target.checked })}
                  />
                  <span className="lg:hidden">Sân</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-700"
                    aria-label={`Tính tiền cầu cho ${name}`}
                    disabled={disabled || entry.playFraction === 0}
                    checked={entry.payShuttle && entry.playFraction > 0}
                    onChange={(event) => patch(player.id, { payShuttle: event.target.checked })}
                  />
                  <span className="lg:hidden">Cầu</span>
                </label>
              </div>

              <Labelled label="Đã ứng">
                <MoneyInput label={`Tiền đã ứng của ${name}`} disabled={disabled} value={entry.advancePayment} onChange={(advancePayment) => patch(player.id, { advancePayment })} />
              </Labelled>
              <Labelled label="Góp cầu">
                <MoneyInput label={`Tiền đóng góp cầu của ${name}`} disabled={disabled} value={entry.shuttleContribution} onChange={(shuttleContribution) => patch(player.id, { shuttleContribution })} />
              </Labelled>

              <Labelled label="Người giới thiệu">
                <Select
                  aria-label={`Người giới thiệu của ${name}`}
                  disabled={disabled}
                  value={entry.referrerPlayerId ?? ''}
                  onChange={(event) => patch(player.id, { referrerPlayerId: event.target.value || null })}
                >
                  <option value="">Không có</option>
                  {session.players
                    .filter((other) => other.id !== player.id)
                    .map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                </Select>
              </Labelled>
              <Labelled label="Ghi chú">
                <TextInput aria-label={`Ghi chú cho ${name}`} disabled={disabled} value={entry.note} onChange={(event) => patch(player.id, { note: event.target.value })} />
              </Labelled>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
