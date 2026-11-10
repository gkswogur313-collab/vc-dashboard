// JH Weekly Report JSON → 워드(.docx)
// 사용: node scripts/weekly/build-docx.mjs public/data/weekly/<id>.json  → public/briefs/weekly/<id>.docx
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
  ImageRun,
} from 'docx'
import { keywordChartPng } from '../lib/keyword-chart.mjs'

const w = JSON.parse(await readFile(process.argv[2], 'utf-8'))
const refs = new Map((w.refs || []).map((r) => [r.n, r]))
const FONT = '맑은 고딕'; const ACCENT = '1F3864'; const DIM = '667085'
const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, ...o })
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [t(text, { style: 'Hyperlink', ...o })] })
function cited(text, o = {}) {
  const out = []; let last = 0; text = String(text || '')
  for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) out.push(t(text.slice(last, m.index), o))
    const r = refs.get(+m[1]); const sup = t(`[${m[1]}]`, { superScript: true, color: ACCENT })
    out.push(r?.링크 ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(t(text.slice(last), o))
  return out
}
const P = (children, o = {}) => new Paragraph({ children, spacing: { after: 100, line: 300 }, ...o })
const B = (children, level = 0) => new Paragraph({ children, numbering: { reference: 'dots', level }, spacing: { after: 60, line: 290 } })
const H1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(s)] })
const H2 = (s) => new Paragraph({ children: [t(s, { bold: true, color: ACCENT, size: 22 })], spacing: { before: 200, after: 80 } })
const dim = (s, size = 18) => t(s, { color: DIM, size })
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
function table(rows, W) {
  return new Table({
    width: { size: W.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: W,
    rows: rows.map((r, i) => new TableRow({ children: W.map((wd, j) => new TableCell({
      width: { size: wd, type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border },
      shading: i === 0 ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: [new Paragraph({ alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [t(r[j] ?? '', { bold: i === 0, size: 17 })] })],
    })) })),
  })
}
const STAGE = { 청구: '심사청구', 승인: '심사승인', 수요예측: '수요예측', 상장: '상장' }

const c = []
c.push(new Paragraph({ children: [t('JH Weekly Report', { bold: true, size: 44, color: ACCENT })], spacing: { after: 60 } }))
c.push(P([dim(`${w.기간.from} ~ ${w.기간.to}`, 20)]))

c.push(H1('이번 주 한눈에'))
for (const s of w.한눈에 || []) c.push(B(cited(s)))

// ① 레이더
const R = w.레이더 || {}
c.push(H1('① 업계 뉴스 레이더'))
if (R.top?.length) {
  c.push(H2('Top Signals'))
  R.top.forEach((x, i) => {
    c.push(P([t(`${i + 1}. ${x.제목}`, { bold: true })], { spacing: { before: 100, after: 40 } }))
    c.push(P(cited(x.사실)))
    if (x.그래서우리는) c.push(P([t('그래서 우리는 → ', { bold: true, color: ACCENT }), ...cited(x.그래서우리는)]))
    c.push(P([dim([x.확실성, x.영향, x.시간축].filter(Boolean).join(' · '), 16)]))
  })
}
for (const cat of ['자금조달', '규제정책', '기술제품', '회수', '인력조직']) {
  const L = R.카테고리?.[cat] || []
  c.push(H2(cat))
  if (!L.length) { c.push(P([dim('해당 없음')])); continue }
  for (const x of L) c.push(B([t(`${x.제목} `, { bold: true }), ...cited(x.사실), ...(x.함의 ? [t(' → '), ...cited(x.함의, { color: ACCENT })] : []), dim(`  ${x.날짜 || ''}${x.확실성 === '단독출처' ? ' · 단독출처' : ''}`, 16)]))
}
if (R.인사이트?.length) { c.push(H2('주간 인사이트')); for (const s of R.인사이트) c.push(B(cited(s))) }

// ② 산업 트래킹 — 같은 주 주간 브리핑 원본을 그대로(요약하지 않음). 브리핑 출처는 B1, B2…로 구분
c.push(H1('② 산업 트래킹 주간 브리핑'))
let br = null
try { br = JSON.parse(await readFile(`public/data/briefs/${w.id}.json`, 'utf-8')) } catch { /* 없음 */ }
if (br) {
  const bref = new Map((br.refs || []).map((r) => [r.n, r]))
  const bc = (text, o = {}) => {
    const out = []; let last = 0; text = String(text || '')
    for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
      if (m.index > last) out.push(t(text.slice(last, m.index), o))
      const r = bref.get(+m[1]); const sup = t(`[B${m[1]}]`, { superScript: true, color: ACCENT })
      out.push(r?.링크 ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
      last = m.index + m[0].length
    }
    if (last < text.length) out.push(t(text.slice(last), o))
    return out
  }
  const L = (s) => new Paragraph({ children: [t(s, { bold: true, color: ACCENT, size: 19 })], spacing: { before: 100, after: 30 } })
  c.push(P([dim(`${br.기간.from} ~ ${br.기간.to} · 리포트 ${br.리포트수}건 검토`)]))
  c.push(H2('이번 주 한눈에')); for (const s of br.한눈에 || []) c.push(B(bc(s)))
  c.push(H2('기술 스터디'))
  ;(br.기술스터디 || []).forEach((st, i) => {
    c.push(P([t(`${i + 1}. ${st.주제}`, { bold: true, size: 22 })], { spacing: { before: 140, after: 40 } }))
    if (st.한줄요약) c.push(P(bc(st.한줄요약, { italics: true, color: DIM })))
    if (st.무엇인가) { c.push(L('무엇인가')); c.push(P(bc(st.무엇인가))) }
    if (st.왜지금) { c.push(L('왜 지금')); c.push(P(bc(st.왜지금))) }
    if (st.핵심포인트?.length) { c.push(L('핵심 포인트')); for (const x of st.핵심포인트) c.push(B(bc(x))) }
    if (st.밸류체인) { c.push(L('밸류체인·주요 플레이어')); c.push(P(bc(st.밸류체인))) }
  })
  c.push(H2('업계 동향'))
  for (const g of br.업계동향 || []) { c.push(L(g.테마)); for (const x of g.시그널 || []) c.push(B(bc(x))) }
  c.push(H2('정독 추천 TOP 3'))
  ;(br.정독TOP3 || []).forEach((x, i) => {
    const r = bref.get(x.ref) || {}
    c.push(P([t(`${i + 1}. `, { bold: true }), r.링크 ? link(r.제목, r.링크, { bold: true }) : t(r.제목 || '', { bold: true }), dim(`  ${r.기관 || ''} ${r.날짜 || ''}`, 16)], { spacing: { before: 100, after: 30 } }))
    c.push(P(bc(x.이유)))
    for (const y of x.읽는포인트 || []) c.push(B(bc(y)))
  })
  if (br.키워드?.length) {
    c.push(new Paragraph({ keepNext: true, children: [t('키워드 흐름', { bold: true, color: ACCENT, size: 22 })], spacing: { before: 200, after: 80 } }))
    const ch = await keywordChartPng(br.키워드)
    if (ch) c.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: ch.png, transformation: { width: 600, height: Math.round(600 * ch.height / ch.width) } })] }))
    else c.push(P([t(br.키워드.slice(0, 12).map((k) => `${k.tag} ${k.count}/${k.prev}`).join(' · '), { size: 18 })]))
  }
  c.push(L('브리핑 출처'))
  for (const r of br.refs || []) c.push(P([t(`[B${r.n}] `, { size: 15 }), link(r.제목, r.링크, { size: 15 }), dim(`  ${r.기관 || ''} ${r.날짜 || ''}`, 14)], { spacing: { after: 20 } }))
} else c.push(P([dim('이 주의 주간 브리핑이 없습니다.')]))

