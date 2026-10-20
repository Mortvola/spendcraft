const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const maxCents=BigInt(Number.MAX_SAFE_INTEGER);
function object(value){return typeof value==='object'&&value!==null&&!Array.isArray(value)}
function checkedAdd(a, b) {
  const sum = a + b
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(sum)) {
    throw new Error('unsafe_cent_accumulation')
  }
  return Object.is(sum, -0) ? 0 : sum
}
function decimalTextCents(text) {
  if (typeof text !== 'string' || text.length > 64 || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('invalid_scale_two_decimal')
  }
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.')
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n)
  if (cents > maxCents || cents < -maxCents) throw new Error('unsafe_expected_cents')
  return Number(cents)
}
function roundAmount(original) {
  if (typeof original !== 'number' && (typeof original !== 'string' || !decimal.test(original))) {
    throw new Error('invalid_amount_type_or_syntax')
  }
  const amount = typeof original === 'number' ? original : Number(original)
  if (!Number.isFinite(amount)) throw new Error('nonfinite_amount')
  const rounded = Math.round(amount * 100)
  if (!Number.isSafeInteger(rounded)) throw new Error('unsafe_amount_cents')
  const cents = Object.is(rounded, -0) ? 0 : rounded
  const amountString = (Math.round(amount * 100) / 100).toFixed(2)
  let encodingMatchesCents = false
  try { encodingMatchesCents = decimalTextCents(amountString) === cents } catch { /* Flag the encoding, never substitute a value. */ }
  return { original, cents, amountString, changed: amount !== cents / 100,
    negativeZero: Object.is(rounded, -0), encodingMatchesCents }
}
function auditTransaction(row) {
  const result = { transactionId: row.id, transactionType: row.type, status: 'unsupported',
    reason: '', originalCategoryAmounts: [], roundedCategoryAmounts: [], categoryCents: [],
    categorySumCents: null, expectedCents: null, differenceCents: null, amountsChanged: false,
    deleted: row.deleted, pending: (Array.isArray(row.links) ? row.links : []).map((link) => object(link) ? link.pending : null) }
  if (row.deprecated) return { ...result, status: 'deprecated', reason: 'deprecated_feature' }
  if (![0, 5, 2, 3, 4].includes(row.type)) return { ...result, reason: 'outside_supported_lifecycles' }
  if (!Array.isArray(row.categories)) return { ...result, status: 'malformed', reason: 'categories_not_array' }
  result.originalCategoryAmounts = row.categories.map((split, index) => ({ index,
    categoryId: object(split) ? split.categoryId : null,
    present: object(split) && Object.hasOwn(split, 'amount'),
    value: object(split) && Object.hasOwn(split, 'amount') ? split.amount : null,
    ...(row.amountTokens ? { storedToken: row.amountTokens[index] } : {}) }))
  try {
    let encodingMismatch = false
    for (const split of row.categories) {
      if (!object(split) || !Number.isSafeInteger(split.categoryId) || split.categoryId <= 0) {
        throw new Error('invalid_allocation_shape_or_category_id')
      }
      const rounded = roundAmount(split.amount)
      result.categoryCents.push(rounded.cents)
      result.roundedCategoryAmounts.push(rounded.amountString)
      result.amountsChanged ||= rounded.changed
      encodingMismatch ||= !rounded.encodingMatchesCents
    }
    result.categorySumCents = result.categoryCents.reduce(checkedAdd, 0)
    if (encodingMismatch) return { ...result, reason: 'formatted_dollars_do_not_encode_rounded_cents' }
    if (!Array.isArray(row.links)) return { ...result, reason: 'missing_link_evidence' }
    if ([0, 4, 5].includes(row.type)) {
      if (row.links.length !== 1) return { ...result, reason: 'ordinary_link_count_not_one' }
      const link = row.links[0]
      if (!object(link) || link.scoped !== true || !['Transactions', 'Uncategorized Transactions'].includes(link.tracking)) {
        return { ...result, reason: 'ordinary_account_scope_or_tracking_unsupported' }
      }
      result.expectedCents = typeof link.amount === 'string' ? decimalTextCents(link.amount) : roundAmount(link.amount).cents
    } else {
      if (row.links.length !== 0) return { ...result, reason: 'funding_or_rebalance_has_account_links' }
      if (row.categories.length === 0) return { ...result, reason: 'empty_funding_or_rebalance_not_supported_by_endpoint' }
      result.expectedCents = 0
      if (row.type === 2) {
        if (!Array.isArray(row.poolIds) || row.poolIds.length !== 1) return { ...result, reason: 'owning_budget_pool_not_unique' }
        const poolId = row.poolIds[0]
        let pool = 0, nonPool = 0, found = false
        row.categories.forEach((split, index) => {
          if (split.categoryId === poolId) { pool = checkedAdd(pool, result.categoryCents[index]); found = true }
          else nonPool = checkedAdd(nonPool, result.categoryCents[index])
        })
        if (!found) return { ...result, reason: 'missing_pool_allocation' }
        result.poolAllocationCents = pool
        result.nonPoolSumCents = nonPool
        result.expectedCents = -pool
        result.differenceCents = checkedAdd(nonPool, pool)
      }
    }
    if (result.differenceCents === null) result.differenceCents = checkedAdd(result.categorySumCents, -result.expectedCents)
    if (row.type === 3) result.signedRemainderCents = result.differenceCents
    result.status = result.differenceCents === 0 ? 'pass' : 'fail'
    result.reason = result.status === 'pass' ? 'conserved' : 'rounded_cent_conservation_mismatch'
  } catch (error) { result.status = 'malformed'; result.reason = error.message }
  return result
}
function newSummary() {
  return { total: 0, ordinary: 0, opening: 0, funding: 0, rebalance: 0, pass: 0, fail: 0,
    malformed: 0, unsupported: 0, deprecated: 0, amountsChanged: 0, byType: {} }
}
function countResult(summary, result) {
  summary.total++
  summary[result.status]++
  if (result.amountsChanged) summary.amountsChanged++
  if (result.status !== 'deprecated') {
    if ([0, 5].includes(result.transactionType)) summary.ordinary++
    if (result.transactionType === 4) summary.opening++
    if (result.transactionType === 2) summary.funding++
    if (result.transactionType === 3) summary.rebalance++
  }
  const key = String(result.transactionType)
  const counts = summary.byType[key] ??= { total: 0, pass: 0, fail: 0, malformed: 0, unsupported: 0, deprecated: 0, amountsChanged: 0 }
  counts.total++; counts[result.status]++
  if (result.amountsChanged) counts.amountsChanged++
}
function exactStoredCents(value) {
  if (typeof value === 'number') return roundAmount(value).cents
  if (typeof value !== 'string' || value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value === '-0.00') throw Error('invalid_stored_decimal')
  const [whole,fraction]=value.replace(/^-/, '').split('.')
  const cents=(BigInt(whole)*100n+BigInt(fraction))*(value.startsWith('-')?-1n:1n)
  if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents< -BigInt(Number.MAX_SAFE_INTEGER))throw Error('unsafe_stored_cents')
  return Number(cents)
}
function inspectStored(row) {
  if(row.deprecated)return {id:row.id,type:row.type,excluded:true}
  const leaf={numbers:0,canonicalStrings:0,noncanonicalStrings:0,invalidTypes:0,missing:0}
  let changedNumbers=0,malformed=false
  const array=Array.isArray(row.categories)
  if(array) for(const entry of row.categories){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||!Object.hasOwn(entry,'amount')){leaf.missing++;malformed=true;continue}
    const value=entry.amount
    if(typeof value==='number')leaf.numbers++
    else if(typeof value==='string'){
      if(/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)&&value!=='-0.00')leaf.canonicalStrings++
      else{leaf.noncanonicalStrings++;malformed=true}
    }else{leaf.invalidTypes++;malformed=true}
    try{exactStoredCents(value);if(typeof value==='number'&&roundAmount(value).changed)changedNumbers++}catch{malformed=true}
  }
  else malformed=true
  const result=auditTransaction(row)
  try{
    if(array&&!malformed){
      const exact=row.categories.map(entry=>exactStoredCents(entry.amount))
      exact.reduce(checkedAdd,0)
      if(JSON.stringify(exact)!==JSON.stringify(result.categoryCents))throw Error('string_cent_interpretation_disagreement')
    }
  }catch{malformed=true}
  const shape=malformed?'malformed':!row.categories.length?'empty':leaf.numbers&&leaf.canonicalStrings?'mixed':leaf.numbers?'numeric-only':'string-only'
  const supported=[0,2,3,4,5].includes(row.type)
  const scope=[0,4,5].includes(row.type)?row.links.length===1&&row.links[0].scoped===true&&['Transactions','Uncategorized Transactions'].includes(row.links[0].tracking):row.links.length===0
  const eligible=supported&&scope&&!malformed&&result.status!=='malformed'&&(row.deleted||result.status==='pass')
  return {id:row.id,type:row.type,deleted:row.deleted,shape,leaf,changedNumbers,
    conservation:result.status,reason:result.reason,differenceCents:result.differenceCents,
    poolCents:result.status==='fail'?result.poolAllocationCents:undefined,
    nonPoolCents:result.status==='fail'?result.nonPoolSumCents:undefined,
    eligibleCandidate:eligible&&leaf.numbers>0,manualReview:leaf.numbers>0&&!eligible,
    createdEpoch:row.created_epoch,updatedEpoch:row.updated_epoch,providers:row.providers,
    allocationFingerprint:row.allocation_fingerprint,metadataFingerprint:row.metadata_fingerprint,
    transactionFingerprint:row.transaction_fingerprint}
}
const pageSql="SELECT t.id, t.type, t.deleted, EXTRACT(EPOCH FROM t.created_at)::text AS created_epoch, EXTRACT(EPOCH FROM t.updated_at)::text AS updated_epoch,\n (SELECT array_agg(DISTINCT at.provider) FROM public.account_transactions at WHERE at.transaction_id=t.id) AS providers,\n md5(t.categories::text) AS allocation_fingerprint, md5((to_jsonb(t)-'categories')::text) AS transaction_fingerprint,\n (SELECT md5(COALESCE(jsonb_agg(CASE WHEN jsonb_typeof(e.value)='object' THEN e.value-'amount' ELSE e.value END ORDER BY e.ordinality),'[]'::jsonb)::text)\n FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END) WITH ORDINALITY e(value,ordinality)) AS metadata_fingerprint, t.categories::text AS categories_text,\n  COALESCE((SELECT jsonb_agg((entry.value->'amount')::text ORDER BY entry.ordinality)\n    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END)\n      WITH ORDINALITY entry(value,ordinality)), '[]'::jsonb)::text AS amount_tokens,\n  COALESCE((SELECT jsonb_agg(jsonb_build_object('amount', at.amount::text, 'pending', at.pending,\n    'tracking', a.tracking, 'scoped', i.application_id=t.application_id) ORDER BY at.id)\n    FROM public.account_transactions at LEFT JOIN public.accounts a ON a.id=at.account_id\n    LEFT JOIN public.institutions i ON i.id=a.institution_id WHERE at.transaction_id=t.id), '[]'::jsonb)::text AS links_text,\n  COALESCE((SELECT jsonb_agg(c.id ORDER BY c.id) FROM public.categories c\n    JOIN public.groups g ON g.id=c.group_id WHERE g.application_id=t.application_id AND c.type='FUNDING POOL'), '[]'::jsonb)::text AS pool_ids,\n  (EXISTS (SELECT 1 FROM public.account_transactions at JOIN public.accounts a ON a.id=at.account_id\n      WHERE at.transaction_id=t.id AND a.type='loan')\n   OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END) e\n      JOIN public.categories c ON CASE WHEN jsonb_typeof(e->'categoryId')='number' THEN (e->>'categoryId')::numeric=c.id ELSE e->>'categoryId'=c.id::text END WHERE c.type='LOAN')) AS deprecated\nFROM public.transactions t WHERE t.id > $1 ORDER BY t.id LIMIT $2";
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import pg from '/spendcraft-prod/server/spendcraft/node_modules/pg/lib/index.js';
import {decodeCategoryAllocations} from '/spendcraft-prod/server/spendcraft/app/services/categoryAmountCodec.js';
const env=parseEnv(await readFile('/spendcraft-prod/server/spendcraft/.env','utf8'));
if(env.PG_HOST!=='localhost'||env.PG_PORT!=='5433'||env.PG_DB_NAME!=='budget'||env.PG_USER!=='ubuntu'||typeof env.PG_PASSWORD!=='string')throw Error('configured_target_mismatch');
const client=new pg.Client({host:env.PG_HOST,port:5433,database:env.PG_DB_NAME,user:env.PG_USER,password:env.PG_PASSWORD,ssl:false,connectionTimeoutMillis:10000,application_name:'spendcraft_readonly_category_readiness',options:'-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=30000 -c timezone=UTC -c search_path=pg_catalog,public'});
const cutoff=Date.parse('2026-10-20T17:24:08.110Z')/1000;
const summary={status:'incomplete',total:0,excluded:0,representation:{},leaves:{numbers:0,canonicalStrings:0,noncanonicalStrings:0,invalidTypes:0,missing:0},conservation:newSummary(),numericTransactions:0,candidateTransactions:0,candidateLeaves:0,alreadyStringTransactions:0,mixedTransactions:0,emptyTransactions:0,changedNumericTransactions:0,changedNumericLeaves:0,manualReviewTransactions:0,nondeletedExceptions:[],runtimeDecoder:{passed:0,failed:0},postDeployment:{total:0,byLifecycle:{},noncanonicalNewWrites:[]},modifiedSinceDeployment:0,knownExceptions:{},queryCount:0};
const known=new Set([3974,3975,3977,4116,4262,4412,4413,4415,4596,4597,2578,3077,3388]);
let phase='connect',transaction=false;
const query=async(text,values)=>{summary.queryCount++;return client.query(text,values)};
try{
 await client.connect();phase='begin_readonly';await query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
 phase='identity';
 const {rows:[identity]}=await query("SELECT current_database() AS database,current_user AS username,inet_server_port() AS port,host(inet_server_addr()) AS server,host(inet_client_addr()) AS peer,current_setting('default_transaction_read_only') AS default_read_only,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,transaction_timestamp() AS snapshot_at,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser");
 const remote=client.connection.stream.remoteAddress?.replace(/^::ffff:/,'');
 if(identity.database!=='budget'||identity.username!=='ubuntu'||identity.port!==5433||!['127.0.0.1','::1'].includes(identity.server)||!['127.0.0.1','::1'].includes(identity.peer)||!['127.0.0.1','::1'].includes(remote)||client.connection.stream.remotePort!==5433||identity.default_read_only!=='on'||identity.read_only!=='on'||identity.isolation!=='repeatable read')throw Error('identity_or_readonly_mismatch');
 console.log(JSON.stringify({kind:'identity',identity}));summary.identity=identity;
 const {rows:columns}=await query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name IN ('created_at','updated_at') ORDER BY column_name");
 summary.timestampColumns=columns;
 if(columns.length!==2||columns.some(c=>c.data_type!=='timestamp with time zone'))throw Error('unreviewed_timestamp_type');
 let after='0';
 for(;;){phase='page';const {rows}=await query(pageSql,[after,100]);if(!rows.length)break;
  for(const raw of rows){
   const row={...raw,categories:JSON.parse(raw.categories_text),amountTokens:JSON.parse(raw.amount_tokens),links:JSON.parse(raw.links_text),poolIds:JSON.parse(raw.pool_ids)};
   summary.total++;
   const item=inspectStored(row);
   if(item.excluded){summary.excluded++;console.log(JSON.stringify({kind:'transaction',...item}));continue}
   const audit=auditTransaction(row);countResult(summary.conservation,audit);
   summary.representation[item.shape]=(summary.representation[item.shape]??0)+1;
   for(const key of Object.keys(summary.leaves))summary.leaves[key]+=item.leaf[key];
   if(item.leaf.numbers)summary.numericTransactions++;
   if(item.eligibleCandidate){summary.candidateTransactions++;summary.candidateLeaves+=item.leaf.numbers}
   if(item.manualReview)summary.manualReviewTransactions++;
   if(item.shape==='string-only')summary.alreadyStringTransactions++;
   if(item.shape==='mixed')summary.mixedTransactions++;
   if(item.shape==='empty')summary.emptyTransactions++;
   if(item.changedNumbers){summary.changedNumericTransactions++;summary.changedNumericLeaves+=item.changedNumbers}
   if(!row.deleted&&audit.status!=='pass')summary.nondeletedExceptions.push({id:row.id,type:row.type,status:audit.status,reason:audit.reason,differenceCents:audit.differenceCents});
   try{const decoded=decodeCategoryAllocations(row.categories);if(decoded.some(e=>typeof e.amount!=='number'||!Number.isFinite(e.amount)))throw Error();summary.runtimeDecoder.passed++;item.runtimeDecoder='numeric'}catch{summary.runtimeDecoder.failed++;item.runtimeDecoder='failed'}
   if(known.has(Number(row.id)))summary.knownExceptions[String(row.id)]={type:row.type,deleted:row.deleted,status:audit.status,reason:audit.reason,differenceCents:audit.differenceCents,shape:item.shape};
   if(Number(row.updated_epoch)>cutoff)summary.modifiedSinceDeployment++;
   if(Number(row.created_epoch)>cutoff){
    summary.postDeployment.total++;
    const lifecycle=row.type===4?'opening':row.type===2?'funding':row.type===3?'rebalance':row.type===5?'manual':(raw.providers??[]).includes('OFX')?'OFX':(raw.providers??[]).includes('PLAID')?'Plaid':'ordinary-other';
    const counts=summary.postDeployment.byLifecycle[lifecycle]??={transactions:0,strings:0,numbers:0,conserved:0,empty:0};
    counts.transactions++;counts.strings+=item.leaf.canonicalStrings;counts.numbers+=item.leaf.numbers;if(audit.status==='pass')counts.conserved++;if(item.shape==='empty')counts.empty++;
    item.postDeploymentLifecycle=lifecycle;
    if(item.leaf.numbers||item.shape==='malformed')summary.postDeployment.noncanonicalNewWrites.push({id:row.id,type:row.type,shape:item.shape});
   }
   console.log(JSON.stringify({kind:'transaction',...item}));
  }
  const next=String(rows.at(-1).id);if(BigInt(next)<=BigInt(after))throw Error('invalid_page_progress');after=next;
 }
 phase='commit_readonly';await query('COMMIT');transaction=false;summary.status='complete';console.log(JSON.stringify({kind:'summary',summary}));
}catch(error){console.log(JSON.stringify({kind:'incomplete',phase,code:/^[A-Z0-9_]{5,30}$/.test(error.code??'')?error.code:/^[a-z_]+$/.test(error.message)?error.message:'unclassified_error',examined:summary.total}));process.exitCode=1}
finally{if(transaction)await client.query('ROLLBACK');await client.end()}
