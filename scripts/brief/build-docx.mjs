// 주간 브리핑 JSON → 워드(.docx)
// 사용: node scripts/brief/build-docx.mjs public/data/briefs/<id>.json   → public/briefs/<id>.docx
// 본문의 [n]은 위첨자 번호로, 문서 끝 '출처' 목록에 기관·제목·발간일·원문 링크를 단다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
  ImageRun,
} from 'docx'
import { keywordChartPng } from '../lib/keyword-chart.mjs'

const file = process.argv[2]
const b = JSON.parse(await readFile(file, 'utf-8'))
const refs = new Map(b.refs.map((r) => [r.n, r]))
const FONT = '맑은 고딕'
const ACCENT = '1F3864'
const DIM = '667085'

// "문장 [1][2]" → TextRun 배열(번호는 위첨자 + 출처 링크)
function runs(text, opt = {}) {
  const out = []
  let last = 0
  for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...opt }))
    const r = refs.get(+m[1])
    const sup = new TextRun({ text: `[${m[1]}]`, superScript: true, color: ACCENT, font: FONT })
    out.push(r ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...opt }))
  return out
}
const p = (text, opt = {}) => new Paragraph({ children: runs(text, opt.run), spacing: { after: 120, line: 300 }, ...opt.para })
const bullet = (text, level = 0) => new Paragraph({ children: runs(text), numbering: { reference: 'dots', level }, spacing: { after: 60, line: 290 } })
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 360, after: 160 } })
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, font: FONT })], spacing: { before: 240, after: 100 } })
const label = (t) => new Paragraph({ children: [new TextRun({ text: t, bold: true, color: ACCENT, font: FONT, size: 20 })], spacing: { before: 100, after: 40 } })

const children = []
children.push(new Paragraph({ children: [new TextRun({ text: '산업 트래킹 주간 브리핑', bold: true, size: 40, color: ACCENT, font: FONT })], spacing: { after: 80 } }))
children.push(new Paragraph({ children: [new TextRun({ text: `${b.기간.from} ~ ${b.기간.to} · 리포트 ${b.리포트수}건 검토`, color: DIM, size: 20, font: FONT })], spacing: { after: 240 } }))

children.push(h1('이번 주 한눈에'))
for (const t of b.한눈에) children.push(bullet(t))

children.push(h1('기술 스터디'))
b.기술스터디.forEach((s, i) => {
  children.push(h2(`${i + 1}. ${s.주제}`))
  if (s.한줄요약) children.push(p(s.한줄요약, { run: { italics: true, color: DIM } }))
  if (s.무엇인가) { children.push(label('무엇인가')); children.push(p(s.무엇인가)) }
  if (s.왜지금) { children.push(label('왜 지금')); children.push(p(s.왜지금)) }
  if (s.핵심포인트?.length) { children.push(label('핵심 포인트')); for (const t of s.핵심포인트) children.push(bullet(t)) }
  if (s.밸류체인) { children.push(label('밸류체인·주요 플레이어')); children.push(p(s.밸류체인)) }
  if (s.더읽을거리?.length) { children.push(label('더 읽을 리포트')); for (const n of s.더읽을거리) { const r = refs.get(n); if (r) children.push(bullet(`${r.기관} — ${r.제목} [${n}]`)) } }
})

children.push(h1('업계 동향'))
for (const g of b.업계동향) { children.push(h2(g.테마)); for (const t of g.시그널) children.push(bullet(t)) }

children.push(h1('정독 추천 리포트 TOP 3'))
b.정독TOP3.forEach((t, i) => {
  const r = refs.get(t.ref)
  children.push(new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: `${i + 1}. `, bold: true, font: FONT, color: ACCENT }),
      new ExternalHyperlink({ link: r.링크, children: [new TextRun({ text: r.제목, bold: true, font: FONT, color: ACCENT, underline: {} })] })],
  }))
  children.push(new Paragraph({ children: [new TextRun({ text: `${r.기관} · ${r.날짜 || '발간일 미상'}`, color: DIM, size: 18, font: FONT })], spacing: { after: 60 } }))
  children.push(p(t.이유))
  for (const x of t.읽는포인트 || []) children.push(bullet(x))
})

const kwChart = await keywordChartPng(b.키워드)
if (kwChart) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text: '키워드 흐름', font: FONT })], spacing: { before: 360, after: 160 } }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: kwChart.png, transformation: { width: 620, height: Math.round(620 * kwChart.height / kwChart.width) } })] }))
} else if (b.키워드?.length) {
  children.push(h1('키워드 흐름'))
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
  const cell = (t, w, head) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border },
    shading: head ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ alignment: head || w < 3000 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: String(t), bold: head, font: FONT, size: 20 })] })],
  })
  const W = [4200, 2400, 2400]
  children.push(new Table({
    width: { size: 9000, type: WidthType.DXA }, columnWidths: W,
    rows: [
      new TableRow({ children: ['세부 테마', '이번 주', '지난주'].map((t, i) => cell(t, W[i], true)) }),
      ...b.키워드.slice(0, 12).map((k) => new TableRow({ children: [cell(k.tag, W[0]), cell(k.count, W[1]), cell(k.prev, W[2])] })),
    ],
  }))
}

children.push(h1('출처'))
for (const r of b.refs) {
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: `[${r.n}] ${r.기관} · ${r.날짜 || '-'} · `, font: FONT, size: 18 }),
      new ExternalHyperlink({ link: r.링크, children: [new TextRun({ text: r.제목, style: 'Hyperlink', font: FONT, size: 18 })] }),
      ...(r.원문확인 === false ? [new TextRun({ text: ' (원문 확인 못함)', color: DIM, font: FONT, size: 18 })] : [])],
  }))
}
if (b.메모) { children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: b.메모, color: DIM, size: 18, font: FONT })] })) }

const doc = new Document({
  creator: 'jh-vc-dashboard', title: `산업 트래킹 주간 브리핑 ${b.기간.from}`,
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } }, children }],
})
await mkdir('public/briefs', { recursive: true })
const out = `public/briefs/${b.id}.docx`
await writeFile(out, await Packer.toBuffer(doc))
console.log(`워드 생성: ${out}`)
