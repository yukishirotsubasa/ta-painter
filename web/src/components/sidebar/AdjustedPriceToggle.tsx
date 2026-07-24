import './AdjustedPriceToggle.css';

interface AdjustedPriceToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** 官方源無還原資料時 disabled；顯示提示說明。 */
  disabled?: boolean;
}

/**
 * 側邊欄「使用還原價」開關（常駐、不折疊）。開啟時整張圖（K 線＋指標）改用還原權值計算。
 * 僅 Yahoo 源提供還原資料，官方源時 disabled。
 */
export function AdjustedPriceToggle({ checked, onChange, disabled = false }: AdjustedPriceToggleProps) {
  return (
    <section className="adjusted-price-toggle">
      <label className={`adjusted-price-option${disabled ? ' adjusted-price-option-disabled' : ''}`}>
        <input
          type="checkbox"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        使用還原價
      </label>
      {disabled && <p className="adjusted-price-hint">僅 Yahoo 源支援還原價</p>}
    </section>
  );
}
