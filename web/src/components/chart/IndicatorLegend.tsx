import { useEffect, useState } from 'react';
import { getIndicator } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from '../../lib/chart/indicators/types';
import { IndicatorChips } from './IndicatorChips';
import { IndicatorParamFields } from './IndicatorParamFields';
import './IndicatorLegend.css';

interface IndicatorLegendProps {
  instances: IndicatorInstance[];
  onParamsChange: (instanceId: string, params: IndicatorParamValues) => void;
  onRemove: (instanceId: string) => void;
  /** 設定面板展開時收起參數小面板：行動版兩者會疊在一起，桌面版則避免兩處同時編輯同一個指標。 */
  settingsOpen: boolean;
}

/**
 * 圖表上方的指標圖例（responsive2 → 依實測回饋改為桌面／行動共用）：
 * chip 橫向列出已啟用指標，點擊在正下方展開該指標的參數小面板。
 *
 * 覆蓋在圖表上（不佔圖表空間），因此容器本身不吃指標事件，只有 chip 與小面板可點。
 * 展開哪個 chip 純屬畫面狀態，留在這裡不上提到 App。
 */
export function IndicatorLegend({ instances, onParamsChange, onRemove, settingsOpen }: IndicatorLegendProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (settingsOpen) setOpenId(null);
  }, [settingsOpen]);

  // 指標可能在小面板開著時被移除（設定面板裡按移除），查不到就等同關閉，不需要另外清狀態。
  const open = instances.find((instance) => instance.id === openId) ?? null;
  const definition = open ? getIndicator(open.definitionId) : null;

  if (instances.length === 0) return null;

  return (
    <div className="indicator-legend">
      <IndicatorChips instances={instances} activeId={open?.id ?? null} onSelect={setOpenId} />

      {open && definition && (
        <div className="indicator-legend-panel" role="group" aria-label={`${definition.label} 參數`}>
          <div className="indicator-legend-panel-head">
            <span className="indicator-legend-panel-title">{definition.label}</span>
            <button
              type="button"
              className="indicator-legend-panel-close"
              aria-label={`關閉 ${definition.label} 參數`}
              onClick={() => setOpenId(null)}
            >
              ✕
            </button>
          </div>
          <div className="indicator-legend-panel-body">
            <IndicatorParamFields
              definition={definition}
              params={open.params}
              onChange={(params) => onParamsChange(open.id, params)}
              idPrefix={`legend-${open.id}`}
            />
            <button type="button" className="indicator-legend-panel-remove" onClick={() => onRemove(open.id)}>
              移除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
