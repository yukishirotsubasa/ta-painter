import { coerceParamValue, resolveParamInput } from '../../lib/chart/indicators/paramInput';
import type {
  IndicatorDefinition,
  IndicatorParamSchema,
  IndicatorParamValues,
} from '../../lib/chart/indicators/types';
import './IndicatorParamFields.css';

interface IndicatorParamFieldsProps {
  definition: IndicatorDefinition;
  params: IndicatorParamValues;
  onChange: (params: IndicatorParamValues) => void;
  /** 同一畫面可能同時存在側邊欄與行動版參數面板，id 需帶前綴避免 label/input 綁錯。 */
  idPrefix: string;
}

/**
 * 一個指標實例的參數欄位（indicator6 的型別化 schema → number/select/color）。
 * 從 `IndicatorPanel` 抽出，讓行動版的參數 bottom sheet（responsive2）能共用同一套欄位。
 */
export function IndicatorParamFields({ definition, params, onChange, idPrefix }: IndicatorParamFieldsProps) {
  return (
    <>
      {definition.paramsSchema.map((schema) => {
        const id = `${idPrefix}-${schema.key}`;
        return (
          <label key={schema.key} className="indicator-param" htmlFor={id}>
            {schema.label}
            <ParamInput
              id={id}
              schema={schema}
              params={params}
              onChange={(value) => onChange({ ...params, [schema.key]: value })}
            />
          </label>
        );
      })}
    </>
  );
}

interface ParamInputProps {
  id: string;
  schema: IndicatorParamSchema;
  params: IndicatorParamValues;
  onChange: (value: number | string) => void;
}

function ParamInput({ id, schema, params, onChange }: ParamInputProps) {
  const model = resolveParamInput(schema, params);
  const handleChange = (raw: string) => onChange(coerceParamValue(schema, raw));

  switch (model.kind) {
    case 'enum':
      return (
        <select id={id} value={model.value} onChange={(event) => handleChange(event.target.value)}>
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
          id={id}
          type="color"
          className="indicator-param-color"
          value={model.value}
          onChange={(event) => handleChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          id={id}
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
