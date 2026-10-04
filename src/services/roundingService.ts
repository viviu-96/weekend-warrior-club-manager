/** Đơn vị làm tròn: 500 VNĐ (0,5 nghìn). */
export const ROUNDING_UNIT = 500;

// Sai số dấu phẩy động khi chia tiền (vd 22312.500000000004) không được đẩy lên bậc trên.
const EPSILON = 1e-6;

/**
 * Làm tròn số tiền của TỪNG NGƯỜI lên bội số 500 ₫ gần nhất.
 * Tính theo nghìn đồng: phần thập phân > 0.5 -> lên số nguyên tiếp theo,
 * phần thập phân <= 0.5 -> lên 0.5. Số đã chẵn 500 thì giữ nguyên.
 *   62.100 -> 62.500 | 62.500 -> 62.500 | 62.600 -> 63.000
 */
export function roundPayment(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const rounded = Math.ceil((amount - EPSILON) / ROUNDING_UNIT) * ROUNDING_UNIT;
  return rounded === 0 ? 0 : rounded;
}
