// 반도체 교과서 — 검증 + 출처 번호 정리 + 워드(.docx) 생성
// 사용: node scripts/semi/textbook.mjs            → public/data/semi/textbook.json 검증·정리 후 public/briefs/semi/textbook.docx 생성
//       node scripts/semi/textbook.mjs --check    → 검증만(파일을 고치지 않음)
// · 본문의 [n]이 모두 refs에 있는지 확인하고, 처음 나오는 순서대로 1,2,3… 으로 다시 번호를 매긴다(안 쓰는 출처는 지운다).
// · 개정이력 맨 위 버전·날짜를 version/updated_at 에 맞춘다.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType, PageBreak,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat, TableOfContents,
  Footer, PageNumber, ImageRun,
} from 'docx'
import { diagramPng } from './diagram.mjs'

const FILE = 'public/data/semi/textbook.json'
const OUT = 'public/briefs/semi/textbook.docx'
const checkOnly = process.argv.includes('--check')
const tb = JSON.parse(await readFile(FILE, 'utf-8'))
const errs = []
const need = (c, m) => { if (!c) errs.push(m) }

// ── 검증 ──
need(tb.제목 && tb.버전 && tb.updated_at, '제목·버전·updated_at 필요')
need(Array.isArray(tb.장) && tb.장.length >= 10, '장: 10개 이상')
need(Array.isArray(tb.개정이력) && tb.개정이력.length > 0, '개정이력 필요')
const ids = new Set()
for (const c of tb.장 || []) {
  need(/^ch\d{2}$/.test(c.id || ''), `장 id 형식(chNN): ${c.id}`)
  need(!ids.has(c.id), `장 id 중복: ${c.id}`); ids.add(c.id)
  need(c.제목 && c.요약 && Array.isArray(c.절) && c.절.length > 0, `${c.id}: 제목·요약·절 필요`)
  for (const s of c.절 || []) {
    need(s.제목 && Array.isArray(s.본문) && s.본문.length > 0, `${c.id}: 절 제목·본문 필요`)
    if (s.표) need(Array.isArray(s.표.머리) && s.표.행?.every((r) => r.length === s.표.머리.length), `${c.id} '${s.제목}': 표 열 수 불일치`)
    if (s.도식) need((s.도식.종류 === '흐름' && s.도식.단계?.length >= 2) || (s.도식.종류 === '층' && s.도식.층?.length >= 2), `${c.id} '${s.제목}': 도식은 종류 '흐름'(단계 2개 이상) 또는 '층'(층 2개 이상)`)
  }
}
const refs = new Map((tb.refs || []).map((r) => [r.n, r]))
for (const r of tb.refs || []) need(r.n && r.제목 && r.링크 && /^https?:\/\//.test(r.링크), `refs[${r.n}]: 제목·링크 필요`)

// 문자열 전체를 순서대로 훑는다(장 → 부록 순)
const walkStrings = (v, fn) => {
  if (typeof v === 'string') return fn(v)
  if (Array.isArray(v)) return v.map((x) => walkStrings(x, fn))
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = k === 'refs' ? x : walkStrings(x, fn); return o }
  return v
}
const order = []
walkStrings(tb.장, (s) => { for (const m of s.matchAll(/\[(\d+)\]/g)) { const n = +m[1]; if (!refs.has(n)) errs.push(`출처 [${n}] 가 refs에 없음: "${s.slice(0, 40)}…"`); else if (!order.includes(n)) order.push(n) } return s })
if (errs.length) { console.error('검증 실패:\n - ' + errs.join('\n - ')); process.exit(1) }
if (checkOnly) { console.log(`검증 통과 · ${tb.장.length}개 장 · 출처 ${order.length}건`); process.exit(0) }

// ── 번호 정리 ──
const remap = new Map(order.map((n, i) => [n, i + 1]))
tb.장 = walkStrings(tb.장, (s) => s.replace(/\[(\d+)\]/g, (_, n) => `[${remap.get(+n)}]`))
tb.refs = order.map((n) => ({ ...refs.get(n), n: remap.get(n) }))
const top = tb.개정이력[0]
tb.버전 = top.버전 || tb.버전
tb.updated_at = top.날짜 || tb.updated_at
await writeFile(FILE, JSON.stringify(tb, null, 1))

