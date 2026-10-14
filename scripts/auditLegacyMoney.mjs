// Standalone operator audit. Importing this module never opens a database connection.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL, URL } from 'node:url'
import { setTimeout, clearTimeout } from 'node:timers'
import { userInfo } from 'node:os'
import { resolve, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import process from 'node:process'
import console from 'node:console'

export const AUDIT_PLAN_VERSION = 2

export const SQL = {
  roots: `SELECT 'transactions.categories' AS source, id::text AS id, application_id::text AS budget_id,
      type::text AS transaction_type, deleted, jsonb_typeof(categories) AS root_type,
      CASE WHEN jsonb_typeof(categories)='array' THEN jsonb_array_length(categories) END AS entries
    FROM transactions
    UNION ALL SELECT 'transactions.taxes', id::text, application_id::text, type::text, deleted,
      jsonb_typeof(taxes), CASE WHEN jsonb_typeof(taxes)='array' THEN jsonb_array_length(taxes) END FROM transactions
    UNION ALL SELECT 'categories.funding_categories', c.id::text, g.application_id::text, NULL, NULL,
      jsonb_typeof(c.funding_categories), CASE WHEN jsonb_typeof(c.funding_categories)='array' THEN jsonb_array_length(c.funding_categories) END
      FROM categories c LEFT JOIN groups g ON g.id=c.group_id
    UNION ALL SELECT 'statements.data', s.id::text, i.application_id::text, NULL, NULL, jsonb_typeof(s.data), NULL
      FROM statements s LEFT JOIN accounts a ON a.id=s.account_id LEFT JOIN institutions i ON i.id=a.institution_id
    UNION ALL SELECT 'taxes.data', id::text, budget_id::text, NULL, NULL, jsonb_typeof(data), NULL FROM taxes
    UNION ALL SELECT 'transaction_logs.changes', id::text, application_id::text, NULL, NULL, json_typeof(changes), NULL FROM transaction_logs
    UNION ALL SELECT 'plaid_logs.response', id::text, NULL, NULL, NULL, json_typeof(response), NULL FROM plaid_logs ORDER BY source,id`,
  posted: `SELECT t.id::text AS id, t.type, t.application_id::text AS budget_id, t.deleted,
      at.id::text AS account_transaction_id, at.amount::text AS amount, at.principle::text AS principle,
      at.pending, at.provider, a.type AS account_type
    FROM transactions t LEFT JOIN account_transactions at ON at.transaction_id=t.id
    LEFT JOIN accounts a ON a.id=at.account_id ORDER BY t.id, at.id`,
  leaves: `WITH RECURSIVE roots(source,id,budget_id,transaction_type,value) AS (
    SELECT 'transactions.categories', id::text, application_id::text, type::text, categories FROM transactions
    UNION ALL SELECT 'transactions.taxes', id::text, application_id::text, type::text, taxes FROM transactions
    UNION ALL SELECT 'categories.funding_categories', c.id::text, g.application_id::text, NULL, c.funding_categories
      FROM categories c LEFT JOIN groups g ON g.id=c.group_id
    UNION ALL SELECT 'statements.data', s.id::text, i.application_id::text, NULL, s.data
      FROM statements s LEFT JOIN accounts a ON a.id=s.account_id LEFT JOIN institutions i ON i.id=a.institution_id
    UNION ALL SELECT 'taxes.data', id::text, budget_id::text, NULL, data FROM taxes
    UNION ALL SELECT 'transaction_logs.changes', id::text, application_id::text, NULL, changes::jsonb FROM transaction_logs
    UNION ALL SELECT 'plaid_logs.response', id::text, NULL, NULL, response::jsonb FROM plaid_logs
  ), walk AS (
    SELECT *, ARRAY[]::text[] AS path, NULL::text AS percentage, NULL::text AS category_id FROM roots
    UNION ALL
    SELECT w.source,w.id,w.budget_id,w.transaction_type,ch.value,w.path||ch.key,
      CASE WHEN jsonb_typeof(w.value->'percentage')='boolean' THEN w.value->>'percentage' END,
      CASE WHEN (w.value->>'categoryId') ~ '^[0-9]{1,10}$' THEN w.value->>'categoryId' END
    FROM walk w CROSS JOIN LATERAL (
      SELECT key,value FROM jsonb_each(CASE WHEN jsonb_typeof(w.value)='object' THEN w.value ELSE '{}'::jsonb END)
      UNION ALL SELECT (ordinality-1)::text,value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(w.value)='array' THEN w.value ELSE '[]'::jsonb END) WITH ORDINALITY
    ) ch
    WHERE w.source<>'plaid_logs.response'
      OR (array_length(w.path,1) IS NULL AND ch.key IN ('accounts','added','modified','transactions'))
      OR (array_length(w.path,1)=1 AND jsonb_typeof(w.value)='array')
      OR (array_length(w.path,1)=2 AND w.path[1]='accounts' AND ch.key='balances')
      OR (array_length(w.path,1)=2 AND w.path[1] IN ('added','modified','transactions')
        AND ch.key IN ('amount','iso_currency_code','unofficial_currency_code'))
      OR (array_length(w.path,1)=3 AND w.path[1]='accounts' AND w.path[3]='balances'
        AND ch.key IN ('current','available','limit','iso_currency_code','unofficial_currency_code'))
  ) SELECT source,id,budget_id,transaction_type,path,percentage,category_id,
      jsonb_typeof(value) AS value_type,
      CASE WHEN jsonb_typeof(value) IN ('number','string') AND length(value #>> '{}')<=512 THEN value #>> '{}' END AS decimal_text,
      CASE WHEN jsonb_typeof(value) IN ('null','boolean') THEN value::text END AS stored_token
    FROM walk WHERE
      (source='transactions.categories' AND (
        array_to_string(path,'.') ~ '^[0-9]+\\.(amount|baseAmount)$' OR
        array_to_string(path,'.') ~ '^[0-9]+\\.fundingCategories\\.[0-9]+\\.amount$' OR
        (array_length(path,1)=1 AND jsonb_typeof(value)<>'object') OR
        (array_to_string(path,'.') ~ '^[0-9]+\\.fundingCategories$' AND jsonb_typeof(value)<>'array')))
      OR (source='categories.funding_categories' AND (array_to_string(path,'.') ~ '^[0-9]+\\.amount$'
        OR (array_length(path,1)=1 AND jsonb_typeof(value)<>'object')))
      OR (source='transactions.taxes' AND array_to_string(path,'.') ~ '^[0-9]+\\.amount$')
      OR (source='statements.data' AND array_to_string(path,'.') IN ('shortTermCapitalGains','longTermCapitalGains','dividends','taxableInterest'))
      OR (source='taxes.data' AND array_to_string(path,'.') IN (
        'taxableInterest','qualifiedDividends','ordinaryDividends','taxableIraDistributions','taxablePensionAndAnnuities',
        'taxableSocialSecurityBenefits','additionalTaxableIncome','shortTermCapitalGains','longTermCapitalGains',
        'qualifiedBusinessIncomeDeduction','estimated.expectedAgi','estimated.priorYearAgi','estimated.priorYearTotalTax'))
      OR (source='transaction_logs.changes' AND array_to_string(path,'.') ~
        '^(amount|principle)\\.(old|new)$|^categories(\\.(old|new))?(\\.[0-9]+)?\\.(amount|baseAmount)(\\.(old|new))?$')
      OR (source='plaid_logs.response' AND array_to_string(path,'.') ~
        '^(added|modified|transactions)\\.[0-9]+\\.(amount|iso_currency_code|unofficial_currency_code)$|^accounts\\.[0-9]+\\.balances\\.(current|available|limit|iso_currency_code|unofficial_currency_code)$')
    ORDER BY source,id,path`,
  shapes: `WITH configs AS (
    SELECT 'categories.funding_categories' AS source,c.id::text AS id,g.application_id::text AS budget_id,
      NULL::bigint AS split_ordinal,c.funding_categories AS value FROM categories c LEFT JOIN groups g ON g.id=c.group_id
    UNION ALL SELECT 'transactions.fundingCategories',t.id::text,t.application_id::text,s.ordinality,s.value->'fundingCategories'
      FROM transactions t CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END) WITH ORDINALITY s(value,ordinality)
      WHERE jsonb_typeof(s.value)='object' AND s.value ? 'fundingCategories'
  ) SELECT cf.source,cf.id,cf.budget_id,cf.split_ordinal,jsonb_typeof(cf.value) AS root_type,
      e.ordinality AS entry_ordinal,jsonb_typeof(e.value) AS entry_type,
      jsonb_typeof(e.value->'percentage') AS mode_type,CASE WHEN jsonb_typeof(e.value->'percentage')='boolean' THEN e.value->>'percentage' END AS mode,
      CASE WHEN jsonb_typeof(e.value)='object' THEN e.value ? 'amount' ELSE false END AS has_amount
    FROM configs cf LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(cf.value)='array' THEN cf.value ELSE '[]'::jsonb END)
      WITH ORDINALITY e(value,ordinality) ON true ORDER BY source,id,split_ordinal,entry_ordinal`,
  missing: `SELECT t.id::text AS id,t.application_id::text AS budget_id,t.type,s.ordinality AS split_ordinal,
      s.value->>'categoryId' AS category_id FROM transactions t
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.categories)='array' THEN t.categories ELSE '[]'::jsonb END)
      WITH ORDINALITY s(value,ordinality)
    WHERE jsonb_typeof(s.value)='object' AND NOT (s.value ? 'amount') ORDER BY t.id,s.ordinality`,
};
export function decimal(text) {
  if (typeof text !== 'string' || text.length > 10000) return null;
  const m = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
  if (!m) return null;
  const exponent = Number(m[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) return null;
  let n = BigInt(m[2] + (m[3] ?? '')) * (m[1] === '-' ? -1n : 1n);
  let scale = (m[3]?.length ?? 0) - exponent;
  if (scale < 0) { n *= 10n ** BigInt(-scale); scale = 0; }
  while (scale > 0 && n % 10n === 0n) { n /= 10n; scale--; }
  return { n, scale };
}
export const centExact = d => d.scale <= 2;
export function add(a,b) {
  const scale = Math.max(a.scale,b.scale);
  return { n:a.n*10n**BigInt(scale-a.scale)+b.n*10n**BigInt(scale-b.scale),scale };
}
export function text(d) {
  const abs = (d.n < 0n ? -d.n : d.n).toString().padStart(d.scale+1,'0');
  return `${d.n<0n?'-':''}${d.scale?`${abs.slice(0,-d.scale)}.${abs.slice(-d.scale)}`:abs}`;
}
export function cents(d) { // Diagnostic PostgreSQL numeric scale-two half-away-from-zero, NOT a repair.
  if (d.scale <= 2) return d.n*10n**BigInt(2-d.scale);
  const divisor=10n**BigInt(d.scale-2), abs=d.n<0n?-d.n:d.n;
  return (abs/divisor+(abs%divisor*2n>=divisor?1n:0n))*(d.n<0n?-1n:1n);
}

export function classify(result,checkDeadline = () => undefined) {
  const counts={}, anomalies=[], totals=new Map(), affected=new Set(), currencies=new Map(), unclassified=[];
  const postedById=new Map();
  for(const row of result.posted) {const list=postedById.get(row.id)??[];list.push(row);postedById.set(row.id,list);}
  function count(key) { counts[key]=(counts[key]??0)+1; }
  const splitCount=result.roots.filter(r=>r.source==='transactions.categories').reduce((n,r)=>n+(r.entries??0),0);
  counts.transactions=result.roots.filter(r=>r.source==='transactions.categories').length;
  counts.split_array_entries=splitCount;
  counts.split_objects=splitCount-result.leaves.filter(r=>r.source==='transactions.categories'&&r.path.length===1).length;
  counts.malformed_split_objects=result.leaves.filter(r=>r.source==='transactions.categories'&&r.path.length===1).length;
  counts.statement_rows=result.roots.filter(r=>r.source==='statements.data').length;
  counts.transaction_snapshot_rows=result.roots.filter(r=>r.source==='transaction_logs.changes').length;
  counts.provider_log_rows=result.roots.filter(r=>r.source==='plaid_logs.response').length;
  for (const r of result.shapes) {
    count(`${r.source}.entry_rows`);
    if(r.entry_type==='object'&&r.mode_type==='boolean'&&r.mode==='false'&&!r.has_amount) {count('fixed_funding.observations');count('fixed_funding.unclassifiable');}
    if (r.entry_type==='object' && r.mode_type==='boolean' && r.mode==='true') continue;
    if (r.entry_type==='object' && r.mode_type==='boolean' && r.mode==='false' && r.has_amount) count(`${r.source}.fixed_currency_entries`);
    else if (r.root_type!=='array' || (r.entry_ordinal!==null && (r.entry_type!=='object'||r.mode_type!=='boolean'||!r.has_amount))) {
      count(`${r.source}.malformed_entries`); anomalies.push({...r,class:'E',issue:'malformed currency-configuration shape'});
    }
  }
  counts.funding_snapshots=new Set(result.shapes.filter(r=>r.source==='transactions.fundingCategories').map(r=>`${r.id}:${r.split_ordinal}`)).size;
  for (const r of result.roots) {
    count(`${r.source}.rows`);if(r.root_type==='object')count(`${r.source}.object_roots`);if(r.root_type===null)count(`${r.source}.sql_null_roots`);
    if(r.source==='transactions.categories'&&r.root_type==='array'&&r.entries===0)unclassified.push({id:r.id,basis:'empty splits use relational/unassigned fallback, not a zero split total',reason:'no explicit posted split amounts'});
    const expected=['transactions.categories','transactions.taxes','categories.funding_categories'].includes(r.source)?'array':'object';
    if (r.root_type && r.root_type!==expected) { count(`${r.source}.malformed_roots`); anomalies.push({...r,class:r.source==='plaid_logs.response'?'G':r.source==='categories.funding_categories'?'E':r.source==='transactions.categories'?'D':'I',value:undefined}); if(r.source==='transactions.categories') {affected.add(r.id);unclassified.push({id:r.id,basis:'malformed split root',reason:'no exact split collection available'});} }
  }
  for (const r of result.leaves) {
    checkDeadline();
    if(r.source==='transactions.categories'&&r.path.length===1) {
      const acc=totals.get(r.id)??{sum:{n:0n,scale:0},rounded:0n,subcent:0,malformed:0};
      acc.malformed++;totals.set(r.id,acc);affected.add(r.id);
      count('transactions.categories.malformed_split_shapes');anomalies.push({...r,class:'D',issue:'nonobject split'});continue;
    }
    const isFunding=r.source==='categories.funding_categories'||r.path.includes('fundingCategories');
    if (isFunding&&r.percentage==='true') continue; // Closed percentage work deliberately excluded.
    if(isFunding&&r.percentage!=='false') {count('funding.unknown_mode_values');anomalies.push({...r,decimal_text:undefined,class:'I',issue:'funding mode is malformed; monetary/percentage classification withheld'});continue;}
    const isSplit=r.source==='transactions.categories'&&r.path.length===2&&r.path[1]==='amount';
    if(r.source==='transaction_logs.changes'&&r.value_type==='null') {count('history.optional_nulls');continue;}
    const provider=r.source==='plaid_logs.response';
    if (provider && r.path.at(-1)==='amount') count('provider.transaction_money_values');
    if (provider && ['current','available','limit'].includes(r.path.at(-1))) count('provider.balance_money_values');
    const currency=provider&&['iso_currency_code','unofficial_currency_code'].includes(r.path.at(-1));
    if (currency) {
      count('provider.currency_fields');
      const key=`${r.id}:${r.path.slice(0,-1).join('.')}`;
      const context=currencies.get(key)??{log_id:r.id,path:r.path.slice(0,-1)};
      context[r.path.at(-1)]=r.decimal_text;currencies.set(key,context);
      continue;
    }
    if (provider) {
      const key=`${r.id}:${r.path.slice(0,-1).join('.')}`;
      if(!currencies.has(key)) currencies.set(key,{log_id:r.id,path:r.path.slice(0,-1)});
    }
    if (provider && r.value_type==='null' && r.path.at(-1)!=='amount') {count('provider.unavailable_monetary_values');continue;}
    const d=['number','string'].includes(r.value_type)?decimal(r.decimal_text):null;
    if(provider) {
      const prefix=r.path.at(-1)==='amount'?'provider.transactions':'provider.balances';
      count(`${prefix}.observations`);count(`${prefix}.${!d?'unclassifiable':centExact(d)?'cent_exact':'subcent'}`);
      if(d&&r.value_type==='number')count(`${prefix}.numeric_observations`);
      if(d&&r.value_type==='string')count(`${prefix}.numeric_string_observations`);
    }
    const role=provider?'G':isFunding?'E':isSplit?'posted':r.path.at(-1)==='baseAmount'?'E':'F';
    count(`${r.source}.money_values`);
    const roleKey=isSplit?'posted_splits':isFunding?'fixed_funding':r.source==='transactions.categories'?'funding_baseAmount':r.source;
    count(`${roleKey}.observations`);
    count(`${roleKey}.${!d?'unclassifiable':centExact(d)?'cent_exact':'subcent'}`);
    if (isSplit) {
      const acc=totals.get(r.id)??{sum:{n:0n,scale:0},rounded:0n,subcent:0,malformed:0};
      if (d) {acc.sum=add(acc.sum,d);acc.rounded+=cents(d);if(!centExact(d)) acc.subcent++;}
      else acc.malformed++;
      totals.set(r.id,acc);
    }
    if (!d) {count(`${r.source}.malformed_values`);anomalies.push({...r,decimal_text:undefined,class:provider?'G':isFunding?'E':isSplit?'D':'I',issue:'malformed/unclassifiable'});if(isSplit)affected.add(r.id);}
    else if (!centExact(d)) {
      count(`${r.source}.subcent_values`);if(isSplit)affected.add(r.id);
      anomalies.push({...r,class:role==='posted'?'pending B/C comparison':role,issue:'sub-cent',exact_value:text(d)});
    } else { count(`${r.source}.cent_exact_values`); if(r.value_type==='string') count(`${r.source}.valid_numeric_strings`); }
    if (isFunding && r.percentage!=='false') {count('funding.malformed_mode');anomalies.push({...r,class:'E',issue:'missing/nonboolean percentage mode; currency role uncertain'});}
  }
  for(const r of result.missing) {
    const acc=totals.get(r.id)??{sum:{n:0n,scale:0},rounded:0n,subcent:0,malformed:0};acc.malformed++;totals.set(r.id,acc);
    count('transactions.categories.missing_amount');affected.add(r.id);anomalies.push({...r,source:'transactions.categories',class:'D',issue:'missing split amount'});}
  const comparisons=[];counts.defensible_relational_comparisons=0;counts.transfer_zero_sum_comparisons=0;counts.transfer_zero_sum_disagreements=0;counts.unavailable_comparisons=0;
  for(const [id,acc] of totals) {
    checkDeadline();
    const rows=postedById.get(id)??[];
    const linked=rows.filter(r=>r.account_transaction_id!==null);
    const meta=rows[0];
    let target=null, basis='no supported counterpart';
    if(linked.length===1 && ['depository','credit','investment','other'].includes(linked[0].account_type)) {target=decimal(linked[0].amount);basis='single nonloan AccountTransaction amount';}
    else if(linked.length===0 && [1,2,3].includes(meta?.type)) {target={n:0n,scale:0};basis='transfer/funding/rebalance zero-sum invariant, no independent relational total';}
    if(!target||acc.malformed) {count('unavailable_comparisons');unclassified.push({id,basis,reason:acc.malformed?'incomplete JSON sum':'loan, multiple rows or no defensible counterpart'});if(affected.has(id)) comparisons.push({id,basis,issue:acc.malformed?'incomplete JSON sum':'comparison unavailable (loan/multiple/no supported counterpart)'});continue;}
    count(basis==='single nonloan AccountTransaction amount'?'defensible_relational_comparisons':'transfer_zero_sum_comparisons');
    const difference=add(acc.sum,{n:-target.n,scale:target.scale});
    if(difference.n!==0n) {count('transaction_total_disagreements');if(basis!=='single nonloan AccountTransaction amount')count('transfer_zero_sum_disagreements');}
    const normalizedAgreement=cents(acc.sum)===cents(target);
    if(acc.subcent||difference.n!==0n) comparisons.push({id,budget_id:meta.budget_id,type:meta.type,
      json_total:text(acc.sum),target_total:text(target),difference:text(difference),basis,
      rounded_json_total_cents:cents(acc.sum).toString(),sum_individually_rounded_cents:acc.rounded.toString(),
      classification:acc.subcent&&basis==='single nonloan AccountTransaction amount'?(normalizedAgreement?'B':'C'):'I',
      caveat:'Scale-two normalization diagnostic is not proof of historical timing or authorization to repair.'});
  }
  counts.malformed_split_values=(counts['posted_splits.unclassifiable']??0)+(counts['transactions.categories.missing_amount']??0)+(counts['transactions.categories.malformed_split_shapes']??0);
  counts.affected_transactions=affected.size;
  counts.relational_disagreement_transactions=comparisons.filter(r=>r.basis==='single nonloan AccountTransaction amount'&&r.difference!==undefined&&decimal(r.difference).n!==0n).length;
  counts.high_priority_subcent_disagreement_transactions=comparisons.filter(r=>r.classification==='C').length;
  counts.reversal_reader_risk_transactions=new Set([...affected,...comparisons.filter(r=>r.difference!==undefined&&decimal(r.difference).n!==0n).map(r=>r.id)]).size; // Includes inactive/deleted history, not a claim of active effects.
  for(const context of currencies.values()) {
    count('provider.currency_contexts');
    if(context.iso_currency_code!=='USD'||context.unofficial_currency_code) {
      count('provider.unknown_or_unsupported_currency_contexts');anomalies.push({...context,class:'H',issue:'USD-only candidate not established for this provenance context'});
    }
  }
  const comparisonById=new Map(comparisons.map(r=>[r.id,r]));
  for(const r of anomalies) if(r.class==='pending B/C comparison') {
    const comparison=comparisonById.get(r.id);
    r.class=comparison?.classification??'I';
    r.comparison_status=comparison?.basis??'no defensible relational comparison';
  }
  counts.class_A_posted_split_values=counts['posted_splits.cent_exact']??0;
  counts.class_B_transactions=comparisons.filter(r=>r.classification==='B').length;
  counts.class_C_transactions=comparisons.filter(r=>r.classification==='C').length;
  counts.class_D_posted_values=anomalies.filter(r=>r.class==='D'&&r.source==='transactions.categories').length;
  counts.class_E_values=anomalies.filter(r=>r.class==='E').length;
  counts.class_F_values=anomalies.filter(r=>r.class==='F').length;
  counts.class_G_precision_values=anomalies.filter(r=>r.class==='G').length;
  counts.class_H_contexts=anomalies.filter(r=>r.class==='H').length;
  counts.class_I_transactions=new Set([...comparisons.filter(r=>r.classification==='I').map(r=>r.id),...anomalies.filter(r=>r.class==='I'&&r.source==='transactions.categories').map(r=>r.id)]).size;
  counts.class_I_other_observations=anomalies.filter(r=>r.class==='I'&&r.source!=='transactions.categories').length;

  const baselineKeys=['transactions','split_objects','malformed_split_objects','malformed_split_values','affected_transactions',
    'defensible_relational_comparisons','relational_disagreement_transactions','transfer_zero_sum_comparisons',
    'transfer_zero_sum_disagreements','unavailable_comparisons','funding_snapshots','provider.transaction_money_values',
    'provider.balance_money_values','provider.unavailable_monetary_values','provider.currency_contexts',
    'provider.unknown_or_unsupported_currency_contexts','history.optional_nulls','reversal_reader_risk_transactions'];
  for(const key of baselineKeys)counts[key]??=0;
  for(const prefix of ['posted_splits','fixed_funding','funding_baseAmount','statements.data','transactions.taxes','taxes.data','transaction_logs.changes','plaid_logs.response','provider.transactions','provider.balances'])
    for(const suffix of ['observations','cent_exact','subcent','unclassifiable'])counts[`${prefix}.${suffix}`]??=0;
  counts['provider.balances.numeric_observations']??=0;counts['provider.transactions.numeric_observations']??=0;
  counts.defensible_relational_agreements=counts.defensible_relational_comparisons-counts.relational_disagreement_transactions;
  counts.transfer_zero_sum_agreements=counts.transfer_zero_sum_comparisons-counts.transfer_zero_sum_disagreements;
  const classes={A:counts.class_A_posted_split_values,B:counts.class_B_transactions,C:counts.class_C_transactions,
    D:counts.class_D_posted_values,E:counts.class_E_values,F:counts.class_F_values,G:counts.class_G_precision_values,
    H:counts.class_H_contexts,I:counts.class_I_transactions+counts.class_I_other_observations};
  const metadata=new Map(result.roots.filter(r=>r.source==='transactions.categories').map(r=>[r.id,r]));
  for(const row of [...anomalies,...comparisons,...unclassified])if(row.source==='transactions.categories'||row.basis) {
    const meta=metadata.get(row.id);if(meta){row.deleted=meta.deleted;row.transaction_type=meta.transaction_type;row.budget_id=meta.budget_id;}
  }
  const affectedIds=new Set([...affected,...comparisons.filter(r=>r.difference!==undefined&&decimal(r.difference).n!==0n).map(r=>r.id),
    ...anomalies.filter(r=>r.source==='transactions.categories').map(r=>r.id)]);
  counts.all_affected_transactions=affectedIds.size;
  const findings={counts,classes,affected_transaction_ids:[...affectedIds].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0),anomalies,comparisons,unclassified,
    warnings:['B is scale-two diagnostic agreement only; historical normalization is not proven.',
      'Transfer zero-sum checks are not independent relational counterparts.',
      'USD is a candidate supported currency; missing/discarded currency metadata is not proof of USD.',
      'Provider observations can repeat events; valuation precision is not posted-money corruption.',
      'JSONB traversal preserves mathematical decimals but cannot recover original wire spelling.',
      'Current balances are not treated as per-split counterparts; no repair is inferred.']};
  return sanitizeEvidence(findings);
}

// Defense in depth: output only allowlisted report fields, never arbitrary rows or driver errors.
export function sanitizeEvidence(value) {
  const forbidden = /password|secret|token|credential|merchant|description|email|username|account_number/i;
  const visit = (value, key = '') => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => visit(item, key));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([name]) => !forbidden.test(name))
      .map(([name,item]) => [name,visit(item,name)]));
    if (['id','budget_id','category_id','transaction_id','log_id','entry_ordinal','split_ordinal'].includes(key))
      return /^\d+$/.test(String(value)) ? value : '[invalid identifier]';
    if (['decimal_text','exact_value','amount','principle'].includes(key))
      return decimal(String(value)) ? value : '[unclassifiable monetary value]';
    if (['iso_currency_code','unofficial_currency_code'].includes(key))
      return typeof value==='string'&&/^[A-Z0-9._-]{1,12}$/.test(value)?value:'[invalid currency code]';
    if (['mode','percentage'].includes(key))
      return ['true','false'].includes(String(value)) ? value : '[invalid mode]';
    return value;
  };
  return visit(value);
}

