import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { URL } from 'node:url'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import {
  decimal, centExact, cents, configuration, collect, classify,
  failureReason, SQL, VERIFY_SQL, MODE_SQL, SCHEMA_SQL, sanitizeEvidence, exitCode, summary,
} from './auditLegacyMoney.mjs'

const env={SPENDCRAFT_AUDIT_DATABASE:'spendcraft_prod',SPENDCRAFT_AUDIT_OUTPUT_DIR:'/unused/offline-output'}
const empty=()=>({roots:[],posted:[],leaves:[],shapes:[],missing:[]})
const root=(id)=>({source:'transactions.categories',id,budget_id:'9',transaction_type:'0',deleted:false,root_type:'array',entries:1})
const split=(id,value,path=['0','amount'])=>({source:'transactions.categories',id,budget_id:'9',transaction_type:'0',path,
  percentage:null,category_id:'100',value_type:'number',decimal_text:value,stored_token:value})
const posted=(id,value,account_type='depository')=>({id,type:0,budget_id:'9',deleted:false,
  account_transaction_id:id,amount:value,account_type})

function mock(options={}) {
  const client=new EventEmitter(),connection=new EventEmitter();
  connection.stream={authorized:options.tls??true};client.connection=connection;
  client.calls=[];client.closed=false;client.connect=async()=>{client.connected=true;};
  client.end=async()=>{client.closed=true;};
  client.query=async(sql)=>{
    client.calls.push(sql);
    connection.emit('readyForQuery',{status:sql.startsWith('BEGIN')||sql===MODE_SQL||Object.values(SQL).some(q=>sql.startsWith(q))?'T':'I'});
    if(sql===VERIFY_SQL)return {rows:[{database:options.database??'spendcraft_prod',port:options.port??5432,default_read_only:options.defaultReadOnly??'on',server_ssl:true,server_version:'offline-stub'}]};
    if(sql===MODE_SQL)return {rows:[{read_only:options.readOnly??'on',isolation:options.isolation??'repeatable read'}]};
    if(sql===SCHEMA_SQL)return {rows:[]};
    if(options.fail&&Object.values(SQL).some(q=>sql.startsWith(q)))throw new Error('password=DO_NOT_DISCLOSE');
    if(options.tooMany&&sql.startsWith(SQL.roots))return {rows:[{}, {}, {}]};
    return {rows:[]};
  };
  return client;
}

test('exact decimal classification, diagnostic ties and scientific notation',()=>{
  for(const v of ['0','0.01','1','1.2','1.20','-33.24','12.340','1e-2','12300e-4'])assert(centExact(decimal(v)),v);
  for(const v of ['0.004','0.005','1.234','333.3333333333333','-33.239999999999995','0.30000000000000004','1e-3'])assert(!centExact(decimal(v)),v);
  for(const v of ['abc','NaN','Infinity','','1e9999999'])assert.equal(decimal(v),null);
  assert.equal(cents(decimal('0.005')),1n);assert.equal(cents(decimal('-0.005')),-1n);
  assert.equal(cents(decimal('0.004')),0n);
})

test('explicit database and local socket required; ordinary PG settings ignored',()=>{
  assert.throws(()=>configuration({PGDATABASE:'budget'}));
  assert.throws(()=>configuration({...env,SPENDCRAFT_AUDIT_SOCKET_DIR:'remote.example'}));
  const c=configuration({...env,PGHOST:'remote.example'});
  assert.equal(c.host,'/var/run/postgresql');assert.equal(c.port,5432);
})

for(const options of [{database:'other'},{port:6432},{defaultReadOnly:'off'},{readOnly:'off'},{isolation:'read committed'}]) {
  test(`safety abort before application data: ${JSON.stringify(options)}`,async()=>{
    const client=mock(options);
    await assert.rejects(collect(configuration(env),()=>client));
    assert(!client.calls.some(q=>q===SCHEMA_SQL||Object.values(SQL).some(s=>q.startsWith(s))));
    assert(client.closed);
    if(client.calls.some(q=>q.startsWith('BEGIN')))assert(client.calls.includes('ROLLBACK'));
  });
}

