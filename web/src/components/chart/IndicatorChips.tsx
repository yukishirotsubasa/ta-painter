import { indicatorChipColor, indicatorChipLabel } from '../../lib/chart/indicators/chipLabel';
import { getIndicator } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance } from '../../lib/chart/indicators/types';
import './IndicatorChips.css';

interface IndicatorChipsProps {
  instances: IndicatorInstance[];
  /** 目前展開參數面板的指標實例，`null` 代表都沒展開。 */
  activeId: string | null;
  /** 點同一個 chip 收起（傳 `null`），點別的 chip 換成該指標。 */
  onSelect: (instanceId: string | null) => void;
}

/**
 * 圖例 chip 列（responsive2）：已啟用的指標橫向列出、可左右滑動，
 * 點擊由 `IndicatorLegend` 在正下方展開該指標的參數面板。
 */
export function IndicatorChips({ instances, activeId, onSelect }: IndicatorChipsProps) {
  return (
    <ul className="indicator-chips">
      {instances.map((instance) => {
        const definition = getIndicator(instance.definitionId);
        if (!definition) return null;

        const color = indicatorChipColor(definition, instance.params);
        const active = instance.id === activeId;

        return (
          <li key={instance.id}>
            <button
              type="button"
              className="indicator-chip"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : instance.id)}
            >
              {color && <span className="indicator-chip-dot" style={{ background: color }} aria-hidden="true" />}
              {indicatorChipLabel(definition, instance.params)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
