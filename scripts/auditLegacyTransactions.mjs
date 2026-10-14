// User-run forensic evidence collector; importing it never connects to a database.
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { AUDIT_PLAN_VERSION, configuration, collect, decimal, add, text, cents, centExact, AuditFailure, failureReason } from './auditLegacyMoney.mjs'

export const IDS = Object.freeze([4281,4381,4598,5710])
export const QUERIES = {
  Q1: "WITH target AS (SELECT id,application_id,type,date,created_at,updated_at,version,deleted,categories FROM transactions WHERE id IN (4281,4381,4598,5710))\nSELECT t.id,t.application_id AS budget_id,t.type,t.date,t.created_at,t.updated_at,t.version,t.deleted,\n  jsonb_typeof(t.categories) AS root_type,s.ordinality AS split_ordinal,\n  s.value->>'categoryId' AS category_id,jsonb_typeof(s.value->'amount') AS amount_type,\n  s.value->>'amount' AS amount_text,s.value->>'baseAmount' AS base_amount_text,\n  s.value->>'funder' AS funder,s.value->>'includeFundingTransfers' AS include_funding_transfers,\n  jsonb_typeof(s.value->'fundingCategories') AS funding_snapshot_type,\n  (SELECT jsonb_agg(jsonb_build_object('ordinal',f.ordinality,'categoryId',f.value->>'categoryId',\n    'amountText',f.value->>'amount','amountType',jsonb_typeof(f.value->'amount'),\n    'percentage',f.value->'percentage') ORDER BY f.ordinality)\n    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.value->'fundingCategories')='array'\n      THEN s.value->'fundingCategories' ELSE '[]'::jsonb END) WITH ORDINALITY f(value,ordinality)) AS funding_snapshot\nFROM target t LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'\n  THEN t.categories ELSE '[]'::jsonb END) WITH ORDINALITY s(value,ordinality) ON true\nORDER BY t.id,s.ordinality",
  Q2: "SELECT t.id AS transaction_id,at.id AS account_transaction_id,at.account_id,\n  at.amount::text AS amount,at.principle::text AS principle,at.created_at AS account_transaction_created_at,at.updated_at AS account_transaction_updated_at,at.pending,at.provider,(at.provider_transaction_id IS NOT NULL) AS has_provider_transaction_id,at.statement_id,\n  a.type AS account_type,a.tracking,a.start_date,\n  CASE WHEN t.type=4 THEN a.balance::text END AS current_balance_not_historical,\n  CASE WHEN t.type=4 THEN a.plaid_balance::text END AS current_provider_balance_not_historical\nFROM transactions t LEFT JOIN account_transactions at ON at.transaction_id=t.id\nLEFT JOIN accounts a ON a.id=at.account_id\nWHERE t.id IN (4281,4381,4598,5710)\nORDER BY t.id,at.id",
  Q3: "SELECT id,transaction_id,category_id,amount::text,expected::text,created_at,updated_at\nFROM transaction_categories WHERE transaction_id IN (4281,4381,4598,5710)\nORDER BY transaction_id,id",
  Q4: "WITH RECURSIVE walk AS (\n SELECT id,transaction_id,created_at,changes::jsonb AS value,ARRAY[]::text[] AS path\n FROM transaction_logs WHERE transaction_id IN (4281,4381,4598,5710)\n UNION ALL\n SELECT w.id,w.transaction_id,w.created_at,c.value,w.path||c.key FROM walk w CROSS JOIN LATERAL (\n   SELECT key,value FROM jsonb_each(CASE WHEN jsonb_typeof(w.value)='object' THEN w.value ELSE '{}'::jsonb END)\n   UNION ALL SELECT (ordinality-1)::text,value FROM jsonb_array_elements(\n     CASE WHEN jsonb_typeof(w.value)='array' THEN w.value ELSE '[]'::jsonb END) WITH ORDINALITY\n ) c\n)\nSELECT id,transaction_id,created_at,path,jsonb_typeof(value) AS value_type,\n CASE WHEN jsonb_typeof(value) IN ('number','null','boolean') THEN value::text\n      WHEN jsonb_typeof(value)='string' AND (value #>> '{}') ~ '^[+-]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'\n        THEN value #>> '{}' END AS numeric_text,\n CASE WHEN array_to_string(path,'.') ~ '^date[.](old|new)$' THEN value #>> '{}' END AS date_text\nFROM walk WHERE array_to_string(path,'.') ~ '^(amount|principle|type|date)[.](old|new)$'\n OR array_to_string(path,'.') ~ '^categories([.](old|new))?([.][0-9]+)?[.](amount|baseAmount|categoryId|funder|includeFundingTransfers)([.](old|new))?$|^categories([.](old|new))?([.][0-9]+)?[.]fundingCategories([.](old|new))?([.][0-9]+)?[.](amount|categoryId|percentage)([.](old|new))?$'\nORDER BY transaction_id,id,path",
  Q5: "WITH referenced AS (\n SELECT t.application_id AS budget_id,s.value->>'categoryId' AS category_id\n FROM transactions t CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'\n   THEN t.categories ELSE '[]'::jsonb END) s(value)\n WHERE t.id IN (4281,4381,4598,5710)\n UNION\n SELECT t.application_id,f.value->>'categoryId' FROM transactions t\n CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END) s(value)\n CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.value->'fundingCategories')='array'\n   THEN s.value->'fundingCategories' ELSE '[]'::jsonb END) f(value)\n WHERE t.id IN (4281,4381,4598,5710)\n)\nSELECT c.id,g.application_id AS budget_id,c.type,c.balance::text AS current_balance_not_historical,\n c.funding_amount::text,c.use_goal,c.goal_date,c.recurrence,c.include_funding_transfers,\n (SELECT jsonb_agg(jsonb_build_object('ordinal',f.ordinality,'categoryId',f.value->>'categoryId',\n   'amountText',f.value->>'amount','percentage',f.value->'percentage') ORDER BY f.ordinality)\n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.funding_categories)='array'\n   THEN c.funding_categories ELSE '[]'::jsonb END) WITH ORDINALITY f(value,ordinality)) AS current_configuration\nFROM categories c JOIN groups g ON g.id=c.group_id\nWHERE EXISTS (SELECT 1 FROM referenced r WHERE r.category_id=c.id::text AND r.budget_id=g.application_id)\nORDER BY c.id",
  Q6: "SELECT s.id,s.account_id,s.start_date,s.end_date,s.starting_balance::text,s.ending_balance::text\nFROM statements s WHERE EXISTS (SELECT 1 FROM account_transactions at\n WHERE at.statement_id=s.id AND at.transaction_id IN (4281,4381,4598,5710))\nORDER BY s.id",
  Q7: "SELECT at.transaction_id,l.id AS log_id,l.created_at,b.key AS observation_branch,\n x.value->>'amount' AS provider_amount_text,x.value->>'iso_currency_code' AS iso_currency_code,\n x.value->>'unofficial_currency_code' AS unofficial_currency_code\nFROM account_transactions at JOIN accounts a ON a.id=at.account_id\nJOIN plaid_logs l ON l.status=200\nCROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(l.response::jsonb)='object'\n THEN l.response::jsonb ELSE '{}'::jsonb END) b\nCROSS JOIN LATERAL jsonb_array_elements(CASE WHEN b.key IN ('added','modified','transactions')\n AND jsonb_typeof(b.value)='array' THEN b.value ELSE '[]'::jsonb END) x(value)\nWHERE at.transaction_id IN (4281,4381,4598,5710) AND at.provider='PLAID'\n AND x.value->>'transaction_id'=at.provider_transaction_id AND x.value->>'account_id'=a.plaid_account_id\nORDER BY at.transaction_id,l.created_at,l.id",
}

