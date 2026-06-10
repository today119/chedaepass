// 어디가 입시결과(전년도) 조회 헬퍼.
// ipgyeol.json(대학별 모집단위·전형·충원·컷·입시홈페이지)을 admissions.json 카드와 매칭.
import ip from './ipgyeol.json'

// 대학명 정규화: '국립' 접두, 캠퍼스(괄호), 공백, 말미 '대학교/대학' 제거 → 개명/표기차 흡수
const normU = (n) =>
  (n || '')
    .replace(/국립/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s/g, '')
    .replace(/대학교$|대학$/, '')

// 학과명 정규화: 괄호·공백 제거, 말미 학과/학부/전공/계열/과 제거
const normD = (d) =>
  (d || '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s/g, '')
    .replace(/(학과|학부|전공|계열|과|대학)$/, '')

// 정규화 대학명 → 통합 레코드(여러 캠퍼스 모집단위 합침, 링크는 첫 값)
const byU = new Map()
for (const u of ip) {
  const k = normU(u.대학)
  if (!byU.has(k)) {
    byU.set(k, { 대학: u.대학, 홈페이지: u.홈페이지, 입시홈페이지: u.입시홈페이지, 모집단위: [...u.모집단위] })
  } else {
    byU.get(k).모집단위.push(...u.모집단위)
  }
}

// 대학 공식 링크
export function univLink(대학) {
  const u = byU.get(normU(대학))
  if (!u) return null
  return { 홈페이지: u.홈페이지, 입시홈페이지: u.입시홈페이지 }
}

// 카드(rec)에 해당하는 어디가 전년 입시결과 전형 목록
// type: '수시' | '정시' (rec.type)
export function ipgyeolFor(대학, 학과, type) {
  const u = byU.get(normU(대학))
  if (!u) return null
  const nd = normD(학과)
  // 학과 매칭: 정확일치 우선, 없으면 부분일치(양방향)
  const exact = u.모집단위.filter((m) => normD(m.학과) === nd)
  const cands = exact.length
    ? exact
    : u.모집단위.filter((m) => {
        const m2 = normD(m.학과)
        return m2 && nd && (m2.includes(nd) || nd.includes(m2))
      })
  if (!cands.length) return null
  // 매칭된 모집단위들의 전형을 모으고 시기로 필터
  let 전형 = cands.flatMap((m) => m.전형.map((t) => ({ ...t, _학과: m.학과 })))
  if (type) 전형 = 전형.filter((t) => (t.모집시기 || '').startsWith(type))
  // 의미있는 행만(모집/경쟁/충원/컷 중 하나라도)
  전형 = 전형.filter(
    (t) => t.모집인원 != null || t.경쟁률 != null || t.충원인원 != null || t.학생부환산등급컷 || t.수능평균백분위컷
  )
  return 전형.length ? 전형 : null
}
