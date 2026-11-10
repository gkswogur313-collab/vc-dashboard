// 긴 사업 설명 문단 → 보기 쉬운 항목(•) 목록
// · 문장 끝('다.' '니다.')에서 나누고, 표·용어해설을 가리키는 안내 문장은 뺀다
// · 배열이 오면 그대로(뉴스 요약은 처음부터 항목 배열로 작성)
// 화면(IpoReport.jsx)과 워드(scripts/ipo-report-docx.mjs)가 함께 쓴다
const SKIP = /(이해를 돕기 위해|아래 표|다음 표|하기 표|표와 같이|아래와 같습니다|다음과 같습니다|기재합니다|참고하시기 바랍니다)/

export function toBullets(v, max = 8) {
  if (Array.isArray(v)) return v.filter(Boolean)
  const text = String(v || '').replace(/\S+\.(jpg|jpeg|png|gif|bmp)\s*(\S+\s){0,4}?(?=당사|이|특히|또한|[가-힣]+의)/gi, ' ').replace(/\s+/g, ' ').trim() // 본문에 섞인 그림 파일명·캡션 제거
  if (!text) return []
  const parts = text.split(/(?<=(?:다|요)\.)\s+(?=\S)/).map((s) => s.trim()).filter((s) => s.length > 8 && !SKIP.test(s))
  return parts.slice(0, max)
}
