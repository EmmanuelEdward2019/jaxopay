-- 012_role_change_audit_trigger.sql
-- Tamper-evident, database-level audit trail for every change to users.role / users.roles --
-- independent of the application. This exists specifically because a prior role escalation
-- (a self-registered account reaching role='admin') left zero trace in the app's own
-- audit_logs table, which only records actions taken *through* the Express API. This trigger
-- fires on ANY update to the row, from ANY connection (the app, an admin running raw SQL, or
-- anything else), so a future anomaly is caught immediately instead of discovered weeks later.

CREATE TABLE IF NOT EXISTS security_role_change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_email VARCHAR(255),
    old_role VARCHAR(50),
    new_role VARCHAR(50),
    old_roles TEXT[],
    new_roles TEXT[],
    changed_by_db_role TEXT,
    changed_at TIMESTAMP DEFAULT NOW()
);

-- No anon/authenticated policy is added (see 011) — this table is default-deny for the
-- PostgREST path; only the backend's own connection (which bypasses RLS) can read it.
ALTER TABLE security_role_change_log ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER: always writes as the function owner, so the log entry is guaranteed to be
-- recorded even after the write privileges below are revoked from everyone else.
CREATE OR REPLACE FUNCTION log_role_change() RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.role IS DISTINCT FROM NEW.role) OR (OLD.roles IS DISTINCT FROM NEW.roles) THEN
        INSERT INTO security_role_change_log
            (user_id, user_email, old_role, new_role, old_roles, new_roles, changed_by_db_role)
        VALUES
            (NEW.id, NEW.email, OLD.role, NEW.role, OLD.roles, NEW.roles, current_user);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_role_change ON users;
CREATE TRIGGER trg_log_role_change
AFTER UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION log_role_change();

-- Tamper-proof: nobody (including the app's own connection) can UPDATE/DELETE/TRUNCATE past
-- entries directly — only the SECURITY DEFINER trigger function can INSERT new ones.
REVOKE UPDATE, DELETE, TRUNCATE ON security_role_change_log FROM PUBLIC;
