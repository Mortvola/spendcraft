import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { forensicConfiguration, collectForensics, interpret, IDS, QUERIES } from './auditLegacyTransactions.mjs'
import { VERIFY_SQL, MODE_SQL, SCHEMA_SQL } from './auditLegacyMoney.mjs'

const env={SPENDCRAFT_AUDIT_DATABASE:'budget',SPENDCRAFT_AUDIT_SOCKET_DIR:'/run/postgresql',SPENDCRAFT_AUDIT_PORT:'5433'}
const empty=()=>Object.fromEntries(Object.keys(QUERIES).map(k=>[k,[]]))
function mock(change={}) {
  const c=new EventEmitter();c.connection=new EventEmitter();c.calls=[];c.closed=false;
  c.connect=async()=>undefined;c.end=async()=>{c.closed=true;};
  c.query=async sql=>{
    c.calls.push(sql);c.connection.emit('readyForQuery',{status:sql==='SELECT 1 AS read_ok'||sql==='COMMIT'||sql==='ROLLBACK'?'I':'T'});
    if(sql===VERIFY_SQL)return {rows:[{database:change.database??'budget',port:5433,default_read_only:'on',server_version:'offline',server_ssl:false}]};
    if(sql===MODE_SQL)return {rows:[{read_only:change.read_only??'on',isolation:change.isolation??'repeatable read'}]};
    if(change.fail&&Object.values(QUERIES).some(q=>sql.startsWith(q)))throw new Error('secret');
    return {rows:[]};
  };return c;
}

test('without explicit execution mode, subprocess never imports driver or connects',()=>{
  const p=spawnSync(process.execPath,[fileURLToPath(new URL('./auditLegacyTransactions.mjs',import.meta.url))],{encoding:'utf8',env:{}});
  assert.equal(p.status,0);assert.match(p.stdout,/User-only execution/);assert.equal(p.stderr,'');
})
test('explicit database/socket/port required with no application configuration fallback',()=>{
  assert.throws(()=>forensicConfiguration({}));
  assert.throws(()=>forensicConfiguration({...env,SPENDCRAFT_AUDIT_PORT:undefined}));
  assert.throws(()=>forensicConfiguration({...env,SPENDCRAFT_AUDIT_SOCKET_DIR:'remote.example'}));
  assert.equal(forensicConfiguration(env).expected,'budget');
})
for(const change of [{database:'wrong'},{read_only:'off'},{isolation:'read committed'}])test(`safety stops before application SELECTs ${JSON.stringify(change)}`,async()=>{
  const c=mock(change);await assert.rejects(collectForensics(forensicConfiguration(env),()=>c));
  assert(!c.calls.includes(SCHEMA_SQL));assert(!c.calls.some(q=>Object.values(QUERIES).some(s=>q.startsWith(s))));assert(c.closed);
})
test('shared runner executes only narrow plan and completes/cleans normally',async()=>{
  const c=mock();const r=await collectForensics(forensicConfiguration(env),()=>c);
  assert.equal(r.status,'complete');assert.deepEqual(r.scope,[4281,4381,4598,5710]);assert(c.calls.includes('COMMIT'));assert(c.closed);
  for(const q of Object.values(QUERIES))assert(c.calls.some(s=>s.startsWith(q)));
})
test('failure rolls back and closes without exposing raw errors',async()=>{
  const c=mock({fail:true});await assert.rejects(collectForensics(forensicConfiguration(env),()=>c),e=>!e.message.includes('secret'));
  assert(c.calls.includes('ROLLBACK'));assert(c.closed);
})
test('all SELECTs enforce fixed scope or directly linked scope, without writes/sandbox IDs',()=>{
  for(const q of Object.values(QUERIES)) {
    assert.match(q,/^(WITH|SELECT)/);assert(q.includes('(4281,4381,4598,5710)'));
    assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|ALTER|DROP|CALL|GRANT|REVOKE)\b/i.test(q));
    assert(!/\b(342|343|344|345|346|347|348|582|602)\b/.test(q));
    assert(!/\b(description|merchant_name|email|access_token|name)\b/.test(q));
  }
})
test('exact sums distinguish four-cent funding residual and material disagreement',()=>{
  const r=empty();
  r.Q1.push({id:4598,type:2,root_type:'array',split_ordinal:'1',amount_type:'number',amount_text:'10.04'},
    {id:4598,type:2,root_type:'array',split_ordinal:'2',amount_type:'number',amount_text:'-10'},
    {id:4281,type:0,root_type:'array',split_ordinal:'1',amount_type:'number',amount_text:'-16.20'});
  r.Q2.push({transaction_id:4281,account_transaction_id:88,account_type:'depository',amount:'-18.63'});
  const d=interpret(r);assert.equal(d.records.find(x=>x.transaction_id===4598).comparison.difference,'0.04');
  assert.equal(d.records.find(x=>x.transaction_id===4281).comparison.difference,'2.43');
  assert.equal(d.records.find(x=>x.transaction_id===4281).preliminary_policy,'L4');
})
test('5710 loan/multiple linkage is explicitly excluded; no fabricated L5',()=>{
  const r=empty();r.Q1.push({id:5710,type:4,root_type:'array',split_ordinal:'1',amount_type:'number',amount_text:'1'});
  r.Q2.push({transaction_id:5710,account_transaction_id:7,account_type:'loan',amount:'1',principle:'1'});
  const d=interpret(r).records.find(x=>x.transaction_id===5710);assert.match(d.generic_audit_exclusion,/Loan/);assert.equal(d.preliminary_policy,null);
})
test('malformed monetary/date/configuration representations are redacted',()=>{
  const r=empty();r.Q1.push({id:4381,root_type:'array',split_ordinal:'1',amount_type:'string',amount_text:'secret',funding_snapshot:[{amountText:'secret',percentage:'private'}]});
  r.Q4.push({transaction_id:4381,numeric_text:'secret',date_text:'private'});
  const d=interpret(r);assert(!JSON.stringify(d).includes('secret'));assert(!JSON.stringify(d).includes('private'));assert.deepEqual(d.scope,IDS);
})
