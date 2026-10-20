import { auditTransaction, roundAmount, checkedAdd } from '../scripts/auditTransactionCategoryCents.mjs'

export function exactStoredCents(value) {
  if (typeof value === 'number') return roundAmount(value).cents
  if (typeof value !== 'string' || value.length > 24 || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) || value === '-0.00') throw Error('invalid_stored_decimal')
  const [whole,fraction]=value.replace(/^-/, '').split('.')
  const cents=(BigInt(whole)*100n+BigInt(fraction))*(value.startsWith('-')?-1n:1n)
  if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents< -BigInt(Number.MAX_SAFE_INTEGER))throw Error('unsafe_stored_cents')
  return Number(cents)
}

export function inspectStored(row) {
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
