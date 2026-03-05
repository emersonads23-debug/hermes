-- Seed: Create default superadmin user
-- Password: ContabilAI@2024 (bcrypt hash)
-- IMPORTANT: Change this password after first login

INSERT INTO offices (id, name, cnpj, email)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'ContabilAI Admin',
    '00000000000000',
    'admin@contabilai.com'
) ON CONFLICT (cnpj) DO NOTHING;

INSERT INTO users (id, office_id, name, email, password_hash, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Super Admin',
    'admin@contabilai.com',
    '$2a$12$LJ3m4ys3Lk8MbuPn1ACgruoJBuMrC9mn92JsgLEyDXkSFm7lMHMeG',
    'superadmin'
) ON CONFLICT (email) DO NOTHING;
