import React from 'react'
import Amount from '../Amount';
import AmountInput from '../AmountInput';
import { observer } from 'mobx-react-lite'
import style from './TaxDetails.module.scss'
import Taxes from '../State/Taxes';
import { runInAction } from 'mobx';

interface PropsType {
  taxes: Taxes
}

const Income: React.FC<PropsType> = observer(({
  taxes
}) => {
  const handleTaxableInterest: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.taxableInterest = parseFloat(event.target.value);
    })
  }

  const handleTaxableIraDistributions: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.taxableIraDistributions = parseFloat(event.target.value);
    })
  }

  const handleTaxablePensionsAndAnnuities: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.taxablePensionAndAnnuities = parseFloat(event.target.value);
    })
  }

  const handleTaxableSocialSecurityBenefits: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.taxableSocialSecurityBenefits = parseFloat(event.target.value);
    })
  }

  const handleOrdinaryDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.ordinaryDividends = parseFloat(event.target.value);
    })
  }

  const handleQualifiedDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.qualifiedDividends = parseFloat(event.target.value);
    })
  }

  const handleCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.capitalGains = parseFloat(event.target.value);
    })
  }

  const handleAdditionalIncome: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.additionalTaxableIncome = parseFloat(event.target.value);
    })
  }

  const handleLongtermCapitalGains: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.longTermCapitalGains = parseFloat(event.target.value);
    })
  }

  return (
    <div className={`${style.income} ${style.block}`}>
      <label>
        Taxable Interest:
      </label>
      <AmountInput value={taxes.taxableInterest} onChange={handleTaxableInterest} />

      <label>
        Qualified Dividends:
      </label>
      <AmountInput value={taxes.qualifiedDividends} onChange={handleQualifiedDividends} />

      <label>
        Ordinary Dividends:
      </label>
      <AmountInput value={taxes.ordinaryDividends} onChange={handleOrdinaryDividends} />

      <label>
        Taxable IRA Distributions:
      </label>
      <AmountInput value={taxes.taxableIraDistributions} onChange={handleTaxableIraDistributions} />

      <label>
        Taxable Pensions and Annuities:
      </label>
      <AmountInput value={taxes.taxablePensionAndAnnuities} onChange={handleTaxablePensionsAndAnnuities} />

      <label>
        Taxable Social Security Benefits:
      </label>
      <AmountInput value={taxes.taxableSocialSecurityBenefits} onChange={handleTaxableSocialSecurityBenefits} />

      <label>
        Additional Income:
      </label>
      <AmountInput value={taxes.additionalTaxableIncome} onChange={handleAdditionalIncome} />

      <label>
        Capital Gains:
      </label>
      <AmountInput value={taxes.capitalGains} onChange={handleCapitalGains} />

      <label>
        Longterm Capital Gains:
      </label>
      <AmountInput value={taxes.longTermCapitalGains} onChange={handleLongtermCapitalGains} />

      <label>
        Total Income:
      </label>
      <Amount amount={taxes.totalIncome} />
    </div>    
  )
})

export default Income;
