/** prefix สำหรับ path ของไฟล์/API เมื่อ deploy ใต้ sub-path (เช่น GitHub Pages: /floodsafe-krabi) */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const withBase = (path: string): string => `${BASE_PATH}${path}`;
