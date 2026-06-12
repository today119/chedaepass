// 실기 채점 엔진 — PDF(2027 체육계열 실기전형 자료집) 채점표에서 추출·정규화
// 데이터: silgi_scoring_clean.json  { 대학: [{ 성별, 종목, dir:'higher'|'lower', thr:[[점수, 임계값|null], ...] }] }
//
// dir='higher' : 기록이 클수록 고득점 (멀리뛰기·메디신볼·윗몸일으키기 등)
//   → 임계값(thr) = 그 점수를 받기 위한 "최소 기록". record >= thr 이면 그 점수 획득.
// dir='lower'  : 기록이 작을수록 고득점 (달리기 등)
//   → 임계값(thr) = 그 점수를 받기 위한 "최대 허용 기록". record <= thr 이면 그 점수 획득.
// thr === null : 해당 점수 구간의 극단(이하/이상) — 항상 충족.

import scoringData from './silgi_scoring_clean.json'
import preciseData from './silgi_precise.json'

// 정밀 데이터: { 대학: { 표: [{ 출처, 학과매칭:[부분문자열], 종목:[{성별,종목,dir,thr,weight}] }] } }
// 모집단위(대학+학과)로 매칭. 학과매칭이 비면 그 대학 전체 적용. 없으면 기존 silgi_scoring_clean(대학 단위, 균등) 폴백.

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

// ---------- 정밀(모집단위 단위 + 종목 가중치) ----------

/**
 * 대학+학과로 실기 채점표 조회.
 * @returns {{source:'정밀'|'기본', 출처?:string, entries:[{성별,종목,dir,thr,weight}]}|null}
 */
export function silgiTable(university, dept, 전형) {
  const p = preciseData[university]
  if (p && Array.isArray(p.표)) {
    const matched = p.표.find(t => {
      const dOk = !t.학과매칭 || t.학과매칭.length === 0 || t.학과매칭.some(k => (dept || '').includes(k))
      // 전형매칭이 있으면 해당 전형명에 부분일치할 때만 적용(모집단위는 같지만 전형별 실기가 다른 경우 구분)
      const jOk = !t.전형매칭 || t.전형매칭.length === 0 || t.전형매칭.some(k => (전형 || '').includes(k))
      return dOk && jOk
    })
    if (matched) return { source: '정밀', 출처: matched.출처, entries: matched.종목, 실기만점: matched.실기만점 || null }
  }
  const list = scoringData[university]
  if (list) return { source: '기본', entries: list.map(e => ({ ...e, weight: 1 })) }
  return null
}

/** 정밀/기본 채점표가 있는 모집단위인지 */
export function isSilgiScorable(university, dept, 전형) {
  return !!silgiTable(university, dept, 전형)
}

/** 입력 폼용 종목 목록(성별 매칭, 종목명 중복제거). dir·weight 포함 */
export function silgiEventList(university, dept, gender, 전형) {
  const tbl = silgiTable(university, dept, 전형)
  if (!tbl) return []
  const seen = new Set()
  const out = []
  for (const e of tbl.entries) {
    if (e.성별 !== gender && e.성별 != null) continue
    if (seen.has(e.종목)) continue
    seen.add(e.종목)
    out.push({ 종목: e.종목, dir: e.dir, weight: e.weight || 1,만점: e.만점 ?? null, entry: e })
  }
  return out
}

/**
 * 종목별 기록(records: {종목: 값})으로 가중 실기 환산점(0~100) 계산.
 * @returns {{score:number, used:[{종목,score,weight}], source:string}|null}
 */
export function silgiWeightedScore(university, dept, gender, records, 전형) {
  const events = silgiEventList(university, dept, gender, 전형)
  if (!events.length) return null
  let wsum = 0, ssum = 0
  const used = []
  for (const ev of events) {
    const raw = records[ev.종목]
    if (raw == null || raw === '' || isNaN(parseFloat(raw))) continue
    const sc = scoreOfEntry(ev.entry, parseFloat(raw))
    if (sc == null) continue
    const w = ev.weight || 1
    wsum += w; ssum += sc * w
    used.push({ 종목: ev.종목, score: sc, weight: w })
  }
  if (!wsum) return null
  const tbl = silgiTable(university, dept, 전형)
  const score = Math.round((ssum / wsum) * 10) / 10
  const 만점 = tbl.실기만점 || null
  // 원점 = 환산% × 실기만점 / 100 (모든 종목 입력 가정 시 실기 취득점)
  const raw = 만점 != null ? Math.round((score / 100) * 만점 * 10) / 10 : null
  return { score, used, source: tbl.source, 만점, raw }
}

export default silgiScore
