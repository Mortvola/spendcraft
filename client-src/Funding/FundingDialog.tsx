import React from 'react';
import {
  Field, FieldProps,
  FormikErrors, FormikContextType,
} from 'formik';
import { makeUseModal, ModalProps } from '@mortvola/usemodal';
import { FormModal, FormError, setFormErrors } from '@mortvola/forms';
import { DateTime } from 'luxon';
import Http from '@mortvola/http';
import Amount from '../Amount';
import { useStores } from '../State/Store';
import Transaction from '../State/Transaction';
import {
  TransactionType, CategoryFundingProps,
  ApiResponse,
  ProposedFundingCategoryProps,
} from '../../common/ResponseTypes';
import Funding from './Funding';
import {
  CategoriesValueType,
  FundingType, ValueType,
} from './Types'
import styles from './Funding.module.scss'
import { isGroup } from '../State/Group';
import { isCategory } from '../State/Category';

type PropsType = {
  transaction?: Transaction;
}

const FundingDialog: React.FC<PropsType & ModalProps> = ({
  transaction,
  setShow,
}) => {
  const { categoryTree, register } = useStores();
  const { fundingPoolCat } = categoryTree;

  if (!fundingPoolCat) {
    throw new Error('funding pool is unassigned');
  }

  const [diffOnly, setDiffOnly] = React.useState<boolean>(false);

  const getCategoriesSum = (categories: CategoriesValueType) => {
    const v = Object.keys(categories).reduce((sum, k) => {
      const value = categories[k].amount;
      const newValue = typeof value === 'string' ? parseFloat(value ?? 0) : value;
      return sum + newValue;
    }, 0)

    return v;
  }

  const handleSubmit = async (values: ValueType) => {
    type Request = {
      date: string,
      categories: CategoryFundingProps[],
    }

    const categories = Object.keys(values.categories).map((k) => {
      const value = values.categories[k].amount;
      const amount = typeof value === 'string' ? parseFloat(value) : value;
      const categoryId = parseInt(k, 10);
      return {
        categoryId,
        amount,
        fundingCategories: values.categories[k].fundingCategories,
      }
    })
      .filter((c) => c.amount !== 0);

    const request: Request = {
      date: values.date,
      categories,
    };

    const funders: Map<number, number> = new Map();

    // eslint-disable-next-line no-restricted-syntax
    for (const category of categories) {
      // eslint-disable-next-line no-restricted-syntax
      for (const fundingCategory of category.fundingCategories) {
        const funding = funders.get(fundingCategory.categoryId) ?? 0;
        funders.set(fundingCategory.categoryId, funding + (fundingCategory.amount / 100.0) * category.amount)
      }
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const [categoryId, amount] of funders) {
      request.categories.push({
        categoryId,
        amount: -amount,
        funder: true,
        fundingCategories: [],
      });
    }

    let errors: Error[] | null;
    if (transaction) {
      errors = await transaction.updateCategoryTransfer(request);
    }
    else {
      errors = await register.addCategoryTransfer(request, TransactionType.FUNDING_TRANSACTION);
    }

    if (!errors) {
      setShow(false);
    }
  };

  const handleValidate = (values: ValueType) => {
    const errors: FormikErrors<ValueType> = {};

    if (values.date === '') {
      errors.date = 'A date must be specified.';
    }

    // Verify that there is at least one non-zero funding item.
    let count = 0;

    Object.keys(values.categories).forEach((k) => {
      const value = values.categories[k];
      const newValue = typeof value === 'string' ? parseFloat(value) : value;

      if (newValue !== 0) {
        count += 1;
      }
    });

    if (count === 0) { //  && errors.funding) {
      console.log('At least one non-zero funding item must be entered.');
    }

    return errors;
  };

  const handleDelete = async (context: FormikContextType<ValueType>) => {
    const { setTouched, setErrors } = context;

    if (transaction) {
      const errors = await transaction.delete();

      if (errors) {
        setTouched({ [errors[0].field]: true }, false);
        setFormErrors(setErrors, errors);
      }
      else {
        setShow(false)
      }
    }
  }

  const initialFundingDate = () => (
    (transaction
      ? transaction.date
      : DateTime.now().startOf('month')
    ).toISODate()
  );

  const initialFunding = (): CategoriesValueType | undefined => {
    if (transaction) {
      const obj: CategoriesValueType = {}

      transaction.categories.forEach((c) => {
        if (!c.funder) {
          obj[c.categoryId] = {
            amount: c.amount,
            fundingCategories: c.fundingCategories ?? [{
              categoryId: categoryTree.fundingPoolCat!.id,
              amount: 100,
              percentage: true,
            }],
          }
        }
      })

      categoryTree.nodes.forEach((node) => {
        if (isGroup(node)) {
          if (node.id !== categoryTree.systemIds.systemGroupId) {
            node.categories.forEach((cat) => {
              if (obj[cat.id] === undefined) {
                obj[cat.id] = {
                  amount: 0,
                  fundingCategories: [{
                    categoryId: categoryTree.fundingPoolCat!.id,
                    amount: 100,
                    percentage: true,
                  }],
                }
              }
            })
          }
        }
        else if (isCategory(node)) {
          if (obj[node.id] === undefined) {
            obj[node.id] = {
              amount: 0,
              fundingCategories: [{
                categoryId: categoryTree.fundingPoolCat!.id,
                amount: 100,
                percentage: true,
              }],
            }
          }
        }

        return null;
      })

      return obj;
    }

    return undefined;
  }

  const [categories, setCategories] = React.useState<CategoriesValueType | undefined>(initialFunding())

  const handleCheckChange = () => {
    setDiffOnly((prev) => (!prev));
  }

  React.useEffect(() => {
    (async () => {
      if (!transaction) {
        const response = await Http.get<ApiResponse<ProposedFundingCategoryProps[]>>(
          '/api/v1/funding-plans/proposed',
        );

        if (response.ok) {
          const { data } = (await response.body());

          if (data) {
            const obj: CategoriesValueType = {};

            data.forEach((cat) => {
              obj[cat.categoryId] = {
                amount: cat.amount,
                fundingCategories: [],
              }

              if (cat.fundingCategories.length === 0) {
                obj[cat.categoryId].fundingCategories.push({
                  categoryId: categoryTree.fundingPoolCat!.id,
                  amount: 100.0,
                  percentage: true,
                });
              }
              else {
                // eslint-disable-next-line no-restricted-syntax
                for (let i = 0; i < cat.fundingCategories.length; i += 1) {
                  obj[cat.categoryId].fundingCategories.push({
                    categoryId: cat.fundingCategories[i].categoryId,
                    amount: cat.fundingCategories[i].amount,
                    percentage: cat.fundingCategories[i].percentage,
                  });
                }
              }
            })

            setCategories(obj)
          }
        }
      }
    })();
  }, [categoryTree.fundingPoolCat, transaction]);

  if (!categories) {
    return null;
  }

  return (
    <FormModal<ValueType>
      setShow={setShow}
      initialValues={{
        date: initialFundingDate() ?? '',
        categories,
      }}
      validate={handleValidate}
      onSubmit={handleSubmit}
      title="Fund Categories"
      formId="fundingDialogForm"
      onDelete={transaction ? handleDelete : null}
    >
      <div className="fund-container">
        <div className="funding-header">
          <label>
            Date:
            <Field name="date" type="date" className="form-control" />
          </label>
          <label>
            Available Funds:
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    className="form-control"
                    amount={fundingPoolCat.balance - getCategoriesSum(values.categories)}
                  />
                )
              }
            </Field>
          </label>
        </div>
        <FormError name="date" />
        <label>
          <input type="checkbox" checked={diffOnly} onChange={handleCheckChange} className={styles.checkbox} />
          Show only differences in funding
        </label>
        <div className="cat-fund-table">
          <Field>
            {({
              form: {
                values,
              },
            }: FieldProps<FundingType[]>) => (
              <Funding
                date={DateTime.fromISO(values.date).startOf('month').toISODate() ?? ''}
                diffOnly={diffOnly}
              />
            )}
          </Field>
          <FormError name="funding" />
        </div>
        <div className={`${styles.fundListItem} ${styles.catFundTitle}`}>
          <div className={styles.fundListCatName} />
          <div className={styles.labeledAmount}>
            Total
            <Field>
              {
                ({ form: { values } }: FieldProps<FundingType[]>) => (
                  <Amount
                    style={{ minWidth: '6rem' }}
                    amount={getCategoriesSum(values.categories)}
                  />
                )
              }
            </Field>
          </div>
          <div className={`dollar-amount ${styles.fundListAmt}`} />
        </div>
      </div>
    </FormModal>
  );
};

export const useFundingDialog = makeUseModal<PropsType>(FundingDialog);

export default FundingDialog;
