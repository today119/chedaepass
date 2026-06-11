import React, { useEffect, useMemo, useState } from 'react'
import raw from './data/admissions.json'
import { silgiScore, silgiEventsOf, scorableUniversities } from './data/silgiScore.js'
import { univLink, ipgyeolFor } from './data/ipgyeolLookup.js'
import { naesinScore, suneungScore, hasPreciseNaesin, SUBJECTS } from './data/scoreEngine.js'

// 채점표 보유했으나 라벨 보정 중인 대학
const PENDING_SILGI_UNIVS = new Set([
  '상명대학교', '서울시립대학교', '숭실대학교', '한국외국어대학교', '남서울대학교',
  '단국대학교(천안)', '서원대학교', '선문대학교', '경상대학교', '동의대학교',
  '부경대학교', '제주대학교',
])
const SCORABLE_SET = new Set(scorableUniversities)

// ---------- 데이터 정규화 ----------
const ALL = [...raw.susi, ...raw.jeongsi]

const REGION_MAP = {
  공주: '충청', 천안: '충청', 대전: '충청', 세종: '충청', 충남: '충청', 충북: '충청',
  서울: '수도권', 경기: '수도권', 인천: '수도권',
  부산: '경상', 경남: '경상', 경북: '경상', 대구: '경상', 울산: '경상',
  광주: '전라', 전남: '전라', 전북: '전라',
  강원: '강원', 제주: '제주',
}
function bigRegion(r) {
  if (!r) return '기타'
  return REGION_MAP[r] || (r.includes('서울') || r.includes('경기') || r.includes('인천') ? '수도권' : '기타')
}
function regionOf(rec) {
  return rec.지역 || rec.소재지 || '기타'
}
function parsePct(v) {
  if (v == null || v === 'x' || v === 'X') return 0
  if (typeof v === 'number') return v <= 1 ? Math.round(v * 100) : Math.round(v)
  const m = String(v).match(/(\d+(?:\.\d+)?)/)
  return m ? Math.round(parseFloat(m[1])) : 0
}
function admissionType(rec) {
  const e = rec.전형 || ''
  if (/특기/.test(e)) return '특기자'
  if (rec.type === '정시') return '정시'
  if (/종합|학종/.test(e)) return '학생부종합'
  if (/교과/.test(e)) return '학생부교과'
  if (/논술/.test(e)) return '논술'
  if (/실기|실적/.test(e)) return '실기위주'
  return '기타'
}
const TYPE_FILTERS = ['학생부교과', '학생부종합', '실기위주', '특기자', '논술', '정시']

const SERIES = [
  { key: '경호·무도', pat: /경호|무도|무예|보안|태권도/ },
  { key: '체육교육', pat: /체육교육|체교|특수체육|특수교육/ },
  { key: '스포츠의학·재활', pat: /의학|재활|운동처방|건강운동|운동건강|물리치료|피트니스|한방|건강관리|헬스케어운동/ },
  { key: '생활·레저·산업', pat: /생활체육|사회체육|레저|레져|산업|경영|마케팅|비즈니스|골프|관광|아웃도어|해양|매니지먼트|글로벌|국제|마이스/ },
  { key: '노인·복지', pat: /노인|시니어|실버|복지|청소년/ },
  { key: '스포츠과학·체육학', pat: /과학|체육학|체육과학|스포츠학|사이언스|융합|건강|헬스|운동|스포츠|체육/ },
]
function seriesOf(rec) {
  const d = rec.학과 || ''
  for (const s of SERIES) if (s.pat.test(d)) return s.key
  return '기타'
}
const SERIES_KEYS = SERIES.map(s => s.key)

function silgiBand(rec) {
  const p = parsePct(rec.실기비율)
  if (p === 0) return '무실기'
  if (p <= 30) return '1~30%'
  if (p <= 50) return '31~50%'
  return '51%+'
}
const SILGI_BANDS = ['무실기', '1~30%', '31~50%', '51%+']

const JONGMOK_KEYS = [
  { key: '제자리멀리뛰기', pat: /제자리|제멀|멀리뛰기/ },
  { key: '메디신볼', pat: /메디신|메던/ },
  { key: '윗몸일으키기', pat: /윗몸|싯업|sit/i },
  { key: '왕복달리기', pat: /왕복|셔틀/ },
  { key: '유연성', pat: /좌전굴|유연/ },
  { key: '배근력', pat: /배근/ },
  { key: '턱걸이/매달리기', pat: /턱걸이|매달/ },
  { key: '농구', pat: /농구/ },
  { key: '축구', pat: /축구/ },
  { key: '핸드볼던지기', pat: /핸드볼/ },
  { key: '무실기', pat: /무실기/ },
]
function jongmokTags(rec) {
  const txt = (rec.실기종목 || []).join(' ')
  return JONGMOK_KEYS.filter(j => j.pat.test(txt)).map(j => j.key)
}

