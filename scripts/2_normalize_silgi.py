# -*- coding: utf-8 -*-
"""
2단계: 추출된 채점표의 기록구간 문자열을 '임계값(threshold)' 형태로 정규화.

입력 : silgi_tables.json
출력 : silgi_scoring.json        전체(22개 대학) 정규화 결과
       silgi_scoring_clean.json  종목명이 정상인 대학만 (즉시 사용가능)

정규화 결과 스키마:
  { 대학: [ { 성별, 종목, dir:'higher'|'lower', thr:[[점수, 임계값|null], ...] } ] }
    dir='higher' : 기록 클수록 고득점. 임계값 = 그 점수의 '최소 기록'. record >= thr 이면 충족.
    dir='lower'  : 기록 작을수록 고득점. 임계값 = 그 점수의 '최대 허용'. record <= thr 이면 충족.
    thr=null     : 이하/이상 극단 구간 — 항상 충족.

채점 함수(scoreOf)는 record를 충족하는 점수들 중 최댓값을 부여한다.
"""
import json, re, math

EVENT_KW = (
    r"달리기|멀리뛰기|메디신|윗몸|왕복|배근|매달|턱걸이|던지기|점프|드리블|"
    r"슛|스텝|굽히기|지그재그|서전트|농구|축구|배구|핸드볼|사이드"
)


def nums(s):
    return [float(x) for x in re.findall(r"\d+\.?\d*", s)]


def normalize(scores, cells):
    reps = []
    for c in cells:
        n = nums(c)
        reps.append(sum(n) / len(n) if n else None)
    valid = [(i, r) for i, r in enumerate(reps) if r is not None]
    if len(valid) < 2:
        return None
    asc = valid[-1][1] > valid[0][1]  # 점수 증가에 따라 기록도 증가? → higher
    thr = []
    for sc, c in zip(scores, cells):
        n = nums(c)
        if not n:
            continue
        if "이하" in c:
            t = None if asc else max(n)
        elif "이상" in c:
            t = min(n) if asc else None
        elif len(n) >= 2:
            t = min(n) if asc else max(n)
        else:
            t = n[0]
        thr.append([sc, t])
    return {
        "dir": "higher" if asc else "lower",
        "thr": [[s, (None if t is None else round(t, 3))] for s, t in thr],
    }


def score_of(entry, x):
    """정규화 엔트리에서 기록 x의 환산 점수 (검증용 파이썬 구현)."""
    d, best = entry["dir"], None
    for s, t in entry["thr"]:
        ok = True if t is None else (x >= t if d == "higher" else x <= t)
        if ok:
            best = s if best is None else max(best, s)
    return best


def main():
    src = json.load(open("silgi_tables.json", encoding="utf8"))
    out = {}
    for uni, tables in src.items():
        for t in tables:
            for e in t["events"]:
                nz = normalize(t["scores"], e["기록"])
                if nz:
                    out.setdefault(uni, []).append({"성별": e["성별"], "종목": e["종목"], **nz})
    json.dump(out, open("silgi_scoring.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)

    # 종목명이 정상인(이벤트 키워드 포함) 대학만 선별
    clean = {}
    for uni, evs in out.items():
        good = [e for e in evs if re.search(EVENT_KW, e["종목"])]
        if len(good) >= 2 and len(good) >= len(evs) * 0.5:
            clean[uni] = good
    json.dump(clean, open("silgi_scoring_clean.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"정규화: 전체 {len(out)}개 대학 / 즉시사용 {len(clean)}개 대학")

    # 검증 (고려대)
    if "고려대학교" in clean:
        ko = clean["고려대학교"]
        find = lambda g, j: next((e for e in ko if e["성별"] == g and j in e["종목"]), None)
        tests = [("남", "메디신볼", 8.2, 72), ("남", "20m왕복", 16.40, 60), ("남", "제자리멀리뛰기", 250, 76)]
        for g, j, x, exp in tests:
            e = find(g, j)
            got = score_of(e, x) if e else None
            print(f"  {g} {j} {x} → {got}점 (기대 {exp}) {'OK' if got == exp else 'X'}")


if __name__ == "__main__":
    main()
