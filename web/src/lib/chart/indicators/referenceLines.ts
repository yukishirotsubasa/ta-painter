import { LineStyle, type ISeriesApi, type SeriesType } from 'lightweight-charts';
import { REFERENCE_LINE_COLOR } from '../colors';

/**
 * 震盪指標的水平參考線（indicator12）。
 *
 * RSI 的 30/70、KD 的 20/80、CCI 的 ±100、威廉指標的 −20/−80、BIAS/ROC 的 0 軸都是同一件事：
 * 在該 pane 疊幾條固定價位的虛線。用 `series.createPriceLine()` 而非額外的 series，
 * 這樣參考線不會進入自動縮放的資料範圍，也不會出現在圖例上。
 */

export interface ReferenceLinesHandle {
  dispose(): void;
}

export function createReferenceLines(
  series: ISeriesApi<SeriesType>,
  levels: readonly number[],
  color: string = REFERENCE_LINE_COLOR,
): ReferenceLinesHandle {
  const lines = levels.map((price) =>
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    }),
  );

  return {
    dispose() {
      for (const line of lines) {
        series.removePriceLine(line);
      }
    },
  };
}
