#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
공시분석 크롤러 — OpenDART 외감 감사보고서에서 '투자할 만한 스타트업' 후보를 뽑는다.

흐름
  1) list.json   : 최근 LOOKBACK_YEARS년간 제출된 비상장(기타법인) 감사보고서 목록 (월 단위로 조회·캐시)
  2) company.json: 기업개황(설립일·업종) — 한 번 받으면 캐시에 영구 보관
  3) 1차 필터    : 설립연도 ≥ EST_MIN, 제외 업종(금융·부동산·건설 등) 제외
  4) document.xml: 후보 기업의 연도별 감사보고서 원문 → 재무 수치·RCPS·VC 주주·계속기업 불확실성 (캐시)
                   최신 사업연도부터 먼저 채우고, 과거 연도는 뒤에 채운다.
  5) 점수화      → public/data/dart-screener.json (기업별 최신 연도 + 연도별 이력)

실행 일정(워크플로는 매일 깨어난다)
  · 백필 미완료  : 하루 호출 한도(MAX_CALLS)만큼 수집하고, 남은 건 다음 날 이어서 처리
  · 백필 완료 후 : 4~6월(감사보고서 시즌)의 월요일에만 신규 보고서 반영, 그 외에는 API 호출 없이 종료
  · 수동 실행(FORCE=true)은 언제든 수집