export function forensicConfiguration(env) {
  if(!env.SPENDCRAFT_AUDIT_SOCKET_DIR||!env.SPENDCRAFT_AUDIT_PORT)
    throw new AuditFailure('Explicit SPENDCRAFT_AUDIT_SOCKET_DIR and SPENDCRAFT_AUDIT_PORT are required.');
  return configuration(env);
}

export function clean(value,key='') {
  if(value===null||value===undefined)return value;
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(v=>clean(v,key));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k)]));
  if(key==='numeric_text'&&['true','false','null'].includes(value))return value;
  if(/^(amount|amount_text|base_amount_text|amountText|numeric_text|provider_amount_text|principle|funding_amount|balance|expected|starting_balance|ending_balance|current_balance_not_historical|current_provider_balance_not_historical)$/.test(key))
    return decimal(String(value))?String(value):'[unclassifiable monetary text]';
  if(['iso_currency_code','unofficial_currency_code'].includes(key))return /^[A-Z0-9._-]{1,12}$/.test(String(value))?value:'[invalid currency code]';
  if(key==='percentage')return typeof value==='boolean'?value:'[invalid percentage flag]';
  if(key==='date_text')return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(String(value))?value:'[invalid date]';
  if(['categoryId','category_id','funder','include_funding_transfers'].includes(key))
    return /^(\d{1,10}|true|false)$/.test(String(value))?value:'[invalid identifier or flag]';
  return value;
}

