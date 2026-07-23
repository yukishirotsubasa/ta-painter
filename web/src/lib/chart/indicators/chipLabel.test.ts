import { describe, expect, it } from 'vitest';
import { indicatorChipColor, indicatorChipLabel, indicatorShortLabel } from './chipLabel';
import type { IndicatorDefinition, IndicatorParamSchema } from './types';

/** 只有 chip 文字用得到 label / paramsSchema，其餘欄位以最小假值填滿型別。 */
function fakeDefinition(label: string, paramsSchema: IndicatorParamSchema[]): IndicatorDefinition {
  return {
    id: 'fake',
    urlCode: 'fk',
    label,
    placement: 'overlay',
    paramsSchema,
    compute: () => undefined,
    mount: () => ({ update: () => {}, dispose: () => {} }),
  };
}

describe('indicatorShortLabel', () => {
  it('取全形括號內的簡稱', () => {
    expect(indicatorShortLabel('移動平均線（MA）')).toBe('MA');
    expect(indicatorShortLabel('布林通道（Bollinger Bands）')).toBe('Bollinger Bands');
  });

  it('沒有括號時用原標籤', () => {
    expect(indicatorShortLabel('MACD')).toBe('MACD');
  });
});

describe('indicatorChipLabel', () => {
  const ma = fakeDefinition('移動平均線（MA）', [
    { key: 'period', label: '週期', default: 20 },
    { key: 'source', label: '計算來源', type: 'enum', default: 'close', options: [] },
    { key: 'color', label: '線色', type: 'color', default: '#2196f3' },
  ]);

  it('簡稱加上數值參數，略過 enum 與顏色', () => {
    expect(indicatorChipLabel(ma, { period: 60, source: 'high', color: '#fff' })).toBe('MA(60)');
  });

  it('參數缺值時用 schema 預設值', () => {
    expect(indicatorChipLabel(ma, {})).toBe('MA(20)');
  });

  it('多個數值參數以逗號串接（type 省略即數值）', () => {
    const macd = fakeDefinition('MACD', [
      { key: 'fastPeriod', label: '快線', default: 12 },
      { key: 'slowPeriod', label: '慢線', default: 26 },
      { key: 'signalPeriod', label: '訊號線', default: 9 },
    ]);
    expect(indicatorChipLabel(macd, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })).toBe('MACD(12,26,9)');
  });

  it('沒有數值參數時只顯示簡稱', () => {
    const plain = fakeDefinition('量能（VOL）', [{ key: 'color', label: '顏色', type: 'color', default: '#000' }]);
    expect(indicatorChipLabel(plain, {})).toBe('VOL');
  });
});

describe('indicatorChipColor', () => {
  it('取第一個顏色參數的目前值', () => {
    const bb = fakeDefinition('布林通道（Bollinger Bands）', [
      { key: 'period', label: '週期', default: 20 },
      { key: 'upperColor', label: '上軌', type: 'color', default: '#111111' },
      { key: 'lowerColor', label: '下軌', type: 'color', default: '#222222' },
    ]);
    expect(indicatorChipColor(bb, { upperColor: '#abcdef' })).toBe('#abcdef');
  });

  it('沒設定時回 schema 預設色', () => {
    const bb = fakeDefinition('布林通道（Bollinger Bands）', [
      { key: 'upperColor', label: '上軌', type: 'color', default: '#111111' },
    ]);
    expect(indicatorChipColor(bb, {})).toBe('#111111');
  });

  it('指標沒有顏色參數時回 null', () => {
    const plain = fakeDefinition('MACD', [{ key: 'fastPeriod', label: '快線', default: 12 }]);
    expect(indicatorChipColor(plain, {})).toBeNull();
  });
});
