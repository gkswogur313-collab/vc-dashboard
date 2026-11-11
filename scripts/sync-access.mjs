// 대시보드 접속 허용 목록 동기화 — 구글 시트 → Cloudflare Access 정책
//
// 시트(대시보드 접속 허용 목록): 열 = 이메일 | 이름 | 허용(Y/N) | 메모
//   · 허용 칸이 N(또는 아니오/X/0)이면 제외, 비어 있거나 Y면 허용
//   · 시트는 '링크가 있는 모든 사용자: 뷰어'로 공유되어 있어야 한다(시트 ID는 비밀값으로만 보관)
//
// 비밀값(GitHub Secrets): CF_API_TOKEN(Access 정책 수정 권한), ALLOWLIST_SHEET_ID, OWNER_EMAIL
// 환경변수: CF_ACCOUNT_ID, CF_POLICY_ID (워크플로에 적혀 있음 — 비밀 아님)
//
// 안전장치
//   · OWNER_EMAIL은 시트 내용과 상관없이 항상 허용(실수로 관리자가 잠기는 것 방지)
//   · 시트를 못 읽거나 유효한 줄이 하나도 없으면 아무것도 바꾸지 않는다
//   · 저장소가 공개이므로 로그에는 이메일을 찍지 않고 개수만 남긴다
//   · DRY_RUN=1 이면 바꿀 내용만 계산하고 적용하지 않는다

const env = process.env
const need = (k) => {
  if (!env[k]) { console.error(`환경변수 ${k} 가 없습니다(GitHub Secrets 확인).`); process.exit(1) }
  return env[k].trim()
}
const TOKEN = need('CF_API_TOKEN')
const SHEET = need('ALLOWLIST_SHEET_ID')
const OWNER = need('OWNER_EMAIL').toLowerCase()
const ACCOUNT = need('CF_ACCOUNT_ID')
const POLICY = need('CF_POLICY_ID')
const DRY = env.DRY_RUN === '1'

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
const NO = /^(n|no|아니오|아니요|x|0|false|차단)$/i

// CSV 한 줄씩 파싱(따옴표 안 쉼표·줄바꿈 처리)
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

async function readSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv`
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  if (!res.ok || /^\s*<!DOCTYPE|<html/i.test(text)) {
    throw new Error(`시트를 읽지 못했습니다(HTTP ${res.status}). 시트가 '링크가 있는 모든 사용자: 뷰어'로 공유됐는지 확인하세요.`)
  }
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  if (!rows.length) return { emails: [], skipped: 0 }
  // 머리글에서 '이메일'·'허용' 열 위치를 찾는다(못 찾으면 1·3번째 열)
  const head = rows[0].map((h) => h.trim().toLowerCase())
  let ei = head.findIndex((h) => /이메일|email|메일/.test(h))
  let ai = head.findIndex((h) => /허용|allow/.test(h))
  const hasHeader = ei >= 0
  if (ei < 0) ei = 0
  if (ai < 0) ai = 2
  const emails = new Set()
  let skipped = 0
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const e = (r[ei] || '').trim().toLowerCase()
    if (!e) continue
    if (!EMAIL.test(e)) { skipped++; continue }
    if (NO.test((r[ai] || '').trim())) continue
    emails.add(e)
  }
  return { emails: [...emails], skipped }
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/access/policies/${POLICY}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.success === false) {
    const msg = (j.errors || []).map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${res.status}`
    throw new Error(`Cloudflare API 오류: ${msg}`)
  }
  return j.result
}

async function main() {
  const { emails, skipped } = await readSheet()
  if (!emails.length) {
    console.log('시트에서 허용할 이메일을 하나도 찾지 못해 기존 목록을 그대로 둡니다.')
    return
  }
  const want = [...new Set([OWNER, ...emails])].sort()

  const policy = await cf('GET', '')
  const include = policy.include || []
  const current = include.filter((r) => r.email?.email).map((r) => r.email.email.toLowerCase()).sort()
  const others = include.filter((r) => !r.email?.email) // 이메일 외 규칙(있다면)은 그대로 유지

  const added = want.filter((e) => !current.includes(e)).length
  const removed = current.filter((e) => !want.includes(e)).length
  console.log(`시트 허용 ${emails.length}명(형식 오류로 건너뜀 ${skipped}줄) → 정책 반영 대상 ${want.length}명 · 추가 ${added} · 삭제 ${removed}`)
  if (!added && !removed) { console.log('변경 없음.'); return }
  if (DRY) { console.log('DRY_RUN — 적용하지 않음.'); return }

  const body = {
    name: policy.name,
    decision: policy.decision,
    include: [...others, ...want.map((email) => ({ email: { email } }))],
    exclude: policy.exclude || [],
    require: policy.require || [],
  }
  for (const k of ['session_duration', 'approval_required', 'approval_groups', 'isolation_required', 'purpose_justification_required', 'purpose_justification_prompt', 'mfa_config']) {
    if (policy[k] !== undefined && policy[k] !== null) body[k] = policy[k]
  }
  await cf('PUT', '', body)
  console.log('Cloudflare Access 허용 목록을 갱신했습니다.')
}

main().catch((e) => { console.error(e.message); process.exit(1) })
