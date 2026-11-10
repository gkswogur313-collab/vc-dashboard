import { useEffect, useState } from 'react'

// public/data/*.json 을 런타임에 불러오는 헬퍼.
// import.meta.env.BASE_URL 로 GitHub Pages 하위 경로(/jh-vc-dashboard/)를 자동 반영.
//
// ▸ 라이브(준실시간): 아래 LIVE 에 매핑된 파일(시장 대시보드)은 엣지 API를 30초마다 폴링해
//   지수·환율·섹터 등 야후 실시간 값을 덮어씀. 무거운 섹션(KR 시총·스캐너·테마·금리)은
//   크롤 정적 JSON 값을 그대로 유지(병합). 문서가 보일 때만 폴링(백그라운드 탭은 정지).
//   그 외 파일은 기존과 동일하게 정적 1회 로드.
// (2026-10) 국내·해외 시세 화면 폐지로 현재 매핑된 파일 없음 — 필요하면 'file.json': '/api/...' 형태로 추가
const LIVE = {}
const POLL_MS = 15000

export function useData(file) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    const api = LIVE[file]
    let crawl = null
    let live = null
    const merge = () => { if (alive && (crawl || live)) setData({ ...(crawl || {}), ...(live || {}) }) }

    // 정적(크롤) 로드 — 폴백 + (KR) 무거운 섹션. 라이브 없는 파일은 이게 최종값.
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => { if (!r.ok) throw new Error(`${file} 로드 실패 (${r.status})`); return r.json() })
      .then((d) => { crawl = d; merge() })
      .catch((e) => { if (alive && !api) setError(e.message) })

    if (!api) return () => { alive = false }

    // 라이브 폴링(엣지 API)
    const load = () => fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { live = d; setError(null); merge() } })
      .catch(() => { /* 폴링 실패는 무시(크롤값 유지) */ })
    load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [file])

  return { data, error }
}
