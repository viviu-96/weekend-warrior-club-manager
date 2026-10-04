import { exportCSV, exportJSON } from '../../services/exportService';
import type { Session, Settings } from '../../types';
import { downloadTextFile } from '../../utils/browser';

export function downloadSessionJSON(session: Session): void {
  downloadTextFile(`${session.id}.json`, exportJSON(session), 'application/json;charset=utf-8');
}

export function downloadSessionCSV(session: Session, settings: Settings): void {
  downloadTextFile(`${session.id}_tinh_tien.csv`, exportCSV(session, settings), 'text/csv;charset=utf-8');
}
