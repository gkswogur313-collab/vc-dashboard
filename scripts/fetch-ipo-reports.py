#!/usr/bin/env python3
"""IPO 단계별 보고서 자료 수집 — 심사청구 · 심사승인 · 상장 세 시점마다 보고서 단계를 하나씩 추가한다.

GitHub Actions(fetch-ipo 워크플로)에서 IPO 수집 직후 매일 실행한다.
결과: public/data/ipo-reports/<회사명>.json  +  public/data/ipo-reports/index.json
워드는 scripts/ipo-report-docx.mjs 가 만든다(public/briefs/ipo/<회사명>.docx).

단계가 생기는 조건(매일 확인, 이미 있는 단계는 다시 만들지 않음)
  · 청구 — 예비심사 청구일이 최근 7일 이내
  · 승인 — 예비심사 승인일이 최근 7일 이내
  · 상장 — 상장(예정)일이 오늘~7일 이내
단계마다 넣는 자료
  · 공통 — 최근 30일 구글 뉴스 기사 목록, DART 기업개황(찾을 수 있으면)
  · 상장 — 추가로 DART 증권신고서의 '사업의 개요'(영위사업DART)·'요약재무정보'(실적)
뉴스 기반 요약(영위사업·포인트)은 글을 써야 해서 Claude 예약 작업이 채운다 → 각 단계 '요약필요: true'
(작성 규칙: scripts/ipo-report-guide.md)

필요한 시크릿: DART_API_KEY (표준 라이브러리만 사용)
"""
import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

KEY = os.environ.get("DART_API_KEY", "").strip()
API = "https://opendart.fss.or.kr/api"
OUT_DIR = "public/data/ipo-reports"
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).date()
WINDOW = 7          # 오늘 ~ 7일 뒤 상장
KEEP_DAYS = 120     # 오래된 보고서 정리
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
BIZ_CHARS = 2200


def log(*a):
    print(*a, flush=True)


