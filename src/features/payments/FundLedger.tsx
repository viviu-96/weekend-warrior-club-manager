import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Card, cx, Field, MoneyInput, Select, TextInput } from '../../components/ui';
import { useAppData } from '../../hooks/useAppData';
import { useFeedback } from '../../hooks/useFeedback';
import { addFundTransaction, buildFundLedger, createFundTransaction, removeFundTransaction, type FundEntry } from '../../services/ledgerService';
import type { FundTransactionType } from '../../types';
import { formatDate, formatVND, parseISODate, todayISO } from '../../utils/format';

/** Sổ quỹ CLB: thu chi của các buổi (tự động) + các khoản nhập tay. */
export function FundLedger() {
  const { sessions, settings, updateSettings } = useAppData();
  const { toast, confirm } = useFeedback();
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<FundTransactionType>('expense');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(settings.fund.openingBalance);

  const ledger = buildFundLedger(sessions, settings);
  const newestFirst = [...ledger.entries].reverse();

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!parseISODate(date)) return setError('Vui lòng chọn ngày hợp lệ.');
    if (amount <= 0) return setError('Vui lòng nhập số tiền lớn hơn 0.');
    if (!note.trim()) return setError('Vui lòng nhập nội dung khoản thu / chi.');
    setError('');
    const fund = addFundTransaction(settings.fund, createFundTransaction({ date, type, amount, note }));
    if (await updateSettings({ ...settings, fund })) {
      setAmount(0);
      setNote('');
      toast(type === 'income' ? 'Đã ghi khoản thu.' : 'Đã ghi khoản chi.');
    }
  };

  const remove = async (entry: FundEntry) => {
    if (!entry.transactionId) return;
    const ok = await confirm({ title: 'Xoá khoản thu / chi', message: `Xoá “${entry.label}” (${formatVND(Math.abs(entry.amount))})?`, confirmLabel: 'Xoá', danger: true });
    if (ok && (await updateSettings({ ...settings, fund: removeFundTransaction(settings.fund, entry.transactionId) }))) toast('Đã xoá.');
  };

  const saveOpening = async () => {
    if (opening === settings.fund.openingBalance) return;
    if (await updateSettings({ ...settings, fund: { ...settings.fund, openingBalance: opening } })) toast('Đã lưu số dư đầu kỳ.');
  };

  const tiles = [
    { label: 'Số dư quỹ', value: formatVND(ledger.balance), note: ledger.balance < 0 ? '⚠ Quỹ đang âm' : '✓ Quỹ dương', strong: true },
    { label: 'Tổng thu', value: formatVND(ledger.totalIncome), note: 'Tiền thu các buổi + thu khác' },
    { label: 'Tổng chi', value: formatVND(ledger.totalExpense), note: 'Sân, cầu các buổi + chi khác' },
    { label: 'Còn phải thu', value: formatVND(ledger.receivable), note: 'Thành viên còn nợ, chưa vào quỹ' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={cx(
              'animate-rise rounded-xl border p-4 shadow-sm',
              tile.strong ? 'border-transparent bg-gradient-to-br from-emerald-700 to-teal-900 text-white' : 'border-slate-200/80 bg-white',
            )}
          >
            <p className={cx('text-xs font-medium', tile.strong ? 'text-emerald-100' : 'text-slate-600')}>{tile.label}</p>
            <p className={cx('mt-1 text-xl font-bold tabular-nums', !tile.strong && 'text-slate-900')}>{tile.value}</p>
            <p className={cx('mt-0.5 text-xs', tile.strong ? 'text-emerald-100' : 'text-slate-500')}>{tile.note}</p>
          </div>
        ))}
      </div>

      <Card title="Ghi khoản thu / chi khác" collapsible storageKey="fund.form">
        <form onSubmit={add} className="grid grid-cols-2 items-end gap-3 md:grid-cols-[9.5rem_8rem_9rem_1fr_auto]">
          <Field label="Ngày">
            <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Loại">
            <Select value={type} onChange={(event) => setType(event.target.value === 'income' ? 'income' : 'expense')}>
              <option value="expense">Chi</option>
              <option value="income">Thu</option>
            </Select>
          </Field>
          <Field label="Số tiền">
            <MoneyInput label="Số tiền" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Nội dung">
            <TextInput value={note} placeholder="Ví dụ: Mua 2 ống cầu dự trữ" onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Button variant="primary" type="submit" icon={<Plus size={16} aria-hidden="true" />} className="col-span-2 md:col-span-1">
            Ghi sổ
          </Button>
          {error && (
            <p role="alert" className="col-span-full text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <Field label="Số dư đầu kỳ (trước khi dùng ứng dụng)" className="w-56">
            <MoneyInput label="Số dư đầu kỳ" value={opening} onChange={setOpening} />
          </Field>
          <Button onClick={() => void saveOpening()} disabled={opening === settings.fund.openingBalance}>
            Lưu số dư đầu
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tiền sân và tiền cầu của mỗi buổi đã được tự ghi là khoản chi. Chỉ ghi tay những khoản ngoài buổi chơi (mua cầu dự trữ, liên hoan, ủng hộ…) để
          không bị tính hai lần.
        </p>
      </Card>

      <Card title={`Sổ quỹ (${ledger.entries.length} dòng)`}>
        {newestFirst.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có khoản thu chi nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-600">
                  <th scope="col" className="w-24 py-2 pr-2">Ngày</th>
                  <th scope="col" className="py-2 pr-2">Nội dung</th>
                  <th scope="col" className="py-2 pr-2 text-right">Thu</th>
                  <th scope="col" className="py-2 pr-2 text-right">Chi</th>
                  <th scope="col" className="py-2 pr-2 text-right">Số dư</th>
                  <th scope="col" className="w-10 py-2"><span className="sr-only">Xoá</span></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {newestFirst.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-2 whitespace-nowrap text-slate-600">{formatDate(entry.date)}</td>
                    <td className="py-2 pr-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-900">
                        {entry.amount >= 0 ? (
                          <ArrowDownLeft size={14} aria-hidden="true" className="shrink-0 text-emerald-700" />
                        ) : (
                          <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
                        )}
                        {entry.label}
                      </span>
                      {entry.kind !== 'manual' && <span className="ml-2 text-xs text-slate-400">tự động</span>}
                    </td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{entry.amount > 0 ? formatVND(entry.amount) : ''}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{entry.amount < 0 ? formatVND(-entry.amount) : ''}</td>
                    <td className={cx('py-2 pr-2 text-right font-semibold whitespace-nowrap', entry.balance < 0 ? 'text-red-700' : 'text-slate-900')}>{formatVND(entry.balance)}</td>
                    <td className="py-1">
                      {entry.transactionId && (
                        <button type="button" onClick={() => void remove(entry)} aria-label={`Xoá ${entry.label}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="text-slate-600">
                  <td className="py-2 pr-2" />
                  <td className="py-2 pr-2">Số dư đầu kỳ</td>
                  <td />
                  <td />
                  <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">{formatVND(ledger.openingBalance)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
