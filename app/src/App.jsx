import React, { useMemo, useState } from 'react'
import raw from './data/admissions.json'
import { silgiScore, silgiEventsOf, scorableUniversities } from './data/silgiScore.js'
import { univLink, ipgyeolFor } from './data/ipgyeolLookup.js'

// 채점표는 있으나 라벨 보정이 필요한 대학 (silgi_scoring.json 22개 − 즉시사용 10개).
// 이 대학들은 추후 채점 자동화 예정 → 현재는 안내만 표시.
const PENDING_SILGI_UNIVS = new Set([
  '상명대학교', '서울시립대학교', '숭실대학교', '한국외국어대학교', '남서울대학교',
  '단국대학교(천안)', '서원대학교', '선문대학교', '경상대학교', '동의대학교',
  '부경대학교', '제주대학교',
])
const SCORABLE_SET = new Set(scorableUniversities)

// ---------- 데이터 정규화 ----------
const ALL = [...raw.susi, ...raw.jeongsi]

// 지역 정규화 (캠퍼스 지명 → 큰 권역으로)
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

// 반영비율 → 숫자(%) 파싱
function parsePct(v) {
  if (v == null || v === 'x' || v === 'X') return 0
  if (typeof v === 'number') return v <= 1 ? Math.round(v * 100) : Math.round(v)
  const m = String(v).match(/(\d+(?:\.\d+)?)/)
  return m ? Math.round(parseFloat(m[1])) : 0
}

// 전형유형 분류 (수시 전형명 → 대표 유형). 우선순위: 종합>교과>실기>논술
function admissionType(rec) {
  if (rec.type === '정시') return '정시'
  const e = rec.전형 || ''
  if (/종합/.test(e)) return '학생부종합'
  if (/교과/.test(e)) return '학생부교과'
  if (/논술/.test(e)) return '논술'
  if (/실기|실적/.test(e)) return '실기위주'
  return '기타'
}
const TYPE_FILTERS = ['학생부교과', '학생부종합', '실기위주', '논술', '정시']

// 학과 계열 분류 (115개 학과명 → 6개 계열). 순서가 우선순위.
const SERIES = [
  { key: '경호·무도', pat: /경호|무도|무예|보안|태권도/ },
  { key: '체육교육', pat: /체육교육|체교|특수체육|특수교육/ },
  { key: '스포츠의학·재활', pat: /의학|재활|운동처방|건강운동|운동건강|물리치료|피트니스|한방|건강관리|운동건강|헬스케어운동/ },
  { key: '생활·레저·산업', pat: /생활체육|사회체육|레저|레져|산업|경영|마케팅|비즈니스|골프|관광|아웃도어|해양|매니지먼트|글로벌|국제|마이스/ },
  { key: '노인·복지', pat: /노인|시니어|실버|복지|청소년/ },
  { key: '스포츠과학·체육학', pat: /과학|체육학|체육과학|스포츠학|사이언스|융합|테크놀|건강|헬스|운동|스포츠|체육/ },
]
function seriesOf(rec) {
  const d = rec.학과 || ''
  for (const s of SERIES) if (s.pat.test(d)) return s.key
  return '기타'
}
const SERIES_KEYS = SERIES.map(s => s.key)

// 실기비중 구간
function silgiBand(rec) {
  const p = parsePct(rec.실기비율)
  if (p === 0) return '무실기'
  if (p <= 30) return '1~30%'
  if (p <= 50) return '31~50%'
  return '51%+'
}
const SILGI_BANDS = ['무실기', '1~30%', '31~50%', '51%+']

// 실기종목 정규화 (검색/필터용 대표 키워드)
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
  const tags = JONGMOK_KEYS.filter(j => j.pat.test(txt)).map(j => j.key)
  return tags
}

// 수능최저학력기준 — 실제 등급합은 `최저` 필드(문자열). `내신최저`(숫자)와 혼동 금지.
function suneungMin(rec) {
  const v = rec.최저
  if (!v || v === 'x' || v === 'X') return { short: '없음', full: '' }
  const s = String(v)
  const taek = (s.match(/택\s*(\d+)/) || [])[1]
  const hap = (s.match(/합\s*(\d+)/) || [])[1]
  const each = (s.match(/각\s*(\d+)등급|과목별\s*(\d+)등급/) || []).slice(1).find(Boolean)
  let short
  if (hap) short = taek ? `${taek}개 합${hap}` : `합${hap}`
  else if (each) short = `각 ${each}등급`
  else short = '있음'
  return { short, full: s }
}

