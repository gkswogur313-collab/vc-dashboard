// IPO 단계별 보고서 JSON → 워드(.docx) — 모든 단계를 최신 단계 먼저 한 문서에
// 사용: node scripts/ipo-report-docx.mjs   (public/data/ipo-reports/index.json 의 모든 보고서를 다시 만든다)
// 출력: public/briefs/ipo/<file>.docx
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, LevelFormat,
} from 'docx'

import { toBullets } from '../src/lib/bullets.js'

const DIR = 'public/data/ipo-reports'
const OUT = 'public/briefs/ipo'
const FONT = '맑은 고딕'
const ACCENT = '1F3864'
const DIM = '667085'
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DD' }
const borders = { top: border, bottom: border, left: border, right: border }

const t = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, ...o })
const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [t(children)], spacing: { after: 100, line: 300 }, ...o })
const h1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(s)], spacing: { before: 320, after: 140 } })
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [t(text, { style: 'Hyperlink', ...o })] })

function cell(text, w, { head = false, align } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: head ? { type: ShadingType.CLEAR, fill: 'E8EEF7', color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: align || (head ? AlignmentType.CENTER : AlignmentType.LEFT), children: [t(text, { bold: head, size: 19 })] })],
  })
}
function table(rows, widths, { firstHead = true, rightFrom = 99 } = {}) {
  const total = widths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      children: widths.map((w, j) => cell(r[j] ?? '', w, { head: firstHead && i === 0, align: !(firstHead && i === 0) && j >= rightFrom ? AlignmentType.RIGHT : undefined })),
    })),
  })
}
const kv = (pairs) => table(pairs.filter(([, v]) => v), [2400, 6600], { firstHead: false })
const range = (a, b) => (a ? (b && b !== a ? `${a} ~ ${b}` : a) : '')

// "문장 [1]" → 텍스트 + 위첨자 링크
function cited(text, refs) {
  const out = []; let last = 0
  for (const m of String(text).matchAll(/\s*\[(\d+)\]/g)) {
    if (m.index > last) out.push(t(text.slice(last, m.index)))
    const r = refs.get(+m[1]); const sup = t(`[${m[1]}]`, { superScript: true, color: ACCENT })
    out.push(r?.링크 ? new ExternalHyperlink({ link: r.링크, children: [sup] }) : sup)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(t(text.slice(last)))
  return out
}
const STAGE_NAME = { 청구: '심사청구', 승인: '심사승인', 상장: '상장' }
const ORDER = ['상장', '승인', '청구'] // 최신 단계 먼저

function stageBlock(st, v) {
  const c = []
  c.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(`${STAGE_NAME[st]} 단계 보고서`)], spacing: { before: 360, after: 80 } }))
  c.push(para([t(`기준일 ${v.기준일} · 작성 ${(v.요약?.작성 || v.generated_at || '').slice(0, 10)}`, { color: DIM, size: 18 })]))
  const s = v.요약
  const refs = new Map((s?.refs || []).map((r) => [r.n, r]))
  if (s) {
    if (s.한줄) c.push(para(cited(s.한줄, refs).map((x) => x), { spacing: { after: 120 } }))
    if (s.영위사업) { c.push(h2('영위사업 (뉴스 기반)')); for (const b of toBullets(s.영위사업)) c.push(new Paragraph({ numbering: { reference: 'dots', level: 0 }, spacing: { after: 60 }, children: cited(b, refs) })) }
    if (s.포인트?.length) { c.push(h2('주요 포인트')); for (const p of s.포인트) c.push(new Paragraph({ numbering: { reference: 'dots', level: 0 }, spacing: { after: 60 }, children: cited(p, refs) })) }
  } else c.push(para([t('뉴스 기반 요약은 매일 아침 작성됩니다(작성 대기 중).', { color: DIM })]))
  if (st === '상장') {
    if (v.영위사업DART) { c.push(h2('영위사업 (증권신고서)')); for (const b of toBullets(v.영위사업DART)) c.push(new Paragraph({ numbering: { reference: 'dots', level: 0 }, spacing: { after: 60 }, children: [t(b)] })) }
    const f = v.실적
    c.push(h2('실적 (증권신고서 요약재무정보)'))
    if (f && f.행?.length) {
      const n = Math.max(f.머리.length, ...f.행.map((r) => r.length))
      const W = 9000; const first = 1800; const rest = Math.floor((W - first) / Math.max(1, n - 1))
      c.push(table([['구분', ...f.머리.slice(1)], ...f.행].map((r) => Array.from({ length: n }, (_, i) => r[i] ?? '')), [first, ...Array(n - 1).fill(rest)], { rightFrom: 1 }))
      c.push(para([t(`단위: ${f.단위} · ${f.기준} 기준 · 증권신고서 원문 표 그대로`, { color: DIM, size: 17 })], { spacing: { before: 60 } }))
    } else c.push(para([t('요약재무정보 표를 찾지 못했습니다.', { color: DIM })]))
    if (v.증권신고서) c.push(para([t('DART 원문: ', { size: 18 }), link(`${v.증권신고서.보고서명} (접수 ${v.증권신고서.접수일})`, v.증권신고서.링크, { size: 18 })]))
  }
  if (s?.refs?.length) {
    c.push(h2('출처'))
    for (const r of s.refs) c.push(new Paragraph({ spacing: { after: 40 }, children: [t(`[${r.n}] `, { size: 17 }), link(r.제목, r.링크, { size: 17 }), t(`  ${r.매체 || ''} ${r.날짜 || ''}`, { color: DIM, size: 16 })] }))
  } else if (v.기사?.length) {
    c.push(h2('수집된 기사'))
    for (const a of v.기사) c.push(new Paragraph({ numbering: { reference: 'dots', level: 0 }, spacing: { after: 40 }, children: [link(a.제목, a.링크, { size: 18 }), t(`  ${a.매체 || ''} ${a.날짜 || ''}`, { color: DIM, size: 16 })] }))
  }
  if (v.메모?.length) c.push(para([t('참고: ' + v.메모.join(' / '), { color: DIM, size: 17 })]))
  return c
}
const h2 = (s) => new Paragraph({ children: [t(s, { bold: true, color: ACCENT, size: 21 })], spacing: { before: 180, after: 60 } })

