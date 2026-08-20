import React from 'react'
import Amount from '../Amount';
import AmountInput from '../AmountInput';
import { observer } from 'mobx-react-lite'
import style from './TaxDetails.module.scss'
import Taxes from '../State/Taxes/Taxes';
import { runInAction } from 'mobx';

interface PropsType {
  taxes: Taxes
}

const Income: React.FC<PropsType> = observer(({
  taxes
}) => {
  const handleTaxableInterest: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].taxableInterest = parseFloat(event.target.value);
    })
  }

  const handleTaxableIraDistributions: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].taxableIraDistributions = parseFloat(event.target.value);
    })
  }

  const handleTaxablePensionsAndAnnuities: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].taxablePensionAndAnnuities = parseFloat(event.target.value);
    })
  }

  const handleTaxableSocialSecurityBenefits: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].taxableSocialSecurityBenefits = parseFloat(event.target.value);
    })
  }

  const handleOrdinaryDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].ordinaryDividends = parseFloat(event.target.value);
    })
  }

  const handleQualifiedDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].qualifiedDividends = parseFloat(event.target.value);
    })
  }

  const handleAdditionalIncome: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income[taxes.currentPeriod].additionalTaxableIncome = parseFloat(event.target.value);
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
      <AmountInput value={taxes.income[taxes.currentPeriod].taxableInterest} onChange={handleTaxableInterest} />
      <Amount amount={taxes.income[taxes.currentPeriod].actualTaxableInterest} />

      <label>
        Qualified Dividends:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].qualifiedDividends} onChange={handleQualifiedDividends} />
      <div />

      <label>
        Ordinary Dividends:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].ordinaryDividends} onChange={handleOrdinaryDividends} />
      <Amount amount={taxes.income[taxes.currentPeriod].actualOridinaryDividends} />

      <div />
      <div />
      <div />

      <label>
        Taxable IRA Distributions:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].taxableIraDistributions} onChange={handleTaxableIraDistributions} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Taxable Pensions and Annuities:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].taxablePensionAndAnnuities} onChange={handleTaxablePensionsAndAnnuities} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Taxable Social Security Benefits:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].taxableSocialSecurityBenefits} onChange={handleTaxableSocialSecurityBenefits} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Additional Income:
      </label>
      <AmountInput value={taxes.income[taxes.currentPeriod].additionalTaxableIncome} onChange={handleAdditionalIncome} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Capital Gains:
      </label>
      <Amount amount={taxes.income[taxes.currentPeriod].capitalGains} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Total Income:
      </label>
      <Amount amount={taxes.income[taxes.currentPeriod].totalIncome} />
      <div />
    </div>    
  )
})

export default Income;
