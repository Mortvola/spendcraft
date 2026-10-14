import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { classify, VERIFY_SQL, MODE_SQL } from './auditLegacyMoney.mjs'
import { forensicConfiguration } from './auditLegacyTransactions.mjs'
import { DISCOVERY, detect, selectedIds, detailPlan, reportEvidence, collectClassB } from './auditLegacyClassB.mjs'
const env={SPENDCRAFT_AUDIT_DATABASE:'budget',SPENDCRAFT_AUDIT_SOCKET_DIR:'/run/postgresql',SPENDCRAFT_AUDIT_PORT:'5433'}
const discovery=()=>({roots:[{source:'transactions.categories',id:'81000',budget_id:'7',transaction_type:'0',deleted:false,root_type:'array',entries:1}],
 posted:[{id:'81000',type:0,account_transaction_id:'9',amount:'-3.00',account_type:'depository'}],
 leaves:[{source:'transactions.categories',id:'81000',path:['0','amount'],category_id:'12',value_type:'number',decimal_text:'-3.0000000000000004'}],missing:[]})
const complete=()=>({...discovery(),Q1:[],Q2:[],Q3:[],Q4:[],Q5:[],Q6:[],Q7:[]})
function mock(change={}) {
 const c=new EventEmitter();c.connection=new EventEmitter();c.calls=[];c.connect=async()=>undefined;c.end=async()=>{c.closed=true;};
 c.query=async(sql,values)=>{
  c.calls.push({sql,values});c.connection.emit('readyForQuery',{status:sql==='COMMIT'||sql==='ROLLBACK'||sql==='SELECT 1 AS read_ok'?'I':'T'});
  if(sql===VERIFY_SQL)return {rows:[{database:change.database??'budget',port:5433,default_read_only:'on'}]};
  if(sql===MODE_SQL)return {rows:[{read_only:change.read_only??'on',isolation:change.isolation??'repeatable read'}]};
  if(change.fail&&sql.startsWith(DISCOVERY.roots))throw new Error('private');
  return {rows:[]};
 };return c;
}
test('module usage never connects',()=>{
 const p=spawnSync(process.execPath,[fileURLToPath(new URL('./auditLegacyClassB.mjs',import.meta.url))],{encoding:'utf8',env:{}});
 assert.equal(p.status,0);assert.match(p.stdout,/User-only/);assert.equal(p.stderr,'');
})
test('detector is exactly the existing audit Class B detector; genuine fractions stay candidates, not accepted money',()=>{
 const r=discovery();assert.deepEqual(detect(r),classify({...r,shapes:[]}).comparisons.filter(x=>x.classification==='B'));
 r.leaves[0].decimal_text='0.005';r.posted[0].amount='0.01';assert.equal(detect(r).length,1);
})
test('details contain only rediscovered Class B plus separate 4387, with bound parameters',()=>{
 const r=discovery();assert.deepEqual(selectedIds(r),[4387,81000]);
 for(const q of Object.values(detailPlan(r))) {assert.deepEqual(q.values,[[4387,81000]]);assert(q.sql.includes('unnest($1::integer[])'));assert(!q.sql.includes('4281'));}
})
test('Category grouping prevents independent rounding from hiding duplicate-split discrepancies',()=>{
 const r=complete();r.Q1=[{id:81000,type:0,root_type:'array',split_ordinal:'1',category_id:'12',amount_type:'number',amount_text:'0.004'},
 {id:81000,type:0,root_type:'array',split_ordinal:'2',category_id:'12',amount_type:'number',amount_text:'0.004'}];
 r.Q2=[{transaction_id:81000,account_transaction_id:9,account_type:'depository',tracking:'Transactions',amount:'0.01'}];
 const x=reportEvidence(r).records.find(x=>x.transaction_id===81000);assert.equal(x.category_diagnostics[0].grouping_agrees,false);assert.equal(x.arithmetic_screen.arithmetic_eligible,false);
})
test('exact candidate cents conserve ordinary artifact, but Category economics/provenance remain unproven',()=>{
 const r=complete();r.Q1=[{id:81000,type:0,root_type:'array',split_ordinal:'1',category_id:'12',amount_type:'number',amount_text:'-3.0000000000000004'}];
 r.Q2=[{transaction_id:81000,account_transaction_id:9,account_type:'depository',tracking:'Transactions',amount:'-3.00'}];
 const x=reportEvidence(r).records.find(x=>x.transaction_id===81000);assert.equal(x.diagnostic_split_mapping[0].diagnostic_candidate_cents,'-300');
 assert.equal(x.arithmetic_screen.arithmetic_eligible,true);assert.equal(x.preliminary_policy,'L4');assert.equal(x.category_economics_proven,false);
})
test('half cent ties do not become structural eligibility',()=>{
 const r=complete();r.Q1=[{id:81000,type:0,root_type:'array',split_ordinal:'1',category_id:'12',amount_type:'number',amount_text:'-0.005'}];
 r.Q2=[{transaction_id:81000,account_transaction_id:9,account_type:'depository',tracking:'Transactions',amount:'-0.01'}];
 assert.equal(reportEvidence(r).records.find(x=>x.transaction_id===81000).arithmetic_screen.arithmetic_eligible,false);
})
for(const change of [{database:'other'},{read_only:'off'},{isolation:'read committed'}])test(`safety abort ${JSON.stringify(change)}`,async()=>{
 const c=mock(change);await assert.rejects(collectClassB(forensicConfiguration(env),()=>c));assert(c.closed);assert(!c.calls.some(x=>x.sql.startsWith(DISCOVERY.roots)));
})
test('runner keeps adaptive discovery/detail reads in one snapshot and cleans up',async()=>{
 const c=mock();const r=await collectClassB(forensicConfiguration(env),()=>c);assert.equal(r.status,'complete');assert.equal(r.rediscovered_class_B_count,0);assert(c.closed);
 assert(c.calls.some(x=>x.values?.length===2&&x.values[0][0]===4387));assert(c.calls.some(x=>x.sql==='COMMIT'));
})
test('failed query rolls back and redacts driver errors',async()=>{
 const c=mock({fail:true});await assert.rejects(collectClassB(forensicConfiguration(env),()=>c),e=>!e.message.includes('private'));assert(c.closed);assert(c.calls.some(x=>x.sql==='ROLLBACK'));
})
test('SELECTs and diagnostics contain no write SQL, tolerance or rounding acceptance',()=>{
 for(const sql of [...Object.values(DISCOVERY),...Object.values(detailPlan(discovery())).map(q=>q.sql)]) {
  assert.match(sql,/^(SELECT|WITH)/);assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|CALL)\b/i.test(sql));
  assert(!sql.includes('4596'));assert(!sql.includes('4597'));
 }
})
