// 구글 캘린더 연동 (클라이언트 사이드 OAuth)
// - Google Identity Services(GIS) 토큰 클라이언트로 액세스 토큰 획득
// - Calendar REST API를 직접 호출해 일정을 가져옴
// 클라이언트 ID는 공개돼도 되는 값이라 코드에 두어도 안전합니다.

export const GOOGLE_CLIENT_ID =
  '474140512344-0s007r790q6dd25ecv93u745rtbrf26m.apps.googleusercontent.com'

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const TOKEN_KEY = 'gcal_token'   // {access_token, expires_at}
const OPTIN_KEY = 'gcal_optin'   // '1' = 사용자가 한 번 연결(동의)했음 → 이후 조용히 재발급 허용

let gisPromise
function loadGis() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했습니다.'))
    document.head.appendChild(s)
  })
  return gisPromise
}

// 토큰 클라이언트는 1개만 유지하고, 매 요청마다 callback을 갈아끼워 재사용한다.
let tokenClient
let pending // { resolve, reject }
function ensureClient() {
  if (tokenClient) return tokenClient
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      const p = pending; pending = null
      if (!p) return
      if (resp.error) return p.reject(new Error(resp.error))
      const token = {
        access_token: resp.access_token,
        expires_at: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000,
      }
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
        localStorage.setItem(OPTIN_KEY, '1')
      } catch (e) { /* 무시 */ }
      p.resolve(token)
    },
  })
  return tokenClient
}

// silent=true 면 팝업 없이 재발급(이미 동의한 경우만 성공). false 면 동의 팝업.
function requestToken(silent) {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error('이미 인증 요청이 진행 중입니다.'))
    pending = { resolve, reject }
    try { ensureClient().requestAccessToken({ prompt: silent ? '' : 'consent' }) }
    catch (e) { pending = null; reject(e) }
  })
}

// 사용자 클릭(제스처)으로 호출 → 동의 팝업 → 액세스 토큰
export async function connectGoogle() {
  await loadGis()
  return requestToken(false)
}

// 팝업 없이 백그라운드 재발급 (토큰 만료 시 자동 호출)
export async function refreshGoogleSilently() {
  await loadGis()
  return requestToken(true)
}

export function hasOptedIn() {
  try { return localStorage.getItem(OPTIN_KEY) === '1' } catch (e) { return false }
}

export function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (t.expires_at && t.expires_at > Date.now()) return t
  } catch (e) { /* 무시 */ }
  return null
}

// 유효 토큰 반환: 저장된 게 살아있으면 그대로, 만료됐지만 이전에 동의했으면 조용히 재발급.
export async function getValidToken() {
  const t = getStoredToken()
  if (t) return t
  if (hasOptedIn()) return refreshGoogleSilently()
  return null
}

export function disconnectGoogle() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(OPTIN_KEY) } catch (e) { /* 무시 */ }
}

// 지난달 1일 ~ 3개월 뒤까지의 일정을 가져와 정규화 (월간 캘린더 이동 커버)
export async function fetchEvents(token) {
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString()
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  )
  if (res.status === 401) throw new Error('인증 만료 — 다시 연결해 주세요.')
  if (!res.ok) throw new Error(`캘린더 조회 실패 (${res.status})`)
  const data = await res.json()
  return (data.items || []).map((e) => ({
    id: e.id,
    제목: e.summary || '(제목 없음)',
    일시: e.start?.dateTime || e.start?.date || '',
    종일: !e.start?.dateTime,
    링크: e.htmlLink || '',
  }))
}

// 표시용 포맷
export function fmtWhen(e) {
  if (!e.일시) return ''
  if (e.종일) return `${e.일시.slice(5, 10)} 종일`
  const d = new Date(e.일시)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${e.일시.slice(5, 10)} ${hh}:${mm}`
}

export function fmtTime(e) {
  if (e.종일 || !e.일시) return '종일'
  const d = new Date(e.일시)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
