// 실기 채점 엔진 — PDF(2027 체육계열 실기전형 자료집) 채점표에서 추출·정규화
// 데이터: silgi_scoring_clean.json  { 대학: [{ 성별, 종목, dir:'higher'|'lower', thr:[[점수, 임계값|null], ...] }] }
//
// dir='higher' : 기록이 클수록 고득점 (멀리뛰기·메디신볼·윗몸일으키기 등)
//   → 임계값(thr) = 그 점수를 받기 위한 "최소 기록". record >= thr 이면 그 점수 획득.
// dir='lower'  : 기록이 작을수록 고득점 (달리기 등)
//   → 임계값(thr) = 그 점수를 받기 위한 "최대 허용 기록". record <= thr 이면 그 점수 획득.
// thr === null : 해당 점수 구간의 극단(이하/이상) — 항상 충족.

import scoringData from './silgi_scoring_clean.json'

/**
 * 한 종목의 채점 엔트리에서 측정 기록(record)에 해당하는 점수를 반환.
 * @param {object} entry  { dir, thr }
 * @param {number} record 측정 기록 (예: 메디신볼 8.2, 20m왕복 16.4)
 * @returns {number|null} 환산 점수
 */
export function scoreOfEntry(entry, record) {
  if (!entry || record == null || isNaN(record)) return null
  let best = null
  for (const [score, thr] of entry.thr) {
    let ok
    if (thr === null) ok = true
    else if (entry.dir === 'higher') ok = record >= thr
    else ok = record <= thr
    if (ok) best = best === null ? score : Math.max(best, score)
  }
  return best
}

/**
 * 대학·성별·종목·기록으로 환산 점수를 조회.
 * 종목명은 부분일치(예: '메디신볼'로 '메디신볼던지기(3kg)' 매칭).
 */
export function silgiScore(university, gender, eventName, record) {
  const list = scoringData[university]
  if (!list) return { ok: false, reason: 'no_university' }
  const entry = list.find(
    e => (e.성별 === gender || e.성별 == null) && e.종목.includes(eventName),
  )
  if (!entry) return { ok: false, reason: 'no_event' }
  const score = scoreOfEntry(entry, record)
  return { ok: score != null, score, 종목: entry.종목, dir: entry.dir }
}

/** 특정 대학에서 채점 가능한 종목 목록(성별별) 반환 — 입력 폼 구성용. */
export function silgiEventsOf(university) {
  return (scoringData[university] || []).map(e => ({
    성별: e.성별,
    종목: e.종목,
    dir: e.dir,
  }))
}

/** 채점 가능한(데이터가 정상인) 대학 목록. */
export const scorableUniversities = Object.keys(scoringData)

export default silgiScore
