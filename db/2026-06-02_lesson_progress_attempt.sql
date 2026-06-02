-- ============================================================
-- lesson_progress 회차(attempt) 모델 도입
-- 날짜당 1행 → 회차당 1행 으로 전환 (같은 Unit을 같은 날 다시 해도 누적)
-- Supabase SQL Editor 에서 그대로 실행하세요.
-- ============================================================

-- 1) attempt 컬럼 추가 (기존 행은 모두 1회차로 간주)
ALTER TABLE lesson_progress
  ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;

-- 2) (학생·시나리오·날짜) 유니크 제약이 있으면 제거
--    → 같은 날 같은 Unit을 여러 회차 누적 저장하기 위함.
--    제약 이름은 환경마다 다를 수 있으니 아래 쿼리로 확인 후 DROP.
--
--    확인:
--      SELECT conname FROM pg_constraint
--      WHERE conrelid = 'lesson_progress'::regclass AND contype = 'u';
--
--    예시(이름이 다르면 바꿔서 실행):
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'lesson_progress'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE lesson_progress DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 3) 회차 단위 유니크 제약 재설정 (한 학생이 같은 시나리오·날짜·회차에 1행)
ALTER TABLE lesson_progress
  ADD CONSTRAINT lesson_progress_attempt_uniq
  UNIQUE (student_id, scenario_id, session_date, attempt);

-- 4) 회차 통계 조회 가속용 인덱스
CREATE INDEX IF NOT EXISTS lesson_progress_student_scenario_idx
  ON lesson_progress (student_id, scenario_id);
