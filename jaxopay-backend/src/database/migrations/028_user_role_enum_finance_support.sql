-- 028_user_role_enum_finance_support.sql
--
-- The user_role Postgres enum only had ('end_user', 'admin', 'super_admin', 'compliance_officer')
-- — 'finance' and 'support' were never added to it, even though the whole application already
-- assumed they were valid roles: admin.routes.js's STAFF_ROLES/FINANCE_ACCESS/SUPPORT_ACCESS
-- groups, the request validators (body('role').isIn([...STAFF_ROLES])), and the admin UI's
-- "Staff Roles" checkboxes all reference 'finance'/'support'. Any attempt to actually set a
-- user's role to one of these failed at the database with "invalid input value for enum
-- user_role" — this is why an admin could never switch a user from compliance_officer to
-- finance (or assign 'finance'/'support' to anyone at all).
-- Split into its own migration (see 017/023/025 for the same constraint) because Postgres
-- disallows using a newly added enum value in the same transaction it was added in.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support';
