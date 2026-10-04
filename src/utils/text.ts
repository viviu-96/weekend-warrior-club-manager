/** Bỏ dấu, viết thường, gộp khoảng trắng – dùng cho tìm kiếm và so khớp tên. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanName(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
