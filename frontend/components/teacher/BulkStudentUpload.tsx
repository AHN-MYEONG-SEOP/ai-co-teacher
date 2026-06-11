'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

interface StudentRow {
  id: string
  name: string
  nickname: string
  className: string
  password: string
}

interface Result {
  id: string
  name: string
  status: 'success' | 'fail'
  error?: string
}

export function BulkStudentUpload() {
  const [preview, setPreview] = useState<StudentRow[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const downloadSample = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['아이디', '이름', '닉네임', '반', '비밀번호'],
      ['minsu123', '김민수', 'Minsu', '33', 'sda3605'],
      ['jullia456', '김태은', 'Jullia', '34', 'sda3605'],
      ['samsick789', '삼식이', 'Samsick', '33', ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '학생목록')
    XLSX.writeFile(wb, '학생등록_샘플.xlsx')
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResults([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })
        const students: StudentRow[] = rows.slice(1)
          .filter((r: any) => r[0] && r[1])
          .map((r: any) => ({
            id: String(r[0] || '').trim(),
            name: String(r[1] || '').trim(),
            nickname: String(r[2] || '').trim(),
            className: String(r[3] || '').trim(),
            password: String(r[4] || '').trim(),
          }))
        setPreview(students)
      } catch {
        setError('엑셀 파일을 읽을 수 없습니다.')
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleUpload = async () => {
    if (preview.length === 0) return
    setLoading(true)
    setResults([])
    try {
      const res = await fetch('/api/teacher/bulk-create-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: preview }),
      })
      const data = await res.json()
      setResults(data.results || [])
      setPreview([])
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('업로드 실패')
    } finally {
      setLoading(false)
    }
  }

  const successCount = results.filter(r => r.status === 'success').length
  const failCount = results.filter(r => r.status === 'fail').length

  return (
    <div className="space-y-4">
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-slate-300 mb-2">📋 엑셀 형식 (첫 행은 헤더)</p>
        <p>A열: 아이디 (예: minsu123 → minsu123@sda.ac 자동 추가)</p>
        <p>B열: 이름 (예: 김민수)</p>
        <p>C열: 닉네임 (예: Minsu, 없으면 이름 사용)</p>
        <p>D열: 반 이름 (예: 33, 없으면 미배정)</p>
        <p>E열: 비밀번호 (없으면 sda3605 기본값)</p>
      </div>

      <button
        onClick={downloadSample}
        className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2 text-sm font-medium transition-colors"
      >
        📥 샘플 엑셀 다운로드
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFile}
        className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-emerald-700 file:text-white hover:file:bg-emerald-600 cursor-pointer"
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {preview.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-slate-300 font-medium">📊 미리보기 ({preview.length}명)</p>
          <div className="bg-slate-800 rounded-xl overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700 sticky top-0 bg-slate-800">
                  <th className="text-left p-2 text-slate-400">아이디</th>
                  <th className="text-left p-2 text-slate-400">이름</th>
                  <th className="text-left p-2 text-slate-400">닉네임</th>
                  <th className="text-left p-2 text-slate-400">반</th>
                  <th className="text-left p-2 text-slate-400">비밀번호</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="p-2 text-white">{s.id}@sda.ac</td>
                    <td className="p-2 text-white">{s.name}</td>
                    <td className="p-2 text-slate-300">{s.nickname || s.name}</td>
                    <td className="p-2 text-slate-300">{s.className || '미배정'}</td>
                    <td className="p-2 text-slate-400">{s.password || 'sda3605'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleUpload}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            {loading ? '등록 중...' : '✅ ' + preview.length + '명 일괄 등록'}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            <span className="text-emerald-400">✅ 성공 {successCount}명</span>
            {failCount > 0 && <span className="text-red-400 ml-3">❌ 실패 {failCount}명</span>}
          </p>
          <div className="bg-slate-800 rounded-xl overflow-auto max-h-48">
            <table className="w-full text-xs">
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="p-2 text-slate-300">{r.name}</td>
                    <td className="p-2 text-slate-400">{r.id}@sda.ac</td>
                    <td className="p-2">
                      {r.status === 'success'
                        ? <span className="text-emerald-400">✅ 성공</span>
                        : <span className="text-red-400">❌ {r.error?.includes('already') ? '이미 존재' : '실패'}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
