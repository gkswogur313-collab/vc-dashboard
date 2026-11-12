// 반도체 브리핑 — 제목·요약으로 밸류체인 구간을 자동 태깅한다(주간 키워드 흐름·후보 정렬용).
// 같은 글이 여러 구간에 걸릴 수 있다. 정확한 분류는 브리핑 작성 때 사람이(Claude가) 다시 판단한다.
export const SEGMENTS = [
  ['소재', /소재|웨이퍼|포토레지스트|감광|특수가스|케미컬|전구체|슬러리|블랭크마스크|펠리클|타깃|기판 소재|photoresist|wafer supply|precursor|slurry|specialty gas|substrate material|SUMCO|Shin-Etsu|Entegris|JSR/i],
  ['부품', /부품|정전척|포커스링|쿼츠|세라믹|프로브카드|소켓|밸브|RF 전원|진공펌프|probe card|socket|ESC\b|consumable/i],
  ['장비', /장비|노광기|식각|증착|세정|CMP|계측|검사장비|본더|이온주입|ASML|Applied Materials|어플라이드|Lam Research|램리서치|Tokyo Electron|도쿄일렉트론|\bTEL\b|KLA|equipment|lithograph|EUV|High-NA|etch|deposition|ALD|metrology|inspection|WFE/i],
  ['메모리', /메모리|D램|DRAM|낸드|NAND|HBM|SSD|마이크론|Micron|SK하이닉스|SK hynix|CXMT|YMTC|memory/i],
  ['파운드리·로직', /파운드리|foundry|TSMC|2나노|2nm|3nm|GAA|18A|14A|A16|SF2|인텔 파운드리|Intel Foundry|SMIC|로직 공정|logic node|backside power|후면 전력/i],
  ['패키징·테스트', /패키징|후공정|CoWoS|하이브리드 본딩|hybrid bonding|칩렛|chiplet|TSV|인터포저|interposer|유리기판|glass substrate|CPO|co-packaged|테스트|OSAT|packaging|FC-BGA/i],
  ['설계·AI칩', /팹리스|fabless|AI 반도체|AI칩|AI chip|NPU|GPU|가속기|accelerator|ASIC|엔비디아|NVIDIA|AMD|브로드컴|Broadcom|퀄컴|Qualcomm|리벨리온|퓨리오사|EDA|Arm\b|RISC-V/i],
  ['정책·공급망', /특별법|보조금|수출통제|수출 규제|관세|export control|tariff|CHIPS|subsid|공급망|클러스터|산업부|산업통상부|정책|규제|sanction|entity list/i],
]
export function tagSemi(text = '') {
  const out = []
  for (const [k, re] of SEGMENTS) if (re.test(text)) out.push(k)
  return out
}