// 수능최저 (실제 등급합은 `최저` 필드)
function suneungMin(rec) {
  const v = rec.최저
  if (!v || v === 'x' || v === 'X') return { short: '없음', full: '' }
  const s = String(v)
  const taek = (s.match(/택\s*(\d+)/) || [])[1]
  const hap = (s.match(/합\s*(\d+)/) || [])[1]
  const each = (s.match(/각\s*(\d+)|과목별\s*(\d+)/) || []).slice(1).find(Boolean)
  let short
  if (hap) short = taek ? `${taek}개 합${hap}` : `합${hap}`
  else if (each) short = `각 ${each}등급`
  else short = '있음'
  return { short, full: s }
}
function isWomensUniv(name) {
  return /여자대학교|여대|여자대$/.test(name || '')
}
function hasSilgi(rec) {
  if (parsePct(rec.실기비율) > 0) return true
  const jm = rec.실기종목 || []
  return jm.length > 0 && !jm.every(j => /무실기/.test(j))
}
// 학과계열 필터 표시 순서 (분류 우선순위와 별개)
const SERIES_ORDER = ['체육교육', '스포츠과학·체육학', '스포츠의학·재활', '생활·레저·산업', '경호·무도', '노인·복지']

// 지역: 서울·인천·경기는 개별, 그 외는 권역
function regionKey(rec) {
  const r = regionOf(rec)
  if (r.includes('서울')) return '서울'
  if (r.includes('인천')) return '인천'
  if (r.includes('경기')) return '경기'
  return bigRegion(r)
}
const REGION_ORDER = ['서울', '인천', '경기', '충청', '경상', '전라', '제주', '강원']

// localStorage 동기화 훅
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
  }, [key, val])
  return [val, setVal]
}

// ---------- 구글 시트(GAS) 전송 ----------
function buildSheetRow(rec) {
  const p = rec._profile || {}
  const n = p.내신 || {}, m = p.모의 || {}
  const g = (o, k) => (o[k] != null && o[k] !== '' ? o[k] : '')
  return {
    날짜시각: new Date(rec.ts || Date.now()).toLocaleString('ko-KR'),
    이름: p.이름 || '', 성별: p.성별 || '', 학년: p.학년 || '',
    내신_국어: g(n, '국어'), 내신_영어: g(n, '영어'), 내신_수학: g(n, '수학'), 내신_사회: g(n, '사회'), 내신_과학: g(n, '과학'),
    모의_국어: g(m, '국어'), 모의_영어: g(m, '영어'), 모의_수학: g(m, '수학'), 모의_사회: g(m, '사회'), 모의_과학: g(m, '과학'),
    대학: rec.대학 || '', 학과: rec.학과 || '', 전형명: rec.전형 || '', 전형유형: rec.전형유형 || '', 모집시기: rec.type || '',
    총점: rec.종점 != null ? rec.종점 : '', 내신비교: rec.내신비교 || '', 메모: rec.메모 || '',
  }
}
function sendToSheet(url, rec) {
  try {
    fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(buildSheetRow(rec)) })
  } catch (e) { /* 로컬 저장은 별도로 유지됨 */ }
}

// ---------- UI ----------
function Chip({ active, onClick, children }) {
  return (
    <button className={'chip' + (active ? ' chip--on' : '')} onClick={onClick}>{children}</button>
  )
}

function RatioBar({ rec }) {
  const segs = rec.type === '수시'
    ? [['내신', parsePct(rec.내신비율), '#3b82f6'], ['실기', parsePct(rec.실기비율), '#f59e0b'], ['면접', parsePct(rec.면접비율), '#10b981'], ['서류', parsePct(rec.서류비율), '#8b5cf6']]
    : [['내신', parsePct(rec.내신비율), '#3b82f6'], ['수능', parsePct(rec.수능비율), '#ef4444'], ['실기', parsePct(rec.실기비율), '#f59e0b'], ['면접', parsePct(rec.면접비율), '#10b981']]
  const shown = segs.filter(s => s[1] > 0)
  const total = shown.reduce((a, s) => a + s[1], 0) || 1
  if (!shown.length) return <div className="ratio-empty">반영비율 정보 없음</div>
  return (
    <div>
      <div className="ratio-bar">
        {shown.map(([label, pct, color]) => (
          <div key={label} className="ratio-seg" style={{ width: `${(pct / total) * 100}%`, background: color }} title={`${label} ${pct}%`} />
        ))}
      </div>
      <div className="ratio-legend">
        {shown.map(([label, pct, color]) => (<span key={label}><i style={{ background: color }} />{label} {pct}%</span>))}
      </div>
    </div>
  )
}

