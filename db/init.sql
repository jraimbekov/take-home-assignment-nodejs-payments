-- ============================================================
-- Schema & Seed Data — Commission Reporting Take-Home
-- ============================================================
-- This file is mounted into PostgreSQL via Docker Compose and
-- runs automatically on first container start.
--
-- DATA DESIGN NOTES (for evaluators, not candidates):
--   - 25 commissions across 3 teams, all 4 statuses
--   - 2–3 allocations per commission, all 3 party types represented
--   - Close dates span 2025-01 through 2025-04 so candidates can
--     test date range filtering across months
--   - Known totals for 2025-03 / team_alpha:
--       5 commissions, totalGciCents = 2_850_000
--   - Known totals for 2025-03 / all teams:
--       9 commissions, totalGciCents = 5_200_000
--   - At least one month (2025-02) has no 'draft' commissions,
--     so candidates must handle zero-count statuses
--   - Allocations always sum to 100% of the commission total
-- ============================================================

-- Clean slate (idempotent re-runs during development)
DROP TABLE IF EXISTS allocations CASCADE;
DROP TABLE IF EXISTS commissions CASCADE;

-- -----------------------------------------------------------
-- Tables
-- -----------------------------------------------------------

CREATE TABLE commissions (
  id          UUID PRIMARY KEY,
  team_id     UUID NOT NULL,
  status      VARCHAR(30) NOT NULL
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'finalized')),
  close_date  DATE NOT NULL,
  total_cents BIGINT NOT NULL,
  currency    VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE allocations (
  id            UUID PRIMARY KEY,
  commission_id UUID NOT NULL REFERENCES commissions(id),
  party_id      UUID NOT NULL,
  party_type    VARCHAR(30) NOT NULL
    CHECK (party_type IN ('team_member', 'external_agent', 'brokerage')),
  percentage    NUMERIC(6,4) NOT NULL,
  amount_cents  BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------
-- These indexes back the access patterns used by the reporting API.
-- See README "Query approach and indexes" for the rationale per index.
--
--   1. (close_date DESC, id DESC) — primary list ordering AND the
--      keyset cursor comparison `(close_date, id) < (cursor.closeDate,
--      cursor.id)`. This is the index every list-page request hits.
--
--   2. (team_id, close_date DESC) — most common filtered list shape
--      ("a team's recent commissions"). Composite leads with team_id
--      because it is highly selective; close_date narrows within the
--      team and supports range scans.
--
--   3. (status) — low cardinality (4 values) but useful when status is
--      the only filter, and cheap.
--
--   4. (commission_id) on allocations — required for the eager-loading
--      JOIN in the list and the summary's INNER JOIN by commission_id.
--      Postgres does NOT auto-index referencing columns of foreign keys,
--      so this is a real correctness/perf concern, not a hint.
-- -----------------------------------------------------------

CREATE INDEX idx_commissions_close_date_id
  ON commissions (close_date DESC, id DESC);

CREATE INDEX idx_commissions_team_close_date
  ON commissions (team_id, close_date DESC);

CREATE INDEX idx_commissions_status
  ON commissions (status);

CREATE INDEX idx_allocations_commission_id
  ON allocations (commission_id);

-- -----------------------------------------------------------
-- Reusable IDs
-- -----------------------------------------------------------

-- Teams
-- team_alpha:   a1a1a1a1-0000-4000-8000-000000000001
-- team_bravo:   b2b2b2b2-0000-4000-8000-000000000002
-- team_charlie: c3c3c3c3-0000-4000-8000-000000000003

-- Parties (agents / brokerages)
-- agent_1:      d4d4d4d4-0000-4000-8000-000000000001
-- agent_2:      d4d4d4d4-0000-4000-8000-000000000002
-- agent_3:      d4d4d4d4-0000-4000-8000-000000000003
-- agent_4:      d4d4d4d4-0000-4000-8000-000000000004
-- ext_agent_1:  e5e5e5e5-0000-4000-8000-000000000001
-- ext_agent_2:  e5e5e5e5-0000-4000-8000-000000000002
-- brokerage_1:  f6f6f6f6-0000-4000-8000-000000000001

-- -----------------------------------------------------------
-- Seed: January 2025 (5 commissions)
-- -----------------------------------------------------------

-- C01: team_alpha, finalized, $5,000.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-01-10', 500000, 'USD', '2025-01-08 10:00:00Z', '2025-01-10 14:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0001-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.5000, 250000, '2025-01-08 10:00:00Z'),
  ('20000000-0001-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 150000, '2025-01-08 10:00:00Z'),
  ('20000000-0001-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 100000, '2025-01-08 10:00:00Z');

-- C02: team_alpha, finalized, $3,200.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-01-22', 320000, 'USD', '2025-01-20 09:00:00Z', '2025-01-22 16:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0002-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.6000, 192000, '2025-01-20 09:00:00Z'),
  ('20000000-0002-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4000, 128000, '2025-01-20 09:00:00Z');

-- C03: team_bravo, approved, $7,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000003', 'b2b2b2b2-0000-4000-8000-000000000002', 'approved', '2025-01-15', 750000, 'USD', '2025-01-12 11:00:00Z', '2025-01-15 10:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0003-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'd4d4d4d4-0000-4000-8000-000000000003', 'team_member',    0.5500, 412500, '2025-01-12 11:00:00Z'),
  ('20000000-0003-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.2500, 187500, '2025-01-12 11:00:00Z'),
  ('20000000-0003-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 150000, '2025-01-12 11:00:00Z');

-- C04: team_bravo, pending_approval, $4,100.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000004', 'b2b2b2b2-0000-4000-8000-000000000002', 'pending_approval', '2025-01-28', 410000, 'USD', '2025-01-25 14:00:00Z', '2025-01-28 09:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0004-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.6000, 246000, '2025-01-25 14:00:00Z'),
  ('20000000-0004-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4000, 164000, '2025-01-25 14:00:00Z');

-- C05: team_charlie, finalized, $12,000.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000005', 'c3c3c3c3-0000-4000-8000-000000000003', 'finalized', '2025-01-30', 1200000, 'USD', '2025-01-27 08:00:00Z', '2025-01-30 17:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0005-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'd4d4d4d4-0000-4000-8000-000000000004', 'team_member',    0.5000, 600000, '2025-01-27 08:00:00Z'),
  ('20000000-0005-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 360000, '2025-01-27 08:00:00Z'),
  ('20000000-0005-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 240000, '2025-01-27 08:00:00Z');


-- -----------------------------------------------------------
-- Seed: February 2025 (5 commissions — NOTE: no 'draft' status this month)
-- -----------------------------------------------------------

-- C06: team_alpha, finalized, $6,800.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-02-05', 680000, 'USD', '2025-02-03 10:00:00Z', '2025-02-05 15:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0006-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.5000, 340000, '2025-02-03 10:00:00Z'),
  ('20000000-0006-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.3000, 204000, '2025-02-03 10:00:00Z'),
  ('20000000-0006-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 136000, '2025-02-03 10:00:00Z');

-- C07: team_alpha, approved, $4,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000007', 'a1a1a1a1-0000-4000-8000-000000000001', 'approved', '2025-02-14', 450000, 'USD', '2025-02-12 09:00:00Z', '2025-02-14 11:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0007-4000-8000-000000000001', '10000000-0000-4000-8000-000000000007', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.7000, 315000, '2025-02-12 09:00:00Z'),
  ('20000000-0007-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.3000, 135000, '2025-02-12 09:00:00Z');

-- C08: team_bravo, finalized, $9,200.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000008', 'b2b2b2b2-0000-4000-8000-000000000002', 'finalized', '2025-02-18', 920000, 'USD', '2025-02-15 13:00:00Z', '2025-02-18 16:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0008-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008', 'd4d4d4d4-0000-4000-8000-000000000003', 'team_member',    0.5000, 460000, '2025-02-15 13:00:00Z'),
  ('20000000-0008-4000-8000-000000000002', '10000000-0000-4000-8000-000000000008', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 276000, '2025-02-15 13:00:00Z'),
  ('20000000-0008-4000-8000-000000000003', '10000000-0000-4000-8000-000000000008', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 184000, '2025-02-15 13:00:00Z');

-- C09: team_bravo, pending_approval, $3,300.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000009', 'b2b2b2b2-0000-4000-8000-000000000002', 'pending_approval', '2025-02-22', 330000, 'USD', '2025-02-20 10:00:00Z', '2025-02-22 12:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0009-4000-8000-000000000001', '10000000-0000-4000-8000-000000000009', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.6000, 198000, '2025-02-20 10:00:00Z'),
  ('20000000-0009-4000-8000-000000000002', '10000000-0000-4000-8000-000000000009', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.2500, 82500,  '2025-02-20 10:00:00Z'),
  ('20000000-0009-4000-8000-000000000003', '10000000-0000-4000-8000-000000000009', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.1500, 49500,  '2025-02-20 10:00:00Z');

-- C10: team_charlie, approved, $5,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000010', 'c3c3c3c3-0000-4000-8000-000000000003', 'approved', '2025-02-27', 550000, 'USD', '2025-02-25 08:00:00Z', '2025-02-27 10:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0010-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', 'd4d4d4d4-0000-4000-8000-000000000004', 'team_member',    0.5500, 302500, '2025-02-25 08:00:00Z'),
  ('20000000-0010-4000-8000-000000000002', '10000000-0000-4000-8000-000000000010', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4500, 247500, '2025-02-25 08:00:00Z');


-- -----------------------------------------------------------
-- Seed: March 2025 (9 commissions — primary month for assertions)
-- -----------------------------------------------------------

-- C11: team_alpha, finalized, $8,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000011', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-03-05', 850000, 'USD', '2025-03-02 10:00:00Z', '2025-03-05 14:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0011-4000-8000-000000000001', '10000000-0000-4000-8000-000000000011', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.5000, 425000, '2025-03-02 10:00:00Z'),
  ('20000000-0011-4000-8000-000000000002', '10000000-0000-4000-8000-000000000011', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 255000, '2025-03-02 10:00:00Z'),
  ('20000000-0011-4000-8000-000000000003', '10000000-0000-4000-8000-000000000011', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 170000, '2025-03-02 10:00:00Z');

-- C12: team_alpha, finalized, $6,200.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000012', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-03-12', 620000, 'USD', '2025-03-10 09:00:00Z', '2025-03-12 11:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0012-4000-8000-000000000001', '10000000-0000-4000-8000-000000000012', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.6000, 372000, '2025-03-10 09:00:00Z'),
  ('20000000-0012-4000-8000-000000000002', '10000000-0000-4000-8000-000000000012', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4000, 248000, '2025-03-10 09:00:00Z');

-- C13: team_alpha, approved, $5,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000013', 'a1a1a1a1-0000-4000-8000-000000000001', 'approved', '2025-03-18', 550000, 'USD', '2025-03-16 14:00:00Z', '2025-03-18 09:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0013-4000-8000-000000000001', '10000000-0000-4000-8000-000000000013', 'd4d4d4d4-0000-4000-8000-000000000003', 'team_member',    0.5000, 275000, '2025-03-16 14:00:00Z'),
  ('20000000-0013-4000-8000-000000000002', '10000000-0000-4000-8000-000000000013', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.3000, 165000, '2025-03-16 14:00:00Z'),
  ('20000000-0013-4000-8000-000000000003', '10000000-0000-4000-8000-000000000013', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 110000, '2025-03-16 14:00:00Z');

-- C14: team_alpha, pending_approval, $4,000.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000014', 'a1a1a1a1-0000-4000-8000-000000000001', 'pending_approval', '2025-03-22', 400000, 'USD', '2025-03-20 10:00:00Z', '2025-03-22 15:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0014-4000-8000-000000000001', '10000000-0000-4000-8000-000000000014', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.6000, 240000, '2025-03-20 10:00:00Z'),
  ('20000000-0014-4000-8000-000000000002', '10000000-0000-4000-8000-000000000014', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.2500, 100000, '2025-03-20 10:00:00Z'),
  ('20000000-0014-4000-8000-000000000003', '10000000-0000-4000-8000-000000000014', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.1500, 60000,  '2025-03-20 10:00:00Z');

-- C15: team_alpha, draft, $4,300.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000015', 'a1a1a1a1-0000-4000-8000-000000000001', 'draft', '2025-03-28', 430000, 'USD', '2025-03-26 11:00:00Z', '2025-03-28 09:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0015-4000-8000-000000000001', '10000000-0000-4000-8000-000000000015', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.5500, 236500, '2025-03-26 11:00:00Z'),
  ('20000000-0015-4000-8000-000000000002', '10000000-0000-4000-8000-000000000015', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4500, 193500, '2025-03-26 11:00:00Z');

-- C16: team_bravo, finalized, $10,500.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000016', 'b2b2b2b2-0000-4000-8000-000000000002', 'finalized', '2025-03-08', 1050000, 'USD', '2025-03-05 08:00:00Z', '2025-03-08 17:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0016-4000-8000-000000000001', '10000000-0000-4000-8000-000000000016', 'd4d4d4d4-0000-4000-8000-000000000003', 'team_member',    0.5000, 525000, '2025-03-05 08:00:00Z'),
  ('20000000-0016-4000-8000-000000000002', '10000000-0000-4000-8000-000000000016', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.3000, 315000, '2025-03-05 08:00:00Z'),
  ('20000000-0016-4000-8000-000000000003', '10000000-0000-4000-8000-000000000016', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 210000, '2025-03-05 08:00:00Z');

-- C17: team_bravo, approved, $3,800.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000017', 'b2b2b2b2-0000-4000-8000-000000000002', 'approved', '2025-03-20', 380000, 'USD', '2025-03-18 13:00:00Z', '2025-03-20 10:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0017-4000-8000-000000000001', '10000000-0000-4000-8000-000000000017', 'd4d4d4d4-0000-4000-8000-000000000004', 'team_member',    0.6000, 228000, '2025-03-18 13:00:00Z'),
  ('20000000-0017-4000-8000-000000000002', '10000000-0000-4000-8000-000000000017', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4000, 152000, '2025-03-18 13:00:00Z');

-- C18: team_charlie, finalized, $7,200.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000018', 'c3c3c3c3-0000-4000-8000-000000000003', 'finalized', '2025-03-14', 720000, 'USD', '2025-03-11 09:00:00Z', '2025-03-14 16:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0018-4000-8000-000000000001', '10000000-0000-4000-8000-000000000018', 'd4d4d4d4-0000-4000-8000-000000000004', 'team_member',    0.5000, 360000, '2025-03-11 09:00:00Z'),
  ('20000000-0018-4000-8000-000000000002', '10000000-0000-4000-8000-000000000018', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 216000, '2025-03-11 09:00:00Z'),
  ('20000000-0018-4000-8000-000000000003', '10000000-0000-4000-8000-000000000018', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 144000, '2025-03-11 09:00:00Z');

-- C19: team_charlie, draft, $2,200.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000019', 'c3c3c3c3-0000-4000-8000-000000000003', 'draft', '2025-03-25', 220000, 'USD', '2025-03-23 15:00:00Z', '2025-03-25 08:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0019-4000-8000-000000000001', '10000000-0000-4000-8000-000000000019', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.7000, 154000, '2025-03-23 15:00:00Z'),
  ('20000000-0019-4000-8000-000000000002', '10000000-0000-4000-8000-000000000019', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.3000, 66000,  '2025-03-23 15:00:00Z');


-- -----------------------------------------------------------
-- Seed: April 2025 (6 commissions)
-- -----------------------------------------------------------

-- C20: team_alpha, finalized, $9,100.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000020', 'a1a1a1a1-0000-4000-8000-000000000001', 'finalized', '2025-04-03', 910000, 'USD', '2025-04-01 10:00:00Z', '2025-04-03 14:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0020-4000-8000-000000000001', '10000000-0000-4000-8000-000000000020', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.5000, 455000, '2025-04-01 10:00:00Z'),
  ('20000000-0020-4000-8000-000000000002', '10000000-0000-4000-8000-000000000020', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.3000, 273000, '2025-04-01 10:00:00Z'),
  ('20000000-0020-4000-8000-000000000003', '10000000-0000-4000-8000-000000000020', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 182000, '2025-04-01 10:00:00Z');

-- C21: team_alpha, draft, $3,600.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000021', 'a1a1a1a1-0000-4000-8000-000000000001', 'draft', '2025-04-10', 360000, 'USD', '2025-04-08 09:00:00Z', '2025-04-10 11:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0021-4000-8000-000000000001', '10000000-0000-4000-8000-000000000021', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.6000, 216000, '2025-04-08 09:00:00Z'),
  ('20000000-0021-4000-8000-000000000002', '10000000-0000-4000-8000-000000000021', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.4000, 144000, '2025-04-08 09:00:00Z');

-- C22: team_bravo, pending_approval, $5,800.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000022', 'b2b2b2b2-0000-4000-8000-000000000002', 'pending_approval', '2025-04-15', 580000, 'USD', '2025-04-12 14:00:00Z', '2025-04-15 09:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0022-4000-8000-000000000001', '10000000-0000-4000-8000-000000000022', 'd4d4d4d4-0000-4000-8000-000000000003', 'team_member',    0.5000, 290000, '2025-04-12 14:00:00Z'),
  ('20000000-0022-4000-8000-000000000002', '10000000-0000-4000-8000-000000000022', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 174000, '2025-04-12 14:00:00Z'),
  ('20000000-0022-4000-8000-000000000003', '10000000-0000-4000-8000-000000000022', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 116000, '2025-04-12 14:00:00Z');

-- C23: team_bravo, finalized, $11,000.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000023', 'b2b2b2b2-0000-4000-8000-000000000002', 'finalized', '2025-04-20', 1100000, 'USD', '2025-04-17 08:00:00Z', '2025-04-20 17:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0023-4000-8000-000000000001', '10000000-0000-4000-8000-000000000023', 'd4d4d4d4-0000-4000-8000-000000000001', 'team_member',    0.5500, 605000, '2025-04-17 08:00:00Z'),
  ('20000000-0023-4000-8000-000000000002', '10000000-0000-4000-8000-000000000023', 'e5e5e5e5-0000-4000-8000-000000000002', 'external_agent', 0.2500, 275000, '2025-04-17 08:00:00Z'),
  ('20000000-0023-4000-8000-000000000003', '10000000-0000-4000-8000-000000000023', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 220000, '2025-04-17 08:00:00Z');

-- C24: team_charlie, approved, $4,800.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000024', 'c3c3c3c3-0000-4000-8000-000000000003', 'approved', '2025-04-22', 480000, 'USD', '2025-04-20 10:00:00Z', '2025-04-22 12:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0024-4000-8000-000000000001', '10000000-0000-4000-8000-000000000024', 'd4d4d4d4-0000-4000-8000-000000000004', 'team_member',    0.5000, 240000, '2025-04-20 10:00:00Z'),
  ('20000000-0024-4000-8000-000000000002', '10000000-0000-4000-8000-000000000024', 'e5e5e5e5-0000-4000-8000-000000000001', 'external_agent', 0.3000, 144000, '2025-04-20 10:00:00Z'),
  ('20000000-0024-4000-8000-000000000003', '10000000-0000-4000-8000-000000000024', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.2000, 96000,  '2025-04-20 10:00:00Z');

-- C25: team_charlie, draft, $2,900.00
INSERT INTO commissions (id, team_id, status, close_date, total_cents, currency, created_at, updated_at)
VALUES ('10000000-0000-4000-8000-000000000025', 'c3c3c3c3-0000-4000-8000-000000000003', 'draft', '2025-04-28', 290000, 'USD', '2025-04-26 13:00:00Z', '2025-04-28 08:00:00Z');

INSERT INTO allocations (id, commission_id, party_id, party_type, percentage, amount_cents, created_at) VALUES
  ('20000000-0025-4000-8000-000000000001', '10000000-0000-4000-8000-000000000025', 'd4d4d4d4-0000-4000-8000-000000000002', 'team_member',    0.7000, 203000, '2025-04-26 13:00:00Z'),
  ('20000000-0025-4000-8000-000000000002', '10000000-0000-4000-8000-000000000025', 'f6f6f6f6-0000-4000-8000-000000000001', 'brokerage',      0.3000, 87000,  '2025-04-26 13:00:00Z');


-- -----------------------------------------------------------
-- Reference totals for evaluators (do NOT send to candidates)
-- -----------------------------------------------------------
-- These are the known-good values evaluators can use to verify
-- candidate submissions produce correct results.
--
-- ┌─────────────────────────────────────────────────────────┐
-- │ March 2025 — All teams                                 │
-- ├─────────────────────────────────────────────────────────┤
-- │ Total commissions:  9                                  │
-- │ Total GCI (cents):  5,220,000                          │
-- │                                                        │
-- │ By status:                                             │
-- │   draft:             2 commissions,    650,000 cents   │
-- │   pending_approval:  1 commission,     400,000 cents   │
-- │   approved:          2 commissions,    930,000 cents   │
-- │   finalized:         4 commissions,  3,240,000 cents   │
-- │                                                        │
-- │ By party type:                                         │
-- │   team_member:      9 allocations,  2,815,500 cents    │
-- │   external_agent:   5 allocations,  1,051,000 cents    │
-- │   brokerage:        9 allocations,  1,353,500 cents    │
-- └─────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────┐
-- │ March 2025 — team_alpha only                           │
-- ├─────────────────────────────────────────────────────────┤
-- │ Total commissions:  5                                  │
-- │ Total GCI (cents):  2,850,000                          │
-- │                                                        │
-- │ By status:                                             │
-- │   draft:             1 commission,     430,000 cents   │
-- │   pending_approval:  1 commission,     400,000 cents   │
-- │   approved:          1 commission,     550,000 cents   │
-- │   finalized:         2 commissions,  1,470,000 cents   │
-- │                                                        │
-- │ By party type:                                         │
-- │   team_member:      5 allocations,  1,548,500 cents    │
-- │   external_agent:   3 allocations,    520,000 cents    │
-- │   brokerage:        5 allocations,    781,500 cents    │
-- └─────────────────────────────────────────────────────────┘
--
-- ┌─────────────────────────────────────────────────────────┐
-- │ February 2025 — All teams (no 'draft' commissions)     │
-- ├─────────────────────────────────────────────────────────┤
-- │ Total commissions:  5                                  │
-- │ Total GCI (cents):  2,930,000                          │
-- │                                                        │
-- │ By status:                                             │
-- │   draft:             0 commissions,          0 cents   │
-- │   pending_approval:  1 commission,     330,000 cents   │
-- │   approved:          2 commissions,  1,000,000 cents   │
-- │   finalized:         2 commissions,  1,600,000 cents   │
-- └─────────────────────────────────────────────────────────┘