// ③ IPO — 전주(대상 주) + 금주(발행 주, 공시 일정 기준)
c.push(H1('③ IPO 전주 · 금주 (심사청구 · 심사승인 · 수요예측 · 상장)'))
{
  const md = (d) => (d || '').slice(5).replace('-', '/')
  const when = (x) => (x.기간 ? x.기간.split('~').map(md).join('~') : md(x.날짜))
  const plus1 = (s) => new Date(Date.parse(s + 'T00:00:00Z') + 86400e3).toISOString().slice(0, 10)
  const weeks = w.IPO기간 ? [['전주', w.기간.from, w.기간.to], ['금주', plus1(w.기간.to), w.IPO기간.to]] : [['전주', w.기간.from, w.기간.to]]
  for (const [wk, f, to] of weeks) {
    const rows = (w.IPO || []).filter((x) => (x.주 || '전주') === wk)
    c.push(H2(`${wk} (${md(f)}~${md(to)}${wk === '금주' ? ' · 예정' : ''}) · ${rows.length}건`))
    if (rows.length) c.push(table([['날짜', '단계', '회사', '시장', '주관사', '한줄'], ...rows.map((x) => [when(x), STAGE[x.단계], x.회사명, x.시장, x.주관사, x.한줄 || '-'])], [1000, 900, 1400, 600, 1600, 3500]))
    else c.push(P([dim('해당 없음')]))
  }
}

// ④ 펀딩
const F = w.펀딩 || {}
c.push(H1('④ 신규 펀딩'))
c.push(P([t(`이번 주 ${F.건수 || 0}건 · 공개 금액 합계 약 ${(F.공개합계억 || 0).toLocaleString()}억원`, { bold: true })]))
if (F.주목?.length) {
  c.push(H2('주목 딜'))
  for (const x of F.주목) {
    c.push(P([t(x.기업, { bold: true }), dim(`  ${[x.분야, x.금액, x.단계].filter(Boolean).join(' · ')}`, 17)], { spacing: { before: 120, after: 30 } }))
    if (x.투자사) c.push(P([dim(`투자사: ${x.투자사}`, 16)]))
    for (const s of x.내용 || []) c.push(B(cited(s)))
  }
}
if (F.목록?.length) {
  c.push(H2('전체 목록'))
  c.push(table([['날짜', '기업', '분야', '금액', '단계', '투자사'], ...F.목록.map((x) => [x.날짜.slice(5), x.기업, x.분야, x.금액, x.단계, x.투자사])], [700, 1500, 2000, 1100, 1100, 2600]))
}

if (w.refs?.length) {
  c.push(H1('출처'))
  for (const r of w.refs) c.push(P([t(`[${r.n}] `, { size: 16 }), link(r.제목, r.링크, { size: 16 }), dim(`  ${r.매체 || ''} ${r.날짜 || ''}`, 15)], { spacing: { after: 30 } }))
}

const doc = new Document({
  creator: 'jh-vc-dashboard', title: `JH Weekly Report ${w.기간.from}`,
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [{ id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0 } }],
  },
  numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 } } }, children: c }],
})
await mkdir('public/briefs/weekly', { recursive: true })
await writeFile(`public/briefs/weekly/${w.id}.docx`, await Packer.toBuffer(doc))
console.log(`워드 생성: public/briefs/weekly/${w.id}.docx`)