test('successful stub proves read-only start, isolation, bounded queries, commit, idle and close',async()=>{
  const client=mock();let settings;
  const report=await collect(configuration(env),c=>{settings=c;return client;});
  assert.match(settings.options,/default_transaction_read_only=on/);
  assert.match(settings.options,/lock_timeout=3000/);assert.equal(settings.ssl,false);
  assert(client.calls.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  assert(client.calls.includes('COMMIT'));assert(client.closed);assert.equal(report.completion.connection_idle,true);
  assert.equal(exitCode(report),0);assert.deepEqual(Object.values(report.classes),Array(9).fill(0));
})

test('query failure rolls back, closes and never exposes driver message',async()=>{
  const client=mock({fail:true});
  await assert.rejects(collect(configuration(env),()=>client),e=>!e.message.includes('DO_NOT_DISCLOSE')&&e.exitCode===3);
  assert(client.calls.includes('ROLLBACK'));assert(client.closed);
})

test('generic A/B/C/I comparisons and exclusions, independent of sandbox IDs',()=>{
  const r=empty();
  for(const [id,value,target] of [['80001','0.005','0.01'],['80002','0.012','0'],['80003','5','-5.40'],['80004','1.20','1.20']]) {
    r.roots.push(root(id));r.leaves.push(split(id,value));r.posted.push(posted(id,target));
  }
  r.roots.push(root('80005'));r.leaves.push(split('80005','0.004'));r.posted.push(posted('80005','0','loan'));
  const d=classify(r);
  assert.equal(d.classes.A,2);assert.equal(d.classes.B,1);assert.equal(d.classes.C,1);assert.equal(d.classes.I,2);
  assert.equal(d.unclassified.length,1);assert.equal(d.counts.defensible_relational_comparisons,4);
  assert.equal(exitCode(d),1);
})

test('transfer exact zero sum remains distinct from rounded-total conservation',()=>{
  const r=empty();r.roots.push({...root('90000'),transaction_type:'2'});
  r.posted.push({id:'90000',type:2,account_transaction_id:null});
  r.leaves.push(split('90000','0.004'));
  const d=classify(r);assert.equal(d.counts.transfer_zero_sum_disagreements,1);
  assert.equal(d.counts.defensible_relational_comparisons,0);assert.equal(d.classes.B,0);
})

test('fixed percentages excluded; baseAmount and optional null history separately counted',()=>{
  const r=empty();
  r.leaves.push({...split('90001','33.33'),path:['0','fundingCategories','0','amount'],percentage:'true'});
  r.leaves.push(split('90001','0.004',['0','baseAmount']));
  r.leaves.push({...split('90001',null),source:'transaction_logs.changes',path:['principle','old'],value_type:'null'});
  const d=classify(r);assert.equal(d.classes.E,1);assert.equal(d.classes.F,0);
  assert.equal(d.counts['funding_baseAmount.subcent'],1);assert.equal(d.counts['history.optional_nulls'],1);
  assert.equal(d.counts['fixed_funding.observations'],0);
})

test('provider USD/null unofficial is valid; valuation precision stays G',()=>{
  const r=empty();const p={...split('90002','23631.9805'),source:'plaid_logs.response',path:['accounts','0','balances','current']};
  r.leaves.push(p,{...p,path:['accounts','0','balances','iso_currency_code'],value_type:'string',decimal_text:'USD'},
    {...p,path:['accounts','0','balances','unofficial_currency_code'],value_type:'null',decimal_text:null});
  const d=classify(r);assert.equal(d.classes.G,1);assert.equal(d.classes.H,0);
  assert.equal(d.counts['provider.currency_contexts'],1);
})

test('redaction and summary do not emit credential or malformed monetary content',()=>{
  const cleaned=sanitizeEvidence({password:'secret',access_token:'secret',description:'private',decimal_text:'sensitive nonnumeric',category_id:'private',iso_currency_code:'private long payload'});
  assert(!JSON.stringify(cleaned).includes('secret'));assert(!JSON.stringify(cleaned).includes('private'));
  assert.match(summary({status:'aborted',reason:'target mismatch'}),/ABORTED/);
})

test('fixed SQL uses SELECT only, no write statements or sandbox findings',async()=>{
  for(const sql of [VERIFY_SQL,MODE_SQL,SCHEMA_SQL,...Object.values(SQL)]) {
    assert.match(sql,/^(SELECT|WITH RECURSIVE|WITH)\b/);
    assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|VACUUM|ANALYZE|CALL|REFRESH)\b/i.test(sql));
    assert(!/\b(342|343|344|345|346|347|348|582|602)\b/.test(sql));
  }
  const source=await readFile(new URL('./auditLegacyMoney.mjs',import.meta.url),'utf8');
  assert(!source.includes("from '#"));assert(!source.includes("read('spendcraft-env'"));assert(!source.includes('Math.round('));
})


