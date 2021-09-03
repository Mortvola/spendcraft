const subtypes: Record<string, [string, Record<string, string>]> = {
  depository: ['Depository', {
    checking: 'Checking',
    savings: 'Savings',
    hsa: 'HSA',
    cd: 'CD',
    'money market': 'Money Market',
    paypal: 'Paypal',
    prepaid: 'Prepaid',
    'cash management': 'Cash Management',
    ebt: 'EBT',
  }],
  credit: ['Credit', {
    'credit card': 'Credit Card',
    paypal: 'Paypayl',
  }],
  loan: ['Loan', {
    auto: 'Auto',
    business: 'Business',
    commercial: 'Commercial',
    construction: 'Construction',
    consumer: 'Consumer',
    'home equity': 'Home Equity',
    loan: 'General Loan',
    mortgage: 'Mortgage',
    overdraft: 'Overdraft',
    'line of credit': 'Line of Credit',
    student: 'Student',
    other: 'Other',
  }],
  investment: ['Investment', {
    529: '529',
    '401a': '401A',
    '401k': '401K',
    '403b': '403B',
    '457b': '457B',
    brokerage: 'Brokerage',
    'cash isa': 'Cash ISA',
    'education savings account': 'Education Savings Account',
    'fixed annuity': 'Fixed Annuity',
    gic: 'Guaranteed Investment Certificate',
    'health reimbursement arrangement': 'Health Reimbursement Arrangement',
    hsa: 'Health Savings Account',
    ira: 'IRA',
    isa: 'ISA',
    keogh: 'Keogh',
    lif: 'LIF',
    'life insurance': 'Life Insurance',
    lira: 'LIRA',
    lrif: 'LRIF',
    lrsp: 'LRSP',
    'mutual fund': 'Mutual Fund',
    'non-taxable brokerage account': 'Non-taxable Brokerage Account',
    other: 'Other',
    'other annuity': 'Other Annuity',
    'other insurance': 'Other Insurance',
    pension: 'Pension',
    prif: 'PRIF',
    'profit sharing plan': 'Profit Sharing Plan',
    qshr: 'QSHR',
    rdsp: 'RDSP',
    resp: 'RESP',
    retirement: 'Other Retirement',
    rlif: 'RLIF',
    Roth: 'Roth',
    'Roth 401k': 'Roth 401K',
    rrif: 'RRIF',
    rrsp: 'RRSP',
    sarsep: 'SARSEP',
    'sep ira': 'SEP IRA',
    'simple ira': 'Simple IRA',
    ssip: 'SSIP',
    'stock plan': 'Stock Plan',
    tfsa: 'TFSA',
    trust: 'Trust',
    ugma: 'UGMA',
    utma: 'UTMA',
    'variable annuity': 'Variable Annuity',
  }],
}

type SubType = {
  key: string,
  name: string,
}

export const getSubtypes = (acctType: string): SubType[] => {
  const type = Object.keys(subtypes).find((t) => (t === acctType));

  if (type) {
    return Object.keys(subtypes[type][1]).map((k) => ({
      key: k,
      name: subtypes[acctType][1][k],
    }));
  }

  return [];
}

type Type = {
  key: string,
  name: string,
}

export const getTypes = (): Type[] => (
  Object.keys(subtypes).map((t) => ({
    key: t,
    name: subtypes[t][0],
  }))
)

export const getTypeName = (acctType: string): string => {
  const at = getTypes().find((a) => a.key === acctType)

  if (at) {
    return at.name;
  }

  return 'Other';
}

export const getSubTypeName = (acctType: string, acctSubType: string): string => {
  const st = getSubtypes(acctType).find((s) => s.key === acctSubType);

  if (st) {
    return st.name;
  }

  return 'Other';
}