// ── 워드 ──
const FONT = '맑은 고딕'; const ACCENT = '1F3864'; const DIM = '667085'
const R = new Map(tb.refs.map((r) => [r.n, r]))
const t = (text, o = {}) => new TextRun({ text, font: FONT, ...o })
function runs(text, o = {}) {
  const out = []; let last = 0
  for (const m of text.matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) out.push(t(text.slice(last, m.index), o))
    const r = R.get(+m[1]); const sup = t(`[${m[1]}]`, { superScript: true, color: ACCENT })
    out.push(r ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(t(text.slice(last), o))
  return out
}
const P = (text, o = {}) => new Paragraph({ children: runs(text, o.run), spacing: { after: 120, line: 320 }, ...o.para })
const B = (text) => new Paragraph({ children: runs(text), numbering: { reference: 'dots', level: 0 }, spacing: { after: 60, line: 300 } })
const H = (lvl, text, o = {}) => new Paragraph({ heading: lvl, children: [t(text)], ...o })
const label = (text) => new Paragraph({ keepNext: true, children: [t(text, { bold: true, color: ACCENT, size: 21 })], spacing: { before: 160, after: 60 } })
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
function table(head, rows, widths) {
  const W = 9300; const ws = widths || head.map(() => Math.floor(W / head.length))
  const cell = (s, h, i) => new TableCell({
    width: { size: ws[i], type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border },
    shading: h ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: [new Paragraph({ children: runs(String(s), { bold: h, size: 18 }) })],
  })
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: ws, rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, true, i)) }), ...rows.map((r) => new TableRow({ children: r.map((x, i) => cell(x, false, i)) }))] })
}

const c = []
c.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [t(tb.제목, { bold: true, size: 64, color: ACCENT })] }))
c.push(new Paragraph({ spacing: { after: 400 }, children: [t(tb.부제 || '', { size: 26, color: DIM })] }))
c.push(new Paragraph({ children: [t(`버전 ${tb.버전} · ${tb.updated_at} 갱신`, { size: 22 })] }))
c.push(new Paragraph({ children: [t('JH VC Dashboard › 산업 트래킹 › 반도체 브리핑에서 매주 자동 갱신', { size: 18, color: DIM })] }))
c.push(new Paragraph({ children: [new PageBreak()] }))
const big = (s) => new Paragraph({ children: [t(s, { bold: true, size: 34, color: ACCENT })], spacing: { before: 240, after: 160 } })
c.push(big('읽는 법'))
for (const s of tb.읽는법 || []) c.push(B(s))
c.push(big('목차'))
c.push(new TableOfContents('목차', { hyperlink: true, headingStyleRange: '1-2' }))
c.push(new Paragraph({ children: [t('※ 목차가 비어 보이면 워드에서 목차를 클릭하고 [필드 업데이트]를 누르세요.', { size: 16, color: DIM })] }))

