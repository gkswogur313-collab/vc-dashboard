// 종목명 → { code, market } 자동완성 매핑.
// 주요 국내주 + 미국 대형주(한글 별칭 포함). 종목명 입력 시 티커·시장 자동 채움.
// 없는 종목은 사용자가 직접 티커를 입력하면 됨. (추후 KRX 전체 목록으로 확장 가능)
// RAW: [종목명, 코드, 시장, ...한글/영문 별칭]
const RAW = [
  // ── KOSPI ──
  ['삼성전자', '005930', 'KOSPI'],
  ['SK하이닉스', '000660', 'KOSPI'],
  ['LG에너지솔루션', '373220', 'KOSPI'],
  ['삼성바이오로직스', '207940', 'KOSPI'],
  ['현대차', '005380', 'KOSPI'],
  ['기아', '000270', 'KOSPI'],
  ['셀트리온', '068270', 'KOSPI'],
  ['POSCO홀딩스', '005490', 'KOSPI', '포스코홀딩스'],
  ['NAVER', '035420', 'KOSPI', '네이버'],
  ['카카오', '035720', 'KOSPI'],
  ['삼성SDI', '006400', 'KOSPI'],
  ['LG화학', '051910', 'KOSPI'],
  ['현대모비스', '012330', 'KOSPI'],
  ['삼성물산', '028260', 'KOSPI'],
  ['KB금융', '105560', 'KOSPI'],
  ['신한지주', '055550', 'KOSPI'],
  ['하나금융지주', '086790', 'KOSPI'],
  ['메리츠금융지주', '138040', 'KOSPI'],
  ['삼성생명', '032830', 'KOSPI'],
  ['한화에어로스페이스', '012450', 'KOSPI'],
  ['HD현대중공업', '329180', 'KOSPI'],
  ['한화오션', '042660', 'KOSPI'],
  ['두산에너빌리티', '034020', 'KOSPI'],
  ['현대로템', '064350', 'KOSPI'],
  ['LIG넥스원', '079550', 'KOSPI'],
  ['크래프톤', '259960', 'KOSPI'],
  ['카카오뱅크', '323410', 'KOSPI'],
  ['SK이노베이션', '096770', 'KOSPI'],
  ['SK텔레콤', '017670', 'KOSPI'],
  ['KT&G', '033780', 'KOSPI'],
  ['포스코퓨처엠', '003670', 'KOSPI'],
  ['LG전자', '066570', 'KOSPI'],
  ['삼성전기', '009150', 'KOSPI'],
  ['HMM', '011200', 'KOSPI'],
  // ── KOSDAQ ──
  ['에코프로비엠', '247540', 'KOSDAQ'],
  ['에코프로', '086520', 'KOSDAQ'],
  ['알테오젠', '196170', 'KOSDAQ'],
  ['HLB', '028300', 'KOSDAQ'],
  ['엔켐', '348370', 'KOSDAQ'],
  ['리가켐바이오', '141080', 'KOSDAQ'],
  ['삼천당제약', '000250', 'KOSDAQ'],
  ['셀트리온제약', '068760', 'KOSDAQ'],
  ['클래시스', '214150', 'KOSDAQ'],
  ['리노공업', '058470', 'KOSDAQ'],
  ['펄어비스', '263750', 'KOSDAQ'],
  ['JYP Ent.', '035900', 'KOSDAQ', 'JYP', 'jyp엔터'],
  ['에스엠', '041510', 'KOSDAQ', 'SM'],
  // ── 미국 ──
  ['NVIDIA', 'NVDA', 'US', '엔비디아'],
  ['Apple', 'AAPL', 'US', '애플'],
  ['Microsoft', 'MSFT', 'US', '마이크로소프트'],
  ['Alphabet', 'GOOGL', 'US', '구글', '알파벳'],
  ['Amazon', 'AMZN', 'US', '아마존'],
  ['Meta', 'META', 'US', '메타', '페이스북'],
  ['Tesla', 'TSLA', 'US', '테슬라'],
  ['Broadcom', 'AVGO', 'US', '브로드컴'],
  ['AMD', 'AMD', 'US', '에이엠디'],
  ['Netflix', 'NFLX', 'US', '넷플릭스'],
  ['Palantir', 'PLTR', 'US', '팔란티어'],
  ['Micron', 'MU', 'US', '마이크론'],
  ['TSMC', 'TSM', 'US', '티에스엠씨', '대만반도체'],
  ['Berkshire Hathaway', 'BRK.B', 'US', '버크셔'],
]

// 한글 정규화(NFC) 포함 — IME/붙여넣기로 들어온 조합형(NFD)도 매칭되게 함
const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, '').toLowerCase()
const MAP = {}       // 종목명/별칭 → {code,market,name}
const CODE_MAP = {}  // 티커 → {code,market,name}
for (const [name, code, market, ...aliases] of RAW) {
  const entry = { code, market, name }
  MAP[norm(name)] = entry
  CODE_MAP[norm(code)] = entry
  for (const a of aliases) MAP[norm(a)] = entry
}

// 종목명(또는 별칭)으로 { code, market, name } 조회. 없으면 null.
export function lookupTicker(name) { return MAP[norm(name)] || null }
// 티커(코드)로 { code, market, name } 조회. 없으면 null.
export function lookupByCode(code) { return CODE_MAP[norm(code)] || null }

// 내장 목록에서 부분 검색(종목명·별칭·코드) — 원격 검색이 느리거나 실패해도 주요 종목 즉시 노출.
export function searchLocal(q, limit = 8) {
  const k = norm(q)
  if (!k) return []
  const out = []
  for (const [name, code, market, ...aliases] of RAW) {
    if (norm(name).includes(k) || norm(code).includes(k) || aliases.some((a) => norm(a).includes(k))) {
      out.push({ name, code, market })
      if (out.length >= limit) break
    }
  }
  return out
}
// 자동완성 datalist용 대표 종목명 목록
export const TICKER_NAMES = RAW.map((r) => r[0])
