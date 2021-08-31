import { FieldProps, FormikErrors, FormikHelpers } from 'formik';
import React, { ReactElement, useContext } from 'react';
import { Error } from '../../common/ResponseTypes';
import AmountInput from '../AmountInput';
import FormModal from '../Modal/FormModal';
import FormTextField from '../Modal/FormTextField';
import useModal, { ModalProps, UseModalType } from '../Modal/useModal';
import Institution from '../state/Institution';
import MobxStore from '../state/mobxStore';
import { AccountInterface } from '../state/State';

type PropsType = {
  institution?: Institution,
  account?: AccountInterface | null,
  onHide?: () => void,
}

const OfflineAccountDialog = ({
  institution,
  account = null,
  show,
  setShow,
  onHide,
}: PropsType & ModalProps): ReactElement => {
  const { accounts } = useContext(MobxStore);

  type ValuesType = {
    institute: string,
    account: string,
    balance: string,
    startDate: string,
    type: string,
    subtype: string,
  };

  const handleValidate = (values: ValuesType) => {
    const errors: FormikErrors<ValuesType> = {};

    if (!values.institute) {
      errors.institute = 'Institution name is required';
    }

    if (!account) {
      if (!values.account) {
        errors.account = 'Account name is required';
      }

      if (!values.startDate) {
        errors.startDate = 'Start date is required';
      }
    }

    return errors;
  };

  const handleSubmit = async (values: ValuesType, bag: FormikHelpers<ValuesType>) => {
    const { setErrors } = bag;

    let errors: Error[] | null = null;

    if (institution) {
      if (account) {
        await account.updateOfflineAccount(values.account);
      }
      else {
        errors = await institution.addOfflineAccount(
          values.account, parseFloat(values.balance), values.startDate,
          values.type, values.subtype,
        );
      }
    }
    else {
      errors = await accounts.addOfflineAccount(
        values.institute, values.account, parseFloat(values.balance), values.startDate,
        values.type, values.subtype,
      );
    }

    if (errors) {
      setErrors({ [errors[0].field]: errors[0].message });
    }
    else {
      setShow(false);
    }
  };

  const handleDelete = () => {
    if (account) {
      account.delete();
    }
  }

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

  const subtypeList = ({ field, form }: FieldProps<string, ValuesType>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={field.onChange}
      onBlur={field.onBlur}
    >
      {
        (() => {
          const type = Object.keys(subtypes).find((t) => (t === form.values.type));

          if (type) {
            return Object.keys(subtypes[type][1]).map((k) => (
              <option key={k} value={k}>{subtypes[type][1][k]}</option>
            ));
          }

          return <option value="other">Other</option>;
        })()
      }
    </select>
  )

  const typelist = ({ field, form }: FieldProps<string, ValuesType>) => (
    <select
      name={field.name}
      value={field.value}
      className="form-control"
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = Object.keys(subtypes).find((t) => (t === e.target.value));

        if (type) {
          form.setFieldValue('subtype', Object.keys(subtypes[type][1])[0], false);
        }
        field.onChange(e);
      }}
      onBlur={field.onBlur}
    >
      {
        Object.keys(subtypes).map((t) => (
          <option key={t} value={t}>{subtypes[t][0]}</option>
        ))
      }
    </select>
  )

  return (
    <FormModal<ValuesType>
      initialValues={{
        institute: institution ? institution.name : '',
        account: account ? account.name : '',
        balance: account ? account.balance.toString() : '0',
        startDate: '',
        type: 'depository',
        subtype: 'checking',
      }}
      show={show}
      setShow={setShow}
      onHide={onHide}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Add Offline Account"
      formId="UnlinkedAccounts"
      size="sm"
      onDelete={account ? handleDelete : null}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <FormTextField name="institute" label="Institution Name:" readOnly={institution !== undefined} />
        <FormTextField name="account" label="Account Name:" />
        {
          !account
            ? (
              <>
                <FormTextField name="balance" label="Starting Balance:" as={AmountInput} />
                <FormTextField name="startDate" label="Start Date:" type="date" />
                <FormTextField name="type" label="Account Type:">
                  {typelist}
                </FormTextField>
                <FormTextField name="subtype" label="Account Subtype:">
                  {subtypeList}
                </FormTextField>
              </>
            )
            : null
        }
      </div>
    </FormModal>
  );
}

export const useOfflineAccountDialog = (): UseModalType<PropsType> => useModal<PropsType>(OfflineAccountDialog);

export default OfflineAccountDialog;
