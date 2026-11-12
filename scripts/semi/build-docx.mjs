// 반도체 주간 브리핑 JSON → 워드(.docx)
// 사용: node scripts/semi/build-docx.mjs public/data/semi/weekly/<id>.json  → public/briefs/semi/<id>.docx
// 본문 생성은 renderSemiWeekly()로 분리 — JH Weekly Report 워드(scripts/weekly/build-docx.mjs)도 같은 함수를 쓴다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
} from 'docx'
import { keywordChartPng } from '../lib/keyword-chart.mjs'

const FONT = '맑은 고딕'; const ACCENT = '1F3864'; const DIM = '667085'
const TB = { ch01: '1장 반도체란 무엇인가', ch02: '2장 트랜지스터와 미세화', ch03: '3장 반도체 제품의 종류', ch04: '4장 웨이퍼와 8대 공정', ch05: '5장 포토 공정과 노광 기술', ch06: '6장 식각·증착·세정·CMP·계측', ch07: '7장 패키징과 테스트', ch08: '8장 산업 구조와 비즈니스 모델', ch09: '9장 소재', ch10: '10장 장비', ch11: '11장 부품', ch12: '12장 국가별 지형과 한국의 위치', ch13: '13장 업황을 읽는 지표', ch14: '14장 AI가 바꾼 반도체 수요', ch15: '15장 최신 기술동향' }

// opt.prefix: 출처 번호 앞에 붙일 문자(JH Weekly 안에서는 'S' → [S1]) · opt.h1/h2: 제목 단락 생성 함수 · opt.top: 맨 위 제목을 넣을지
export async function renderSemiWeekly(b, opt = {}) {
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
    c.push(new Paragraph({ children: [t('반도체 주간 브리핑', { bold: true, size: 40, color: ACCENT })], spacing: { after: 80 } }))
    c.push(new Paragraph({ children: [t(`${b.기간.from} ~ ${b.기간.to} · 자료 ${b.자료수}건 검토 · 소재·부품·장비부터 칩·정책까지`, { color: DIM, size: 20 })], spacing: { after: 240 } }))
  } else c.push(P([t(`${b.기간.from} ~ ${b.기간.to} · 자료 ${b.자료수}건 검토`, { color: DIM, size: 18 })]))

  c.push(H1('이번 주 한눈에')); for (const s of b.한눈에) c.push(B(s))
  if (b.숫자?.length) {
    c.push(H1('숫자로 본 이번 주'))
    c.push(table(['지표', '값', '설명'], b.숫자.map((x) => [x.지표, x.값, x.설명]), [2200, 1700, 5400]))
  }
  c.push(H1('밸류체인별 시그널'))
  for (const g of b.밸류체인) {
    c.push(H2(g.구간))
    for (const s of g.시그널) c.push(B([t(`${s.제목} — `, { bold: true }), ...runs(s.내용), ...(s.함의 ? [t(' → ', { color: ACCENT }), ...runs(s.함의, { color: ACCENT })] : [])]))
  }
  if (b.국내기업?.length) {
    c.push(H1('국내 소부장·반도체 기업 동향'))
    c.push(table(['기업', '구분', '내용'], b.국내기업.map((x) => [x.기업, x.구분 || '', x.내용]), [1700, 1300, 6300]))
  }
  c.push(H1('기술 노트'))
  for (const s of b.기술노트) {
    c.push(H2(s.주제))
    c.push(P(s.설명))
    if (s.교과서) c.push(P([t(`교과서에서 더 보기: ${TB[s.교과서] || s.교과서}`, { size: 17, color: DIM, italics: true })]))
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
    c.push(H1('밸류체인 구간별 언급 흐름'))
    const ch = await keywordChartPng(b.키워드)
    if (ch) c.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: ch.png, transformation: { width: 600, height: Math.round(600 * ch.height / ch.width) } })] }))
    else c.push(P(b.키워드.map((k) => `${k.tag} ${k.count}/${k.prev}`).join(' · ')))
  }
  c.push(L(opt.top === false ? '반도체 브리핑 출처' : '출처'))
  for (const r of b.refs) c.push(new Paragraph({ spacing: { after: 40 }, children: [t(`[${pre}${r.n}] ${r.매체 || ''} · ${r.날짜 || '-'} · `, { size: 16 }), new ExternalHyperlink({ link: r.링크, children: [t(r.제목, { style: 'Hyperlink', size: 16 })] })] }))
  if (b.메모) c.push(P([t(b.메모, { size: 16, color: DIM })]))
  return c
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const b = JSON.parse(await readFile(process.argv[2], 'utf-8'))
  const children = await renderSemiWeekly(b)
  const doc = new Document({
    creator: 'jh-vc-dashboard', title: `반도체 주간 브리핑 ${b.기간.from}`,
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
  await mkdir('public/briefs/semi', { recursive: true })
  await writeFile(`public/briefs/semi/${b.id}.docx`, await Packer.toBuffer(doc))
  console.log(`워드 생성: public/briefs/semi/${b.id}.docx`)
}