export class AuditFailure extends Error {
  constructor(message, exitCode = 2) { super(message); this.exitCode=exitCode; }
}

function positiveInteger(env,key,fallback,max) {
  const raw=env[key]??String(fallback);
  if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>max)throw new AuditFailure(`Invalid ${key}`);
  return Number(raw);
}

// Local-server mode: explicit database name, Unix socket, operating-system user by default.
export function configuration(env) {
  const database=env.SPENDCRAFT_AUDIT_DATABASE;
  if(!database||! /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(database))
    throw new AuditFailure('Supply an explicit database name with --database NAME.');
  const host=env.SPENDCRAFT_AUDIT_SOCKET_DIR??'/var/run/postgresql';
  if(!isAbsolute(host)||host.includes('\0'))throw new AuditFailure('Audit connection must use an absolute local PostgreSQL socket directory.');
  const port=positiveInteger(env,'SPENDCRAFT_AUDIT_PORT',5432,65535);
  return {expected:database,database,host,port,serverPort:port,
    user:env.SPENDCRAFT_AUDIT_USER??userInfo().username,password:env.SPENDCRAFT_AUDIT_PASSWORD??'',
    statementMs:positiveInteger(env,'SPENDCRAFT_AUDIT_STATEMENT_TIMEOUT_MS',60000,3600000),
    lockMs:positiveInteger(env,'SPENDCRAFT_AUDIT_LOCK_TIMEOUT_MS',3000,60000),
    totalMs:positiveInteger(env,'SPENDCRAFT_AUDIT_TOTAL_TIMEOUT_MS',300000,3600000),
    maxRows:positiveInteger(env,'SPENDCRAFT_AUDIT_MAX_ROWS_PER_QUERY',100000,1000000),
    outputDir:env.SPENDCRAFT_AUDIT_OUTPUT_DIR??resolve(`money-audit-${Date.now()}`)};
}

