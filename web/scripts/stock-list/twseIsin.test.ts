import { describe, expect, it } from 'vitest';
import { parseTwseIsinHtml } from './twseIsin.ts';

/**
 * 取自實際抓取 `https://isin.twse.com.tw/isin/C_public.jsp?strMode=2`（Big5 解碼後）的真實片段：
 * 表頭列 + 每個分類各留一到數列，涵蓋白名單（股票／創新板／ETF）與應排除的分類。
 */
const REAL_ISIN_HTML = [
  "<TABLE class='h4' align=center cellSpacing=3 cellPadding=2 width=750 border=0>",
  '<tr align=center><td bgcolor=#D5FFD5>有價證券代號及名稱 </td><td bgcolor=#D5FFD5>國際證券辨識號碼(ISIN Code)</td><td bgcolor=#D5FFD5>上市日</td><td bgcolor=#D5FFD5>市場別</td><td bgcolor=#D5FFD5>產業別</td><td bgcolor=#D5FFD5>CFICode</td><td bgcolor=#D5FFD5>備註</td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 股票 <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>2330　台積電</td><td bgcolor=#FAFAD2>TW0002330008</td><td bgcolor=#FAFAD2>1994/09/05</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2>半導體業</td><td bgcolor=#FAFAD2>ESVUFR</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 上市認購(售)權證 <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>030012　AES凱基57購02</td><td bgcolor=#FAFAD2>TW25Z0300124</td><td bgcolor=#FAFAD2>2025/07/31</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>RWSCCA</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 特別股 <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>2881A　富邦特</td><td bgcolor=#FAFAD2>TW0002881A00</td><td bgcolor=#FAFAD2>2016/05/31</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2>金融保險業</td><td bgcolor=#FAFAD2>EPNRAR</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 創新板 <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>2254　巨鎧精密-創</td><td bgcolor=#FAFAD2>TW0002254000</td><td bgcolor=#FAFAD2>2023/10/20</td><td bgcolor=#FAFAD2>上市臺灣創新板</td><td bgcolor=#FAFAD2>汽車工業</td><td bgcolor=#FAFAD2>ESVUFR</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> ETF <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>0050　元大台灣50</td><td bgcolor=#FAFAD2>TW0000050004</td><td bgcolor=#FAFAD2>2003/06/30</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CEOGEU</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2>00631L　元大台灣50正2</td><td bgcolor=#FAFAD2>TW00000631L0</td><td bgcolor=#FAFAD2>2014/10/31</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CEOGDU</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2>00710B　復華彭博非投等債</td><td bgcolor=#FAFAD2>TW00000710B3</td><td bgcolor=#FAFAD2>2017/08/21</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CEOIBU</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2>00980A　主動野村臺灣優選</td><td bgcolor=#FAFAD2>TW00000980A4</td><td bgcolor=#FAFAD2>2025/05/05</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CEOIEU</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> ETN <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>020000　富邦特選蘋果N</td><td bgcolor=#FAFAD2>TW0000200005</td><td bgcolor=#FAFAD2>2019/04/30</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CMXXXU</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 臺灣存託憑證(TDR) <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>910322　康師傅-DR</td><td bgcolor=#FAFAD2>TW0009103226</td><td bgcolor=#FAFAD2>2009/12/16</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>EDSDDR</td><td bgcolor=#FAFAD2></td></tr>',
  '<tr><td bgcolor=#FAFAD2 colspan=7 ><B> 受益證券-不動產投資信託 <B> </td></tr>',
  '<tr><td bgcolor=#FAFAD2>01001T　土銀富邦R1</td><td bgcolor=#FAFAD2>TW00001001T8</td><td bgcolor=#FAFAD2>2005/03/10</td><td bgcolor=#FAFAD2>上市</td><td bgcolor=#FAFAD2></td><td bgcolor=#FAFAD2>CBCIXU</td><td bgcolor=#FAFAD2></td></tr>',
  '</TABLE>',
].join('');

describe('parseTwseIsinHtml', () => {
  it('keeps only 股票／創新板／ETF and drops 權證/特別股/ETN/TDR/REIT', () => {
    expect(parseTwseIsinHtml(REAL_ISIN_HTML)).toEqual([
      { code: '2330', name: '台積電', market: 'TWSE' },
      { code: '2254', name: '巨鎧精密-創', market: 'TWSE' },
      { code: '0050', name: '元大台灣50', market: 'TWSE' },
      { code: '00631L', name: '元大台灣50正2', market: 'TWSE' },
      { code: '00710B', name: '復華彭博非投等債', market: 'TWSE' },
      { code: '00980A', name: '主動野村臺灣優選', market: 'TWSE' },
    ]);
  });

  it('ignores the table header row that precedes the first category', () => {
    const codes = parseTwseIsinHtml(REAL_ISIN_HTML).map((entry) => entry.code);

    expect(codes).not.toContain('有價證券代號及名稱');
  });

  it('treats an unknown new category as excluded rather than inheriting the previous one', () => {
    const html =
      '<tr><td colspan=7 ><B> 股票 <B> </td></tr>' +
      '<tr><td>2330　台積電</td></tr>' +
      '<tr><td colspan=7 ><B> 上市指數投資證券 <B> </td></tr>' +
      '<tr><td>020099　某新商品</td></tr>';

    expect(parseTwseIsinHtml(html)).toEqual([{ code: '2330', name: '台積電', market: 'TWSE' }]);
  });

  it('accepts quoted colspan and decodes HTML entities inside cells', () => {
    const html =
      '<tr><td colspan="7"><b>股票</b></td></tr>' +
      '<tr><td>2903&nbsp;&nbsp;遠百</td><td>TW0002903002</td></tr>';

    expect(parseTwseIsinHtml(html)).toEqual([{ code: '2903', name: '遠百', market: 'TWSE' }]);
  });

  it('skips rows whose first cell has no code/name pair', () => {
    const html =
      '<tr><td colspan=7 >股票</td></tr>' +
      '<tr><td></td><td>TW0000000000</td></tr>' +
      '<tr><td>2330</td></tr>' +
      '<tr><td>合計 1234 筆</td></tr>';

    expect(parseTwseIsinHtml(html)).toEqual([]);
  });

  it('returns an empty list when the markup no longer contains category rows', () => {
    expect(parseTwseIsinHtml('<tr><td>2330　台積電</td></tr>')).toEqual([]);
  });
});
