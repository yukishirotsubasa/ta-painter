import { coerceParamValue, resolveParamInput } from '../../lib/chart/indicators/paramInput';
import { getIndicator, listIndicators } from '../../lib/chart/indicators/registry';
import type {
  IndicatorInstance,
  IndicatorParamSchema,
  IndicatorParamValues,
} from '../../lib/chart/indicators/types';
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
                  <ParamInput
                    schema={schema}
                    params={instance.params}
                    onChange={(value) =>
                      onParamsChange(instance.id, { ...instance.params, [schema.key]: value })
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

interface ParamInputProps {
  schema: IndicatorParamSchema;
  params: IndicatorParamValues;
  onChange: (value: number | string) => void;
}

function ParamInput({ schema, params, onChange }: ParamInputProps) {
  const model = resolveParamInput(schema, params);
  const handleChange = (raw: string) => onChange(coerceParamValue(schema, raw));

  switch (model.kind) {
    case 'enum':
      return (
        <select value={model.value} onChange={(event) => handleChange(event.target.value)}>
          {model.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'color':
      return (
        <input
          type="color"
          className="indicator-panel-color"
          value={model.value}
          onChange={(event) => handleChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          type="number"
          min={model.min}
          max={model.max}
          step={model.step}
          value={model.value}
          onChange={(event) => handleChange(event.target.value)}
        />
      );
  }
}
