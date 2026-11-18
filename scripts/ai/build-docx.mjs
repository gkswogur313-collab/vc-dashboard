// AI 주간 브리핑 JSON → 워드(.docx)
// 사용: node scripts/ai/build-docx.mjs public/data/ai/weekly/<id>.json  → public/briefs/ai/<id>.docx
// 본문 생성은 renderAiWeekly()로 분리 — JH Weekly Report 워드(scripts/weekly/build-docx.mjs)도 같은 함수를 쓴다.
// 구조는 반도체 브리핑(scripts/semi/build-docx.mjs)과 같고, '밸류체인' 대신 '레이어'(+공통 태그)를 쓴다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
} from 'docx'
import { keywordChartPng } from '../lib/keyword-chart.mjs'

const FONT = '맑은 고딕'; const ACCENT = '1F3864'; const DIM = '667085'
// 교과서 장 제목은 textbook.json에서 읽는다(장 번호가 바뀌어도 링크가 맞도록)
let TB = {}
try { TB = Object.fromEntries(JSON.parse(await readFile('public/data/ai/textbook.json', 'utf-8')).장.map((c) => [c.id, `${c.번호}장 ${c.제목}`])) } catch { /* 없음 */ }

// opt.prefix: 출처 번호 앞에 붙일 문자(JH Weekly 안에서는 'A' → [A1]) · opt.h1/h2: 제목 단락 생성 함수 · opt.top: 맨 위 제목을 넣을지
export async function renderAiWeekly(b, opt = {}) {
  const pre = opt.prefix || ''
  const refs = new Map((b.refs || []).map((r) => [r.n, r]))
  const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o })
  const runs = (text, o = {}) => {
    const out = []; let last = 0; text = String(text || '')
    for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
      if (m.index > last) out.push(t(text.slice(last, m.index), o))
      const r = refs.get(+m[1]); const sup = t(`[${pre}${m[1]}]`, { superScript: true, color: ACCENT })
      out.push(r?.링크 ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
      last = m.index + m[0].length
    }
    if (last < text.length) out.push(t(text.slice(last), o))
    return out
  }
  const P = (x, o = {}) => new Paragraph({ children: Array.isArray(x) ? x : runs(x, o.run), spacing: { after: 110, line: 300 }, ...o.para })
  const B = (x) => new Paragraph({ children: Array.isArray(x) ? x : runs(x), numbering: { reference: 'dots', level: 0 }, spacing: { after: 60, line: 290 } })
  const H1 = opt.h1 || ((s) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(s)] }))
  const H2 = opt.h2 || ((s) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(s)] }))
  const L = (s) => new Paragraph({ keepNext: true, children: [t(s, { bold: true, color: ACCENT, size: 20 })], spacing: { before: 120, after: 40 } })
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
  const table = (head, rows, W) => new Table({
    width: { size: W.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: W,
    rows: [head, ...rows].map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((x, i) => new TableCell({
      width: { size: W[i], type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border },
      shading: ri === 0 ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined, margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: [new Paragraph({ children: runs(String(x), { bold: ri === 0, size: 18 }) })],
    })) })),
  })

  const c = []
  if (opt.top !== false) {
    c.push(new Paragraph({ children: [t('AI 주간 브리핑', { bold: true, size: 40, color: ACCENT })], spacing: { after: 80 } }))
    c.push(new Paragraph({ children: [t(`${b.기간.from} ~ ${b.기간.to} · 자료 ${b.자료수}건 검토 · 인프라·하드웨어·모델·애플리케이션·피지컬 AI`, { color: DIM, size: 20 })], spacing: { after: 240 } }))
  } else c.push(P([t(`${b.기간.from} ~ ${b.기간.to} · 자료 ${b.자료수}건 검토`, { color: DIM, size: 18 })]))

  c.push(H1('이번 주 한눈에')); for (const s of b.한눈에) c.push(B(s))
  if (b.숫자?.length) {
    c.push(H1('숫자로 본 이번 주'))
    c.push(table(['지표', '값', '설명'], b.숫자.map((x) => [x.지표, x.값, x.설명]), [2200, 1700, 5400]))
  }
  c.push(H1('레이어별 시그널'))
  for (const g of b.레이어) {
    c.push(H2(g.구간))
    for (const s of g.시그널) c.push(B([t(`${s.제목}${s.태그?.length ? ` [${s.태그.join('·')}]` : ''} — `, { bold: true }), ...runs(s.내용), ...(s.함의 ? [t(' → ', { color: ACCENT }), ...runs(s.함의, { color: ACCENT })] : [])]))
  }
  if (b.국내?.length) {
    c.push(H1('국내 AI 기업·정책 동향'))
    c.push(table(['기업·기관', '구분', '내용'], b.국내.map((x) => [x.기업, x.구분 || '', x.내용]), [1700, 1300, 6300]))
  }
  if (b.반도체연계?.length) { c.push(H1('반도체 브리핑에서 다룬 소식')); for (const s of b.반도체연계) c.push(B(s)) }
  c.push(H1('기술 노트'))
  for (const s of b.기술노트) {
    c.push(H2(s.주제))
    c.push(P(s.설명))
    if (s.교과서) c.push(P([t(`AI 교과서에서 더 보기: ${TB[s.교과서] || s.교과서}`, { size: 17, color: DIM, italics: true })]))
  }
  if (b.정독?.length) {
    c.push(H1('정독 추천'))
    b.정독.forEach((x, i) => {
      const r = refs.get(x.ref) || {}
      c.push(P([t(`${i + 1}. `, { bold: true }), r.링크 ? new ExternalHyperlink({ link: r.링크, children: [t(r.제목 || '', { bold: true, color: ACCENT, underline: {} })] }) : t(r.제목 || '', { bold: true }), t(`  ${r.매체 || ''} ${r.날짜 || ''}`, { size: 16, color: DIM })]))
      c.push(P(x.이유))
    })
  }
  if (b.교과서반영?.length) { c.push(H1('이번 주 교과서 반영')); for (const s of b.교과서반영) c.push(B(s)) }
  if (b.키워드?.length) {
    c.push(H1('레이어·태그별 언급 흐름'))
    const ch = await keywordChartPng(b.키워드)
    if (ch) c.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: ch.png, transformation: { width: 600, height: Math.round(600 * ch.height / ch.width) } })] }))
    else c.push(P(b.키워드.map((k) => `${k.tag} ${k.count}/${k.prev}`).join(' · ')))
  }
  c.push(L(opt.top === false ? 'AI 브리핑 출처' : '출처'))
  for (const r of b.refs) c.push(new Paragraph({ spacing: { after: 40 }, children: [t(`[${pre}${r.n}] ${r.매체 || ''} · ${r.날짜 || '-'} · `, { size: 16 }), new ExternalHyperlink({ link: r.링크, children: [t(r.제목, { style: 'Hyperlink', size: 16 })] })] }))
  if (b.메모) c.push(P([t(b.메모, { size: 16, color: DIM })]))
  return c
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const b = JSON.parse(await readFile(process.argv[2], 'utf-8'))
  const children = await renderAiWeekly(b)
  const doc = new Document({
    creator: 'jh-vc-dashboard', title: `AI 주간 브리핑 ${b.기간.from}`,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 29, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 340, after: 140 }, outlineLevel: 0, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 23, bold: true, font: FONT }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1, keepNext: true } },
      ],
    },
    numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } }, children }],
  })
  await mkdir('public/briefs/ai', { recursive: true })
  await writeFile(`public/briefs/ai/${b.id}.docx`, await Packer.toBuffer(doc))
  console.log(`워드 생성: public/briefs/ai/${b.id}.docx`)
}
