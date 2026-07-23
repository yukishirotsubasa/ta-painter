import { describe, expect, it } from 'vitest';
import { classifyDataError } from './errors';

describe('classifyDataError', () => {
  it('把上游狀態碼 403/429/5xx 判為 upstream-blocked', () => {
    expect(classifyDataError(new Error('TPEx 請求失敗：HTTP 403'))).toBe('upstream-blocked');
    expect(classifyDataError(new Error('TWSE 請求失敗：HTTP 429'))).toBe('upstream-blocked');
    expect(classifyDataError(new Error('TWSE 請求失敗：HTTP 502'))).toBe('upstream-blocked');
    // Yahoo 訊息同時含「查詢失敗」與狀態碼，狀態碼優先。
    expect(classifyDataError(new Error('Yahoo 查詢失敗（2330）：HTTP 503'))).toBe('upstream-blocked');
  });

  it('把 fetch 網路錯誤／proxy 無回應判為 upstream-blocked', () => {
    expect(classifyDataError(new TypeError('Failed to fetch'))).toBe('upstream-blocked');
    expect(classifyDataError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      'upstream-blocked',
    );
    expect(classifyDataError(new Error('Load failed'))).toBe('upstream-blocked');
  });

  it('把請求成功但查無資料判為 no-data', () => {
    expect(classifyDataError(new Error('TWSE 查詢失敗：很抱歉，沒有符合條件的資料!'))).toBe('no-data');
    expect(classifyDataError(new Error('TPEx 查詢失敗：no data'))).toBe('no-data');
    expect(classifyDataError(new Error('Yahoo 查詢失敗（9999）：HTTP 404'))).toBe('no-data');
    expect(classifyDataError(new Error('Yahoo 查詢失敗（9999）：No data found, symbol may be delisted'))).toBe(
      'no-data',
    );
  });

  it('其餘錯誤判為 unknown', () => {
    expect(classifyDataError(new Error('無法判斷 1234 的市場別（不在股票清單內），請改用 Yahoo 資料源'))).toBe(
      'unknown',
    );
    expect(classifyDataError(new Error('TPEx 請求失敗：HTTP 400'))).toBe('unknown');
    expect(classifyDataError('boom')).toBe('unknown');
  });
});