def http(url, binary=False, headers=None, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", **(headers or {})})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            return body if binary else body.decode("utf-8", "ignore")
        except Exception as e:
            last = e
            time.sleep(2 + attempt * 3)
    raise RuntimeError("요청 실패: %s (%s)" % (url.split("?")[0], last))


def dart(endpoint, params, binary=False):
    q = dict(params, crtfc_key=KEY)
    body = http("%s/%s?%s" % (API, endpoint, urllib.parse.urlencode(q)), binary=True)
    time.sleep(0.3)
    if binary and body[:2] == b"PK":
        return body
    try:
        j = json.loads(body.decode("utf-8"))
    except Exception:
        m = re.search(rb"<status>(\d+)</status>", body)
        j = {"status": m.group(1).decode() if m else "999"}
    if j.get("status") in ("010", "011", "012", "901"):
        raise SystemExit("DART API 키 오류(status %s)" % j.get("status"))
    return j


TAG = re.compile(r"<[^>]+>", re.S)


def clean(s):
    s = TAG.sub(" ", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def decode(b):
    m = re.search(rb'encoding="([^"]+)"', b[:200])
    for enc in ([m.group(1).decode()] if m else []) + ["utf-8", "cp949"]:
        try:
            return b.decode(enc)
        except Exception:
            continue
    return b.decode("utf-8", "ignore")


def norm_name(s):
    s = re.sub(r"\(주\)|㈜|주식회사|\s", "", s or "")
    return s.lower()


# ───────── DART 고유번호 ─────────
def corp_codes():
    raw = dart("corpCode.xml", {}, binary=True)
    xml = zipfile.ZipFile(io.BytesIO(raw)).read("CORPCODE.xml").decode("utf-8", "ignore")
    out = {}
    for m in re.finditer(r"<list>(.*?)</list>", xml, re.S):
        blk = m.group(1)
        g = lambda t: (re.search(r"<%s>(.*?)</%s>" % (t, t), blk, re.S) or [None, ""])[1].strip()
        out.setdefault(norm_name(g("corp_name")), []).append({"corp_code": g("corp_code"), "stock_code": g("stock_code"), "modify": g("modify_date")})
    return out


def corp_list(codes, name, alias=None):
    out = []
    for n in [name, alias]:
        for c in sorted(codes.get(norm_name(n), []) if n else [], key=lambda x: x["modify"], reverse=True):
            if c["corp_code"] not in out:
                out.append(c["corp_code"])
    return out


def find_corp(codes, name, alias=None):
    for n in [name, alias]:
        if not n:
            continue
        c = codes.get(norm_name(n))
        if c:
            # 같은 이름이 여럿이면 최근 수정된 것(신규 상장 준비 중인 회사일 가능성 높음)
            return sorted(c, key=lambda x: x["modify"], reverse=True)[0]["corp_code"]
    return None


# ───────── 증권신고서 원문 ─────────
def filing_candidates(corp_code):
    """본문이 온전한 순서로 후보를 돌려준다: 투자설명서 → 최초 증권신고서 → 기재정정본(정정사항만 있을 수 있음)."""
    bgn = (TODAY - timedelta(days=270)).strftime("%Y%m%d")
    j = dart("list.json", {"corp_code": corp_code, "bgn_de": bgn, "pblntf_ty": "C", "page_count": 100})
    L = j.get("list", [])
    nm = lambda r: r.get("report_nm", "")
    by_new = lambda rows: sorted(rows, key=lambda r: r.get("rcept_no", ""), reverse=True)
    prospectus = by_new([r for r in L if "투자설명서" in nm(r) and "정정" not in nm(r)])
    orig = by_new([r for r in L if "증권신고서" in nm(r) and "정정" not in nm(r)])
    fixed = by_new([r for r in L if "증권신고서" in nm(r) and "정정" in nm(r)])
    cands = prospectus + orig + fixed
    if not cands:
        log("    발행공시 목록:", [nm(r) for r in L][:8], j.get("status"), j.get("message", ""))
    return cands


def filing_doc(rcept_no):
    raw = dart("document.xml", {"rcept_no": rcept_no}, binary=True)
    if raw[:2] != b"PK":
        return ""
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = z.namelist()
    log("    원문 파일:", ", ".join("%s(%dKB)" % (n, z.getinfo(n).file_size // 1024) for n in names[:8]))
    # 본문은 '<접수번호>.xml'(첨부 감사보고서 등은 '<접수번호>_00760.xml' 식) — 없으면 가장 큰 파일
    main = [n for n in names if re.fullmatch(r"%s\.xml" % rcept_no, n)]
    pick = main[0] if main else sorted(names, key=lambda n: z.getinfo(n).file_size, reverse=True)[0]
    doc = decode(z.read(pick))
    log("    본문 %s · 사업의개요 %d · 요약재무 %d · 표 %d" % (pick, len(re.findall(r"사업의\s*개요", doc)), len(re.findall(r"요약\s*(연결)?\s*재무", doc)), len(re.findall(r"<TABLE", doc, re.I))))
    return doc


def tables(doc):
    for m in re.finditer(r"<TABLE\b.*?</TABLE>", doc, re.S | re.I):
        rows = []
        for tr in re.finditer(r"<TR\b.*?</TR>", m.group(0), re.S | re.I):
            cells = [clean(c.group(2)) for c in re.finditer(r"<(TD|TE|TH|TU)\b[^>]*>(.*?)</\1>", tr.group(0), re.S | re.I)]
            if cells:
                rows.append(cells)
        if rows:
            yield m.start(), m.end(), rows


def business_text(doc):
    """'사업의 개요' 본문 앞부분. 표는 빼고 문단만."""
    body = re.sub(r"<TABLE\b.*?</TABLE>", " ", doc, flags=re.S | re.I)
    text = clean(re.sub(r"</?(P|BR|TITLE|SECTION[^>]*)>", "\n", body, flags=re.I))
    for pat in [r"사업의\s*개요", r"회사의\s*개요", r"사업의\s*내용"]:
        hits = [m.end() for m in re.finditer(pat, text)]
        # 목차에 나온 첫 등장은 건너뛰고, 뒤에 본문이 충분히 이어지는 지점을 고른다
        for h in hits[1:] + hits[:1]:
            seg = text[h:h + BIZ_CHARS + 400].strip(" .:-")
            if len(re.sub(r"[\d\s\.\-]", "", seg[:300])) > 120:
                cut = seg[:BIZ_CHARS]
                end = max(cut.rfind("다."), cut.rfind("니다"))
                return (cut[:end + 2] if end > BIZ_CHARS * 0.5 else cut).strip()
    return ""


# 표의 첫 칸(계정명)을 공백·괄호 주석·머리번호를 지운 뒤 '정확히' 비교한다.
#  주의: '매출채권'·'매출원가'·'매출총이익'이 '매출'로 시작하므로 접두어 매칭은 쓰지 않는다(2026-11 동원파츠 오류).
FIN_ROWS = [
    ("매출액", re.compile(r"^(매출액|매출|영업수익|수익|매출액및영업수익)$")),
    ("영업이익", re.compile(r"^영업(이익|손실|손익)$")),
    ("당기순이익", re.compile(r"^(연결)?(당기|반기|분기)?순(이익|손실|손익)$")),
    ("자산총계", re.compile(r"^자산총계$")),
    ("부채총계", re.compile(r"^부채총계$")),
    ("자본총계", re.compile(r"^자본총계$")),
]


def acct(label):
    s = re.sub(r"\s", "", label or "")
    s = re.sub(r"^[\[(（]?[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX\d]+[.)\]）]", "", s)  # 'Ⅰ.' '1.' '(1)'
    s = re.sub(r"[\[\]]", "", s)
    s = re.sub(r"\((주|註)?\d*\)$|\*+\d*$|주\d+\)?$", "", s)  # '(주1)' '*1' 같은 각주
    return s


def summary_financials(doc):
    """'요약재무정보' 뒤에서 매출·이익 행이 있는 첫 표를 골라 원문 그대로 추린다."""
    anchors = [m.start() for m in re.finditer(r"요약\s*(연결)?\s*재무\s*정보", doc)]
    best = None
    for start, end, rows in tables(doc):
        flat = "".join("".join(r) for r in rows).replace(" ", "")
        if not ("매출" in flat or "영업수익" in flat) or "영업" not in flat:
            continue
        if not re.search(r"(20\d\d|제\s*\d+\s*기)", " ".join(rows[0] + (rows[1] if len(rows) > 1 else []))):
            continue
        dist = min([start - a for a in anchors if a <= start] or [10 ** 9])
        cand = (dist, start, rows)
        if best is None or cand[0] < best[0]:
            best = cand
        if dist < 20000:
            break
    if not best:
        return None
    rows = best[2]
    # 머리행: 연도/기수가 들어간 행(최대 2행 병합)
    head = rows[0]
    if len(rows) > 1 and re.search(r"(20\d\d|\d{4}\.\d)", " ".join(rows[1])) and not re.search(r"20\d\d", " ".join(rows[0])):
        head = rows[1]
    picked = []
    for label, pat in FIN_ROWS:
        for r in rows:
            a = acct(r[0]) if r else ""
            base = re.sub(r"\(.*?\)", "", a)  # '당기(반기)순이익(손실)' → '당기순이익', '영업이익(영업손실)' → '영업이익'
            if pat.search(a) or pat.search(base):
                # '영업손실'처럼 손실로 표기된 행은 양수가 손실이라 원래 계정명을 그대로 보여 준다
                picked.append([a if "손실" in a and "이익" not in a else label] + r[1:])
                break
    if not picked:
        return None
    width = max(len(r) for r in picked)
    if len(head) == width - 1:  # 머리행에 '과목' 칸이 빠진 표
        head = ["과목"] + head
    ctx = clean(doc[max(0, best[1] - 1200):best[1]])
    unit = (re.findall(r"단위\s*[:：]?\s*(백만원|천원|원|억원)", ctx + " " + " ".join(" ".join(r) for r in rows[:2])) or ["원"])[-1]
    basis = "연결" if "연결" in ctx[-300:] else "별도"
    return {"단위": unit, "기준": basis, "머리": head, "행": picked}


# ───────── 기사 ─────────
def news(name):
    q = '"%s" when:30d' % name
    url = "https://news.google.com/rss/search?q=%s&hl=ko&gl=KR&ceid=KR:ko" % urllib.parse.quote(q)
    try:
        xml = http(url, headers={"Accept": "application/rss+xml", "Cookie": "CONSENT=YES+cb"})
    except Exception as e:
        log("  기사 수집 실패:", e)
        return []
    out = []
    for it in xml.split("<item>")[1:]:
        g = lambda t: html.unescape((re.search(r"<%s[^>]*>(.*?)</%s>" % (t, t), it, re.S) or [None, ""])[1]).replace("<![CDATA[", "").replace("]]>", "").strip()
        title = g("title")
        src = g("source")
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3]
        try:
            d = parsedate_to_datetime(g("pubDate")).astimezone(KST).date().isoformat()
        except Exception:
            d = ""
        if name.replace(" ", "") not in title.replace(" ", ""):
            continue  # 제목에 회사명이 없는 기사는 제외(동명이인·광고성 묶음 방지)
        out.append({"제목": title, "매체": src, "날짜": d, "링크": g("link")})
    out.sort(key=lambda x: x["날짜"], reverse=True)
    seen, res = set(), []
    for x in out:
        k = re.sub(r"\W", "", x["제목"])[:24]
        if k in seen:
            continue
        seen.add(k)
        res.append(x)
    return res[:8]


def safe_file(name):
    return re.sub(r'[\\/:*?"<>|\s]+', "_", name)


STAGES = ["청구", "승인", "상장"]
BACKFILL = os.environ.get("BACKFILL") == "1"
BACKFILL_FROM = "2026-01-01"
SPAC = re.compile(r"스팩|기업인수목적|SPAC", re.I)
WINDOW_PAST = 7


def stage_events(r):
    """오늘 기준으로 새로 생길 수 있는 단계와 기준일."""
    today = TODAY.isoformat()
    past = (TODAY - timedelta(days=WINDOW_PAST)).isoformat()
    ahead = (TODAY + timedelta(days=WINDOW)).isoformat()
    ev = []
    if r.get("청구일") and past <= r["청구일"] <= today:
        ev.append(("청구", r["청구일"]))
    # KIND '승인일' 칸은 심사 결과일이다 — 철회·미승인이면 그 날짜이므로 승인 단계로 보지 않는다
    if r.get("승인일") and past <= r["승인일"] <= today and "승인" in (r.get("심사상태") or "승인") and "미승인" not in (r.get("심사상태") or ""):
        ev.append(("승인", r["승인일"]))
    lst = r.get("상장일") or r.get("상장예정일") or ""
    if lst and today <= lst <= ahead:
        ev.append(("상장", lst))
    # 일괄 생성(BACKFILL=1): 아직 상장 전이고 진행 중인 종목은 '현재 단계' 보고서를 하나 만든다
    if BACKFILL and not ev and not (r.get("상장일") and r["상장일"] <= today):
        st_ = r.get("심사상태") or ""
        if re.search(r"철회|미승인|만료", st_):
            return ev
        # 2026년 이후 청구·승인 건만(사용자 지정)
        if "승인" in st_ and (r.get("승인일") or "") >= BACKFILL_FROM:
            ev.append(("승인", r["승인일"]))
        elif "접수" in st_ and (r.get("청구일") or "") >= BACKFILL_FROM:
            ev.append(("청구", r["청구일"]))
    return ev


def company_info(codes, r):
    code = find_corp(codes, r["회사명"], r.get("공모명"))
    if not code:
        return None, None
    c = dart("company.json", {"corp_code": code})
    if c.get("status") != "000":
        return code, None
    c = {k: re.sub(r"\s+", " ", html.unescape(re.sub(r"&nbsp;?", " ", v))).strip() if isinstance(v, str) else v for k, v in c.items()}
    return code, {
        "정식명칭": c.get("corp_name", ""), "영문명": c.get("corp_name_eng", ""), "대표자": c.get("ceo_nm", ""),
        "설립일": (lambda d: "%s-%s-%s" % (d[:4], d[4:6], d[6:]) if len(d) == 8 else d)(c.get("est_dt", "")),
        "업종코드": c.get("induty_code", ""), "결산월": (c.get("acc_mt", "") + "월") if c.get("acc_mt") else "",
        "주소": c.get("adres", ""), "홈페이지": c.get("hm_url", ""), "전화": c.get("phn_no", ""),
    }


def main():
    if not KEY:
        raise SystemExit("DART_API_KEY 없음")
    ipo = json.load(open("public/data/ipo.json", encoding="utf-8"))
    os.makedirs(OUT_DIR, exist_ok=True)
    idx_path = os.path.join(OUT_DIR, "index.json")
    try:
        index = json.load(open(idx_path, encoding="utf-8"))
    except Exception:
        index = {"reports": {}}
    index.setdefault("reports", {})

    todo = []  # (row, [(단계, 기준일)])
    for r in ipo["items"]:
        if SPAC.search(r.get("회사명", "")):
            continue  # 스팩(기업인수목적회사)은 보고서 대상에서 제외(사용자 지정)
        ev = stage_events(r)
        if not ev:
            continue
        fn = safe_file(r["회사명"])
        try:
            rep = json.load(open(os.path.join(OUT_DIR, fn + ".json"), encoding="utf-8"))
            if "단계" not in rep:
                rep = None  # 예전 형식 → 새로 만든다
        except Exception:
            rep = None
        new = [(st, d) for st, d in ev if not (rep and st in rep.get("단계", {}))]
        if new:
            todo.append((r, rep, new))
    log("새 단계 %d종목: %s" % (len(todo), ", ".join("%s(%s)" % (r["회사명"], "/".join(st for st, _ in n)) for r, _, n in todo)))
    codes = corp_codes() if todo else {}

    for r, rep, new in todo:
        name = r["회사명"]
        fn = safe_file(name)
        log("■", name, [st for st, _ in new])
        rep = rep or {"회사명": name, "시장": r.get("시장"), "file": fn, "단계": {}, "회사정보": None}
        rep["공모"] = {k: r.get(k, "") for k in ["청구일", "승인일", "심사상태", "신고서제출일", "수요예측시작", "수요예측종료", "청약시작", "청약종료", "납입일", "상장예정일", "상장일", "확정공모가", "공모금액", "주관사"]}
        code = None
        if not rep.get("회사정보"):
            code, rep["회사정보"] = company_info(codes, r)
        arts = news(name)
        for st, d in new:
            stage = {"기준일": d, "generated_at": datetime.now(KST).isoformat(timespec="seconds"), "기사": arts, "요약필요": True, "요약": None, "메모": []}
            if st == "상장":
                # 같은 이름의 회사가 여럿이면(예: 이에스티) 발행공시가 있는 쪽을 쓴다
                cands = []
                for cc in corp_list(codes, name, r.get("공모명"))[:4]:
                    cands = filing_candidates(cc)
                    if cands:
                        if cc != code:
                            code = cc
                            c = dart("company.json", {"corp_code": cc})
                            if c.get("status") == "000":
                                _, rep["회사정보"] = company_info({norm_name(name): [{"corp_code": cc, "modify": "9"}]}, {"회사명": name})
                        break
                f = None
                for cand in cands[:4]:
                    doc = filing_doc(cand["rcept_no"])
                    biz = business_text(doc) if doc else ""
                    fin = summary_financials(doc) if doc else None
                    if biz or fin:
                        f = cand
                        break
                if not f and cands:
                    f, biz, fin = cands[0], "", None
                if f:
                    stage["증권신고서"] = {"보고서명": f.get("report_nm", "").strip(), "접수일": f.get("rcept_dt", ""),
                                      "링크": "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=" + f["rcept_no"]}
                    stage["영위사업DART"] = biz
                    stage["실적"] = fin
                    if not stage["영위사업DART"]:
                        stage["메모"].append("증권신고서에서 '사업의 개요'를 찾지 못함")
                    if not stage["실적"]:
                        stage["메모"].append("증권신고서에서 요약재무정보 표를 찾지 못함")
                else:
                    stage["메모"].append("DART 증권신고서를 찾지 못함" + ("(고유번호 없음)" if not code else ""))
            if not arts:
                stage["메모"].append("최근 30일 기사 없음")
            rep["단계"][st] = stage
            log("  %s: 기사 %d건%s" % (st, len(arts), (" · 사업 %d자 · 실적 %s" % (len(stage.get("영위사업DART") or ""), "O" if stage.get("실적") else "X")) if st == "상장" else ""))
        rep["현재단계"] = [s for s in STAGES if s in rep["단계"]][-1]
        rep["updated_at"] = datetime.now(KST).isoformat(timespec="seconds")
        json.dump(rep, open(os.path.join(OUT_DIR, fn + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 목록 갱신 — 모든 보고서 파일 기준(공모 일정은 오늘 ipo.json 값으로 최신화)
    rows = {r["회사명"]: r for r in ipo["items"]}
    index["reports"] = {}
    for f in sorted(os.listdir(OUT_DIR)):
        if not f.endswith(".json") or f == "index.json":
            continue
        rep = json.load(open(os.path.join(OUT_DIR, f), encoding="utf-8"))
        if "단계" not in rep or SPAC.search(rep.get("회사명", "")):  # 예전 형식 파일·스팩 보고서는 정리
            os.remove(os.path.join(OUT_DIR, f))
            continue
        r = rows.get(rep["회사명"])
        if r:
            rep["공모"].update({k: r.get(k, "") for k in rep["공모"]})
            json.dump(rep, open(os.path.join(OUT_DIR, f), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        last = max([v.get("기준일", "") for v in rep["단계"].values()] + [rep["공모"].get("상장일") or ""])
        if last < (TODAY - timedelta(days=KEEP_DAYS)).isoformat():
            os.remove(os.path.join(OUT_DIR, f))  # 오래된 보고서 정리
            continue
        index["reports"][rep["회사명"]] = {
            "file": rep["file"], "현재단계": rep["현재단계"], "단계": [s for s in STAGES if s in rep["단계"]],
            "요약대기": [s for s in STAGES if rep["단계"].get(s, {}).get("요약필요")], "updated_at": rep.get("updated_at"),
        }
    index["updated_at"] = datetime.now(KST).isoformat(timespec="seconds")
    json.dump(index, open(idx_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("보고서 %d건 · 요약 대기 %d단계" % (len(index["reports"]), sum(len(v["요약대기"]) for v in index["reports"].values())))


if __name__ == "__main__":
    main()
