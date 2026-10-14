// User-only structural evidence report; no financial compatibility implementation.
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { AUDIT_PLAN_VERSION, SQL, classify, collect, decimal, add, text, cents, centExact, AuditFailure, failureReason } from './auditLegacyMoney.mjs'
import { QUERIES, forensicConfiguration, clean } from './auditLegacyTransactions.mjs'

export const DISCOVERY = {
  roots: `SELECT 'transactions.categories' AS source,id::text,application_id::text AS budget_id,type::text AS transaction_type,
    deleted,jsonb_typeof(categories) AS root_type,
    CASE WHEN jsonb_typeof(categories)='array' THEN jsonb_array_length(categories) END AS entries FROM transactions ORDER BY id`,
  posted: SQL.posted,
  leaves: `SELECT 'transactions.categories' AS source,t.id::text,t.application_id::text AS budget_id,t.type::text AS transaction_type,
    CASE WHEN jsonb_typeof(s.value)='object' THEN ARRAY[(s.ordinality-1)::text,'amount'] ELSE ARRAY[(s.ordinality-1)::text] END AS path,
    NULL::text AS percentage,CASE WHEN (s.value->>'categoryId') ~ '^[0-9]{1,10}$' THEN s.value->>'categoryId' END AS category_id,
    jsonb_typeof(s.value->'amount') AS value_type,
    CASE WHEN jsonb_typeof(s.value->'amount') IN ('number','string') AND length(s.value->>'amount')<=512 THEN s.value->>'amount' END AS decimal_text
    FROM transactions t CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array'
      THEN t.categories ELSE '[]'::jsonb END) WITH ORDINALITY s(value,ordinality)
    WHERE jsonb_typeof(s.value)<>'object' OR s.value ? 'amount' ORDER BY t.id,s.ordinality`,
  missing: SQL.missing,
};

export function detect(result) {
  // Same audited detector; no independent tolerance or SQL approximation of Class B.
  return classify({...result,shapes:[]}).comparisons.filter(r=>r.classification==='B');
}
export function selectedIds(result) {
  const ids=detect(result).map(r=>Number(r.id));
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1||id>2147483647))throw new AuditFailure('Unclassifiable discovery identifier.',3);
  return [...new Set([...ids,4387])].sort((a,b)=>a-b);
}
export function detailPlan(result) {
  const ids=selectedIds(result);
  return Object.fromEntries(Object.entries(QUERIES).map(([name,sql])=>[name,{
    sql:sql.replaceAll('(4281,4381,4598,5710)','(SELECT unnest($1::integer[]))'),values:[ids]}]));
}

export function reportEvidence(result,checkDeadline=()=>undefined) {
  const found=detect(result),ids=selectedIds(result);
  const groups={},records=[];
  for(const id of ids) {
    checkDeadline();
    const splits=result.Q1.filter(r=>r.id===id),links=result.Q2.filter(r=>r.transaction_id===id&&r.account_transaction_id!==null);
    const meta=splits[0];
    let sum={n:0n,scale:0},mapped=0n,valid=!!meta&&meta.root_type==='array',halfTie=false,inRange=true;
    const byCategory=new Map(),mapping=[];
    for(const s of splits) {
      const d=['number','string'].includes(s.amount_type)?decimal(s.amount_text):null;
      if(!d||s.split_ordinal===null){valid=false;continue;}
      const candidate=cents(d);if(candidate>999999999999n||candidate< -999999999999n)inRange=false; // Explicit diagnostic PG half-away-from-zero, not a read/write adapter.
      if(d.scale>2){const divisor=10n**BigInt(d.scale-2);if((d.n<0n?-d.n:d.n)%divisor*2n===divisor)halfTie=true;}
      sum=add(sum,d);mapped+=candidate;
      const key=s.category_id;
      if(!key||!/^\d+$/.test(key)){valid=false;continue;}
      const item=byCategory.get(key)??{raw:{n:0n,scale:0},independent:0n,count:0};
      item.raw=add(item.raw,d);item.independent+=candidate;item.count++;byCategory.set(key,item);
      mapping.push({split_ordinal:s.split_ordinal,category_id:key,stored_decimal:s.amount_text,diagnostic_candidate_cents:candidate.toString()});
    }
    const categoryDiagnostics=[...byCategory].map(([category_id,v])=>({category_id,split_count:v.count,
      raw_category_delta:text(v.raw),independent_candidate_cents:v.independent.toString(),
      aggregate_candidate_cents:cents(v.raw).toString(),grouping_agrees:v.independent===cents(v.raw)}));
    const nonloan=links.length===1&&['depository','credit','investment','other'].includes(links[0].account_type);
    const relational=nonloan?decimal(links[0].amount):null;
    const typeSupported=[0,4,5].includes(meta?.type);
    const trackingSupported=links.length===1&&links[0].tracking==='Transactions';
    const arithmeticEligible=typeSupported&&trackingSupported&&valid&&inRange&&!!relational&&centExact(relational)&&!halfTie&&mapped===cents(relational)&&cents(sum)===mapped
      &&categoryDiagnostics.every(c=>c.grouping_agrees);
    const sourceShape=`${meta?.type??'missing'}:${links[0]?.provider??'accountless'}:${links[0]?.account_type??'none'}`;
    if(id!==4387)groups[sourceShape]=(groups[sourceShape]??0)+1;
    records.push({transaction_id:id,present:!!meta,population:id===4387?'separate_funding':'rediscovered_Class_B',
      metadata:meta?{budget_id:meta.budget_id,type:meta.type,date:meta.date,created_at:meta.created_at,updated_at:meta.updated_at,deleted:meta.deleted,version:meta.version}:null,
      ordered_splits:splits,diagnostic_split_mapping:mapping,exact_json_total:valid?text(sum):null,
      independent_candidate_total_cents:valid?mapped.toString():null,account_transactions:links,
      arithmetic_screen:{valid,supported_range:inRange,relational_cent_exact:!!relational&&centExact(relational),type_supported:typeSupported,tracking_supported:trackingSupported,half_cent_tie_present:halfTie,nonloan_single_link:nonloan,
        independent_conserves_relational:!!relational&&mapped===cents(relational),total_matches_independent:valid&&cents(sum)===mapped,
        category_grouping_agrees:categoryDiagnostics.every(c=>c.grouping_agrees),arithmetic_eligible:arithmeticEligible},
      funding_screen:id===4387?{accountless_funding:meta?.type===2&&links.length===0,independent_zero:valid&&mapped===0n,total_diagnostic_zero:valid&&cents(sum)===0n,grouping_agrees:categoryDiagnostics.every(c=>c.grouping_agrees)}:null,
      category_diagnostics:categoryDiagnostics,
      historical_relational_splits:result.Q3.filter(r=>r.transaction_id===id),
      history:result.Q4.filter(r=>r.transaction_id===id),provider_observations:result.Q7.filter(r=>r.transaction_id===id),
      statements:result.Q6.filter(r=>links.some(l=>l.statement_id===r.id)),
      category_economics_proven:false,legacy_path_proven:false,preliminary_policy:meta?'L4':null,
      reason:'Arithmetic screens do not establish original Category mutation grouping, rounding path or economic intent. No automatic L1 conversion authorized.'});
  }
  return clean({rediscovered_class_B_count:found.length,structural_groups:groups,records,
    current_category_context:result.Q5,
    warnings:['4387 is accountless funding and is never treated as ordinary Class B.',
      'Diagnostic candidate cents are evidence only; no compatibility adapter is implemented.',
      'Current Category balances/configuration are not historical per-event economic proof.',
      'Deleted archival funding is outside discovery/detail scope; preserve original higher precision.',
      'No creator/version provenance is inferred from dates, provider labels or total agreement.']});
}