export function interpret(results,checkDeadline=()=>undefined) {
  const records=[];
  for(const id of IDS) {
    checkDeadline();
    const splits=results.Q1.filter(r=>r.id===id);
    const linked=results.Q2.filter(r=>r.transaction_id===id&&r.account_transaction_id!==null);
    const meta=splits[0];
    let total={n:0n,scale:0},invalid=0,subcent=0;
    for(const row of splits)if(row.split_ordinal!==null) {
      const d=['number','string'].includes(row.amount_type)?decimal(row.amount_text):null;
      if(!d)invalid++;else {total=add(total,d);if(!centExact(d))subcent++;}
    }
    const rootValid=meta?.root_type==='array';
    const empty=rootValid&&splits.every(r=>r.split_ordinal===null);
    const complete=rootValid&&!empty&&invalid===0;
    let comparison=null,exclusion=null;
    if(!meta)exclusion='Transaction not found';
    else if(!complete)exclusion='Missing, empty or malformed split collection; no invented zero total';
    else if(linked.length>1)exclusion='Multiple AccountTransaction rows';
    else if(linked.length===1&&linked[0].account_type==='loan')exclusion='Loan account: amount and principal have distinct semantics';
    else if(linked.length===1&&['depository','credit','investment','other'].includes(linked[0].account_type)) {
      const d=decimal(linked[0].amount);
      if(d)comparison={basis:'single nonloan AccountTransaction amount',json_total:text(total),relational_total:text(d),
        difference:text(add(total,{n:-d.n,scale:d.scale})),exact_agreement:add(total,{n:-d.n,scale:d.scale}).n===0n,
        diagnostic_total_cents:cents(total).toString(),diagnostic_relational_cents:cents(d).toString()};
      else exclusion='Unclassifiable relational amount';
    } else if(linked.length===0&&[1,2,3].includes(meta.type))comparison={basis:'accountless transfer/funding zero-sum invariant, not relational counterpart',json_total:text(total),difference:text(total),exact_agreement:total.n===0n,diagnostic_total_cents:cents(total).toString()};
    else exclusion='No supported counterpart/account type';
    const applicable=linked.map(row=>({account_transaction_id:row.account_transaction_id,
      date_on_or_after_start:meta?.date&&row.start_date?new Date(meta.date)>=new Date(row.start_date):null,
      note:'Eligibility context only; no balance effect is reconstructed.'}));
    records.push({transaction_id:id,present:!!meta,exact_json_total:complete?text(total):null,ordered_splits:splits,account_transactions:linked,
      historical_relational_splits:results.Q3.filter(r=>r.transaction_id===id),
      monetary_type_date_changes:results.Q4.filter(r=>r.transaction_id===id),
      linked_statements:results.Q6.filter(r=>linked.some(a=>a.statement_id===r.id)),
      matching_provider_observations:results.Q7.filter(r=>r.transaction_id===id),
      split_precision:{subcent_values:subcent,unclassifiable_values:invalid},comparison,generic_audit_exclusion:exclusion,applicability:applicable,
      preliminary_policy:comparison&&!comparison.exact_agreement?'L4':null,
      policy_reason:comparison&&!comparison.exact_agreement?'Intended economic state requires historical/domain evidence; no repair inferred.':'No automatic L1/L2/L3/L5 decision; inspect semantics and history.',
      unresolved:['Historical configuration may differ from current Category context.',
        'Missing change entries do not prove no edit: array changes may not be logged.',
        'Matched provider identity does not alone identify the originally posted revision.']});
  }
  return clean({scope:IDS,records,current_category_context:results.Q5,
    warnings:['Only the four selected Transactions and directly related rows are inspected.',
      'Diagnostic cent normalization is not a conversion or repair policy.',
      'L1 requires unique allocation and economic preservation evidence; L2 needs authoritative intended cents.',
      'L3 requires deliberately isolated historical semantics; L5 requires a demonstrated domain exception.',
      'No balance reconstruction, general near-cent rule or remediation is performed.']});
}

