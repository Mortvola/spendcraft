import type { MoneyCents } from '../../common/moneyCents';
import React from 'react';
import { observer } from 'mobx-react-lite';
import MoneyCentsAmount from '../MoneyCentsAmount';
import TaxAmountInput from './TaxAmountInput';
import Taxes from '../State/Taxes/Taxes';
import { runInAction } from 'mobx';
import style from './TaxDetails.module.scss';
import { getCurrentPeriod } from '../State/Taxes/Estimated';

interface PropsType {
  taxes: Taxes
}

const TaxAndCredits: React.FC<PropsType> = observer(({
  taxes
}) => {
  const handleQualifiedBusinessIncomeDeduction: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.qualifiedBusinessIncomeDeductionCents = value;
    })
  }

  return (
    <div className={`${style.taxAndCredits} ${style.block}`}>
      <label>
        Total Income:
      </label>
      <MoneyCentsAmount amount={taxes.income.getAdjustedGrossIncomeCents(getCurrentPeriod())} />
      <div />

      <label>
        Standard Deduction:
      </label>
      <MoneyCentsAmount amount={taxes.standardDeductionCents} />
      <div />

      <label>
        Qualified Business Income Deduction:
      </label>
      <TaxAmountInput value={taxes.qualifiedBusinessIncomeDeductionCents} onChange={
        handleQualifiedBusinessIncomeDeduction} />
      <div />

      <label>
        Taxable Income:
      </label>
      <MoneyCentsAmount amount={taxes.getTaxableIncomeCents(getCurrentPeriod())} />
      <div />
    </div>
  )
})

export default TaxAndCredits;