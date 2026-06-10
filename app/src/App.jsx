import React, { useMemo, useState } from 'react'
import raw from './data/admissions.json'

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

function Card({ rec }) {
  const tags = jongmokTags(rec)
  const region = rec.type === '수시' ? regionOf(rec) : `${rec.군 || ''} · ${rec.소재지 || ''}`
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
        <div><b>{rec.내신최저 ?? (rec.최저 && rec.최저 !== 'x' ? '있음' : '-')}</b><span>수능최저</span></div>
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

  function toggle(list, setList, v) {
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  }

  const results = useMemo(() => {
    const qq = q.trim()
    return ALL.filter(r => {
      if (type !== '전체' && r.type !== type) return false
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
  }, [q, type, regions, jongmok, estab, types, series, silgi])

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
        {(regions.length || jongmok.length || type !== '전체' || estab !== '전체' || types.length || series.length || silgi.length || q) ? (
          <button className="reset" onClick={() => { setQ(''); setType('전체'); setRegions([]); setJongmok([]); setEstab('전체'); setTypes([]); setSeries([]); setSilgi([]) }}>필터 초기화</button>
        ) : null}
      </div>

      <div className="grid">
        {results.slice(0, 120).map((r, i) => <Card key={i} rec={r} />)}
      </div>
      {results.length > 120 && <div className="more">상위 120건 표시 중 · 검색을 좁혀주세요</div>}
    </div>
  )
}
