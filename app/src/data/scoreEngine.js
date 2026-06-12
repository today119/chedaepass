// 종점(환산총점) 계산 엔진.
// 학생 프로필 등급 → 내신/수능 환산점수(0~100). 정밀표(naesin_scoring.json) 있으면 정밀, 없으면 표준근사.
import naesin from './naesin_scoring.json'

export const SUBJECTS = ['국어', '영어', '수학', '사회', '과학']

// 표준(근사) 9등급 점수 — 정밀표 없는 대학용. 참고치.
export const STD_GRADE = [100, 98, 96, 93, 90, 85, 78, 65, 45]

function gradeToScore(g, table) {
  const n = Math.round(Number(g))
  if (!n || n < 1 || n > 9) return null
  return table[n - 1]
}

// 내신 환산점수(0~100). naesinByGrade = {국어:등급,…}
export function naesinScore(대학, naesinByGrade) {
  if (!naesinByGrade) return null
  const rec = naesin[대학]
  const precise = !!rec
  const table = precise ? rec.등급점수.일반 || STD_GRADE : STD_GRADE
  const subjects = precise ? rec.반영교과.기본 || SUBJECTS : SUBJECTS
  const vals = subjects.map((s) => gradeToScore(naesinByGrade[s], table)).filter((v) => v != null)
  if (!vals.length) return null
  const score = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  const 만점 = precise ? (rec.내신만점 || 100) : null
  const raw = 만점 != null ? Math.round((score / 100) * 만점 * 10) / 10 : null
  return {
    score,
    precise,
    subjects,
    만점,
    raw,
    note: precise ? rec.출처 : '표준근사(참고치)',
  }
}

// 수능 환산점수(0~100). 모의 등급 단순평균 → 표준근사(정시 참고용)
export function suneungScore(대학, moeuiByGrade) {
  if (!moeuiByGrade) return null
  const vals = SUBJECTS.map((s) => gradeToScore(moeuiByGrade[s], STD_GRADE)).filter((v) => v != null)
  if (!vals.length) return null
  return {
    score: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    precise: false,
    note: '모의등급 표준근사(참고치)',
  }
}

// 정밀표 보유 대학인지
export function hasPreciseNaesin(대학) {
  return !!naesin[대학]
}

// 학교 기준 내신 반영 평균등급 (정밀 있으면 그 학교 반영교과, 없으면 표준 국영수사과)
// 낮을수록 우수. { avg, subjects, precise }
export function naesinAvgGrade(대학, naesinByGrade) {
  if (!naesinByGrade) return null
  const rec = naesin[대학]
  const subjects = rec ? (rec.반영교과.기본 || SUBJECTS) : SUBJECTS
  const grades = subjects.map((s) => Number(naesinByGrade[s])).filter((g) => g >= 1 && g <= 9)
  if (!grades.length) return null
  return {
    avg: Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100,
    subjects,
    precise: !!rec,
  }
}

// 모의(수능 예측) 평균등급 — 정시 참고용. 낮을수록 우수.
export function moeuiAvgGrade(moeuiByGrade) {
  const grades = SUBJECTS.map((s) => Number(moeuiByGrade?.[s])).filter((g) => g >= 1 && g <= 9)
  if (!grades.length) return null
  return Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100
}
