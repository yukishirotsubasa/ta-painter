import { useState } from 'react';
import { getIndicator, listIndicators } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from '../../lib/chart/indicators/types';
import { IndicatorParamFields } from './IndicatorParamFields';
import './IndicatorPanel.css';

interface IndicatorPanelProps {
  instances: IndicatorInstance[];
  onAdd: (definitionId: string) => void;
  onRemove: (instanceId: string) => void;
  onParamsChange: (instanceId: string, params: IndicatorParamValues) => void;
}

export function IndicatorPanel({ instances, onAdd, onRemove, onParamsChange }: IndicatorPanelProps) {
  const definitions = listIndicators();
  // 指標種類變多後改用下拉選單（indicator13）：平鋪按鈕在側邊欄寬度下會塞成一整面牆。
  const [selectedId, setSelectedId] = useState(definitions[0]?.id ?? '');

  return (
    <div className="indicator-panel">
      <div className="indicator-panel-add">
        <label className="sr-only" htmlFor="indicator-panel-add-select">
          選擇要新增的指標
        </label>
        <select
          id="indicator-panel-add-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {definitions.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label}
            </option>
          ))}
        </select>
        <button type="button" disabled={selectedId === ''} onClick={() => onAdd(selectedId)}>
          + 新增
        </button>
      </div>

      <ul className="indicator-panel-list">
        {instances.map((instance) => {
          const definition = getIndicator(instance.definitionId);
          if (!definition) return null;

          return (
            <li key={instance.id} className="indicator-panel-item">
              <span className="indicator-panel-item-label">{definition.label}</span>

              <IndicatorParamFields
                definition={definition}
                params={instance.params}
                onChange={(params) => onParamsChange(instance.id, params)}
                idPrefix={`indicator-panel-${instance.id}`}
              />

              <button
                type="button"
                className="indicator-panel-remove"
                aria-label={`移除 ${definition.label}`}
                onClick={() => onRemove(instance.id)}
              >
                移除
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
