import { runInAction } from 'mobx';
import React from 'react';
import { useStores } from '../State/Store';
import { FilingStatus } from '../State/Taxes';
import { observer } from 'mobx-react-lite';
import style from './TaxDetails.module.scss'
import Amount from '../Amount';
import AmountInput from '../AmountInput';
import TaxComputation from './TaxComputation';

const TaxDetails: React.FC = observer(() => {
  const { taxes } = useStores()

  const handleFileStatusChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
    runInAction(() => {
      taxes.filingStatus = (parseInt(event.target.value, 10) as unknown) as FilingStatus
    })
  }

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

  const handleQualifiedBusinessIncomeDeduction: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    runInAction(() => {
      taxes.qualifiedBusinessIncomeDeduction = parseFloat(event.target.value);
    })
  }

  return (
    <>
      <div className={style.form}>
        <label>
          Filing Status: 
          <select value={taxes.filingStatus} onChange={handleFileStatusChange}>
            <option value={FilingStatus.Single}>Single</option>
            <option value={FilingStatus.MarriedFilingSeparate}>Married Filing Separate</option>
            <option value={FilingStatus.MarriedFilingJointly}>Married Filing Jointly</option>
            <option value={FilingStatus.HeadOfHousehold}>Head of Household</option>
          </select>
        </label>

        <label>
          Taxable Interest:
          <AmountInput value={taxes.taxableInterest} onChange={handleTaxableInterest} />
        </label>

        <label>
          Qualified Dividends:
          <AmountInput value={taxes.qualifiedDividends} onChange={handleQualifiedDividends} />
        </label>

        <label>
          Ordinary Dividends:
          <AmountInput value={taxes.ordinaryDividends} onChange={handleOrdinaryDividends} />
        </label>

        <label>
          Taxable IRA Distributions:
          <AmountInput value={taxes.taxableIraDistributions} onChange={handleTaxableIraDistributions} />
        </label>

        <label>
          Taxable Pensions and Annuities:
          <AmountInput value={taxes.taxablePensionAndAnnuities} onChange={handleTaxablePensionsAndAnnuities} />
        </label>

        <label>
          Taxable Social Security Benefits:
          <AmountInput value={taxes.taxableSocialSecurityBenefits} onChange={handleTaxableSocialSecurityBenefits} />
        </label>

        <label>
          Additional Income:
          <AmountInput value={taxes.additionalTaxableIncome} onChange={handleAdditionalIncome} />
        </label>

        <label>
          Capital Gains:
          <AmountInput value={taxes.capitalGains} onChange={handleCapitalGains} />
        </label>

        <label>
          Longterm Capital Gains:
          <AmountInput value={taxes.longTermCapitalGains} onChange={handleLongtermCapitalGains} />
        </label>

        <label>
          Total Income:
          <Amount amount={taxes.totalIncome} />
        </label>

        <label>
          Standard Deduction:
          <Amount amount={taxes.standardDeduction} />
        </label>

        <label>
          Qualified Business Income Deduction:
          <AmountInput value={taxes.qualifiedBusinessIncomeDeduction} onChange={handleQualifiedBusinessIncomeDeduction} />
        </label>

        <label>
          Taxable Income:
          <Amount amount={taxes.taxableIncome} />
        </label>
      </div>

      <TaxComputation taxes={taxes} />
    </>
  )
})

export default TaxDetails;
