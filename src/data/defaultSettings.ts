import type { Settings } from '../types';
import seedSettings from './seed/settings.json';

/** Cấu hình mặc định, dùng khi settings.json thiếu trường hoặc chưa tồn tại. */
export const DEFAULT_SETTINGS: Settings = {
  clubName: seedSettings.clubName,
  levels: seedSettings.levels,
  halfPlayCourtMode: seedSettings.halfPlayCourtMode === 'half' ? 'half' : 'full',
  defaultCourtCount: seedSettings.defaultCourtCount,
  defaultTime: seedSettings.defaultTime,
  mergeGuestsByDefault: seedSettings.mergeGuestsByDefault,
};
