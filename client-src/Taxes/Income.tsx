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
      taxes.income.taxableInterest = parseFloat(event.target.value);
    })
  }

  const handleTaxableIraDistributions: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.taxableIraDistributions = parseFloat(event.target.value);
    })
  }

  const handleTaxablePensionsAndAnnuities: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.taxablePensionAndAnnuities = parseFloat(event.target.value);
    })
  }

  const handleTaxableSocialSecurityBenefits: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.taxableSocialSecurityBenefits = parseFloat(event.target.value);
    })
  }

  const handleOrdinaryDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.ordinaryDividends = parseFloat(event.target.value);
    })
  }

  const handleQualifiedDividends: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.qualifiedDividends = parseFloat(event.target.value);
    })
  }

  const handleAdditionalIncome: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.income.additionalTaxableIncome = parseFloat(event.target.value);
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
      <AmountInput value={taxes.income.taxableInterest} onChange={handleTaxableInterest} />
      <Amount amount={taxes.income.actualTaxableInterest} />

      <label>
        Qualified Dividends:
      </label>
      <AmountInput value={taxes.income.qualifiedDividends} onChange={handleQualifiedDividends} />
      <div />

      <label>
        Ordinary Dividends:
      </label>
      <AmountInput value={taxes.income.ordinaryDividends} onChange={handleOrdinaryDividends} />
      <Amount amount={taxes.income.actualOridinaryDividends} />

      <div />
      <div />
      <div />

      <label>
        Taxable IRA Distributions:
      </label>
      <AmountInput value={taxes.income.taxableIraDistributions} onChange={handleTaxableIraDistributions} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Taxable Pensions and Annuities:
      </label>
      <AmountInput value={taxes.income.taxablePensionAndAnnuities} onChange={handleTaxablePensionsAndAnnuities} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Taxable Social Security Benefits:
      </label>
      <AmountInput value={taxes.income.taxableSocialSecurityBenefits} onChange={handleTaxableSocialSecurityBenefits} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Additional Income:
      </label>
      <AmountInput value={taxes.income.additionalTaxableIncome} onChange={handleAdditionalIncome} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Capital Gains:
      </label>
      <Amount amount={taxes.income.capitalGains} />
      <div />

      <div />
      <div />
      <div />

      <label>
        Total Income:
      </label>
      <Amount amount={taxes.income.totalIncome} />
      <div />
    </div>    
  )
})

export default Income;
