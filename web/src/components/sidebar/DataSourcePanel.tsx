import { DATA_SOURCES, DATA_SOURCE_LABEL, resolveProvider, type DataSource } from '../../lib/data/dataSource';
import { MARKET_LABEL, type Market } from '../../lib/stock/types';
import './DataSourcePanel.css';

interface DataSourcePanelProps {
  value: DataSource;
  onChange: (source: DataSource) => void;
  /** 目前代號的市場別，用來顯示官方源實際會走的 provider（上市→TWSE、上櫃→TPEx）。 */
  market: Market | null;
}

/**
 * 側邊欄頂端資料源區塊（常駐、不折疊）。
 * 官方源固定顯示逐月抓取的等待提示（不分區間長短）；request 節流／限流屬程式內部行為，不對使用者呈現。
 */
export function DataSourcePanel({ value, onChange, market }: DataSourcePanelProps) {
  const provider = resolveProvider('official', market);

  return (
    <section className="data-source-panel">
      <h2 className="data-source-panel-title">資料源</h2>
      <div className="data-source-panel-options" role="radiogroup" aria-label="資料源">
        {DATA_SOURCES.map((source) => (
          <label key={source} className="data-source-option">
            <input
              type="radio"
              name="data-source"
              value={source}
              checked={value === source}
              onChange={() => onChange(source)}
            />
            {DATA_SOURCE_LABEL[source]}
          </label>
        ))}
      </div>

      {value === 'official' &&
        (provider && market ? (
          <p className="data-source-panel-route">
            目前路由：{provider.label}（{MARKET_LABEL[market]}）
          </p>
        ) : (
          <p className="data-source-panel-warning" role="alert">
            此代號不在股票清單內，官方源無法判斷市場別，請改用 Yahoo
          </p>
        ))}

      {value === 'official' && <p className="data-source-panel-hint">官方源為逐月抓取，可能須等待</p>}
    </section>
  );
}