export async function collectClassB(config,createClient,announce) {
  if(AUDIT_PLAN_VERSION!==2)throw new AuditFailure('Updated audit runner v2 is required before connecting.');
  const queries={...DISCOVERY};
  for(const name of Object.keys(QUERIES))queries[name]=result=>detailPlan(result)[name];
  return collect(config,createClient,announce,{queries,classify:reportEvidence});
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--print-sql') {
    for(const [name,sql] of Object.entries(DISCOVERY))console.log(`-- discovery ${name}\n${sql};`);
    for(const [name,q] of Object.entries(detailPlan({roots:[],posted:[],leaves:[],missing:[]})))console.log(`-- detail ${name}: $1 = rediscovered Class B IDs plus separate 4387\n${q.sql};`);
    return;
  }
  const i=args.indexOf('--database');
  if(args.length!==3||!args.includes('--execute')||i<0||!args[i+1]||args[i+1].startsWith('--')) {
    console.log('User-only: node scripts/auditLegacyClassB.mjs --database NAME --execute. --print-sql is offline.');return;
  }
  let config,outputReady=false,phase='configuration';
  try {
    config=forensicConfiguration({...process.env,SPENDCRAFT_AUDIT_DATABASE:args[i+1]});
    phase='creating output directory';await mkdir(config.outputDir,{mode:0o700});outputReady=true;
    phase='loading driver';const {Client}=await import('pg');
    phase='collecting Class B evidence';const report=await collectClassB(config,o=>new Client(o),target=>console.log(JSON.stringify({verified_target:target})));
    report.completion.connection_closed=true;
    phase='writing reports';await writeFile(`${config.outputDir}/report.json`,`${JSON.stringify(report,null,2)}\n`,{flag:'wx',mode:0o600});
    const lines=['# Legacy Class B structural evidence',`Rediscovered Class B Transactions: ${report.rediscovered_class_B_count}`,
      `Verified database: ${report.target.database}; port: ${report.target.server_port}`, 'READ ONLY / REPEATABLE READ',
      ...report.records.map(r=>`- ${r.transaction_id}: ${r.population}; arithmetic screen ${r.arithmetic_screen.arithmetic_eligible?'passes':'not established'}; Category economics unproven; ${r.preliminary_policy}`),
      'See report.json for exact values, diagnostic candidate cents and historical evidence. No conversions or writes performed.'];
    await writeFile(`${config.outputDir}/summary.md`,`${lines.join('\n')}\n`,{flag:'wx',mode:0o600});
    console.log('Class B evidence complete; exit 0. Private reports written.');
  } catch(error) {
    process.exitCode=error instanceof AuditFailure?error.exitCode:3;const reason=failureReason(error,phase);
    console.error(`Class B report ABORTED: ${reason}`);
    if(outputReady)try {await writeFile(`${config.outputDir}/aborted.json`,`${JSON.stringify({status:'aborted',reason})}\n`,{flag:'wx',mode:0o600});}
    catch {console.error('Could not write aborted report.');}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