필요한 시크릿: DART_API_KEY  (표준 라이브러리만 사용 — 별도 설치 없음)
"""
import io
import json
import os
import re
import signal
import sys
import time
import zipfile
import html
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

API = "https://opendart.fss.or.kr/api"
KEY = os.environ.get("DART_API_KEY", "").strip()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_PATH = os.path.join(ROOT, "data", "dart-cache.json")
OUT_PATH = os.path.join(ROOT, "public", "data", "dart-screener.json")

LOOKBACK_YEARS = int(os.environ.get("LOOKBACK_YEARS", "5"))
EST_MIN = int(os.environ.get("EST_MIN", "2012"))
MAX_CALLS = int(os.environ.get("MAX_CALLS", "9000"))
SLEEP = float(os.environ.get("DART_SLEEP", "0.12"))
MAX_MINUTES = float(os.environ.get("MAX_MINUTES", "300"))  # 워크플로 제한시간 전에 멈추고 저장
FORCE = os.environ.get("FORCE", "").lower() in ("1", "true", "yes")
T0 = time.time()
SEASON_MONTHS = (4, 5, 6)
OUT_CAP = 4000
KST = timezone(timedelta(hours=9))

# 제외 업종(KSIC 앞 2자리): 전기가스, 건설, 금융·보험, 부동산, 공공행정, 협회·단체
EXCLUDE_KSIC = {"35", "41", "42", "64", "65", "66", "68", "84", "94"}
EXCLUDE_NAME = ("조합", "재단", "학교법인", "의료법인", "사단법인", "공단", "유동화", "기업인수목적",
                "회계법인", "법무법인", "세무법인", "특허법인", "노무법인")

KSIC2 = {
    "01": "농업", "02": "임업", "03": "어업", "05": "광업", "06": "광업", "07": "광업", "08": "광업",
    "10": "식료품", "11": "음료", "13": "섬유", "14": "의복", "15": "가죽·신발", "16": "목재", "17": "종이",
    "18": "인쇄", "19": "석유정제", "20": "화학", "21": "의약품", "22": "고무·플라스틱", "23": "비금속광물",
    "24": "1차금속", "25": "금속가공", "26": "전자부품·컴퓨터", "27": "의료·정밀기기", "28": "전기장비",
    "29": "기계장비", "30": "자동차", "31": "운송장비", "32": "가구", "33": "기타제조", "34": "산업설비수리",
    "36": "수도", "37": "하수", "38": "폐기물·재활용", "39": "환경정화", "45": "자동차판매", "46": "도매",
    "47": "소매·커머스", "49": "육상운송", "50": "수상운송", "51": "항공운송", "52": "물류·창고",
    "55": "숙박", "56": "음식점", "58": "출판·소프트웨어", "59": "영상·오디오", "60": "방송", "61": "통신",
    "62": "IT서비스", "63": "정보서비스", "70": "연구개발", "71": "전문서비스", "72": "건축·엔지니어링",
    "73": "과학기술서비스", "74": "사업시설관리", "75": "사업지원", "76": "임대", "85": "교육",
    "86": "보건", "87": "사회복지", "90": "예술", "91": "스포츠·여가", "95": "수리", "96": "기타서비스",
}

calls = 0


class StopRun(BaseException):
    """실행 중단 신호. BaseException이라 'except Exception'에 삼켜지지 않고 끝까지 올라간다."""
    pass


class OpTimeout(Exception):
    """요청 1건·문서 파싱 1건이 제한 시간을 넘김 — 해당 건만 실패로 기록하고 넘어간다."""
    pass


REQ_TIMEOUT = 90     # API 요청 1건 최대 초 (응답이 찔끔찔끔 와서 멈춘 것처럼 걸리는 경우 방지)
PARSE_TIMEOUT = 120  # 원문 1건 압축해제·파싱 최대 초 (특정 문서에서 정규식이 끝나지 않는 경우 방지)
CHECKPOINT_SEC = 900 # 15분마다 캐시 중간 저장 — 강제 종료돼도 진척이 남도록


def _on_alarm(signum, frame):
    raise OpTimeout("작업 시간 초과")


class time_limit:
    """SIGALRM으로 블록 하나의 실행 시간을 제한한다(중첩 사용 금지)."""
    def __init__(self, sec):
        self.sec = sec

    def __enter__(self):
        signal.signal(signal.SIGALRM, _on_alarm)
        signal.setitimer(signal.ITIMER_REAL, self.sec)

    def __exit__(self, *a):
        signal.setitimer(signal.ITIMER_REAL, 0)
        return False


def log(*a):
    print(*a, flush=True)


def get(endpoint, params, binary=False):
    """OpenDART 호출. 호출 수를 세고 한도·오류를 처리한다."""
    global calls
    if calls >= MAX_CALLS:
        raise StopRun("이번 실행 호출 한도(%d) 도달" % MAX_CALLS)
    if time.time() - T0 > MAX_MINUTES * 60:
        raise StopRun("이번 실행 시간 한도(%d분) 도달" % MAX_MINUTES)
    q = dict(params)
    q["crtfc_key"] = KEY
    url = "%s/%s?%s" % (API, endpoint, urllib.parse.urlencode(q))
    last = None
    for attempt in range(3):
        try:
            calls += 1
            with time_limit(REQ_TIMEOUT):
                with urllib.request.urlopen(url, timeout=30) as r:
                    body = r.read()
            time.sleep(SLEEP)
            break
        except Exception as e:  # 네트워크 일시 오류는 재시도
            last = e
            time.sleep(2 + attempt * 3)
    else:
        raise RuntimeError("요청 실패: %s (%s)" % (endpoint, last))

    if binary and body[:2] == b"PK":
        return body
    try:
        j = json.loads(body.decode("utf-8"))
    except Exception:
        # document.xml 오류 응답은 XML로 온다
        m = re.search(rb"<status>(\d+)</status>", body)
        j = {"status": m.group(1).decode() if m else "999", "message": "parse"}
    st = j.get("status")
    if st == "020":
        raise StopRun("OpenDART 일일 호출 한도 초과(020)")
    if st in ("010", "011", "012", "901"):
        raise SystemExit("API 키 오류(status %s): %s" % (st, j.get("message")))
    return j


# ───────────────────────── 4) 원문 파싱 ─────────────────────────
TAG = re.compile(r"<[^>]+>", re.S)


def clean(s):
    s = TAG.sub(" ", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def decode(b):
    m = re.search(rb'encoding="([^"]+)"', b[:200])
    encs = [m.group(1).decode()] if m else []
    for enc in encs + ["utf-8", "cp949"]:
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode("utf-8", "ignore")


NUM = re.compile(r"^[\(△\-−]?\s*[\d,]+(\.\d+)?\s*\)?$")


def to_num(s):
    s = s.strip().replace(" ", "")
    if s in ("", "-", "−", "—"):
        return None
    if not NUM.match(s):
        return None
    neg = s.startswith("(") or s.startswith("△") or s.startswith("-") or s.startswith("−")
    v = float(re.sub(r"[^\d\.]", "", s) or 0)
    return -v if neg else v


def tables(doc):
    for m in re.finditer(r"<TABLE\b.*?</TABLE>", doc, re.S | re.I):
        rows = []
        for tr in re.finditer(r"<TR\b.*?</TR>", m.group(0), re.S | re.I):
            cells = [clean(c.group(2)) for c in re.finditer(r"<(TD|TE|TH|TU)\b[^>]*>(.*?)</\1>", tr.group(0), re.S | re.I)]
            if cells:
                rows.append(cells)
        if rows:
            yield m.start(), rows


def unit_of(doc, pos, rows):
    near = clean(doc[max(0, pos - 1500):pos]) + " " + " ".join(" ".join(r) for r in rows[:3])
    m = list(re.finditer(r"단위\s*[:：]?\s*(백만원|천원|원)", near))
    u = m[-1].group(1) if m else "원"
    return {"원": 1, "천원": 1e3, "백만원": 1e6}[u]


def norm_label(s):
    s = re.sub(r"^[\sⅠ-ⅫIVX\d\.\-\(\)가나다라마바사아자차카타파하]{0,4}[\.\)]\s*", "", s)  # 'Ⅰ.' '1.' '(1)' 같은 머리 번호
    return re.sub(r"[\s\(\)（）\[\]·,]", "", s)


def row_values(row, note_col):
    vals = []
    for i, c in enumerate(row[1:], start=1):
        if i == note_col:
            continue
        v = to_num(c)
        if v is not None:
            vals.append(v)
    if not vals:
        return None, None
    cur = vals[0]
    prev = vals[len(vals) // 2] if len(vals) >= 2 else None
    return cur, prev


FIELDS = {
    # 키: (매칭 함수, 표 종류)
    "assets": (lambda l: l.startswith("자산총계"), "bs"),
    "liab": (lambda l: l.startswith("부채총계"), "bs"),
    "equity": (lambda l: l.startswith("자본총계"), "bs"),
    "capital": (lambda l: l in ("자본금", "보통주자본금"), "bs"),
    "cash": (lambda l: l.startswith("현금및현금성자산"), "bs"),
    # 단기금융상품·단기투자자산 — 스타트업은 투자금을 정기예금 등으로 두는 경우가 많아 런웨이 계산에 더한다
    "stfi": (lambda l: l.startswith("단기금융상품") or l.startswith("단기투자자산") or l.startswith("단기금융자산"), "bs"),
    "premium": (lambda l: l.startswith("주식발행초과금"), "bs"),
    "rev": (lambda l: (l.startswith("매출액") or l == "매출" or l.startswith("영업수익") or l.startswith("수익매출액"))
            and not any(x in l for x in ("원가", "총이익", "채권")), "is"),
    "op": (lambda l: l.startswith("영업이익") or l.startswith("영업손실") or l.startswith("영업손익"), "is"),
    "ni": (lambda l: (l.startswith("당기순이익") or l.startswith("당기순손실") or l.startswith("당기순손익"))
           and "포괄" not in l, "is"),
}
LOSS_LABEL = {"op": "영업손실", "ni": "당기순손실"}

VC_SUFFIX = re.compile(r"(조합|펀드|인베스트먼트|벤처스|벤처투자|창업투자|파트너스|캐피탈|투자\s*주식회사|Ventures|Capital|Partners|Investment|Fund)", re.I)


def parse_doc(raw):
    doc = decode(raw)
    text = clean(doc)
    res = {}
    found_bs = found_is = False
    holders = []
    funds = []
    for pos, rows in tables(doc):
        flat = " ".join(" ".join(r) for r in rows)
        compact = flat.replace(" ", "")
        is_bs = "자산총계" in compact and "부채총계" in compact
        is_is = ("당기순이익" in compact or "당기순손실" in compact or "당기순손익" in compact) and \
                ("매출" in compact or "영업수익" in compact)
        # 주주 현황 표
        if ("주주" in compact) and ("지분율" in compact or "소유주식" in compact or "지분" in compact) and not is_bs:
            for r in rows[1:]:
                nm = r[0].strip()
                if nm and not re.search(r"합계|소계|계$|기타|^주주", nm) and VC_SUFFIX.search(nm):
                    holders.append(re.sub(r"\s+", " ", nm)[:40])
        # 조합 출자 내역 표(투자자산·출자금 주석) — 주주 표가 아닌 곳에 조합명이 나오면 출자로 본다
        # 우선주 발행·인수인·주주 내역처럼 '우리 회사에 투자한 조합'이 나오는 표는 제외한다
        elif not is_bs and not is_is and re.search(r"출자금|취득원가|장부금액|지분법|공정가치|투자자산|투자증권|금융자산", compact) \
                and not re.search(INVESTOR_CTX, compact):
            unit_lp = None
            for r in rows[1:]:
                nm = re.sub(r"\s+", " ", r[0]).strip()
                m = FUND_RE.search(nm)
                if not m or re.search(r"합계|소계|^계$", nm):
                    continue
                vals = [abs(v) for v in (to_num(c) for c in r[1:]) if v is not None and abs(v) >= 1000]
                if unit_lp is None:
                    unit_lp = unit_of(doc, pos, rows)
                amt = round(max(vals) * unit_lp / 1e8, 2) if vals else None
                funds.append((clean_fund(m.group(1)), amt))
        if not ((is_bs and not found_bs) or (is_is and not found_is)):
            continue
        kind = "bs" if (is_bs and not found_bs) else "is"
        unit = unit_of(doc, pos, rows)
        note_col = None
        for r in rows[:4]:
            for i, c in enumerate(r):
                if c.replace(" ", "") == "주석":
                    note_col = i
        past_liab = False
        for r in rows:
            lab = norm_label(r[0])
            if kind == "bs":
                if lab.startswith("부채총계"):
                    past_liab = True
                # 부채총계 이전(=부채 항목)에 나오는 우선주 계정 = RCPS·CPS를 부채로 분류한 금액
                elif not past_liab and "우선주" in lab and "자본금" not in lab:
                    cur, prev = row_values(r, note_col)
                    if cur is not None:
                        res["rcps_liab"] = round(res.get("rcps_liab", 0) + abs(cur) * unit / 1e8, 1)
                        if prev is not None:
                            res["rcps_liab_prev"] = round(res.get("rcps_liab_prev", 0) + abs(prev) * unit / 1e8, 1)
            for key, (fn, k) in FIELDS.items():
                if k != kind or key in res or not fn(lab):
                    continue
                cur, prev = row_values(r, note_col)
                if cur is None:
                    continue
                if key in LOSS_LABEL and LOSS_LABEL[key] in lab and "이익" not in lab:
                    cur = -abs(cur)
                    prev = -abs(prev) if prev is not None else None
                res[key] = round(cur * unit / 1e8, 1)  # 억원
                if prev is not None:
                    res[key + "_prev"] = round(prev * unit / 1e8, 1)
        if kind == "bs":
            found_bs = True
        else:
            found_is = True

    res["rcps"] = bool(re.search(r"상환전환우선주|전환상환우선주|상환우선주", text))
    res["cps"] = bool(re.search(r"전환우선주", text))
    res["gc"] = bool(re.search(r"계속기업\s*(?:가정에\s*)?관련\s*(?:된\s*)?중요한\s*불확실성", text))
    seen = []
    for h in holders:
        if h not in seen:
            seen.append(h)
    res["vc"] = seen[:6]
    res["opinion"] = audit_opinion(text)

    # 본문에서 '○○조합에 출자' 형태로 나오는 조합명도 더한다(금액 없음).
    # '○○조합으로부터 투자/출자', 우선주 발행·인수 문맥은 우리 회사의 투자자이므로 제외한다.
    for f in FUND_RE.finditer(text):
        after = text[f.end():f.end() + 40]
        if not re.match(r"\s*(?:에|에의|에\s*대한)\s*.{0,25}?출자", after):
            continue
        name = trim_sentence(clean_fund(f.group(1)))
        core = text.rfind(name.split(" ")[0], f.start(), f.end()) if name else f.start()
        core = core if core >= 0 else f.start()
        # 같은 문장 안에서만 문맥을 본다(앞 문장의 '우선주 발행' 등에 휩쓸리지 않도록)
        st = max(text.rfind(".", 0, core), core - 80)
        en = text.find(".", f.end())
        around = text[st + 1:(en if 0 <= en < f.end() + 60 else f.end() + 60)]
        if not re.search(INVESTOR_CTX, around):
            funds.append((name, None))
    lp, names = [], set()
    vc_names = set(res["vc"])
    for nm, amt in funds:
        if nm in names or nm in vc_names or len(nm) < 4:
            continue
        names.add(nm)
        lp.append([nm, amt])
    res["lp"] = lp[:20]
    res["liq"] = 1  # 단기금융상품(stfi)까지 읽은 원문 표시 — 없으면 ⑥단계에서 다시 읽는다
    res["v"] = DOC_V
    return res


INVESTOR_CTX = r"우선주|발행|인수인|인수자|주주|투자자|신주|로부터"

DOC_V = 4  # 원문 파싱 항목이 바뀌면 올린다 → 이전 버전으로 읽은 원문은 다시 읽음

# 단어(공백으로 구분, 최대 60자)를 0~8개 붙인 뒤 조합 접미어. 예전 '([…]+\s?){0,8}?'는 공백 없는 긴 문자열
# (원문에 박힌 이미지 base64 등)에서 쪼개는 경우의 수가 폭발해 문서 1건에 수 시간씩 멈췄다.
FUND_RE = re.compile(
    r"((?:[가-힣A-Za-z0-9&\-\.·]{1,60}\s){0,8}?[가-힣A-Za-z0-9&\-\.·]{0,60}?"
    r"(?:벤처투자조합|신기술사업투자조합|신기술투자조합|창업투자조합|개인투자조합|투자조합|"
    r"사모투자합자회사|사모투자전문회사|벤처펀드|투자펀드|펀드)"
    r"(?:\s*제?\s*\d+\s*호)?)")


def clean_fund(s):
    s = re.sub(r"\(주\)|㈜|주식회사", "", s)
    s = re.sub(r"^[\s\d\.\)\(①-⑳\-·]+", "", s)
    return re.sub(r"\s+", " ", s).strip()[:50]


def trim_sentence(name):
    """본문에서 뽑은 조합명 앞에 붙은 문장 조각('당사는 당기 중' 등)을 떼어낸다."""
    toks = name.split()
    keep = []
    for t in reversed(toks):
        if keep and (re.search(r"(은|는|이|가|을|를|에|의|와|과|중|및|로|으로)$", t) and not re.search(r"(조합|펀드|호)$", t)
                     or t in ("당기", "전기", "당사", "회사", "등")):
            break
        keep.append(t)
    return " ".join(reversed(keep[:5]))


def audit_opinion(text):
    """감사의견: 적정 / 한정 / 부적정 / 의견거절 (감사보고서 앞부분 기준)."""
    head = text[:9000]
    pats = [("의견거절", r"의견\s*거절|의견을\s*표명하지\s*않습니다"), ("부적정", r"부적정\s*의견"),
            ("한정", r"한정\s*의견"), ("적정", r"적정\s*의견|공정하게\s*표시하고\s*있습니다")]
    # 보고서 첫머리의 의견 문단이 가장 먼저 나온다 — 기타사항의 '전기 감사보고서에는 한정의견' 같은 언급에 속지 않도록
    found = [(m.start(), name) for name, pat in pats for m in [re.search(pat, head)] if m]
    return min(found)[1] if found else None


def fetch_doc(rcept_no):
    b = get("document.xml", {"rcept_no": rcept_no}, binary=True)
    if not isinstance(b, (bytes, bytearray)):
        return {"err": (b or {}).get("status", "nodoc")}
    try:
        z = zipfile.ZipFile(io.BytesIO(b))
    except Exception:
        return {"err": "zip"}
    names = z.namelist()
    main = next((n for n in names if n == rcept_no + ".xml"), None) or max(names, key=lambda n: z.getinfo(n).file_size)
    try:
        with time_limit(PARSE_TIMEOUT):
            return parse_doc(z.read(main))
    except OpTimeout:
        log("    ⚠ 원문 파싱 시간 초과 → 건너뜀: %s" % rcept_no)
        return {"err": "parse-timeout"}


def safe_fetch_doc(rno):
    """한도 초과(StopRun)·키 오류는 위로 올리고, 개별 문서 오류는 기록만 하고 넘어간다."""
    try:
        return fetch_doc(rno)
    except (StopRun, SystemExit):
        raise
    except Exception as e:
        return {"err": str(e)[:80]}


# ───────────────────────── 1) 감사보고서 목록 (월 단위 캐시) ─────────────────────────
FY_RE = re.compile(r"\((\d{4})\.(\d{2})\)")


def month_list(today):
    start = date(today.year - LOOKBACK_YEARS, today.month, 1)
    out, y, m = [], start.year, start.month
    while (y, m) <= (today.year, today.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def month_end(y, m):
    nxt = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return nxt - timedelta(days=1)


def fetch_month(y, m, today, reports):
    bgn = date(y, m, 1)
    end = min(month_end(y, m), today)
    page = 1
    while True:
        j = get("list.json", {
            "bgn_de": bgn.strftime("%Y%m%d"), "end_de": end.strftime("%Y%m%d"),
            "pblntf_ty": "F", "pblntf_detail_ty": "F001", "corp_cls": "E",
            "page_no": page, "page_count": 100,
        })
        if j.get("status") != "000":
            break
        for it in j.get("list", []):
            name = it["corp_name"]
            if any(x in name for x in EXCLUDE_NAME):
                continue
            mm = FY_RE.search(it.get("report_nm", ""))
            fy = "%s.%s" % (mm.group(1), mm.group(2)) if mm else it["rcept_dt"][:4] + ".12"
            ent = reports.setdefault(it["corp_code"], {"name": name, "r": {}})
            ent["name"] = name
            prev = ent["r"].get(fy)
            if not prev or it["rcept_dt"] >= prev[1]:  # 정정 공시는 최신 것으로 교체
                ent["r"][fy] = [it["rcept_no"], it["rcept_dt"], it.get("flr_nm", "")]
        if page >= int(j.get("total_page", 1)):
            break
        page += 1


# ───────────────────────── 2·3) 기업개황 · 후보 판정 ─────────────────────────
def is_candidate(info):
    est, ksic = info[0], info[1]
    if not est or not est[:4].isdigit() or int(est[:4]) < EST_MIN:
        return False
    if ksic and ksic[:2] in EXCLUDE_KSIC:
        return False
    return True


def fy_year(fy):
    return int(fy[:4])


def window_fys(ent, today):
    """조회 기간 안의 사업연도만, 최신순."""
    lo = today.year - LOOKBACK_YEARS
    return sorted([fy for fy in ent["r"] if fy_year(fy) >= lo], reverse=True)


# ───────────────────────── 5) 이력 · 점수 ─────────────────────────
HKEYS = ("rev", "op", "ni", "cash", "premium", "equity", "assets", "rcps_liab")


def history(ent, docs, today):
    """사업연도 → 재무 수치. 각 보고서의 전기 수치로 한 해 더 거슬러 채운다."""
    h = {}
    for fy in window_fys(ent, today):
        d = docs.get(ent["r"][fy][0])
        if not d or d.get("err"):
            continue
        h[fy] = {k: d.get(k) for k in HKEYS}
        h[fy]["opinion"] = d.get("opinion")
    for fy in sorted(h):
        prev_fy = "%d%s" % (fy_year(fy) - 1, fy[4:])
        d = docs.get(ent["r"][fy][0])
        if prev_fy not in h and any(d.get(k + "_prev") is not None for k in HKEYS):
            h[prev_fy] = {k: d.get(k + "_prev") for k in HKEYS}
    for v in h.values():
        p, l = v.get("premium"), v.get("rcps_liab")
        v["invest"] = None if p is None and l is None else round((p or 0) + (l or 0), 1)
    return dict(sorted(h.items()))


def clean_streak(ent, docs, today):
    """최신 사업연도부터 거꾸로, 감사의견 '적정'이 끊기지 않고 이어진 햇수."""
    n, last = 0, None
    for fy in window_fys(ent, today):
        d = docs.get(ent["r"][fy][0])
        if not d or d.get("err") or d.get("opinion") != "적정":
            break
        if last is not None and last - fy_year(fy) != 1:
            break
        n, last = n + 1, fy_year(fy)
    return n


def yoy(cur, prev):
    if cur is None or prev is None or prev <= 0:
        return None
    return round((cur / prev - 1) * 100, 1)


def cagr(h):
    pts = [(fy_year(fy), v["rev"]) for fy, v in h.items() if v.get("rev") and v["rev"] > 0]
    if len(pts) < 2:
        return None
    (y0, v0), (y1, v1) = pts[0], pts[-1]
    if y1 - y0 < 2:
        return None
    return round(((v1 / v0) ** (1 / (y1 - y0)) - 1) * 100, 1)


def raise_years(h):
    """투자자본(주식발행초과금 + RCPS 부채)이 크게 늘어난 사업연도(=투자 유치 추정)."""
    out, prev = [], None
    for fy, v in h.items():
        p = v.get("invest")
        if p is not None and prev is not None:
            if p - prev >= 10 and (prev <= 0 or p > prev * 1.2):
                out.append(fy_year(fy))
        if p is not None:
            prev = p
    return out


def score(d, est_year, this_year, g, cg, recent_raise):
    s = 0
    if d.get("rcps") or d.get("cps"):
        s += 20
    if recent_raise:
        s += 20
    if d.get("vc"):
        s += 15
    if g is not None:
        s += 20 if g >= 100 else 15 if g >= 50 else 8 if g >= 20 else 0
    if cg is not None:
        s += 10 if cg >= 50 else 6 if cg >= 30 else 3 if cg >= 15 else 0
    age = this_year - est_year
    s += 10 if age <= 5 else 6 if age <= 8 else 3 if age <= 12 else 0
    if (d.get("rev") or 0) >= 100:
        s += 5
    if d.get("gc"):
        s -= 10
    return max(0, min(100, s))


COLS = ["corp_code", "name", "rcept_no", "rcept_dt", "fy", "est", "ksic", "sector", "rev", "rev_g", "cagr",
        "op", "ni", "assets", "equity", "cash", "premium", "raise_year", "raised", "rcps", "vc", "gc", "impaired",
        "score", "auditor", "url", "years", "hist", "opinion", "clean_years", "capital",
        "rcps_liab", "invest", "equity_adj"]
HIST_COLS = ["fy", "rev", "op", "ni", "cash", "invest", "opinion"]
LP_COLS = ["corp_code", "name", "est", "sector", "ksic", "fy", "rcept_no", "rev", "assets", "ni", "equity",
           "cash", "opinion", "n_funds", "total", "funds", "startup", "url"]
LP_PATH = os.path.join(ROOT, "public", "data", "dart-lp.json")


def candidate_rows(cache, today):
    """후보 기업 전체의 최신 연도 행(dict) — 화면용(상위 OUT_CAP)과 소싱 연결용 인덱스가 같이 쓴다."""
    reports, companies, docs = cache["reports"], cache["companies"], cache["docs"]
    this_year = datetime.now(KST).year
    rows = []
    for code, ent in reports.items():
        info = companies.get(code)
        if not info or not is_candidate(info):
            continue
        fys = window_fys(ent, today)
        latest = next((fy for fy in fys if docs.get(ent["r"][fy][0]) and not docs[ent["r"][fy][0]].get("err")), None)
        if not latest:
            continue
        rno, rdt, auditor = ent["r"][latest]
        d = docs[rno]
        h = history(ent, docs, today)
        prev_fy = "%d%s" % (fy_year(latest) - 1, latest[4:])
        g = yoy(h.get(latest, {}).get("rev"), h.get(prev_fy, {}).get("rev"))
        cg = cagr(h)
        ry = raise_years(h)
        raise_year = ry[-1] if ry else None
        recent = raise_year is not None and fy_year(latest) - raise_year <= 1
        est_year = int(info[0][:4])
        # RCPS를 부채로 잡은 회사는 자본이 마이너스로 보이므로, RCPS 부채를 더한 조정자본으로 잠식 여부를 본다
        eq_adj = None if d.get("equity") is None else round(d["equity"] + (d.get("rcps_liab") or 0), 1)
        impaired = eq_adj is not None and d.get("capital") is not None and eq_adj < d["capital"]
        inv = h.get(latest, {}).get("invest")
        rows.append({
            "corp_code": code, "name": ent["name"], "rcept_no": rno, "rcept_dt": rdt, "fy": latest, "est": est_year,
            "ksic": info[1], "sector": KSIC2.get(info[1][:2], "") if info[1] else "",
            "rev": d.get("rev"), "rev_g": g, "cagr": cg, "op": d.get("op"), "ni": d.get("ni"),
            "assets": d.get("assets"), "equity": d.get("equity"), "cash": d.get("cash"), "premium": d.get("premium"),
            "raise_year": raise_year, "raised": recent, "rcps": bool(d.get("rcps") or d.get("cps")),
            "vc": d.get("vc") or [], "gc": bool(d.get("gc")), "impaired": impaired,
            "score": score(d, est_year, this_year, g, cg, recent), "auditor": auditor,
            "url": info[2] if len(info) > 2 else "", "years": len(h),
            "hist": [[fy] + [v.get(k) for k in HIST_COLS[1:]] for fy, v in h.items()][-6:],
            "opinion": d.get("opinion"), "clean_years": clean_streak(ent, docs, today), "capital": d.get("capital"),
            "rcps_liab": d.get("rcps_liab"), "invest": inv, "equity_adj": eq_adj, "raises": ry,
            "stfi": d.get("stfi"), "liq": bool(d.get("liq")),
        })
    return rows


# 세컨더리·소싱 연결용 인덱스 — 투자 흔적(VC 주주·RCPS·투자유치)이 있거나 소싱 데이터에 이름이 있는 후보 전체.
# 화면용 dart-screener.json은 점수 상위 OUT_CAP만 담으므로, 소싱 화면은 이 파일로 회사를 연결한다.
INDEX_COLS = ["corp_code", "name", "rcept_no", "fy", "est", "sector", "rev", "rev_g", "cagr", "op", "ni",
              "cash", "equity", "equity_adj", "capital", "raise_year", "raises", "raised", "rcps", "vc", "gc",
              "impaired", "opinion", "clean_years", "url", "hist", "lite", "stfi", "liq"]
INDEX_HIST = ["fy", "rev", "op", "cash"]
INDEX_PATH = os.path.join(ROOT, "public", "data", "dart-index.json")


def _norm_name(s):
    s = re.sub(r"㈜|\(주\)|주식회사|\(유\)|유한회사|유한책임회사", "", str(s or ""))
    s = re.sub(r",?\s*(inc|co|ltd|corp|corporation|limited|llc|l\.l\.c)\.?(?=\s|$|/)", "", s, flags=re.I)
    return re.sub(r"[\s.,()'\"·\-_/&]", "", s).lower()


def sourcing_names():
    """소싱 화면이 쓰는 회사명(운용사 홈페이지 포트폴리오 + 투자 라운드)."""
    names = set()
    for fn, pick in (("vc-portfolio.json", lambda j: [r[1] for r in j.get("rows", [])]),
                     ("funding.json", lambda j: [r[1] for r in j.get("items", [])])):
        try:
            with open(os.path.join(ROOT, "public", "data", fn), encoding="utf-8") as f:
                names.update(_norm_name(n) for n in pick(json.load(f)))
        except Exception as e:  # 파일이 없어도 인덱스는 투자 흔적 기준으로 만든다
            log("  (소싱 데이터 %s 읽기 실패: %s)" % (fn, e))
    names.discard("")
    return names


def build_index(rows, cache, today):
    src = sourcing_names()
    hi = [HIST_COLS.index(k) for k in INDEX_HIST]
    items, seen = [], set()
    for r in rows:
        seen.add(r["corp_code"])
        if not (r["vc"] or r["rcps"] or r["raises"] or _norm_name(r["name"]) in src):
            continue
        row = dict(r, hist=[[h[i] for i in hi] for h in r["hist"]], lite=False)
        items.append([row[c] for c in INDEX_COLS])
    # 후보 필터(설립 EST_MIN년 이후 등) 밖이지만 소싱 데이터에 있는 회사 — 최신 감사보고서의 요약 수치만(이력 없음)
    reports, companies, docs = cache["reports"], cache["companies"], cache["docs"]
    lite = 0
    for code, ent in reports.items():
        if code in seen or _norm_name(ent["name"]) not in src:
            continue
        info = companies.get(code)
        fys = window_fys(ent, today)
        if not info or not fys:
            continue
        rno = ent["r"][fys[0]][0]
        d = docs.get(rno)
        if not d or d.get("err"):
            continue
        est = info[0][:4]
        row = {k: None for k in INDEX_COLS}
        row.update({"corp_code": code, "name": ent["name"], "rcept_no": rno, "fy": fys[0],
                    "est": int(est) if est.isdigit() else None,
                    "sector": KSIC2.get(info[1][:2], "") if info[1] else "",
                    "rev": d.get("rev"), "ni": d.get("ni"), "cash": d.get("cash"), "equity": d.get("equity"),
                    "op": d.get("op"), "opinion": d.get("opinion"), "vc": d.get("vc") or [],
                    "raises": [], "rcps": False, "raised": False, "gc": bool(d.get("gc")), "impaired": False,
                    "url": info[2] if len(info) > 2 else "", "hist": [], "lite": True,
                    "stfi": d.get("stfi"), "liq": bool(d.get("liq"))})
        items.append([row[c] for c in INDEX_COLS])
        lite += 1
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenDART 감사보고서",
        "cols": INDEX_COLS, "hist_cols": INDEX_HIST, "items": items,
    }
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log("소싱 연결용 인덱스 %d사 (설립연도 등 필터 밖 요약 %d사 포함)" % (len(items), lite))


def liquidity_targets(cache, today):
    """⑥ 소싱 연결 대상(투자 흔적이 있거나 소싱 데이터에 이름이 있는 후보)의 최신 원문 중 단기금융상품을 아직 안 읽은 것."""
    reports, companies, docs = cache["reports"], cache["companies"], cache["docs"]
    src = sourcing_names()
    out = []
    for code, ent in reports.items():
        info = companies.get(code)
        if not info or not is_candidate(info):
            continue
        fys = window_fys(ent, today)
        if not fys:
            continue
        rno = ent["r"][fys[0]][0]
        d = docs.get(rno)
        if not d or d.get("err") or d.get("liq"):
            continue
        if d.get("vc") or d.get("rcps") or d.get("cps") or _norm_name(ent["name"]) in src:
            out.append(rno)
    return out


def build_output(cache, today, stopped, cov):
    rows = candidate_rows(cache, today)
    items = [[row[c] for c in COLS] for row in rows]
    items.sort(key=lambda r: (-r[COLS.index("score")], -(r[COLS.index("rev")] or 0)))
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenDART 감사보고서",
        "filters": {"est_min": EST_MIN, "exclude_ksic": sorted(EXCLUDE_KSIC), "lookback_years": LOOKBACK_YEARS},
        "coverage": dict(cov, pending=stopped, shown=min(len(items), OUT_CAP)),
        "cols": COLS, "hist_cols": HIST_COLS,
        "items": items[:OUT_CAP],
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log("출력 %d건" % len(out["items"]))
    build_index(rows, cache, today)
    build_lp(cache, today, cov)


def build_lp(cache, today, cov):
    """조합 출자 내역이 있는 기업 = 잠재 LP. 기업별 최신 감사보고서 기준."""
    reports, companies, docs = cache["reports"], cache["companies"], cache["docs"]
    items = []
    for code, ent in reports.items():
        info = companies.get(code)
        fys = window_fys(ent, today)
        if not info or not fys:
            continue
        rno = ent["r"][fys[0]][0]
        d = docs.get(rno)
        if not d or d.get("err") or not d.get("lp"):
            continue
        amts = [a for _, a in d["lp"] if a]
        est = info[0][:4]
        row = {
            "corp_code": code, "name": ent["name"], "est": int(est) if est.isdigit() else None,
            "sector": KSIC2.get(info[1][:2], "") if info[1] else "", "ksic": info[1], "fy": fys[0], "rcept_no": rno,
            "rev": d.get("rev"), "assets": d.get("assets"), "ni": d.get("ni"), "equity": d.get("equity"),
            "cash": d.get("cash"), "opinion": d.get("opinion"), "n_funds": len(d["lp"]), "total": round(sum(amts), 1) if amts else None,
            "funds": d["lp"], "startup": is_candidate(info), "url": info[2] if len(info) > 2 else "",
        }
        items.append([row[c] for c in LP_COLS])
    items.sort(key=lambda r: (-r[LP_COLS.index("n_funds")], -(r[LP_COLS.index("total")] or 0)))
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OpenDART 감사보고서",
        "coverage": {"lp_needed": cov.get("lp_needed"), "lp_done": cov.get("lp_done"),
                     "backfill_done": cov.get("backfill_done"), "found": len(items)},
        "cols": LP_COLS, "items": items[:8000],
    }
    with open(LP_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log("잠재 LP %d사" % len(items))


# ───────────────────────── 실행 ─────────────────────────
def load_cache():
    cache = {}
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    if cache.get("v") != 2:  # 1차 버전 캐시: 기업개황·원문 파싱 결과만 이어받는다
        cache = {"v": 2, "months": {}, "reports": {}, "companies": cache.get("companies", {}),
                 "docs": cache.get("docs", {}), "backfill_done": False}
    return cache


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    tmp = CACHE_PATH + ".tmp"  # 쓰는 도중 종료돼도 기존 캐시가 깨지지 않도록 임시 파일에 쓰고 교체
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, CACHE_PATH)


def main():
    cache = load_cache()
    now = datetime.now(KST)
    today = now.date()

    # 출력만 다시 만들기(API 호출 없음): python scripts/fetch-dart-screener.py --build-only
    if "--build-only" in sys.argv:
        try:
            with open(OUT_PATH, encoding="utf-8") as f:
                prev = json.load(f).get("coverage", {})
        except Exception:
            prev = {}
        stopped = prev.pop("pending", None)
        prev.pop("shown", None)
        build_output(cache, today, stopped, prev)
        return

    # 실행 여부 판단 — 백필이 끝났으면 시즌(4~6월) 월요일에만 수집
    if cache.get("backfill_done") and not FORCE:
        if not (now.month in SEASON_MONTHS and now.weekday() == 0):
            log("백필 완료 · 오늘은 자동 수집일이 아님 → 수집 없이 종료 (자동 수집: 4~6월 월요일)")
            return
    if not KEY:
        raise SystemExit("DART_API_KEY 시크릿이 없습니다. 저장소 Settings → Secrets and variables → Actions 에 추가하세요.")

    months, reports, companies, docs = cache["months"], cache["reports"], cache["companies"], cache["docs"]
    stopped = None

    def on_term(signum, frame):  # 워크플로 취소·시간 초과 시에도 진행분을 저장
        raise StopRun("중단 신호(%d)" % signum)
    signal.signal(signal.SIGTERM, on_term)

    def has_doc(rno):
        d = docs.get(rno)
        # 파싱 시간 초과(parse-timeout)로 건너뛴 문서는 미완료로 보고 다음에 다시 읽는다
        return bool(d) and (d.get("err") not in (None, "parse-timeout") or d.get("v") == DOC_V)

    last_save = [time.time()]

    def checkpoint(where):
        """15분마다 캐시를 저장하고 진행 로그를 남긴다(강제 종료 대비)."""
        if time.time() - last_save[0] < CHECKPOINT_SEC:
            return
        save_cache(cache)
        last_save[0] = time.time()
        log("  💾 중간 저장 · %s · 개황 %d사 · 원문 %d건 · API %d건 · %d분 경과"
            % (where, len(companies), len(docs), calls, (time.time() - T0) / 60))

    try:
        log("① 감사보고서 목록 (최근 %d년, 월 단위)" % LOOKBACK_YEARS)
        for y, m in month_list(today):
            key = "%04d-%02d" % (y, m)
            recent = (today - month_end(y, m)).days < 45  # 최근 두 달은 매번 다시 확인
            if months.get(key) and not recent:
                continue
            fetch_month(y, m, today, reports)
            if not recent:
                months[key] = True
            log("  %s 완료 · 누적 %d사" % (key, len(reports)))

        # ⑥ 소싱 연결 회사 먼저 — 최신 원문을 다시 읽어 단기금융상품을 채운다(런웨이 계산용, 대상 회사만)
        targets = liquidity_targets(cache, today)
        log("⑥ 소싱 연결 회사 최신 원문 재파싱(단기금융상품) %d건" % len(targets))
        for i, rno in enumerate(targets):
            d = safe_fetch_doc(rno)
            if not d.get("err"):  # 실패하면 기존 파싱 결과를 그대로 둔다
                docs[rno] = d
            checkpoint("⑥ 재파싱 %d/%d" % (i + 1, len(targets)))
            if i % 500 == 0:
                log("  재파싱 %d/%d" % (i, len(targets)))

        # ②③ 기업개황과 최신 연도 원문을 번갈아 처리 — 첫 실행부터 화면에 결과가 나오도록
        #      최근에 제출한 기업부터 BATCH개씩 개황을 조회하고, 그중 후보의 최신 연도 원문을 바로 읽는다.
        log("②③ 기업개황 + 최신 연도 원문 (최근 제출순, 번갈아 처리)")
        order = sorted(reports, key=lambda c: max(v[1] for v in reports[c]["r"].values()), reverse=True)
        BATCH = 300

        def drain(batch):
            for code in batch:
                info = companies.get(code)
                if not info or not is_candidate(info):
                    continue
                fys = window_fys(reports[code], today)
                if fys:
                    rno = reports[code]["r"][fys[0]][0]
                    if not has_doc(rno):
                        docs[rno] = safe_fetch_doc(rno)
                        checkpoint("②③ 원문")

        batch = []
        for i, code in enumerate(order):
            if code not in companies:
                j = get("company.json", {"corp_code": code})
                companies[code] = [j.get("est_dt", ""), j.get("induty_code", ""), j.get("hm_url", "")] \
                    if j.get("status") == "000" else ["", "", ""]
            batch.append(code)
            checkpoint("②③ 개황 %d/%d" % (i + 1, len(order)))
            if len(batch) >= BATCH:
                drain(batch)
                batch = []
                log("  개황 %d/%d · 원문 %d건" % (i + 1, len(order), len(docs)))
        drain(batch)

        # 후보가 아닌 기업은 최신 사업연도 보고서만 남긴다(잠재 LP 확인용, 용량 절약)
        for code, ent in reports.items():
            if code in companies and not is_candidate(companies[code]) and len(ent["r"]) > 1:
                top = max(ent["r"])
                ent["r"] = {top: ent["r"][top]}

        log("④ 과거 연도 원문")
        cands = [(c, e) for c, e in reports.items() if is_candidate(companies[c])]
        queue = []
        for depth in range(LOOKBACK_YEARS + 1):
            for code, ent in cands:
                fys = window_fys(ent, today)
                if depth < len(fys):
                    queue.append((fys[depth], ent["r"][fys[depth]][0]))
        for i, (fy, rno) in enumerate(queue):
            if has_doc(rno):
                continue
            docs[rno] = safe_fetch_doc(rno)
            checkpoint("④ 과거 연도 %d/%d" % (i, len(queue)))
            if i % 500 == 0:
                log("  원문 %d/%d" % (i, len(queue)))

        log("⑤ 잠재 LP — 스타트업 외 기업의 최신 감사보고서에서 조합 출자 내역")
        others = [(c, e) for c, e in reports.items() if c in companies and not is_candidate(companies[c])]
        others.sort(key=lambda ce: max(v[1] for v in ce[1]["r"].values()), reverse=True)
        for i, (code, ent) in enumerate(others):
            fys = window_fys(ent, today)
            if not fys:
                continue
            rno = ent["r"][fys[0]][0]
            if has_doc(rno):
                continue
            d = safe_fetch_doc(rno)
            # 스타트업이 아닌 기업은 LP 판단에 필요한 항목만 보관
            docs[rno] = d if d.get("err") else {k: d.get(k) for k in ("v", "lp", "opinion", "rev", "assets", "ni", "equity", "cash")}
            checkpoint("⑤ LP %d/%d" % (i, len(others)))
            if i % 1000 == 0:
                log("  LP 원문 %d/%d" % (i, len(others)))
    except (StopRun, KeyboardInterrupt) as e:
        stopped = str(e) or "중단 신호"
        log("  ⏸ " + stopped + " — 다음 실행에서 이어서 처리")
    except RuntimeError as e:  # 같은 요청이 3번 연속 실패 — 지금까지 받은 분량은 저장하고 다음 실행에서 재시도
        stopped = "요청 반복 실패: %s" % e
        log("  ⏸ " + stopped + " — 다음 실행에서 이어서 처리")

    # 진행 현황
    cands = [(c, e) for c, e in reports.items() if c in companies and is_candidate(companies[c])]
    ok = lambda r: r in docs and (docs[r].get("err") not in (None, "parse-timeout") or docs[r].get("v") == DOC_V)
    need = [e["r"][fy][0] for c, e in cands for fy in window_fys(e, today)]
    done = sum(1 for r in need if ok(r))
    latest_done = sum(1 for c, e in cands if window_fys(e, today) and ok(e["r"][window_fys(e, today)[0]][0]))
    lp_need = [e["r"][window_fys(e, today)[0]][0] for c, e in reports.items()
               if c in companies and not is_candidate(companies[c]) and window_fys(e, today)]
    lp_done = sum(1 for r in lp_need if ok(r))
    missing_company = sum(1 for c in reports if c not in companies)
    cache["backfill_done"] = bool(stopped is None and missing_company == 0 and done == len(need)
                                  and lp_done == len(lp_need))
    cache["last_run"] = now.isoformat()
    cov = {"companies_seen": len(companies), "candidates": len(cands), "latest_done": latest_done,
           "docs_needed": len(need), "docs_done": done, "lp_needed": len(lp_need) + len(cands), "lp_done": lp_done + latest_done,
           "backfill_done": cache["backfill_done"]}
    log("진행: 후보 %d사 · 최신연도 %d사 완료 · 원문 %d/%d · 백필완료=%s" %
        (len(cands), latest_done, done, len(need), cache["backfill_done"]))

    # 조회 기간 밖으로 밀려난 원문 캐시 정리
    if not stopped:
        live = set(need) | set(lp_need)
        for k in list(docs):
            if k not in live:
                del docs[k]

    save_cache(cache)
    build_output(cache, today, stopped, cov)
    log("완료 · API 호출 %d건" % calls)


if __name__ == "__main__":
    main()
