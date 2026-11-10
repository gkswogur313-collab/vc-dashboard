// 딜·To Do 공용 구글 시트 동기화.
// - 캘린더와 동일한 방식으로 액세스 토큰을 유지하고 만료 시 조용히 재발급한다.
// - 모든 기기가 "하나의 공유 시트"를 쓰도록 하여 폰·PC 간 데이터가 같아진다.
//   (시트 안에 Deals / Todos 두 탭을 두고 각 기능이 자기 탭을 읽고 쓴다.)

import { GOOGLE_CLIENT_ID } from './googleCalendar.js'
import { createSpreadsheet, ensureTabs, getRange, putValues } from './googleSheets.js'

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_KEY = 'gs_token'     // {access_token, expires_at}
const OPTIN_KEY = 'gs_optin'     // '1' = 한 번 연결(동의)함 → 이후 조용히 재발급 허용
const SHEETID_KEY = 'gs_sheet_id'
const TABS = ['Deals', 'Todos']

// 모든 기기가 같은 시트를 쓰도록 하는 공유 시트 ID.
// 최초 1회 생성한 시트의 ID를 여기에 박아 넣으면, 이후 어느 기기에서 연결해도 같은 시트를 사용한다.
// 비어 있으면 각 기기가 localStorage에 기억한 시트(없으면 새로 생성)를 쓴다.
export const SHARED_SHEET_ID = '1IxdagBYNVwJY35wmx52itIYbILsIIKeQ1Cq5Yb7JHrE'

// ── GIS 로드 & 토큰 클라이언트(캘린더와 동일 패턴) ─────────────
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

let tokenClient
let pending
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

function requestToken(silent) {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error('이미 인증 요청이 진행 중입니다.'))
    pending = { resolve, reject }
    try { ensureClient().requestAccessToken({ prompt: silent ? '' : 'consent' }) }
    catch (e) { pending = null; reject(e) }
  })
}

async function refreshSilently() {
  await loadGis()
  return requestToken(true)
}

export function hasOptedIn() {
  try { return localStorage.getItem(OPTIN_KEY) === '1' } catch (e) { return false }
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (t.expires_at && t.expires_at > Date.now()) return t
  } catch (e) { /* 무시 */ }
  return null
}

// 유효 토큰: 살아있으면 그대로, 만료됐지만 이전에 동의했으면 조용히 재발급.
async function getValidToken() {
  const t = getStoredToken()
  if (t) return t
  if (hasOptedIn()) { await loadGis(); return refreshSilently() }
  return null
}

// ── 시트 ID ────────────────────────────────────────────────
export function getSheetId() {
  if (SHARED_SHEET_ID) return SHARED_SHEET_ID
  try { return localStorage.getItem(SHEETID_KEY) || '' } catch (e) { return '' }
}
function setSheetId(id) {
  try { localStorage.setItem(SHEETID_KEY, id) } catch (e) { /* 무시 */ }
}

export function isConnected() {
  return !!(getStoredToken() && getSheetId())
}
export function sheetInfo() {
  return { connected: isConnected(), id: getSheetId() }
}

// ── 상태 구독(연동 버튼 표시용) ─────────────────────────────
const statusListeners = new Set()
export function subscribe(cb) { statusListeners.add(cb); return () => statusListeners.delete(cb) }
function notify() {
  const s = sheetInfo()
  statusListeners.forEach((l) => { try { l(s) } catch (e) { /* 무시 */ } })
}

// ── 기능(딜/To Do) 등록: { pull(), push() } ────────────────
// pull: 시트 → 로컬,  push: 로컬 → 시트. 둘 다 내부에서 readTab/writeTab 사용.
const features = []
export function registerFeature(f) { features.push(f) }

// ── 저수준 IO(토큰 자동 재발급 래핑) ───────────────────────
async function withToken(fn) {
  let token = await getValidToken()
  if (!token) return null
  try { return await fn(token) }
  catch (e) {
    if (String(e.message) === 'AUTH' && hasOptedIn()) {
      token = await refreshSilently().catch(() => null)
      if (token) return fn(token)
    }
    throw e
  }
}

export async function readTab(tab) {
  return withToken(async (token) => {
    const id = getSheetId()
    if (!id) return []
    return getRange(token, id, `${tab}!A1:Z100000`)
  })
}

export async function writeTab(tab, values) {
  return withToken(async (token) => {
    let id = getSheetId()
    if (!id) { const r = await ensureSheet(token); id = r.id }
    await putValues(token, id, tab, values)
  })
}

async function ensureSheet(token) {
  let id = getSheetId()
  let created = false
  if (!id) {
    id = await createSpreadsheet(token, 'VC Dashboard Data', TABS)
    setSheetId(id)
    created = true
  } else {
    await ensureTabs(token, id, TABS)
  }
  return { id, created }
}

// ── 공개 동작 ─────────────────────────────────────────────
// 사용자 클릭→ 동의 팝업→ 시트 확보→ (새 시트면 로컬을 올리고, 기존 시트면 내려받음)
export async function connect() {
  await loadGis()
  await requestToken(false)
  const { created } = await ensureSheet(await getValidToken())
  for (const f of features) {
    try { await (created ? f.push() : f.pull()) } catch (e) { /* 무시 */ }
  }
  notify()
  return sheetInfo()
}

// 시트 → 로컬 다시 불러오기(양쪽 기능 모두)
export async function syncNow() {
  const token = await getValidToken()
  if (!token || !getSheetId()) return
  for (const f of features) { try { await f.pull() } catch (e) { /* 무시 */ } }
  notify()
}

export function disconnect() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(OPTIN_KEY) } catch (e) { /* 무시 */ }
  // 시트 ID는 남겨 둔다(다시 연결하면 같은 시트 사용).
  notify()
}

// 앱 로드 시: 예전에 연결했었다면 조용히 토큰을 재발급하고 시트에서 최신본을 내려받는다.
let inited = false
export async function init() {
  if (inited) return
  inited = true
  if (!hasOptedIn() || !getSheetId()) return
  try { await syncNow() } catch (e) { /* 무시 */ }
}