test('row ceiling aborts incomplete audit with rollback and close',async()=>{
  const client=mock({tooMany:true});
  await assert.rejects(collect({...configuration(env),maxRows:2},()=>client),e=>e.exitCode===3&&e.message.includes('ceiling'));
  assert(client.calls.includes('ROLLBACK'));assert(client.closed);
})

test('malformed/missing posted fields and informational/configuration fields remain distinct',()=>{
  const r=empty();r.roots.push(root('90003'));
  r.missing.push({id:'90003',budget_id:'9',type:0,split_ordinal:'1'});
  r.leaves.push({...split('90004','0.005'),source:'statements.data',path:['dividends']});
  r.leaves.push({...split('90005','0.001'),source:'taxes.data',path:['estimated','expectedAgi']});
  r.leaves.push({...split('90006','abc'),source:'transactions.taxes',path:['0','amount'],value_type:'string'});
  const d=classify(r);assert.equal(d.classes.D,1);assert.equal(d.classes.F,2);
  assert.equal(d.counts['transactions.taxes.unclassifiable'],1);
  assert(!JSON.stringify(d).includes('abc'));
})

test('ambiguous relational rows and absent account types are never manufactured comparisons',()=>{
  const r=empty();
  for(const id of ['90010','90011']) {r.roots.push(root(id));r.leaves.push(split(id,'1.00'));}
  r.posted.push(posted('90010','1.00'),posted('90010','1.00'),posted('90011','1.00',null));
  const d=classify(r);assert.equal(d.counts.defensible_relational_comparisons,0);assert.equal(d.unclassified.length,2);
})

test('numeric provider balances and unavailable balances have different denominators',()=>{
  const r=empty();const p={...split('90100','12.34'),source:'plaid_logs.response',path:['accounts','0','balances','current']};
  r.leaves.push(p,{...p,path:['accounts','0','balances','available'],value_type:'null',decimal_text:null},
    {...p,path:['accounts','0','balances','iso_currency_code'],value_type:'string',decimal_text:'USD'});
  const d=classify(r);assert.equal(d.counts['provider.balance_money_values'],2);
  assert.equal(d.counts['provider.balances.numeric_observations'],1);assert.equal(d.counts['provider.unavailable_monetary_values'],1);
})

test('overall deadline closes the stub and refuses a complete report',async()=>{
  const client=mock();const query=client.query;
  client.query=async sql=>{if(sql.startsWith(SQL.roots)){await delay(20);if(client.closed)throw new Error('closed');}return query(sql);};
  await assert.rejects(collect({...configuration(env),totalMs:2},()=>client),e=>e.exitCode===3);
  assert(client.closed);assert(!client.calls.includes('COMMIT'));
})


test('database-only configuration supports budget and rejects invalid names',()=>{
  const c=configuration({SPENDCRAFT_AUDIT_DATABASE:'budget'});
  assert.equal(c.database,'budget');assert.equal(c.expected,'budget');
  assert.throws(()=>configuration({SPENDCRAFT_AUDIT_DATABASE:'budget;DROP'}));
})


test('operator errors identify safe phase and errno without raw credentials or paths',()=>{
  const error=Object.assign(new Error('password=private /sensitive/path'),{code:'EACCES'});
  assert.equal(failureReason(error,'creating report directory'),'creating report directory failed (EACCES: permission denied); raw errors withheld.');
  assert.match(failureReason({code:'ERR_MODULE_NOT_FOUND'},'loading PostgreSQL driver'),/dependency missing/);
  assert(!failureReason({code:'secret',message:'private'},'configuration').includes('secret'));
})


test('connection failures expose only approved codes and close the stub',async()=>{
  for(const code of ['28000','28P01','3D000','ENOENT','ECONNREFUSED']) {
    const client=mock();client.connect=async()=>{throw Object.assign(new Error('private credentials'),{code});};
    await assert.rejects(collect(configuration(env),()=>client),e=>e.message.includes(code)&&!e.message.includes('private credentials'));
    assert(client.closed);
  }
})
