import type { MoneyCents } from '../../common/moneyCents';
import React from 'react'
import MoneyCentsAmount from '../MoneyCentsAmount';
import TaxAmountInput from './TaxAmountInput';
import { observer } from 'mobx-react-lite'
import style from './TaxDetails.module.scss'
import Taxes from '../State/Taxes/Taxes';
import { runInAction } from 'mobx';
import { getCurrentPeriod } from '../State/Taxes/Estimated';

interface PropsType {
  taxes: Taxes
}

const Income: React.FC<PropsType> = observer(({
  taxes
}) => {
  const handleTaxableInterest: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.taxableInterestCents = value;
    })
  }

  const handleTaxableIraDistributions: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.taxableIraDistributionsCents = value;
    })
  }

  const handleTaxablePensionsAndAnnuities: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.taxablePensionAndAnnuitiesCents = value;
    })
  }

  const handleTaxableSocialSecurityBenefits: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.taxableSocialSecurityBenefitsCents = value;
    })
  }

  const handleOrdinaryDividends: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.ordinaryDividendsCents = value;
    })
  }

  const handleQualifiedDividends: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.qualifiedDividendsCents = value;
    })
  }

  const handleAdditionalIncome: (value: MoneyCents) => void = (value) => {
    runInAction(() => {
      taxes.income.additionalTaxableIncomeCents = value;
    })
  }

  return (
    <div className={`${style.income} ${style.block}`}>
      <div />
      <div />
      <div />

      <label>
        Taxable Interest:
      </label>
      <MoneyCentsAmount amount={taxes.income.actuals[getCurrentPeriod()].taxableInterestCents} />
      <TaxAmountInput value={taxes.income.taxableInterestCents} onChange={handleTaxableInterest} />

      <label>
        Qualified Dividends:
      </label>
      <TaxAmountInput value={taxes.income.qualifiedDividendsCents} onChange={
        handleQualifiedDividends} />
      <div />

      <label>
        Ordinary Dividends:
      </label>
      <MoneyCentsAmount amount={taxes.income.actuals[getCurrentPeriod()].oridinaryDividendsCents} />
      <TaxAmountInput value={taxes.income.ordinaryDividendsCents} onChange={
        handleOrdinaryDividends} />

      <div />
      <div />
      <div />

      <label>
        Taxable IRA Distributions:
      </label>
      <div />
      <TaxAmountInput value={taxes.income.taxableIraDistributionsCents} onChange={
        handleTaxableIraDistributions} />

      <div />
      <div />
      <div />

      <label>
        Taxable Pensions and Annuities:
      </label>
      <div />
      <TaxAmountInput value={taxes.income.taxablePensionAndAnnuitiesCents} onChange={
        handleTaxablePensionsAndAnnuities} />

      <div />
      <div />
      <div />

      <label>
        Taxable Social Security Benefits:
      </label>
      <MoneyCentsAmount amount={taxes.income.actuals[getCurrentPeriod()]
        .taxableSocialSecurityBenefitsCents} />
      <TaxAmountInput value={taxes.income.taxableSocialSecurityBenefitsCents} onChange={
        handleTaxableSocialSecurityBenefits} />

      <div />
      <div />
      <div />

      <label>
        Additional Income:
      </label>
      <div />
      <TaxAmountInput value={taxes.income.additionalTaxableIncomeCents} onChange={
        handleAdditionalIncome} />

      <div />
      <div />
      <div />

      <label>
        Capital Gains:
      </label>
      <MoneyCentsAmount amount={taxes.income.getCapitalGainsCents(getCurrentPeriod())} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Total Income:
      </label>
      <MoneyCentsAmount amount={taxes.income.getTotalIncomeCents(getCurrentPeriod())} />
      <div />
    </div>    
  )
})

export default Income;
