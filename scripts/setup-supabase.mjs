import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const project = readFileSync(`${root}supabase/.temp/project-ref`, 'utf8').trim()
const argumentsList = process.argv.slice(2)
if (!/^[a-z]{20}$/.test(project)) throw new Error('Invalid linked Supabase project')
if (argumentsList.length !== 1 || !['--check', '--apply'].includes(argumentsList[0])) {
  throw new Error('Use --check (rollback only) or --apply (fresh database only)')
}
const apply = argumentsList[0] === '--apply'
const files = [
  'schema.sql',
  'frontend_features_migration.sql',
  'secure_otp.sql',
  'admin_phone_verify.sql',
  'fraud_detection.sql',
  'new_features_migration.sql',
  'whitelist_referral_migration.sql',
  'fraud_referral_v2_migration.sql',
  'phone_device_lock_migration.sql',
  'signup_email_otp_fix.sql',
  'telegram_verification_migration.sql',
  'production_setup.sql',
  'otp_attempts_fix.sql',
]
const guard = `
do $$ begin
  if exists (select 1 from pg_tables where schemaname = 'public')
     or exists (select 1 from auth.users)
     or exists (select 1 from storage.buckets)
     or exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects') then
    raise exception 'FRESH_DATABASE_REQUIRED: existing setup will not be overwritten';
  end if;
end $$;
`
const sql = [
  'begin;',
  "set local lock_timeout = '5s';",
  "set local statement_timeout = '60s';",
  guard,
  ...files.map(file => readFileSync(`${root}supabase/${file}`, 'utf8')),
  ...(!apply ? [readFileSync(`${root}supabase/setup_validation.sql`, 'utf8')] : []),
  apply ? 'commit;' : 'rollback;',
  `select '${apply ? 'installed' : 'rollback_check_passed'}' as result;`,
].join('\n')
const result = spawnSync('supabase', [
  'db', 'query', '--linked', '--project-ref', project, sql,
], { cwd: root, stdio: 'inherit', timeout: 120000, killSignal: 'SIGTERM' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1