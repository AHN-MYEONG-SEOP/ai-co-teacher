-- ============================================================
-- 🔧 FIX: 회차(attempt) 모델 — 옛 UNIQUE 제약 제거
-- ------------------------------------------------------------
-- 증상: 마이크 화면에서 진행률 바가 안 나옴 / 두 번째 회차 시작 실패.
-- 원인: 회차 모델 도입 시 새 제약(lesson_progress_attempt_uniq)만 추가하고
--       옛 제약 lesson_progress_unique_session (student_id, scenario_id, session_date)
--       을 DROP하지 않아, 같은 날 같은 Unit을 다시 시작하면 INSERT가
--       23505(duplicate key)로 실패 → 회차 행 미생성 → progressId=null → 진행률 바 사라짐.
-- 조치: 옛 제약만 제거. 회차 단위 제약(lesson_progress_attempt_uniq)은 유지.
-- Supabase SQL Editor 에서 그대로 실행하세요.
-- ============================================================

-- 1) 옛 (학생·시나리오·날짜) 유니크 제약 제거
ALTER TABLE lesson_progress
  DROP CONSTRAINT IF EXISTS lesson_progress_unique_session;

-- 2) 혹시 제약이 아니라 유니크 인덱스로 남아 있으면 함께 제거
DROP INDEX IF EXISTS lesson_progress_unique_session;

-- 3) 확인 — 남아 있는 유니크 제약은 attempt 포함 제약 하나여야 정상
--    SELECT conname FROM pg_constraint
--    WHERE conrelid = 'lesson_progress'::regclass AND contype = 'u';
--    → lesson_progress_attempt_uniq (student_id, scenario_id, session_date, attempt)