function cutText(arr, suffix) {
  if (!arr) return null
  const c50 = arr[0], c70 = arr[1]
  if (c50 == null && c70 == null) return null
  const p = (v) => (v == null ? '–' : v + suffix)
  return `50%컷 ${p(c50)} · 70%컷 ${p(c70)}`
}
function IpgyeolBlock({ rows }) {
  return (
    <div className="ipg-box">
      {rows.map((t, i) => {
        const sb = cutText(t.학생부환산등급컷, '등급')
        const su = cutText(t.수능평균백분위컷, '')
        return (
          <div key={i} className="ipg-row">
            <div className="ipg-head">
              <span className={'ipg-when ' + (t.모집시기?.startsWith('정시') ? 'ipg-j' : 'ipg-s')}>{t.모집시기}</span>
              <span className="ipg-name">{t.전형명}</span>
            </div>
            <div className="ipg-nums">
              {t.모집인원 != null && <span>모집 {t.모집인원}</span>}
              {t.경쟁률 != null && <span>경쟁 {t.경쟁률}:1</span>}
              {t.충원인원 != null && <span className="ipg-chung">추합 {t.충원인원}순위</span>}
            </div>
            {sb && <div className="ipg-cut">학생부 {sb}</div>}
            {su && <div className="ipg-cut">수능 평균백분위 {su}</div>}
            {!sb && !su && <div className="ipg-cut ipg-muted">합격선 비공개(3명↓ 또는 미공개)</div>}
          </div>
        )
      })}
      <div className="ipg-foot">※ 어디가 전년도(2026) 입시결과 · 충원순위=마지막 추가합격 순위</div>
    </div>
  )
}

// ---------- 학생 프로필 ----------
const EMPTY_PROFILE = { 이름: '', 성별: '남', 학년: '고3', 내신: {}, 모의: {} }
function GradeRow({ label, obj, onChange }) {
  return (
    <div className="pf-grades">
      <span className="pf-gl">{label}</span>
      {SUBJECTS.map(s => (
        <span key={s} className="pf-gi">
          <label>{s[0]}</label>
          <input type="number" min="1" max="9" inputMode="numeric" placeholder="–"
            value={obj[s] ?? ''} onChange={e => onChange({ ...obj, [s]: e.target.value })} />
        </span>
      ))}
    </div>
  )
}
function ProfileCard({ profile, setProfile }) {
  const p = profile
  return (
    <div className="pf-card">
      <div className="pf-title">👤 학생 프로필 <span className="pf-sub">(자동저장)</span></div>
      <div className="pf-row">
        <input className="pf-name" placeholder="학생 이름" value={p.이름} onChange={e => setProfile({ ...p, 이름: e.target.value })} />
        <select value={p.성별} onChange={e => setProfile({ ...p, 성별: e.target.value })}>
          <option>남</option><option>여</option>
        </select>
        <select value={p.학년} onChange={e => setProfile({ ...p, 학년: e.target.value })}>
          <option>고1</option><option>고2</option><option>고3</option><option>N수</option>
        </select>
      </div>
      <GradeRow label="내신" obj={p.내신} onChange={v => setProfile({ ...p, 내신: v })} />
      <GradeRow label="모의" obj={p.모의} onChange={v => setProfile({ ...p, 모의: v })} />
      <div className="pf-hint">등급(1~9) 입력 → 카드에서 실기만 넣으면 총점 자동계산</div>
    </div>
  )
}