// 여자대학교 식별 (남학생 상담 시 배제용)
function isWomensUniv(name) {
  return /여자대학교|여대|여자대$/.test(name || '')
}

const SUSI_REGIONS = [...new Set(ALL.map(r => bigRegion(regionOf(r))))].sort()

// ---------- UI ----------
function Chip({ active, onClick, children }) {
  return (
    <button className={'chip' + (active ? ' chip--on' : '')} onClick={onClick}>
      {children}
    </button>
  )
}

function RatioBar({ rec }) {
  const segs = rec.type === '수시'
    ? [
        ['내신', parsePct(rec.내신비율), '#3b82f6'],
        ['실기', parsePct(rec.실기비율), '#f59e0b'],
        ['면접', parsePct(rec.면접비율), '#10b981'],
        ['서류', parsePct(rec.서류비율), '#8b5cf6'],
      ]
    : [
        ['내신', parsePct(rec.내신비율), '#3b82f6'],
        ['수능', parsePct(rec.수능비율), '#ef4444'],
        ['실기', parsePct(rec.실기비율), '#f59e0b'],
        ['면접', parsePct(rec.면접비율), '#10b981'],
      ]
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
        {shown.map(([label, pct, color]) => (
          <span key={label}><i style={{ background: color }} />{label} {pct}%</span>
        ))}
      </div>
    </div>
  )
}

// 이 모집단위에 실기 전형요소가 있는지
function hasSilgi(rec) {
  if (parsePct(rec.실기비율) > 0) return true
  const jm = rec.실기종목 || []
  return jm.length > 0 && !jm.every(j => /무실기/.test(j))
}

// ---------- 실기 환산 · 종점 계산기 ----------
function SilgiCalculator({ rec }) {
  const univ = rec.대학
  const scorable = SCORABLE_SET.has(univ)
  const [gender, setGender] = useState('남')
  const [records, setRecords] = useState({})  // { 종목: 입력문자열 }
  const [naesin, setNaesin] = useState('')     // 내신 환산점수 (0~100, 선택입력)
  const [suneung, setSuneung] = useState('')   // 수능 환산점수 (0~100, 선택입력)

  // 이 대학·성별에 채점 가능한 종목 (성별무관(null) 포함, 종목명으로 중복제거)
  const events = useMemo(() => {
    if (!scorable) return []
    const all = silgiEventsOf(univ).filter(e => e.성별 === gender || e.성별 == null)
    const map = new Map()
    for (const e of all) if (!map.has(e.종목)) map.set(e.종목, e)
    return [...map.values()]
  }, [univ, gender, scorable])

  if (!scorable) {
    const pending = PENDING_SILGI_UNIVS.has(univ)
    return (
      <div className="silgi-box silgi-box--na">
        <div className="silgi-na">
          {pending
            ? '🛠 이 대학 채점표는 보유했으나 라벨 보정 작업 중 — 자동 환산은 추후 지원 예정입니다. 현재는 수기 계산이 필요합니다.'
            : '📄 이 대학의 실기 채점표는 아직 미보유 — 자동 환산을 지원하지 않습니다. 모집요강의 채점 기준으로 수기 계산하세요.'}
        </div>
      </div>
    )
  }

  // 종목별 환산점수
  const scored = events.map(ev => {
    const v = records[ev.종목] ?? ''
    const num = v === '' ? null : parseFloat(v)
    const r = num == null || isNaN(num) ? null : silgiScore(univ, gender, ev.종목, num)
    return { 종목: ev.종목, dir: ev.dir, input: v, score: r && r.ok ? r.score : null }
  })
  const got = scored.filter(s => s.score != null).map(s => s.score)
  const silgiAvg = got.length ? Math.round((got.reduce((a, b) => a + b, 0) / got.length) * 10) / 10 : null

  // 종점(환산총점) 추정 — 영역환산 × 반영비율 가중합
  const wSilgi = parsePct(rec.실기비율)
  const wNaesin = parsePct(rec.내신비율)
  const wSuneung = parsePct(rec.수능비율)
  const parts = []
  if (wSilgi > 0 && silgiAvg != null) parts.push(['실기', silgiAvg, wSilgi])
  if (wNaesin > 0 && naesin !== '' && !isNaN(parseFloat(naesin))) parts.push(['내신', parseFloat(naesin), wNaesin])
  if (wSuneung > 0 && suneung !== '' && !isNaN(parseFloat(suneung))) parts.push(['수능', parseFloat(suneung), wSuneung])
  const jongjeom = parts.length ? Math.round(parts.reduce((a, [, val, p]) => a + (val * p) / 100, 0) * 10) / 10 : null
  const coveredPct = parts.reduce((a, [, , p]) => a + p, 0)
  const totalWeight = wSilgi + wNaesin + wSuneung

  return (
    <div className="silgi-box">
      <div className="silgi-gender">
        <span className="silgi-label">성별</span>
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
              <input
                className="silgi-input" type="number" inputMode="decimal" placeholder="기록"
                value={records[ev.종목] ?? ''}
                onChange={e => setRecords(p => ({ ...p, [ev.종목]: e.target.value }))}
              />
              <span className={'silgi-score' + (s && s.score != null ? ' silgi-score--on' : '')}>
                {s && s.input !== '' ? (s.score != null ? `${s.score}점` : '범위밖') : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {silgiAvg != null && (
        <div className="silgi-avg">실기 평균 환산 <b>{silgiAvg}</b>점 <span className="muted">({got.length}종목 기준)</span></div>
      )}

      {(wNaesin > 0 || wSuneung > 0) && (
        <div className="silgi-extra">
          <span className="silgi-label">종점 추정용 (선택)</span>
          {wNaesin > 0 && (
            <span className="silgi-extra-in">내신환산<input className="silgi-input silgi-input--xs" type="number" placeholder="0~100" value={naesin} onChange={e => setNaesin(e.target.value)} /></span>
          )}
          {wSuneung > 0 && (
            <span className="silgi-extra-in">수능환산<input className="silgi-input silgi-input--xs" type="number" placeholder="0~100" value={suneung} onChange={e => setSuneung(e.target.value)} /></span>
          )}
        </div>
      )}

      {jongjeom != null && (
        <div className="silgi-jong">
          <div className="silgi-jong-head">종점(환산총점) 추정 <b>{jongjeom}</b><span className="muted"> / 100</span></div>
          <div className="silgi-jong-detail">
            {parts.map(([k, val, p]) => <span key={k}>{k} {val}×{p}%</span>)}
            {coveredPct < totalWeight && <span className="silgi-warn">· 미입력 영역 {totalWeight - coveredPct}% 제외 (참고치)</span>}
          </div>
        </div>
      )}
      <div className="silgi-foot">※ 환산표는 2027 실기자료집 기준. 실기 평균은 입력 종목 단순평균이며 대학 공식 합산식과 다를 수 있습니다.</div>
    </div>
  )
}

// ---------- 어디가 전년 입시결과 ----------
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
      <div className="ipg-foot">※ 어디가 전년도(2026) 입시결과 · 충원순위=마지막 추가합격 순위 · 80/90/100%컷은 대학 선택공개</div>
    </div>
  )
}

