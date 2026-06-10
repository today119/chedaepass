# -*- coding: utf-8 -*-
"""
1단계: PDF(2027 체육계열 실기전형 자료집)에서 대학별 실기 채점표를 추출.

입력 : 2027학년도 대입 체육계열 실기전형 자료집.pdf
출력 : silgi_tables.json   { 대학: [ { page, scores:[..], events:[{성별,종목,기록[]}] } ] }
       toc_map.json        목차에서 추출한 (번호, 대학명, 시작페이지)

표준 격자형(점수가 가로축, 종목이 세로축) 포맷을 자동 추출한다.
변형 포맷(점수 세로축 등)은 미지원 — 별도 보정 필요.

사용:  python 1_extract_silgi.py "경로/2027...자료집.pdf"
"""
import sys, re, json
import pdfplumber

PDF = sys.argv[1] if len(sys.argv) > 1 else "2027학년도 대입 체육계열 실기전형 자료집.pdf"


def parse_toc(pdf):
    """목차(3~8p)에서 대학명→시작페이지 매핑."""
    toc = ""
    for i in range(2, 8):
        toc += (pdf.pages[i].extract_text() or "") + "\n"
    entries = []
    for ln in toc.splitlines():
        ln = ln.replace("\x00", " ")
        m = re.match(r"\s*(\d{1,3})\.\s*(.+?)\s*[·.]{3,}\s*(\d{1,3})\s*$", ln)
        if m:
            name = re.sub(r"\s+", "", m.group(2))
            entries.append((int(m.group(1)), name, int(m.group(3))))
    return entries


def page_university_map(pdf, toc):
    """목차 순서대로 페이지 구간을 대학에 귀속."""
    toc_sorted = sorted((pg, name) for _, name, pg in toc)
    N = len(pdf.pages)
    page_uni = {}
    for idx, (pg, name) in enumerate(toc_sorted):
        end = toc_sorted[idx + 1][0] - 1 if idx + 1 < len(toc_sorted) else N
        for p in range(pg, end + 1):
            page_uni[p] = name  # p = 1-indexed
    return page_uni


def is_score_grid(tb):
    flat = " ".join((c or "") for row in tb[:2] for c in row)
    return len(re.findall(r"\b\d{2,3}\b", flat)) >= 6 and (
        "점수" in flat or "100" in flat or "90" in flat
    )


def parse_grid(tb):
    hdr, hi = None, 0
    for ri, row in enumerate(tb[:3]):
        cells = [(c or "").strip() for c in row]
        if len([c for c in cells if re.fullmatch(r"\d{2,3}", c)]) >= 6:
            hdr, hi = cells, ri
            break
    if not hdr:
        return None
    score_idx = [j for j, c in enumerate(hdr) if re.fullmatch(r"\d{2,3}", c)]
    scores = [int(hdr[j]) for j in score_idx]
    events, gender = [], None
    for row in tb[hi + 1:]:
        cells = [(c or "").strip().replace("\n", " ") for c in row]
        joined = " ".join(cells)
        if re.search(r"남\s*자", joined) or re.match(r"\s*남", joined):
            gender = "남"
        elif re.search(r"여\s*자", joined) or re.match(r"\s*여", joined):
            gender = "여"
        name = None
        for c in cells[:4]:
            cc = re.sub(r"\s+", "", c)
            if re.search(r"[가-힣]", cc) and not re.fullmatch(r"[남여자]+", cc) and len(cc) >= 2:
                name = cc
                break
        if not name:
            continue
        vals = [cells[j] if j < len(cells) else "" for j in score_idx]
        if sum(1 for v in vals if re.search(r"\d", v)) < 4:
            continue
        events.append({"성별": gender, "종목": name, "기록": vals})
    return {"scores": scores, "events": events} if events else None


def main():
    pdf = pdfplumber.open(PDF)
    toc = parse_toc(pdf)
    json.dump(toc, open("toc_map.json", "w", encoding="utf8"), ensure_ascii=False)
    page_uni = page_university_map(pdf, toc)

    result, parsed = {}, 0
    for i, pg in enumerate(pdf.pages):
        uni = page_uni.get(i + 1)
        if not uni:
            continue
        for tb in pg.extract_tables():
            if len(tb) < 3 or not is_score_grid(tb):
                continue
            g = parse_grid(tb)
            if g:
                result.setdefault(uni, []).append({"page": i + 1, **g})
                parsed += 1
    json.dump(result, open("silgi_tables.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"목차 {len(toc)}개 대학 / 파싱 채점표 {parsed}개 / 대학 {len(result)}개")


if __name__ == "__main__":
    main()
