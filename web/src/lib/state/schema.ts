import { z } from 'zod';

/**
 * 分享狀態 schema（share1）。
 *
 * 刻意**不含版本欄位**：版本演進靠「編碼格式向前相容 + 解碼逐項容錯」處理——
 * 新欄位一律附加在既有結構尾端，舊連結解不到就用預設值；單一指標／線段解不出來就丟掉該項，
 * 不會讓整條連結失效。因此不需要在每條連結裡付出版本號的長度成本。
 */

/** 資料源，對應 `DataSource`（`lib/data/dataSource.ts`）。 */
export const shareProviderSchema = z.enum(['yahoo', 'official']);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** 查詢區間，對應 `DateRange`（`lib/data/types.ts`）。 */
export const shareRangeSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
});

/**
 * 畫線端點時間：lightweight-charts `Time` 在本專案只會是 'YYYY-MM-DD'（日線資料的時間格式），
 * 但仍容許 epoch 秒數，以便日後換成 intraday 資料時不必改編碼格式。
 */
export const shareTimeSchema = z.union([isoDateSchema, z.number().int()]);

export const shareLinePointSchema = z.object({
  time: shareTimeSchema,
  price: z.number(),
});

/** 色值一律小寫 `#rrggbb`（color input 與色票常數皆為此格式），編碼時才壓成 3 碼縮寫。 */
const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, 'expected #rrggbb');

export const shareLineSchema = z.object({
  points: z.tuple([shareLinePointSchema, shareLinePointSchema]),
  color: hexColorSchema,
  width: z.number().positive(),
});

/**
 * 一個指標實例。不帶 `IndicatorInstance.id`（uuid 只在本機 session 有意義，還原時重新產生），
 * `params` 由 registry 的 `paramsSchema` 決定合法性，故此處只做結構驗證。
 */
export const shareIndicatorSchema = z.object({
  definitionId: z.string().min(1),
  params: z.record(z.string(), z.union([z.number(), z.string()])),
});

export const shareStateSchema = z.object({
  symbol: z.string().min(1),
  prov: shareProviderSchema,
  range: shareRangeSchema,
  indicators: z.array(shareIndicatorSchema),
  lines: z.array(shareLineSchema),
});

export type ShareProvider = z.infer<typeof shareProviderSchema>;
export type ShareRange = z.infer<typeof shareRangeSchema>;
export type ShareTime = z.infer<typeof shareTimeSchema>;
export type ShareLinePoint = z.infer<typeof shareLinePointSchema>;
export type ShareLine = z.infer<typeof shareLineSchema>;
export type ShareIndicator = z.infer<typeof shareIndicatorSchema>;
export type ShareState = z.infer<typeof shareStateSchema>;
