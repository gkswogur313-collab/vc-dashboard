// 구글 시트 저수준 REST 호출 모음.
// 인증(액세스 토큰)·시트 선택·동기화 조율은 googleSync.js가 담당하고,
// 이 파일은 "토큰을 받아 실제 API를 부르는" 부분만 맡는다.

async function api(token, url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  // 401은 googleSync가 감지해 조용히 토큰을 재발급하도록 특수 메시지로 던진다.
  if (res.status === 401) throw new Error('AUTH')
  if (!res.ok) throw new Error(`시트 API 오류 (${res.status})`)
  return res.status === 204 ? null : res.json()
}

// 새 스프레드시트 생성(원하는 탭들을 미리 만든 상태로).
export async function createSpreadsheet(token, title, tabs = ['Deals', 'Todos']) {
  const data = await api(token, 'https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: tabs.map((t) => ({ properties: { title: t } })),
    }),
  })
  return data.spreadsheetId
}

// 시트에 존재하는 탭 이름 목록.
export async function listTabs(token, id) {
  const data = await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`
  )
  return (data.sheets || []).map((s) => s.properties.title)
}

// 필요한 탭이 없으면 만든다.
export async function ensureTabs(token, id, tabs) {
  const have = await listTabs(token, id)
  const missing = tabs.filter((t) => !have.includes(t))
  if (!missing.length) return
  await api(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })) }),
  })
}

// 특정 범위(예: 'Deals!A1:Z100000')의 값을 읽는다.
export async function getRange(token, id, range) {
  const data = await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`
  )
  return data.values || []
}

// 특정 탭을 비우고 A1부터 values를 기록한다.
export async function putValues(token, id, tab, values) {
  await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab + '!A1:Z100000')}:clear`,
    { method: 'POST', body: '{}' }
  )
  await api(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab + '!A1')}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) }
  )
}

export function sheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}`
}
