// AI 교과서 — 검증 + 출처 번호 정리 + 워드 생성. 실제 로직은 반도체와 공용인 scripts/semi/textbook.mjs 에 있다.
// 사용: node scripts/ai/textbook.mjs [--check]
process.argv.push('--book', 'ai')
await import('../semi/textbook.mjs')
