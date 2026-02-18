-- Migration 025: status em full_gap_instances (CAUSE_PENDING / CAUSE_CLASSIFIED)

ALTER TABLE public.full_gap_instances
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CAUSE_PENDING'
  CHECK (status IN ('CAUSE_PENDING', 'CAUSE_CLASSIFIED'));

CREATE INDEX IF NOT EXISTS ix_full_gap_instances_status ON public.full_gap_instances(status)
  WHERE status = 'CAUSE_PENDING';
