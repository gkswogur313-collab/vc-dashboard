// AI 브리핑 — 제목·요약으로 레이어(인프라·하드웨어·모델·애플리케이션·피지컬 AI)와 공통 태그(정책·규제·투자·회수)를 자동으로 단다.
// 주간 키워드 흐름·후보 정렬용이다. 같은 글이 여러 곳에 걸릴 수 있고, 정확한 분류는 브리핑 작성 때 다시 판단한다.
export const LAYERS = [
  ['인프라', /데이터센터|데이터 센터|data ?center|하이퍼스케일|hyperscal|클라우드|cloud|네오클라우드|neocloud|CoreWeave|코어위브|Nebius|Lambda|전력|power grid|gigawatt|기가와트|\bGW\b|냉각|cooling|액침|liquid cool|capex|설비투자|Stargate|스타게이트|AI 컴퓨팅센터|GPU 임대|GPU cluster|GPU 클러스터|인터커넥트|광통신|optical|이더넷|InfiniBand|인피니밴드/i],
  ['하드웨어', /GPU|엔비디아|NVIDIA|Blackwell|블랙웰|Rubin|루빈|AMD|MI\d{3}|TPU|Trainium|트레이니엄|Inferentia|ASIC|가속기|accelerator|NPU|AI 반도체|AI 칩|AI chip|HBM|서버|server|랙|rack|NVL\d+|리벨리온|퓨리오사|딥엑스|Cerebras|Groq|그록칩|온디바이스|on-device|AI PC|브로드컴|Broadcom/i],
  ['모델', /모델|model|LLM|언어모델|파운데이션|foundation|GPT-?\d|Gemini|제미나이|Claude|클로드|Llama|라마|DeepSeek|딥시크|Qwen|큐원|Mistral|미스트랄|Grok|오픈소스|open[- ]weight|open[- ]source|추론 모델|reasoning|벤치마크|benchmark|학습|training|사전학습|pretrain|파인튜닝|fine-?tun|RLHF|강화학습|reinforcement|멀티모달|multimodal|하이퍼클로바|엑사원|EXAONE|HyperCLOVA|에이닷|솔라|Solar/i],
  ['애플리케이션', /에이전트|agent|agentic|코딩|coding|Copilot|코파일럿|Cursor|커서|챗봇|chatbot|ChatGPT|챗GPT|SaaS|버티컬|vertical|기업용|enterprise|B2B|검색|search|법률 AI|의료 AI|헬스케어 AI|금융 AI|교육 AI|AX|AI 전환|업무 자동화|MLOps|LLMOps|RAG|보안 AI|AI security|생성형 AI 서비스|이미지 생성|영상 생성|video generation|Sora|소라|음성 AI|voice AI/i],
  ['피지컬 AI', /피지컬|physical AI|휴머노이드|humanoid|로봇|robot|자율주행|autonomous driv|self-driving|로보택시|robotaxi|Waymo|웨이모|Tesla FSD|옵티머스|Optimus|Figure|피규어|월드 ?모델|world model|VLA|드론|drone|매니퓰레이터|manipulat|Boston Dynamics|보스턴다이내믹스/i],
]
export const TAGS = [
  ['정책·규제', /AI 기본법|기본법|AI Act|규제|regulat|수출통제|수출 통제|export control|행정명령|executive order|소버린|sovereign|저작권|copyright|소송|lawsuit|과기정통부|과학기술정보통신부|정부|government|의회|Congress|EU|안전|safety|가이드라인|guideline|국가AI|국가 AI/i],
  ['투자·회수', /투자 유치|투자유치|시리즈 ?[A-F]|series [A-F]|raises|raised|funding|펀딩|밸류에이션|valuation|기업가치|인수|acqui|M&A|IPO|상장|유니콘|unicorn|지분|stake|tender offer/i],
]
const pick = (list, text) => list.filter(([, re]) => re.test(text)).map(([k]) => k)
export const tagAi = (text = '') => pick(LAYERS, text)
export const tagAiCross = (text = '') => pick(TAGS, text)