let part = ''
for (const ch of tb.장) {
  c.push(new Paragraph({ children: [new PageBreak()] }))
  if (ch.파트 && ch.파트 !== part) { part = ch.파트; c.push(new Paragraph({ children: [t(part, { size: 20, color: DIM, bold: true })], spacing: { after: 40 } })) }
  c.push(H(HeadingLevel.HEADING_1, `${ch.번호}장. ${ch.제목}`))
  if (ch.자동갱신) c.push(new Paragraph({ children: [t(`이 장은 매주 반도체 브리핑을 반영해 갱신됩니다 (마지막 갱신 ${tb.updated_at}).`, { size: 17, color: DIM, italics: true })] }))
  c.push(P(ch.요약, { run: { italics: true, color: '344054' } }))
  for (const s of ch.절) {
    c.push(H(HeadingLevel.HEADING_2, s.제목))
    for (const x of s.본문) c.push(P(x))
    if (s.도식) {
      const im = await diagramPng(s.도식)
      if (im) { c.push(new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 80, after: 40 }, children: [new ImageRun({ type: 'png', data: im.png, transformation: { width: 600, height: Math.round(600 * im.height / im.width) } })] })); c.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [t(`그림 · ${s.도식.제목 || s.제목}`, { size: 16, color: DIM })] })) }
    }
    if (s.표) { c.push(table(s.표.머리, s.표.행)); if (s.표.주) c.push(new Paragraph({ children: runs(s.표.주, { size: 16, color: DIM }), spacing: { before: 40, after: 120 } })); else c.push(new Paragraph({ children: [] })) }
    if (s.관전포인트?.length) { c.push(label('관전 포인트')); for (const x of s.관전포인트) c.push(B(x)) }
  }
  if (ch.핵심정리?.length) { c.push(label('핵심 정리')); for (const x of ch.핵심정리) c.push(B(x)) }
  if (ch.체크포인트?.length) { c.push(label('심사역 체크포인트')); for (const x of ch.체크포인트) c.push(B(x)) }
  if (ch.용어?.length) { c.push(label('용어')); c.push(table(['용어', '뜻'], ch.용어.map((u) => [u.용어, u.뜻]), [2300, 7000])) }
}

if (tb.부록) {
  c.push(new Paragraph({ children: [new PageBreak()] }))
  c.push(H(HeadingLevel.HEADING_1, tb.부록.제목))
  if (tb.부록.설명) c.push(P(tb.부록.설명))
  for (const g of tb.부록.그룹) {
    c.push(H(HeadingLevel.HEADING_2, g.이름))
    for (const x of g.항목) c.push(new Paragraph({ numbering: { reference: 'dots', level: 0 }, spacing: { after: 50 }, children: [new ExternalHyperlink({ link: x.링크, children: [t(x.이름, { style: 'Hyperlink' })] }), t(x.설명 ? ` — ${x.설명}` : '', { color: DIM, size: 19 })] }))
  }
}

c.push(new Paragraph({ children: [new PageBreak()] }))
c.push(H(HeadingLevel.HEADING_1, '용어 색인'))
{
  const all = []
  for (const ch of tb.장) for (const u of ch.용어 || []) all.push([u.용어, u.뜻, `${ch.번호}장`])
  all.sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  c.push(P(`이 책에 나온 용어 ${all.length}개를 가나다순으로 모았다. 오른쪽 숫자는 처음 설명한 장이다.`))
  c.push(table(['용어', '뜻', '장'], all, [2300, 6200, 800]))
}
c.push(new Paragraph({ children: [new PageBreak()] }))
c.push(H(HeadingLevel.HEADING_1, '개정 이력'))
c.push(table(['날짜', '버전', '내용'], tb.개정이력.map((x) => [x.날짜, x.버전 || '', x.내용]), [1500, 900, 6900]))
c.push(H(HeadingLevel.HEADING_1, '출처'))
for (const r of tb.refs) c.push(new Paragraph({ spacing: { after: 50 }, children: [t(`[${r.n}] ${r.매체 || ''} · ${r.날짜 || '-'} · `, { size: 17 }), new ExternalHyperlink({ link: r.링크, children: [t(r.제목, { style: 'Hyperlink', size: 17 })] })] }))

const doc = new Document({
  creator: 'jh-vc-dashboard', title: `${tb.제목} v${tb.버전}`, features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0, keepNext: true } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: FONT }, paragraph: { spacing: { before: 260, after: 100 }, outlineLevel: 1, keepNext: true } },
    ],
  },
  numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [t(`${tb.제목} v${tb.버전} · `, { size: 16, color: DIM }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: DIM, font: FONT })] })] }) },
    children: c,
  }],
})
await mkdir('public/briefs/semi', { recursive: true })
await writeFile(OUT, await Packer.toBuffer(doc))
console.log(`검증 통과 · ${tb.장.length}개 장 · 출처 ${tb.refs.length}건 · 버전 ${tb.버전} → ${OUT}`)
