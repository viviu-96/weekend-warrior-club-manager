import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFeedback } from '../hooks/useFeedback';
import { copyToClipboard } from '../utils/browser';
import { Button } from './ui';

interface Props {
  /** Tạo nội dung tại thời điểm bấm, để luôn lấy dữ liệu mới nhất. */
  getText: () => string;
  label: string;
  successMessage: string;
  variant?: 'primary' | 'secondary';
}

/** Nút copy có phản hồi tại chỗ: đổi thành "Đã copy" trong 2 giây. */
export function CopyButton({ getText, label, successMessage, variant = 'secondary' }: Props) {
  const { toast } = useFeedback();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => void (timer.current !== null && window.clearTimeout(timer.current)), []);

  const copy = async () => {
    const ok = await copyToClipboard(getText());
    if (!ok) {
      toast('Không copy được, hãy thử lại.', 'error');
      return;
    }
    toast(successMessage);
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="sm" variant={variant} icon={copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} onClick={() => void copy()}>
      {copied ? 'Đã copy' : label}
    </Button>
  );
}