async function build(rep, file) {
  const c = []
  c.push(new Paragraph({ children: [t('IPO 단계별 보고서', { color: DIM, size: 20 })], spacing: { after: 40 } }))
  c.push(new Paragraph({ children: [t(rep.회사명, { bold: true, size: 40, color: ACCENT })], spacing: { after: 60 } }))
  const g = rep.공모 || {}
  const 상장 = g.상장일 || g.상장예정일
  c.push(para([t(`${rep.시장 || ''} · 현재 단계: ${STAGE_NAME[rep.현재단계] || '-'} · 갱신 ${(rep.updated_at || '').slice(0, 10)}`, { color: DIM, size: 19 })]))

  c.push(h1('공모 개요'))
  c.push(kv([
    ['예비심사 청구', g.청구일], ['예비심사 승인', g.승인일], ['심사 상태', g.심사상태], ['수요예측', range(g.수요예측시작, g.수요예측종료)],
    ['청약', range(g.청약시작, g.청약종료)], ['상장(예정)일', 상장], ['확정공모가(원)', g.확정공모가], ['공모금액(백만원)', g.공모금액], ['주관사', g.주관사],
  ]))
  const ci = rep.회사정보
  c.push(h1('회사 정보 (DART 기업개황)'))
  if (ci) c.push(kv([['정식 명칭', ci.정식명칭], ['대표자', ci.대표자], ['설립일', ci.설립일], ['결산월', ci.결산월], ['업종코드', ci.업종코드], ['주소', ci.주소], ['홈페이지', ci.홈페이지]]))
  else c.push(para([t('DART에서 회사 정보를 찾지 못했습니다.', { color: DIM })]))

  for (const st of ORDER) if (rep.단계?.[st]) c.push(...stageBlock(st, rep.단계[st]))

  const doc = new Document({
    creator: 'jh-vc-dashboard', title: `${rep.회사명} IPO 보고서`,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [{ id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, color: ACCENT, font: FONT }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0 } }],
    },
    numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } }, children: c }],
  })
  await writeFile(`${OUT}/${file}.docx`, await Packer.toBuffer(doc))
}

const index = JSON.parse(await readFile(`${DIR}/index.json`, 'utf-8'))
await mkdir(OUT, { recursive: true })
const keep = new Set()
for (const v of Object.values(index.reports || {})) {
  const rep = JSON.parse(await readFile(`${DIR}/${v.file}.json`, 'utf-8'))
  await build(rep, v.file)
  keep.add(`${v.file}.docx`)
}
for (const f of await readdir(OUT)) if (f.endsWith('.docx') && !keep.has(f)) await rm(`${OUT}/${f}`) // 정리된 보고서의 워드도 삭제
console.log(`IPO 보고서 워드 ${keep.size}건 생성`)
