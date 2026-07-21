import { getIndicator, listIndicators } from '../../lib/chart/indicators/registry';
import type { IndicatorInstance, IndicatorParamValues } from '../../lib/chart/indicators/types';
import './IndicatorPanel.css';

interface IndicatorPanelProps {
  instances: IndicatorInstance[];
  onAdd: (definitionId: string) => void;
  onRemove: (instanceId: string) => void;
  onParamsChange: (instanceId: string, params: IndicatorParamValues) => void;
}

export function IndicatorPanel({ instances, onAdd, onRemove, onParamsChange }: IndicatorPanelProps) {
  const definitions = listIndicators();

  return (
    <div className="indicator-panel">
      <div className="indicator-panel-add">
        {definitions.map((definition) => (
          <button key={definition.id} type="button" onClick={() => onAdd(definition.id)}>
            + {definition.label}
          </button>
        ))}
      </div>

      <ul className="indicator-panel-list">
        {instances.map((instance) => {
          const definition = getIndicator(instance.definitionId);
          if (!definition) return null;

          return (
            <li key={instance.id} className="indicator-panel-item">
              <span className="indicator-panel-item-label">{definition.label}</span>

              {definition.paramsSchema.map((schema) => (
                <label key={schema.key} className="indicator-panel-param">
                  {schema.label}
                  <input
                    type="number"
                    min={schema.min}
                    max={schema.max}
                    step={schema.step}
                    value={instance.params[schema.key] ?? schema.default}
                    onChange={(event) =>
                      onParamsChange(instance.id, {
                        ...instance.params,
                        [schema.key]: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}

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