function Card({ rec }) {
  const tags = jongmokTags(rec)
  const [openCalc, setOpenCalc] = useState(false)
  const [openIpg, setOpenIpg] = useState(false)
  const showSilgi = hasSilgi(rec)
  const region = rec.type === '수시' ? regionOf(rec) : `${rec.군 || ''} · ${rec.소재지 || ''}`
  const sm = suneungMin(rec)
  const scorable = SCORABLE_SET.has(rec.대학)
  const pending = PENDING_SILGI_UNIVS.has(rec.대학)
  const link = univLink(rec.대학)
  const ipgy = ipgyeolFor(rec.대학, rec.학과, rec.type)
  return (
    <div className="card">
      <div className="card-top">
        <div>
          <div className="card-uni">{rec.대학}</div>
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
        <div><b>{rec.국공사립 || (rec.type === '정시' ? '-' : '-')}</b><span>설립</span></div>
      </div>

      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      {rec.변경사항 && rec.변경사항 !== 'x' && (
        <div className="card-note">📌 {String(rec.변경사항).slice(0, 80)}</div>
      )}

      {link && (link.입시홈페이지 || link.홈페이지) && (
        <div className="card-links">
          {link.입시홈페이지 && (
            <a className="ext-link ext-ipsi" href={/^https?:/.test(link.입시홈페이지) ? link.입시홈페이지 : 'https://' + link.입시홈페이지} target="_blank" rel="noreferrer">🎓 입시홈페이지(환산표)</a>
          )}
          {link.홈페이지 && (
            <a className="ext-link" href={/^https?:/.test(link.홈페이지) ? link.홈페이지 : 'https://' + link.홈페이지} target="_blank" rel="noreferrer">🏫 홈페이지</a>
          )}
        </div>
      )}

      {ipgy && (
        <>
          <button className="ipg-toggle" onClick={() => setOpenIpg(o => !o)}>
            📊 어디가 전년 입시결과 · 충원 {openIpg ? '▲' : '▼'}
          </button>
          {openIpg && <IpgyeolBlock rows={ipgy} />}
        </>
      )}

      {showSilgi && (
        <>
          <button
            className={'silgi-toggle' + (scorable ? '' : pending ? ' silgi-toggle--pending' : ' silgi-toggle--na')}
            onClick={() => setOpenCalc(o => !o)}
          >
            🎯 실기 환산 · 종점 계산
            {!scorable && (pending ? ' (보정 중)' : ' (채점표 미보유)')} {openCalc ? '▲' : '▼'}
          </button>
          {openCalc && <SilgiCalculator rec={rec} />}
        </>
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
  const [types, setTypes] = useState([])      // 전형유형
  const [series, setSeries] = useState([])    // 학과 계열
  const [silgi, setSilgi] = useState([])      // 실기비중
  const [gender, setGender] = useState('전체') // 학생 성별 (남 → 여대 배제)

  function toggle(list, setList, v) {
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  }

  const results = useMemo(() => {
    const qq = q.trim()
    return ALL.filter(r => {
      if (type !== '전체' && r.type !== type) return false
      if (gender === '남' && isWomensUniv(r.대학)) return false
      if (regions.length && !regions.includes(bigRegion(regionOf(r)))) return false
      if (series.length && !series.includes(seriesOf(r))) return false
      if (types.length && !types.includes(admissionType(r))) return false
      if (silgi.length && !silgi.includes(silgiBand(r))) return false
      if (estab !== '전체') {
        const e = r.국공사립 || ''
        if (estab === '국공립' && !/국|공/.test(e)) return false
        if (estab === '사립' && !/사립/.test(e)) return false
      }
      if (jongmok.length) {
        const tags = jongmokTags(r)
        if (!jongmok.every(j => tags.includes(j))) return false
      }
      if (qq && !(`${r.대학} ${r.학과} ${r.전형 || ''}`.includes(qq))) return false
      return true
    })
  }, [q, type, regions, jongmok, estab, types, series, silgi, gender])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🏅 체대입시 상담 <span className="brand-sub">검색 · 카드 시안</span></div>
        <div className="topstat">총 <b>{ALL.length}</b>개 모집단위 · 수시 {raw.susi.length} / 정시 {raw.jeongsi.length}</div>
      </header>

      <div className="search-wrap">
        <input
          className="search"
          placeholder="🔎 대학명 · 학과 · 전형 검색 (예: 고려대, 경호, 실기)"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="filters">
        <div className="filter-group">
          <span className="filter-label">학생 성별</span>
          {['전체', '남', '여'].map(g => (
            <Chip key={g} active={gender === g} onClick={() => setGender(g)}>{g === '남' ? '남(여대 제외)' : g}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">모집시기</span>
          {['전체', '수시', '정시'].map(t => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>{t}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">전형유형</span>
          {TYPE_FILTERS.map(t => (
            <Chip key={t} active={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>{t}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">학과계열</span>
          {SERIES_KEYS.map(s => (
            <Chip key={s} active={series.includes(s)} onClick={() => toggle(series, setSeries, s)}>{s}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">실기비중</span>
          {SILGI_BANDS.map(s => (
            <Chip key={s} active={silgi.includes(s)} onClick={() => toggle(silgi, setSilgi, s)}>{s}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">지역</span>
          {SUSI_REGIONS.map(r => (
            <Chip key={r} active={regions.includes(r)} onClick={() => toggle(regions, setRegions, r)}>{r}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">설립</span>
          {['전체', '국공립', '사립'].map(e => (
            <Chip key={e} active={estab === e} onClick={() => setEstab(e)}>{e}</Chip>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">실기종목</span>
          {JONGMOK_KEYS.map(j => (
            <Chip key={j.key} active={jongmok.includes(j.key)} onClick={() => toggle(jongmok, setJongmok, j.key)}>{j.key}</Chip>
          ))}
        </div>
      </div>

      <div className="results-head">
        <b>{results.length}</b>건 검색됨
        {(regions.length || jongmok.length || type !== '전체' || estab !== '전체' || types.length || series.length || silgi.length || gender !== '전체' || q) ? (
          <button className="reset" onClick={() => { setQ(''); setType('전체'); setRegions([]); setJongmok([]); setEstab('전체'); setTypes([]); setSeries([]); setSilgi([]); setGender('전체') }}>필터 초기화</button>
        ) : null}
      </div>

      <div className="grid">
        {results.slice(0, 120).map((r, i) => <Card key={i} rec={r} />)}
      </div>
      {results.length > 120 && <div className="more">상위 120건 표시 중 · 검색을 좁혀주세요</div>}
    </div>
  )
}