// ---------- 종점 계산기 (실기 + 프로필 자동 내신/수능) ----------
function ScoreCalc({ rec, profile, ipgy, onAddRecord, modal }) {
  const univ = rec.대학
  const scorable = SCORABLE_SET.has(univ)
  const [gender, setGender] = useState(profile?.성별 || '남')
  const [records, setRecords] = useState({})
  const [silgiManual, setSilgiManual] = useState('')
  const [memo, setMemo] = useState('')
  const [saved, setSaved] = useState(false)

  const events = useMemo(() => {
    if (!scorable) return []
    const all = silgiEventsOf(univ).filter(e => e.성별 === gender || e.성별 == null)
    const map = new Map()
    for (const e of all) if (!map.has(e.종목)) map.set(e.종목, e)
    return [...map.values()]
  }, [univ, gender, scorable])

  const scored = events.map(ev => {
    const v = records[ev.종목] ?? ''
    const num = v === '' ? null : parseFloat(v)
    const r = num == null || isNaN(num) ? null : silgiScore(univ, gender, ev.종목, num)
    return { 종목: ev.종목, dir: ev.dir, input: v, score: r && r.ok ? r.score : null }
  })
  const got = scored.filter(s => s.score != null).map(s => s.score)
  const silgiAuto = got.length ? Math.round((got.reduce((a, b) => a + b, 0) / got.length) * 10) / 10 : null
  const silgiVal = silgiAuto != null ? silgiAuto : (silgiManual !== '' && !isNaN(parseFloat(silgiManual)) ? parseFloat(silgiManual) : null)

  // 프로필 기반 내신·수능 환산
  const naesinR = naesinScore(univ, profile?.내신)
  const suneungR = suneungScore(univ, profile?.모의)

  const wSilgi = parsePct(rec.실기비율)
  const wNaesin = parsePct(rec.내신비율)
  const wSuneung = parsePct(rec.수능비율)
  const parts = []
  if (wSilgi > 0 && silgiVal != null) parts.push(['실기', silgiVal, wSilgi])
  if (wNaesin > 0 && naesinR) parts.push(['내신', naesinR.score, wNaesin])
  if (wSuneung > 0 && suneungR) parts.push(['수능', suneungR.score, wSuneung])
  const totalWeight = wSilgi + wNaesin + wSuneung
  const coveredPct = parts.reduce((a, [, , p]) => a + p, 0)
  const jongjeom = parts.length ? Math.round(parts.reduce((a, [, val, p]) => a + (val * p) / 100, 0) * 10) / 10 : null

  // 작년 입결 비교: 학생 내신 평균등급 vs 어디가 교과 컷
  const myGrades = SUBJECTS.map(s => Number(profile?.내신?.[s])).filter(g => g >= 1 && g <= 9)
  const myNaesinAvg = myGrades.length ? Math.round((myGrades.reduce((a, b) => a + b, 0) / myGrades.length) * 100) / 100 : null
  const ipgRow = (ipgy || []).find(t => t.학생부환산등급컷 && (t.학생부환산등급컷[0] != null || t.학생부환산등급컷[1] != null))
  const cut50 = ipgRow?.학생부환산등급컷?.[0]
  const cut70 = ipgRow?.학생부환산등급컷?.[1]

  function save() {
    const naesinCmp = (myNaesinAvg != null && cut70 != null)
      ? `내신 ${myNaesinAvg} vs 70%컷 ${cut70} (${myNaesinAvg <= cut70 ? '우위' : '열위'})`
      : (myNaesinAvg != null ? `내신 평균 ${myNaesinAvg}등급` : '')
    onAddRecord({
      대학: rec.대학, 학과: rec.학과, 전형: rec.전형 || rec.군 || '', 전형유형: admissionType(rec), type: rec.type,
      종점: jongjeom, 내신비교: naesinCmp, 메모: memo.trim(),
      _profile: profile,
    })
    setSaved(true); setMemo('')
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className={'silgi-box' + (modal ? ' silgi-box--modal' : '')}>
      {scorable ? (
        <>
          <div className="silgi-gender">
            <span className="silgi-label">실기 성별</span>
            {['남', '여'].map(g => (
              <button key={g} className={'chip chip--sm' + (gender === g ? ' chip--on' : '')} onClick={() => setGender(g)}>{g}</button>
            ))}
          </div>
          <div className="silgi-events">
            {events.map(ev => {
              const s = scored.find(x => x.종목 === ev.종목)
              return (
                <div key={ev.종목} className="silgi-row">
                  <label className="silgi-ev">{ev.종목}<span className="silgi-dir">{ev.dir === 'higher' ? '↑클수록' : '↓작을수록'}</span></label>
                  <input className="silgi-input" type="number" inputMode="decimal" placeholder="기록"
                    value={records[ev.종목] ?? ''} onChange={e => setRecords(p => ({ ...p, [ev.종목]: e.target.value }))} />
                  <span className={'silgi-score' + (s && s.score != null ? ' silgi-score--on' : '')}>
                    {s && s.input !== '' ? (s.score != null ? `${s.score}점` : '범위밖') : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          {silgiAuto != null && <div className="silgi-avg">실기 평균 환산 <b>{silgiAuto}</b>점 <span className="muted">({got.length}종목)</span></div>}
        </>
      ) : (
        wSilgi > 0 && (
          <div className="silgi-extra">
            <span className="silgi-label">실기 환산점수 (채점표 미보유 — 수기 입력)</span>
            <input className="silgi-input silgi-input--xs" type="number" placeholder="0~100" value={silgiManual} onChange={e => setSilgiManual(e.target.value)} />
          </div>
        )
      )}

      {/* 프로필 자동 환산 표시 */}
      <div className="sc-auto">
        {wNaesin > 0 && (
          <span className={'sc-pill' + (naesinR ? '' : ' sc-pill--off')}>
            내신 {naesinR ? `${naesinR.score}점` : '프로필 등급 필요'}
            {naesinR && <em className={naesinR.precise ? 'sc-pre' : 'sc-apx'}>{naesinR.precise ? '정밀' : '근사'}</em>}
          </span>
        )}
        {wSuneung > 0 && (
          <span className={'sc-pill' + (suneungR ? '' : ' sc-pill--off')}>
            수능 {suneungR ? `${suneungR.score}점` : '모의 등급 필요'}
            {suneungR && <em className="sc-apx">근사</em>}
          </span>
        )}
      </div>

      {jongjeom != null ? (
        <div className="silgi-jong">
          <div className="silgi-jong-head">총점(환산총점) <b>{jongjeom}</b><span className="muted"> / 100</span></div>
          <div className="silgi-jong-detail">
            {parts.map(([k, val, p]) => <span key={k}>{k} {val}×{p}%</span>)}
            {coveredPct < totalWeight && <span className="silgi-warn">· 미입력 {totalWeight - coveredPct}% 제외(참고치)</span>}
          </div>
        </div>
      ) : (wSilgi === 0 && wNaesin === 0 && wSuneung === 0) ? (
        <div className="sc-need sc-jeongseong">
          📋 {admissionType(rec) === '학생부종합' ? '학생부종합(정성평가)' : '정량 반영비율 정보 없음'} — 정량 총점 환산이 없는 전형입니다. 아래 내신 등급 비교를 참고하세요.
        </div>
      ) : (
        <div className="sc-need">
          {[
            wSilgi > 0 && silgiVal == null ? '실기 기록' : null,
            wNaesin > 0 && !naesinR ? '내신 등급' : null,
            wSuneung > 0 && !suneungR ? '모의 등급' : null,
          ].filter(Boolean).join(' · ')} 입력 시 총점 계산
        </div>
      )}

      {/* 작년 입결 비교 */}
      <div className="cmp-box">
        <div className="cmp-head">📊 작년 입결 비교</div>
        <div className="cmp-row">
          <span className="cmp-l">내 총점</span>
          <b className="cmp-jj">{jongjeom != null ? jongjeom : '–'}</b>
          <span className="cmp-vs">vs 작년 합격선</span>
          <span className="cmp-soon">환산총점 입결 데이터 추가 예정</span>
        </div>
        {(cut50 != null || cut70 != null) ? (
          <div className="cmp-naesin">
            내신 평균 <b>{myNaesinAvg ?? '–'}</b>등급 vs 작년 교과 {cut50 != null && <>50%컷 {cut50}</>}{cut70 != null && <> · 70%컷 {cut70}</>}
            {myNaesinAvg != null && cut70 != null && (
              <span className={'cmp-tag ' + (myNaesinAvg <= cut70 ? 'cmp-ok' : 'cmp-no')}>{myNaesinAvg <= cut70 ? '내신 우위' : '내신 열위'}</span>
            )}
          </div>
        ) : (
          <div className="cmp-naesin cmp-muted">작년 교과 합격선 비공개 — 어디가 입시결과 참고</div>
        )}
      </div>

      <div className="sc-save">
        <input className="sc-memo" placeholder="상담 메모(선택)" value={memo} onChange={e => setMemo(e.target.value)} />
        <button className="sc-save-btn" onClick={save}>＋ 상담기록</button>
        {saved && <span className="sc-saved">저장됨 ✓</span>}
      </div>
      <div className="silgi-foot">※ 총점은 단순 가중합 참고치. 정밀=모집요강 환산표 적용, 근사=표준 9등급 환산.</div>
    </div>
  )
}

function Card({ rec, profile, onAddRecord, onOpenConsult }) {
  const tags = jongmokTags(rec)
  const [openIpg, setOpenIpg] = useState(false)
  const showSilgi = hasSilgi(rec)
  const region = rec.type === '수시' ? regionOf(rec) : `${rec.군 || ''} · ${rec.소재지 || ''}`
  const sm = suneungMin(rec)
  const scorable = SCORABLE_SET.has(rec.대학)
  const pending = PENDING_SILGI_UNIVS.has(rec.대학)
  const link = univLink(rec.대학)
  const ipgy = ipgyeolFor(rec.대학, rec.학과, rec.type)
  const precise = hasPreciseNaesin(rec.대학)

  return (
    <div className="card">
      <div className="card-top">
        <div>
          <div className="card-uni">{rec.대학} {precise && <span className="badge-precise">정밀</span>}</div>
          <div className="card-dept">{rec.학과} <span className="muted">· {rec.전형 || rec.군}</span></div>
          <div className="card-meta">
            <span className="meta-series">{seriesOf(rec)}</span>
            <span className="meta-type">{admissionType(rec)}</span>
          </div>
        </div>
        <div className="card-badges">
          <span className={'pill ' + (rec.type === '수시' ? 'pill-susi' : 'pill-jeongsi')}>{rec.type}</span>
          <span className="pill pill-region">{region}</span>
        </div>
      </div>

      <RatioBar rec={rec} />

      <div className="card-stats">
        <div><b>{rec.모집2028 ?? '-'}</b><span>모집인원</span></div>
        <div><b>{rec.경쟁률 ?? rec.경쟁률2027 ?? '-'}</b><span>경쟁률(전년)</span></div>
        <div title={sm.full}><b className={sm.short === '없음' ? 'stat-muted' : ''}>{sm.short}</b><span>수능최저</span></div>
        <div><b>{rec.국공사립 || '-'}</b><span>설립</span></div>
      </div>

      {tags.length > 0 && <div className="card-tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}

      {rec.변경사항 && rec.변경사항 !== 'x' && <div className="card-note">📌 {String(rec.변경사항).slice(0, 80)}</div>}

      {link && (link.입시홈페이지 || link.홈페이지) && (
        <div className="card-links">
          {link.입시홈페이지 && <a className="ext-link ext-ipsi" href={/^https?:/.test(link.입시홈페이지) ? link.입시홈페이지 : 'https://' + link.입시홈페이지} target="_blank" rel="noreferrer">🎓 입시홈페이지(환산표)</a>}
          {link.홈페이지 && <a className="ext-link" href={/^https?:/.test(link.홈페이지) ? link.홈페이지 : 'https://' + link.홈페이지} target="_blank" rel="noreferrer">🏫 홈페이지</a>}
        </div>
      )}

      {ipgy && (
        <>
          <button className="ipg-toggle" onClick={() => setOpenIpg(o => !o)}>📊 어디가 전년 입시결과 · 충원 {openIpg ? '▲' : '▼'}</button>
          {openIpg && <IpgyeolBlock rows={ipgy} />}
        </>
      )}

      <button
        className={'consult-btn' + (showSilgi && !scorable ? (pending ? ' consult-btn--pending' : ' consult-btn--na') : '')}
        onClick={() => onOpenConsult(rec)}
      >
        📝 {showSilgi ? '실기·총점 상담화면' : '총점 상담화면'} 열기
        {showSilgi && !scorable && (pending ? ' (보정 중)' : ' (채점표 미보유)')}
      </button>
    </div>
  )
}

// ---------- 접이식 필터 그룹 ----------
function FGroup({ title, defaultOpen = true, count = 0, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={'fbox' + (open ? ' fbox--open' : '')}>
      <button className="fbox-head" onClick={() => setOpen(o => !o)}>
        <span className="fbox-t">{title}{count > 0 && <em className="fbox-cnt">{count}</em>}</span>
        <span className="fbox-arr">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="fbox-body"><div className="fchips">{children}</div></div>}
    </div>
  )
}

// ---------- 필터 드로어 ----------
function Drawer({ open, onClose, filters, profile, setProfile, gasUrl, setGasUrl }) {
  const { type, setType, types, setTypes, series, setSeries, silgi, setSilgi, regions, setRegions, estab, setEstab, jongmok, setJongmok, toggle } = filters
  return (
    <>
      <div className={'drawer-overlay' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'drawer' + (open ? ' open' : '')}>
        <div className="drawer-head">
          <span>학생 · 검색 필터</span>
          <button className="drawer-x" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <ProfileCard profile={profile} setProfile={setProfile} />

          <div className="drawer-sec">🔍 검색 필터</div>
          <FGroup title="모집시기" count={type !== '전체' ? 1 : 0}>
            {['전체', '수시', '정시'].map(t => <Chip key={t} active={type === t} onClick={() => setType(t)}>{t}</Chip>)}
          </FGroup>
          <FGroup title="전형유형" count={types.length}>
            {TYPE_FILTERS.map(t => <Chip key={t} active={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>{t}</Chip>)}
          </FGroup>
          <FGroup title="학과 계열" count={series.length}>
            {SERIES_ORDER.map(s => <Chip key={s} active={series.includes(s)} onClick={() => toggle(series, setSeries, s)}>{s}</Chip>)}
          </FGroup>
          <FGroup title="지역" count={regions.length} defaultOpen={false}>
            {REGION_ORDER.map(r => <Chip key={r} active={regions.includes(r)} onClick={() => toggle(regions, setRegions, r)}>{r}</Chip>)}
          </FGroup>
          <FGroup title="실기 비중" count={silgi.length} defaultOpen={false}>
            {SILGI_BANDS.map(s => <Chip key={s} active={silgi.includes(s)} onClick={() => toggle(silgi, setSilgi, s)}>{s}</Chip>)}
          </FGroup>
          <FGroup title="실기 종목" count={jongmok.length} defaultOpen={false}>
            {JONGMOK_KEYS.map(j => <Chip key={j.key} active={jongmok.includes(j.key)} onClick={() => toggle(jongmok, setJongmok, j.key)}>{j.key}</Chip>)}
          </FGroup>
          <FGroup title="설립 구분" count={estab !== '전체' ? 1 : 0} defaultOpen={false}>
            {['전체', '국공립', '사립'].map(e => <Chip key={e} active={estab === e} onClick={() => setEstab(e)}>{e}</Chip>)}
          </FGroup>

          <div className="drawer-sec">📑 구글 시트 연동</div>
          <div className="gas-box">
            <input className="gas-input" placeholder="GAS 웹앱 URL (…/exec)" value={gasUrl} onChange={e => setGasUrl(e.target.value)} />
            <div className="gas-hint">
              {gasUrl && gasUrl.trim()
                ? <span className="gas-on">✓ 연동됨 — ＋상담기록 저장 시 시트에도 한 줄 추가</span>
                : '비워두면 이 브라우저에만 저장(localStorage). URL 넣으면 시트로도 전송.'}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

// ---------- 풀스크린 상담 모달 ----------
function ConsultModal({ rec, profile, onClose, onAddRecord }) {
  const ipgy = ipgyeolFor(rec.대학, rec.학과, rec.type)
  const precise = hasPreciseNaesin(rec.대학)
  const region = rec.type === '수시' ? regionOf(rec) : `${rec.군 || ''} · ${rec.소재지 || ''}`
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  const hasProfileGrades = profile && ((profile.내신 && Object.values(profile.내신).some(v => v !== '' && v != null)) || (profile.모의 && Object.values(profile.모의).some(v => v !== '' && v != null)))
  return (
    <div className="consult-overlay" onClick={onClose}>
      <div className="consult-modal" onClick={e => e.stopPropagation()}>
        <div className="consult-head">
          <div>
            <div className="consult-uni">{rec.대학} {precise && <span className="badge-precise">정밀</span>}</div>
            <div className="consult-dept">{rec.학과} <span className="muted">· {rec.전형 || rec.군}</span> · <span className={'pill ' + (rec.type === '수시' ? 'pill-susi' : 'pill-jeongsi')}>{rec.type}</span> · {region}</div>
          </div>
          <button className="consult-x" onClick={onClose}>✕ 닫기</button>
        </div>
        <div className="consult-body">
          {!hasProfileGrades && <div className="consult-hint">💡 ☰ 드로어의 학생 프로필에 내신·모의 등급을 입력하면 총점이 자동 계산됩니다.</div>}
          <ScoreCalc rec={rec} profile={profile} ipgy={ipgy} onAddRecord={onAddRecord} modal />
        </div>
      </div>
    </div>
  )
}

// ---------- 상담일지 ----------
function ConsultLog({ records, setRecords, profile }) {
  const [open, setOpen] = useState(false)
  function remove(id) { setRecords(records.filter(r => r.id !== id)) }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ profile, records }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `상담일지_${profile.이름 || '학생'}_${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }
  function importJson(e) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => { try { const d = JSON.parse(r.result); if (Array.isArray(d.records)) setRecords(d.records) } catch {} }
    r.readAsText(f); e.target.value = ''
  }
  return (
    <div className={'log' + (open ? ' log--open' : '')}>
      <button className="log-tab" onClick={() => setOpen(o => !o)}>📋 상담일지 {records.length > 0 && <b>{records.length}</b>} {open ? '▼' : '▲'}</button>
      {open && (
        <div className="log-body">
          <div className="log-tools">
            <button onClick={exportJson}>내보내기(JSON)</button>
            <label className="log-import">불러오기<input type="file" accept="application/json" onChange={importJson} hidden /></label>
          </div>
          {records.length === 0 ? <div className="log-empty">카드의 "＋ 상담기록"으로 추가하세요.</div> : (
            <table className="log-table">
              <thead><tr><th>대학</th><th>학과</th><th>전형</th><th>총점</th><th>메모</th><th></th></tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>{r.대학}</td><td>{r.학과}</td><td className="log-jeon">{r.전형}<span className="log-t">{r.type}</span></td>
                    <td className="log-score">{r.종점 ?? '–'}</td><td className="log-memo">{r.메모}</td>
                    <td><button className="log-del" onClick={() => remove(r.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('전체')
  const [regions, setRegions] = useState([])
  const [jongmok, setJongmok] = useState([])
  const [estab, setEstab] = useState('전체')
  const [types, setTypes] = useState([])
  const [series, setSeries] = useState([])
  const [silgi, setSilgi] = useState([])
  const [gender, setGender] = useState('전체')
  const [drawerOpen, setDrawerOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000)
  const [consultRec, setConsultRec] = useState(null)

  const [profile, setProfile] = useLocalStorage('chedae_profile', EMPTY_PROFILE)
  const [records, setRecords] = useLocalStorage('chedae_records', [])
  const [gasUrl, setGasUrl] = useLocalStorage('chedae_gas_url', '')

  // 프로필 성별 → 필터 성별 동기화(최초)
  useEffect(() => {
    if (gender === '전체' && profile?.성별) setGender(profile.성별)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(list, setList, v) {
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  }
  function addRecord(r) {
    const { _profile, ...clean } = r
    const rec = { id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), ts: Date.now(), ...clean }
    setRecords(prev => [rec, ...prev])
    if (gasUrl && gasUrl.trim()) sendToSheet(gasUrl.trim(), { ...rec, _profile })
  }

  const results = useMemo(() => {
    const qq = q.trim()
    return ALL.filter(r => {
      if (type !== '전체' && r.type !== type) return false
      if (profile.성별 === '남' && isWomensUniv(r.대학)) return false
      if (regions.length && !regions.includes(regionKey(r))) return false
      if (series.length && !series.includes(seriesOf(r))) return false
      if (types.length && !types.includes(admissionType(r))) return false
      if (silgi.length && !silgi.includes(silgiBand(r))) return false
      if (estab !== '전체') {
        const e = r.국공사립 || ''
        if (estab === '국공립' && !/국|공/.test(e)) return false
        if (estab === '사립' && !/사립/.test(e)) return false
      }
      if (jongmok.length) { const tags = jongmokTags(r); if (!jongmok.every(j => tags.includes(j))) return false }
      if (qq && !(`${r.대학} ${r.학과} ${r.전형 || ''}`.includes(qq))) return false
      return true
    })
  }, [q, type, regions, jongmok, estab, types, series, silgi, profile.성별])

  const activeFilters = (regions.length || jongmok.length || type !== '전체' || estab !== '전체' || types.length || series.length || silgi.length)

  const filters = { type, setType, types, setTypes, series, setSeries, silgi, setSilgi, regions, setRegions, estab, setEstab, jongmok, setJongmok, toggle }

  return (
    <div className={'app' + (drawerOpen ? ' app--shift' : '')}>
      <header className="topbar">
        <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="필터 열기">☰</button>
        <div className="brand">🏅 체대입시 상담</div>
        <div className="topstat">{profile.이름 ? `${profile.이름}(${profile.성별})` : `총 ${ALL.length}개`}</div>
      </header>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} profile={profile} setProfile={setProfile} gasUrl={gasUrl} setGasUrl={setGasUrl} />

      <div className="main">
        <div className="search-wrap">
          <input className="search" placeholder="🔎 대학명 · 학과 · 전형 검색" value={q} onChange={e => setQ(e.target.value)} />
          <button className="filter-btn" onClick={() => setDrawerOpen(true)}>☰ 필터{activeFilters ? ' •' : ''}</button>
        </div>

        <div className="results-head">
          <b>{results.length}</b>건
          {(activeFilters || q) && (
            <button className="reset" onClick={() => { setQ(''); setType('전체'); setRegions([]); setJongmok([]); setEstab('전체'); setTypes([]); setSeries([]); setSilgi([]) }}>필터 초기화</button>
          )}
          {!profile.이름 && <span className="hint-profile">← ☰에서 학생 프로필 입력 시 총점 자동계산</span>}
        </div>

        <div className="grid">
          {results.slice(0, 120).map((r, i) => <Card key={i} rec={r} profile={profile} onAddRecord={addRecord} onOpenConsult={setConsultRec} />)}
        </div>
        {results.length > 120 && <div className="more">상위 120건 표시 중 · 검색을 좁혀주세요</div>}
      </div>

      <ConsultLog records={records} setRecords={setRecords} profile={profile} />

      {consultRec && <ConsultModal rec={consultRec} profile={profile} onClose={() => setConsultRec(null)} onAddRecord={addRecord} />}
    </div>
  )
}