export const VERIFY_SQL = `SELECT current_database() AS database, current_setting('port')::integer AS port,
  current_setting('server_version') AS server_version,
  current_setting('default_transaction_read_only') AS default_read_only,
  (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid()) AS server_ssl`;
export const MODE_SQL = `SELECT current_setting('transaction_read_only') AS read_only,
  current_setting('transaction_isolation') AS isolation`;
export const SCHEMA_SQL = `SELECT table_name,column_name,data_type,numeric_precision,numeric_scale
  FROM information_schema.columns WHERE table_schema='public'
  AND table_name IN ('transactions','account_transactions','accounts','institutions','groups','categories',
    'statements','taxes','transaction_logs','plaid_logs')
  AND column_name IN ('id','application_id','budget_id','categories','funding_categories','taxes','data','changes','response',
    'amount','principle','balance','type','tracking','transaction_id','account_id','institution_id','group_id')
  ORDER BY table_name,column_name`;

// No application code, dotenv or ORM is loaded. createClient is injectable for offline safety tests.
export async function collect(config,createClient,announce = (_target) => undefined, plan = {queries:SQL, classify}) {
  const client=createClient({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,
    ssl:false,connectionTimeoutMillis:10000,
    application_name:'spendcraft_readonly_money_audit',
    options:`-c default_transaction_read_only=on -c statement_timeout=${config.statementMs} -c lock_timeout=${config.lockMs} -c idle_in_transaction_session_timeout=30000 -c search_path=pg_catalog,public`});
  let transaction=false,timer,expired=false,phase='connect',status;
  const interrupt=()=>{expired=true;void client.end().catch(()=>undefined);};
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  const started=Date.now();
  client.connection.on('readyForQuery',message=>{status=message.status;});
  client.on('error',()=>undefined); // Awaited operations handle errors; never expose raw driver messages.
  try {
    await client.connect();
    timer=setTimeout(()=>{expired=true;void client.end().catch(()=>undefined);},config.totalMs);
    phase='target verification';
    const {rows:[live]}=await client.query(VERIFY_SQL);
    if(live.database!==config.expected||live.port!==config.serverPort)
      throw new AuditFailure('Live database/server port mismatch; no application rows read.');
    if(live.default_read_only!=='on')throw new AuditFailure('Default read-only safeguard failed.');
    const target={hostname:config.host,connection_port:config.port,database:live.database,server_port:live.port,
      transport:'local_unix_socket',tls_certificate_verified:false,server_ssl:live.server_ssl};
    announce(target);
    phase='transaction verification';
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
    const {rows:[mode]}=await client.query(MODE_SQL);
    if(mode.read_only!=='on'||mode.isolation!=='repeatable read')throw new AuditFailure('Transaction safeguards failed before application SELECTs.');
    phase='schema metadata';
    const schema=(await client.query(SCHEMA_SQL)).rows;
    const result={};
    for(const [name,definition] of Object.entries(plan.queries)) {
      const {sql,values=[]}=typeof definition==='function'?definition(result):{sql:definition};
      phase=`SELECT ${name}`;
      // Each query is a fixed SELECT / WITH RECURSIVE SELECT, never operator-supplied SQL.
      const {rows}=await client.query(`${sql}\nLIMIT $${values.length+1}`,[...values,config.maxRows+1]);
      if(rows.length>config.maxRows)throw new AuditFailure(`Row ceiling exceeded in ${name}; audit incomplete.`,3);
      result[name]=rows;
    }
    phase='exact classification';
    const findings=plan.classify(result,()=>{if(expired||Date.now()-started>config.totalMs)throw new AuditFailure('Overall audit time limit exceeded.',3);});
    if(expired||Date.now()-started>config.totalMs)throw new AuditFailure('Overall audit time limit exceeded.',3);
    phase='completion';
    await client.query('COMMIT');transaction=false;
    await client.query('SELECT 1 AS read_ok');
    if(status!=='I')throw new AuditFailure('Connection is not idle outside transaction.',3);
    return {format_version:1,status:'complete',timestamp:new Date().toISOString(),target,mode,
      server_version:live.server_version,schema,
      schema_sha256:createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
      application_version:'Not obtained from server; schema metadata is provided instead.',
      limits:{statement_ms:config.statementMs,lock_ms:config.lockMs,total_ms:config.totalMs,max_rows_per_query:config.maxRows},
      duration_ms:Date.now()-started,...findings,completion:{transaction_ended:true,connection_idle:true,subsequent_select_succeeded:true}};
  } catch(error) {
    if(error instanceof AuditFailure)throw error;
    if(phase==='connect'&&['ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error.code))
      throw new AuditFailure('TLS certificate validation failed; no application rows read.');
    // Do not serialize error.message/detail/stack: they may contain credentials or payloads.
    throw new AuditFailure(`${failureReason(error,phase)}${expired?' Time limit reached.':''} No write operations were issued.`,3);
  } finally {
    clearTimeout(timer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    try {if(transaction&&!expired)await client.query('ROLLBACK');}
    finally {await client.end();}
  }
}

export function exitCode(report) {
  return Object.entries(report.classes).some(([key,n])=>key!=='A'&&n>0)||report.unclassified.length>0?1:0;
}

export function summary(report) {
  if(report.status!=='complete')return `Audit ABORTED: ${report.reason}\nNo complete findings are available.\n`;
  const lines=['# Legacy monetary audit',`Timestamp: ${report.timestamp}`,`Target: ${report.target.hostname}:${report.target.connection_port}/${report.target.database}`,
    'READ ONLY / REPEATABLE READ; local Unix socket connection.',
    '', '| Denominator / finding | Count |','| --- | ---: |',
    ...Object.entries(report.counts).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`| ${k} | ${v} |`),
    '', 'Classes (units differ: A/D split values, B/C transactions, I anomaly records, E/F/G observations, H currency contexts):',
    ...Object.entries(report.classes).map(([k,v])=>`- ${k}: ${v}`),
    '', 'Full minimal evidence is in report.json; no repair or normalization was performed.',
    ...report.warnings.map(w=>`- ${w}`)];
  return `${lines.join('\n')}\n`;
}

export function failureReason(error,phase) {
  if(error instanceof AuditFailure)return error.message;
  const codes={EACCES:'permission denied',EPERM:'operation not permitted',EROFS:'read-only filesystem',
    EEXIST:'output already exists',ENOENT:'file or directory missing',ENOSPC:'no disk space',
    ERR_MODULE_NOT_FOUND:'dependency missing',MODULE_NOT_FOUND:'dependency missing',
    ERR_SYSTEM_ERROR:'operating-system lookup failed',ECONNREFUSED:'connection refused',
    ETIMEDOUT:'connection timed out',ECONNRESET:'connection reset',
    '28000':'authentication rejected (including peer authentication or missing role)',
    '28P01':'password authentication failed','3D000':'database does not exist',
    '42501':'insufficient privilege'};
  const description=codes[error?.code];
  return `${phase} failed${description?` (${error.code}: ${description})`:''}; raw errors withheld.`;
}

async function main() {
  if(process.argv.includes('--print-sql')) {
    for(const [name,sql] of Object.entries({verify:VERIFY_SQL,mode:MODE_SQL,schema:SCHEMA_SQL,...SQL}))console.log(`-- ${name}\n${sql};\n`);
    return;
  }
  const args=process.argv.slice(2);
  const databaseIndex=args.indexOf('--database');
  if(args.length!==3||!args.includes('--execute')||databaseIndex<0||!args[databaseIndex+1]||args[databaseIndex+1].startsWith('--')) {
    console.log('Manual local-server audit: node scripts/auditLegacyMoney.mjs --database NAME --execute. --print-sql is offline.');
    return;
  }
  let config,outputReady=false,phase='configuration';
  try {
    config=configuration({...process.env,SPENDCRAFT_AUDIT_DATABASE:args[databaseIndex+1]});
    // Refuse to overwrite any report directory. Mode 0700 directory / 0600 files.
    phase='creating report directory';
    await mkdir(config.outputDir,{mode:0o700});outputReady=true;
    phase='loading PostgreSQL driver';
    const {Client}=await import('pg');
    phase='collecting audit';
    const report=await collect(config,options=>new Client(options),target=>console.log(JSON.stringify({verified_target:target})));
    report.completion.connection_closed=true;
    phase='reading script fingerprint';
    const script=await readFile(new URL('./auditLegacyMoney.mjs',import.meta.url));
    report.script_sha256=createHash('sha256').update(script).digest('hex');
    phase='writing report files';
    for(const [name,content] of [['report.json',`${JSON.stringify(report,null,2)}\n`],['summary.md',summary(report)]])
      await writeFile(`${config.outputDir}/${name}`,content,{flag:'wx',mode:0o600});
    process.exitCode=exitCode(report);
    console.log(`Audit complete; exit ${process.exitCode}. Reports written to the dedicated output directory.`);
  } catch(error) {
    const code=error instanceof AuditFailure?error.exitCode:3;
    const reason=failureReason(error,phase);
    console.error(`Audit ABORTED: ${reason}`);process.exitCode=code;
    if(outputReady) {
      const report={status:'aborted',timestamp:new Date().toISOString(),exit_code:code,reason};
      try {await writeFile(`${config.outputDir}/aborted.json`,`${JSON.stringify(report,null,2)}\n`,{flag:'wx',mode:0o600});}
      catch {console.error('Could not write aborted report.');}
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