export async function collectForensics(config,createClient,announce) {
  if(![1,2].includes(AUDIT_PLAN_VERSION))throw new AuditFailure('Shared audit runner does not support the required narrow plan.');
  return collect(config,createClient,announce,{queries:QUERIES,classify:interpret});
}

export function renderSummary(report) {
  const lines=['# Narrow legacy Transaction forensics',`Target: ${report.target.hostname}:${report.target.server_port}/${report.target.database}`,
    'READ ONLY / REPEATABLE READ; user-run local socket audit.',
    '| Transaction | Present | Comparison | Exact difference | Preliminary policy |', '| --- | --- | --- | --- | --- |'];
  for(const r of report.records)lines.push(`| ${r.transaction_id} | ${r.present} | ${r.comparison?.basis??r.generic_audit_exclusion} | ${r.comparison?.difference??'unclassified'} | ${r.preliminary_policy??'undecided'} |`);
  lines.push('', 'Complete ordered splits, linkage and sanitized history are in report.json. Current Category configuration is not historical authority.',
    'No findings authorize repair or conversion. Completed investigations exit 0 even if anomalies remain.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  if(process.argv.length===3&&process.argv[2]==='--print-sql') {
    for(const [name,sql] of Object.entries(QUERIES))console.log(`-- ${name}\n${sql};`);
    return;
  }
  const args=process.argv.slice(2),i=args.indexOf('--database');
  if(args.length!==3||!args.includes('--execute')||i<0||!args[i+1]||args[i+1].startsWith('--')) {
    console.log('User-only execution: node scripts/auditLegacyTransactions.mjs --database NAME --execute. --print-sql is offline.');return;
  }
  let config,outputReady=false,phase='configuration';
  try {
    config=forensicConfiguration({...process.env,SPENDCRAFT_AUDIT_DATABASE:args[i+1]});
    phase='creating report directory';await mkdir(config.outputDir,{mode:0o700});outputReady=true;
    phase='loading PostgreSQL driver';const {Client}=await import('pg');
    phase='collecting forensic evidence';
    const report=await collectForensics(config,options=>new Client(options),target=>console.log(JSON.stringify({verified_target:target})));
    report.completion.connection_closed=true;
    phase='writing forensic report';
    await writeFile(`${config.outputDir}/report.json`,`${JSON.stringify(report,null,2)}\n`,{flag:'wx',mode:0o600});
    await writeFile(`${config.outputDir}/summary.md`,renderSummary(report),{flag:'wx',mode:0o600});
    console.log('Forensic report complete; exit 0. Private reports written to the selected output directory.');
  } catch(error) {
    process.exitCode=error instanceof AuditFailure?error.exitCode:3;
    const reason=failureReason(error,phase);console.error(`Forensics ABORTED: ${reason}`);
    if(outputReady)try {await writeFile(`${config.outputDir}/aborted.json`,`${JSON.stringify({status:'aborted',reason,exit_code:process.exitCode})}\n`,{flag:'wx',mode:0o600});}
    catch {console.error('Could not write aborted report.');}
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
